// app/api/import/route.ts
// COMPLETE Import API - Bulk product import with validation, progress tracking,
// file processing, and async job management

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Product, ApiResponse } from '@/types';
import type { ApiError } from '@/types/errors';
import { calculateRetailPrice, calculateCompetitorPrices } from '@/lib/utils/pricing-calculator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ImportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalItems: number;
  processedItems: number;
  successCount: number;
  failCount: number;
  errors: Array<{ asin: string; error: string }>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface ImportItem {
  asin: string;
  title?: string;
  amazon_price?: number;
  category?: string;
}

interface ImportRequest {
  items: ImportItem[];
  options?: {
    skipExisting?: boolean;
    updateExisting?: boolean;
    fetchPrices?: boolean;
    fetchDetails?: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_ITEMS_PER_IMPORT = 500;
const BATCH_SIZE = 10;

// In-memory job storage (use Redis/DB in production)
const importJobs = new Map<string, ImportJob>();

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create Supabase client
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Validate ASIN format
 */
function isValidAsin(asin: string): boolean {
  return /^[A-Z0-9]{10}$/.test(asin.toUpperCase());
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create error response
 */
function errorResponse(error: ApiError, status: number = 400): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Create success response
 */
function successResponse<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: true, data, ...(meta && { meta }) });
}

/**
 * Validate import items
 */
function validateItems(items: ImportItem[]): { valid: ImportItem[]; invalid: Array<{ item: ImportItem; errors: string[] }> } {
  const valid: ImportItem[] = [];
  const invalid: Array<{ item: ImportItem; errors: string[] }> = [];
  const seenAsins = new Set<string>();

  for (const item of items) {
    const errors: string[] = [];

    if (!item.asin) {
      errors.push('Missing ASIN');
    } else if (!isValidAsin(item.asin)) {
      errors.push('Invalid ASIN format');
    } else if (seenAsins.has(item.asin.toUpperCase())) {
      errors.push('Duplicate ASIN in import');
    }

    if (item.amazon_price !== undefined && (isNaN(item.amazon_price) || item.amazon_price < 0)) {
      errors.push('Invalid price');
    }

    if (errors.length > 0) {
      invalid.push({ item, errors });
    } else {
      seenAsins.add(item.asin.toUpperCase());
      valid.push({ ...item, asin: item.asin.toUpperCase() });
    }
  }

  return { valid, invalid };
}

/**
 * Process import in background
 */
