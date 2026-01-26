// app/api/content-brain/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create client lazily inside functions, not at top level
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL= https://fzenkpfwyhibcoulxfdx.supabase.co> .env.local;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY= eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZW5rcGZ3eWhpYmNvdWx4ZmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTQ0MzAsImV4cCI6MjA4NDU5MDQzMH0.ZpMs8i6p_aHkaDTufLvW6CR2m4jkpFSOsvTjGGP6aJk>> .env.local ;
  
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    // Your existing logic here
    return NextResponse.json({ message: 'Content brain API ready' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    // Your existing logic here
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

