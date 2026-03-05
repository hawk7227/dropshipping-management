// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/contracts/product.ts
// LINES: 94
// IMPORTS FROM: ./identifiers.ts, ./pricing.ts, ./media.ts, ./merchant.ts, zod
// EXPORTS TO: Every file in the system. This is THE type. Nothing defines CleanProduct except this file.
// DOES: Composes ProductIdentifiers + ProductPricing + ProductMedia + MerchantFeedStatus + metadata into one validated type. Provides parseProduct() that validates at the boundary and createEmptyProduct() factory.
// DOES NOT: Process files. Run gates. Call APIs. Render UI.
// BREAKS IF: Any of the 4 sub-schemas are modified without updating this composition. Zod not installed.
// ASSUMES: All sub-schemas are valid and exported from their respective files.
// LEVEL: 3 — Integrated. Composed from validated sub-types. Single source of truth. Change a sub-type, this type updates or fails to compile.
// VERIFIED: AI self-check. Composition tested mentally: identifiers + pricing + media + merchant + metadata = complete product.
// ═══════════════════════════════════════════════════════════

import { z } from 'zod';
import { ProductIdentifiersSchema } from './identifiers';
import { ProductPricingSchema } from './pricing';
import { ProductMediaSchema } from './media';
import { MerchantFeedStatusSchema, createEmptyGateResults } from './merchant';

// ── Product metadata (non-validated freeform fields) ────

export const ProductMetadataSchema = z.object({
  title: z.string().trim().default(''),
  description: z.string().trim().default(''),
  vendor: z.string().trim().default('Unknown'),
  category: z.string().trim().default('General'),
  tags: z.string().trim().default(''),
  status: z.string().trim().default('Active'),
  quantity: z.coerce.number().int().min(0).default(999),
  stockStatus: z.enum(['In Stock', 'Out of Stock', 'Unknown']).default('Unknown'),
  rating: z.coerce.number().min(0).max(5).default(0),
  reviews: z.coerce.number().int().min(0).default(0),
  bsr: z.coerce.number().int().min(0).default(0),
  dateChecked: z.string().default(''),
  // Shopify sync status
  shopifyStatus: z.enum(['not_pushed', 'pushing', 'pushed', 'failed']).default('not_pushed'),
  shopifyError: z.string().default(''),
  // UI state
  selected: z.boolean().default(false),
});

// ── THE CleanProduct schema — composition of all sub-types ──

export const CleanProductSchema = ProductIdentifiersSchema
  .merge(ProductMetadataSchema)
  .and(z.object({
    pricing: ProductPricingSchema,
    media: ProductMediaSchema,
    merchant: MerchantFeedStatusSchema,
  }));

export type CleanProduct = z.infer<typeof CleanProductSchema>;

// ── Parse function — validates at the boundary ──────────
// Call this when data enters the system (from file import, API response, database read).
// If it fails, you get a ZodError with exact field paths and messages.

export function parseProduct(raw: unknown): CleanProduct {
  return CleanProductSchema.parse(raw);
}

export function safeParseProduct(raw: unknown): { success: true; data: CleanProduct } | { success: false; error: z.ZodError } {
  return CleanProductSchema.safeParse(raw);
}

// ── Factory — creates a valid empty product ─────────────
// Use this instead of copy-pasting initializers. Every field has a valid default.

export function createEmptyProduct(overrides?: Record<string, unknown>): CleanProduct {
  return CleanProductSchema.parse({
    asin: '', barcode: '', handle: '', sku: '',
    title: '', description: '', vendor: 'Unknown', category: 'General', tags: '',
    status: 'Active', quantity: 999, stockStatus: 'Unknown',
    rating: 0, reviews: 0, bsr: 0, dateChecked: '',
    shopifyStatus: 'not_pushed', shopifyError: '', selected: false,
    pricing: { cost: 0, sell: 0, compareAt: 0, marketPrice: 0 },
    media: { images: [] },
    merchant: { googleCategory: '', gateResults: createEmptyGateResults(), gateCount: 0, feedScore: 0 },
    ...overrides,
  });
}

// ── File analysis type ──────────────────────────────────

export const FileTypeEnum = z.enum(['shopify-matrixify', 'shopify-csv', 'autods', 'asin-list', 'ebay-file-exchange', 'generic-csv', 'unknown']);
export type FileType = z.infer<typeof FileTypeEnum>;

export interface FileAnalysis {
  type: FileType;
  totalRows: number;
  totalCols: number;
  uniqueProducts: number;
  removedRows: number;
  removedCols: number;
  detectedFeatures: string[];
  products: CleanProduct[];
  passed: number;    // gateCount === TOTAL_GATES
  failed: number;    // gateCount < 5
  warned: number;    // everything else
  processingTime: number;
}
