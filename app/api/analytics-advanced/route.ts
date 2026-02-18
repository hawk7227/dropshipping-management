// app/api/analytics-advanced/route.ts
// Advanced analytics API with real data from P1-P3 systems
// Provides historical pricing, score trends, and comprehensive analytics

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

interface RevenueChartData {
  date: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
}

interface ScoreTrendData {
  date: string;
  avgScore: number;
  totalProducts: number;
  highScoreProducts: number;
}

interface HistoricalPricingData {
  date: string;
  avgPrice: number;
  avgCompetitorPrice: number;
  avgMargin: number;
  priceChanges: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';
    const days = parseInt(searchParams.get('days') || '30');

    switch (type) {
      case 'revenue-chart': {
        const data = await getRevenueChartData(days);
        return NextResponse.json({ success: true, data });
      }

      case 'score-trends': {
        const data = await getScoreTrends(days);
        return NextResponse.json({ success: true, data });
      }

      case 'historical-pricing': {
        const data = await getHistoricalPricing(days);
        return NextResponse.json({ success: true, data });
      }

      case 'top-products': {
        const limit = parseInt(searchParams.get('limit') || '10');
        const metric = searchParams.get('metric') || 'revenue';
        const data = await getTopProducts(metric, limit, days);
        return NextResponse.json({ success: true, data });
      }

      case 'channel-performance': {
        const data = await getChannelPerformance(days);
        return NextResponse.json({ success: true, data });
      }

      case 'ai-score-distribution': {
        const data = await getAIScoreDistribution();
        return NextResponse.json({ success: true, data });
      }

      case 'price-freshness-stats': {
        const data = await getPriceFreshnessStats();
        return NextResponse.json({ success: true, data });
      }

      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

async function getRevenueChartData(days: number): Promise<RevenueChartData[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await getSupabaseClient()
    .from('channel_orders')
    .select('total, ordered_at')
    .gte('ordered_at', cutoffDate)
    .order('ordered_at', { ascending: true });

  if (error) throw error;

  // Group by date
  const grouped = (data || []).reduce((acc, order) => {
    const date = order.ordered_at.split('T')[0];
    if (!acc[date]) {
      acc[date] = { revenue: 0, orders: 0 };
    }
    acc[date].revenue += order.total || 0;
    acc[date].orders += 1;
    return acc;
  }, {} as Record<string, { revenue: number; orders: number }>);

  // Convert to array format
  return Object.entries(grouped).map(([date, data]) => ({
    date,
    revenue: Math.round(data.revenue * 100) / 100,
    orders: data.orders,
    avgOrderValue: Math.round((data.revenue / data.orders) * 100) / 100,
  }));
}

async function getScoreTrends(days: number): Promise<ScoreTrendData[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await getSupabaseClient()
    .from('ai_analysis_log')
    .select(`
      created_at,
      products_processed,
      avg_score,
      high_score_products
    `)
    .gte('created_at', cutoffDate)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map(log => ({
    date: log.created_at.split('T')[0],
    avgScore: log.avg_score || 0,
    totalProducts: log.products_processed || 0,
    highScoreProducts: log.high_score_products || 0,
  }));
}

async function getHistoricalPricing(days: number): Promise<HistoricalPricingData[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await getSupabaseClient()
    .from('price_snapshots')
    .select(`
      fetched_at,
      current_price,
      competitor_price
    `)
    .gte('fetched_at', cutoffDate)
    .order('fetched_at', { ascending: true });

  if (error) throw error;

  // Group by date
  const grouped = (data || []).reduce((acc, snapshot) => {
    const date = snapshot.fetched_at.split('T')[0];
    if (!acc[date]) {
      acc[date] = { 
        totalPrice: 0, 
        totalCompetitorPrice: 0, 
        count: 0,
        priceChanges: 0
      };
    }
    acc[date].totalPrice += snapshot.current_price || 0;
    acc[date].totalCompetitorPrice += snapshot.competitor_price || 0;
    acc[date].count += 1;
    return acc;
  }, {} as Record<string, { 
    totalPrice: number; 
    totalCompetitorPrice: number; 
    count: number;
    priceChanges: number;
  }>);

  // Convert to array format
  return Object.entries(grouped).map(([date, data]) => ({
    date,
    avgPrice: Math.round((data.totalPrice / data.count) * 100) / 100,
    avgCompetitorPrice: Math.round((data.totalCompetitorPrice / data.count) * 100) / 100,
    avgMargin: data.totalCompetitorPrice > 0 
      ? Math.round(((data.totalCompetitorPrice - data.totalPrice) / data.totalCompetitorPrice) * 10000) / 100
      : 0,
    priceChanges: data.priceChanges,
  }));
}

async function getTopProducts(metric: string, limit: number, days: number): Promise<any[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = getSupabaseClient()
    .from('products')
    .select(`
      id,
      title,
      current_price,
      rating,
      review_count,
      ai_scores!inner (
        overall_score,
        score_tier
      )
    `)
    .eq('status', 'active')
    .limit(limit);

  // Apply sorting based on metric
  switch (metric) {
    case 'ai-score':
      query = query.order('ai_scores.overall_score', { ascending: false });
      break;
    case 'rating':
      query = query.order('rating', { ascending: false });
      break;
    case 'reviews':
      query = query.order('review_count', { ascending: false });
      break;
    case 'price':
      query = query.order('current_price', { ascending: false });
      break;
    default:
      query = query.order('ai_scores.overall_score', { ascending: false });
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(product => ({
    id: product.id,
    title: product.title,
    current_price: product.current_price,
    rating: product.rating,
    review_count: product.review_count,
    ai_score: product.ai_scores.overall_score,
    ai_tier: product.ai_scores.score_tier,
  }));
}

async function getChannelPerformance(days: number): Promise<any[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await getSupabaseClient()
    .from('channel_performance')
    .select('*')
    .gte('date', cutoffDate)
    .order('date', { ascending: false });

  if (error) throw error;

  // Group by channel and aggregate
  const grouped = (data || []).reduce((acc, perf) => {
    if (!acc[perf.channel_name]) {
      acc[perf.channel_name] = {
        channel: perf.channel_name,
        revenue: 0,
        orders: 0,
        avgOrderValue: 0,
        conversionRate: 0,
        count: 0
      };
    }
    acc[perf.channel_name].revenue += perf.revenue || 0;
    acc[perf.channel_name].orders += perf.orders || 0;
    acc[perf.channel_name].avgOrderValue += perf.avg_order_value || 0;
    acc[perf.channel_name].conversionRate += perf.conversion_rate || 0;
    acc[perf.channel_name].count += 1;
    return acc;
  }, {} as Record<string, any>);

  // Calculate averages
  return Object.values(grouped).map(channel => ({
    ...channel,
    avgOrderValue: channel.count > 0 ? Math.round((channel.avgOrderValue / channel.count) * 100) / 100 : 0,
    conversionRate: channel.count > 0 ? Math.round((channel.conversionRate / channel.count) * 100) / 100 : 0,
  }));
}

async function getAIScoreDistribution(): Promise<any> {
  const { data, error } = await getSupabaseClient()
    .from('ai_scores')
    .select('overall_score, score_tier');

  if (error) throw error;

  const scores = data || [];
  
  const distribution = {
    excellent: scores.filter(s => s.overall_score >= 90).length,
    good: scores.filter(s => s.overall_score >= 75 && s.overall_score < 90).length,
    average: scores.filter(s => s.overall_score >= 60 && s.overall_score < 75).length,
    poor: scores.filter(s => s.overall_score < 60).length,
    total: scores.length,
    avgScore: scores.length > 0 
      ? Math.round(scores.reduce((sum, s) => sum + s.overall_score, 0) / scores.length)
      : 0,
  };

  const tierDistribution = scores.reduce((acc, s) => {
    acc[s.score_tier] = (acc[s.score_tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    ...distribution,
    tierDistribution,
  };
}

async function getPriceFreshnessStats(): Promise<any> {
  const { data, error } = await getSupabaseClient()
    .from('price_snapshots')
    .select('fetched_at')
    .eq('is_latest', true);

  if (error) throw error;

  const now = new Date();
  const snapshots = data || [];

  const freshness = snapshots.reduce((acc, snapshot) => {
    const hoursOld = (now.getTime() - new Date(snapshot.fetched_at).getTime()) / (1000 * 60 * 60);
    
    if (hoursOld <= 24) {
      acc.fresh++;
    } else if (hoursOld <= 72) {
      acc.stale++;
    } else {
      acc.very_stale++;
    }
    acc.total++;
    return acc;
  }, { fresh: 0, stale: 0, very_stale: 0, total: 0 });

  const avgAgeHours = snapshots.length > 0
    ? snapshots.reduce((sum, s) => sum + (now.getTime() - new Date(s.fetched_at).getTime()), 0) / (snapshots.length * 1000 * 60 * 60)
    : 0;

  return {
    ...freshness,
    avgAgeHours: Math.round(avgAgeHours * 10) / 10,
    freshnessPercentage: {
      fresh: freshness.total > 0 ? Math.round((freshness.fresh / freshness.total) * 100) : 0,
      stale: freshness.total > 0 ? Math.round((freshness.stale / freshness.total) * 100) : 0,
      very_stale: freshness.total > 0 ? Math.round((freshness.very_stale / freshness.total) * 100) : 0,
    }
  };
}
