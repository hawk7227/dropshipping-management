// app/api/settings/route.ts
// Settings API - GET/POST system settings with cron logs and token usage

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Fetch all settings
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // Fetch all settings
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('*')
      .order('category')
      .order('key');

    if (settingsError) {
      console.error('[Settings API] Error fetching settings:', settingsError);
      // Return empty settings if table doesn't exist yet
      return NextResponse.json({
        success: true,
        data: {
          settings: [],
          cronLogs: [],
          tokenUsage: { used: 0, remaining: 10000, limit: 10000, percentage: 0 },
        },
      });
    }

    // Fetch latest cron job logs
    const { data: cronLogs } = await supabase
      .from('cron_job_logs')
      .select('*')
      .in('job_type', ['discovery', 'price_sync', 'margin_check'])
      .order('started_at', { ascending: false })
      .limit(10);

    // Get unique latest log per job type
    const latestLogs = new Map<string, any>();
    for (const log of (cronLogs || [])) {
      if (!latestLogs.has(log.job_type)) {
        latestLogs.set(log.job_type, log);
      }
    }

    // Fetch token usage for today
    const today = new Date().toISOString().split('T')[0];
    const { data: tokenData } = await supabase
      .from('keepa_token_log')
      .select('*')
      .eq('date', today)
      .single();

    // Get token limit from settings
    const limitSetting = settings?.find(s => s.category === 'keepa' && s.key === 'daily_token_limit');
    const limit = limitSetting ? JSON.parse(limitSetting.value) : 10000;
    const used = tokenData?.tokens_used || 0;

    return NextResponse.json({
      success: true,
      data: {
        settings: settings || [],
        cronLogs: Array.from(latestLogs.values()),
        tokenUsage: {
          used,
          remaining: limit - used,
          limit,
          percentage: (used / limit) * 100,
        },
      },
    });
  } catch (error) {
    console.error('[Settings API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Update settings
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, settings: newSettings } = body;

    if (!category || !newSettings) {
      return NextResponse.json(
        { success: false, error: 'Missing category or settings' },
        { status: 400 }
      );
    }

    const updates = [];
    const now = new Date().toISOString();

    for (const [key, value] of Object.entries(newSettings)) {
      // Convert value to JSON string for storage
      const jsonValue = JSON.stringify(value);

      updates.push(
        supabase
          .from('system_settings')
          .upsert({
            category,
            key,
            value: jsonValue,
            updated_at: now,
          }, {
            onConflict: 'category,key',
          })
      );
    }

    await Promise.all(updates);

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('[Settings API] Error updating settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
