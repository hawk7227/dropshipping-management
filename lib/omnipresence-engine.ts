// lib/omnipresence-engine.ts
// ============================================================================
// ORGANIC OMNIPRESENCE ENGINE
// Be everywhere your customers are - WITHOUT paid ads
// ============================================================================
//
// This system creates "retargeting-like" presence across all platforms:
// - Social posting via ZAPIER WEBHOOKS (Instagram, Facebook, TikTok, Twitter)
// - Email sequences (automated touchpoints via SendGrid)
// - SMS marketing (cart abandonment, flash sales via Twilio)
// - Content scheduler (daily posts across all platforms)
// - Affiliate/Influencer management
// - Pixel tracking setup (FB, TikTok, Pinterest, Google)
//
// NOTE: All social posting uses Zapier webhooks, NOT direct Meta/TikTok APIs
// TikTok Shop and Meta Shop catalog sync are OPTIONAL future features
// ============================================================================

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// TYPES
// ============================================================================

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  images: string[];
  variants?: { id: string; title: string; price: number; sku: string }[];
  tags?: string[];
  category?: string;
}

interface SocialPost {
  id?: string;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'twitter' | 'pinterest';
  content: string;
  mediaUrls: string[];
  hashtags: string[];
  scheduledFor?: Date;
  productId?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
}

interface EmailSequence {
  id: string;
  name: string;
  trigger: 'welcome' | 'cart_abandonment' | 'post_purchase' | 'win_back' | 'browse_abandonment';
  emails: EmailStep[];
  active: boolean;
}

interface EmailStep {
  delay: number; // hours after trigger
  subject: string;
  preheader: string;
  content: string;
  includeProducts?: boolean;
}

interface Affiliate {
  id: string;
  name: string;
  email: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  followerCount: number;
  commissionRate: number; // percentage
  promoCode?: string;
  totalSales: number;
  totalCommission: number;
  status: 'pending' | 'active' | 'paused';
}

interface RetargetingPixel {
  platform: 'facebook' | 'tiktok' | 'google' | 'pinterest';
  pixelId: string;
  events: string[];
  active: boolean;
}

// ============================================================================
// ZAPIER WEBHOOK PUBLISHING (PRIMARY METHOD FOR ALL SOCIAL POSTS)
// ============================================================================

/**
 * Publish a post via Zapier webhook
 * This is the main method for posting to Instagram, Facebook, TikTok, Twitter
 */
export async function publishViaZapier(
  post: SocialPost,
  webhookUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get webhook URL from params or from saved settings
    let zapierUrl = webhookUrl;
    if (!zapierUrl) {
      const { data: settings } = await supabase
        .from('integration_settings')
        .select('zapier_webhook_url, zapier_enabled')
        .single();
      
      if (!settings?.zapier_enabled || !settings?.zapier_webhook_url) {
        return { 
          success: false, 
          error: 'Zapier webhook not configured. Please set up your Zapier integration first.' 
        };
      }
      zapierUrl = settings.zapier_webhook_url;
    }

    // Send to Zapier webhook
    const zapierResponse = await fetch(zapierUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: post.id,
        platform: post.platform,
        content: post.content,
        media_urls: post.mediaUrls || [],
        hashtags: post.hashtags || [],
        scheduled_for: post.scheduledFor,
        product_id: post.productId,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!zapierResponse.ok) {
      throw new Error(`Zapier returned ${zapierResponse.status}`);
    }

    // Log the successful webhook call
    await supabase.from('zapier_logs').insert({
      post_id: post.id,
      webhook_url: zapierUrl,
      request_payload: {
        platform: post.platform,
        content: post.content,
        media_urls: post.mediaUrls,
      },
      response_status: zapierResponse.status,
      success: true,
    });

    // Update post status
    if (post.id) {
      await supabase
        .from('social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          publish_method: 'zapier',
        })
        .eq('id', post.id);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Omnipresence] Zapier webhook error:', error);

    // Log the failed attempt
    await supabase.from('zapier_logs').insert({
      post_id: post.id,
      request_payload: {
        platform: post.platform,
        content: post.content,
      },
      success: false,
      error_message: String(error),
    });

    // Update post status to failed
    if (post.id) {
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: String(error),
        })
        .eq('id', post.id);
    }

    return { success: false, error: String(error) };
  }
}

/**
 * Publish multiple posts via Zapier (batch)
 */
