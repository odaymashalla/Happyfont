import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Font generation endpoint
app.post('/api/generate-font', async (req, res) => {
  try {
    const { characters, fontName } = req.body;

    if (!characters || !fontName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Create a temporary directory for font generation
    const tempDir = `/tmp/font_${Date.now()}`;
    const execAsync = promisify(exec);

    // Generate font using FontForge
    // Note: This is a simplified version. You'll need to implement the actual font generation logic
    await execAsync(`mkdir -p ${tempDir}`);
    
    // Store the font in Supabase Storage
    const { data, error } = await supabase.storage
      .from('fonts')
      .upload(`${fontName}.ttf`, `${tempDir}/${fontName}.ttf`);

    if (error) {
      throw error;
    }

    // Clean up temporary files
    await execAsync(`rm -rf ${tempDir}`);

    res.json({
      success: true,
      fontUrl: data?.path
    });

  } catch (error) {
    console.error('Font generation error:', error);
    res.status(500).json({ error: 'Failed to generate font' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
}); 