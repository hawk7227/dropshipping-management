// lib/services/amazon-scraper.ts
// COMPLETE Amazon product data scraper - ALL 40 fields for Shopify + eBay listings
// FREE - No API costs, scrapes directly from amazon.com/dp/{ASIN}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES - All 40 fields for complete listings
// ═══════════════════════════════════════════════════════════════════════════

export interface AmazonScrapedProduct {
  // ─────────────────────────────────────────────────────────────────────────
  // IDENTIFIERS (4 fields)
  // ─────────────────────────────────────────────────────────────────────────
  asin: string;                    // 1. Amazon Standard ID
  upc: string | null;              // 2. Universal Product Code (barcode)
  ean: string | null;              // 3. European Article Number
  mpn: string | null;              // 4. Manufacturer Part Number

  // ─────────────────────────────────────────────────────────────────────────
  // BASIC INFO (5 fields)
  // ─────────────────────────────────────────────────────────────────────────
  title: string | null;            // 5. Product title
  brand: string | null;            // 6. Brand name (Vendor for Shopify)
  category: string | null;         // 7. Product category
  description: string | null;      // 8. Full description text
  bulletPoints: string[];          // 9. Feature bullet points

  // ─────────────────────────────────────────────────────────────────────────
  // PRICING (3 fields)
  // ─────────────────────────────────────────────────────────────────────────
  price: number | null;            // 10. Current/sale price
  listPrice: number | null;        // 11. Original MSRP (Compare At)
  currency: string;                // Currency code (USD)

  // ─────────────────────────────────────────────────────────────────────────
  // IMAGES (5 fields)
  // ─────────────────────────────────────────────────────────────────────────
  mainImage: string | null;        // 13. Main product image
  images: string[];                // 14-17. All product images (up to 7+)

  // ─────────────────────────────────────────────────────────────────────────
  // DIMENSIONS & WEIGHT (5 fields)
  // ─────────────────────────────────────────────────────────────────────────
  weightOz: number | null;         // 18. Weight in ounces
  weightLb: number | null;         // Weight in pounds
  weightGrams: number | null;      // Weight in grams (for Shopify)
  dimensions: string | null;       // 19-21. Raw dimensions string "L x W x H"
  dimensionsParsed: {              // Parsed dimensions
    length: number | null;         // 19. Length in inches
    width: number | null;          // 20. Width in inches
    height: number | null;         // 21. Height in inches
    unit: string;
  } | null;
  packageDimensions: string | null; // 22. Package/shipping dimensions

  // ─────────────────────────────────────────────────────────────────────────
  // SOCIAL PROOF (3 fields)
  // ─────────────────────────────────────────────────────────────────────────
  rating: number | null;           // 23. Star rating (1-5)
  reviewCount: number | null;      // 24. Number of reviews/ratings
  isPrime: boolean;                // 27. Prime eligible

  // ─────────────────────────────────────────────────────────────────────────
  // AVAILABILITY (2 fields)
  // ─────────────────────────────────────────────────────────────────────────
  availability: string | null;     // 25. Availability text
  inStock: boolean;                // In stock status
  stockQuantity: number | null;    // 26. "Only X left" quantity

  // ─────────────────────────────────────────────────────────────────────────
  // VARIANTS (3 fields)
  // ─────────────────────────────────────────────────────────────────────────
  colors: string[];                // 28. Available colors
  sizes: string[];                 // 29. Available sizes
  styles: string[];                // 30. Available styles

  // ─────────────────────────────────────────────────────────────────────────
  // ADDITIONAL DETAILS (6 fields)
  // ─────────────────────────────────────────────────────────────────────────
  material: string | null;         // 31. Material
  countryOfOrigin: string | null;  // 32. Country of origin
  manufacturer: string | null;     // 33. Manufacturer
  modelNumber: string | null;      // 34. Model number
  dateFirstAvailable: string | null; // 35. Date first available
  bestSellersRank: {               // 36. BSR data
    rank: number;
    category: string;
  }[] | null;
  amazonUrl: string;               // 37. Full Amazon URL

