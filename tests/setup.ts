// tests/setup.ts
// Jest setup file

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:3000';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.RAINFOREST_API_KEY = 'test-key';
process.env.SHOPIFY_SHOP_DOMAIN = 'test-shop.myshopify.com';
process.env.SHOPIFY_ACCESS_TOKEN = 'test-token';
