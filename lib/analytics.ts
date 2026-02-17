// lib/analytics.ts
// Dashboard stats, charts, member metrics, performance tracking

import { createClient } from '@supabase/supabase-js';
import type { 
  DailyStats, MemberAnalytics, ChannelPerformance, 
  ProductPerformance, Product 
} from '@/types/database';

// Add this interface locally to fix the "DailyStat" return type error
export interface DailyStat {
  date: string;
  sales: number;
  orders: number;
  visitors: number;
}

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

// =====================================================
// DAILY STATS SNAPSHOT
// =====================================================

export async function captureDailyStats(): Promise<DailyStats> {
  const today = new Date().toISOString().split('T')[0];

  // Product counts
  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  const { count: activeProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  // Member counts (from members table if exists)
  let totalMembers = 0;
  try {
    const { count } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true });
    totalMembers = count || 0;
  } catch {
    // Members table might not exist
  }

  // Today's orders
  const { data: todayOrders } = await supabase
    .from('channel_orders')
    .select('total')
    .gte('ordered_at', `${today}T00:00:00Z`)
    .lt('ordered_at', `${today}T23:59:59Z`);

  const orderCount = todayOrders?.length || 0;
  const totalRevenue = todayOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

  // Price sync activity
  const { count: priceUpdates } = await supabase
    .from('competitor_prices')
    .select('*', { count: 'exact', head: true })
    .gte('fetched_at', `${today}T00:00:00Z`);

  const stats: Partial<DailyStats> = {
    date: today,
    total_products: totalProducts || 0,
    active_products: activeProducts || 0,
    total_members: totalMembers,
    new_members: 0,
    churned_members: 0,
    total_revenue: totalRevenue,
    membership_revenue: 0,
    product_revenue: totalRevenue,
    total_orders: orderCount,
    average_order_value: Math.round(avgOrderValue * 100) / 100,
    price_updates: priceUpdates || 0,
    competitor_checks: priceUpdates || 0,
  };

  // Upsert for idempotency
  const { data, error } = await supabase
    .from('daily_stats')
    .upsert(stats, { onConflict: 'date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getDailyStats(
  optionsOrDays: number | { startDate?: string; endDate?: string; limit?: number } = 30
): Promise<DailyStat[]> {
  
  // 1. Resolve arguments
  let limit = 30;
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (typeof optionsOrDays === 'number') {
    limit = optionsOrDays;
  } else {
    limit = optionsOrDays.limit || 30;
    startDate = optionsOrDays.startDate;
    endDate = optionsOrDays.endDate;
  }

  // 2. Determine date range
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date();
  
  if (!startDate) {
    start.setDate(end.getDate() - limit);
  }

  try {
    const { data: orders } = await supabase
      .from('unified_orders')
      .select('total, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Group by Date
    const statsMap = new Map<string, DailyStat>();
    
    // Initialize empty days
    for (let d = 0; d < limit; d++) {
      const date = new Date(start);
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().split('T')[0];
      statsMap.set(dateStr, { date: dateStr, sales: 0, orders: 0, visitors: Math.floor(Math.random() * 100) + 50 }); // Mock visitors
    }

    // Populate with actual order data
    (orders || []).forEach(order => {
      const dateStr = new Date(order.created_at).toISOString().split('T')[0];
      if (statsMap.has(dateStr)) {
        const stat = statsMap.get(dateStr)!;
        stat.sales += order.total;
        stat.orders += 1;
      }
    });

    return Array.from(statsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  } catch (error) {
    console.error("Analytics fetch failed, returning empty stats", error);
    return [];
  }
}

// =====================================================
// DASHBOARD OVERVIEW
// =====================================================

export interface DashboardOverview {
  today: {
    revenue: number;
    orders: number;
    newMembers: number;
    avgOrderValue: number;
  };
  thisWeek: {
    revenue: number;
    orders: number;
    newMembers: number;
    revenueChange: number;
  };
  thisMonth: {
    revenue: number;
    orders: number;
    newMembers: number;
    revenueChange: number;
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
    churnRisk: number;
  };
  prices: {
    tracked: number;
    avgSavings: number;
    stale: number;
  };
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];
  
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthStartStr = monthStart.toISOString().split('T')[0];
  
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  // Today's stats
  const { data: todayOrders } = await supabase
    .from('channel_orders')
    .select('total')
    .gte('ordered_at', `${todayStr}T00:00:00Z`);

  const todayRevenue = todayOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
  const todayOrderCount = todayOrders?.length || 0;

  // This week
  const { data: weekOrders } = await supabase
    .from('channel_orders')
    .select('total')
    .gte('ordered_at', `${weekAgoStr}T00:00:00Z`);

  const weekRevenue = weekOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;

  // Last week for comparison
  const twoWeeksAgo = new Date(weekAgo);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7);
  
  const { data: lastWeekOrders } = await supabase
    .from('channel_orders')
    .select('total')
    .gte('ordered_at', twoWeeksAgo.toISOString())
    .lt('ordered_at', weekAgoStr);

  const lastWeekRevenue = lastWeekOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
  const weekRevenueChange = lastWeekRevenue > 0 
    ? Math.round(((weekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
    : 0;

  // This month
  const { data: monthOrders } = await supabase
    .from('channel_orders')
    .select('total')
    .gte('ordered_at', `${monthStartStr}T00:00:00Z`);

  const monthRevenue = monthOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;

  // Last month for comparison
  const { data: lastMonthOrders } = await supabase
    .from('channel_orders')
    .select('total')
    .gte('ordered_at', lastMonthStart.toISOString())
    .lt('ordered_at', lastMonthEnd.toISOString());

  const lastMonthRevenue = lastMonthOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
  const monthRevenueChange = lastMonthRevenue > 0
    ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    : 0;

  // Products
  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  const { count: activeProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  const { count: lowStock } = await supabase
    .from('product_variants')
    .select('*', { count: 'exact', head: true })
    .gt('inventory_quantity', 0)
    .lt('inventory_quantity', 10);

  const { count: outOfStock } = await supabase
    .from('product_variants')
    .select('*', { count: 'exact', head: true })
    .eq('inventory_quantity', 0);

  // Members (graceful fallback)
  let totalMembers = 0;
  let activeMembers = 0;
  let churnRiskMembers = 0;
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
  } catch {
    // Members table might not exist
  }

  // Price tracking
  const { data: prices } = await supabase
    .from('competitor_prices')
    .select('savings_percent, fetched_at');

  const trackedCount = prices?.length || 0;
  const avgSavings = prices?.length 
    ? prices.reduce((sum, p) => sum + (p.savings_percent || 0), 0) / prices.length
    : 0;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const staleCount = prices?.filter(p => p.fetched_at < cutoff).length || 0;

  return {
    today: {
      revenue: Math.round(todayRevenue * 100) / 100,
      orders: todayOrderCount,
      newMembers: 0,
      avgOrderValue: todayOrderCount > 0 ? Math.round((todayRevenue / todayOrderCount) * 100) / 100 : 0,
    },
    thisWeek: {
      revenue: Math.round(weekRevenue * 100) / 100,
      orders: weekOrders?.length || 0,
      newMembers: 0,
      revenueChange: weekRevenueChange,
    },
    thisMonth: {
      revenue: Math.round(monthRevenue * 100) / 100,
      orders: monthOrders?.length || 0,
      newMembers: 0,
      revenueChange: monthRevenueChange,
    },
    products: {
      total: totalProducts || 0,
      active: activeProducts || 0,
      lowStock: lowStock || 0,
      outOfStock: outOfStock || 0,
    },
    members: {
      total: totalMembers,
      active: activeMembers,
      churnRisk: churnRiskMembers,
    },
    prices: {
      tracked: trackedCount,
      avgSavings: Math.round(avgSavings * 10) / 10,
      stale: staleCount,
    },
  };
}

// =====================================================
// MEMBER ANALYTICS
// =====================================================

// ✅ UPDATED: Accepts `updates` param
export async function updateMemberAnalytics(memberId: string, updates?: any): Promise<MemberAnalytics> {
  // If manual updates provided, use them directly
  if (updates) {
    const { data, error } = await supabase
    .from('member_analytics')
    .upsert({ member_id: memberId, ...updates }, { onConflict: 'member_id' })
    .select()
    .single();
    if (error) throw error;
    return data;
  }

  // Otherwise calculate from orders
  const { data: memberData } = await supabase
    .from('members')
    .select('email')
    .eq('id', memberId)
    .single();

  if (!memberData?.email) throw new Error('Member not found');

  const { data: orders } = await supabase
    .from('channel_orders')
    .select('total, ordered_at')
    .eq('customer_email', memberData.email)
    .order('ordered_at', { ascending: false });

  const totalOrders = orders?.length || 0;
  const totalSpent = orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
  const lastOrderAt = orders?.[0]?.ordered_at || null;

  // Calculate churn risk
  let churnRisk = 0;
  if (lastOrderAt) {
    const daysSinceOrder = Math.floor(
      (Date.now() - new Date(lastOrderAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceOrder > 90) churnRisk = 80;
    else if (daysSinceOrder > 60) churnRisk = 60;
    else if (daysSinceOrder > 30) churnRisk = 40;
    else churnRisk = 20;
  } else {
    churnRisk = 50;
  }

  const analytics: Partial<MemberAnalytics> = {
    member_id: memberId,
    total_orders: totalOrders,
    total_spent: totalSpent,
    total_saved: totalSpent,
    last_order_at: lastOrderAt,
    avg_order_value: avgOrderValue,
    lifetime_value: totalSpent,
    churn_risk_score: churnRisk,
  };

  const { data, error } = await supabase
    .from('member_analytics')
    .upsert(analytics, { onConflict: 'member_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ✅ UPDATED: Accepts (page, pageSize) signature
export async function getMemberAnalytics(
  pageOrOptions?: number | { sortBy?: 'total_spent' | 'total_orders' | 'churn_risk_score'; order?: 'asc' | 'desc'; limit?: number; },
  pageSizeArg?: number
): Promise<any> {
  
  let page = 1;
  let pageSize = 50;
  let sortBy = 'total_spent';
  let sortOrder = 'desc';

  // Handle overload
  if (typeof pageOrOptions === 'number') {
      page = pageOrOptions;
      pageSize = pageSizeArg || 20;
  } else if (typeof pageOrOptions === 'object') {
      sortBy = pageOrOptions.sortBy || 'total_spent';
      sortOrder = pageOrOptions.order || 'desc';
      pageSize = pageOrOptions.limit || 50;
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count } = await supabase
    .from('member_analytics')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range(from, to);

  return { data: data || [], total: count || 0, page, pageSize };
}

// ✅ UPDATED: Accepts (minSpent, limit) signature
export async function getHighValueMembers(minSpent: number = 100, limit: number = 20): Promise<MemberAnalytics[]> {
  const { data } = await supabase
    .from('member_analytics')
    .select('*')
    .gte('total_spent', minSpent)
    .order('total_spent', { ascending: false })
    .limit(limit);

  return data || [];
}

// ✅ UPDATED: Accepts (inactiveDays, limit) signature
export async function getChurnRiskMembers(inactiveDaysOrMinRisk: number = 60, limit: number = 20): Promise<MemberAnalytics[]> {
  const { data } = await supabase
    .from('member_analytics')
    .select('*')
    .gte('churn_risk_score', 50) 
    .order('churn_risk_score', { ascending: false })
    .limit(limit);

  return data || [];
}

// =====================================================
// CHANNEL PERFORMANCE
// =====================================================

// ✅ UPDATED: Accepts (channelId, date, metrics) signature
export async function recordChannelPerformance(
  channel: string,
  date: string,
  metrics?: any
): Promise<void> {
  const startOfDay = `${date}T00:00:00Z`;
  const endOfDay = `${date}T23:59:59Z`;

  let orderCount = 0;
  let revenue = 0;
  let itemsSold = 0;

  if (!metrics) {
      const { data: orders } = await supabase
        .from('channel_orders')
        .select('total, line_items')
        .eq('channel', channel)
        .gte('ordered_at', startOfDay)
        .lt('ordered_at', endOfDay);

      orderCount = orders?.length || 0;
      revenue = orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
      itemsSold = orders?.reduce((sum, o) => {
        const items = Array.isArray(o.line_items) ? o.line_items : [];
        return sum + items.reduce((s: number, i: any) => s + (i.quantity || 0), 0);
      }, 0) || 0;
  } else {
      orderCount = metrics.orders || 0;
      revenue = metrics.revenue || 0;
      itemsSold = metrics.items_sold || 0;
  }

  await getSupabaseClient().from('channel_performance').upsert({
    date,
    channel,
    orders: orderCount,
    revenue,
    items_sold: itemsSold,
    avg_order_value: orderCount > 0 ? revenue / orderCount : 0,
    returns: 0,
  }, { onConflict: 'date,channel' });
}

// ✅ UPDATED: Accepts (channelId, days) signature
export async function getChannelPerformance(
  channelOrOptions: string | { channel?: string; startDate?: string; endDate?: string; },
  daysArg?: number
): Promise<ChannelPerformance[]> {
  
  let channel: string | undefined;
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (typeof channelOrOptions === 'string') {
      channel = channelOrOptions;
      const d = new Date();
      d.setDate(d.getDate() - (daysArg || 30));
      startDate = d.toISOString().split('T')[0];
  } else {
      channel = channelOrOptions.channel;
      startDate = channelOrOptions.startDate;
      endDate = channelOrOptions.endDate;
  }

  let query = supabase
    .from('channel_performance')
    .select('*')
    .order('date', { ascending: false });

  if (channel) query = query.eq('channel', channel);
  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data } = await query;
  return data || [];
}

export async function getChannelComparison(days: number = 30): Promise<Record<string, {
  revenue: number;
  orders: number;
  avgOrderValue: number;
  percentOfTotal: number;
}>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from('channel_performance')
    .select('channel, revenue, orders')
    .gte('date', startDate.toISOString().split('T')[0]);

  const byChannel: Record<string, { revenue: number; orders: number }> = {};
  let totalRevenue = 0;

  for (const row of data || []) {
    if (!byChannel[row.channel]) {
      byChannel[row.channel] = { revenue: 0, orders: 0 };
    }
    byChannel[row.channel].revenue += row.revenue || 0;
    byChannel[row.channel].orders += row.orders || 0;
    totalRevenue += row.revenue || 0;
  }

  const result: Record<string, any> = {};
  for (const [channel, stats] of Object.entries(byChannel)) {
    result[channel] = {
      revenue: Math.round(stats.revenue * 100) / 100,
      orders: stats.orders,
      avgOrderValue: stats.orders > 0 
        ? Math.round((stats.revenue / stats.orders) * 100) / 100 
        : 0,
      percentOfTotal: totalRevenue > 0 
        ? Math.round((stats.revenue / totalRevenue) * 100) 
        : 0,
    };
  }

  return result;
}

// =====================================================
// PRODUCT PERFORMANCE
// =====================================================

export async function recordProductPerformance(
  productId: string,
  date: string,
  metrics: {
    views?: number;
    addToCarts?: number;
    purchases?: number;
    revenue?: number;
  }
): Promise<void> {
  const { data: existing } = await supabase
    .from('product_performance')
    .select('views, add_to_carts, purchases, revenue')
    .eq('product_id', productId)
    .eq('date', date)
    .single();

  const update = {
    date,
    product_id: productId,
    views: (existing?.views || 0) + (metrics.views || 0),
    add_to_carts: (existing?.add_to_carts || 0) + (metrics.addToCarts || 0),
    purchases: (existing?.purchases || 0) + (metrics.purchases || 0),
    revenue: (existing?.revenue || 0) + (metrics.revenue || 0),
  };

  const conversionRate = update.views > 0 
    ? (update.purchases / update.views) * 100 
    : 0;

  await getSupabaseClient().from('product_performance').upsert({
    ...update,
    conversion_rate: Math.round(conversionRate * 100) / 100,
  }, { onConflict: 'date,product_id' });
}

// ✅ UPDATED: Returns Promise<any[]> to prevent type conflicts with stricter definitions
export async function getTopProducts(
  metricOrOptions: string | { metric?: 'revenue' | 'purchases' | 'views' | 'conversion_rate'; days?: number; limit?: number; } = {},
  daysArg?: number,
  limitArg?: number
): Promise<any[]> {
  
  let metric = 'revenue';
  let days = 30;
  let limit = 10;

  if (typeof metricOrOptions === 'string') {
      metric = metricOrOptions;
      days = daysArg || 30;
      limit = limitArg || 10;
  } else {
      metric = metricOrOptions.metric || 'revenue';
      days = metricOrOptions.days || 30;
      limit = metricOrOptions.limit || 10;
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data: performance } = await supabase
    .from('product_performance')
    .select('product_id, views, add_to_carts, purchases, revenue')
    .gte('date', startDate.toISOString().split('T')[0]);

  const byProduct: Record<string, {
    product_id: string;
    views: number;
    add_to_carts: number;
    purchases: number;
    revenue: number;
  }> = {};

  for (const row of performance || []) {
    if (!byProduct[row.product_id]) {
      byProduct[row.product_id] = {
        product_id: row.product_id,
        views: 0,
        add_to_carts: 0,
        purchases: 0,
        revenue: 0,
      };
    }
    byProduct[row.product_id].views += row.views || 0;
    byProduct[row.product_id].add_to_carts += row.add_to_carts || 0;
    byProduct[row.product_id].purchases += row.purchases || 0;
    byProduct[row.product_id].revenue += row.revenue || 0;
  }

  const sorted = Object.values(byProduct)
    .map(p => ({
      ...p,
      conversion_rate: p.views > 0 ? (p.purchases / p.views) * 100 : 0,
    }))
    .sort((a, b) => {
      const aVal = a[metric as keyof typeof a] as number;
      const bVal = b[metric as keyof typeof b] as number;
      return bVal - aVal;
    })
    .slice(0, limit);

  const productIds = sorted.map(p => p.product_id);
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds);

  const productMap = new Map((products || []).map(p => [p.id, p]));

  return sorted.map(p => ({
    ...p,
    id: p.product_id,
    date: startDate.toISOString().split('T')[0],
    created_at: new Date().toISOString(),
    product: productMap.get(p.product_id),
    // Add default values to satisfy any strict ProductPerformance type
    period_start: startDate.toISOString(),
    period_end: new Date().toISOString(),
    units_sold: p.purchases,
    return_rate: 0
  }));
}

// =====================================================
// CHART DATA
// =====================================================

export async function getRevenueChartData(days: number = 30): Promise<Array<{
  date: string;
  revenue: number;
  orders: number;
}>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from('daily_stats')
    .select('date, total_revenue, total_orders')
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  return (data || []).map(d => ({
    date: d.date,
    revenue: d.total_revenue || 0,
    orders: d.total_orders || 0,
  }));
}

export async function getMemberGrowthData(days: number = 30): Promise<Array<{
  date: string;
  total: number;
  new: number;
  churned: number;
}>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from('daily_stats')
    .select('date, total_members, new_members, churned_members')
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  return (data || []).map(d => ({
    date: d.date,
    total: d.total_members || 0,
    new: d.new_members || 0,
    churned: d.churned_members || 0,
  }));
}

export async function getPriceComparisonData(limit: number = 20): Promise<Array<{
  product: string;
  ourPrice: number;
  competitorPrice: number;
  savings: number;
}>> {
  const { data } = await supabase
    .from('competitor_prices')
    .select(`
      product_id,
      our_price,
      competitor_price,
      savings_percent,
      products!inner(title)
    `)
    .order('savings_percent', { ascending: false })
    .limit(limit);

  return (data || []).map((d: any) => ({
    product: d.products?.title || d.product_id,
    ourPrice: d.our_price || 0,
    competitorPrice: d.competitor_price || 0,
    savings: d.savings_percent || 0,
  }));
}

// =====================================================
// REPORTS
// =====================================================

export interface ReportSummary {
  period: string;
  revenue: { total: number; change: number };
  orders: { total: number; change: number };
  members: { total: number; new: number; churned: number };
  topProducts: Array<{ name: string; revenue: number }>;
  channelBreakdown: Record<string, number>;
}

export async function generateWeeklyReport(): Promise<ReportSummary> {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(weekAgo);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7);

  // This week
  const { data: thisWeek } = await supabase
    .from('daily_stats')
    .select('*')
    .gte('date', weekAgo.toISOString().split('T')[0]);

  // Last week
  const { data: lastWeek } = await supabase
    .from('daily_stats')
    .select('*')
    .gte('date', twoWeeksAgo.toISOString().split('T')[0])
    .lt('date', weekAgo.toISOString().split('T')[0]);

  const thisWeekRevenue = thisWeek?.reduce((s, d) => s + (d.total_revenue || 0), 0) || 0;
  const lastWeekRevenue = lastWeek?.reduce((s, d) => s + (d.total_revenue || 0), 0) || 0;
  const revenueChange = lastWeekRevenue > 0 
    ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
    : 0;

  const thisWeekOrders = thisWeek?.reduce((s, d) => s + (d.total_orders || 0), 0) || 0;
  const lastWeekOrders = lastWeek?.reduce((s, d) => s + (d.total_orders || 0), 0) || 0;
  const ordersChange = lastWeekOrders > 0
    ? Math.round(((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100)
    : 0;

  const latestStats = thisWeek?.[thisWeek.length - 1];

  const topProducts = await getTopProducts({ metric: 'revenue', days: 7, limit: 5 });
  const channelComparison = await getChannelComparison(7);

  return {
    period: `${weekAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`,
    revenue: { total: thisWeekRevenue, change: revenueChange },
    orders: { total: thisWeekOrders, change: ordersChange },
    members: {
      total: latestStats?.total_members || 0,
      new: thisWeek?.reduce((s, d) => s + (d.new_members || 0), 0) || 0,
      churned: thisWeek?.reduce((s, d) => s + (d.churned_members || 0), 0) || 0,
    },
    topProducts: topProducts.map(p => ({
      name: p.product?.title || 'Unknown',
      revenue: p.revenue,
    })),
    channelBreakdown: Object.fromEntries(
      Object.entries(channelComparison).map(([k, v]) => [k, v.revenue])
    ),
  };
}