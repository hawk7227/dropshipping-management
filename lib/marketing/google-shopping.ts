// lib/marketing/google-shopping.ts
// Google Shopping feed generation with AI-selected products
// Generates structured XML feed for Google Merchant Center

import { createClient } from '@supabase/supabase-js';
import { getGoogleShoppingProducts, MarketingProduct } from '../ai/marketing-selection';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

export interface GoogleShoppingProduct {
  id: string;
  title: string;
  description: string;
  google_product_category: string;
  product_type: string;
  link: string;
  image_link: string;
  additional_image_links?: string[];
  condition: 'new' | 'refurbished' | 'used';
  availability: 'in stock' | 'out of stock' | 'preorder';
  price: string;
  sale_price?: string;
  sale_price_effective_date?: string;
  gtin?: string;
  mpn?: string;
  brand: string;
  identifier_exists: 'TRUE' | 'FALSE';
  shipping: {
    country: string;
    service: string;
    price: string;
  };
  tax: {
    country: string;
    rate: number;
    tax_ship: 'TRUE' | 'FALSE';
  };
  ads_redirect?: string;
  custom_label_0?: string;
  custom_label_1?: string;
  custom_label_2?: string;
  custom_label_3?: string;
  custom_label_4?: string;
}

export interface GoogleShoppingFeedResult {
  success: boolean;
  feed_url?: string;
  products_count: number;
  feed_xml?: string;
  errors: string[];
  generated_at: string;
}

// Google Product Category mapping
const GOOGLE_CATEGORY_MAPPING: Record<string, string> = {
  'Electronics': 'Electronics > Audio',
  'Home & Kitchen': 'Home & Garden > Kitchen',
  'Beauty': 'Health & Beauty > Personal Care',
  'Fashion': 'Apparel & Accessories > Clothing',
  'Toys & Games': 'Toys & Games > General Toys',
  'Sports & Outdoors': 'Sports & Outdoors > General Sports',
  'Books': 'Media > Books',
  'Automotive': 'Vehicles & Parts > Automotive Parts & Accessories',
  'Health': 'Health & Beauty > Health Care',
  'Office': 'Office Supplies > General Office Supplies',
  'Pet Supplies': 'Home & Garden > Pet Supplies',
  'Baby': 'Apparel & Accessories > Baby & Toddler Clothing',
  'Tools': 'Home & Garden > Tools',
  'Garden': 'Home & Garden > Gardening',
  'Movies': 'Media > Movies',
  'Music': 'Media > Music',
  'Software': 'Software > General Software',
  'Video Games': 'Electronics > Video Games & Consoles'
};

/**
 * Map internal category to Google Product Category
 */
function mapToGoogleCategory(internalCategory: string): string {
  // Try exact match first
  if (GOOGLE_CATEGORY_MAPPING[internalCategory]) {
    return GOOGLE_CATEGORY_MAPPING[internalCategory];
  }

  // Try partial match
  for (const [internal, google] of Object.entries(GOOGLE_CATEGORY_MAPPING)) {
    if (internalCategory.toLowerCase().includes(internal.toLowerCase())) {
      return google;
    }
  }

  // Default to general category
  return 'Products > General Products';
}

/**
 * Convert marketing product to Google Shopping format
 */
function convertToGoogleShoppingProduct(product: MarketingProduct): GoogleShoppingProduct {
  const availability = product.availability === 'in_stock' ? 'in stock' : 
                      product.availability === 'limited' ? 'in stock' : 'out of stock';

  const price = product.price ? `${product.price.toFixed(2)} USD` : '0.00 USD';
  const salePrice = product.cost_price && product.price && product.price > product.cost_price 
    ? `${product.cost_price.toFixed(2)} USD` 
    : undefined;

  return {
    id: product.asin,
    title: product.title,
    description: product.description.substring(0, 5000), // Google limit
    google_product_category: mapToGoogleCategory(product.category),
    product_type: product.category,
    link: product.shopify_product_id 
      ? `https://store.shopify.com/products/${product.asin}`
      : `https://amazon.com/dp/${product.asin}`,
    image_link: product.main_image,
    additional_image_links: product.images.slice(0, 10), // Google limit
    condition: 'new', // Assuming all products are new
    availability,
    price,
    sale_price: salePrice,
    brand: product.brand,
    identifier_exists: 'FALSE', // We don't have GTIN/MPN for most products
    shipping: {
      country: 'US',
      service: 'Standard',
      price: '0.00 USD' // Free shipping
    },
    tax: {
      country: 'US',
      rate: 0.08, // 8% tax rate
      tax_ship: 'FALSE'
    },
    custom_label_0: product.ai_tier || 'Unknown',
    custom_label_1: `AI Score: ${product.ai_score || 0}`,
    custom_label_2: `Rating: ${product.rating || 0}/5`,
    custom_label_3: `Reviews: ${product.review_count || 0}`,
    custom_label_4: 'unknown'
  };
}

