// app/api/cron/omnipresence/route.ts
// ============================================================================
// ORGANIC OMNIPRESENCE AUTOMATION
// Daily automation to maintain presence across all channels
// Schedule: "0 6 * * *" (6 AM daily)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateSocialContent,
  generateWeeklyContentCalendar,
  EMAIL_SEQUENCES,
  generateEmailContent,
  syncToTikTokShop,
  syncToMetaShop,
  publishViaZapier,
} from '@/lib/omnipresence-engine';

export const runtime = 'nodejs';
export const maxDuration = 300;

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

// ============================================================================
// SHOPIFY DATA
// ============================================================================

async function getShopifyProducts(limit: number = 50): Promise<any[]> {
  const response = await fetch(
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products.json?limit=${limit}&status=active`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } }
  );
  const data = await response.json();
  return data.products || [];
}

async function getRecentOrders(hours: number = 24): Promise<any[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const response = await fetch(
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders.json?created_at_min=${since}&status=any`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } }
  );
  const data = await response.json();
  return data.orders || [];
}

async function getAbandonedCheckouts(): Promise<any[]> {
  const response = await fetch(
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/checkouts.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } }
  );
  const data = await response.json();
  return (data.checkouts || []).filter((c: any) => !c.completed_at);
}

// ============================================================================
// AUTOMATION TASKS
// ============================================================================

/**
 * Task 1: Generate and schedule social content for today
 */
async function generateDailySocialContent(products: any[]): Promise<number> {
  const platforms: ('instagram' | 'facebook' | 'tiktok')[] = ['instagram', 'facebook', 'tiktok'];
  let postsCreated = 0;

  // Pick 3 random products for today's posts
  const shuffled = [...products].sort(() => Math.random() - 0.5);
  const todaysProducts = shuffled.slice(0, 3);

  for (let i = 0; i < todaysProducts.length; i++) {
    const product = todaysProducts[i];
    const platform = platforms[i % platforms.length];

    try {
      const post = await generateSocialContent(
        {
          id: product.id.toString(),
          title: product.title,
          description: product.body_html || '',
          price: parseFloat(product.variants[0]?.price || '0'),
          compareAtPrice: parseFloat(product.variants[0]?.compare_at_price || '0') || undefined,
          images: product.images?.map((img: any) => img.src) || [],
          category: product.product_type,
        },
        platform
      );

      // Schedule for optimal posting time
      const scheduledTime = getOptimalPostingTime(platform);

      // Save to database
      await getSupabaseClient().from('social_posts').insert({
        platform: post.platform,
        content: post.content + '\n\n' + post.hashtags.map((h: string) => `#${h}`).join(' '),
        media_urls: post.mediaUrls,
        hashtags: post.hashtags,
        product_id: product.id.toString(),
        status: 'scheduled',
        scheduled_for: scheduledTime.toISOString(),
      });

      postsCreated++;
      console.log(`📱 Created ${platform} post for: ${product.title}`);

    } catch (error) {
      console.error(`Failed to create post for ${product.title}:`, error);
    }
  }

  return postsCreated;
}

/**
 * Task 1.5: Publish scheduled posts via Zapier
 * This finds posts where scheduled_for has passed and publishes them
 */
async function publishScheduledPosts(): Promise<number> {
  const now = new Date().toISOString();
  
  // Find posts that are scheduled and ready to publish
  const { data: readyPosts, error } = await getSupabaseClient()
    .from('social_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .limit(10); // Process max 10 at a time
  
  if (error || !readyPosts || readyPosts.length === 0) {
    return 0;
  }

  let published = 0;

  for (const post of readyPosts) {
    try {
      const result = await publishViaZapier({
        id: post.id,
        platform: post.platform,
        content: post.content,
        mediaUrls: post.media_urls || [],
        hashtags: post.hashtags || [],
        productId: post.product_id,
        status: 'scheduled',
      });

      if (result.success) {
        published++;
        console.log(`✅ Published ${post.platform} post via Zapier: ${post.id}`);
      } else {
        console.error(`❌ Failed to publish ${post.id}: ${result.error}`);
      }
    } catch (error) {
      console.error(`Failed to publish post ${post.id}:`, error);
    }
  }

  return published;
}

/**
 * Get optimal posting time by platform
 */
function getOptimalPostingTime(platform: string): Date {
  const now = new Date();
  const times: Record<string, number[]> = {
    instagram: [11, 13, 19], // 11am, 1pm, 7pm
    facebook: [9, 13, 16],   // 9am, 1pm, 4pm
    tiktok: [19, 21, 23],    // 7pm, 9pm, 11pm
  };

  const platformTimes = times[platform] || [12];
  const randomHour = platformTimes[Math.floor(Math.random() * platformTimes.length)];

  const scheduledTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), randomHour, 0, 0);
  
  // If time has passed today, schedule for tomorrow
  if (scheduledTime < now) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }

  return scheduledTime;
}

/**
 * Task 2: Send abandoned cart emails
 */
