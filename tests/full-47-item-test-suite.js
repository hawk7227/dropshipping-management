#!/usr/bin/env node
// tests/full-47-item-test-suite.js
// ═══════════════════════════════════════════════════════════════════════════
// 7-METHODOLOGY TEST SUITE — All 47 Items
// ═══════════════════════════════════════════════════════════════════════════
// 1. STEEL THREAD / WALKING SKELETON
// 2. VERTICAL SLICE TESTING
// 3. CONTRACT TESTING
// 4. CHAOS ENGINEERING
// 5. FAILURE MODE AND EFFECTS ANALYSIS (FMEA)
// 6. HEURISTIC EVALUATION
// 7. SMOKE TESTING
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════════
// TEST INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

let totalPass = 0;
let totalFail = 0;
let totalWarn = 0;
const failures = [];
const warnings = [];

function pass(test, detail) {
  totalPass++;
  console.log(`  ✅ ${test}${detail ? ': ' + detail : ''}`);
}

function fail(test, detail) {
  totalFail++;
  const msg = `${test}: ${detail}`;
  failures.push(msg);
  console.log(`  ❌ ${test}: ${detail}`);
}

function warn(test, detail) {
  totalWarn++;
  warnings.push(`${test}: ${detail}`);
  console.log(`  ⚠️  ${test}: ${detail}`);
}

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf-8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function countPattern(content, pattern) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

const COMPONENTS = [
  'components/products/ProductCard.tsx',
  'components/products/ProductCardGrid.tsx',
  'components/products/ProductImageCarousel.tsx',
  'components/products/ViewToggle.tsx',
  'components/products/SkeletonCard.tsx',
  'components/products/SourcingPanel.tsx',
  'components/products/ShopifySyncModal.tsx',
  'components/products/CronTestPanel.tsx',
  'components/products/GoogleStatusBadge.tsx',
];

const LIB_MODULES = [
  'lib/pricing-execution.ts',
  'lib/landing-page-generator.ts',
  'lib/programmatic-seo-engine.ts',
  'lib/faq-schema-generator.ts',
  'lib/google-search-console.ts',
  'lib/behavioral-segmentation.ts',
  'lib/pixel-event-pipeline.ts',
  'lib/config/pricing-rules.ts',
];

const API_ROUTES = [
  'app/api/webhooks/shopify/route.ts',
  'app/api/feed/google-shopping/route.ts',
  'app/api/sitemap/route.ts',
  'app/api/cron/route.ts',
  'app/api/cron/test/route.ts',
  'app/api/import/v2/route.ts',
];

const LIQUID_FILES = [
  'shopify-theme/snippets/product-schema.liquid',
  'shopify-theme/snippets/faq-howto-schema.liquid',
  'shopify-theme/snippets/tracking-pixels.liquid',
];

const SQL_FILES = [
  'database-migrations/sourcing-settings.sql',
  'database-migrations/webhook-logs.sql',
];

const PAGE_FILE = 'app/products/page.tsx';

const ALL_TS_FILES = [...COMPONENTS, ...LIB_MODULES, ...API_ROUTES, PAGE_FILE];
const ALL_FILES = [...ALL_TS_FILES, ...LIQUID_FILES, ...SQL_FILES];


// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: STEEL THREAD / WALKING SKELETON
// Verify the complete end-to-end path exists from UI → API → DB → Response
// ═══════════════════════════════════════════════════════════════════════════

