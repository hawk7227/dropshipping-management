// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/gates/core-gates.ts
// LINES: ~90
// IMPORTS FROM: lib/gates/registry.ts (GateDefinition), lib/contracts/ (CleanProduct, constants)
// EXPORTS TO: lib/gates/index.ts (combined with google-gates)
// DOES: Defines the 5 original product listing gates as declarative objects. Each has: id, name, description, severity, category, check function, and fix suggestion in the result.
// DOES NOT: Run gates (the registry runner does that). Define Google-specific gates (google-gates.ts does that).
// BREAKS IF: CleanProduct shape changes and check functions access removed fields.
// ASSUMES: Product follows the composed CleanProduct schema from contracts.
// LEVEL: 3 — Integrated. Each gate is independently testable. Adding/removing a gate is a one-object change.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

import type { GateDefinition } from './registry';
import type { CleanProduct } from '../contracts/product';
import { TITLE_MIN_CHARS, IMAGE_PASS_COUNT, DESC_GATE_MIN } from '../contracts/constants';

export const coreGates: GateDefinition[] = [
  {
    id: 'title',
    name: 'Product Title',
    description: 'Title must exist, be longer than 5 characters, contain no HTML, and not be a placeholder.',
    severity: 'critical',
    category: 'core',
    check: (p: CleanProduct) => {
      if (!p.title || p.title.length <= TITLE_MIN_CHARS)
        return { id: 'title', status: 'fail', reason: `Title missing or too short (${p.title?.length || 0} chars)`, fix: 'Add a descriptive product title with the brand name and product type.' };
      if (p.title.includes('<'))
        return { id: 'title', status: 'fail', reason: 'Title contains HTML tags', fix: 'Strip all HTML from the title. Use plain text only.' };
      if (p.title.toLowerCase() === 'unknown product')
        return { id: 'title', status: 'fail', reason: 'Title is placeholder', fix: 'Replace with the actual product name from the manufacturer.' };
      return { id: 'title', status: 'pass', reason: `${p.title.length} chars`, fix: '' };
    },
  },
  {
    id: 'image',
    name: 'Product Images',
    description: `Must have at least 1 image URL. ${IMAGE_PASS_COUNT}+ images for full pass.`,
    severity: 'critical',
    category: 'core',
    check: (p: CleanProduct) => {
      const count = p.media.imageCount;
      if (count >= IMAGE_PASS_COUNT)
        return { id: 'image', status: 'pass', reason: `${count} images`, fix: '' };
      if (count >= 1)
        return { id: 'image', status: 'warn', reason: `Only ${count} image (${IMAGE_PASS_COUNT}+ recommended)`, fix: `Add ${IMAGE_PASS_COUNT - count} more product images for better conversion.` };
      return { id: 'image', status: 'fail', reason: 'No image URL', fix: 'Add at least one product image. Use the main product photo on white background, minimum 800x800px.' };
    },
  },
  {
    id: 'price',
    name: 'Product Price',
    description: 'Must have a cost price greater than $0.',
    severity: 'critical',
    category: 'core',
    check: (p: CleanProduct) => {
      if (p.pricing.cost > 0)
        return { id: 'price', status: 'pass', reason: `$${p.pricing.cost.toFixed(2)}`, fix: '' };
      if (p.pricing.compareAt > 0)
        return { id: 'price', status: 'warn', reason: `No cost but has compare-at $${p.pricing.compareAt.toFixed(2)}`, fix: 'Set the source cost price. This is needed to calculate margins.' };
      return { id: 'price', status: 'fail', reason: 'No price', fix: 'Set the Amazon source cost price for this product.' };
    },
  },
  {
    id: 'asin',
    name: 'ASIN / SKU',
    description: 'Must have a valid Amazon ASIN (B0XXXXXXXXX format).',
    severity: 'major',
    category: 'core',
    check: (p: CleanProduct) => {
      if (p.asin && /^B[0-9A-Z]{9}$/.test(p.asin))
        return { id: 'asin', status: 'pass', reason: p.asin, fix: '' };
      if (p.asin)
        return { id: 'asin', status: 'warn', reason: `Invalid format: "${p.asin}"`, fix: 'ASIN must be B followed by exactly 9 alphanumeric characters (e.g., B0XXXXXXXXX).' };
      return { id: 'asin', status: 'fail', reason: 'No ASIN', fix: 'Add the Amazon ASIN. Find it on the product page URL after /dp/.' };
    },
  },
  {
    id: 'description',
    name: 'Product Description',
    description: `Must have a description longer than ${DESC_GATE_MIN} characters.`,
    severity: 'major',
    category: 'core',
    check: (p: CleanProduct) => {
      if (!p.description)
        return { id: 'description', status: 'fail', reason: 'No description', fix: 'Add a product description. Include what the product is, key features, and who it is for.' };
      if (p.description.length > DESC_GATE_MIN)
        return { id: 'description', status: 'pass', reason: `${p.description.length} chars`, fix: '' };
      return { id: 'description', status: 'warn', reason: `Short (${p.description.length} chars, need >${DESC_GATE_MIN})`, fix: 'Expand the description. Google recommends 150-5000 characters with key product details.' };
    },
  },
];
