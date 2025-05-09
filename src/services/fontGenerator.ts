import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import sharp from 'sharp';
import { 
  ensureDirectoryExists, 
  getFontStoragePath, 
  saveImageFromDataURL,
  createTempDirectory
} from '@/utils/helpers';
import { SourceImage, CharacterMapping, FontMetadata } from '@/context/FontContext';
import prisma from '@/lib/prisma';
import * as s3 from '@/lib/s3';
import { supabase } from '@/lib/supabase';

export interface FontGenerationRequest {
  characterMappings: CharacterMapping[];
  sourceImages: SourceImage[];
  metadata: FontMetadata;
  format: string;
  fontId: string;
  userId?: string;
}

interface FontGenerationResult {
  success: boolean;
  fontUrl?: string;
  error?: string;
}

interface FontRetrievalResult {
  success: boolean;
  error?: string;
  filePath?: string;
  fontName?: string;
  url?: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Generates a font based on character mappings and source images
 */
export async function generateFont(request: FontGenerationRequest): Promise<FontGenerationResult> {
  const { characterMappings, sourceImages, metadata, format, fontId, userId } = request;
  
  try {
    // 1. Create a temporary directory for processing
    const tempDir = createTempDirectory();
    const fontProjectPath = path.join(tempDir, fontId);
    ensureDirectoryExists(fontProjectPath);
    
    // 2. Create subdirectories
    const imagesPath = path.join(fontProjectPath, 'images');
    const charsPath = path.join(fontProjectPath, 'chars');
    const outputPath = path.join(fontProjectPath, 'output');
    ensureDirectoryExists(imagesPath);
    ensureDirectoryExists(charsPath);
    ensureDirectoryExists(outputPath);
    
    // 3. Save metadata
    const metadataPath = path.join(fontProjectPath, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify({
      ...metadata,
      createdAt: new Date().toISOString(),
      characterCount: characterMappings.length,
      format,
    }, null, 2));
    
    // 4. Save source images
    const sourceImageMap = new Map<string, string>();
    for (const image of sourceImages) {
      const imageFileName = `image_${image.id}.png`;
      const imagePath = path.join(imagesPath, imageFileName);
      await saveImageFromDataURL(image.url, imagePath);
      sourceImageMap.set(image.id, imagePath);
      
      // Upload to Supabase Storage
      if (userId) {
        const { data, error } = await supabase.storage
          .from('source-images')
          .upload(`${fontId}/${imageFileName}`, image.url);
          
        if (error) {
          console.error('Error uploading source image:', error);
        }
      }
    }
    
    // 5. Extract and process character images
    const characterData = [];
    const dbCharMappings = [];
    
    for (const mapping of characterMappings) {
      const sourceImagePath = sourceImageMap.get(mapping.sourceImageId);
      if (!sourceImagePath) {
        console.warn(`Source image not found for mapping: ${mapping.id}`);
        continue;
      }
      
      const charFileName = `char_${mapping.char.charCodeAt(0)}.png`;
      const charPath = path.join(charsPath, charFileName);
      
      // Extract and process the character
      const result = await extractCharacter(
        sourceImagePath,
        charPath,
        mapping.x1,
        mapping.y1,
        mapping.x2,
        mapping.y2
      );
      
      if (!result.success) {
        console.warn(`Failed to extract character ${mapping.char}: ${result.error}`);
        continue;
      }
      
      // Upload character image to Supabase
      if (userId) {
        const charBuffer = fs.readFileSync(charPath);
        const { data, error } = await supabase.storage
          .from('character-images')
          .upload(`${fontId}/${charFileName}`, charBuffer);
          
        if (error) {
          console.error('Error uploading character image:', error);
        }
      }
      
      characterData.push({
        char: mapping.char,
        unicode: mapping.char.charCodeAt(0),
        path: charPath,
      });
      
      dbCharMappings.push({
        char: mapping.char,
        x1: mapping.x1,
        y1: mapping.y1,
        x2: mapping.x2,
        y2: mapping.y2,
        originalImageWidth: mapping.originalImageWidth,
        originalImageHeight: mapping.originalImageHeight,
        sourceImageId: mapping.sourceImageId,
      });
    }
    
    // 6. Save character mapping data
    const charMapPath = path.join(fontProjectPath, 'charmap.json');
    fs.writeFileSync(charMapPath, JSON.stringify(characterData, null, 2));
    
    // 7. Call the backend API for font generation
    const response = await fetch(`${BACKEND_URL}/api/generate-font`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        charMapPath,
        fontName: metadata.name,
        format,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate font');
    }

    const data = await response.json();
    
    // 8. Upload the generated font to Supabase Storage
    const fontFilePath = path.join(outputPath, `${metadata.name.replace(/\s+/g, '_').toLowerCase()}.${format}`);
    const fontBuffer = fs.readFileSync(fontFilePath);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('fonts')
      .upload(`${fontId}/${metadata.name.replace(/\s+/g, '_').toLowerCase()}.${format}`, fontBuffer);
      
    if (uploadError) {
      throw uploadError;
    }
    
    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('fonts')
      .getPublicUrl(uploadData.path);

    // 9. Store in database if userId is provided
    if (userId) {
      try {
        await prisma.font.create({
          data: {
            id: fontId,
            name: metadata.name,
            description: metadata.description || '',
            author: metadata.author || '',
            isPublic: metadata.isPublic,
            userId,
            
            sourceImages: {
              create: sourceImages.map(img => ({
                url: img.url,
                isAiGenerated: img.isAiGenerated,
                aiPrompt: img.aiPrompt,
                width: img.width,
                height: img.height,
              }))
            },
            
            fontFiles: {
              create: {
                format,
                url: publicUrl,
                storageKey: uploadData.path,
                fileSize: fontBuffer.length,
              }
            },
            
            tags: metadata.tags?.length ? {
              create: metadata.tags.map(tag => ({
                name: tag,
              }))
            } : undefined,
          }
        });
      } catch (dbError) {
        console.error('Error storing font in database:', dbError);
      }
    }
    
    // 10. Clean up temporary files
    if (process.env.VERCEL) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    return {
      success: true,
      fontUrl: publicUrl,
    };
    
  } catch (error) {
    console.error('Error generating font:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate font',
    };
  }
}

/**
 * Extracts a character from a source image using Sharp
 */
async function extractCharacter(
  sourcePath: string,
  outputPath: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Calculate width and height
    const width = x2 - x1;
    const height = y2 - y1;
    
    if (width <= 0 || height <= 0) {
      return { 
        success: false, 
        error: `Invalid dimensions: width=${width}, height=${height}` 
      };
    }
    
    // Read the source image
    await sharp(sourcePath)
      // Extract the region
      .extract({ 
        left: Math.round(x1), 
        top: Math.round(y1), 
        width: Math.round(width), 
        height: Math.round(height) 
      })
      // Process the image for better font rendering
      .threshold(150) // Convert to black and white with threshold
      .png() // Output as PNG
      .toFile(outputPath);
    
    return { success: true };
  } catch (error) {
    console.error('Error extracting character:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Character extraction failed' 
    };
  }
}