export async function publishBatchViaZapier(
  posts: SocialPost[]
): Promise<{ success: number; failed: number; results: { postId?: string; success: boolean; error?: string }[] }> {
  const results = [];
  let success = 0;
  let failed = 0;

  for (const post of posts) {
    const result = await publishViaZapier(post);
    results.push({ postId: post.id, ...result });
    if (result.success) {
      success++;
    } else {
      failed++;
    }
    // Small delay between posts to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { success, failed, results };
}

// ============================================================================
// TIKTOK SHOP INTEGRATION
// ============================================================================

const TIKTOK_SHOP_API = 'https://open-api.tiktokglobalshop.com';

/**
 * Sync product to TikTok Shop
 */
export async function syncToTikTokShop(product: Product): Promise<{ success: boolean; tiktokProductId?: string }> {
  const TIKTOK_APP_KEY = process.env.TIKTOK_SHOP_APP_KEY;
  const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_SHOP_ACCESS_TOKEN;
  const TIKTOK_SHOP_ID = process.env.TIKTOK_SHOP_ID;

  if (!TIKTOK_APP_KEY || !TIKTOK_ACCESS_TOKEN) {
    console.log('TikTok Shop credentials not configured');
    return { success: false };
  }

  try {
    // Map to TikTok Shop product format
    const tiktokProduct = {
      product_name: product.title,
      description: product.description,
      category_id: await mapToTikTokCategory(product.category || ''),
      brand_id: '', // Optional
      images: product.images.map(url => ({ url })),
      skus: (product.variants || [{ id: product.id, title: 'Default', price: product.price, sku: product.id }]).map(v => ({
        outer_sku_id: v.sku,
        original_price: (v.price * 100).toString(), // TikTok uses cents
        sales_attributes: [{ attribute_name: 'Variant', value_name: v.title }],
        stock_info: { available_stock: 999 },
      })),
      package_weight: { value: '1', unit: 'POUND' },
    };

    const response = await fetch(`${TIKTOK_SHOP_API}/product/202309/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': TIKTOK_ACCESS_TOKEN,
      },
      body: JSON.stringify(tiktokProduct),
    });

    const data = await response.json();

    if (data.code === 0) {
      return { success: true, tiktokProductId: data.data.product_id };
    } else {
      console.error('TikTok Shop sync error:', data.message);
      return { success: false };
    }
  } catch (error) {
    console.error('TikTok Shop sync error:', error);
    return { success: false };
  }
}

/**
 * Map category to TikTok category ID
 */
async function mapToTikTokCategory(category: string): Promise<string> {
  const categoryMap: Record<string, string> = {
    'electronics': '601352',
    'phone accessories': '601353',
    'home': '601354',
    'kitchen': '601355',
    'beauty': '601356',
    'fashion': '601357',
    'pet': '601358',
    'fitness': '601359',
  };

  const key = Object.keys(categoryMap).find(k => category.toLowerCase().includes(k));
  return key ? categoryMap[key] : '601352'; // Default to electronics
}

/**
 * Create TikTok Shop affiliate offer
 */
export async function createTikTokAffiliateOffer(product: Product, commissionRate: number): Promise<boolean> {
  const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_SHOP_ACCESS_TOKEN;

  try {
    const response = await fetch(`${TIKTOK_SHOP_API}/affiliate/202309/open_collaborations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': TIKTOK_ACCESS_TOKEN!,
      },
      body: JSON.stringify({
        product_id: product.id,
        commission_rate: commissionRate * 100, // TikTok uses basis points
        collaboration_type: 'OPEN',
      }),
    });

    const data = await response.json();
    return data.code === 0;
  } catch (error) {
    console.error('TikTok affiliate offer error:', error);
    return false;
  }
}

// ============================================================================
// INSTAGRAM/FACEBOOK SHOP INTEGRATION
// ============================================================================

const META_GRAPH_API = 'https://graph.facebook.com/v18.0';

/**
 * Sync product to Facebook/Instagram Shop catalog
 */
