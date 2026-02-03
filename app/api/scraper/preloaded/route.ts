// app/api/scraper/preloaded/route.ts
// Serves the preloaded 8,801 ASINs for the scraper

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Try multiple possible locations for the JSON file
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'preloaded-asins.json'),
      path.join(process.cwd(), 'public', 'preloaded-asins.json'),
      path.join(process.cwd(), 'preloaded-asins.json'),
    ];
    
    let asins: string[] = [];
    let loadedFrom = '';
    
    for (const filePath of possiblePaths) {
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        asins = JSON.parse(data);
        loadedFrom = filePath;
        console.log(`[PreloadedASINs] Loaded ${asins.length} ASINs from ${filePath}`);
        break;
      } catch (e) {
        // File not found at this path, try next
        continue;
      }
    }
    
    // If no file found, return empty (user can upload their own)
    if (asins.length === 0) {
      console.log('[PreloadedASINs] No preloaded file found');
      return NextResponse.json({
        success: true,
        count: 0,
        asins: [],
        source: 'none',
        message: 'No preloaded ASINs. Upload a JSON or CSV file to start.',
      });
    }
    
    return NextResponse.json({
      success: true,
      count: asins.length,
      asins,
      source: loadedFrom,
    });
    
  } catch (error) {
    console.error('[PreloadedASINs] Error:', error);
    return NextResponse.json({
      success: false,
      count: 0,
      asins: [],
      error: error instanceof Error ? error.message : 'Failed to load ASINs',
    });
  }
}

