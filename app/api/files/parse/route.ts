// app/api/files/parse/route.ts
// File Parse API - Parses uploaded Excel/CSV files and extracts data

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    
    // For CSV/TXT, parse directly
    if (extension === 'csv' || extension === 'txt') {
      const text = await file.text();
      const rows = parseCSV(text);
      return NextResponse.json({ success: true, rows });
    }
    
    // For Excel files, we need to use a library
    // Since xlsx might not be installed, return a helpful error
    if (extension === 'xlsx' || extension === 'xls') {
      // Try to parse using xlsx if available
      try {
        // Dynamic import to avoid build errors if not installed
        const XLSX = await import('xlsx');
        
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        return NextResponse.json({ success: true, rows });
      } catch (xlsxError) {
        // xlsx not installed - return instructions
        console.error('xlsx library error:', xlsxError);
        return NextResponse.json(
          { 
            success: false, 
            error: 'Excel parsing requires xlsx library. Please install: npm install xlsx',
            suggestion: 'Or save your file as CSV and try again.',
          },
          { status: 500 }
        );
      }
    }
    
    // For JSON
    if (extension === 'json') {
      const text = await file.text();
      const data = JSON.parse(text);
      const rows = Array.isArray(data) ? data : [data];
      return NextResponse.json({ success: true, rows });
    }
    
    return NextResponse.json(
      { success: false, error: `Unsupported file type: ${extension}` },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('[File Parse] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to parse file',
      },
      { status: 500 }
    );
  }
}

function parseCSV(text: string): any[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  
  // Parse header
  const headers = firstLine.split(delimiter).map(h => 
    h.trim().replace(/^["']|["']$/g, '')
  );
  
  // Parse rows
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => 
      v.trim().replace(/^["']|["']$/g, '')
    );
    
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    rows.push(row);
  }
  
  return rows;
}