export async function syncToMetaShop(product: Product): Promise<{ success: boolean; catalogItemId?: string }> {
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  const META_CATALOG_ID = process.env.META_CATALOG_ID;

  if (!META_ACCESS_TOKEN || !META_CATALOG_ID) {
    console.log('Meta Shop credentials not configured');
    return { success: false };
  }

  try {
    const catalogItem = {
      retailer_id: product.id,
      name: product.title,
      description: product.description,
      availability: 'in stock',
      condition: 'new',
      price: `${product.price} USD`,
      sale_price: product.compareAtPrice ? `${product.price} USD` : undefined,
      sale_price_start_date: product.compareAtPrice ? new Date().toISOString() : undefined,
      sale_price_end_date: product.compareAtPrice ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      link: `https://${process.env.SHOPIFY_SHOP_DOMAIN}/products/${product.id}`,
      image_link: product.images[0],
      brand: 'Your Brand',
      google_product_category: product.category,
    };

    const response = await fetch(
      `${META_GRAPH_API}/${META_CATALOG_ID}/products?access_token=${META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catalogItem),
      }
    );

    const data = await response.json();

    if (data.id) {
      return { success: true, catalogItemId: data.id };
    } else {
      console.error('Meta Shop sync error:', data.error);
      return { success: false };
    }
  } catch (error) {
    console.error('Meta Shop sync error:', error);
    return { success: false };
  }
}

/**
 * Create Instagram shoppable post
 */
export async function createShoppablePost(
  content: string,
  imageUrl: string,
  productTags: { productId: string; x: number; y: number }[]
): Promise<{ success: boolean; postId?: string }> {
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  const INSTAGRAM_BUSINESS_ID = process.env.INSTAGRAM_BUSINESS_ID;

  if (!META_ACCESS_TOKEN || !INSTAGRAM_BUSINESS_ID) {
    return { success: false };
  }

  try {
    // Step 1: Create media container with product tags
    const containerResponse = await fetch(
      `${META_GRAPH_API}/${INSTAGRAM_BUSINESS_ID}/media?access_token=${META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: content,
          product_tags: productTags.map(tag => ({
            product_id: tag.productId,
            x: tag.x,
            y: tag.y,
          })),
        }),
      }
    );

    const containerData = await containerResponse.json();

    if (!containerData.id) {
      return { success: false };
    }

    // Step 2: Publish the container
    const publishResponse = await fetch(
      `${META_GRAPH_API}/${INSTAGRAM_BUSINESS_ID}/media_publish?access_token=${META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerData.id }),
      }
    );

    const publishData = await publishResponse.json();

    return { success: true, postId: publishData.id };
  } catch (error) {
    console.error('Instagram shoppable post error:', error);
    return { success: false };
  }
}

// ============================================================================
// EMAIL SEQUENCE AUTOMATION
// ============================================================================

/**
 * Pre-built email sequences that convert
 */
export const EMAIL_SEQUENCES: Record<string, EmailSequence> = {
  welcome: {
    id: 'welcome',
    name: 'Welcome Series',
    trigger: 'welcome',
    active: true,
    emails: [
      {
        delay: 0, // Immediate
        subject: 'Welcome to {{brand}}! Here\'s 10% off your first order',
        preheader: 'Your exclusive discount code inside',
        content: `
Hi {{first_name}},

Welcome to the {{brand}} family! 🎉

We're so excited to have you here. As a thank you for joining, here's an exclusive discount just for you:

**Use code WELCOME10 for 10% off your first order**

Here's what you can expect from us:
- Exclusive deals and early access to new products
- Helpful tips and product guides
- Members-only flash sales

Ready to start shopping?

[SHOP NOW →]

See you soon!
The {{brand}} Team
        `,
        includeProducts: true,
      },
      {
        delay: 24, // 1 day later
        subject: 'Did you see something you liked?',
        preheader: 'Your favorites are waiting',
        content: `
Hi {{first_name}},

We noticed you were checking out some of our best sellers! 

Here are some customer favorites you might love:

[FEATURED PRODUCTS]

Remember, your WELCOME10 code is still active!

[SHOP NOW →]
        `,
        includeProducts: true,
      },
      {
        delay: 72, // 3 days later
        subject: 'Last chance: Your 10% off expires soon ⏰',
        preheader: 'Don\'t miss out on your welcome discount',
        content: `
Hi {{first_name}},

Just a heads up - your welcome discount (WELCOME10) expires in 24 hours!

Don't miss out on 10% off your first order.

[CLAIM YOUR DISCOUNT →]

Questions? Just reply to this email - we're here to help!
        `,
        includeProducts: false,
      },
    ],
  },

  cart_abandonment: {
    id: 'cart_abandonment',
    name: 'Abandoned Cart Recovery',
    trigger: 'cart_abandonment',
    active: true,
    emails: [
      {
        delay: 1, // 1 hour
        subject: 'You left something behind...',
        preheader: 'Your cart is waiting for you',
        content: `
Hi {{first_name}},

Looks like you left some items in your cart!

[CART ITEMS]

No worries - we saved everything for you.

[COMPLETE YOUR ORDER →]

Need help? Just reply to this email!
        `,
        includeProducts: true,
      },
      {
        delay: 24, // 1 day
        subject: 'Your cart is about to expire',
        preheader: 'We can only hold these items for so long',
        content: `
Hi {{first_name}},

Your cart items are still waiting, but we can't hold them forever!

[CART ITEMS]

These items are selling fast - complete your order before they're gone.

[CHECKOUT NOW →]
        `,
        includeProducts: true,
      },
      {
        delay: 72, // 3 days
        subject: 'Final reminder + FREE shipping on your cart',
        preheader: 'We added a little something extra',
        content: `
Hi {{first_name}},

We really want you to have these items, so we're offering FREE shipping on your cart!

[CART ITEMS]

Use code: FREESHIP at checkout

[GET FREE SHIPPING →]

This offer expires in 24 hours!
        `,
        includeProducts: true,
      },
    ],
  },

  post_purchase: {
    id: 'post_purchase',
    name: 'Post-Purchase Follow-up',
    trigger: 'post_purchase',
    active: true,
    emails: [
      {
        delay: 24, // 1 day after delivery
        subject: 'How\'s your new {{product_name}}?',
        preheader: 'We\'d love to hear from you',
        content: `
Hi {{first_name}},

Your order should have arrived by now! 📦

We hope you're loving your new {{product_name}}!

If you have a moment, we'd really appreciate a quick review. It helps other shoppers and helps us improve!

[LEAVE A REVIEW →]

Have any questions? We're here to help!
        `,
        includeProducts: false,
      },
      {
        delay: 168, // 7 days
        subject: 'You might also love these...',
        preheader: 'Personalized picks just for you',
        content: `
Hi {{first_name}},

Based on your recent purchase, we think you'll love these:

[RECOMMENDED PRODUCTS]

As a thank you for being a customer, use code THANKS15 for 15% off!

[SHOP NOW →]
        `,
        includeProducts: true,
      },
      {
        delay: 720, // 30 days
        subject: 'Time to restock?',
        preheader: 'Don\'t run out of your favorites',
        content: `
Hi {{first_name}},

It's been about a month since your last order. Time to restock?

[PREVIOUS ORDER ITEMS]

[REORDER NOW →]
        `,
        includeProducts: true,
      },
    ],
  },

  browse_abandonment: {
    id: 'browse_abandonment',
    name: 'Browse Abandonment',
    trigger: 'browse_abandonment',
    active: true,
    emails: [
      {
        delay: 2, // 2 hours after browsing
        subject: 'Still thinking about {{product_name}}?',
        preheader: 'Here\'s some more info',
        content: `
Hi {{first_name}},

We noticed you were checking out {{product_name}}!

Here's what other customers are saying:

⭐⭐⭐⭐⭐ "Absolutely love it!"
⭐⭐⭐⭐⭐ "Best purchase I've made!"

[VIEW {{product_name}} →]

Have questions? Just reply!
        `,
        includeProducts: true,
      },
    ],
  },

  win_back: {
    id: 'win_back',
    name: 'Win-Back Campaign',
    trigger: 'win_back',
    active: true,
    emails: [
      {
        delay: 0, // Triggered when customer hasn't ordered in 60 days
        subject: 'We miss you, {{first_name}}!',
        preheader: 'Come back for 20% off everything',
        content: `
Hi {{first_name}},

It's been a while since we've seen you, and we miss you! 

To welcome you back, here's an exclusive offer:

**20% OFF your entire order with code MISSYOU20**

Check out what's new since your last visit:

[NEW ARRIVALS]

[SHOP NOW →]

This code is just for you and expires in 7 days.

Hope to see you soon!
        `,
        includeProducts: true,
      },
    ],
  },
};

/**
 * Generate personalized email content using AI
 */
export async function generateEmailContent(
  template: EmailStep,
  customer: { firstName: string; email: string },
  product?: Product,
  brand: string = 'Your Store'
): Promise<{ subject: string; content: string }> {
  const variables: Record<string, string> = {
    '{{first_name}}': customer.firstName || 'there',
    '{{brand}}': brand,
    '{{product_name}}': product?.title || 'your item',
  };

  let subject = template.subject;
  let content = template.content;

  for (const [key, value] of Object.entries(variables)) {
    subject = subject.replace(new RegExp(key, 'g'), value);
    content = content.replace(new RegExp(key, 'g'), value);
  }

  return { subject, content };
}

// ============================================================================
// SMS MARKETING
// ============================================================================

/**
 * SMS message templates
 */
export const SMS_TEMPLATES = {
  cart_abandonment: {
    delay: 30, // 30 minutes
    message: 'Hey {{first_name}}! You left items in your cart. Complete your order now and get free shipping: {{cart_url}}',
  },
  flash_sale: {
    message: '🔥 FLASH SALE! {{discount}}% off everything for the next {{hours}} hours. Shop now: {{url}}',
  },
  back_in_stock: {
    message: '{{product_name}} is BACK in stock! Grab yours before it sells out again: {{url}}',
  },
  order_shipped: {
    message: 'Great news! Your order #{{order_number}} has shipped. Track it here: {{tracking_url}}',
  },
  review_request: {
    delay: 168, // 7 days after delivery
    message: 'Hi {{first_name}}! How are you liking your {{product_name}}? Leave a review: {{review_url}}',
  },
};

// ============================================================================
// AI CONTENT GENERATION FOR SOCIAL POSTS
// ============================================================================

/**
 * Generate platform-optimized social media content
 */
export async function generateSocialContent(
  product: Product,
  platform: 'instagram' | 'facebook' | 'tiktok' | 'twitter' | 'pinterest'
): Promise<SocialPost> {
  const platformConfig = {
    instagram: {
      maxLength: 2200,
      hashtagCount: 20,
      style: 'visual, lifestyle-focused, uses emojis, engaging captions',
    },
    facebook: {
      maxLength: 63206,
      hashtagCount: 3,
      style: 'informative, community-focused, can be longer',
    },
    tiktok: {
      maxLength: 2200,
      hashtagCount: 5,
      style: 'trendy, casual, uses trending sounds/references, short and punchy',
    },
    twitter: {
      maxLength: 280,
      hashtagCount: 2,
      style: 'concise, witty, conversational',
    },
    pinterest: {
      maxLength: 500,
      hashtagCount: 5,
      style: 'descriptive, keyword-rich, inspirational',
    },
  };

  const config = platformConfig[platform];

  const prompt = `Create a ${platform} post for this product:

PRODUCT: ${product.title}
DESCRIPTION: ${product.description}
PRICE: $${product.price}
${product.compareAtPrice ? `COMPARE AT: $${product.compareAtPrice} (${Math.round((1 - product.price / product.compareAtPrice) * 100)}% off!)` : ''}

PLATFORM REQUIREMENTS:
- Max length: ${config.maxLength} characters
- Hashtags: ${config.hashtagCount} relevant hashtags
- Style: ${config.style}

RULES:
1. Make it feel authentic, not salesy
2. Include a clear call-to-action
3. Highlight the value/savings
4. Create FOMO without being pushy
5. ${platform === 'tiktok' ? 'Reference current trends if applicable' : ''}

Return JSON:
{
  "content": "the post content without hashtags",
  "hashtags": ["hashtag1", "hashtag2", ...],
  "callToAction": "the CTA phrase used"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    return {
      platform,
      content: result.content || '',
      hashtags: result.hashtags || [],
      mediaUrls: product.images,
      productId: product.id,
      status: 'draft',
    };
  } catch (error) {
    console.error('Content generation error:', error);
    return {
      platform,
      content: `Check out ${product.title}! Now only $${product.price}`,
      hashtags: ['sale', 'newproduct'],
      mediaUrls: product.images,
      productId: product.id,
      status: 'draft',
    };
  }
}

