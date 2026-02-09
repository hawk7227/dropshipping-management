// lib/google-search-console.ts
// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE SEARCH CONSOLE INTEGRATION — Spec Item 46
// Fetches search performance data and identifies optimization opportunities
// ═══════════════════════════════════════════════════════════════════════════
// - Queries GSC API for impressions, clicks, CTR, position
// - Stores metrics in Supabase for dashboard display
// - Identifies underperforming pages for SEO improvement
// - Tracks keyword rankings over time
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GSC_SITE_URL = process.env.GSC_SITE_URL || 'https://medazonhealth.com';
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface GSCRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchPerformance {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  date: string;
}

interface OptimizationOpportunity {
  page: string;
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  opportunity_type: 'high_impressions_low_clicks' | 'position_improvement' | 'cannibalization';
  recommendation: string;
  potential_clicks: number;
}

interface GSCFetchResult {
  metrics: SearchPerformance[];
  opportunities: OptimizationOpportunity[];
  stored: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH — Google Service Account JWT
// ═══════════════════════════════════════════════════════════════════════════

async function getGoogleAccessToken(): Promise<string | null> {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.warn('[GSC] Google service account not configured');
    return null;
  }

  try {
    // Build JWT
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const claims = Buffer.from(JSON.stringify({
      iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');

    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${claims}`);
    const signature = sign.sign(GOOGLE_PRIVATE_KEY, 'base64url');

    const jwt = `${header}.${claims}.${signature}`;

    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenRes.ok) {
      console.error('[GSC] Token exchange failed:', tokenRes.status);
      return null;
    }

    const tokenData = await tokenRes.json();
    return tokenData.access_token;
  } catch (err) {
    console.error('[GSC] Auth error:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH SEARCH PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchSearchPerformance(options?: {
  days?: number;
  rowLimit?: number;
}): Promise<GSCFetchResult> {
  const days = options?.days || 28;
  const rowLimit = options?.rowLimit || 500;
  const result: GSCFetchResult = { metrics: [], opportunities: [], stored: 0, errors: [] };

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    result.errors.push('Google access token not available — check service account config');
    return result;
  }

  try {
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const requestBody = {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      dimensions: ['query', 'page'],
      rowLimit,
      dataState: 'final',
    };

    const apiUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      result.errors.push(`GSC API: HTTP ${res.status} — ${errText.slice(0, 200)}`);
      return result;
    }

    const data = await res.json();
    const rows: GSCRow[] = data.rows || [];

    // Map to SearchPerformance
    const today = new Date().toISOString().split('T')[0];
    result.metrics = rows.map(row => ({
      query: row.keys[0],
      page: row.keys[1],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      date: today,
    }));

    // Store in Supabase
    if (result.metrics.length > 0) {
      const records = result.metrics.map(m => ({
        query: m.query,
        page_url: m.page,
        clicks: m.clicks,
        impressions: m.impressions,
        ctr: m.ctr,
        avg_position: m.position,
        date: m.date,
        created_at: new Date().toISOString(),
      }));

      const { error: insertErr } = await supabase
        .from('search_performance')
        .insert(records);

      if (insertErr) {
        result.errors.push(`Store error: ${insertErr.message}`);
      } else {
        result.stored = records.length;
      }
    }

    // Identify opportunities
    result.opportunities = identifyOpportunities(result.metrics);

  } catch (err) {
    result.errors.push(`GSC fetch: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  console.log(`[GSC] Fetched ${result.metrics.length} rows, stored ${result.stored}, found ${result.opportunities.length} opportunities`);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPPORTUNITY IDENTIFICATION
// ═══════════════════════════════════════════════════════════════════════════

function identifyOpportunities(metrics: SearchPerformance[]): OptimizationOpportunity[] {
  const opportunities: OptimizationOpportunity[] = [];

  for (const m of metrics) {
    // High impressions, low CTR (position 4-20)
    if (m.impressions > 100 && m.ctr < 0.02 && m.position >= 4 && m.position <= 20) {
      const potentialCTR = m.position <= 10 ? 0.05 : 0.02;
      opportunities.push({
        page: m.page,
        query: m.query,
        impressions: m.impressions,
        clicks: m.clicks,
        position: m.position,
        opportunity_type: 'high_impressions_low_clicks',
        recommendation: `Optimize title/meta description for "${m.query}". Current CTR: ${(m.ctr * 100).toFixed(1)}%. Target: ${(potentialCTR * 100).toFixed(0)}%`,
        potential_clicks: Math.round(m.impressions * potentialCTR) - m.clicks,
      });
    }

    // Position 5-15 — could improve to page 1
    if (m.position >= 5 && m.position <= 15 && m.impressions > 50) {
      const potentialCTR = 0.08; // Avg CTR for position 3-5
      opportunities.push({
        page: m.page,
        query: m.query,
        impressions: m.impressions,
        clicks: m.clicks,
        position: m.position,
        opportunity_type: 'position_improvement',
        recommendation: `Improve content for "${m.query}". Position ${m.position.toFixed(1)} → target top 5 with content optimization.`,
        potential_clicks: Math.round(m.impressions * potentialCTR) - m.clicks,
      });
    }
  }

  // Sort by potential clicks
  return opportunities.sort((a, b) => b.potential_clicks - a.potential_clicks).slice(0, 20);
}

// ═══════════════════════════════════════════════════════════════════════════
// GET TOP QUERIES (for dashboard)
// ═══════════════════════════════════════════════════════════════════════════

export async function getTopQueries(limit: number = 20): Promise<SearchPerformance[]> {
  const { data } = await supabase
    .from('search_performance')
    .select('query, page_url, clicks, impressions, ctr, avg_position, date')
    .order('impressions', { ascending: false })
    .limit(limit);

  return (data || []).map(row => ({
    query: row.query,
    page: row.page_url,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.avg_position,
    date: row.date,
  }));
}

export default { fetchSearchPerformance, getTopQueries };
