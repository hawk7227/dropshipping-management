import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/backfill-images
// Body: { images: { "B0XXXXXXXX": "https://cdn.shopify.com/..." } }
// Fetches ALL products with null main_image, matches by asin/source_product_id
export async function POST(request: NextRequest) {
  try {
    const { images } = await request.json();
    if (!images || typeof images !== 'object') {
      return NextResponse.json({ error: 'Provide { images: { asin: url } }' }, { status: 400 });
    }

    const sb = getSupabase();
    let updated = 0;
    let errors = 0;
    let notFound = 0;
    const provided = Object.keys(images).length;

    // Fetch ALL products missing main_image (paginated)
    let allProducts: { id: string; asin: string | null; source_product_id: string | null }[] = [];
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await sb
        .from('products')
        .select('id, asin, source_product_id')
        .is('main_image', null)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) { errors++; break; }
      if (!data || data.length === 0) break;
      allProducts = allProducts.concat(data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    // Match each product against the provided image map
    for (const p of allProducts) {
      const imgUrl = (p.asin && images[p.asin]) || 
                     (p.source_product_id && images[p.source_product_id]) ||
                     null;
      if (!imgUrl) { notFound++; continue; }

      const { error: upErr } = await sb
        .from('products')
        .update({ main_image: imgUrl })
        .eq('id', p.id);

      if (upErr) errors++;
      else updated++;
    }

    return NextResponse.json({ 
      updated, errors, notFound,
      totalProvided: provided,
      totalMissing: allProducts.length,
      message: `Updated ${updated}. ${notFound} no matching ASIN. ${errors} errors.`
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/backfill-images — check status
export async function GET() {
  try {
    const sb = getSupabase();
    const { count: missing } = await sb
      .from('products')
      .select('id', { count: 'exact', head: true })
      .is('main_image', null);

    const { count: total } = await sb
      .from('products')
      .select('id', { count: 'exact', head: true });

    // Sample 5 products without images
    const { data: samples } = await sb
      .from('products')
      .select('id, title, asin, source_product_id')
      .is('main_image', null)
      .limit(5);

    return NextResponse.json({ total, missing, hasImage: (total || 0) - (missing || 0), samples });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
