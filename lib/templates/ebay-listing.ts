// lib/templates/ebay-listing.ts
// eBay listing HTML template with Even Better Buy branding
// Placeholders: {{ title }}, {{ main_image }}, {{ description }}, {{ product_dimensions }}

export const EBAY_TEMPLATE_NAME = 'Even Better Buy - eBay';
export const EBAY_STORE_URL = 'https://www.ebay.com/usr/evenbetterbuy_com';
export const EBAY_FEEDBACK_URL = 'https://www.ebay.com/fdbk/feedback_profile/evenbetterbuy_com';

/**
 * eBay listing HTML template
 * Uses placeholders that will be replaced with product data
 */
export const EBAY_LISTING_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; background: #f8f9fa; }
  .container { max-width: 1200px; margin: 0 auto; background: #fff; }
  
  /* Header */
  .header { background: linear-gradient(135deg, #1a237e 0%, #283593 100%); color: white; padding: 20px 30px; }
  .header-content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; }
  .logo { display: flex; align-items: center; gap: 15px; }
  .logo-icon { width: 50px; height: 50px; background: #fff; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .logo-icon span { font-size: 28px; }
  .logo-text h1 { font-size: 24px; font-weight: 700; margin: 0; }
  .logo-text p { font-size: 12px; opacity: 0.9; margin: 0; }
  .header-badges { display: flex; gap: 10px; flex-wrap: wrap; }
  .badge { background: rgba(255,255,255,0.15); padding: 8px 15px; border-radius: 20px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .badge-icon { font-size: 14px; }
  
  /* Navigation */
  .nav { background: #f5f5f5; padding: 12px 30px; border-bottom: 1px solid #e0e0e0; }
  .nav-links { display: flex; gap: 25px; flex-wrap: wrap; }
  .nav-links a { color: #1a237e; text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.2s; }
  .nav-links a:hover { color: #3949ab; }
  
  /* Main Content */
  .main { padding: 30px; }
  .product-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
  @media (max-width: 768px) { .product-section { grid-template-columns: 1fr; } }
  
  /* Product Image */
  .product-image { text-align: center; }
  .product-image img { max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
  
  /* Product Info */
  .product-info h2 { font-size: 28px; color: #1a237e; margin-bottom: 20px; line-height: 1.3; }
  .product-description { color: #555; margin-bottom: 25px; }
  .product-description p { margin-bottom: 15px; }
  .product-description ul { margin: 15px 0; padding-left: 25px; }
  .product-description li { margin-bottom: 8px; }
  
  /* Specs Box */
  .specs-box { background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 25px; }
  .specs-box h3 { font-size: 16px; color: #1a237e; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }
  .specs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .spec-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
  .spec-label { color: #666; font-size: 14px; }
  .spec-value { font-weight: 600; color: #333; font-size: 14px; }
  
  /* Trust Badges */
  .trust-section { background: linear-gradient(135deg, #e8eaf6 0%, #c5cae9 100%); border-radius: 12px; padding: 25px; margin-bottom: 30px; }
  .trust-section h3 { text-align: center; color: #1a237e; margin-bottom: 20px; font-size: 18px; }
  .trust-badges { display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; }
  .trust-badge { text-align: center; }
  .trust-badge-icon { font-size: 32px; margin-bottom: 8px; }
  .trust-badge-text { font-size: 13px; color: #333; font-weight: 500; }
  
  /* Featured Categories */
  .categories-section { margin-bottom: 40px; }
  .categories-section h3 { font-size: 20px; color: #1a237e; margin-bottom: 20px; text-align: center; }
  .categories-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
  @media (max-width: 768px) { .categories-grid { grid-template-columns: repeat(2, 1fr); } }
  .category-card { background: #f8f9fa; border-radius: 10px; padding: 20px; text-align: center; transition: transform 0.2s, box-shadow 0.2s; }
  .category-card:hover { transform: translateY(-3px); box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
  .category-icon { font-size: 36px; margin-bottom: 10px; }
  .category-name { font-weight: 600; color: #333; font-size: 14px; }
  
  /* Customer Reviews */
  .reviews-section { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 25px; margin-bottom: 30px; }
  .reviews-section h3 { font-size: 18px; color: #1a237e; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
  .reviews-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  @media (max-width: 768px) { .reviews-grid { grid-template-columns: 1fr; } }
  .review-card { background: #f8f9fa; border-radius: 10px; padding: 20px; }
  .review-stars { color: #ffc107; font-size: 16px; margin-bottom: 10px; }
  .review-text { font-size: 14px; color: #555; margin-bottom: 10px; font-style: italic; }
  .review-author { font-size: 13px; color: #888; }
  
  /* Info Sections */
  .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
  @media (max-width: 768px) { .info-grid { grid-template-columns: 1fr; } }
  .info-card { background: #f8f9fa; border-radius: 12px; padding: 20px; }
  .info-card h4 { font-size: 16px; color: #1a237e; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }
  .info-card p { font-size: 14px; color: #555; margin-bottom: 10px; }
  .info-card ul { padding-left: 20px; }
  .info-card li { font-size: 14px; color: #555; margin-bottom: 6px; }
  
  /* Footer */
  .footer { background: #1a237e; color: white; padding: 30px; }
  .footer-content { display: grid; grid-template-columns: repeat(4, 1fr); gap: 30px; }
  @media (max-width: 768px) { .footer-content { grid-template-columns: repeat(2, 1fr); } }
  .footer-section h4 { font-size: 14px; margin-bottom: 15px; opacity: 0.9; }
  .footer-section a { display: block; color: rgba(255,255,255,0.7); text-decoration: none; font-size: 13px; margin-bottom: 8px; transition: color 0.2s; }
  .footer-section a:hover { color: #fff; }
  .footer-bottom { text-align: center; margin-top: 25px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
  .footer-bottom p { font-size: 12px; opacity: 0.7; }
</style>
</head>
<body>
<div class="container">
  <!-- Header -->
  <div class="header">
    <div class="header-content">
      <div class="logo">
        <div class="logo-icon"><span>🛒</span></div>
        <div class="logo-text">
          <h1>Even Better Buy</h1>
          <p>Quality Products • Great Prices • Fast Shipping</p>
        </div>
      </div>
      <div class="header-badges">
        <span class="badge"><span class="badge-icon">✓</span> eBay-Verified Seller</span>
        <span class="badge"><span class="badge-icon">⭐</span> Top Rated</span>
        <span class="badge"><span class="badge-icon">🚚</span> Fast Shipping</span>
      </div>
    </div>
  </div>
  
  <!-- Navigation -->
  <div class="nav">
    <div class="nav-links">
      <a href="${EBAY_STORE_URL}">🏠 Store Home</a>
      <a href="${EBAY_STORE_URL}?_sop=12">🔥 New Arrivals</a>
      <a href="${EBAY_STORE_URL}?_sop=1">💰 Best Sellers</a>
      <a href="${EBAY_FEEDBACK_URL}">⭐ Feedback</a>
      <a href="${EBAY_STORE_URL}">📞 Contact</a>
    </div>
  </div>
  
  <!-- Main Content -->
  <div class="main">
    <!-- Product Section -->
    <div class="product-section">
      <div class="product-image">
        <img src="{{ main_image }}" alt="{{ title }}">
      </div>
      <div class="product-info">
        <h2>{{ title }}</h2>
        <div class="product-description">
          {{ description }}
        </div>
        
        <!-- Specs Box -->
        <div class="specs-box">
          <h3>📦 Product Specifications</h3>
          <div class="specs-grid">
            <div class="spec-item">
              <span class="spec-label">Condition</span>
              <span class="spec-value">Brand New</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Dimensions</span>
              <span class="spec-value">{{ product_dimensions }}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Ships From</span>
              <span class="spec-value">United States</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Handling Time</span>
              <span class="spec-value">1-2 Business Days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Trust Section -->
    <div class="trust-section">
      <h3>Why Buy From Even Better Buy?</h3>
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
          <div class="trust-badge-icon">💬</div>
          <div class="trust-badge-text">Responsive Support</div>
        </div>
        <div class="trust-badge">
          <div class="trust-badge-icon">↩️</div>
          <div class="trust-badge-text">Easy Returns</div>
        </div>
      </div>
    </div>
    
    <!-- Featured Categories -->
    <div class="categories-section">
      <h3>Shop Our Categories</h3>
      <div class="categories-grid">
        <div class="category-card">
          <div class="category-icon">🏠</div>
          <div class="category-name">Home & Garden</div>
        </div>
        <div class="category-card">
          <div class="category-icon">💄</div>
          <div class="category-name">Beauty & Health</div>
        </div>
        <div class="category-card">
          <div class="category-icon">🎮</div>
          <div class="category-name">Electronics</div>
        </div>
        <div class="category-card">
          <div class="category-icon">🐕</div>
          <div class="category-name">Pet Supplies</div>
        </div>
      </div>
    </div>
    
    <!-- Customer Reviews -->
    <div class="reviews-section">
      <h3>⭐ What Our Customers Say</h3>
      <div class="reviews-grid">
        <div class="review-card">
          <div class="review-stars">★★★★★</div>
          <div class="review-text">"Fast shipping and exactly as described. Will buy again!"</div>
          <div class="review-author">— Verified Buyer</div>
        </div>
        <div class="review-card">
          <div class="review-stars">★★★★★</div>
          <div class="review-text">"Great quality product at a fantastic price. Highly recommend!"</div>
          <div class="review-author">— Verified Buyer</div>
        </div>
        <div class="review-card">
          <div class="review-stars">★★★★★</div>
          <div class="review-text">"Excellent seller! Quick response and fast delivery."</div>
          <div class="review-author">— Verified Buyer</div>
        </div>
      </div>
    </div>
    
    <!-- Info Cards -->
    <div class="info-grid">
      <div class="info-card">
        <h4>💳 Payment</h4>
        <ul>
          <li>PayPal accepted</li>
          <li>All major credit cards</li>
          <li>Secure eBay checkout</li>
          <li>Payment due within 3 days</li>
        </ul>
      </div>
      <div class="info-card">
        <h4>🚚 Shipping</h4>
        <ul>
          <li>Fast processing (1-2 days)</li>
          <li>USPS / UPS / FedEx</li>
          <li>Tracking provided</li>
          <li>US shipping only</li>
        </ul>
      </div>
      <div class="info-card">
        <h4>↩️ Returns</h4>
        <ul>
          <li>30-day return policy</li>
          <li>Item must be unused</li>
          <li>Original packaging required</li>
          <li>Buyer pays return shipping</li>
        </ul>
      </div>
    </div>
  </div>
  
  <!-- Footer -->
  <div class="footer">
    <div class="footer-content">
      <div class="footer-section">
        <h4>Quick Links</h4>
        <a href="${EBAY_STORE_URL}">Store Home</a>
        <a href="${EBAY_STORE_URL}?_sop=12">New Arrivals</a>
        <a href="${EBAY_FEEDBACK_URL}">Leave Feedback</a>
      </div>
      <div class="footer-section">
        <h4>Customer Service</h4>
        <a href="${EBAY_STORE_URL}">Contact Us</a>
        <a href="${EBAY_STORE_URL}">FAQ</a>
        <a href="${EBAY_STORE_URL}">Shipping Info</a>
      </div>
      <div class="footer-section">
        <h4>Policies</h4>
        <a href="${EBAY_STORE_URL}">Return Policy</a>
        <a href="${EBAY_STORE_URL}">Privacy Policy</a>
        <a href="${EBAY_STORE_URL}">Terms of Service</a>
      </div>
      <div class="footer-section">
        <h4>Connect</h4>
        <a href="${EBAY_STORE_URL}">Follow Our Store</a>
        <a href="${EBAY_FEEDBACK_URL}">Read Reviews</a>
        <a href="${EBAY_STORE_URL}">Add to Favorites</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2024 Even Better Buy. All rights reserved. eBay-Verified Seller.</p>
    </div>
  </div>
</div>
</body>
</html>`;

/**
 * Apply product data to the eBay template
 */
export function applyEbayTemplate(product: {
  title: string;
  mainImage: string | null;
  description: string;
  dimensions: string | null;
}): string {
  let html = EBAY_LISTING_TEMPLATE;
  
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
export function getEbayTemplatePlaceholders(): string[] {
  return ['{{ title }}', '{{ main_image }}', '{{ description }}', '{{ product_dimensions }}'];
}
