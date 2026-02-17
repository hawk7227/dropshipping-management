// app/api/campaigns/patients/route.ts
// API route to fetch Medazon Health patients for campaign targeting

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

// Cost per message by channel
const COSTS = {
  email: 0.001,   // $0.001 per email
  sms: 0.0075,    // $0.0075 per SMS (US)
  mms: 0.02,      // $0.02 per MMS (US)
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel') || 'all';
    const segment = searchParams.get('segment');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = getSupabaseClient()
      .from('medazon_patients')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    // Filter by channel opt-in
    if (channel === 'email') {
      query = query.eq('email_opt_in', true);
    } else if (channel === 'sms') {
      query = query.eq('sms_opt_in', true);
    } else if (channel === 'mms') {
      query = query.eq('mms_opt_in', true);
    }

    // Filter by segment/tags
    if (segment) {
      query = query.contains('tags', [segment]);
    }

    // Search by name, email, or phone
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data: patients, error, count } = await query;

    if (error) {
      console.error('Error fetching patients:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate costs
    const emailCount = patients?.filter(p => p.email_opt_in && p.email).length || 0;
    const smsCount = patients?.filter(p => p.sms_opt_in && p.phone).length || 0;
    const mmsCount = patients?.filter(p => p.mms_opt_in && p.phone).length || 0;

    const costs = {
      email: { count: emailCount, unitCost: COSTS.email, total: (emailCount * COSTS.email).toFixed(2) },
      sms: { count: smsCount, unitCost: COSTS.sms, total: (smsCount * COSTS.sms).toFixed(2) },
      mms: { count: mmsCount, unitCost: COSTS.mms, total: (mmsCount * COSTS.mms).toFixed(2) },
      combined: {
        total: ((emailCount * COSTS.email) + (smsCount * COSTS.sms) + (mmsCount * COSTS.mms)).toFixed(2)
      }
    };

    return NextResponse.json({
      patients: patients || [],
      total: count || 0,
      costs,
      pagination: {
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get patient segments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'get_segments') {
      const { data: segments, error } = await getSupabaseClient()
        .from('patient_segments')
        .select('*')
        .order('name');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ segments: segments || [] });
    }

    if (action === 'get_stats') {
      // Get patient statistics
      const { data: allPatients } = await getSupabaseClient()
        .from('medazon_patients')
        .select('email_opt_in, sms_opt_in, mms_opt_in, status')
        .eq('status', 'active');

      const stats = {
        total: allPatients?.length || 0,
        emailOptIn: allPatients?.filter(p => p.email_opt_in).length || 0,
        smsOptIn: allPatients?.filter(p => p.sms_opt_in).length || 0,
        mmsOptIn: allPatients?.filter(p => p.mms_opt_in).length || 0,
      };

      return NextResponse.json({ stats });
    }

    if (action === 'estimate_cost') {
      const { channels, recipientCount } = body;
      
      let totalCost = 0;
      const breakdown: Record<string, number> = {};

      if (channels.email) {
        breakdown.email = recipientCount * COSTS.email;
        totalCost += breakdown.email;
      }
      if (channels.sms) {
        breakdown.sms = recipientCount * COSTS.sms;
        totalCost += breakdown.sms;
      }
      if (channels.mms) {
        breakdown.mms = recipientCount * COSTS.mms;
        totalCost += breakdown.mms;
      }

      return NextResponse.json({
        breakdown,
        total: totalCost.toFixed(2),
        recipientCount
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