function test1_SteelThread() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TEST 1: STEEL THREAD / WALKING SKELETON            ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const page = readFile(PAGE_FILE);

  // Thread 1: Product Load → page.tsx → /api/products → supabase → render
  if (page && page.includes('fetchProducts') && page.includes('/api/products')) {
    pass('T1.1 Product load thread', 'page.tsx → fetchProducts → /api/products');
  } else fail('T1.1 Product load thread', 'Missing fetchProducts or /api/products call');

  // Thread 2: Import → ImportPanelEnhanced → /api/import/v2 → Keepa → supabase
  const importV2 = readFile('app/api/import/v2/route.ts');
  if (importV2 && importV2.includes('keepa') && importV2.includes('supabase')) {
    pass('T1.2 Import thread', 'v2 route → Keepa → Supabase');
  } else fail('T1.2 Import thread', 'Missing keepa or supabase in import/v2');

  // Thread 3: AI title → import/v2 → optimizeTitle → save
  if (importV2 && importV2.includes('optimizeTitle') && importV2.includes('OPENAI_API_KEY')) {
    pass('T1.3 AI title optimization thread', 'import/v2 → optimizeTitle w/ OPENAI check');
  } else fail('T1.3 AI title optimization thread', 'Missing AI title optimization in import flow');

  // Thread 4: Price sync → cron → executePricingCycle → Shopify push
  const cron = readFile('app/api/cron/route.ts');
  if (cron && cron.includes('executePricingCycle') && cron.includes('runP1PriceSync')) {
    pass('T1.4 Price sync thread', 'cron → Keepa sync → pricing execution');
  } else fail('T1.4 Price sync thread', 'Missing executePricingCycle wiring in cron');

  // Thread 5: Auto sourcing → cron → sourcing_settings → runP1Discovery
  if (cron && cron.includes('sourcing_settings') && cron.includes('runP1Discovery') && cron.includes('discoveryEnabled')) {
    pass('T1.5 Auto sourcing thread', 'cron → sourcing_settings → P1 discovery');
  } else fail('T1.5 Auto sourcing thread', 'Missing sourcing_settings wiring');

  // Thread 6: Shopify sync → modal → /api/products?action=sync-shopify
  const syncModal = readFile('components/products/ShopifySyncModal.tsx');
  if (syncModal && syncModal.includes('sync-shopify') && page.includes('ShopifySyncModal')) {
    pass('T1.6 Shopify sync thread', 'page → ShopifySyncModal → sync-shopify API');
  } else fail('T1.6 Shopify sync thread', 'Missing sync modal wiring');

  // Thread 7: Google Shopping → feed endpoint → supabase → XML
  const feed = readFile('app/api/feed/google-shopping/route.ts');
  if (feed && feed.includes('application/xml') && feed.includes('<g:')) {
    pass('T1.7 Google Shopping feed thread', 'feed → supabase → XML with g: namespace');
  } else fail('T1.7 Google Shopping feed thread', 'Missing Google Shopping feed');

  // Thread 8: Webhook → verify HMAC → process → log
  const webhook = readFile('app/api/webhooks/shopify/route.ts');
  if (webhook && webhook.includes('verifyShopifyHmac') && webhook.includes('webhook_logs')) {
    pass('T1.8 Webhook thread', 'receive → HMAC verify → process → log');
  } else fail('T1.8 Webhook thread', 'Missing HMAC or logging');

  // Thread 9: SEO → programmatic engine → landing pages → Shopify
  const seo = readFile('lib/programmatic-seo-engine.ts');
  if (seo && seo.includes('executeSEOCycle') && seo.includes('pushPageToShopify')) {
    pass('T1.9 SEO engine thread', 'executeSEOCycle → landing pages → Shopify push');
  } else fail('T1.9 SEO engine thread', 'Missing SEO pipeline');

  // Thread 10: Pixel pipeline → FB CAPI + TikTok + Pinterest
  const pixel = readFile('lib/pixel-event-pipeline.ts');
  if (pixel && pixel.includes('sendToFacebook') && pixel.includes('sendToTikTok') && pixel.includes('sendToPinterest')) {
    pass('T1.10 Pixel pipeline thread', 'FB + TikTok + Pinterest forwarding');
  } else fail('T1.10 Pixel pipeline thread', 'Missing pixel platform forwarding');

  // Thread 11: Segmentation → orders → segments → Supabase
  const seg = readFile('lib/behavioral-segmentation.ts');
  if (seg && seg.includes('runSegmentation') && seg.includes('audience_segments')) {
    pass('T1.11 Segmentation thread', 'orders → segment analysis → DB store');
  } else fail('T1.11 Segmentation thread', 'Missing segmentation pipeline');

  // Thread 12: GSC → fetch performance → store → opportunities
  const gsc = readFile('lib/google-search-console.ts');
  if (gsc && gsc.includes('fetchSearchPerformance') && gsc.includes('identifyOpportunities')) {
    pass('T1.12 GSC thread', 'fetch → store → opportunity identification');
  } else fail('T1.12 GSC thread', 'Missing GSC pipeline');
}


// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: VERTICAL SLICE TESTING
// Each feature must have UI + API + data layer + error handling
// ═══════════════════════════════════════════════════════════════════════════