async function processAbandonedCarts(): Promise<number> {
  const abandonedCheckouts = await getAbandonedCheckouts();
  let emailsSent = 0;

  const sequence = EMAIL_SEQUENCES.cart_abandonment;
  const firstEmail = sequence.emails[0];

  for (const checkout of abandonedCheckouts) {
    // Skip if no email or already contacted
    if (!checkout.email) continue;

    // Check if we've already emailed this checkout
    const { data: existing } = await getSupabaseClient()
      .from('email_logs')
      .select('id')
      .eq('recipient_email', checkout.email)
      .eq('sequence_id', 'cart_abandonment')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Check time since abandonment
    const abandonedAt = new Date(checkout.created_at);
    const hoursSince = (Date.now() - abandonedAt.getTime()) / (1000 * 60 * 60);

    // Only send first email if abandoned 1+ hour ago
    if (hoursSince < 1) continue;

    try {
      // Generate personalized email
      const { subject, content } = await generateEmailContent(
        firstEmail,
        { firstName: checkout.billing_address?.first_name || 'there', email: checkout.email },
        undefined,
        'Your Store'
      );

      // Log the email (actual sending would integrate with SendGrid/Klaviyo)
      await getSupabaseClient().from('email_logs').insert({
        sequence_id: 'cart_abandonment',
        recipient_email: checkout.email,
        subject,
        status: 'pending',
      });

      emailsSent++;
      console.log(`📧 Queued cart abandonment email for: ${checkout.email}`);

    } catch (error) {
      console.error(`Failed to process cart for ${checkout.email}:`, error);
    }
  }

  return emailsSent;
}

/**
 * Task 3: Send post-purchase follow-ups
 */
async function processPostPurchase(): Promise<number> {
  const recentOrders = await getRecentOrders(48); // Last 48 hours
  let emailsSent = 0;

  for (const order of recentOrders) {
    if (!order.email) continue;

    // Check if order was fulfilled (delivered)
    if (order.fulfillment_status !== 'fulfilled') continue;

    // Check if we've already sent follow-up
    const { data: existing } = await getSupabaseClient()
      .from('email_logs')
      .select('id')
      .eq('recipient_email', order.email)
      .eq('sequence_id', 'post_purchase')
      .limit(1);

    if (existing && existing.length > 0) continue;

    try {
      const firstProduct = order.line_items?.[0];
      const sequence = EMAIL_SEQUENCES.post_purchase;
      const firstEmail = sequence.emails[0];

      const { subject, content } = await generateEmailContent(
        firstEmail,
        { firstName: order.customer?.first_name || 'there', email: order.email },
        firstProduct ? { id: firstProduct.product_id, title: firstProduct.title } as any : undefined,
        'Your Store'
      );

      await getSupabaseClient().from('email_logs').insert({
        sequence_id: 'post_purchase',
        recipient_email: order.email,
        subject,
        status: 'pending',
      });

      emailsSent++;
      console.log(`📧 Queued post-purchase email for: ${order.email}`);

    } catch (error) {
      console.error(`Failed to process order ${order.id}:`, error);
    }
  }

  return emailsSent;
}

/**
 * Task 4: Sync new products to TikTok Shop and Meta
 */
