// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/contracts/constants.ts
// LINES: ~170
// IMPORTS FROM: None (leaf file)
// EXPORTS TO: Every file in the system that needs a threshold, multiplier, rule, or mapping
// DOES: Defines every constant. Pricing multipliers. Title rules (max length, banned words). Description rules. GTIN rules. Gate thresholds. Feed score weights. Google Product Category taxonomy map (90+ entries, most-specific-match). Competitor multipliers.
// DOES NOT: Execute logic. Validate data. Call APIs.
// BREAKS IF: Nothing — pure constants.
// ASSUMES: Nothing.
// LEVEL: 3 — Integrated. Single source of truth for all config values. grep the codebase: if a raw number appears in any other file, it's a violation.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

// ── Pricing ──────────────────────────────────────────────

export const MARKUP = 1.70;

export const COMPETITOR_MULTIPLIERS = {
  amazon: 1.85,
  costco: 1.82,
  ebay: 1.90,
  sams: 1.80,
} as const;

export const LOW_MARGIN_THRESHOLD = 30; // profitPct < 30% = low margin

// ── Title Rules ──────────────────────────────────────────

export const TITLE_MAX_CHARS = 150;
export const TITLE_WARN_CHARS = 180;
export const TITLE_MIN_CHARS = 5;

export const TITLE_BANNED_WORDS = [
  'free shipping', 'best seller', '#1', 'sale', 'discount', 'cheap',
  'buy now', 'limited time', 'hot deal', 'clearance', 'lowest price',
  'best', 'amazing', 'incredible', 'guaranteed', 'buy one get one',
] as const;

export const CAPS_RATIO_THRESHOLD = 0.5; // >50% ALL-CAPS words = flag
export const CAPS_MIN_WORDS = 3;         // Only check if title has 3+ words

// ── Description Rules ────────────────────────────────────

export const DESC_MIN_CHARS = 50;
export const DESC_MAX_CHARS = 5000;
export const DESC_GATE_MIN = 30; // Gate passes at 30+ chars

export const DESC_BOILERPLATE = [
  'about us', 'shipping', 'returns', 'payment', 'contact us',
  'customer satisfaction', 'we offer the best', 'copyright',
  'disclaimer', 'warranty information', 'legal disclaimer', 'note:',
  'important notice', 'seller information',
] as const;

// ── GTIN Rules ───────────────────────────────────────────

export const GTIN_VALID_LENGTHS = [8, 12, 13, 14] as const;
export const GTIN_RESERVED_PREFIXES = ['2', '02', '04'] as const;

// ── Image Rules ──────────────────────────────────────────

export const IMAGE_PASS_COUNT = 3;  // 3+ images = pass gate
export const IMAGE_MIN_COUNT = 1;   // 1 image = warn gate

// ── Feed Score Weights (sum = 100) ───────────────────────

export const FEED_SCORE_WEIGHTS = {
  titleCompliant: 20,    // Title ≤150, no promo, has product type
  descriptionClean: 15,  // Clean desc ≥50 chars, no HTML
  hasImage: 15,          // Has at least 1 image URL
  hasPrice: 15,          // Price > 0
  validGTIN: 15,         // Valid barcode/GTIN
  googleCategory: 10,    // Google Product Category assigned
  hasBrand: 5,           // Vendor not "Unknown"
  hasShipping: 5,        // Shipping info (free shipping = auto-pass)
} as const;

// ── Google Product Category Taxonomy ─────────────────────
// Keys: lowercase search terms matched against tags + title + category
// Values: Google's taxonomy paths. MOST SPECIFIC match wins (longest key).
// Sorted by specificity — the matcher should pick longest matching key.