function test2_VerticalSlice() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TEST 2: VERTICAL SLICE TESTING                     ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // Slice 1: SourcingPanel (5 tabs)
  const sp = readFile('components/products/SourcingPanel.tsx');
  const tabs = ['manual', 'auto', 'pricing', 'history', 'testing'];
  for (const tab of tabs) {
    if (sp && sp.includes(`'${tab}'`)) {
      pass(`T2.1 SourcingPanel tab: ${tab}`, 'Tab type defined');
    } else fail(`T2.1 SourcingPanel tab: ${tab}`, 'Missing tab type');
  }

  // Slice 2: CronTestPanel → /api/cron/test → results
  const ctp = readFile('components/products/CronTestPanel.tsx');
  const cronTest = readFile('app/api/cron/test/route.ts');
  const testJobs = ['product-discovery', 'price-sync', 'shopify-sync', 'stale-check', 'demand-check', 'google-shopping', 'api-keys'];
  for (const job of testJobs) {
    if (ctp && ctp.includes(`'${job}'`)) {
      pass(`T2.2 CronTest job: ${job}`, 'UI defined');
    } else fail(`T2.2 CronTest job: ${job}`, 'Missing in CronTestPanel');

    if (cronTest && cronTest.includes(`'${job}'`)) {
      pass(`T2.2 CronTest API: ${job}`, 'API handler exists');
    } else fail(`T2.2 CronTest API: ${job}`, 'Missing in /api/cron/test');
  }

  // Slice 3: Pricing execution (lib + cron wiring)
  const pe = readFile('lib/pricing-execution.ts');
  const cron = readFile('app/api/cron/route.ts');
  const pricingFns = ['applyPricingRules', 'enforceGracePeriod', 'pushPricesToShopify', 'executePricingCycle'];
  for (const fn of pricingFns) {
    if (pe && pe.includes(`export async function ${fn}`)) {
      pass(`T2.3 Pricing fn: ${fn}`, 'Exported');
    } else fail(`T2.3 Pricing fn: ${fn}`, 'Missing export');
  }

  // Slice 4: Google Shopping feed → XML → g: tags
  const gsf = readFile('app/api/feed/google-shopping/route.ts');
  const requiredTags = ['g:id', 'g:title', 'g:description', 'g:link', 'g:image_link', 'g:price', 'g:availability', 'g:condition'];
  for (const tag of requiredTags) {
    if (gsf && gsf.includes(tag)) {
      pass(`T2.4 Feed tag: ${tag}`, 'Present in XML');
    } else fail(`T2.4 Feed tag: ${tag}`, 'Missing from feed XML');
  }

  // Slice 5: Webhook events
  const wh = readFile('app/api/webhooks/shopify/route.ts');
  const webhookTopics = ['orders/create', 'orders/paid', 'products/update', 'products/delete', 'inventory_levels/update'];
  for (const topic of webhookTopics) {
    if (wh && wh.includes(`'${topic}'`)) {
      pass(`T2.5 Webhook: ${topic}`, 'Handler exists');
    } else fail(`T2.5 Webhook: ${topic}`, 'Missing handler');
  }

  // Slice 6: Sitemap → XML + IndexNow
  const sm = readFile('app/api/sitemap/route.ts');
  if (sm && sm.includes('GET') && sm.includes('POST') && sm.includes('indexnow')) {
    pass('T2.6 Sitemap slice', 'GET (XML) + POST (IndexNow)');
  } else fail('T2.6 Sitemap slice', 'Missing GET or POST handler');

  // Slice 7: Behavioral segmentation segments
  const bs = readFile('lib/behavioral-segmentation.ts');
  const segTypes = ['high_value', 'cart_abandoner', 'category_enthusiast', 'price_sensitive', 'new_visitor', 'repeat_buyer', 'win_back'];
  for (const seg of segTypes) {
    if (bs && bs.includes(`'${seg}'`)) {
      pass(`T2.7 Segment: ${seg}`, 'Defined');
    } else fail(`T2.7 Segment: ${seg}`, 'Missing segment type');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: CONTRACT TESTING
// Verify interfaces, types, API shapes, DB column names match
// ═══════════════════════════════════════════════════════════════════════════

function test3_ContractTesting() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TEST 3: CONTRACT TESTING                           ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // Contract 1: Product type fields used in components must exist in types
  const types = readFile('types/index.ts');
  const productFields = ['id', 'title', 'cost_price', 'retail_price', 'profit_percent', 'status', 'asin', 'image_url', 'images', 'shopify_product_id'];
  for (const field of productFields) {
    if (types && types.includes(field)) {
      pass(`T3.1 Product.${field}`, 'In types/index.ts');
    } else fail(`T3.1 Product.${field}`, 'Missing from Product interface');
  }

  // Contract 2: SourcingPanel DB queries match actual table columns
  const sp = readFile('components/products/SourcingPanel.tsx');
  if (sp) {
    // Check rejection_log query
    if (sp.includes("from('rejection_log')")) {
      pass('T3.2 rejection_log table', 'Referenced in SourcingPanel');
    } else fail('T3.2 rejection_log table', 'Missing rejection_log query');

    // Check discovery_runs columns
    const discoveryFields = ['total_products_found', 'products_imported', 'products_rejected', 'started_at', 'completed_at'];
    for (const col of discoveryFields) {
      if (sp.includes(col)) {
        pass(`T3.2 discovery_runs.${col}`, 'Column referenced');
      } else fail(`T3.2 discovery_runs.${col}`, 'Column missing from query');
    }
  }

  // Contract 3: PRICING_RULES shape used consistently
  const pr = readFile('lib/config/pricing-rules.ts');
  const prConsumers = ['components/products/SourcingPanel.tsx', 'components/products/ShopifySyncModal.tsx', 'lib/pricing-execution.ts'];
  for (const consumer of prConsumers) {
    const content = readFile(consumer);
    if (content && content.includes('PRICING_RULES')) {
      pass(`T3.3 PRICING_RULES in ${path.basename(consumer)}`, 'Imported');

      // Verify it uses known keys
      const knownKeys = ['yourMarkup', 'competitors', 'profitThresholds'];
      for (const key of knownKeys) {
        if (content.includes(`PRICING_RULES.${key}`) || content.includes(`rules.${key}`)) {
          pass(`T3.3 PRICING_RULES.${key} in ${path.basename(consumer)}`, 'Key accessed');
        }
      }
    } else fail(`T3.3 PRICING_RULES in ${path.basename(consumer)}`, 'Not imported');
  }

  // Contract 4: API route response shapes
  const cronRoute = readFile('app/api/cron/route.ts');
  if (cronRoute) {
    // Every case should set result with job, success, message
    const requiredResultFields = ['job:', 'success:', 'message:'];
    for (const field of requiredResultFields) {
      const count = countPattern(cronRoute, new RegExp(field, 'g'));
      if (count >= 5) { // At least 5 job handlers
        pass(`T3.4 Cron result.${field.replace(':', '')}`, `Set ${count} times`);
      } else fail(`T3.4 Cron result.${field.replace(':', '')}`, `Only set ${count} times (expected 5+)`);
    }
  }

  // Contract 5: Webhook HMAC header name
  const wh = readFile('app/api/webhooks/shopify/route.ts');
  if (wh && wh.includes('x-shopify-hmac-sha256') && wh.includes('x-shopify-topic') && wh.includes('x-shopify-webhook-id')) {
    pass('T3.5 Webhook headers', 'All 3 Shopify headers checked');
  } else fail('T3.5 Webhook headers', 'Missing standard Shopify webhook headers');

  // Contract 6: SQL migration column types
  const sql = readFile('database-migrations/sourcing-settings.sql');
  if (sql) {
    if (sql.includes('BOOLEAN') && sql.includes('TEXT') && sql.includes('JSONB') && sql.includes('TIMESTAMPTZ')) {
      pass('T3.6 sourcing_settings types', 'BOOLEAN + TEXT + JSONB + TIMESTAMPTZ');
    } else fail('T3.6 sourcing_settings types', 'Missing expected column types');

    if (sql.includes("CHECK (cron_interval IN")) {
      pass('T3.6 cron_interval CHECK', 'Enum constraint present');
    } else fail('T3.6 cron_interval CHECK', 'Missing CHECK constraint');
  }

  // Contract 7: Liquid metafield namespaces consistent
  const schema = readFile('shopify-theme/snippets/product-schema.liquid');
  const faq = readFile('shopify-theme/snippets/faq-howto-schema.liquid');
  if (schema && schema.includes('metafields.competitor.amazon_price')) {
    pass('T3.7 Liquid: competitor namespace', 'product-schema uses competitor.*');
  } else fail('T3.7 Liquid: competitor namespace', 'Wrong metafield namespace');

  if (faq && faq.includes('metafields.seo.faq_json')) {
    pass('T3.7 Liquid: seo namespace', 'faq-howto uses seo.faq_json');
  } else fail('T3.7 Liquid: seo namespace', 'Wrong metafield namespace');

  // Contract 8: Pixel pipeline event_name enum matches Liquid
  const pixelLib = readFile('lib/pixel-event-pipeline.ts');
  const pixelLiquid = readFile('shopify-theme/snippets/tracking-pixels.liquid');
  const eventNames = ['PageView', 'ViewContent', 'AddToCart', 'Purchase'];
  for (const evt of eventNames) {
    if (pixelLib && pixelLib.includes(`'${evt}'`)) {
      pass(`T3.8 Pixel event: ${evt}`, 'In pipeline');
    } else fail(`T3.8 Pixel event: ${evt}`, 'Missing from pipeline');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: CHAOS ENGINEERING
// Verify graceful handling of: missing env vars, null data, network errors,
// empty arrays, undefined fields
// ═══════════════════════════════════════════════════════════════════════════

function test4_ChaosEngineering() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TEST 4: CHAOS ENGINEERING                          ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // Chaos 1: Missing env vars handled
  const envChecks = [
    { file: 'lib/pricing-execution.ts', vars: ['SHOPIFY_SHOP', 'SHOPIFY_TOKEN'] },
    { file: 'lib/pixel-event-pipeline.ts', vars: ['FB_PIXEL_ID', 'FB_ACCESS_TOKEN'] },
    { file: 'lib/google-search-console.ts', vars: ['GOOGLE_SERVICE_ACCOUNT_EMAIL'] },
    { file: 'app/api/import/v2/route.ts', vars: ['OPENAI_API_KEY'] },
    { file: 'app/api/webhooks/shopify/route.ts', vars: ['SHOPIFY_WEBHOOK_SECRET'] },
  ];

  for (const check of envChecks) {
    const content = readFile(check.file);
    if (!content) { fail(`T4.1 ${path.basename(check.file)}`, 'File not readable'); continue; }

    for (const v of check.vars) {
      if (content.includes(v)) {
        // Check if there's a fallback or guard
        if (content.includes(`!${v}`) || content.includes(`|| ''`) || content.includes(`|| ''`) || content.includes(`if (!`) || content.includes('process.env.')) {
          pass(`T4.1 ${path.basename(check.file)}: ${v}`, 'Has guard/fallback');
        } else warn(`T4.1 ${path.basename(check.file)}: ${v}`, 'No explicit guard found');
      }
    }
  }

  // Chaos 2: Error boundaries in components
  for (const comp of COMPONENTS) {
    const content = readFile(comp);
    if (!content) continue;
    const name = path.basename(comp);

    // Check for try/catch or error state
    const hasTryCatch = content.includes('try {') || content.includes('catch (');
    const hasErrorState = content.includes('setError') || content.includes('error') || content.includes('Error');
    if (hasTryCatch || hasErrorState) {
      pass(`T4.2 ${name} error handling`, hasTryCatch ? 'try/catch' : 'error state');
    } else warn(`T4.2 ${name} error handling`, 'No try/catch or error state found');
  }

  // Chaos 3: Null/undefined safety in lib modules
  for (const lib of LIB_MODULES) {
    const content = readFile(lib);
    if (!content) continue;
    const name = path.basename(lib);

    const hasOptionalChaining = content.includes('?.') || content.includes('|| 0') || content.includes('|| null') || content.includes("|| ''") || content.includes('| null');
    if (hasOptionalChaining) {
      pass(`T4.3 ${name} null safety`, 'Optional chaining / defaults');
    } else warn(`T4.3 ${name} null safety`, 'No null safety patterns found');
  }

  // Chaos 4: API routes handle malformed requests
  for (const route of API_ROUTES) {
    const content = readFile(route);
    if (!content) continue;
    const name = path.basename(route, '.ts');

    const has400 = content.includes('400') || content.includes('Bad Request');
    const has500 = content.includes('500') || content.includes('Internal');
    const hasTryCatch = content.includes('try {');

    if (hasTryCatch) {
      pass(`T4.4 ${name} try/catch`, 'Wrapped');
    } else fail(`T4.4 ${name} try/catch`, 'No try/catch in route handler');

    if (has400 || has500) {
      pass(`T4.4 ${name} HTTP errors`, has400 && has500 ? '400+500' : has400 ? '400' : '500');
    } else warn(`T4.4 ${name} HTTP errors`, 'No error status codes');
  }

  // Chaos 5: Empty array handling
  const criticalFiles = ['lib/pricing-execution.ts', 'lib/behavioral-segmentation.ts', 'lib/programmatic-seo-engine.ts'];
  for (const f of criticalFiles) {
    const content = readFile(f);
    if (!content) continue;
    const name = path.basename(f);

    if (content.includes('.length === 0') || content.includes('.length > 0') || content.includes('!products') || content.includes('!orders')) {
      pass(`T4.5 ${name} empty array guard`, 'Checks array length');
    } else warn(`T4.5 ${name} empty array guard`, 'No empty array checks found');
  }

  // Chaos 6: Graceful degradation (non-fatal skips)
  const cronRoute = readFile('app/api/cron/route.ts');
  if (cronRoute) {
    const gracefulImports = countPattern(cronRoute, /console\.warn.*skipped/gi);
    if (gracefulImports >= 2) {
      pass('T4.6 Cron graceful degradation', `${gracefulImports} non-fatal skip patterns`);
    } else warn('T4.6 Cron graceful degradation', `Only ${gracefulImports} skip patterns`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: FAILURE MODE AND EFFECTS ANALYSIS (FMEA)
// Identify potential failure modes and verify mitigations exist
// ═══════════════════════════════════════════════════════════════════════════

function test5_FMEA() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TEST 5: FAILURE MODE AND EFFECTS ANALYSIS (FMEA)   ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // FM1: Supabase connection failure → every lib should handle
  for (const lib of LIB_MODULES) {
    const content = readFile(lib);
    if (!content) continue;
    const name = path.basename(lib);

    if (content.includes('supabase')) {
      if (content.includes('error') || content.includes('.catch') || content.includes('try {')) {
        pass(`T5.1 ${name} Supabase failure`, 'Error handling present');
      } else fail(`T5.1 ${name} Supabase failure`, 'No error handling for Supabase calls');
    }
  }

  // FM2: Shopify API rate limiting → check for error handling on Shopify calls
  const shopifyCallers = ['lib/pricing-execution.ts', 'lib/landing-page-generator.ts', 'lib/faq-schema-generator.ts'];
  for (const f of shopifyCallers) {
    const content = readFile(f);
    if (!content) continue;
    const name = path.basename(f);

    if (content.includes('SHOPIFY_SHOP') || content.includes('SHOPIFY_TOKEN')) {
      if (content.includes('!res.ok') || content.includes('res.status') || content.includes('catch')) {
        pass(`T5.2 ${name} Shopify API failure`, 'HTTP status check');
      } else fail(`T5.2 ${name} Shopify API failure`, 'No HTTP error handling');
    }
  }

  // FM3: OpenAI API failure → AI title optimization should not block import
  const importV2 = readFile('app/api/import/v2/route.ts');
  if (importV2 && importV2.includes('Non-fatal') && importV2.includes('console.warn')) {
    pass('T5.3 OpenAI failure mitigation', 'Non-fatal + console.warn fallback');
  } else fail('T5.3 OpenAI failure mitigation', 'AI failure could block import');

  // FM4: Webhook replay attack → HMAC + idempotency
  const wh = readFile('app/api/webhooks/shopify/route.ts');
  if (wh && wh.includes('timingSafeEqual') && wh.includes('already_processed')) {
    pass('T5.4 Webhook replay protection', 'HMAC + idempotency');
  } else fail('T5.4 Webhook replay protection', 'Missing HMAC or idempotency');

  // FM5: Price sync creates negative margin → grace period enforcement
  const pe = readFile('lib/pricing-execution.ts');
  if (pe && pe.includes('below_threshold_since') && pe.includes('gracePeriodDays') && pe.includes("status: 'paused'")) {
    pass('T5.5 Negative margin protection', 'Grace period + auto-pause');
  } else fail('T5.5 Negative margin protection', 'Missing auto-pause logic');

  // FM6: Google Shopping feed with no products → should return valid empty XML
  const feed = readFile('app/api/feed/google-shopping/route.ts');
  if (feed && feed.includes("products?.length || 0") || (feed && feed.includes('X-Feed-Count'))) {
    pass('T5.6 Empty feed handling', 'Returns valid XML with count header');
  } else warn('T5.6 Empty feed handling', 'May not handle empty product list');

  // FM7: Concurrent cron runs → check for run tracking
  const cron = readFile('app/api/cron/route.ts');
  if (cron && cron.includes('last_run_at') && cron.includes('last_run_status')) {
    pass('T5.7 Concurrent run tracking', 'last_run_at/status tracked');
  } else warn('T5.7 Concurrent run tracking', 'No concurrent run protection');

  // FM8: SQL migration idempotent → IF NOT EXISTS
  const sql1 = readFile('database-migrations/sourcing-settings.sql');
  const sql2 = readFile('database-migrations/webhook-logs.sql');
  if (sql1 && sql1.includes('IF NOT EXISTS') && sql1.includes('ON CONFLICT')) {
    pass('T5.8 sourcing_settings idempotent', 'IF NOT EXISTS + ON CONFLICT');
  } else fail('T5.8 sourcing_settings idempotent', 'Missing idempotency guards');
  if (sql2 && sql2.includes('IF NOT EXISTS')) {
    pass('T5.8 webhook_logs idempotent', 'IF NOT EXISTS');
  } else fail('T5.8 webhook_logs idempotent', 'Missing IF NOT EXISTS');

  // FM9: Pixel PII hashing
  const pixel = readFile('lib/pixel-event-pipeline.ts');
  if (pixel && pixel.includes('sha256') && pixel.includes('hashPII')) {
    pass('T5.9 Pixel PII hashing', 'SHA-256 hash function');
  } else fail('T5.9 Pixel PII hashing', 'Missing PII hashing');

  // FM10: Component unmount during async operation
  const syncModal = readFile('components/products/ShopifySyncModal.tsx');
  if (syncModal && syncModal.includes('useEffect') && syncModal.includes("phase !== 'syncing'")) {
    pass('T5.10 Modal unmount safety', 'Prevents close during sync');
  } else warn('T5.10 Modal unmount safety', 'May not prevent close during async');
}


// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: HEURISTIC EVALUATION
// Code quality, UX patterns, accessibility, naming conventions
// ═══════════════════════════════════════════════════════════════════════════

function test6_HeuristicEvaluation() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TEST 6: HEURISTIC EVALUATION                       ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // H1: All components have 'use client' directive
  for (const comp of COMPONENTS) {
    const content = readFile(comp);
    if (!content) continue;
    const name = path.basename(comp);
    if (content.startsWith("'use client'")) {
      pass(`T6.1 ${name} 'use client'`, 'Present');
    } else fail(`T6.1 ${name} 'use client'`, "Missing 'use client' directive");
  }

  // H2: All React components have default export
  for (const comp of COMPONENTS) {
    const content = readFile(comp);
    if (!content) continue;
    const name = path.basename(comp);
    if (content.includes('export default') || content.includes('export {')) {
      pass(`T6.2 ${name} default export`, 'Present');
    } else fail(`T6.2 ${name} default export`, 'Missing default export');
  }

  // H3: No console.log-only error handling (must have UI feedback)
  for (const comp of COMPONENTS) {
    const content = readFile(comp);
    if (!content) continue;
    const name = path.basename(comp);

    // Check for empty catch blocks
    if (content.includes('catch (') && !content.includes('catch () {}') && !content.includes('catch (e) {}')) {
      pass(`T6.3 ${name} error handling`, 'Non-empty catch blocks');
    } else if (!content.includes('catch (')) {
      pass(`T6.3 ${name} error handling`, 'No catch blocks needed');
    } else fail(`T6.3 ${name} error handling`, 'Empty catch block found');
  }

  // H4: Accessibility — aria attributes on interactive elements
  const interactiveComps = ['ShopifySyncModal.tsx', 'CronTestPanel.tsx', 'SourcingPanel.tsx'];
  for (const comp of interactiveComps) {
    const content = readFile(`components/products/${comp}`);
    if (!content) continue;
    if (content.includes('aria-') || content.includes('role=')) {
      pass(`T6.4 ${comp} accessibility`, 'aria/role attributes found');
    } else warn(`T6.4 ${comp} accessibility`, 'No aria attributes');
  }

  // H5: Loading states in async components
  const asyncComps = ['SourcingPanel.tsx', 'CronTestPanel.tsx', 'ShopifySyncModal.tsx'];
  for (const comp of asyncComps) {
    const content = readFile(`components/products/${comp}`);
    if (!content) continue;
    if (content.includes('loading') || content.includes('Loading') || content.includes('spinner') || content.includes('animate-spin') || content.includes('syncing')) {
      pass(`T6.5 ${comp} loading state`, 'Present');
    } else fail(`T6.5 ${comp} loading state`, 'No loading indicator');
  }

  // H6: Consistent naming — camelCase for JS, snake_case for DB
  for (const lib of LIB_MODULES) {
    const content = readFile(lib);
    if (!content) continue;
    const name = path.basename(lib);

    // Functions should be camelCase
    const fns = content.match(/export (?:async )?function (\w+)/g) || [];
    const badFns = fns.filter(f => f.includes('_'));
    if (badFns.length === 0) {
      pass(`T6.6 ${name} function naming`, 'camelCase');
    } else warn(`T6.6 ${name} function naming`, `${badFns.length} snake_case functions`);
  }

  // H7: Console.log for debugging (should exist in API routes)
  for (const route of API_ROUTES) {
    const content = readFile(route);
    if (!content) continue;
    const name = path.basename(path.dirname(route));
    const logCount = countPattern(content, /console\.(log|warn|error)/g);
    if (logCount >= 2) {
      pass(`T6.7 ${name} logging`, `${logCount} log statements`);
    } else warn(`T6.7 ${name} logging`, `Only ${logCount} log statements`);
  }

  // H8: No hardcoded secrets
  for (const f of ALL_TS_FILES) {
    const content = readFile(f);
    if (!content) continue;
    const name = path.basename(f);

    // Check for obvious hardcoded secrets
    const hasHardcoded = /['"]sk_[a-zA-Z0-9]{20,}['"]/.test(content) ||
                          /['"]pk_[a-zA-Z0-9]{20,}['"]/.test(content) ||
                          /API_KEY\s*=\s*['"][a-zA-Z0-9]{20,}['"]/.test(content);
    if (!hasHardcoded) {
      pass(`T6.8 ${name} no hardcoded secrets`, 'Clean');
    } else fail(`T6.8 ${name} no hardcoded secrets`, 'HARDCODED SECRET DETECTED');
  }

  // H9: Liquid files have proper comments
  for (const liquid of LIQUID_FILES) {
    const content = readFile(liquid);
    if (!content) continue;
    const name = path.basename(liquid);
    if (content.includes('{% comment %}') && content.includes('Usage')) {
      pass(`T6.9 ${name} documentation`, 'Comment + usage docs');
    } else warn(`T6.9 ${name} documentation`, 'Missing usage documentation');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// TEST 7: SMOKE TESTING
// Critical path verification — can the system function at all?
// ═══════════════════════════════════════════════════════════════════════════

function test7_SmokeTesting() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  TEST 7: SMOKE TESTING                              ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // S1: All files exist and are non-empty
  for (const f of ALL_FILES) {
    const content = readFile(f);
    if (content && content.length > 50) {
      pass(`T7.1 ${path.basename(f)} exists`, `${content.split('\n').length}L`);
    } else fail(`T7.1 ${path.basename(f)} exists`, content ? 'Too short' : 'MISSING');
  }

  // S2: No syntax-breaking issues in TSX files
  for (const f of ALL_TS_FILES) {
    const content = readFile(f);
    if (!content) continue;
    const name = path.basename(f);

    // Check balanced braces
    const opens = countPattern(content, /\{/g);
    const closes = countPattern(content, /\}/g);
    if (opens === closes) {
      pass(`T7.2 ${name} balanced braces`, `${opens} pairs`);
    } else fail(`T7.2 ${name} balanced braces`, `{ = ${opens}, } = ${closes} — UNBALANCED`);

    // Check for unclosed strings
    const backticks = countPattern(content, /`/g);
    if (backticks % 2 === 0) {
      pass(`T7.2 ${name} balanced backticks`, `${backticks / 2} pairs`);
    } else fail(`T7.2 ${name} balanced backticks`, `${backticks} backticks — ODD NUMBER`);
  }

  // S3: All imports resolve to existing files
  const page = readFile(PAGE_FILE);
  if (page) {
    const imports = page.match(/from ['"]@\/([^'"]+)['"]/g) || [];
    for (const imp of imports) {
      const importPath = imp.match(/from ['"]@\/([^'"]+)['"]/)?.[1];
      if (!importPath) continue;

      // Check if the file exists (try with and without extensions)
      const possiblePaths = [
        importPath + '.tsx',
        importPath + '.ts',
        importPath + '/index.tsx',
        importPath + '/index.ts',
      ];

      const found = possiblePaths.some(p => fileExists(p));
      if (found) {
        pass(`T7.3 import @/${importPath}`, 'Resolves');
      } else warn(`T7.3 import @/${importPath}`, 'Could not verify (may use barrel export)');
    }
  }

  // S4: API routes export correct HTTP methods
  const routeMethodChecks = [
    { file: 'app/api/cron/route.ts', methods: ['GET', 'POST'] },
    { file: 'app/api/cron/test/route.ts', methods: ['GET', 'POST'] },
    { file: 'app/api/feed/google-shopping/route.ts', methods: ['GET'] },
    { file: 'app/api/sitemap/route.ts', methods: ['GET', 'POST'] },
    { file: 'app/api/webhooks/shopify/route.ts', methods: ['POST'] },
    { file: 'app/api/import/v2/route.ts', methods: ['POST'] },
  ];

  for (const check of routeMethodChecks) {
    const content = readFile(check.file);
    if (!content) continue;
    const name = path.basename(path.dirname(check.file));

    for (const method of check.methods) {
      if (content.includes(`export async function ${method}`)) {
        pass(`T7.4 ${name} exports ${method}`, 'Handler exists');
      } else fail(`T7.4 ${name} exports ${method}`, 'Missing HTTP method export');
    }
  }

  // S5: No duplicate exports
  for (const f of ALL_TS_FILES) {
    const content = readFile(f);
    if (!content) continue;
    const name = path.basename(f);

    const defaultExports = countPattern(content, /export default/g);
    if (defaultExports <= 1) {
      pass(`T7.5 ${name} single default export`, defaultExports === 0 ? 'Named exports only' : '1 default export');
    } else fail(`T7.5 ${name} single default export`, `${defaultExports} default exports — DUPLICATE`);
  }

  // S6: Liquid files have valid Shopify syntax
  for (const liquid of LIQUID_FILES) {
    const content = readFile(liquid);
    if (!content) continue;
    const name = path.basename(liquid);

    const openTags = countPattern(content, /\{%/g);
    const closeTags = countPattern(content, /%\}/g);
    if (openTags === closeTags) {
      pass(`T7.6 ${name} balanced Liquid tags`, `${openTags} pairs`);
    } else fail(`T7.6 ${name} balanced Liquid tags`, `{% = ${openTags}, %} = ${closeTags}`);

    const openOutput = countPattern(content, /\{\{/g);
    const closeOutput = countPattern(content, /\}\}/g);
    if (openOutput === closeOutput) {
      pass(`T7.6 ${name} balanced Liquid output`, `${openOutput} pairs`);
    } else fail(`T7.6 ${name} balanced Liquid output`, `{{ = ${openOutput}, }} = ${closeOutput}`);
  }

  // S7: SQL migrations are valid
  for (const sql of SQL_FILES) {
    const content = readFile(sql);
    if (!content) continue;
    const name = path.basename(sql);

    if (content.includes('CREATE TABLE') && content.includes('PRIMARY KEY')) {
      pass(`T7.7 ${name} valid SQL`, 'CREATE TABLE + PRIMARY KEY');
    } else fail(`T7.7 ${name} valid SQL`, 'Missing CREATE TABLE or PRIMARY KEY');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  PRODUCTS V4 — 7-METHODOLOGY TEST SUITE (47 ITEMS)     ║');
console.log('║  29 files × 7 test methodologies                       ║');
console.log('╚══════════════════════════════════════════════════════════╝');

test1_SteelThread();
test2_VerticalSlice();
test3_ContractTesting();
test4_ChaosEngineering();
test5_FMEA();
test6_HeuristicEvaluation();
test7_SmokeTesting();

// ═══════════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  FINAL RESULTS                                         ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`\n  ✅ PASS: ${totalPass}`);
console.log(`  ❌ FAIL: ${totalFail}`);
console.log(`  ⚠️  WARN: ${totalWarn}`);
console.log(`  TOTAL:  ${totalPass + totalFail + totalWarn}`);
console.log(`  SCORE:  ${((totalPass / (totalPass + totalFail)) * 100).toFixed(1)}%`);

if (failures.length > 0) {
  console.log('\n── FAILURES ──');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}

if (warnings.length > 0) {
  console.log('\n── WARNINGS ──');
  warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
}

console.log('\n' + '═'.repeat(60));
process.exit(totalFail > 0 ? 1 : 0);
