import { NextRequest, NextResponse } from 'next/server';
import {
  getChannels,
  updateChannel,
  getChannelStatus,
  createEbayListing,
  getEbayOrders,
  createTikTokListing,
  getTikTokOrders,
  generateGoogleFeed,
  submitToGoogleMerchant,
  syncAllChannelOrders,
  getChannelOrders,
  updateOrderFulfillment,
  getChannelListings,
  syncListingInventory,
} from '@/lib/multichannel';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'channels': {
        const channels = await getChannels();
        return NextResponse.json({ data: channels });
      }

      case 'channel-status': {
        const channelId = searchParams.get('channelId');
        if (!channelId) {
          return NextResponse.json({ error: 'channelId required' }, { status: 400 });
        }
        const status = await getChannelStatus(channelId);
        return NextResponse.json({ data: status });
      }

      case 'orders': {
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const channelId = searchParams.get('channelId') || undefined;
        const status = searchParams.get('status') || undefined;
        const result = await getChannelOrders(page, pageSize, channelId, status);
        return NextResponse.json(result);
      }

      case 'listings': {
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const channelId = searchParams.get('channelId') || undefined;
        const status = searchParams.get('status') as 'active' | 'inactive' | 'pending' | 'error' | undefined;
        const result = await getChannelListings(page, pageSize, channelId, status);
        return NextResponse.json(result);
      }

      case 'ebay-orders': {
        const daysBack = parseInt(searchParams.get('daysBack') || '7');
        const orders = await getEbayOrders(daysBack);
        return NextResponse.json({ data: orders });
      }

      case 'tiktok-orders': {
        const daysBack = parseInt(searchParams.get('daysBack') || '7');
        const orders = await getTikTokOrders(daysBack);
        return NextResponse.json({ data: orders });
      }

      case 'google-feed': {
        const feed = await generateGoogleFeed();
        return new NextResponse(feed, {
          headers: {
            'Content-Type': 'application/xml',
            'Content-Disposition': 'attachment; filename="google-shopping-feed.xml"',
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
      case 'update-channel': {
        const { channelId, updates } = body;
        if (!channelId || !updates) {
          return NextResponse.json({ error: 'channelId and updates required' }, { status: 400 });
        }
        const updated = await updateChannel(channelId, updates);
        return NextResponse.json({ data: updated });
      }

      case 'create-ebay-listing': {
        const { productId, listingConfig } = body;
        if (!productId) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 });
        }
        const listing = await createEbayListing(productId, listingConfig);
        return NextResponse.json({ data: listing });
      }

      case 'create-tiktok-listing': {
        const { productId, listingConfig } = body;
        if (!productId) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 });
        }
        const listing = await createTikTokListing(productId, listingConfig);
        return NextResponse.json({ data: listing });
      }

      case 'submit-google-feed': {
        const result = await submitToGoogleMerchant();
        return NextResponse.json({ data: result });
      }

      case 'sync-orders': {
        const result = await syncAllChannelOrders();
        return NextResponse.json({ data: result });
      }

      case 'update-fulfillment': {
        const { orderId, fulfillment } = body;
        if (!orderId || !fulfillment) {
          return NextResponse.json({ error: 'orderId and fulfillment required' }, { status: 400 });
        }
        const updated = await updateOrderFulfillment(orderId, fulfillment);
        return NextResponse.json({ data: updated });
      }

      case 'sync-inventory': {
        const { productId, channelId } = body;
        if (!productId) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 });
        }
        const result = await syncListingInventory(productId, channelId);
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