export const GOOGLE_CATEGORY_MAP: Record<string, string> = {
  // Beauty — most specific first
  'lip gloss': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Lip Makeup > Lip Glosses',
  'lip oil': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Lip Makeup > Lip Glosses',
  'lipstick': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Lip Makeup > Lipstick',
  'eye shadow': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Eye Makeup > Eye Shadow',
  'mascara': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Eye Makeup > Mascara',
  'eyeliner': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Eye Makeup > Eyeliner',
  'foundation': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Face Makeup > Foundation',
  'concealer': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Face Makeup > Concealer',
  'blush': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Face Makeup > Blush',
  'primer': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Face Makeup > Foundation Primers',
  'nail polish': 'Health & Beauty > Personal Care > Cosmetics > Nail Care > Nail Polish',
  'moisturizer': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Facial Moisturizers',
  'sunscreen': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Sunscreen',
  'cleanser': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Facial Cleansers',
  'serum': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Facial Serums',
  'pimple': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Acne Treatments',
  'acne': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Acne Treatments',
  'skin care': 'Health & Beauty > Personal Care > Cosmetics > Skin Care',
  'makeup': 'Health & Beauty > Personal Care > Cosmetics > Makeup',
  'cosmetics': 'Health & Beauty > Personal Care > Cosmetics',
  'shampoo': 'Health & Beauty > Personal Care > Hair Care > Shampoo',
  'conditioner': 'Health & Beauty > Personal Care > Hair Care > Conditioner',
  'hair care': 'Health & Beauty > Personal Care > Hair Care',
  'body wash': 'Health & Beauty > Personal Care > Bath & Bathing > Body Wash & Shower Gel',
  'bath': 'Health & Beauty > Personal Care > Bath & Bathing',
  'toothbrush': 'Health & Beauty > Personal Care > Oral Care > Toothbrushes',
  'toothpaste': 'Health & Beauty > Personal Care > Oral Care > Toothpaste',
  'oral care': 'Health & Beauty > Personal Care > Oral Care',
  'deodorant': 'Health & Beauty > Personal Care > Deodorant & Anti-Perspirant',
  'fragrance': 'Health & Beauty > Personal Care > Fragrance',
  'beauty': 'Health & Beauty > Personal Care',
  'personal care': 'Health & Beauty > Personal Care',
  'health': 'Health & Beauty',
  // Electronics
  'earbuds': 'Electronics > Audio > Headphones & Earbuds',
  'headphone': 'Electronics > Audio > Headphones & Earbuds',
  'speaker': 'Electronics > Audio > Speakers',
  'charger': 'Electronics > Electronics Accessories > Power Adapters & Chargers',
  'cable': 'Electronics > Electronics Accessories > Cables',
  'phone case': 'Electronics > Communications > Phones > Phone Cases',
  'screen protector': 'Electronics > Communications > Phones > Screen Protectors',
  'phone': 'Electronics > Communications > Phones',
  'keyboard': 'Electronics > Computers > Computer Peripherals > Keyboards',
  'mouse': 'Electronics > Computers > Computer Peripherals > Mice',
  'tablet': 'Electronics > Computers > Tablets',
  'electronics': 'Electronics',
  // Home
  'cutting board': 'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cutting Boards',
  'knife': 'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Knives',
  'kitchen': 'Home & Garden > Kitchen & Dining',
  'vacuum': 'Home & Garden > Household Supplies > Cleaning > Vacuum Cleaners',
  'cleaning': 'Home & Garden > Household Supplies > Cleaning',
  'storage': 'Home & Garden > Household Supplies > Storage & Organization',
  'pillow': 'Home & Garden > Bedding > Pillows',
  'bedding': 'Home & Garden > Bedding',
  'led': 'Home & Garden > Lighting > Light Bulbs',
  'light': 'Home & Garden > Lighting',
  'home': 'Home & Garden',
  'garden': 'Home & Garden > Lawn & Garden',
  // Sports & Fitness
  'yoga': 'Sporting Goods > Exercise & Fitness > Yoga & Pilates',
  'resistance band': 'Sporting Goods > Exercise & Fitness > Resistance Bands',
  'dumbbell': 'Sporting Goods > Exercise & Fitness > Free Weights',
  'fitness': 'Sporting Goods > Exercise & Fitness',
  'exercise': 'Sporting Goods > Exercise & Fitness',
  'camping': 'Sporting Goods > Outdoor Recreation > Camping',
  'outdoor': 'Sporting Goods > Outdoor Recreation',
  'sports': 'Sporting Goods',
  // Pets
  'dog': 'Animals & Pet Supplies > Pet Supplies > Dog Supplies',
  'cat': 'Animals & Pet Supplies > Pet Supplies > Cat Supplies',
  'pet': 'Animals & Pet Supplies',
  // Apparel
  'sneaker': 'Apparel & Accessories > Shoes > Sneakers',
  'shoes': 'Apparel & Accessories > Shoes',
  'dress': 'Apparel & Accessories > Clothing > Dresses',
  'shirt': 'Apparel & Accessories > Clothing > Shirts & Tops',
  'clothing': 'Apparel & Accessories > Clothing',
  'necklace': 'Apparel & Accessories > Jewelry > Necklaces',
  'bracelet': 'Apparel & Accessories > Jewelry > Bracelets',
  'earring': 'Apparel & Accessories > Jewelry > Earrings',
  'ring': 'Apparel & Accessories > Jewelry > Rings',
  'watch': 'Apparel & Accessories > Jewelry > Watches',
  'jewelry': 'Apparel & Accessories > Jewelry',
  'backpack': 'Apparel & Accessories > Handbags, Wallets & Cases > Backpacks',
  'wallet': 'Apparel & Accessories > Handbags, Wallets & Cases > Wallets',
  'bag': 'Apparel & Accessories > Handbags, Wallets & Cases',
  'sunglasses': 'Apparel & Accessories > Clothing Accessories > Sunglasses',
  'hat': 'Apparel & Accessories > Clothing Accessories > Hats',
  'belt': 'Apparel & Accessories > Clothing Accessories > Belts',
  'scarf': 'Apparel & Accessories > Clothing Accessories > Scarves',
  // Other
  'baby': 'Baby & Toddler',
  'toys': 'Toys & Games',
  'puzzle': 'Toys & Games > Puzzles',
  'pen': 'Office Supplies > Writing Instruments > Pens',
  'notebook': 'Office Supplies > Paper Products > Notebooks',
  'office': 'Office Supplies',
  'book': 'Media > Books',
  'drill': 'Hardware > Tools > Power Tools > Drills',
  'tool': 'Hardware > Tools',
  'automotive': 'Vehicles & Parts > Vehicle Parts & Accessories',
  'car': 'Vehicles & Parts > Vehicle Parts & Accessories',
  'coffee': 'Food, Beverages & Tobacco > Beverages > Coffee',
  'tea': 'Food, Beverages & Tobacco > Beverages > Tea',
  'snack': 'Food, Beverages & Tobacco > Food Items > Snack Foods',
  'food': 'Food, Beverages & Tobacco > Food Items',
  'supplement': 'Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements',
  'vitamin': 'Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements',
  'protein': 'Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements',
};
