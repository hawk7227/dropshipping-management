/**
 * Price Sync JavaScript
 * Fetches real-time competitor prices from your API
 * 
 * Usage: Include in theme.liquid or product.liquid
 * <script src="{{ 'price-sync.js' | asset_url }}" defer></script>
 * 
 * Configuration:
 * Set window.PRICE_SYNC_CONFIG before loading this script
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = window.PRICE_SYNC_CONFIG || {
    apiUrl: 'https://your-vercel-app.vercel.app/api/prices',
    apiKey: '', // Optional: for authenticated requests
    refreshInterval: 300000, // 5 minutes
    showProfitToAdmin: false,
    currency: 'USD',
    debug: false
  };

  // Logging helper
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[PriceSync]', ...args);
    }
  }

  // Format currency
  function formatMoney(cents, currency = CONFIG.currency) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(cents / 100);
  }

  // Fetch competitor prices for a product
  async function fetchCompetitorPrice(productId, sku) {
    try {
      const params = new URLSearchParams({
        action: 'get-price',
        productId: productId,
        sku: sku
      });

      const headers = {
        'Content-Type': 'application/json'
      };

      if (CONFIG.apiKey) {
        headers['Authorization'] = `Bearer ${CONFIG.apiKey}`;
      }

      const response = await fetch(`${CONFIG.apiUrl}?${params}`, { headers });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      log('Error fetching price:', error);
      return null;
    }
  }

  // Update price display on page
  function updatePriceDisplay(element, data) {
    if (!data || !data.competitor_price) return;

    const ourPrice = parseFloat(element.dataset.ourPrice) || 0;
    const competitorPrice = data.competitor_price;
    const source = data.source || 'Amazon';
    const cost = parseFloat(element.dataset.cost) || 0;

    // Calculate savings
    const savingsAmount = competitorPrice - ourPrice;
    const savingsPercent = ((savingsAmount / competitorPrice) * 100).toFixed(0);

    // Calculate profit/loss
    let profitHtml = '';
    if (cost > 0 && CONFIG.showProfitToAdmin) {
      const profitAmount = ourPrice - cost;
      const profitPercent = ((profitAmount / cost) * 100).toFixed(0);
      const profitClass = profitPercent > 0 ? 'profit-positive' : profitPercent < 0 ? 'profit-negative' : 'profit-neutral';
      profitHtml = `
        <div class="price-profit ${profitClass}" style="margin-top: 8px; font-size: 12px;">
          ${profitPercent > 0 ? 'Profit' : 'Loss'}: ${profitPercent}% (${formatMoney(profitAmount * 100)})
        </div>
      `;
    }

    // Build HTML
    const html = `
      <div class="price-comparison-live" style="padding: 12px; background: #f8f9fa; border-radius: 8px; margin: 12px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span style="font-size: 12px; color: #6b7280;">${source}:</span>
            <span style="text-decoration: line-through; color: #9ca3af; margin-left: 4px;">${formatMoney(competitorPrice * 100)}</span>
          </div>
          <div>
            <span style="font-size: 12px; color: #6b7280;">Our Price:</span>
            <span style="font-weight: 700; color: #111; margin-left: 4px;">${formatMoney(ourPrice * 100)}</span>
          </div>
          ${savingsPercent > 0 ? `
            <div style="background: #10b981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">
              SAVE ${savingsPercent}%
            </div>
          ` : ''}
        </div>
        ${profitHtml}
        <div style="font-size: 10px; color: #9ca3af; margin-top: 8px; text-align: right;">
          Updated: ${new Date(data.last_checked).toLocaleString()}
        </div>
      </div>
    `;

    element.innerHTML = html;
    element.style.display = 'block';
    log('Updated price display for', element.dataset.productId);
  }

  // Update stock alert
  function updateStockAlert(element, data) {
    if (!data) return;

    const status = data.availability_status;
    const quantity = data.stock_quantity || 0;

    let html = '';
    let style = '';

    switch (status) {
      case 'out_of_stock':
        style = 'background: #fef2f2; border-color: #fecaca; color: #991b1b;';
        html = `
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid; border-radius: 6px; ${style}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <span><strong>Out of Stock</strong> at ${data.source}</span>
          </div>
        `;
        break;

      case 'low_stock':
        style = 'background: #fffbeb; border-color: #fde68a; color: #a16207;';
        html = `
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid; border-radius: 6px; ${style}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Only <strong>${quantity} left</strong> at ${data.source}</span>
          </div>
        `;
        break;

      case 'in_stock':
        style = 'color: #059669;';
        html = `
          <div style="display: flex; align-items: center; gap: 6px; ${style} font-size: 13px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>In Stock at ${data.source}</span>
          </div>
        `;
        break;
    }

    element.innerHTML = html;
    element.style.display = 'block';
  }

  // Initialize price sync for all elements on page
  async function initPriceSync() {
    log('Initializing price sync...');

    // Find all price comparison elements
    const priceElements = document.querySelectorAll('[data-price-sync]');
    const stockElements = document.querySelectorAll('[data-stock-sync]');

    log(`Found ${priceElements.length} price elements, ${stockElements.length} stock elements`);

    // Fetch and update each element
    for (const element of priceElements) {
      const productId = element.dataset.productId;
      const sku = element.dataset.sku;

      if (productId || sku) {
        const data = await fetchCompetitorPrice(productId, sku);
        if (data && data.data) {
          updatePriceDisplay(element, data.data);
        }
      }
    }

    for (const element of stockElements) {
      const productId = element.dataset.productId;
      const sku = element.dataset.sku;

      if (productId || sku) {
        const data = await fetchCompetitorPrice(productId, sku);
        if (data && data.data) {
          updateStockAlert(element, data.data);
        }
      }
    }

    // Set up auto-refresh
    if (CONFIG.refreshInterval > 0) {
      setTimeout(initPriceSync, CONFIG.refreshInterval);
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPriceSync);
  } else {
    initPriceSync();
  }

  // Expose API for manual updates
  window.PriceSync = {
    refresh: initPriceSync,
    fetchPrice: fetchCompetitorPrice,
    config: CONFIG
  };

})();
