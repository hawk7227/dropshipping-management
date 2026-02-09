/**
 * API Route: POST /api/setup-demo
 * Creates a demo user for testing purposes
 * WARNING: Only use in development environment
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Demo setup not available in production' },
      { status: 403 }
    );
  }

  try {
    const supabase = createRouteHandlerClient({ cookies });
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use the SECRET key here
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
    // Create demo user
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: 'demo@example.com',
      password: 'demo123456',
      email_confirm: true, // Auto-confirm email for demo
      user_metadata: {
        name: 'Demo User',
        is_demo: true,
      },
    });

    if (error) {
      // If user already exists, that's fine
      if (error.message.includes('already registered')) {
        return NextResponse.json({ 
          message: 'Demo user already exists',
          credentials: {
            email: 'demo@example.com',
            password: 'demo123456'
          }
        });
      }
      throw error;
    }

    return NextResponse.json({ 
      message: 'Demo user created successfully',
      credentials: {
        email: 'demo@example.com',
        password: 'demo123456'
      },
      user: data.user
    });

  } catch (error) {
    console.error('[api/setup-demo] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create demo user' },
      { status: 500 }
    );
  }
}