/**
 * Retrieves a generated font
 */
export async function retrieveFont(fontId: string, format: string): Promise<FontRetrievalResult> {
  try {
    // First check if the font exists in the database
    const dbFont = await prisma.font.findUnique({
      where: { id: fontId },
      include: {
        fontFiles: {
          where: { format },
        }
      }
    });
    
    // If found in database and has a S3 URL, return it
    if (dbFont && dbFont.fontFiles.length > 0 && dbFont.fontFiles[0].url) {
      const fontFile = dbFont.fontFiles[0];
      
      // Generate a signed URL for the file
      let url = fontFile.url;
      
      // If we have a storage key, generate a signed URL
      if (fontFile.storageKey) {
        try {
          url = await s3.getSignedUrl(fontFile.storageKey);
        } catch (s3Error) {
          console.error('Error generating signed URL:', s3Error);
          // Continue with the regular URL
        }
      }
      
      // Increment download count
      await prisma.fontFile.update({
        where: { id: fontFile.id },
        data: { downloadCount: { increment: 1 } }
      });
      
      return {
        success: true,
        fontName: dbFont.name,
        url,
      };
    }
    
    // Otherwise check the file system
    const fontStoragePath = getFontStoragePath();
    const fontProjectPath = path.join(fontStoragePath, fontId);
    
    // Check if the font project exists
    if (!fs.existsSync(fontProjectPath)) {
      return {
        success: false,
        error: 'Font not found'
      };
    }
    
    // Read the metadata to get the font name
    const metadataPath = path.join(fontProjectPath, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      return {
        success: false,
        error: 'Font metadata not found'
      };
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const fontName = metadata.name || 'font';
    const fileName = `${fontName.replace(/\s+/g, '_').toLowerCase()}.${format}`;
    const fontFilePath = path.join(fontProjectPath, 'output', fileName);
    
    // Check if the font file exists
    if (!fs.existsSync(fontFilePath)) {
      return {
        success: false,
        error: 'Font file not found'
      };
    }
    
    return {
      success: true,
      filePath: fontFilePath,
      fontName,
    };
  } catch (error) {
    console.error('Error retrieving font:', error);
    return {
      success: false,
      error: 'Error retrieving font'
    };
  }
} 