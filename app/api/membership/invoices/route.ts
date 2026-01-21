/**
 * API Route: GET /api/membership/invoices
 * Returns the user's billing history
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getCustomerInvoices } from '@/lib/stripe-products';
import { getMembershipDetails } from '@/lib/member-detection';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get membership to find Stripe customer ID
    const membership = await getMembershipDetails(userId);

    if (!membership?.stripe_customer_id) {
      // Return empty array if no membership
      return NextResponse.json([]);
    }

    // Get invoices from Stripe
    const invoices = await getCustomerInvoices(membership.stripe_customer_id, 24);

    // Format invoices for frontend
    const formattedInvoices = invoices.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      amount: invoice.amount_paid || invoice.total,
      currency: invoice.currency,
      status: invoice.status,
      created: invoice.created,
      hostedUrl: invoice.hosted_invoice_url,
      pdfUrl: invoice.invoice_pdf,
    }));

    return NextResponse.json(formattedInvoices);
  } catch (error) {
    console.error('[api/membership/invoices] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
