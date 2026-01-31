// lib/services/dashboard-service.ts
// Dashboard data service for fetching real-time metrics from Supabase

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface DashboardStats {
  totalProducts: number;
  activeProducts: number;
  profitMargin: number;
  productsBelowMargin: number;
  pendingSync: number;
  priceAlerts: number;
}

export interface DiscoveryStats {
  date: string;
  productsDiscovered: number;
  productsAnalyzed: number;
  highPotentialCount: number;
  avgScore: number;
  status: string;
}

export interface DemandDistribution {
  High: number;
  Medium: number;
  Low: number;
}

export interface RevenueData {
  date: string;
  revenue: number;
  orders: number;
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
}

export interface ProfitTrend {
  date: string;
  avgProfit: number;
  avgMargin: number;
}

/**
 * Get core dashboard statistics
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Total Products
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    // Active Products
    const { count: activeProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Calculate Average Profit Margin
    const { data: profitData } = await supabase
      .from('products')
      .select('retail_price, cost_price')
      .not('retail_price', 'is', null)
      .not('cost_price', 'is', null)
      .gt('retail_price', 0);

    let profitMargin = 0;
    if (profitData && profitData.length > 0) {
      const margins = profitData.map(p => 
        ((p.retail_price - p.cost_price) / p.retail_price) * 100
      );
      profitMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
    }

    // Products Below 30% Margin
    const { count: productsBelowMargin } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .not('profit_percent', 'is', null)
      .lt('profit_percent', 30);

    // Pending Sync (from shopify_queue)
    const { count: pendingSync } = await supabase
      .from('shopify_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Price Alerts (unacknowledged)
    const { count: priceAlerts } = await supabase
      .from('margin_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('acknowledged', false);

    return {
      totalProducts: totalProducts || 0,
      activeProducts: activeProducts || 0,
      profitMargin: Math.round(profitMargin * 10) / 10,
      productsBelowMargin: productsBelowMargin || 0,
      pendingSync: pendingSync || 0,
      priceAlerts: priceAlerts || 0,
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
}

/**
 * Get today's discovery run statistics
 */
export async function getDiscoveryStats(): Promise<DiscoveryStats | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('discovery_runs')
      .select('*')
      .eq('date', today)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      date: data.date,
      productsDiscovered: data.products_discovered || 0,
      productsAnalyzed: data.products_analyzed || 0,
      highPotentialCount: data.high_potential_count || 0,
      avgScore: data.avg_score || 0,
      status: data.status,
    };
  } catch (error) {
    console.error('Error fetching discovery stats:', error);
    return null;
  }
}

/**
 * Get demand distribution (High/Medium/Low)
 */
export async function getDemandDistribution(): Promise<DemandDistribution> {
  try {
    const { data, error } = await supabase
      .from('product_demand')
      .select('demand_tier');

    if (error || !data) {
      return { High: 0, Medium: 0, Low: 0 };
    }

    const distribution = data.reduce((acc, item) => {
      acc[item.demand_tier as keyof DemandDistribution] = 
        (acc[item.demand_tier as keyof DemandDistribution] || 0) + 1;
      return acc;
    }, { High: 0, Medium: 0, Low: 0 } as DemandDistribution);

    return distribution;
  } catch (error) {
    console.error('Error fetching demand distribution:', error);
    return { High: 0, Medium: 0, Low: 0 };
  }
}

/**
 * Get revenue data for the last N days
 */
export async function getRevenueData(days: number = 30): Promise<RevenueData[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('orders')
      .select('ordered_at, total')
      .gte('ordered_at', startDateStr)
      .order('ordered_at', { ascending: true });

    if (error || !data) {
      return [];
    }

    // Group by date
    const revenueByDate = data.reduce((acc, order) => {
      const date = order.ordered_at.split('T')[0];
      if (!acc[date]) {
        acc[date] = { revenue: 0, orders: 0 };
      }
      acc[date].revenue += order.total || 0;
      acc[date].orders += 1;
      return acc;
    }, {} as Record<string, { revenue: number; orders: number }>);

    return Object.entries(revenueByDate).map(([date, data]) => ({
      date,
      revenue: Math.round(data.revenue * 100) / 100,
      orders: data.orders,
    }));
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    return [];
  }
}

