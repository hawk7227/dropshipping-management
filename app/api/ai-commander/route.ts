// app/api/ai-commander/route.ts
// AI FULL CONTROL - Execute any store operation from natural language
// Usage: POST /api/ai-commander { "prompt": "your command", "dryRun": true/false }

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { 
  updateShopifyProducts, 
  createShopifyProduct, 
  updateMetafields,
  getShopifyProducts 
} from '@/lib/shopify-admin';
import { syncToGoogleMerchant, optimizeGoogleFeed } from '@/lib/google-merchant';
import { postToSocial, schedulePost } from '@/lib/social-marketing';
import { fetchCompetitorPrices } from '@/lib/rainforest';
import { sendEmailCampaign, sendSMS } from '@/lib/messaging';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// All available actions the AI can execute
const AVAILABLE_ACTIONS = {
  // === SHOPIFY OPERATIONS ===
  'update_product': {
    description: 'Update product title, description, price, images, tags, or metafields',
    params: ['product_id', 'updates'],
    example: { product_id: '123', updates: { title: 'New Title', price: '29.99' } }
  },
  'create_product': {
    description: 'Create new product with full details',
    params: ['title', 'description', 'price', 'images', 'variants', 'metafields'],
    example: { title: 'Product', description: '...', price: '19.99' }
  },
  'bulk_update_prices': {
    description: 'Update prices for multiple products based on rules',
    params: ['rule', 'products', 'percentage'],
    example: { rule: 'competitor_minus', percentage: 15, products: 'all' }
  },
  'update_metafields': {
    description: 'Update competitor prices, social proof, or custom metafields',
    params: ['product_id', 'namespace', 'key', 'value'],
    example: { product_id: '123', namespace: 'compare_prices', key: 'amazon_price', value: '45.99' }
  },
  'sync_inventory': {
    description: 'Sync inventory levels from supplier or set levels',
    params: ['source', 'products'],
    example: { source: 'supplier_api', products: 'all' }
  },
  
  // === GOOGLE OPERATIONS ===
  'sync_google_merchant': {
    description: 'Push products to Google Merchant Center feed',
    params: ['products', 'optimize'],
    example: { products: 'all', optimize: true }
  },
  'optimize_google_listings': {
    description: 'AI-optimize product titles and descriptions for Google SEO',
    params: ['products', 'focus'],
    example: { products: 'underperforming', focus: 'click_rate' }
  },
  'update_google_feed_attributes': {
    description: 'Update specific feed attributes like custom labels',
    params: ['products', 'attributes'],
    example: { products: ['123', '456'], attributes: { custom_label_0: 'bestseller' } }
  },
  'submit_sitemap': {
    description: 'Submit or update sitemap in Google Search Console',
    params: ['sitemap_url'],
    example: { sitemap_url: 'https://store.com/sitemap.xml' }
  },
  
  // === SOCIAL MEDIA OPERATIONS ===
  'post_to_instagram': {
    description: 'Create Instagram post with product image and caption',
    params: ['product_id', 'caption', 'ai_caption'],
    example: { product_id: '123', ai_caption: true }
  },
  'post_to_facebook': {
    description: 'Create Facebook post',
    params: ['product_id', 'caption', 'ai_caption'],
    example: { product_id: '123', ai_caption: true }
  },
  'post_to_tiktok': {
    description: 'Create TikTok post (requires video)',
    params: ['product_id', 'video_url', 'caption'],
    example: { product_id: '123', video_url: '...' }
  },
  'schedule_social_posts': {
    description: 'Schedule posts across multiple platforms',
    params: ['products', 'platforms', 'schedule'],
    example: { products: ['123'], platforms: ['instagram', 'facebook'], schedule: '2024-01-15T10:00:00Z' }
  },
  
  // === MARKETING OPERATIONS ===
  'send_email_campaign': {
    description: 'Send email to subscribers',
    params: ['template', 'segment', 'subject', 'products'],
    example: { template: 'price_drop', segment: 'all', subject: 'New Deals!' }
  },
  'send_sms_campaign': {
    description: 'Send SMS to subscribers',
    params: ['message', 'segment'],
    example: { message: 'Flash sale! 50% off...', segment: 'vip' }
  },
  
  // === PRICE INTELLIGENCE ===
  'fetch_competitor_prices': {
    description: 'Fetch current prices from Amazon, Walmart, etc.',
    params: ['products', 'sources'],
    example: { products: 'all', sources: ['amazon', 'walmart'] }
  },
  'apply_pricing_rule': {
    description: 'Apply pricing rule based on competitor data',
    params: ['rule', 'margin_floor'],
    example: { rule: 'amazon_minus_15', margin_floor: 20 }
  },
  
  // === ANALYTICS ===
  'get_sales_report': {
    description: 'Get sales and revenue data',
    params: ['period', 'breakdown'],
    example: { period: 'last_30_days', breakdown: 'daily' }
  },
  'get_top_products': {
    description: 'Get best selling or most viewed products',
    params: ['metric', 'limit', 'period'],
    example: { metric: 'revenue', limit: 10, period: 'last_7_days' }
  },
  'get_underperforming_products': {
    description: 'Get products with low views, sales, or CTR',
    params: ['metric', 'threshold'],
    example: { metric: 'ctr', threshold: 0.02 }
  }
};