async function syncNewProducts(products: any[]): Promise<{ tiktok: number; meta: number }> {
  let tiktokSynced = 0;
  let metaSynced = 0;

  // Get products created in last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const newProducts = products.filter(p => new Date(p.created_at) > oneDayAgo);

  for (const shopifyProduct of newProducts) {
    const product = {
      id: shopifyProduct.id.toString(),
      title: shopifyProduct.title,
      description: shopifyProduct.body_html || '',
      price: parseFloat(shopifyProduct.variants[0]?.price || '0'),
      images: shopifyProduct.images?.map((img: any) => img.src) || [],
      variants: shopifyProduct.variants?.map((v: any) => ({
        id: v.id.toString(),
        title: v.title,
        price: parseFloat(v.price),
        sku: v.sku,
      })),
      category: shopifyProduct.product_type,
    };

    // Sync to TikTok Shop
    try {
      const tiktokResult = await syncToTikTokShop(product);
      if (tiktokResult.success) {
        tiktokSynced++;
        console.log(`🎵 Synced to TikTok Shop: ${product.title}`);
      }
    } catch (error) {
      console.error(`TikTok sync failed for ${product.title}:`, error);
    }

    // Sync to Meta (Instagram/Facebook) Shop
    try {
      const metaResult = await syncToMetaShop(product);
      if (metaResult.success) {
        metaSynced++;
        console.log(`📷 Synced to Meta Shop: ${product.title}`);
      }
    } catch (error) {
      console.error(`Meta sync failed for ${product.title}:`, error);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  return { tiktok: tiktokSynced, meta: metaSynced };
}

/**
 * Task 5: Update affiliate tracking
 */
async function updateAffiliateStats(): Promise<number> {
  // Get orders with affiliate codes from last 24 hours
  const orders = await getRecentOrders(24);
  let affiliateSales = 0;

  for (const order of orders) {
    const discountCodes = order.discount_codes || [];
    
    for (const discount of discountCodes) {
      // Check if this is an affiliate code
      const { data: affiliate } = await getSupabaseClient()
        .from('affiliates')
        .select('*')
        .eq('promo_code', discount.code.toUpperCase())
        .single();

      if (affiliate) {
        const orderTotal = parseFloat(order.total_price);
        const commission = orderTotal * (affiliate.commission_rate / 100);

        // Record the sale
        await getSupabaseClient().from('affiliate_sales').insert({
          affiliate_id: affiliate.id,
          order_id: order.id.toString(),
          order_total: orderTotal,
          commission_amount: commission,
          commission_status: 'pending',
        });

        // Update affiliate totals
        await getSupabaseClient()
          .from('affiliates')
          .update({
            total_sales: affiliate.total_sales + orderTotal,
            total_commission: affiliate.total_commission + commission,
          })
          .eq('id', affiliate.id);

        affiliateSales++;
        console.log(`💰 Recorded affiliate sale: ${discount.code} - $${commission.toFixed(2)} commission`);
      }
    }
  }

  return affiliateSales;
}

// ============================================================================
// CRON HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('🌐 Starting Omnipresence Automation...');

  const results = {
    success: true,
    socialPosts: 0,
    postsPublished: 0,
    abandonedCartEmails: 0,
    postPurchaseEmails: 0,
    tiktokSynced: 0,
    metaSynced: 0,
    affiliateSales: 0,
    errors: [] as string[],
    duration: 0,
  };

  try {
    // Get products
    const products = await getShopifyProducts(100);
    console.log(`Loaded ${products.length} products`);

    // Task 1: Generate social content
    console.log('\n📱 Task 1: Generating social content...');
    results.socialPosts = await generateDailySocialContent(products);

    // Task 1.5: Publish scheduled posts via Zapier
    console.log('\n🚀 Task 1.5: Publishing scheduled posts via Zapier...');
    results.postsPublished = await publishScheduledPosts();

    // Task 2: Process abandoned carts
    console.log('\n🛒 Task 2: Processing abandoned carts...');
    results.abandonedCartEmails = await processAbandonedCarts();

    // Task 3: Post-purchase follow-ups
    console.log('\n📦 Task 3: Processing post-purchase follow-ups...');
    results.postPurchaseEmails = await processPostPurchase();

    // Task 4: Sync new products to shops
    console.log('\n🔄 Task 4: Syncing new products to TikTok/Meta...');
    const syncResults = await syncNewProducts(products);
    results.tiktokSynced = syncResults.tiktok;
    results.metaSynced = syncResults.meta;

    // Task 5: Update affiliate stats
    console.log('\n💰 Task 5: Updating affiliate stats...');
    results.affiliateSales = await updateAffiliateStats();

  } catch (error: any) {
    results.errors.push(error.message);
    console.error('Omnipresence automation error:', error);
  }

  results.duration = Math.round((Date.now() - startTime) / 1000);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🌐 OMNIPRESENCE AUTOMATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📱 Social posts created: ${results.socialPosts}`);
  console.log(`🚀 Posts published via Zapier: ${results.postsPublished}`);
  console.log(`📧 Abandoned cart emails: ${results.abandonedCartEmails}`);
  console.log(`📦 Post-purchase emails: ${results.postPurchaseEmails}`);
  console.log(`🎵 TikTok products synced: ${results.tiktokSynced}`);
  console.log(`📷 Meta products synced: ${results.metaSynced}`);
  console.log(`💰 Affiliate sales recorded: ${results.affiliateSales}`);
  console.log(`⏱️ Duration: ${results.duration}s`);
  console.log('═══════════════════════════════════════════════════════');

  return NextResponse.json(results);
}

// ============================================================================
// MANUAL TRIGGER
// ============================================================================

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { task } = body;

  const products = await getShopifyProducts(50);

  switch (task) {
    case 'social':
      const posts = await generateDailySocialContent(products);
      return NextResponse.json({ success: true, postsCreated: posts });

    case 'publish':
      const published = await publishScheduledPosts();
      return NextResponse.json({ success: true, postsPublished: published });

    case 'abandoned-carts':
      const cartEmails = await processAbandonedCarts();
      return NextResponse.json({ success: true, emailsQueued: cartEmails });

    case 'post-purchase':
      const purchaseEmails = await processPostPurchase();
      return NextResponse.json({ success: true, emailsQueued: purchaseEmails });

    case 'sync-shops':
      const sync = await syncNewProducts(products);
      return NextResponse.json({ success: true, synced: sync });

    case 'affiliates':
      const sales = await updateAffiliateStats();
      return NextResponse.json({ success: true, salesRecorded: sales });

    default:
      return NextResponse.json({ error: 'Invalid task. Use: social, publish, abandoned-carts, post-purchase, sync-shops, affiliates' }, { status: 400 });
  }
}