async function processImport(
  jobId: string,
  items: ImportItem[],
  options: ImportRequest['options'] = {}
): Promise<void> {
  const supabase = getSupabaseClient();
  const job = importJobs.get(jobId);
  if (!job) return;

  job.status = 'processing';
  job.updatedAt = new Date().toISOString();

  try {
    // Get existing ASINs if needed
    let existingAsins = new Set<string>();
    if (options.skipExisting || options.updateExisting) {
      const { data } = await supabase
        .from('products')
        .select('asin')
        .in('asin', items.map(i => i.asin));
      existingAsins = new Set((data || []).map(p => p.asin));
    }

    // Process in batches
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      for (const item of batch) {
        try {
          const exists = existingAsins.has(item.asin);

          if (exists && options.skipExisting) {
            job.processedItems++;
            job.successCount++; // Count as success (skipped)
            continue;
          }

          // Calculate pricing
          let retailPrice: number | null = null;
          let profitMargin: number | null = null;
          let competitorPrices: Record<string, number> | null = null;

          if (item.amazon_price && item.amazon_price > 0) {
            retailPrice = calculateRetailPrice(item.amazon_price);
            profitMargin = ((retailPrice - item.amazon_price) / retailPrice) * 100;
            competitorPrices = calculateCompetitorPrices(retailPrice);
          }

          const now = new Date().toISOString();
          const productData = {
            asin: item.asin,
            title: item.title || `Product ${item.asin}`,
            amazon_price: item.amazon_price || null,
            retail_price: retailPrice,
            profit_margin: profitMargin,
            competitor_prices: competitorPrices,
            category: item.category || 'Imported',
            status: 'pending',
            last_price_check: item.amazon_price ? now : null,
            updated_at: now,
          };

          if (exists && options.updateExisting) {
            // Update existing
            await supabase
              .from('products')
              .update(productData)
              .eq('asin', item.asin);
          } else if (!exists) {
            // Insert new
            await supabase
              .from('products')
              .insert({
                ...productData,
                created_at: now,
              });
          }

          job.successCount++;
        } catch (error) {
          job.failCount++;
          job.errors.push({
            asin: item.asin,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        job.processedItems++;
        job.updatedAt = new Date().toISOString();
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
  } catch (error) {
    job.status = 'failed';
    job.errors.push({
      asin: 'SYSTEM',
      error: error instanceof Error ? error.message : 'Import failed',
    });
  }

  job.updatedAt = new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Get import job status
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    // List all jobs
    const jobs = Array.from(importJobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return successResponse(jobs.slice(0, 20), {
      totalJobs: importJobs.size,
    });
  }

  // Get specific job
  const job = importJobs.get(jobId);

  if (!job) {
    return errorResponse({
      code: 'IMP_001',
      message: 'Import job not found',
      details: `No job with ID ${jobId}`,
    }, 404);
  }

  return successResponse(job);
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Start new import
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ImportRequest;

    // Validate request
    if (!body.items || !Array.isArray(body.items)) {
      return errorResponse({
        code: 'IMP_002',
        message: 'Invalid request',
        details: 'Items array is required',
        suggestion: 'Provide an array of items to import',
      }, 400);
    }

    if (body.items.length === 0) {
      return errorResponse({
        code: 'IMP_003',
        message: 'No items to import',
        suggestion: 'Provide at least one item',
      }, 400);
    }

    if (body.items.length > MAX_ITEMS_PER_IMPORT) {
      return errorResponse({
        code: 'IMP_004',
        message: 'Too many items',
        details: `Maximum ${MAX_ITEMS_PER_IMPORT} items per import`,
        suggestion: 'Split into smaller batches',
      }, 400);
    }

    // Validate items
    const { valid, invalid } = validateItems(body.items);

    if (valid.length === 0) {
      return errorResponse({
        code: 'IMP_005',
        message: 'No valid items to import',
        details: `${invalid.length} items have validation errors`,
        suggestion: 'Check ASIN format and data',
      }, 400);
    }

    // Create import job
    const jobId = generateId();
    const job: ImportJob = {
      id: jobId,
      status: 'pending',
      totalItems: valid.length,
      processedItems: 0,
      successCount: 0,
      failCount: 0,
      errors: invalid.map(i => ({
        asin: i.item.asin || 'UNKNOWN',
        error: i.errors.join(', '),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    };

    importJobs.set(jobId, job);

    // Start processing in background
    processImport(jobId, valid, body.options).catch(console.error);

    return successResponse({
      jobId,
      status: 'pending',
      totalItems: valid.length,
      invalidItems: invalid.length,
      message: 'Import started',
    }, {
      pollUrl: `/api/import?jobId=${jobId}`,
    });
  } catch (error) {
    console.error('Import error:', error);
    return errorResponse({
      code: 'IMP_006',
      message: 'Failed to start import',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE - Cancel import job
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return errorResponse({
      code: 'IMP_007',
      message: 'Job ID required',
    }, 400);
  }

  const job = importJobs.get(jobId);

  if (!job) {
    return errorResponse({
      code: 'IMP_008',
      message: 'Job not found',
    }, 404);
  }

  if (job.status === 'completed' || job.status === 'failed') {
    // Remove completed/failed job
    importJobs.delete(jobId);
    return successResponse({ deleted: true, jobId });
  }

  // Cancel in-progress job
  job.status = 'failed';
  job.errors.push({ asin: 'SYSTEM', error: 'Cancelled by user' });
  job.updatedAt = new Date().toISOString();

  return successResponse({ cancelled: true, job });
}