export async function POST(req: NextRequest) {
  try {
    const { prompt, dryRun = true, confirm = false } = await req.json();
    
    if (!prompt) {
      return NextResponse.json({ 
        error: 'Prompt required',
        usage: 'POST { "prompt": "your command", "dryRun": false }'
      }, { status: 400 });
    }

    // Step 1: AI interprets the command and creates execution plan
    const planResponse = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an AI store commander for a Shopify dropshipping store with membership model.
Given a natural language command, create a precise execution plan.

AVAILABLE ACTIONS:
${JSON.stringify(AVAILABLE_ACTIONS, null, 2)}

RULES:
1. Break complex commands into atomic actions
2. Order actions logically (fetch data before using it)
3. Flag destructive actions (deletes, bulk updates)
4. Estimate impact (number of products/customers affected)
5. Include rollback steps for risky operations

RESPOND IN JSON:
{
  "interpretation": "What the user wants in plain English",
  "actions": [
    { 
      "step": 1,
      "action": "action_name", 
      "params": { ... },
      "description": "What this step does",
      "estimated_impact": "X products affected"
    }
  ],
  "total_estimated_impact": {
    "products_affected": 0,
    "customers_affected": 0,
    "estimated_cost": "$0"
  },
  "warnings": ["Any concerns or risks"],
  "requires_confirmation": true/false,
  "rollback_possible": true/false
}`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3 // Lower temperature for more consistent planning
    });

    const plan = JSON.parse(planResponse.choices[0].message.content || '{}');

    // Step 2: If dry run, just return the plan for review
    if (dryRun) {
      return NextResponse.json({
        status: 'plan_ready',
        message: 'Review the plan below. Call again with dryRun: false to execute.',
        plan,
        next_step: 'POST /api/ai-commander { "prompt": "same prompt", "dryRun": false }'
      });
    }

    // Step 3: If confirmation required but not confirmed, ask for it
    if (plan.requires_confirmation && !confirm) {
      return NextResponse.json({
        status: 'confirmation_required',
        message: 'This operation requires confirmation due to its impact.',
        plan,
        next_step: 'POST /api/ai-commander { "prompt": "same prompt", "dryRun": false, "confirm": true }'
      });
    }

    // Step 4: Execute each action in sequence
    const results: any[] = [];
    let hasError = false;

    for (const actionItem of plan.actions) {
      if (hasError) {
        results.push({ 
          step: actionItem.step, 
          action: actionItem.action, 
          status: 'skipped',
          reason: 'Previous step failed' 
        });
        continue;
      }

      try {
        const result = await executeAction(actionItem.action, actionItem.params);
        results.push({
          step: actionItem.step,
          action: actionItem.action,
          status: 'success',
          result
        });
      } catch (error: any) {
        hasError = true;
        results.push({
          step: actionItem.step,
          action: actionItem.action,
          status: 'error',
          error: error.message
        });
      }
    }

    return NextResponse.json({
      status: hasError ? 'partial_success' : 'completed',
      plan,
      results,
      summary: {
        total_actions: plan.actions.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length,
        skipped: results.filter(r => r.status === 'skipped').length
      }
    });

  } catch (error: any) {
    console.error('AI Commander Error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

// Execute individual actions
async function executeAction(action: string, params: any): Promise<any> {
  console.log(`Executing: ${action}`, params);
  
  switch (action) {
    // === SHOPIFY ===
    case 'update_product':
      return await updateShopifyProducts([{ id: params.product_id, ...params.updates }]);
    
    case 'create_product':
      return await createShopifyProduct(params);
    
    case 'bulk_update_prices':
      return await bulkUpdatePrices(params);
    
    case 'update_metafields':
      return await updateMetafields(params.product_id, params.namespace, params.key, params.value);
    
    // === GOOGLE ===
    case 'sync_google_merchant':
      return await syncToGoogleMerchant(params.products, params.optimize);
    
    case 'optimize_google_listings':
      return await optimizeGoogleFeed(params.products, params.focus);
    
    // === SOCIAL ===
    case 'post_to_instagram':
    case 'post_to_facebook':
    case 'post_to_tiktok':
      return await postToSocial(action.replace('post_to_', ''), params);
    
    case 'schedule_social_posts':
      return await schedulePost(params);
    
    // === MARKETING ===
    case 'send_email_campaign':
      return await sendEmailCampaign(params);
    
    case 'send_sms_campaign':
      return await sendSMS(params);
    
    // === PRICE INTELLIGENCE ===
    case 'fetch_competitor_prices':
      return await fetchCompetitorPrices(params.products, params.sources);
    
    case 'apply_pricing_rule':
      return await applyPricingRule(params);
    
    // === ANALYTICS ===
    case 'get_sales_report':
      return await getSalesReport(params);
    
    case 'get_top_products':
      return await getTopProducts(params);
    
    case 'get_underperforming_products':
      return await getUnderperformingProducts(params);
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// Helper implementations
async function bulkUpdatePrices(params: { rule: string; percentage?: number; products: string | string[] }) {
  const products = params.products === 'all' 
    ? await getShopifyProducts() 
    : await getShopifyProducts(params.products as string[]);
  
  const updates = products.map(p => {
    let newPrice = parseFloat(p.variants[0].price);
    
    if (params.rule === 'competitor_minus' && params.percentage) {
      const competitorPrice = p.metafields?.compare_prices?.amazon_price || newPrice;
      newPrice = competitorPrice * (1 - params.percentage / 100);
    }
    
    return { id: p.id, variants: [{ price: newPrice.toFixed(2) }] };
  });
  
  return await updateShopifyProducts(updates);
}

async function applyPricingRule(params: { rule: string; margin_floor?: number }) {
  // Implementation for pricing rules
  return { applied: true, rule: params.rule, products_updated: 0 };
}

async function getSalesReport(params: { period: string; breakdown?: string }) {
  // Implementation for sales report
  return { period: params.period, revenue: 0, orders: 0 };
}

async function getTopProducts(params: { metric: string; limit: number; period?: string }) {
  // Implementation for top products
  return { products: [], metric: params.metric };
}

async function getUnderperformingProducts(params: { metric: string; threshold: number }) {
  // Implementation for underperforming products
  return { products: [], threshold: params.threshold };
}

// GET endpoint for documentation
export async function GET() {
  return NextResponse.json({
    name: 'AI Store Commander',
    description: 'Execute any store operation from natural language',
    usage: {
      endpoint: 'POST /api/ai-commander',
      body: {
        prompt: 'Your natural language command',
        dryRun: 'true (default) = preview plan, false = execute',
        confirm: 'true = confirm destructive operations'
      }
    },
    available_actions: Object.keys(AVAILABLE_ACTIONS),
    examples: [
      'Update all product prices to be 15% cheaper than Amazon',
      'Sync top 100 products to Google Merchant Center with AI optimization',
      'Post the 5 best selling products to Instagram with AI-generated captions',
      'Send an email blast about our new winter collection to all subscribers',
      'Fetch competitor prices for all products and apply 20% markup rule'
    ]
  });
}
