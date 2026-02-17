// app/api/dashboard/route.ts
// Real dashboard data API using Supabase and Shopify integration
// Provides real-time metrics for the dashboard

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getDashboardStats,
  getDiscoveryStats,
  getDemandDistribution,
  getRevenueData,
  getCategoryBreakdown,
  getProfitTrend,
  getOrdersToday,
  getRevenueToday,
} from '@/lib/services/dashboard-service';

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

interface DashboardData {
  today: {
    revenue: number;
    orders: number;
    newMembers: number;
    pageViews: number;
  };
  week: {
    revenue: number;
    orders: number;
    newMembers: number;
    memberSavings: number;
  };
  month: {
    revenue: number;
    orders: number;
    newMembers: number;
    churnedMembers: number;
  };
  products: {
    total: number;
    active: number;
    lowStock: number;
    outOfStock: number;
  };
  members: {
    total: number;
    active: number;
    avgLifetimeValue: number;
  };
  prices: {
    tracked: number;
    avgSavings: number;
    staleCount: number;
  };
  stats?: {
    profitMargin: number;
    productsBelowMargin: number;
    pendingSync: number;
    priceAlerts: number;
  };
  discovery?: any;
  demandDistribution?: any;
  revenueChart?: any[];
  categoryBreakdown?: any[];
  profitTrend?: any[];
}

export async function GET(request: NextRequest) {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    // Fetch dashboard stats using the new service
    const stats = await getDashboardStats();

    // Today's revenue and orders from orders table (synced from Shopify)
    const todayRevenue = await getRevenueToday();
    const todayOrderCount = await getOrdersToday();

    // This week's revenue and orders
    const { data: weekOrders } = await supabase
      .from('orders')
      .select('total')
      .gte('ordered_at', `${weekAgoStr}T00:00:00Z`);

    const weekRevenue = weekOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
    const weekOrderCount = weekOrders?.length || 0;

    // This month's revenue and orders
    const { data: monthOrders } = await supabase
      .from('orders')
      .select('total')
      .gte('ordered_at', `${monthStartStr}T00:00:00Z`);

    const monthRevenue = monthOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
    const monthOrderCount = monthOrders?.length || 0;

    // Low stock and out of stock from price_snapshots availability
    const { data: availabilityData } = await supabase
      .from('price_snapshots')
      .select('availability')
      .eq('is_latest', true);

    const lowStock = availabilityData?.filter(p => p.availability === 'limited').length || 0;
    const outOfStock = availabilityData?.filter(p => p.availability === 'out_of_stock').length || 0;

    // Members data (graceful fallback if members table doesn't exist)
    let totalMembers = 0;
    let activeMembers = 0;
    let churnedMembers = 0;
    let avgLifetimeValue = 0;

    try {
      const { count } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true });
      totalMembers = count || 0;

      const { count: active } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      activeMembers = active || 0;

      // Calculate churned members (inactive for 30+ days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: churned } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .lt('last_active', thirtyDaysAgo);
      churnedMembers = churned || 0;

      // Calculate average lifetime value
      const { data: memberStats } = await supabase
        .from('member_analytics')
        .select('total_spent');
      
      if (memberStats && memberStats.length > 0) {
        avgLifetimeValue = memberStats.reduce((sum, m) => sum + (m.total_spent || 0), 0) / memberStats.length;
      }
    } catch (error) {
      // Members tables might not exist - use defaults
      console.log('Members tables not available, using defaults');
    }

    // Price tracking data from price_snapshots
    const { data: priceData } = await supabase
      .from('price_snapshots')
      .select('current_price, competitor_price, fetched_at')
      .eq('is_latest', true);

    const trackedCount = priceData?.length || 0;
    
    // Calculate average savings
    let avgSavings = 0;
    if (priceData && priceData.length > 0) {
      const savings = priceData
        .filter(p => p.competitor_price && p.competitor_price > 0)
        .map(p => ((p.competitor_price - p.current_price) / p.competitor_price) * 100);
      avgSavings = savings.length > 0 ? savings.reduce((sum, s) => sum + s, 0) / savings.length : 0;
    }

    // Count stale prices (older than 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const staleCount = priceData?.filter(p => p.fetched_at < cutoff).length || 0;

    // Page views (mock for now - could be added from analytics)
    const pageViews = Math.floor(Math.random() * 1000) + 500;

    // New members (today)
    let newMembersToday = 0;
    let newMembersWeek = 0;
    let newMembersMonth = 0;
    
    try {
      const { count: newToday } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${todayStr}T00:00:00Z`);
      newMembersToday = newToday || 0;

      const { count: newWeek } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${weekAgoStr}T00:00:00Z`);
      newMembersWeek = newWeek || 0;

      const { count: newMonth } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${monthStartStr}T00:00:00Z`);
      newMembersMonth = newMonth || 0;
    } catch (error) {
      // Members table might not exist
    }

    // Member savings (total savings from all orders)
    const memberSavings = weekRevenue * (avgSavings / 100);

    // Get additional dashboard data
    const discovery = await getDiscoveryStats();
    const demandDistribution = await getDemandDistribution();
    const revenueChart = await getRevenueData(30);
    const categoryBreakdown = await getCategoryBreakdown();
    const profitTrend = await getProfitTrend(30);

    const dashboardData: DashboardData = {
      today: {
        revenue: Math.round(todayRevenue * 100) / 100,
        orders: todayOrderCount,
        newMembers: newMembersToday,
        pageViews,
      },
      week: {
        revenue: Math.round(weekRevenue * 100) / 100,
        orders: weekOrderCount,
        newMembers: newMembersWeek,
        memberSavings: Math.round(memberSavings * 100) / 100,
      },
      month: {
        revenue: Math.round(monthRevenue * 100) / 100,
        orders: monthOrderCount,
        newMembers: newMembersMonth,
        churnedMembers,
      },
      products: {
        total: stats.totalProducts,
        active: stats.activeProducts,
        lowStock,
        outOfStock,
      },
      members: {
        total: totalMembers,
        active: activeMembers,
        avgLifetimeValue: Math.round(avgLifetimeValue * 100) / 100,
      },
      prices: {
        tracked: trackedCount,
        avgSavings: Math.round(avgSavings * 10) / 10,
        staleCount,
      },
      stats: {
        profitMargin: stats.profitMargin,
        productsBelowMargin: stats.productsBelowMargin,
        pendingSync: stats.pendingSync,
        priceAlerts: stats.priceAlerts,
      },
      discovery,
      demandDistribution,
      revenueChart,
      categoryBreakdown,
      profitTrend,
    };

    return NextResponse.json({ data: dashboardData });

  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
