import { NextRequest, NextResponse } from 'next/server';
import {
  syncProductToShopify,
  getShopifyOrders,
  createShopifyQueueJob,
  getShopifyQueueStatus,
  generateEbayExport,
  syncChannelOrders,
  getUnifiedOrders,
  getChannelListings,
  getChannelsStatus,
} from '@/lib/services/channels-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'channels-status': {
        const status = await getChannelsStatus();
        return NextResponse.json({ data: status });
      }

      case 'orders': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');
        const channel = searchParams.get('channel') || undefined;
        const status = searchParams.get('status') || undefined;
        const date_from = searchParams.get('date_from') || undefined;
        const date_to = searchParams.get('date_to') || undefined;

        const result = await getUnifiedOrders(limit, offset, {
          channel,
          status,
          date_from,
          date_to,
        });
        return NextResponse.json(result);
      }

      case 'listings': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');
        const platform = searchParams.get('platform') || undefined;
        const status = searchParams.get('status') || undefined;

        const result = await getChannelListings(limit, offset, {
          channel: platform,
          status,
        });
        return NextResponse.json(result);
      }

      case 'queue-status': {
        const jobId = searchParams.get('jobId');
        if (!jobId) {
          return NextResponse.json(
            { error: 'jobId required' },
            { status: 400 }
          );
        }
        const status = await getShopifyQueueStatus(jobId);
        return NextResponse.json({ data: status });
      }

      case 'ebay-export': {
        const productIds = searchParams.get('productIds')
          ? JSON.parse(searchParams.get('productIds')!)
          : undefined;
        const csv = await generateEbayExport(productIds);
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="ebay-export-${new Date().toISOString().split('T')[0]}.csv"`,
          },
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Channels GET error:', error);
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
      case 'sync-shopify': {
        const { productIds } = body;
        if (!productIds || !Array.isArray(productIds)) {
          return NextResponse.json(
            { error: 'productIds array required' },
            { status: 400 }
          );
        }

        const { job_id, status } = await createShopifyQueueJob(productIds);
        return NextResponse.json({
          data: { job_id, status, total: productIds.length },
        });
      }

      case 'sync-orders': {
        const result = await syncChannelOrders();
        return NextResponse.json({ data: result });
      }

      case 'export-ebay': {
        const { productIds } = body;
        const csv = await generateEbayExport(productIds);
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="ebay-export-${new Date().toISOString().split('T')[0]}.csv"`,
          },
        });
      }

      case 'sync-product-shopify': {
        const { productId, productData } = body;
        if (!productId || !productData) {
          return NextResponse.json(
            { error: 'productId and productData required' },
            { status: 400 }
          );
        }

        const result = await syncProductToShopify(productId, productData);
        return NextResponse.json({ data: result });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Channels POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
