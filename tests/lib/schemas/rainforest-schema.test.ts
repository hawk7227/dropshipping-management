// tests/lib/schemas/rainforest-schema.test.ts
// Schema validation tests using API fixtures

import { 
  RainforestImportProductSchema,
  RainforestPriceSyncSchema,
  ShopifyProductSchema
} from '../../../lib/schemas/rainforest-schema';

// Import fixtures
const rainforestImportFixture = require('../../../fixtures/api/rainforestapi-import-product-data.json');
const rainforestPriceSyncFixture = require('../../../fixtures/api/rainforestapi-pricesync-data.json');
const shopifyFixture = require('../../../fixtures/api/shopify-response-data.json');

describe('Rainforest API Schema Validation', () => {
  describe('RainforestImportProductSchema', () => {
    test('should validate import product fixture', () => {
      const result = RainforestImportProductSchema.safeParse(rainforestImportFixture);
      expect(result.success).toBe(true);
      
      if (result.success) {
        const product = result.data;
        expect(product.asin).toBe('B0011FJPAY');
        expect(product.title).toContain('Q-tips Swabs Travel Pack');
        expect(product.brand).toBe('Q-tips');
        expect(product.rating).toBe(4.8);
        expect(product.ratings_total).toBe(8588);
        expect(product.categories).toBeDefined();
        expect(product.images).toBeDefined();
        expect(product.videos_additional).toBeDefined();
      }
    });

    test('should require required fields', () => {
      const invalidProduct = {
        // Missing required fields
        title: 'Test Product'
      };

      const result = RainforestImportProductSchema.safeParse(invalidProduct);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.issues).toBeDefined();
      }
    });

    test('should handle partial data gracefully', () => {
      const partialProduct = {
        ...rainforestImportFixture,
        // Remove some optional fields
        videos_additional: undefined,
        a_plus_content: undefined
      };

      const result = RainforestImportProductSchema.safeParse(partialProduct);
      expect(result.success).toBe(true);
    });
  });

  describe('RainforestPriceSyncSchema', () => {
    test('should validate price sync fixture', () => {
      const result = RainforestPriceSyncSchema.safeParse(rainforestPriceSyncFixture);
      expect(result.success).toBe(true);
      
      if (result.success) {
        const data = result.data;
        expect(data.request_info.success).toBe(true);
        expect(data.product.asin).toBe('B09YMPD3PG');
        expect(data.product.title).toContain('Colgate Total');
        expect(data.product.bestsellers_rank).toBeDefined();
        expect(data.product.buybox_winner).toBeDefined();
        expect(data.product.recent_sales).toBe('20K+ bought in past month');
      }
    });

    test('should validate request metadata', () => {
      const result = RainforestPriceSyncSchema.safeParse(rainforestPriceSyncFixture);
      expect(result.success).toBe(true);
      
      if (result.success) {
        const data = result.data;
        expect(data.request_metadata.created_at).toBeDefined();
        expect(data.request_metadata.processed_at).toBeDefined();
        expect(data.request_metadata.total_time_taken).toBeGreaterThan(0);
      }
    });

    test('should require request_info structure', () => {
      const invalidSync = {
        product: rainforestPriceSyncFixture.product
        // Missing request_info
      };

      const result = RainforestPriceSyncSchema.safeParse(invalidSync);
      expect(result.success).toBe(false);
    });
  });

  describe('ShopifyProductSchema', () => {
    test('should validate Shopify fixture', () => {
      const result = ShopifyProductSchema.safeParse(shopifyFixture);
      expect(result.success).toBe(true);
      
      if (result.success) {
        const products = result.data.products;
        expect(products).toHaveLength(2);
        
        const firstProduct = products[0];
        expect(firstProduct.id).toBe(10318652571812);
        expect(firstProduct.title).toContain('BOXI 741-011');
        expect(firstProduct.vendor).toBe('ShangHai BOXI Auto Parts Co., Ltd.');
        expect(firstProduct.status).toBe('active');
        expect(firstProduct.handle).toBeDefined();
        expect(firstProduct.body_html).toBeDefined();
      }
    });

    test('should require product fields', () => {
      const invalidProduct = {
        // Missing required fields
        title: 'Test Product'
      };

      const result = ShopifyProductSchema.safeParse(invalidProduct);
      expect(result.success).toBe(false);
    });
  });

  describe('Schema Edge Cases', () => {
    test('should handle empty arrays gracefully', () => {
      const productWithEmptyArrays = {
        ...rainforestImportFixture,
        images: [],
        videos_additional: [],
        categories: []
      };

      const result = RainforestImportProductSchema.safeParse(productWithEmptyArrays);
      expect(result.success).toBe(true);
    });

    test('should handle null optional fields', () => {
      const productWithNulls = {
        ...rainforestImportFixture,
        a_plus_content: null,
        sub_title: null
      };

      const result = RainforestImportProductSchema.safeParse(productWithNulls);
      expect(result.success).toBe(true);
    });
  });
});