  // ─────────────────────────────────────────────────────────────────────────
  // SEO (3 fields) - Generated
  // ─────────────────────────────────────────────────────────────────────────
  seoTitle: string | null;         // 38. SEO optimized title (70 chars)
  seoDescription: string | null;   // 39. SEO meta description (160 chars)
  imageAltText: string | null;     // 40. Image alt text

  // ─────────────────────────────────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────────────────────────────────
  scrapedAt: string;               // Timestamp
  error?: string;                  // Error message if failed
}

// Product details table row
interface ProductDetail {
  label: string;
  value: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCRAPER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scrape ALL 40 fields from Amazon product page - FREE
 * No API tokens required
 */
export async function scrapeAmazonProduct(asin: string): Promise<AmazonScrapedProduct> {
  const url = `https://www.amazon.com/dp/${asin}`;
  const now = new Date().toISOString();
  
  // Default empty result
  const emptyResult: AmazonScrapedProduct = {
    asin,
    upc: null,
    ean: null,
    mpn: null,
    title: null,
    brand: null,
    category: null,
    description: null,
    bulletPoints: [],
    price: null,
    listPrice: null,
    currency: 'USD',
    mainImage: null,
    images: [],
    weightOz: null,
    weightLb: null,
    weightGrams: null,
    dimensions: null,
    dimensionsParsed: null,
    packageDimensions: null,
    rating: null,
    reviewCount: null,
    isPrime: false,
    availability: null,
    inStock: false,
    stockQuantity: null,
    colors: [],
    sizes: [],
    styles: [],
    material: null,
    countryOfOrigin: null,
    manufacturer: null,
    modelNumber: null,
    dateFirstAvailable: null,
    bestSellersRank: null,
    amazonUrl: url,
    seoTitle: null,
    seoDescription: null,
    imageAltText: null,
    scrapedAt: now,
  };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
      },
    });

    if (!response.ok) {
      return {
        ...emptyResult,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    return parseAmazonHtml(asin, html, url, now);
    
  } catch (error) {
    console.error(`[AmazonScraper] Error fetching ${asin}:`, error);
    return {
      ...emptyResult,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTML PARSER - Extracts all 40 fields
// ═══════════════════════════════════════════════════════════════════════════

function parseAmazonHtml(
  asin: string, 
  html: string, 
  url: string,
  scrapedAt: string
): AmazonScrapedProduct {
  
  const result: AmazonScrapedProduct = {
    asin,
    upc: null,
    ean: null,
    mpn: null,
    title: null,
    brand: null,
    category: null,
    description: null,
    bulletPoints: [],
    price: null,
    listPrice: null,
    currency: 'USD',
    mainImage: null,
    images: [],
    weightOz: null,
    weightLb: null,
    weightGrams: null,
    dimensions: null,
    dimensionsParsed: null,
    packageDimensions: null,
    rating: null,
    reviewCount: null,
    isPrime: false,
    availability: null,
    inStock: true,
    stockQuantity: null,
    colors: [],
    sizes: [],
    styles: [],
    material: null,
    countryOfOrigin: null,
    manufacturer: null,
    modelNumber: null,
    dateFirstAvailable: null,
    bestSellersRank: null,
    amazonUrl: url,
    seoTitle: null,
    seoDescription: null,
    imageAltText: null,
    scrapedAt,
  };

  try {
    // ─────────────────────────────────────────────────────────────────────
    // 5. TITLE
    // ─────────────────────────────────────────────────────────────────────
    const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i);
    if (titleMatch) {
      result.title = cleanText(titleMatch[1]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 6. BRAND
    // ─────────────────────────────────────────────────────────────────────
    const brandMatch = html.match(/Visit the ([^<]+) Store/i) ||
                       html.match(/<a[^>]*id="bylineInfo"[^>]*>[^<]*Brand:\s*([^<]+)/i) ||
                       html.match(/<a[^>]*id="bylineInfo"[^>]*>([^<]+)<\/a>/i) ||
                       html.match(/Brand:<\/span>\s*<span[^>]*>([^<]+)/i);
    if (brandMatch) {
      result.brand = cleanText(brandMatch[1]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. CATEGORY (from breadcrumbs)
    // ─────────────────────────────────────────────────────────────────────
    const categoryMatches = html.match(/<a[^>]*class="a-link-normal a-color-tertiary"[^>]*>([^<]+)<\/a>/gi);
    if (categoryMatches && categoryMatches.length > 0) {
      const categories = categoryMatches.map(match => {
        const textMatch = match.match(/>([^<]+)</);
        return textMatch ? cleanText(textMatch[1]) : '';
      }).filter(c => c && c.length > 0);
      if (categories.length > 0) {
        result.category = categories[categories.length - 1]; // Last = most specific
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 8. DESCRIPTION
    // ─────────────────────────────────────────────────────────────────────
    const descMatch = html.match(/<div[^>]*id="productDescription"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
      result.description = cleanHtml(descMatch[1]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 9. BULLET POINTS (Feature list)
    // ─────────────────────────────────────────────────────────────────────
    const bulletSection = html.match(/<div[^>]*id="feature-bullets"[^>]*>([\s\S]*?)<\/div>/i);
    if (bulletSection) {
      const bulletMatches = bulletSection[1].match(/<span[^>]*class="a-list-item"[^>]*>([^<]+)/gi);
      if (bulletMatches) {
        result.bulletPoints = bulletMatches
          .map(match => {
            const textMatch = match.match(/>([^<]+)/);
            return textMatch ? cleanText(textMatch[1]) : '';
          })
          .filter(b => b && b.length > 10); // Filter out empty/short items
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 10. CURRENT PRICE
    // ─────────────────────────────────────────────────────────────────────
    // Pattern 1: Price whole and fraction
    const priceWholeMatch = html.match(/<span[^>]*class="a-price-whole"[^>]*>([0-9,]+)/i);
    const priceFractionMatch = html.match(/<span[^>]*class="a-price-fraction"[^>]*>([0-9]+)/i);
    if (priceWholeMatch) {
      const whole = priceWholeMatch[1].replace(/,/g, '');
      const fraction = priceFractionMatch ? priceFractionMatch[1] : '00';
      result.price = parseFloat(`${whole}.${fraction}`);
    }
    
    // Pattern 2: data-asin-price attribute
    if (!result.price) {
      const dataPriceMatch = html.match(/data-asin-price="([0-9.]+)"/i);
      if (dataPriceMatch) {
        result.price = parseFloat(dataPriceMatch[1]);
      }
    }

    // Pattern 3: Full price string
    if (!result.price) {
      const priceMatch = html.match(/\$([0-9]+\.?[0-9]*)/);
      if (priceMatch) {
        result.price = parseFloat(priceMatch[1]);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 11. LIST PRICE (MSRP / Compare At Price)
    // ─────────────────────────────────────────────────────────────────────
    const listPriceMatch = html.match(/class="basisPrice"[^>]*>.*?\$([0-9,]+\.?[0-9]*)/is) ||
                           html.match(/List Price:.*?\$([0-9,]+\.?[0-9]*)/is) ||
                           html.match(/class="a-text-price"[^>]*data-a-strike="true"[^>]*>.*?\$([0-9,]+\.?[0-9]*)/is);
    if (listPriceMatch) {
      result.listPrice = parseFloat(listPriceMatch[1].replace(/,/g, ''));
    }

    // ─────────────────────────────────────────────────────────────────────
    // 13. MAIN IMAGE
    // ─────────────────────────────────────────────────────────────────────
    const mainImageMatch = html.match(/"large":"(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/i) ||
                           html.match(/<img[^>]*id="landingImage"[^>]*src="([^"]+)"/i) ||
                           html.match(/<img[^>]*data-old-hires="([^"]+)"/i);
    if (mainImageMatch) {
      result.mainImage = mainImageMatch[1];
      result.images.push(mainImageMatch[1]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 14-17. ADDITIONAL IMAGES
    // ─────────────────────────────────────────────────────────────────────
    const imageMatches = html.match(/"hiRes":"(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/gi) ||
                         html.match(/"large":"(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/gi);
    if (imageMatches) {
      const uniqueImages = new Set<string>();
      if (result.mainImage) uniqueImages.add(result.mainImage);
      
      imageMatches.forEach(match => {
        const urlMatch = match.match(/"(?:hiRes|large)":"([^"]+)"/);
        if (urlMatch && urlMatch[1]) {
          uniqueImages.add(urlMatch[1]);
        }
      });
      
      result.images = Array.from(uniqueImages).slice(0, 7); // Max 7 images
    }

    // ─────────────────────────────────────────────────────────────────────
    // PRODUCT DETAILS TABLE (for multiple fields)
    // ─────────────────────────────────────────────────────────────────────
    const productDetails = extractProductDetails(html);
    
    // 2. UPC
    const upcDetail = productDetails.find(d => d.label.toLowerCase().includes('upc'));
    if (upcDetail) {
      result.upc = upcDetail.value;
    }

    // 3. EAN
    const eanDetail = productDetails.find(d => d.label.toLowerCase().includes('ean'));
    if (eanDetail) {
      result.ean = eanDetail.value;
    }

    // 4. MPN (Manufacturer Part Number)
    const mpnDetail = productDetails.find(d => 
      d.label.toLowerCase().includes('part number') ||
      d.label.toLowerCase().includes('mpn') ||
      d.label.toLowerCase().includes('item model number')
    );
    if (mpnDetail) {
      result.mpn = mpnDetail.value;
    }

    // 18-21. DIMENSIONS
    const dimensionsDetail = productDetails.find(d => 
      d.label.toLowerCase().includes('product dimensions') ||
      d.label.toLowerCase().includes('item dimensions')
    );
    if (dimensionsDetail) {
      result.dimensions = dimensionsDetail.value;
      result.dimensionsParsed = parseDimensions(dimensionsDetail.value);
    }

    // 22. PACKAGE DIMENSIONS
    const packageDetail = productDetails.find(d => 
      d.label.toLowerCase().includes('package dimensions')
    );
    if (packageDetail) {
      result.packageDimensions = packageDetail.value;
    }

    // 18. WEIGHT
    const weightDetail = productDetails.find(d => 
      d.label.toLowerCase().includes('weight') &&
      !d.label.toLowerCase().includes('dimensions')
    );
    if (weightDetail) {
      const weightParsed = parseWeight(weightDetail.value);
      result.weightOz = weightParsed.oz;
      result.weightLb = weightParsed.lb;
      result.weightGrams = weightParsed.grams;
    }

    // Also check dimensions string for weight
    if (!result.weightOz && result.dimensions) {
      const weightFromDim = parseWeight(result.dimensions);
      if (weightFromDim.oz) {
        result.weightOz = weightFromDim.oz;
        result.weightLb = weightFromDim.lb;
        result.weightGrams = weightFromDim.grams;
      }
    }

    // 31. MATERIAL
    const materialDetail = productDetails.find(d => 
      d.label.toLowerCase().includes('material')
    );
    if (materialDetail) {
      result.material = materialDetail.value;
    }

    // 32. COUNTRY OF ORIGIN
    const countryDetail = productDetails.find(d => 
      d.label.toLowerCase().includes('country of origin')
    );
    if (countryDetail) {
      result.countryOfOrigin = countryDetail.value;
    }

    // 33. MANUFACTURER
    const mfrDetail = productDetails.find(d => 
      d.label.toLowerCase() === 'manufacturer'
    );
    if (mfrDetail) {
      result.manufacturer = mfrDetail.value;
    }

    // 34. MODEL NUMBER
    const modelDetail = productDetails.find(d => 
      d.label.toLowerCase().includes('model number') ||
      d.label.toLowerCase().includes('model name')
    );
    if (modelDetail) {
      result.modelNumber = modelDetail.value;
    }

    // 35. DATE FIRST AVAILABLE
    const dateDetail = productDetails.find(d => 
      d.label.toLowerCase().includes('date first available')
    );
    if (dateDetail) {
      result.dateFirstAvailable = dateDetail.value;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 23. RATING
    // ─────────────────────────────────────────────────────────────────────
    const ratingMatch = html.match(/([0-9.]+) out of 5 stars/i) ||
                        html.match(/<span[^>]*class="a-icon-alt"[^>]*>([0-9.]+) out of 5/i);
    if (ratingMatch) {
      result.rating = parseFloat(ratingMatch[1]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 24. REVIEW COUNT
    // ─────────────────────────────────────────────────────────────────────
    const reviewMatch = html.match(/([0-9,]+)\s*(?:ratings|reviews|global ratings)/i) ||
                        html.match(/<span[^>]*id="acrCustomerReviewText"[^>]*>([0-9,]+)/i);
    if (reviewMatch) {
      result.reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 25-26. AVAILABILITY & STOCK QUANTITY
    // ─────────────────────────────────────────────────────────────────────
    const availabilityMatch = html.match(/<span[^>]*id="availability"[^>]*>([^<]+)/i) ||
                              html.match(/<div[^>]*id="availability"[^>]*>[\s\S]*?<span[^>]*>([^<]+)/i);
    if (availabilityMatch) {
      result.availability = cleanText(availabilityMatch[1]);
      result.inStock = !isOutOfStock(result.availability);
      
      // Check for "Only X left"
      const qtyMatch = result.availability.match(/Only (\d+) left/i);
      if (qtyMatch) {
        result.stockQuantity = parseInt(qtyMatch[1], 10);
      }
    }

    // Additional out of stock checks
    if (html.includes('Currently unavailable') || 
        html.includes('out of stock') ||
        html.includes('We don\'t know when or if this item will be back in stock')) {
      result.inStock = false;
      result.availability = result.availability || 'Currently unavailable';
    }

    // ─────────────────────────────────────────────────────────────────────
    // 27. PRIME STATUS
    // ─────────────────────────────────────────────────────────────────────
    result.isPrime = html.includes('a]me-prime') || 
                     html.includes('prime-badge') ||
                     html.includes('FREE delivery') ||
                     html.includes('Prime FREE') ||
                     html.includes('id="prime-badge"') ||
                     html.includes('class="a-icon-prime"');

    // ─────────────────────────────────────────────────────────────────────
    // 28-30. VARIANTS (Colors, Sizes, Styles)
    // ─────────────────────────────────────────────────────────────────────
    result.colors = extractVariants(html, 'color');
    result.sizes = extractVariants(html, 'size');
    result.styles = extractVariants(html, 'style');

    // ─────────────────────────────────────────────────────────────────────
    // 36. BEST SELLERS RANK
    // ─────────────────────────────────────────────────────────────────────
    result.bestSellersRank = extractBSR(html);

    // ─────────────────────────────────────────────────────────────────────
    // 38-40. SEO FIELDS (Generated)
    // ─────────────────────────────────────────────────────────────────────
    if (result.title) {
      // 38. SEO Title (max 70 chars)
      result.seoTitle = result.title.length > 70 
        ? result.title.substring(0, 67) + '...'
        : result.title;
      
      // 40. Image Alt Text
      result.imageAltText = result.title.length > 125
        ? result.title.substring(0, 122) + '...'
        : result.title;
    }
    
    // 39. SEO Description (max 160 chars from bullet points)
    if (result.bulletPoints.length > 0) {
      const combined = result.bulletPoints.slice(0, 2).join(' ');
      result.seoDescription = combined.length > 160
        ? combined.substring(0, 157) + '...'
        : combined;
    } else if (result.description) {
      result.seoDescription = result.description.length > 160
        ? result.description.substring(0, 157) + '...'
        : result.description;
    }

  } catch (error) {
    console.error(`[AmazonScraper] Parse error for ${asin}:`, error);
    result.error = 'Failed to parse product data';
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract product details table
 */
function extractProductDetails(html: string): ProductDetail[] {
  const details: ProductDetail[] = [];
  
  // Pattern 1: Table format
  const tableMatches = html.match(/<tr[^>]*>[\s\S]*?<th[^>]*>([^<]+)<\/th>[\s\S]*?<td[^>]*>([^<]+)<\/td>/gi);
  if (tableMatches) {
    tableMatches.forEach(row => {
      const labelMatch = row.match(/<th[^>]*>([^<]+)<\/th>/i);
      const valueMatch = row.match(/<td[^>]*>([^<]+)<\/td>/i);
      if (labelMatch && valueMatch) {
        details.push({
          label: cleanText(labelMatch[1]),
          value: cleanText(valueMatch[1]),
        });
      }
    });
  }
  
  // Pattern 2: Span format (newer Amazon pages)
  const spanMatches = html.match(/<span[^>]*class="a-text-bold"[^>]*>([^<]+)<\/span>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi);
  if (spanMatches) {
    spanMatches.forEach(item => {
      const labelMatch = item.match(/class="a-text-bold"[^>]*>([^<]+)</i);
      const parts = item.split('</span>');
      if (labelMatch && parts.length >= 2) {
        const valueMatch = parts[1].match(/<span[^>]*>([^<]+)/);
        if (valueMatch) {
          details.push({
            label: cleanText(labelMatch[1]),
            value: cleanText(valueMatch[1]),
          });
        }
      }
    });
  }

  // Pattern 3: Detail bullets format
  const bulletDetailMatches = html.match(/<li[^>]*>[\s\S]*?<span[^>]*class="a-text-bold"[^>]*>([^<]+)<\/span>([^<]+)/gi);
  if (bulletDetailMatches) {
    bulletDetailMatches.forEach(item => {
      const labelMatch = item.match(/class="a-text-bold"[^>]*>([^<]+)/i);
      const valueMatch = item.match(/<\/span>([^<]+)/);
      if (labelMatch && valueMatch) {
        details.push({
          label: cleanText(labelMatch[1].replace(':', '')),
          value: cleanText(valueMatch[1]),
        });
      }
    });
  }
  
  return details;
}

/**
 * Parse dimensions string to object
 */
function parseDimensions(dimString: string): AmazonScrapedProduct['dimensionsParsed'] {
  if (!dimString) return null;
  
  // Pattern: "3.94 x 1.13 x 7.25 inches" or "10 x 5 x 3 cm"
  const match = dimString.match(/([0-9.]+)\s*x\s*([0-9.]+)\s*x\s*([0-9.]+)\s*(inches|inch|in|cm|mm)?/i);
  if (match) {
    let length = parseFloat(match[1]);
    let width = parseFloat(match[2]);
    let height = parseFloat(match[3]);
    const unit = (match[4] || 'inches').toLowerCase();
    
    // Convert to inches if needed
    if (unit === 'cm') {
      length /= 2.54;
      width /= 2.54;
      height /= 2.54;
    } else if (unit === 'mm') {
      length /= 25.4;
      width /= 25.4;
      height /= 25.4;
    }
    
    return {
      length: Math.round(length * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      unit: 'inches',
    };
  }
  
  return null;
}

/**
 * Parse weight string to multiple units
 */
function parseWeight(weightString: string): { oz: number | null; lb: number | null; grams: number | null } {
  if (!weightString) return { oz: null, lb: null, grams: null };
  
  // Pattern: "1.5 pounds", "24 ounces", "500 grams", "0.5 kg"
  const ozMatch = weightString.match(/([0-9.]+)\s*(?:ounces?|oz)/i);
  const lbMatch = weightString.match(/([0-9.]+)\s*(?:pounds?|lbs?)/i);
  const gramsMatch = weightString.match(/([0-9.]+)\s*(?:grams?|g(?!\w))/i);
  const kgMatch = weightString.match(/([0-9.]+)\s*(?:kilograms?|kg)/i);
  
  let oz: number | null = null;
  let lb: number | null = null;
  let grams: number | null = null;
  
  if (ozMatch) {
    oz = parseFloat(ozMatch[1]);
    lb = oz / 16;
    grams = oz * 28.3495;
  } else if (lbMatch) {
    lb = parseFloat(lbMatch[1]);
    oz = lb * 16;
    grams = lb * 453.592;
  } else if (gramsMatch) {
    grams = parseFloat(gramsMatch[1]);
    oz = grams / 28.3495;
    lb = grams / 453.592;
  } else if (kgMatch) {
    grams = parseFloat(kgMatch[1]) * 1000;
    oz = grams / 28.3495;
    lb = grams / 453.592;
  }
  
  return {
    oz: oz ? Math.round(oz * 100) / 100 : null,
    lb: lb ? Math.round(lb * 100) / 100 : null,
    grams: grams ? Math.round(grams) : null,
  };
}

/**
 * Extract variant options (colors, sizes, styles)
 */
function extractVariants(html: string, type: 'color' | 'size' | 'style'): string[] {
  const variants: string[] = [];
  
  // Pattern for variant buttons/dropdown
  const patterns: Record<string, RegExp[]> = {
    color: [
      /data-defaultasin[^>]*title="([^"]+)"/gi,
      /"color":\s*"([^"]+)"/gi,
      /id="color_name"[^>]*>[\s\S]*?<span[^>]*>([^<]+)/gi,
    ],
    size: [
      /id="native_dropdown_selected_size_name"[^>]*>[\s\S]*?<option[^>]*>([^<]+)/gi,
      /"size":\s*"([^"]+)"/gi,
      /data-a-size="([^"]+)"/gi,
    ],
    style: [
      /"style":\s*"([^"]+)"/gi,
      /id="style_name"[^>]*>[\s\S]*?<span[^>]*>([^<]+)/gi,
    ],
  };
  
  patterns[type].forEach(pattern => {
    const matches = html.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const valueMatch = match.match(/["'>]([^"'<>]+)["'<]/);
        if (valueMatch && valueMatch[1]) {
          const cleaned = cleanText(valueMatch[1]);
          if (cleaned && !variants.includes(cleaned) && cleaned.length < 50) {
            variants.push(cleaned);
          }
        }
      });
    }
  });
  
  return variants.slice(0, 10); // Max 10 variants
}

/**
 * Extract Best Sellers Rank
 */
function extractBSR(html: string): AmazonScrapedProduct['bestSellersRank'] {
  const bsrData: { rank: number; category: string }[] = [];
  
  // Pattern: "#1,234 in Category Name"
  const bsrMatches = html.match(/#([0-9,]+)\s+in\s+([^<(]+)/gi);
  if (bsrMatches) {
    bsrMatches.forEach(match => {
      const parsed = match.match(/#([0-9,]+)\s+in\s+(.+)/i);
      if (parsed) {
        bsrData.push({
          rank: parseInt(parsed[1].replace(/,/g, ''), 10),
          category: cleanText(parsed[2]),
        });
      }
    });
  }
  
  return bsrData.length > 0 ? bsrData : null;
}

/**
 * Check if availability string indicates out of stock
 */
function isOutOfStock(availability: string | null): boolean {
  if (!availability) return false;
  
  const lower = availability.toLowerCase();
  const outOfStockPhrases = [
    'out of stock',
    'currently unavailable',
    'unavailable',
    'not available',
    'no longer available',
    'discontinued',
    'sold out',
    'temporarily out of stock',
  ];
  
  return outOfStockPhrases.some(phrase => lower.includes(phrase));
}

/**
 * Clean text - remove extra whitespace and HTML entities
 */
function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean HTML - strip tags and clean text
 */
function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH SCRAPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Batch scrape multiple ASINs (with rate limiting)
 */
export async function scrapeMultipleProducts(
  asins: string[],
  delayMs: number = 1000
): Promise<AmazonScrapedProduct[]> {
  const results: AmazonScrapedProduct[] = [];
  
  for (let i = 0; i < asins.length; i++) {
    const asin = asins[i];
    console.log(`[AmazonScraper] Scraping ${i + 1}/${asins.length}: ${asin}`);
    
    const result = await scrapeAmazonProduct(asin);
    results.push(result);
    
    // Rate limit to avoid getting blocked
    if (i < asins.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quick price check - just get the price
 */
export async function getAmazonPrice(asin: string): Promise<number | null> {
  const product = await scrapeAmazonProduct(asin);
  return product.price;
}

/**
 * Quick stock check
 */
export async function checkAmazonStock(asin: string): Promise<boolean> {
  const product = await scrapeAmazonProduct(asin);
  return product.inStock;
}

/**
 * Get all images for a product
 */
export async function getAmazonImages(asin: string): Promise<string[]> {
  const product = await scrapeAmazonProduct(asin);
  return product.images;
}

/**
 * Convert scraped product to Shopify-ready format
 */
export function toShopifyFormat(product: AmazonScrapedProduct): Record<string, any> {
  return {
    handle: `product-${product.asin.toLowerCase()}`,
    title: product.title,
    body_html: formatDescriptionHtml(product),
    vendor: product.brand || 'Amazon',
    product_type: product.category,
    tags: buildTags(product),
    variant_sku: product.asin,
    variant_grams: product.weightGrams || 0,
    variant_barcode: product.upc || product.ean,
    image_src: product.mainImage,
    image_alt_text: product.imageAltText,
    seo_title: product.seoTitle,
    seo_description: product.seoDescription,
    // Additional images
    images: product.images,
    // Metafields
    metafield_rating: product.rating,
    metafield_review_count: product.reviewCount,
    metafield_is_prime: product.isPrime,
    metafield_asin: product.asin,
    metafield_amazon_url: product.amazonUrl,
    metafield_material: product.material,
    metafield_dimensions: product.dimensions,
    metafield_bsr: product.bestSellersRank?.[0]?.rank,
  };
}

/**
 * Convert scraped product to eBay-ready format
 */
export function toEbayFormat(product: AmazonScrapedProduct): Record<string, any> {
  return {
    'Custom Label (SKU)': product.asin,
    'Title': (product.title || '').substring(0, 80), // eBay 80 char limit
    'Description': formatDescriptionHtml(product),
    'Start Price': null, // Set by pricing calculator
    'Buy It Now Price': null, // Set by pricing calculator
    'Quantity': product.stockQuantity || 10,
    'Condition ID': 1000, // New
    'Item photo URL': product.mainImage,
    'P:UPC': product.upc || 'Does Not Apply',
    'P:EAN': product.ean || 'Does Not Apply',
    'C:Brand': product.brand || 'Unbranded',
    'C:MPN': product.mpn || 'Does Not Apply',
    'C:Color': product.colors[0] || '',
    'C:Material': product.material || '',
    'C:Model': product.modelNumber || '',
  };
}

/**
 * Format description HTML from scraped data
 */
function formatDescriptionHtml(product: AmazonScrapedProduct): string {
  let html = '';
  
  // Add bullet points as features
  if (product.bulletPoints.length > 0) {
    html += '<h3>Features</h3><ul>';
    product.bulletPoints.forEach(bullet => {
      html += `<li>${bullet}</li>`;
    });
    html += '</ul>';
  }
  
  // Add description
  if (product.description) {
    html += `<p>${product.description}</p>`;
  }
  
  // Add specs
  if (product.dimensions || product.material || product.weightOz) {
    html += '<h3>Specifications</h3><ul>';
    if (product.dimensions) html += `<li><strong>Dimensions:</strong> ${product.dimensions}</li>`;
    if (product.material) html += `<li><strong>Material:</strong> ${product.material}</li>`;
    if (product.weightOz) html += `<li><strong>Weight:</strong> ${product.weightOz} oz</li>`;
    if (product.brand) html += `<li><strong>Brand:</strong> ${product.brand}</li>`;
    if (product.modelNumber) html += `<li><strong>Model:</strong> ${product.modelNumber}</li>`;
    html += '</ul>';
  }
  
  return html || '<p>Quality product.</p>';
}

/**
 * Build tags array from product data
 */
function buildTags(product: AmazonScrapedProduct): string[] {
  const tags: string[] = ['amazon', `asin-${product.asin}`];
  
  if (product.brand) tags.push(product.brand.toLowerCase().replace(/\s+/g, '-'));
  if (product.category) tags.push(product.category.toLowerCase().replace(/\s+/g, '-'));
  if (product.isPrime) tags.push('prime');
  if (product.rating && product.rating >= 4) tags.push('highly-rated');
  if (product.reviewCount && product.reviewCount >= 1000) tags.push('bestseller');
  if (product.material) tags.push(product.material.toLowerCase().replace(/\s+/g, '-'));
  
  return tags;
}
