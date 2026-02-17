// lib/behavioral-segmentation.ts
// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIORAL AUDIENCE SEGMENTATION — Spec Item 47
// Analyzes customer behavior to create retargeting audience segments
// ═══════════════════════════════════════════════════════════════════════════
// Segments:
//   - High-Value Customers (top 20% by LTV)
//   - Cart Abandoners (added to cart, no purchase in 7 days)
//   - Category Enthusiasts (3+ views in same category)
//   - Price-Sensitive Shoppers (only buy during sales/lowest prices)
//   - New Visitors (first visit, no purchase)
//   - Repeat Buyers (2+ orders)
//   - Win-Back (no order in 60+ days)
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SegmentType =
  | 'high_value'
  | 'cart_abandoner'
  | 'category_enthusiast'
  | 'price_sensitive'
  | 'new_visitor'
  | 'repeat_buyer'
  | 'win_back';

export interface AudienceSegment {
  segment_type: SegmentType;
  label: string;
  description: string;
  customer_count: number;
  avg_ltv: number;
  recommended_action: string;
  pixel_audience_name: string;
}

export interface CustomerSegmentAssignment {
  customer_email: string;
  segments: SegmentType[];
  ltv: number;
  order_count: number;
  last_order_date: string | null;
  top_category: string | null;
}