/**
 * Generate a week's worth of content for all platforms
 */
export async function generateWeeklyContentCalendar(products: Product[]): Promise<{
  monday: SocialPost[];
  tuesday: SocialPost[];
  wednesday: SocialPost[];
  thursday: SocialPost[];
  friday: SocialPost[];
  saturday: SocialPost[];
  sunday: SocialPost[];
}> {
  const platforms: ('instagram' | 'facebook' | 'tiktok')[] = ['instagram', 'facebook', 'tiktok'];
  const calendar: Record<string, SocialPost[]> = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };

  const days = Object.keys(calendar);
  let productIndex = 0;

  for (const day of days) {
    for (const platform of platforms) {
      const product = products[productIndex % products.length];
      const post = await generateSocialContent(product, platform);
      calendar[day].push(post);
      productIndex++;
    }
  }

  return calendar as any;
}

// ============================================================================
// AFFILIATE/INFLUENCER MANAGEMENT
// ============================================================================

/**
 * Create affiliate link with tracking
 */
export function createAffiliateLink(baseUrl: string, affiliateId: string, productId?: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('ref', affiliateId);
  if (productId) {
    url.searchParams.set('product', productId);
  }
  return url.toString();
}

/**
 * Generate unique promo code for affiliate
 */
export function generateAffiliatePromoCode(affiliateName: string): string {
  const cleanName = affiliateName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 10);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${cleanName}${random}`;
}

/**
 * Calculate affiliate commission
 */
export function calculateCommission(orderTotal: number, commissionRate: number): number {
  return Math.round(orderTotal * (commissionRate / 100) * 100) / 100;
}

// ============================================================================
// RETARGETING PIXEL EVENTS
// ============================================================================

/**
 * Pixel event types to track
 */
export const PIXEL_EVENTS = {
  PAGE_VIEW: 'PageView',
  VIEW_CONTENT: 'ViewContent',
  ADD_TO_CART: 'AddToCart',
  INITIATE_CHECKOUT: 'InitiateCheckout',
  PURCHASE: 'Purchase',
  SEARCH: 'Search',
  ADD_TO_WISHLIST: 'AddToWishlist',
  COMPLETE_REGISTRATION: 'CompleteRegistration',
};

/**
 * Generate pixel code for Shopify theme
 */
export function generatePixelCode(pixels: RetargetingPixel[]): string {
  let code = '';

  for (const pixel of pixels) {
    if (!pixel.active) continue;

    switch (pixel.platform) {
      case 'facebook':
        code += `
