// lib/category-mapping.ts
// Amazon to eBay category auto-mapping
// Maps Amazon product categories to eBay category IDs

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CategoryMapping {
  amazonCategory: string;
  ebayId: number;
  ebayName: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface EbayCategory {
  id: number;
  name: string;
  path: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EBAY CATEGORY MAPPING TABLE
// ═══════════════════════════════════════════════════════════════════════════

// Common eBay categories with their IDs
// Reference: https://pages.ebay.com/sellerinformation/growing/categorychanges.html
const EBAY_CATEGORIES: Record<string, EbayCategory> = {
  // Health & Beauty
  'health_beauty': { id: 26395, name: 'Health & Beauty', path: 'Health & Beauty' },
  'vitamins': { id: 180959, name: 'Vitamins & Lifestyle Supplements', path: 'Health & Beauty > Vitamins & Lifestyle Supplements' },
  'skin_care': { id: 11863, name: 'Skin Care', path: 'Health & Beauty > Skin Care' },
  'hair_care': { id: 11854, name: 'Hair Care & Styling', path: 'Health & Beauty > Hair Care & Styling' },
  'makeup': { id: 31786, name: 'Makeup', path: 'Health & Beauty > Makeup' },
  'medical_supplies': { id: 67588, name: 'Medical & Mobility', path: 'Health & Beauty > Medical & Mobility' },
  'personal_care': { id: 47091, name: 'Health Care', path: 'Health & Beauty > Health Care' },
  'oral_care': { id: 31769, name: 'Oral Care', path: 'Health & Beauty > Oral Care' },
  'fragrances': { id: 11848, name: 'Fragrances', path: 'Health & Beauty > Fragrances' },
  
  // Home & Garden
  'home_garden': { id: 11700, name: 'Home & Garden', path: 'Home & Garden' },
  'kitchen': { id: 20625, name: 'Kitchen, Dining & Bar', path: 'Home & Garden > Kitchen, Dining & Bar' },
  'bedding': { id: 20469, name: 'Bedding', path: 'Home & Garden > Bedding' },
  'bath': { id: 20562, name: 'Bath', path: 'Home & Garden > Bath' },
  'home_decor': { id: 10033, name: 'Home Décor', path: 'Home & Garden > Home Décor' },
  'storage': { id: 20602, name: 'Household Supplies & Cleaning', path: 'Home & Garden > Household Supplies & Cleaning' },
  'garden': { id: 159912, name: 'Yard, Garden & Outdoor Living', path: 'Home & Garden > Yard, Garden & Outdoor Living' },
  'furniture': { id: 3197, name: 'Furniture', path: 'Home & Garden > Furniture' },
  'lighting': { id: 20697, name: 'Lamps, Lighting & Ceiling Fans', path: 'Home & Garden > Lamps, Lighting & Ceiling Fans' },
  'tools': { id: 631, name: 'Tools & Workshop Equipment', path: 'Home & Garden > Tools & Workshop Equipment' },
  
  // Electronics
  'electronics': { id: 293, name: 'Consumer Electronics', path: 'Consumer Electronics' },
  'cell_phones': { id: 15032, name: 'Cell Phones & Accessories', path: 'Cell Phones & Accessories' },
  'computers': { id: 58058, name: 'Computers/Tablets & Networking', path: 'Computers/Tablets & Networking' },
  'cameras': { id: 625, name: 'Cameras & Photo', path: 'Cameras & Photo' },
  'tv_video': { id: 32852, name: 'TV, Video & Home Audio', path: 'Consumer Electronics > TV, Video & Home Audio' },
  'headphones': { id: 112529, name: 'Portable Audio & Headphones', path: 'Consumer Electronics > Portable Audio & Headphones' },
  'smart_home': { id: 175574, name: 'Smart Home', path: 'Home & Garden > Smart Home' },
  
  // Sports & Outdoors
  'sports': { id: 888, name: 'Sporting Goods', path: 'Sporting Goods' },
  'fitness': { id: 15273, name: 'Fitness, Running & Yoga', path: 'Sporting Goods > Fitness, Running & Yoga' },
  'outdoor': { id: 159043, name: 'Outdoor Sports', path: 'Sporting Goods > Outdoor Sports' },
  'cycling': { id: 7294, name: 'Cycling', path: 'Sporting Goods > Cycling' },
  'camping': { id: 16034, name: 'Camping & Hiking', path: 'Sporting Goods > Camping & Hiking' },
  'fishing': { id: 1492, name: 'Fishing', path: 'Sporting Goods > Fishing' },
  'golf': { id: 1513, name: 'Golf', path: 'Sporting Goods > Golf' },
  
  // Toys & Games
  'toys': { id: 220, name: 'Toys & Hobbies', path: 'Toys & Hobbies' },
  'games': { id: 233, name: 'Games', path: 'Toys & Hobbies > Games' },
  'puzzles': { id: 2613, name: 'Puzzles', path: 'Toys & Hobbies > Puzzles' },
  'action_figures': { id: 246, name: 'Action Figures', path: 'Toys & Hobbies > Action Figures' },
  'building_toys': { id: 18995, name: 'Building Toys', path: 'Toys & Hobbies > Building Toys' },
  'educational': { id: 11731, name: 'Educational', path: 'Toys & Hobbies > Educational' },
  
  // Pet Supplies
  'pet_supplies': { id: 1281, name: 'Pet Supplies', path: 'Pet Supplies' },
  'dog_supplies': { id: 20742, name: 'Dog Supplies', path: 'Pet Supplies > Dog Supplies' },
  'cat_supplies': { id: 20738, name: 'Cat Supplies', path: 'Pet Supplies > Cat Supplies' },
  'fish_aquatic': { id: 20754, name: 'Fish & Aquariums', path: 'Pet Supplies > Fish & Aquariums' },
  'bird_supplies': { id: 3206, name: 'Bird Supplies', path: 'Pet Supplies > Bird Supplies' },
  
  // Baby
  'baby': { id: 2984, name: 'Baby', path: 'Baby' },
  'baby_feeding': { id: 20394, name: 'Feeding', path: 'Baby > Feeding' },
  'baby_gear': { id: 100223, name: 'Baby Gear', path: 'Baby > Baby Gear' },
  'diapering': { id: 45455, name: 'Diapering', path: 'Baby > Diapering' },
  'baby_safety': { id: 20433, name: 'Baby Safety & Health', path: 'Baby > Baby Safety & Health' },
  
  // Office Products
  'office': { id: 64055, name: 'Business & Industrial', path: 'Business & Industrial > Office' },
  'office_supplies': { id: 95682, name: 'Office Supplies', path: 'Business & Industrial > Office > Office Supplies' },
  'office_furniture': { id: 99268, name: 'Office Furniture', path: 'Business & Industrial > Office > Office Furniture' },
  
  // Automotive
  'automotive': { id: 6000, name: 'eBay Motors', path: 'eBay Motors > Parts & Accessories' },
  'car_care': { id: 180122, name: 'Car & Truck Parts', path: 'eBay Motors > Parts & Accessories > Car & Truck Parts' },
  'car_electronics': { id: 3270, name: 'Car Electronics', path: 'eBay Motors > Parts & Accessories > Car Electronics' },
  
  // Clothing & Accessories
  'clothing': { id: 11450, name: 'Clothing, Shoes & Accessories', path: 'Clothing, Shoes & Accessories' },
  'mens_clothing': { id: 1059, name: "Men's Clothing", path: "Clothing, Shoes & Accessories > Men's Clothing" },
  'womens_clothing': { id: 15724, name: "Women's Clothing", path: "Clothing, Shoes & Accessories > Women's Clothing" },
  'shoes': { id: 93427, name: 'Men\'s Shoes', path: 'Clothing, Shoes & Accessories > Men\'s Shoes' },
  'jewelry': { id: 281, name: 'Jewelry & Watches', path: 'Jewelry & Watches' },
  
  // Arts & Crafts
  'crafts': { id: 14339, name: 'Crafts', path: 'Crafts' },
  'art_supplies': { id: 28101, name: 'Art Supplies', path: 'Crafts > Art Supplies' },
  'sewing': { id: 160668, name: 'Sewing', path: 'Crafts > Sewing' },
  'scrapbooking': { id: 11788, name: 'Scrapbooking & Paper Crafts', path: 'Crafts > Scrapbooking & Paper Crafts' },
  
  // Books & Media
  'books': { id: 267, name: 'Books', path: 'Books' },
  'music': { id: 11233, name: 'Music', path: 'Music' },
  'movies': { id: 11232, name: 'Movies & TV', path: 'Movies & TV' },
  'video_games': { id: 1249, name: 'Video Games & Consoles', path: 'Video Games & Consoles' },
  
  // Default/Other
  'other': { id: 99, name: 'Everything Else', path: 'Everything Else' },
};

// ═══════════════════════════════════════════════════════════════════════════
// AMAZON CATEGORY PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

// Maps Amazon category keywords to eBay category keys
const AMAZON_TO_EBAY_PATTERNS: Array<{
  patterns: RegExp[];
  ebayKey: string;
  confidence: 'high' | 'medium' | 'low';
}> = [
  // Health & Personal Care
  { patterns: [/vitamin/i, /supplement/i, /dietary/i], ebayKey: 'vitamins', confidence: 'high' },
  { patterns: [/skin\s*care/i, /moisturizer/i, /serum/i, /face\s*cream/i], ebayKey: 'skin_care', confidence: 'high' },
  { patterns: [/hair\s*care/i, /shampoo/i, /conditioner/i, /hair\s*styling/i], ebayKey: 'hair_care', confidence: 'high' },
  { patterns: [/makeup/i, /cosmetic/i, /lipstick/i, /foundation/i, /mascara/i], ebayKey: 'makeup', confidence: 'high' },
  { patterns: [/medical/i, /first\s*aid/i, /bandage/i, /health\s*monitor/i], ebayKey: 'medical_supplies', confidence: 'high' },
  { patterns: [/toothbrush/i, /toothpaste/i, /dental/i, /oral\s*care/i, /mouthwash/i], ebayKey: 'oral_care', confidence: 'high' },
  { patterns: [/perfume/i, /cologne/i, /fragrance/i], ebayKey: 'fragrances', confidence: 'high' },
  { patterns: [/health\s*&?\s*personal\s*care/i, /personal\s*care/i], ebayKey: 'personal_care', confidence: 'medium' },
  { patterns: [/health\s*&?\s*household/i, /household/i], ebayKey: 'health_beauty', confidence: 'medium' },
  { patterns: [/beauty/i], ebayKey: 'health_beauty', confidence: 'medium' },
  
  // Home & Kitchen
  { patterns: [/kitchen/i, /cookware/i, /bakeware/i, /dining/i, /utensil/i], ebayKey: 'kitchen', confidence: 'high' },
  { patterns: [/bedding/i, /sheets/i, /pillows?/i, /comforter/i, /duvet/i], ebayKey: 'bedding', confidence: 'high' },
  { patterns: [/bath/i, /towel/i, /shower/i, /bathroom/i], ebayKey: 'bath', confidence: 'high' },
  { patterns: [/home\s*d[eé]cor/i, /decoration/i, /wall\s*art/i, /candle/i], ebayKey: 'home_decor', confidence: 'high' },
  { patterns: [/storage/i, /organiz/i, /cleaning/i, /laundry/i], ebayKey: 'storage', confidence: 'high' },
  { patterns: [/garden/i, /outdoor/i, /patio/i, /lawn/i, /plant/i], ebayKey: 'garden', confidence: 'high' },
  { patterns: [/furniture/i, /chair/i, /table/i, /desk/i, /shelf/i], ebayKey: 'furniture', confidence: 'high' },
  { patterns: [/lamp/i, /lighting/i, /light\s*bulb/i, /ceiling\s*fan/i], ebayKey: 'lighting', confidence: 'high' },
  { patterns: [/tool/i, /hardware/i, /drill/i, /saw/i, /wrench/i], ebayKey: 'tools', confidence: 'high' },
  { patterns: [/home\s*&?\s*kitchen/i, /home\s*improvement/i], ebayKey: 'home_garden', confidence: 'medium' },
  
  // Electronics
  { patterns: [/cell\s*phone/i, /mobile\s*phone/i, /smartphone/i, /phone\s*case/i], ebayKey: 'cell_phones', confidence: 'high' },
  { patterns: [/computer/i, /laptop/i, /tablet/i, /pc/i, /monitor/i], ebayKey: 'computers', confidence: 'high' },
  { patterns: [/camera/i, /photography/i, /lens/i, /tripod/i], ebayKey: 'cameras', confidence: 'high' },
  { patterns: [/tv/i, /television/i, /home\s*theater/i, /soundbar/i], ebayKey: 'tv_video', confidence: 'high' },
  { patterns: [/headphone/i, /earbuds?/i, /speaker/i, /audio/i], ebayKey: 'headphones', confidence: 'high' },
  { patterns: [/smart\s*home/i, /alexa/i, /google\s*home/i, /wifi/i, /router/i], ebayKey: 'smart_home', confidence: 'high' },
  { patterns: [/electronics/i], ebayKey: 'electronics', confidence: 'medium' },
  
  // Sports & Outdoors
  { patterns: [/fitness/i, /exercise/i, /yoga/i, /workout/i, /gym/i], ebayKey: 'fitness', confidence: 'high' },
  { patterns: [/cycling/i, /bike/i, /bicycle/i], ebayKey: 'cycling', confidence: 'high' },
  { patterns: [/camping/i, /hiking/i, /tent/i, /backpack/i], ebayKey: 'camping', confidence: 'high' },
  { patterns: [/fishing/i, /fish/i, /angling/i, /tackle/i], ebayKey: 'fishing', confidence: 'high' },
  { patterns: [/golf/i], ebayKey: 'golf', confidence: 'high' },
  { patterns: [/sports?\s*&?\s*outdoors?/i, /sporting\s*goods/i], ebayKey: 'sports', confidence: 'medium' },
  
  // Toys & Games
  { patterns: [/puzzle/i], ebayKey: 'puzzles', confidence: 'high' },
  { patterns: [/action\s*figure/i], ebayKey: 'action_figures', confidence: 'high' },
  { patterns: [/lego/i, /building\s*(block|toy)/i], ebayKey: 'building_toys', confidence: 'high' },
  { patterns: [/educational/i, /learning/i, /stem/i], ebayKey: 'educational', confidence: 'high' },
  { patterns: [/board\s*game/i, /card\s*game/i], ebayKey: 'games', confidence: 'high' },
  { patterns: [/toy/i, /game/i], ebayKey: 'toys', confidence: 'medium' },
  
  // Pet Supplies
  { patterns: [/dog/i, /puppy/i, /canine/i], ebayKey: 'dog_supplies', confidence: 'high' },
  { patterns: [/cat/i, /kitten/i, /feline/i], ebayKey: 'cat_supplies', confidence: 'high' },
  { patterns: [/fish/i, /aquarium/i, /aquatic/i], ebayKey: 'fish_aquatic', confidence: 'high' },
  { patterns: [/bird/i, /parrot/i, /cage/i], ebayKey: 'bird_supplies', confidence: 'high' },
  { patterns: [/pet/i], ebayKey: 'pet_supplies', confidence: 'medium' },
  
  // Baby
  { patterns: [/baby\s*feeding/i, /bottle/i, /formula/i, /nursing/i], ebayKey: 'baby_feeding', confidence: 'high' },
  { patterns: [/stroller/i, /car\s*seat/i, /carrier/i], ebayKey: 'baby_gear', confidence: 'high' },
  { patterns: [/diaper/i, /wipes/i], ebayKey: 'diapering', confidence: 'high' },
  { patterns: [/baby\s*safe/i, /baby\s*monitor/i, /baby\s*gate/i], ebayKey: 'baby_safety', confidence: 'high' },
  { patterns: [/baby/i, /infant/i, /toddler/i], ebayKey: 'baby', confidence: 'medium' },
  
  // Office
  { patterns: [/office\s*supplies/i, /stationery/i, /pen/i, /paper/i], ebayKey: 'office_supplies', confidence: 'high' },
  { patterns: [/office\s*chair/i, /office\s*desk/i], ebayKey: 'office_furniture', confidence: 'high' },
  { patterns: [/office/i, /industrial/i], ebayKey: 'office', confidence: 'medium' },
  
  // Automotive
  { patterns: [/car\s*care/i, /car\s*wash/i, /auto\s*detail/i], ebayKey: 'car_care', confidence: 'high' },
  { patterns: [/car\s*electronics/i, /dash\s*cam/i, /gps/i], ebayKey: 'car_electronics', confidence: 'high' },
  { patterns: [/automotive/i, /car/i, /vehicle/i], ebayKey: 'automotive', confidence: 'medium' },
  
  // Clothing
  { patterns: [/men'?s?\s*clothing/i, /men'?s?\s*shirt/i, /men'?s?\s*pants/i], ebayKey: 'mens_clothing', confidence: 'high' },
  { patterns: [/women'?s?\s*clothing/i, /women'?s?\s*dress/i, /women'?s?\s*shirt/i], ebayKey: 'womens_clothing', confidence: 'high' },
  { patterns: [/shoe/i, /sneaker/i, /boot/i, /sandal/i], ebayKey: 'shoes', confidence: 'high' },
  { patterns: [/jewelry/i, /watch/i, /necklace/i, /bracelet/i, /ring/i], ebayKey: 'jewelry', confidence: 'high' },
  { patterns: [/clothing/i, /apparel/i, /fashion/i], ebayKey: 'clothing', confidence: 'medium' },
  
  // Arts & Crafts
  { patterns: [/art\s*supplies/i, /paint/i, /canvas/i, /brush/i], ebayKey: 'art_supplies', confidence: 'high' },
  { patterns: [/sewing/i, /fabric/i, /thread/i, /needle/i], ebayKey: 'sewing', confidence: 'high' },
  { patterns: [/scrapbook/i, /paper\s*craft/i], ebayKey: 'scrapbooking', confidence: 'high' },
  { patterns: [/craft/i, /diy/i, /hobby/i], ebayKey: 'crafts', confidence: 'medium' },
  
  // Media
  { patterns: [/book/i, /novel/i, /textbook/i], ebayKey: 'books', confidence: 'high' },
  { patterns: [/music/i, /cd/i, /vinyl/i, /record/i], ebayKey: 'music', confidence: 'high' },
  { patterns: [/movie/i, /dvd/i, /blu-?ray/i], ebayKey: 'movies', confidence: 'high' },
  { patterns: [/video\s*game/i, /playstation/i, /xbox/i, /nintendo/i, /gaming/i], ebayKey: 'video_games', confidence: 'high' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAPPING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map Amazon category to eBay category
 */
export function mapCategory(amazonCategory: string): CategoryMapping {
  if (!amazonCategory) {
    return {
      amazonCategory: '',
      ebayId: EBAY_CATEGORIES.other.id,
      ebayName: EBAY_CATEGORIES.other.name,
      confidence: 'low',
    };
  }

  const normalized = amazonCategory.toLowerCase().trim();

  // Try each pattern
  for (const mapping of AMAZON_TO_EBAY_PATTERNS) {
    for (const pattern of mapping.patterns) {
      if (pattern.test(normalized)) {
        const ebayCategory = EBAY_CATEGORIES[mapping.ebayKey];
        return {
          amazonCategory,
          ebayId: ebayCategory.id,
          ebayName: ebayCategory.name,
          confidence: mapping.confidence,
        };
      }
    }
  }

  // Default to "Everything Else"
  return {
    amazonCategory,
    ebayId: EBAY_CATEGORIES.other.id,
    ebayName: EBAY_CATEGORIES.other.name,
    confidence: 'low',
  };
}

/**
 * Map multiple categories at once
 */
export function mapCategories(amazonCategories: string[]): CategoryMapping[] {
  return amazonCategories.map(cat => mapCategory(cat));
}

/**
 * Get best category from product title if category is missing
 */
export function inferCategoryFromTitle(title: string): CategoryMapping {
  return mapCategory(title);
}

/**
 * Get all available eBay categories
 */
export function getEbayCategories(): EbayCategory[] {
  return Object.values(EBAY_CATEGORIES);
}

/**
 * Get eBay category by ID
 */
export function getEbayCategoryById(id: number): EbayCategory | null {
  for (const cat of Object.values(EBAY_CATEGORIES)) {
    if (cat.id === id) {
      return cat;
    }
  }
  return null;
}

/**
 * Search eBay categories by name
 */
export function searchEbayCategories(query: string): EbayCategory[] {
  const normalized = query.toLowerCase();
  return Object.values(EBAY_CATEGORIES).filter(cat =>
    cat.name.toLowerCase().includes(normalized) ||
    cat.path.toLowerCase().includes(normalized)
  );
}