interface SegmentationResult {
  segments: AudienceSegment[];
  assignments: number;
  errors: string[];
  duration_ms: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const SEGMENT_CONFIG: Record<SegmentType, { label: string; description: string; action: string; pixel: string }> = {
  high_value: {
    label: 'High-Value Customers',
    description: 'Top 20% by lifetime value',
    action: 'Upsell premium products, early access offers',
    pixel: 'high_value_customers',
  },
  cart_abandoner: {
    label: 'Cart Abandoners',
    description: 'Added to cart but no purchase in 7+ days',
    action: 'Retarget with discount code, free shipping reminder',
    pixel: 'cart_abandoners',
  },
  category_enthusiast: {
    label: 'Category Enthusiasts',
    description: 'Purchased 3+ products in same category',
    action: 'Cross-sell related products, new arrival alerts',
    pixel: 'category_enthusiasts',
  },
  price_sensitive: {
    label: 'Price-Sensitive Shoppers',
    description: 'Only orders on discounted products or lowest-price items',
    action: 'Flash sale alerts, price drop notifications',
    pixel: 'price_sensitive',
  },
  new_visitor: {
    label: 'New Visitors',
    description: 'First-time visitors with no purchase',
    action: 'Welcome discount, trust-building content',
    pixel: 'new_visitors',
  },
  repeat_buyer: {
    label: 'Repeat Buyers',
    description: '2+ orders placed',
    action: 'Loyalty rewards, referral programs',
    pixel: 'repeat_buyers',
  },
  win_back: {
    label: 'Win-Back',
    description: 'No order in 60+ days',
    action: 'Re-engagement campaign, "we miss you" offer',
    pixel: 'win_back',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENTATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export async function runSegmentation(): Promise<SegmentationResult> {
  const startTime = Date.now();
  const result: SegmentationResult = { segments: [], assignments: 0, errors: [], duration_ms: 0 };

  try {
    // Fetch order data
    const { data: orders, error: orderErr } = await getSupabaseClient()
      .from('unified_orders')
      .select('customer_email, total_price, line_item_count, financial_status, created_at')
      .not('customer_email', 'is', null)
      .eq('financial_status', 'paid');

    if (orderErr) {
      result.errors.push(`Orders fetch: ${orderErr.message}`);
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    if (!orders || orders.length === 0) {
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    // Aggregate by customer
    const customerMap = new Map<string, {
      email: string;
      totalSpent: number;
      orderCount: number;
      lastOrder: string;
      orders: typeof orders;
    }>();

    for (const order of orders) {
      const email = order.customer_email.toLowerCase();
      const existing = customerMap.get(email);
      if (existing) {
        existing.totalSpent += parseFloat(order.total_price) || 0;
        existing.orderCount++;
        if (order.created_at > existing.lastOrder) existing.lastOrder = order.created_at;
        existing.orders.push(order);
      } else {
        customerMap.set(email, {
          email,
          totalSpent: parseFloat(order.total_price) || 0,
          orderCount: 1,
          lastOrder: order.created_at,
          orders: [order],
        });
      }
    }

    const customers = Array.from(customerMap.values());
    const now = Date.now();
    const segmentCounts: Record<SegmentType, number> = {
      high_value: 0, cart_abandoner: 0, category_enthusiast: 0,
      price_sensitive: 0, new_visitor: 0, repeat_buyer: 0, win_back: 0,
    };
    const segmentLTVs: Record<SegmentType, number[]> = {
      high_value: [], cart_abandoner: [], category_enthusiast: [],
      price_sensitive: [], new_visitor: [], repeat_buyer: [], win_back: [],
    };

    // Calculate LTV percentile thresholds
    const ltvValues = customers.map(c => c.totalSpent).sort((a, b) => b - a);
    const highValueThreshold = ltvValues[Math.floor(ltvValues.length * 0.2)] || 100;

    // Assign segments
    const assignments: Array<{
      customer_email: string;
      segment_type: SegmentType;
      ltv: number;
      order_count: number;
      assigned_at: string;
    }> = [];

    for (const customer of customers) {
      const daysSinceOrder = (now - new Date(customer.lastOrder).getTime()) / (24 * 60 * 60 * 1000);
      const customerSegments: SegmentType[] = [];

      // High-Value
      if (customer.totalSpent >= highValueThreshold) {
        customerSegments.push('high_value');
      }

      // Repeat Buyer
      if (customer.orderCount >= 2) {
        customerSegments.push('repeat_buyer');
      }

      // Win-Back
      if (daysSinceOrder > 60) {
        customerSegments.push('win_back');
      }

      // Price-Sensitive (avg order value < $20)
      const avgOrderValue = customer.totalSpent / customer.orderCount;
      if (avgOrderValue < 20 && customer.orderCount >= 2) {
        customerSegments.push('price_sensitive');
      }

      // Store assignments
      for (const seg of customerSegments) {
        segmentCounts[seg]++;
        segmentLTVs[seg].push(customer.totalSpent);
        assignments.push({
          customer_email: customer.email,
          segment_type: seg,
          ltv: customer.totalSpent,
          order_count: customer.orderCount,
          assigned_at: new Date().toISOString(),
        });
      }
    }

    // Build segment summaries
    for (const [segType, config] of Object.entries(SEGMENT_CONFIG)) {
      const type = segType as SegmentType;
      const ltvs = segmentLTVs[type];
      const avgLtv = ltvs.length > 0 ? ltvs.reduce((s, v) => s + v, 0) / ltvs.length : 0;

      result.segments.push({
        segment_type: type,
        label: config.label,
        description: config.description,
        customer_count: segmentCounts[type],
        avg_ltv: Math.round(avgLtv * 100) / 100,
        recommended_action: config.action,
        pixel_audience_name: config.pixel,
      });
    }

    // Store assignments in Supabase
    if (assignments.length > 0) {
      // Clear old assignments
      await getSupabaseClient().from('audience_segments').delete().gte('assigned_at', '2000-01-01');

      // Batch insert in chunks of 100
      for (let i = 0; i < assignments.length; i += 100) {
        const batch = assignments.slice(i, i + 100);
        const { error: insertErr } = await getSupabaseClient().from('audience_segments').insert(batch);
        if (insertErr) {
          result.errors.push(`Insert batch ${i}: ${insertErr.message}`);
        }
      }
      result.assignments = assignments.length;
    }

  } catch (err) {
    result.errors.push(`Segmentation: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  result.duration_ms = Date.now() - startTime;
  console.log(`[Segmentation] ${result.assignments} assignments across ${result.segments.filter(s => s.customer_count > 0).length} segments (${result.duration_ms}ms)`);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET SEGMENTS (for dashboard)
// ═══════════════════════════════════════════════════════════════════════════

export async function getSegmentSummary(): Promise<AudienceSegment[]> {
  // Return cached segment counts
  const segments: AudienceSegment[] = [];

  for (const [segType, config] of Object.entries(SEGMENT_CONFIG)) {
    const { count } = await getSupabaseClient()
      .from('audience_segments')
      .select('*', { count: 'exact', head: true })
      .eq('segment_type', segType);

    const { data: ltvData } = await getSupabaseClient()
      .from('audience_segments')
      .select('ltv')
      .eq('segment_type', segType);

    const avgLtv = ltvData && ltvData.length > 0
      ? ltvData.reduce((s, r) => s + (r.ltv || 0), 0) / ltvData.length
      : 0;

    segments.push({
      segment_type: segType as SegmentType,
      label: config.label,
      description: config.description,
      customer_count: count || 0,
      avg_ltv: Math.round(avgLtv * 100) / 100,
      recommended_action: config.action,
      pixel_audience_name: config.pixel,
    });
  }

  return segments;
}

export default { runSegmentation, getSegmentSummary };
