// tests/lib/pipelines/p1-integration.test.ts
// P1 Pipeline integration tests

import { 
  safeNormalizeRainforestImportProduct,
  safeNormalizeRainforestPriceSync 
} from '../../../lib/schemas/normalization';

// Import fixtures
const rainforestImportFixture = require('../../../fixtures/api/rainforestapi-import-product-data.json');
const rainforestPriceSyncFixture = require('../../../fixtures/api/rainforestapi-pricesync-data.json');

describe('P1 Pipeline Integration', () => {
  describe('Discovery Pipeline Data Flow', () => {
    test('should process import fixture through complete normalization', () => {
      // Step 1: Validate fixture with schema
      const normalizedResult = safeNormalizeRainforestImportProduct(rainforestImportFixture);
      expect(normalizedResult.success).toBe(true);
      
      if (normalizedResult.success) {
        const product = normalizedResult.product;
        
        // Step 2: Verify required fields for persistence
        expect(product.id).toBeDefined();
        expect(product.asin).toBe('B0011FJPAY');
        expect(product.title).toBeDefined();
        expect(product.source).toBe('rainforest_import');
        
        // Step 3: Verify fields for database schema compatibility
        expect(product.category).toBeDefined();
        expect(product.description).toBeDefined();
        expect(product.main_image).toBeDefined();
        expect(Array.isArray(product.images)).toBe(true);
        
        // Step 4: Verify rating data
        expect(typeof product.rating).toBe('number');
        expect(typeof product.ratings_total).toBe('number');
      }
    });

    test('should handle price sync fixture data flow', () => {
      const productId = 'test-uuid';
      const normalizedResult = safeNormalizeRainforestPriceSync(rainforestPriceSyncFixture, productId);
      expect(normalizedResult.success).toBe(true);
      
      if (normalizedResult.success) {
        const snapshot = normalizedResult.snapshot;
        
        // Verify price snapshot structure
        expect(snapshot.product_id).toBe(productId);
        expect(snapshot.asin).toBe('B09YMPD3PG');
        expect(snapshot.sync_date).toBeDefined();
        
        // Verify BSR data extraction
        expect(typeof snapshot.bsr_rank).toBe('number');
        expect(typeof snapshot.bsr_category).toBe('string');
        
        // Verify missing price fields are handled
        expect(snapshot.current_price).toBeNull();
        expect(snapshot.cost_price).toBeNull();
        expect(snapshot.competitor_prices).toBeNull();
      }
    });
  });

  describe('Data Completeness Validation', () => {
    test('import fixture should contain all expected fields', () => {
      const fixture = rainforestImportFixture;
      
      // Required identity fields
      expect(fixture.asin).toBeDefined();
      expect(fixture.title).toBeDefined();
      expect(fixture.brand).toBeDefined();
      
      // Content fields
      expect(fixture.description).toBeDefined();
      expect(fixture.main_image).toBeDefined();
      expect(fixture.images).toBeDefined();
      expect(Array.isArray(fixture.images)).toBe(true);
      
      // Quality signals
      expect(fixture.rating).toBeDefined();
      expect(fixture.ratings_total).toBeDefined();
      expect(typeof fixture.rating).toBe('number');
      expect(typeof fixture.ratings_total).toBe('number');
      
      // Category data
      expect(fixture.categories_flat).toBeDefined();
      expect(fixture.categories_flat).toContain('>');
    });

    test('price sync fixture should contain BSR data', () => {
      const fixture = rainforestPriceSyncFixture;
      
      // BSR data should be present
      expect(fixture.product.bestsellers_rank_flat).toBeDefined();
      expect(typeof fixture.product.bestsellers_rank_flat).toBe('string');
      
      // Should contain rank information
      expect(fixture.product.bestsellers_rank_flat).toMatch(/Rank: \d+/);
      
      // Should contain category information
      expect(fixture.product.bestsellers_rank_flat).toMatch(/Category: /);
      
      // Recent sales data
      expect(fixture.product.recent_sales).toBeDefined();
      expect(typeof fixture.product.recent_sales).toBe('string');
    });
  });

  describe('Error Handling', () => {
    test('should gracefully handle malformed fixture data', () => {
      const malformedFixture = {
        asin: 'B0011FJPAY',
        // Missing required fields
      };

      const result = safeNormalizeRainforestImportProduct(malformedFixture);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    });

    test('should handle missing optional fields', () => {
      const fixtureWithMissingOptionals = {
        ...rainforestImportFixture,
        rating: null,
        ratings_total: null,
        videos_additional: []
      };

      const result = safeNormalizeRainforestImportProduct(fixtureWithMissingOptionals);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.product.rating).toBeNull();
        expect(result.product.ratings_total).toBeNull();
      }
    });
  });

  describe('Performance Constraints', () => {
    test('should handle large fixture data efficiently', () => {
      const startTime = Date.now();
      
      // Process fixture multiple times
      for (let i = 0; i < 10; i++) {
        const result = safeNormalizeRainforestImportProduct(rainforestImportFixture);
        expect(result.success).toBe(true);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete quickly (less than 1 second for 10 iterations)
      expect(duration).toBeLessThan(1000);
    });
  });
});
