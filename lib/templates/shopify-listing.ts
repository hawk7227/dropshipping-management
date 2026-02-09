// lib/templates/shopify-listing.ts
// Shopify listing HTML template with evenbetterbuy.com branding
// Same design as eBay template but with Shopify/website links
// Placeholders: {{ title }}, {{ main_image }}, {{ description }}, {{ product_dimensions }}

export const SHOPIFY_TEMPLATE_NAME = 'Even Better Buy - Shopify';
export const SHOPIFY_STORE_URL = 'https://evenbetterbuy.com';
export const SHOPIFY_CONTACT_URL = 'https://evenbetterbuy.com/pages/contact';
export const SHOPIFY_REVIEWS_URL = 'https://evenbetterbuy.com/pages/reviews';

/**
 * Shopify listing HTML template
 * Uses placeholders that will be replaced with product data
 */
export const SHOPIFY_LISTING_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; }
  .product-details { padding: 20px; }
  .product-details h2 { font-size: 24px; color: #1a237e; margin-bottom: 20px; }
  .product-details p { margin-bottom: 15px; color: #555; }
  .product-details ul { margin: 15px 0; padding-left: 25px; }
  .product-details li { margin-bottom: 8px; }
  .specs-box { background: #f8f9fa; border-radius: 8px; padding: 15px; margin: 20px 0; }
  .specs-box h3 { font-size: 16px; color: #1a237e; margin-bottom: 10px; }
  .trust-badges { display: flex; gap: 20px; flex-wrap: wrap; margin: 20px 0; padding: 15px; background: #e8eaf6; border-radius: 8px; }
  .trust-badge { text-align: center; }
  .trust-badge-icon { font-size: 24px; }
  .trust-badge-text { font-size: 12px; color: #333; }
</style>
</head>
<body>
<div class="product-details">
  <h2>{{ title }}</h2>
  
  <div class="description">
    {{ description }}
  </div>
  
  <div class="specs-box">
    <h3>📦 Product Specifications</h3>
    <p><strong>Condition:</strong> Brand New</p>
    <p><strong>Dimensions:</strong> {{ product_dimensions }}</p>
    <p><strong>Ships From:</strong> United States</p>
    <p><strong>Handling Time:</strong> 1-2 Business Days</p>
  </div>
  
  <div class="trust-badges">
    <div class="trust-badge">
      <div class="trust-badge-icon">✅</div>
      <div class="trust-badge-text">100% Authentic</div>
    </div>
    <div class="trust-badge">
      <div class="trust-badge-icon">📦</div>
      <div class="trust-badge-text">Fast Shipping</div>
    </div>
    <div class="trust-badge">
      <div class="trust-badge-icon">🔒</div>
      <div class="trust-badge-text">Secure Checkout</div>
    </div>
    <div class="trust-badge">
      <div class="trust-badge-icon">↩️</div>
      <div class="trust-badge-text">Easy Returns</div>
    </div>
  </div>
  
  <div class="policies">
    <p><strong>Shipping:</strong> Fast processing (1-2 days), tracking provided, free shipping on orders $50+</p>
    <p><strong>Returns:</strong> 30-day return policy, item must be unused with original packaging</p>
    <p><strong>Support:</strong> Contact us at <a href="${SHOPIFY_CONTACT_URL}">evenbetterbuy.com/contact</a></p>
  </div>
</div>
</body>
</html>`;

/**
 * Apply product data to the Shopify template
 */
export function applyShopifyTemplate(product: {
  title: string;
  mainImage: string | null;
  description: string;
  dimensions: string | null;
}): string {
  let html = SHOPIFY_LISTING_TEMPLATE;
  
  html = html.replace(/\{\{\s*title\s*\}\}/g, escapeHtml(product.title));
  html = html.replace(/\{\{\s*main_image\s*\}\}/g, product.mainImage || 'https://via.placeholder.com/500x500?text=No+Image');
  html = html.replace(/\{\{\s*description\s*\}\}/g, product.description || '<p>Quality product from Even Better Buy.</p>');
  html = html.replace(/\{\{\s*product_dimensions\s*\}\}/g, product.dimensions || 'See product details');
  
  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}

/**
 * Get template placeholders
 */
export function getShopifyTemplatePlaceholders(): string[] {
  return ['{{ title }}', '{{ main_image }}', '{{ description }}', '{{ product_dimensions }}'];
}
