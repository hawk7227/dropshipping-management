import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/backfill-images
// Body: { images: { "B0XXXXXXXX": "https://cdn.shopify.com/..." } }
// Updates products.main_image where asin matches and main_image is null
export async function POST(request: NextRequest) {
  try {
    const { images } = await request.json();
    if (!images || typeof images !== 'object') {
      return NextResponse.json({ error: 'Provide { images: { asin: url } }' }, { status: 400 });
    }

    const sb = getSupabase();
    const asins = Object.keys(images);
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const BATCH = 50;

    for (let i = 0; i < asins.length; i += BATCH) {
      const batch = asins.slice(i, i + BATCH);
      
      // Get products with these ASINs that have no image
      const { data: products, error } = await sb
        .from('products')
        .select('id, asin, main_image')
        .in('asin', batch);

      if (error) { errors += batch.length; continue; }

      for (const p of (products || [])) {
        if (p.main_image) { skipped++; continue; }
        const imgUrl = images[p.asin];
        if (!imgUrl) { skipped++; continue; }

        const { error: upErr } = await sb
          .from('products')
          .update({ main_image: imgUrl })
          .eq('id', p.id);

        if (upErr) errors++;
        else updated++;
      }
    }

    return NextResponse.json({ updated, skipped, errors, total: asins.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/backfill-images?check=true — shows how many products are missing images
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

    const { count: withImage } = await sb
      .from('products')
      .select('id', { count: 'exact', head: true })
      .not('main_image', 'is', null);

    return NextResponse.json({ total, withImage, missing });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