/**
 * Get category breakdown
 */
export async function getCategoryBreakdown(): Promise<CategoryBreakdown[]> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('category')
      .not('category', 'is', null);

    if (error || !data) {
      return [];
    }

    const total = data.length;
    const categoryCounts = data.reduce((acc, item) => {
      const category = item.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(categoryCounts)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / total) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 categories
  } catch (error) {
    console.error('Error fetching category breakdown:', error);
    return [];
  }
}

/**
 * Get profit trend over time
 */
export async function getProfitTrend(days: number = 30): Promise<ProfitTrend[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString();

    const { data, error } = await supabase
      .from('price_history')
      .select('recorded_at, profit_amount, profit_percent')
      .gte('recorded_at', startDateStr)
      .order('recorded_at', { ascending: true });

    if (error || !data || data.length === 0) {
      // Fallback to current products data
      const { data: currentData } = await supabase
        .from('products')
        .select('profit_percent, created_at')
        .not('profit_percent', 'is', null)
        .gte('created_at', startDateStr);

      if (!currentData || currentData.length === 0) {
        return [];
      }

      // Group by date
      const profitByDate = currentData.reduce((acc, item) => {
        const date = item.created_at.split('T')[0];
        if (!acc[date]) {
          acc[date] = { sum: 0, count: 0 };
        }
        acc[date].sum += item.profit_percent || 0;
        acc[date].count += 1;
        return acc;
      }, {} as Record<string, { sum: number; count: number }>);

      return Object.entries(profitByDate).map(([date, data]) => ({
        date,
        avgProfit: 0, // Not available without price history
        avgMargin: Math.round((data.sum / data.count) * 10) / 10,
      }));
    }

    // Group by date
    const profitByDate = data.reduce((acc, item) => {
      const date = item.recorded_at.split('T')[0];
      if (!acc[date]) {
        acc[date] = { profitSum: 0, marginSum: 0, count: 0 };
      }
      acc[date].profitSum += item.profit_amount || 0;
      acc[date].marginSum += item.profit_percent || 0;
      acc[date].count += 1;
      return acc;
    }, {} as Record<string, { profitSum: number; marginSum: number; count: number }>);

    return Object.entries(profitByDate).map(([date, data]) => ({
      date,
      avgProfit: Math.round((data.profitSum / data.count) * 100) / 100,
      avgMargin: Math.round((data.marginSum / data.count) * 10) / 10,
    }));
  } catch (error) {
    console.error('Error fetching profit trend:', error);
    return [];
  }
}

/**
 * Get orders today count
 */
export async function getOrdersToday(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('ordered_at', `${today}T00:00:00Z`)
      .lt('ordered_at', `${today}T23:59:59Z`);

    return count || 0;
  } catch (error) {
    console.error('Error fetching orders today:', error);
    return 0;
  }
}

/**
 * Get total revenue today
 */
export async function getRevenueToday(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data } = await supabase
      .from('orders')
      .select('total')
      .gte('ordered_at', `${today}T00:00:00Z`)
      .lt('ordered_at', `${today}T23:59:59Z`);

    if (!data || data.length === 0) {
      return 0;
    }

    const total = data.reduce((sum, order) => sum + (order.total || 0), 0);
    return Math.round(total * 100) / 100;
  } catch (error) {
    console.error('Error fetching revenue today:', error);
    return 0;
  }
}

/**
 * Get all margin alerts
 */
export async function getMarginAlerts(limit: number = 50) {
  try {
    const { data, error } = await supabase
      .from('margin_alerts')
      .select('*, products(title, asin)')
      .eq('acknowledged', false)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching margin alerts:', error);
    return [];
  }
}

/**
 * Acknowledge a margin alert
 */
export async function acknowledgeAlert(alertId: string, acknowledgedBy: string) {
  try {
    const { error } = await supabase
      .from('margin_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return { success: false, error };
  }
}
