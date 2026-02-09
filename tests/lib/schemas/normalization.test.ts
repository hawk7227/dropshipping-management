// tests/lib/schemas/normalization.test.ts
// Normalization tests using API fixtures

import { 
  normalizeRainforestImportProduct,
  normalizeRainforestPriceSync,
  normalizeShopifyProduct,
  safeNormalizeRainforestImportProduct,
  safeNormalizeRainforestPriceSync,
  safeNormalizeShopifyProduct
} from '../../../lib/schemas/normalization';

// Import fixtures
const rainforestImportFixture = require('../../../fixtures/api/rainforestapi-import-product-data.json');
const rainforestPriceSyncFixture = require('../../../fixtures/api/rainforestapi-pricesync-data.json');
const shopifyFixture = require('../../../fixtures/api/shopify-response-data.json');

describe('Normalization Functions', () => {
  describe('normalizeRainforestImportProduct', () => {
    test('should normalize import product fixture correctly', () => {
      const result = normalizeRainforestImportProduct(rainforestImportFixture);
      
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('asin', 'B0011FJPAY');
      expect(result).toHaveProperty('title');
      expect(result.title).toContain('Q-tips Swabs Travel Pack');
      expect(result).toHaveProperty('brand', 'Q-tips');
      expect(result).toHaveProperty('category');
      expect(result.category).toContain('Beauty & Personal Care');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('main_image');
      expect(result.main_image).toContain('amazon.com/images');
      expect(result).toHaveProperty('images');
      expect(Array.isArray(result.images)).toBe(true);
      expect(result.images.length).toBeGreaterThan(0);
      expect(result).toHaveProperty('rating', 4.8);
      expect(result).toHaveProperty('ratings_total', 8588);
      expect(result).toHaveProperty('status', 'active');
      expect(result).toHaveProperty('source', 'rainforest_import');
      expect(result).toHaveProperty('created_at');
      expect(result).toHaveProperty('updated_at');
    });

    test('should handle missing optional fields gracefully', () => {
      const partialFixture = {
        ...rainforestImportFixture,
        rating: null,
        ratings_total: null
      };

      const result = normalizeRainforestImportProduct(partialFixture);
      expect(result.rating).toBeNull();
      expect(result.ratings_total).toBeNull();
    });
  });

  describe('normalizeRainforestPriceSync', () => {
    test('should normalize price sync fixture correctly', () => {
      const productId = 'test-product-id';
      const result = normalizeRainforestPriceSync(rainforestPriceSyncFixture, productId);
      
      expect(result).toHaveProperty('product_id', productId);
      expect(result).toHaveProperty('asin', 'B09YMPD3PG');
      expect(result).toHaveProperty('current_price', null); // Not available in fixtures
      expect(result).toHaveProperty('cost_price', null); // Not available in fixtures
      expect(result).toHaveProperty('competitor_prices', null); // Not available in fixtures
      expect(result).toHaveProperty('bsr_rank');
      expect(result.bsr_rank).toBe(901); // Extracted from bestsellers_rank_flat
      expect(result).toHaveProperty('bsr_category', 'Health & Household');
      expect(result).toHaveProperty('recent_sales', '20K+ bought in past month');
      expect(result).toHaveProperty('rating', 4.6);
      expect(result).toHaveProperty('is_prime', true);
      expect(result).toHaveProperty('sync_date');
    });

    test('should handle missing BSR data', () => {
      const productId = 'test-product-id';
      const fixtureWithoutBSR = {
        ...rainforestPriceSyncFixture,
        product: {
          ...rainforestPriceSyncFixture.product,
          bestsellers_rank_flat: 'No BSR data available'
        }
      };

      const result = normalizeRainforestPriceSync(fixtureWithoutBSR, productId);
      expect(result.bsr_rank).toBeNull();
      expect(result.bsr_category).toBeNull();
    });
  });

  describe('normalizeShopifyProduct', () => {
    test('should normalize Shopify fixture correctly', () => {
      const productId = 'test-product-id';
      const result = normalizeShopifyProduct(shopifyFixture, productId);
      
      expect(result).toHaveProperty('shopify_id', 10318652571812);
      expect(result).toHaveProperty('product_id', productId);
      expect(result).toHaveProperty('title');
      expect(result.title).toContain('BOXI 741-011');
      expect(result).toHaveProperty('handle');
      expect(result).toHaveProperty('vendor', 'ShangHai BOXI Auto Parts Co., Ltd.');
      expect(result).toHaveProperty('status', 'active');
      expect(result).toHaveProperty('body_html');
      expect(result).toHaveProperty('tags');
      expect(result).toHaveProperty('published_at');
      expect(result).toHaveProperty('updated_at');
    });
  });

  describe('Safe Normalization Functions', () => {
    test('safeNormalizeRainforestImportProduct should handle valid data', () => {
      const result = safeNormalizeRainforestImportProduct(rainforestImportFixture);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.product.asin).toBe('B0011FJPAY');
      }
    });

    test('safeNormalizeRainforestImportProduct should handle invalid data', () => {
      const invalidData = { invalid: 'data' };
      const result = safeNormalizeRainforestImportProduct(invalidData);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('safeNormalizeRainforestPriceSync should handle valid data', () => {
      const productId = 'test-product-id';
      const result = safeNormalizeRainforestPriceSync(rainforestPriceSyncFixture, productId);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.snapshot.asin).toBe('B09YMPD3PG');
      }
    });

    test('safeNormalizeShopifyProduct should handle valid data', () => {
      const productId = 'test-product-id';
      const result = safeNormalizeShopifyProduct(shopifyFixture, productId);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.shopifyProduct.shopify_id).toBe(10318652571812);
      }
    });
  });

  describe('Field Mapping Validation', () => {
    test('should map all available fields from fixtures', () => {
      const importResult = normalizeRainforestImportProduct(rainforestImportFixture);
      const priceSyncResult = normalizeRainforestPriceSync(rainforestPriceSyncFixture, 'test-id');
      const shopifyResult = normalizeShopifyProduct(shopifyFixture, 'test-id');

      // Verify no fixture fields are lost (only available fields should be mapped)
      expect(importResult.asin).toBe(rainforestImportFixture.asin);
      expect(importResult.title).toBe(rainforestImportFixture.title);
      expect(importResult.brand).toBe(rainforestImportFixture.brand);
      expect(importResult.rating).toBe(rainforestImportFixture.rating);
      expect(importResult.ratings_total).toBe(rainforestImportFixture.ratings_total);

      expect(priceSyncResult.asin).toBe(rainforestPriceSyncFixture.product.asin);
      expect(priceSyncResult.rating).toBe(rainforestPriceSyncFixture.product.rating);
      expect(priceSyncResult.is_prime).toBe(rainforestPriceSyncFixture.product.buybox_winner.is_prime);

      expect(shopifyResult.shopify_id).toBe(shopifyFixture.products[0].id);
      expect(shopifyResult.title).toBe(shopifyFixture.products[0].title);
      expect(shopifyResult.vendor).toBe(shopifyFixture.products[0].vendor);
    });
  });
});
