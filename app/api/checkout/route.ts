/**
 * API Route: POST /api/checkout
 * Creates a checkout session for product orders
 * Members pay $0, guests pay full price
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { 
  createOrderCheckout, 
  calculatePricing, 
  validateCart,
  CartItem 
} from '@/lib/checkout-logic';

export async function POST(request: NextRequest) {
  try {
    // Get session (optional - guests can checkout too)
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    const userId = session?.user?.id || null;
    const userEmail = session?.user?.email || null;

    // Parse request body
    const body = await request.json();
    const { 
      items, 
      email, 
      shippingMethod = 'standard' 
    } = body as { 
      items: CartItem[]; 
      email?: string;
      shippingMethod?: 'standard' | 'express';
    };

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Cart is empty' },
        { status: 400 }
      );
    }

    // Determine customer email
    const customerEmail = userEmail || email;
    if (!customerEmail) {
      return NextResponse.json(
        { error: 'Email is required for checkout' },
        { status: 400 }
      );
    }

    // Validate cart items
    const validation = await validateCart(items);
    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: 'Cart validation failed',
          issues: validation.errors,
          updatedItems: validation.updatedItems,
        },
        { status: 400 }
      );
    }

    // Get base URL for redirect
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    // Create checkout session
    const checkout = await createOrderCheckout({
      items: validation.updatedItems,
      userId,
      customerEmail,
      shippingMethod,
      successUrl: `${baseUrl}/checkout/success`,
      cancelUrl: `${baseUrl}/cart?canceled=true`,
    });

    return NextResponse.json({
      sessionId: checkout.sessionId,
      url: checkout.url,
      pricing: checkout.pricing,
    });
  } catch (error) {
    console.error('[api/checkout] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/checkout/pricing
 * Calculate pricing without creating a session
 */
export async function GET(request: NextRequest) {
  try {
    // Get session (optional)
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    const userId = session?.user?.id || null;

    // Get items from query params
    const { searchParams } = new URL(request.url);
    const itemsParam = searchParams.get('items');
    const shippingMethod = (searchParams.get('shipping') || 'standard') as 'standard' | 'express';

    if (!itemsParam) {
      return NextResponse.json(
        { error: 'Items parameter required' },
        { status: 400 }
      );
    }

    let items: CartItem[];
    try {
      items = JSON.parse(itemsParam);
    } catch {
      return NextResponse.json(
        { error: 'Invalid items parameter' },
        { status: 400 }
      );
    }

    // Calculate pricing
    const pricing = await calculatePricing(items, userId, shippingMethod);

    return NextResponse.json(pricing);
  } catch (error) {
    console.error('[api/checkout/pricing] Error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate pricing' },
      { status: 500 }
    );
  }
}