/**
 * Generate Google Shopping XML feed
 */
function generateGoogleShoppingXML(products: GoogleShoppingProduct[]): string {
  const now = new Date().toISOString();
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
<title>Dropship Pro Products</title>
<link>https://dropship-pro.com</link>
<description>AI-curated dropshipping products from Dropship Pro</description>
<language>en</language>
<lastBuildDate>${now}</lastBuildDate>
<generator>Dropship Pro AI Marketing System</generator>
`;

  for (const product of products) {
    xml += `<item>
  <g:id>${escapeXml(product.id)}</g:id>
  <g:title>${escapeXml(product.title)}</g:title>
  <g:description>${escapeXml(product.description)}</g:description>
  <g:google_product_category>${escapeXml(product.google_product_category)}</g:google_product_category>
  <g:product_type>${escapeXml(product.product_type)}</g:product_type>
  <g:link>${escapeXml(product.link)}</g:link>
  <g:image_link>${escapeXml(product.image_link)}</g:link>`;

    if (product.additional_image_links && product.additional_image_links.length > 0) {
      for (const imageLink of product.additional_image_links) {
        xml += `\n  <g:additional_image_link>${escapeXml(imageLink)}</g:additional_image_link>`;
      }
    }

    xml += `
  <g:condition>${product.condition}</g:condition>
  <g:availability>${product.availability}</g:availability>
  <g:price>${product.price}</g:price>`;

    if (product.sale_price) {
      xml += `\n  <g:sale_price>${product.sale_price}</g:sale_price>`;
    }

    xml += `
  <g:brand>${escapeXml(product.brand)}</g:brand>
  <g:identifier_exists>${product.identifier_exists}</g:identifier_exists>
  <g:shipping>
    <g:country>${product.shipping.country}</g:country>
    <g:service>${escapeXml(product.shipping.service)}</g:service>
    <g:price>${product.shipping.price}</g:price>
  </g:shipping>
  <g:tax>
    <g:country>${product.tax.country}</g:country>
    <g:rate>${product.tax.rate}</g:rate>
    <g:tax_ship>${product.tax.tax_ship}</g:tax_ship>
  </g:tax>`;

    if (product.custom_label_0) {
      xml += `\n  <g:custom_label_0>${escapeXml(product.custom_label_0)}</g:custom_label_0>`;
    }
    if (product.custom_label_1) {
      xml += `\n  <g:custom_label_1>${escapeXml(product.custom_label_1)}</g:custom_label_1>`;
    }
    if (product.custom_label_2) {
      xml += `\n  <g:custom_label_2>${escapeXml(product.custom_label_2)}</g:custom_label_2>`;
    }
    if (product.custom_label_3) {
      xml += `\n  <g:custom_label_3>${escapeXml(product.custom_label_3)}</g:custom_label_3>`;
    }
    if (product.custom_label_4) {
      xml += `\n  <g:custom_label_4>${escapeXml(product.custom_label_4)}</g:custom_label_4>`;
    }

    xml += `\n</item>\n`;
  }

  xml += `</channel>
</rss>`;

  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate Google Shopping feed
 */
export async function generateGoogleShoppingFeed(
  limit: number = 100
): Promise<GoogleShoppingFeedResult> {
  try {
    // Get AI-selected products for Google Shopping
    const selectionResult = await getGoogleShoppingProducts(limit);
    const products = selectionResult.products;

    if (products.length === 0) {
      return {
        success: false,
        products_count: 0,
        errors: ['No eligible products found for Google Shopping feed'],
        generated_at: new Date().toISOString()
      };
    }

    // Convert to Google Shopping format
    const googleProducts = products.map(convertToGoogleShoppingProduct);

    // Generate XML feed
    const feedXML = generateGoogleShoppingXML(googleProducts);

    // Save feed to database
    const feedData = {
      id: 'google_shopping_main',
      feed_type: 'google_shopping',
      feed_xml: feedXML,
      products_count: products.length,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('marketing_feeds')
      .upsert(feedData, { onConflict: 'id' });

    if (error) throw error;

    return {
      success: true,
      feed_url: '/api/marketing/feeds/google-shopping',
      products_count: products.length,
      feed_xml: feedXML,
      errors: [],
      generated_at: new Date().toISOString()
    };

  } catch (error) {
    return {
      success: false,
      products_count: 0,
      errors: [`Failed to generate Google Shopping feed: ${error}`],
      generated_at: new Date().toISOString()
    };
  }
}

/**
 * Get Google Shopping feed statistics
 */
export async function getGoogleShoppingStats(): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('marketing_feeds')
      .select('*')
      .eq('feed_type', 'google_shopping')
      .order('generated_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        success: true,
        data: { last_generated: null, products_count: 0 }
      };
    }

    const feed = data[0];
    
    // Parse XML to get product statistics
    const productCount = (feed.feed_xml.match(/<item>/g) || []).length;
    const categories = [...new Set(Array.from(feed.feed_xml.matchAll(/<g:google_product_category>(.*?)<\/g:google_product_category>/g) || [], 
      (match: RegExpMatchArray) => match[1]))];

    return {
      success: true,
      data: {
        last_generated: feed.generated_at,
        products_count: productCount,
        categories_count: categories.length,
        categories: categories.slice(0, 10), // Top 10 categories
        feed_size: feed.feed_xml.length
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Validate Google Shopping feed format
 */
export function validateGoogleShoppingFeed(feedXML: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for required elements
  const requiredElements = [
    '<?xml version="1.0"',
    '<rss xmlns:g="http://base.google.com/ns/1.0"',
    '<channel>',
    '<title>',
    '<link>',
    '<description>'
  ];

  for (const element of requiredElements) {
    if (!feedXML.includes(element)) {
      errors.push(`Missing required element: ${element}`);
    }
  }

  // Check for product items
  const itemCount = (feedXML.match(/<item>/g) || []).length;
  if (itemCount === 0) {
    errors.push('No products found in feed');
  }

  // Check for required product fields
  const productItems = feedXML.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (let i = 0; i < productItems.length; i++) {
    const item = productItems[i];
    const requiredFields = ['<g:id>', '<g:title>', '<g:description>', '<g:link>', '<g:image_link>', '<g:price>', '<g:availability>'];
    
    for (const field of requiredFields) {
      if (!item.includes(field)) {
        errors.push(`Product ${i + 1} missing required field: ${field}`);
      }
    }
  }

  // Check XML structure
  if (!feedXML.endsWith('</rss>')) {
    errors.push('Feed does not end with </rss>');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Schedule Google Shopping feed generation
 */
export async function scheduleGoogleShoppingFeedGeneration(
  hours_between: number = 24
): Promise<{ success: boolean; scheduled: boolean; next_run?: string; error?: string }> {
  try {
    const nextRun = new Date(Date.now() + hours_between * 60 * 60 * 1000);

    const { error } = await supabase
      .from('marketing_schedules')
      .upsert({
        id: 'google_shopping_feed',
        feed_type: 'google_shopping',
        schedule_type: 'recurring',
        interval_hours: hours_between,
        next_run: nextRun.toISOString(),
        active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) throw error;

    return {
      success: true,
      scheduled: true,
      next_run: nextRun.toISOString()
    };

  } catch (error) {
    return {
      success: false,
      scheduled: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
