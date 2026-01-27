import { NextRequest, NextResponse } from 'next/server';
import {
  captureDailyStats,
  getDailyStats,
  getDashboardOverview,
  updateMemberAnalytics,
  getMemberAnalytics,
  getHighValueMembers,
  getChurnRiskMembers,
  recordChannelPerformance,
  getChannelPerformance,
  getChannelComparison,
  recordProductPerformance,
  getTopProducts,
  getRevenueChartData,
  getMemberGrowthData,
  getPriceComparisonData,
  generateWeeklyReport,
} from '@/lib/analytics';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'dashboard':
      case 'overview': {
        const overview = await getDashboardOverview();
        return NextResponse.json({ data: overview });
      }

      case 'daily-stats': {
        const days = parseInt(searchParams.get('days') || '30');
        const stats = await getDailyStats(days);
        return NextResponse.json({ data: stats });
      }

      case 'member-analytics': {
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const result = await getMemberAnalytics(page, pageSize);
        return NextResponse.json(result);
      }

      case 'high-value-members': {
        const minSpend = parseFloat(searchParams.get('minSpend') || '500');
        const limit = parseInt(searchParams.get('limit') || '20');
        const members = await getHighValueMembers(minSpend, limit);
        return NextResponse.json({ data: members });
      }

      case 'churn-risk': {
        const inactiveDays = parseInt(searchParams.get('inactiveDays') || '30');
        const limit = parseInt(searchParams.get('limit') || '20');
        const members = await getChurnRiskMembers(inactiveDays, limit);
        return NextResponse.json({ data: members });
      }

      case 'channel-performance': {
        const channelId = searchParams.get('channelId');
        const days = parseInt(searchParams.get('days') || '30');
        if (!channelId) {
          return NextResponse.json({ error: 'channelId required' }, { status: 400 });
        }
        const performance = await getChannelPerformance(channelId, days);
        return NextResponse.json({ data: performance });
      }

      case 'channel-comparison': {
        const days = parseInt(searchParams.get('days') || '30');
        const comparison = await getChannelComparison(days);
        return NextResponse.json({ data: comparison });
      }

      case 'top-products': {
        const metric = searchParams.get('metric') as 'revenue' | 'purchases' | 'views' | 'conversion' || 'revenue';
        const days = parseInt(searchParams.get('days') || '30');
        const limit = parseInt(searchParams.get('limit') || '10');
        const products = await getTopProducts(metric, days, limit);
        return NextResponse.json({ data: products });
      }

      case 'revenue-chart': {
        const days = parseInt(searchParams.get('days') || '30');
        const chartData = await getRevenueChartData(days);
        return NextResponse.json({ data: chartData });
      }

      case 'member-growth': {
        const days = parseInt(searchParams.get('days') || '30');
        const chartData = await getMemberGrowthData(days);
        return NextResponse.json({ data: chartData });
      }

      case 'price-comparison': {
        const chartData = await getPriceComparisonData();
        return NextResponse.json({ data: chartData });
      }

      case 'weekly-report': {
        const report = await generateWeeklyReport();
        return NextResponse.json({ data: report });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Analytics GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'capture-daily': {
        const stats = await captureDailyStats();
        return NextResponse.json({ data: stats });
      }

      case 'update-member-analytics': {
        const { memberId, updates } = body;
        if (!memberId || !updates) {
          return NextResponse.json({ error: 'memberId and updates required' }, { status: 400 });
        }
        const analytics = await updateMemberAnalytics(memberId, updates);
        return NextResponse.json({ data: analytics });
      }

      case 'record-channel-performance': {
        const { channelId, date, metrics } = body;
        if (!channelId || !metrics) {
          return NextResponse.json({ error: 'channelId and metrics required' }, { status: 400 });
        }
        const performance = await recordChannelPerformance(channelId, date, metrics);
        return NextResponse.json({ data: performance });
      }

      case 'record-product-performance': {
        const { productId, date, metrics } = body;
        if (!productId || !metrics) {
          return NextResponse.json({ error: 'productId and metrics required' }, { status: 400 });
        }
        const performance = await recordProductPerformance(productId, date, metrics);
        return NextResponse.json({ data: performance });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Analytics POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