<!-- Facebook Pixel -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixel.pixelId}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${pixel.pixelId}&ev=PageView&noscript=1"/></noscript>
`;
        break;

      case 'tiktok':
        code += `
<!-- TikTok Pixel -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
  ttq.load('${pixel.pixelId}');
  ttq.page();
}(window, document, 'ttq');
</script>
`;
        break;

      case 'pinterest':
        code += `
<!-- Pinterest Tag -->
<script>
!function(e){if(!window.pintrk){window.pintrk = function () {
window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var
n=window.pintrk;n.queue=[],n.version="3.0";var
t=document.createElement("script");t.async=!0,t.src=e;var
r=document.getElementsByTagName("script")[0];
r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
pintrk('load', '${pixel.pixelId}');
pintrk('page');
</script>
<noscript>
<img height="1" width="1" style="display:none;" alt=""
src="https://ct.pinterest.com/v3/?event=init&tid=${pixel.pixelId}&noscript=1" />
</noscript>
`;
        break;
    }
  }

  return code;
}

// ============================================================================
// SHOPIFY SHOP APP OPTIMIZATION
// ============================================================================

/**
 * Generate Shop app update post
 */
export function generateShopAppUpdate(type: 'new_product' | 'sale' | 'back_in_stock' | 'update', product?: Product): {
  title: string;
  body: string;
  mediaUrl?: string;
} {
  const templates = {
    new_product: {
      title: `New Arrival: ${product?.title || 'New Product'}`,
      body: `Just dropped! ${product?.title} is now available. Be one of the first to get it!`,
    },
    sale: {
      title: `Sale Alert! ${product?.title || 'Flash Sale'}`,
      body: product?.compareAtPrice
        ? `${product.title} is now ${Math.round((1 - product.price / product.compareAtPrice) * 100)}% off! Was $${product.compareAtPrice}, now $${product.price}`
        : 'Flash sale happening now! Don\'t miss out.',
    },
    back_in_stock: {
      title: `Back in Stock: ${product?.title || 'Popular Item'}`,
      body: `${product?.title} sold out fast last time. It's back - grab yours before it's gone again!`,
    },
    update: {
      title: 'Store Update',
      body: 'Check out what\'s new in our store!',
    },
  };

  const template = templates[type];
  return {
    ...template,
    mediaUrl: product?.images[0],
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  // ZAPIER PUBLISHING (PRIMARY METHOD)
  publishViaZapier,
  publishBatchViaZapier,

  // TikTok Shop (OPTIONAL - for product catalog sync only)
  syncToTikTokShop,
  createTikTokAffiliateOffer,

  // Meta Shop (OPTIONAL - for product catalog sync only)
  syncToMetaShop,
  createShoppablePost,

  // Email
  EMAIL_SEQUENCES,
  generateEmailContent,

  // SMS
  SMS_TEMPLATES,

  // Social Content Generation
  generateSocialContent,
  generateWeeklyContentCalendar,

  // Affiliates
  createAffiliateLink,
  generateAffiliatePromoCode,
  calculateCommission,

  // Pixels
  PIXEL_EVENTS,
  generatePixelCode,

  // Shop App
  generateShopAppUpdate,
};
