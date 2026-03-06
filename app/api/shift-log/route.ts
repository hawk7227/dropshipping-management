// app/api/shift-log/route.ts
// ═══════════════════════════════════════════════════════════
// SHIFT LOG API — Read system events, acknowledge, get summary
// Auto-populated by Postgres triggers. Crons write here directly.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'recent';
  const since = searchParams.get('since') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    if (action === 'recent') {
      // Get recent events
      const { data, error } = await supabase
        .from('shift_log')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ events: data, count: data?.length || 0 });
    }

    if (action === 'summary') {
      // Get summary by category
      const { data, error } = await supabase.rpc('get_shift_summary', { since_ts: since });
      if (error) {
        // Fallback if function doesn't exist yet
        const { data: fallback } = await supabase
          .from('shift_log')
          .select('category, title, created_at, severity')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(100);
        return NextResponse.json({ summary: fallback || [], fallback: true });
      }
      return NextResponse.json({ summary: data });
    }

    if (action === 'stats') {
      // Real-time system stats — product counts, feed health, etc.
      const [
        { count: totalProducts },
        { count: activeProducts },
        { count: feedReady },
        { count: feedRejected },
        { count: feedPending },
        { count: todayEvents },
      ] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('feed_status', 'ready'),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('feed_status', 'rejected'),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('feed_status', 'pending'),
        supabase.from('shift_log').select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
      ]);

      return NextResponse.json({
        products: {
          total: totalProducts || 0,
          active: activeProducts || 0,
          feedReady: feedReady || 0,
          feedRejected: feedRejected || 0,
          feedPending: feedPending || 0,
        },
        todayEvents: todayEvents || 0,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'acknowledge') {
      // Mark events as acknowledged
      const { ids, acknowledged_by, feedback } = body;
      if (!ids?.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });

      const { error } = await supabase
        .from('shift_log')
        .update({
          acknowledged_by: acknowledged_by || 'operator',
          acknowledged_at: new Date().toISOString(),
          feedback: feedback || null,
        })
        .in('id', ids);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ acknowledged: ids.length });
    }

    if (action === 'log') {
      // Manual log entry (for crons or explicit events)
      const { category, title, description, source, severity, meta } = body;
      const { data, error } = await supabase
        .from('shift_log')
        .insert({
          category: category || 'system_event',
          title,
          description,
          source: source || 'system',
          severity: severity || 'info',
          meta: meta || {},
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ logged: data });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
