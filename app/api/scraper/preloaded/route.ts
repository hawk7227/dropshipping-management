// app/api/scraper/preloaded/route.ts
// Serves the preloaded 15K ASINs file for the scraper

import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Preloaded ASINs - 8,801 unique ASINs from 15Kp.xlsx
// These will be loaded when the scraper starts
const PRELOADED_ASINS: string[] = [
  "B08NX78N1P", "B09NW9P3TW", "B08Y6YV1MH", "B000BXMF7C", "B09YPR4NK4",
  "B0CM2BVS6S", "B0CK57QLCZ", "B0CMLFTSS7", "B00002ND6L", "B00B58A3OO",
  // ... This would be populated with all 8,801 ASINs
  // For now, we'll load from a JSON file if available
];

export async function GET() {
  try {
    // Try to load from JSON file first
    const jsonPath = join(process.cwd(), 'data', 'preloaded-asins.json');
    
    let asins: string[] = [];
    
    if (existsSync(jsonPath)) {
      const data = readFileSync(jsonPath, 'utf-8');
      asins = JSON.parse(data);
    } else {
      // Fall back to hardcoded (would need to be populated)
      asins = PRELOADED_ASINS;
    }
    
    return NextResponse.json({
      success: true,
      count: asins.length,
      asins,
      source: existsSync(jsonPath) ? 'file' : 'hardcoded',
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
