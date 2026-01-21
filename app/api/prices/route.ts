// app/api/prices/route.ts
// Price intelligence API - competitor tracking, margin rules, sync jobs, price history

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchAmazonProduct,
  searchAmazonProducts,
  upsertCompetitorPrice,
  getCompetitorPrices,
  getStaleProducts,
  recordPriceHistory,
  getPriceHistory,
  createSyncJob,
  updateSyncJob,
  getLatestSyncJob,
  getMarginRules,
  calculateProductMargin,
  syncProductPrices,
  getPriceStats,
} from '@/lib/price-sync';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/prices
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'list';

    switch (action) {
      case 'list': {
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '50');
        const source = searchParams.get('source') || undefined;
        const staleOnly = searchParams.get('staleOnly') === 'true';

        let query = supabase
          .from('competitor_prices')
          .select(`
            *,
            products!inner(id, title, handle, images, status)
          `, { count: 'exact' });

        if (source) {
          query = query.eq('source', source);
        }

        if (staleOnly) {
          const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          query = query.lt('fetched_at', cutoff);
        }

        const { data, count, error } = await query
          .order('fetched_at', { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1);

        if (error) throw error;

        return NextResponse.json({
          success: true,
          data: data || [],
          pagination: {
            page,
            pageSize,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / pageSize),
          },
        });
      }

      case 'get': {
        const productId = searchParams.get('productId');
        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const prices = await getCompetitorPrices(productId);
        return NextResponse.json({ success: true, data: prices });
      }

      case 'history': {
        const productId = searchParams.get('productId');
        const days = parseInt(searchParams.get('days') || '30');

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const history = await getPriceHistory(productId, days);
        return NextResponse.json({ success: true, data: history });
      }

      case 'stale': {
        const hours = parseInt(searchParams.get('hours') || '24');
        const limit = parseInt(searchParams.get('limit') || '100');

        const products = await getStaleProducts(hours, limit);
        return NextResponse.json({ success: true, data: products });
      }

      case 'stats': {
        const stats = await getPriceStats();
        return NextResponse.json({ success: true, data: stats });
      }

      case 'margin-rules': {
        const rules = await getMarginRules();
        return NextResponse.json({ success: true, data: rules });
      }

      case 'calculate-margin': {
        const productId = searchParams.get('productId');
        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const margin = await calculateProductMargin(productId);
        return NextResponse.json({ success: true, data: margin });
      }

      case 'sync-jobs': {
        const limit = parseInt(searchParams.get('limit') || '10');

        const { data } = await supabase
          .from('price_sync_jobs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(limit);

        return NextResponse.json({ success: true, data: data || [] });
      }

      case 'latest-sync':
      case 'sync-status': {
        const job = await getLatestSyncJob();
        return NextResponse.json({ success: true, data: job });
      }

      case 'search-amazon': {
        const query = searchParams.get('query');
        const category = searchParams.get('category') || undefined;

        if (!query) {
          return NextResponse.json(
            { success: false, error: 'Search query required' },
            { status: 400 }
          );
        }

        const results = await searchAmazonProducts(query, category);
        return NextResponse.json({ success: true, data: results });
      }

      case 'fetch-amazon': {
        const asin = searchParams.get('asin');
        if (!asin) {
          return NextResponse.json(
            { success: false, error: 'ASIN required' },
            { status: 400 }
          );
        }

        const product = await fetchAmazonProduct(asin);
        return NextResponse.json({ success: true, data: product });
      }

      case 'comparison': {
        const limit = parseInt(searchParams.get('limit') || '20');
        const sortBy = searchParams.get('sortBy') || 'savings_percent';
        const order = searchParams.get('order') || 'desc';

        const { data } = await supabase
          .from('competitor_prices')
          .select(`
            *,
            products!inner(id, title, handle, images, status, vendor)
          `)
          .order(sortBy, { ascending: order === 'asc' })
          .limit(limit);

        return NextResponse.json({ success: true, data: data || [] });
      }

      case 'sources': {
        const { data } = await supabase
          .from('competitor_prices')
          .select('source')
          .order('source');

        const sources = [...new Set((data || []).map(p => p.source).filter(Boolean))];
        return NextResponse.json({ success: true, data: sources });
      }

      // ==================
      // ALERTS ENDPOINTS
      // ==================
      
      case 'alerts': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const acknowledged = searchParams.get('acknowledged');
        
        let query = supabase
          .from('price_alerts')
          .select(`
            *,
            products(id, title, handle)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (acknowledged === 'true') {
          query = query.eq('acknowledged', true);
        } else if (acknowledged === 'false') {
          query = query.eq('acknowledged', false);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        const alerts = (data || []).map(alert => ({
          ...alert,
          product_title: alert.products?.title || 'Unknown Product',
        }));
        
        return NextResponse.json({ success: true, data: alerts });
      }

      case 'monitoring-rules': {
        const { data, error } = await supabase
          .from('monitoring_rules')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return NextResponse.json({ success: true, data: data || [] });
      }

      // ==================
      // AVAILABILITY ENDPOINTS
      // ==================
      
      case 'availability': {
        const status = searchParams.get('status'); // in_stock, low_stock, out_of_stock
        const limit = parseInt(searchParams.get('limit') || '50');
        
        let query = supabase
          .from('competitor_prices')
          .select(`
            *,
            products!inner(id, title, handle, images, status)
          `)
          .order('last_checked', { ascending: false })
          .limit(limit);
        
        if (status) {
          query = query.eq('availability_status', status);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        return NextResponse.json({ success: true, data: data || [] });
      }

      case 'availability-changes': {
        const hours = parseInt(searchParams.get('hours') || '24');
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        
        const { data, error } = await supabase
          .from('price_alerts')
          .select(`
            *,
            products(id, title, handle)
          `)
          .in('alert_type', ['back_in_stock', 'out_of_stock', 'low_stock'])
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return NextResponse.json({ success: true, data: data || [] });
      }

      case 'prices': {
        // Alias for list with availability data
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '50');
        const availability = searchParams.get('availability');
        const priceChange = searchParams.get('priceChange');
        
        let query = supabase
          .from('competitor_prices')
          .select(`
            *,
            products!inner(id, title, handle, images, status)
          `, { count: 'exact' })
          .order('last_checked', { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1);
        
        if (availability && availability !== 'all') {
          query = query.eq('availability_status', availability);
        }
        
        if (priceChange === 'drop') {
          query = query.lt('price_change_percent', 0);
        } else if (priceChange === 'increase') {
          query = query.gt('price_change_percent', 0);
        } else if (priceChange === 'changed') {
          query = query.not('price_change_percent', 'is', null);
        }
        
        const { data, count, error } = await query;
        if (error) throw error;
        
        const prices = (data || []).map(item => ({
          id: item.id,
          product_id: item.product_id,
          product_title: item.products?.title || 'Unknown',
          source: item.source,
          source_url: item.source_url,
          competitor_price: item.competitor_price,
          our_price: item.our_price,
          savings_percent: item.savings_percent || 0,
          last_checked: item.last_checked,
          availability_status: item.availability_status || 'unknown',
          stock_quantity: item.stock_quantity,
          previous_price: item.previous_price,
          price_changed: item.price_change_percent !== null && item.price_change_percent !== 0,
          price_change_percent: Math.abs(item.price_change_percent || 0),
          price_change_direction: item.price_change_percent < 0 ? 'down' : item.price_change_percent > 0 ? 'up' : 'none',
          availability_changed: item.availability_changed,
          previous_availability: item.previous_availability,
        }));
        
        return NextResponse.json({
          success: true,
          data: prices,
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Prices API] GET error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/prices
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'upsert';
    const body = await request.json();

    switch (action) {
      case 'upsert': {
        const {
          productId,
          source,
          competitorPrice,
          competitorUrl,
          asin,
          ourPrice,
        } = body;

        if (!productId || !source || competitorPrice === undefined) {
          return NextResponse.json(
            { success: false, error: 'Product ID, source, and competitor price required' },
            { status: 400 }
          );
        }

        const result = await upsertCompetitorPrice({
          product_id: productId,
          source,
          competitor_price: competitorPrice,
          competitor_url: competitorUrl,
          asin,
          our_price: ourPrice,
        });

        return NextResponse.json({ success: true, data: result });
      }

      case 'sync-product': {
        const { productId, asin } = body;

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        // Fetch from Amazon if ASIN provided
        if (asin) {
          const amazonProduct = await fetchAmazonProduct(asin);

          if (amazonProduct && amazonProduct.price) {
            // Get our price
            const { data: product } = await supabase
              .from('products')
              .select('id, variants:product_variants(price)')
              .eq('id', productId)
              .single();

            const ourPrice = product?.variants?.[0]?.price || 0;

            const result = await upsertCompetitorPrice({
              product_id: productId,
              source: 'amazon',
              competitor_price: amazonProduct.price,
              competitor_url: amazonProduct.url,
              asin,
              our_price: parseFloat(ourPrice),
            });

            // Record history
            await recordPriceHistory(productId, 'amazon', amazonProduct.price);

            return NextResponse.json({
              success: true,
              data: {
                price: result,
                amazonProduct,
              },
            });
          }
        }

        return NextResponse.json({
          success: false,
          error: 'Could not fetch price from Amazon',
        });
      }

      case 'sync-all': {
        const { productIds, batchSize = 10 } = body;

        // Create sync job
        const job = await createSyncJob(productIds?.length || 0);

        try {
          const result = await syncProductPrices(productIds, batchSize);

         await updateSyncJob(job.id, {
          status: 'completed',
          processed: result.synced,        // Changed from products_synced
          errors: result.errors.length,    // Changed from products_failed
          completed_at: new Date().toISOString(),
        });

          return NextResponse.json({
            success: true,
            data: {
              jobId: job.id,
              synced: result.synced,
              failed: result.errors.length,
              errors: result.errors.slice(0, 10),
            },
          });
        } catch (error) {
          await updateSyncJob(job.id, {
            status: 'failed',
            errors: 1,
            completed_at: new Date().toISOString(),
          });
          throw error;
        }
      }

      case 'link-asin': {
        const { productId, asin } = body;

        if (!productId || !asin) {
          return NextResponse.json(
            { success: false, error: 'Product ID and ASIN required' },
            { status: 400 }
          );
        }

        // Verify ASIN exists on Amazon
        const amazonProduct = await fetchAmazonProduct(asin);
        if (!amazonProduct) {
          return NextResponse.json(
            { success: false, error: 'ASIN not found on Amazon' },
            { status: 404 }
          );
        }

        // Update or create competitor price entry
        const { data: product } = await supabase
          .from('products')
          .select('id, variants:product_variants(price)')
          .eq('id', productId)
          .single();

        const ourPrice = product?.variants?.[0]?.price || 0;

        const result = await upsertCompetitorPrice({
          product_id: productId,
          source: 'amazon',
          competitor_price: amazonProduct.price || 0,
          competitor_url: amazonProduct.url,
          asin,
          our_price: parseFloat(ourPrice),
        });

        return NextResponse.json({
          success: true,
          data: {
            linked: result,
            amazonProduct,
          },
        });
      }

      case 'create-margin-rule': {
        const { name, minMargin, maxMargin, category, vendor, priority } = body;

        if (!name || minMargin === undefined) {
          return NextResponse.json(
            { success: false, error: 'Name and minimum margin required' },
            { status: 400 }
          );
        }

        const { data, error } = await supabase
          .from('margin_rules')
          .insert({
            name,
            min_margin: minMargin,
            max_margin: maxMargin,
            category,
            vendor,
            priority: priority || 0,
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      case 'bulk-link': {
        const { links } = body;

        if (!Array.isArray(links) || links.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Links array required' },
            { status: 400 }
          );
        }

        const results: { productId: string; success: boolean; error?: string }[] = [];

        for (const link of links) {
          try {
            const amazonProduct = await fetchAmazonProduct(link.asin);

            if (amazonProduct && amazonProduct.price) {
              await upsertCompetitorPrice({
                product_id: link.productId,
                source: 'amazon',
                competitor_price: amazonProduct.price,
                competitor_url: amazonProduct.url,
                asin: link.asin,
                our_price: link.ourPrice || 0,
              });

              results.push({ productId: link.productId, success: true });
            } else {
              results.push({
                productId: link.productId,
                success: false,
                error: 'ASIN not found or no price',
              });
            }

            // Rate limit
            await new Promise(r => setTimeout(r, 1100));
          } catch (error) {
            results.push({
              productId: link.productId,
              success: false,
              error: String(error),
            });
          }
        }

        const successful = results.filter(r => r.success).length;

        return NextResponse.json({
          success: true,
          data: {
            results,
            summary: {
              total: links.length,
              successful,
              failed: links.length - successful,
            },
          },
        });
      }

      case 'record-history': {
        const { productId, source, price } = body;

        if (!productId || !source || price === undefined) {
          return NextResponse.json(
            { success: false, error: 'Product ID, source, and price required' },
            { status: 400 }
          );
        }

        await recordPriceHistory(productId, source, price);

        return NextResponse.json({
          success: true,
          message: 'Price history recorded',
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Prices API] POST error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/prices
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'update-rule';
    const body = await request.json();

    switch (action) {
      case 'update-rule': {
        const { id, name, minMargin, maxMargin, category, vendor, priority, isActive } = body;

        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Rule ID required' },
            { status: 400 }
          );
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name;
        if (minMargin !== undefined) updates.min_margin = minMargin;
        if (maxMargin !== undefined) updates.max_margin = maxMargin;
        if (category !== undefined) updates.category = category;
        if (vendor !== undefined) updates.vendor = vendor;
        if (priority !== undefined) updates.priority = priority;
        if (isActive !== undefined) updates.is_active = isActive;

        const { data, error } = await supabase
          .from('margin_rules')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      case 'update-price': {
        const { productId, source, competitorPrice, ourPrice } = body;

        if (!productId || !source) {
          return NextResponse.json(
            { success: false, error: 'Product ID and source required' },
            { status: 400 }
          );
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (competitorPrice !== undefined) {
          updates.competitor_price = competitorPrice;
          updates.fetched_at = new Date().toISOString();
        }
        if (ourPrice !== undefined) updates.our_price = ourPrice;

        // Recalculate savings
        if (competitorPrice !== undefined || ourPrice !== undefined) {
          const { data: existing } = await supabase
            .from('competitor_prices')
            .select('competitor_price, our_price')
            .eq('product_id', productId)
            .eq('source', source)
            .single();

          const comp = competitorPrice ?? existing?.competitor_price ?? 0;
          const our = ourPrice ?? existing?.our_price ?? 0;

          if (comp > 0) {
            updates.savings_amount = comp - our;
            updates.savings_percent = ((comp - our) / comp) * 100;
          }
        }

        const { data, error } = await supabase
          .from('competitor_prices')
          .update(updates)
          .eq('product_id', productId)
          .eq('source', source)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Prices API] PUT error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/prices
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'unlink';

    switch (action) {
      case 'unlink': {
        const productId = searchParams.get('productId');
        const source = searchParams.get('source');

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        let query = supabase
          .from('competitor_prices')
          .delete()
          .eq('product_id', productId);

        if (source) {
          query = query.eq('source', source);
        }

        const { error } = await query;
        if (error) throw error;

        return NextResponse.json({
          success: true,
          message: 'Price tracking removed',
        });
      }

      case 'delete-rule': {
        const ruleId = searchParams.get('id');

        if (!ruleId) {
          return NextResponse.json(
            { success: false, error: 'Rule ID required' },
            { status: 400 }
          );
        }

        const { error } = await supabase
          .from('margin_rules')
          .delete()
          .eq('id', ruleId);

        if (error) throw error;

        return NextResponse.json({
          success: true,
          message: 'Margin rule deleted',
        });
      }

      case 'clear-history': {
        const productId = searchParams.get('productId');
        const olderThanDays = parseInt(searchParams.get('olderThanDays') || '90');

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - olderThanDays);

        let query = supabase
          .from('price_history')
          .delete()
          .lt('recorded_at', cutoff.toISOString());

        if (productId) {
          query = query.eq('product_id', productId);
        }

        const { error } = await query;
        if (error) throw error;

        return NextResponse.json({
          success: true,
          message: `Cleared price history older than ${olderThanDays} days`,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Prices API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
