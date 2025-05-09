import { NextRequest, NextResponse } from 'next/server';
import { generateFont, FontGenerationRequest } from '@/services/fontGeneratorSupabase';

export async function POST(req: NextRequest) {
  try {
    const request: FontGenerationRequest = await req.json();
    
    // Generate the font
    const result = await generateFont(request);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to generate font' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      fontUrl: result.fontUrl
    });
    
  } catch (error) {
    console.error('Error in font generation API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 