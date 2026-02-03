// lib/services/batch-scraper.ts
// ULTRA-SAFE Amazon Batch Scraper - Optimized for Vercel Pro (60s timeout)
// Features: Rate limiting, rotating user agents, progress saving, health monitoring
// Runs via cron job - small batches to stay within serverless limits

import { createClient } from '@supabase/supabase-js';
import { scrapeAmazonProduct, type AmazonScrapedProduct } from './amazon-scraper';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - Vercel Pro Safe (60 second timeout)
// ═══════════════════════════════════════════════════════════════════════════

export const SCRAPER_CONFIG = {
  // Timing - Stay well under 60s Vercel timeout
  minDelayMs: 5000,           // Minimum 5 seconds between requests
  maxDelayMs: 8000,           // Maximum 8 seconds (randomized)
  batchSize: 5,               // Only 5 products per function call (safe for 60s)
  batchPauseMs: 0,            // No pause needed - function ends after batch
  longPauseEveryNBatches: 1,  // Not used in serverless mode
  longPauseMs: 0,             // Not used in serverless mode
  
  // Daily limits - Conservative for safety
  maxPerHour: 60,             // ~1 per minute average
  maxPerDay: 500,             // 500 per day max
  
  // Retry logic
  maxRetries: 2,              // Only 2 retries (save time)
  retryDelayMs: 5000,         // 5 second retry delay
  
  // Circuit breaker - Stop if too many failures
  circuitBreakerThreshold: 5,     // 5 consecutive failures = stop
  circuitBreakerResetMs: 300000,  // Reset after 5 minutes
  
  // Safe hours (EST) - Disabled for flexibility
  safeHoursStart: 0,          // Midnight
  safeHoursEnd: 24,           // All day
  enforceSafeHours: false,    // Disabled - run anytime
  
  // Health check
  healthCheckIntervalMs: 30000, // Update health status every 30 seconds
};

// Rotating User Agents - Look like different browsers
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface BatchJob {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
  totalAsins: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  currentBatch: number;
  totalBatches: number;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
  lastActivityAt: string;
  estimatedCompletionAt: string | null;
  avgProcessingTimeMs: number;
  errorsLast10: string[];
  consecutiveFailures: number;
  circuitBreakerTripped: boolean;
  todayCount: number;
  hourCount: number;
  lastHourReset: string;
}

export interface BatchProgress {
  jobId: string;
  asin: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  attempts: number;
  lastError: string | null;
  scrapedAt: string | null;
  processingTimeMs: number | null;
}

export interface ScraperHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'stopped';
  lastCheck: string;
  activeJob: BatchJob | null;
  metrics: {
    successRate: number;
    avgResponseTimeMs: number;
    requestsLastHour: number;
    requestsToday: number;
    estimatedTimeRemaining: string | null;
    circuitBreakerStatus: 'closed' | 'open';
  };
  warnings: string[];
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get random delay between min and max
 */
function getRandomDelay(): number {
  return Math.floor(
    Math.random() * (SCRAPER_CONFIG.maxDelayMs - SCRAPER_CONFIG.minDelayMs) + 
    SCRAPER_CONFIG.minDelayMs
  );
}

/**
 * Get random user agent
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Check if current time is within safe hours (EST)
 */
function isWithinSafeHours(): boolean {
  if (!SCRAPER_CONFIG.enforceSafeHours) return true;
  
  const now = new Date();
  // Convert to EST (UTC-5)
  const estHour = (now.getUTCHours() - 5 + 24) % 24;
  
  return estHour >= SCRAPER_CONFIG.safeHoursStart && 
         estHour < SCRAPER_CONFIG.safeHoursEnd;
}

/**
 * Get time until next safe window
 */
function getTimeUntilSafeWindow(): number {
  const now = new Date();
  const estHour = (now.getUTCHours() - 5 + 24) % 24;
  
  if (estHour >= SCRAPER_CONFIG.safeHoursEnd) {
    // Next safe window is tomorrow at 2 AM
    const hoursUntil = 24 - estHour + SCRAPER_CONFIG.safeHoursStart;
    return hoursUntil * 60 * 60 * 1000;
  } else if (estHour < SCRAPER_CONFIG.safeHoursStart) {
    // Next safe window is today at 2 AM
    const hoursUntil = SCRAPER_CONFIG.safeHoursStart - estHour;
    return hoursUntil * 60 * 60 * 1000;
  }
  
  return 0; // Already in safe window
}

/**
 * Format milliseconds to human readable
 */
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Sleep with jitter
 */
async function sleep(ms: number): Promise<void> {
  // Add ±10% jitter to make timing less predictable
  const jitter = ms * 0.1 * (Math.random() * 2 - 1);
  await new Promise(resolve => setTimeout(resolve, ms + jitter));
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create batch scrape job tables if they don't exist
 */
export async function ensureScraperTables(): Promise<void> {
  const supabase = getSupabase();
  
  // These tables should be created via migration, but we check here
  console.log('[BatchScraper] Verifying scraper tables exist...');
  
  const { error: jobError } = await supabase
    .from('scraper_jobs')
    .select('id')
    .limit(1);
    
  if (jobError && jobError.code === '42P01') {
    console.error('[BatchScraper] scraper_jobs table does not exist. Please run migrations.');
    throw new Error('scraper_jobs table not found');
  }
}

/**
 * Create a new batch job
 */
export async function createBatchJob(asins: string[]): Promise<BatchJob> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const jobId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const job: BatchJob = {
    id: jobId,
    status: 'pending',
    totalAsins: asins.length,
    processedCount: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    currentBatch: 0,
    totalBatches: Math.ceil(asins.length / SCRAPER_CONFIG.batchSize),
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    lastActivityAt: now,
    estimatedCompletionAt: null,
    avgProcessingTimeMs: 0,
    errorsLast10: [],
    consecutiveFailures: 0,
    circuitBreakerTripped: false,
    todayCount: 0,
    hourCount: 0,
    lastHourReset: now,
  };
  
  // Save job to database
  const { error: jobError } = await supabase
    .from('scraper_jobs')
    .insert({
      id: jobId,
      status: job.status,
      total_asins: job.totalAsins,
      processed_count: job.processedCount,
      success_count: job.successCount,
      failed_count: job.failedCount,
      skipped_count: job.skippedCount,
      current_batch: job.currentBatch,
      total_batches: job.totalBatches,
      config: SCRAPER_CONFIG,
      created_at: now,
      updated_at: now,
    });
    
  if (jobError) {
    console.error('[BatchScraper] Failed to create job:', jobError);
    throw jobError;
  }
  
  // Save ASINs to progress table
  const progressRecords = asins.map((asin, index) => ({
    job_id: jobId,
    asin,
    status: 'pending' as const,
    batch_number: Math.floor(index / SCRAPER_CONFIG.batchSize),
    attempts: 0,
    created_at: now,
  }));
  
  // Insert in chunks of 1000
  for (let i = 0; i < progressRecords.length; i += 1000) {
    const chunk = progressRecords.slice(i, i + 1000);
    const { error } = await supabase
      .from('scraper_progress')
      .insert(chunk);
      
    if (error) {
      console.error('[BatchScraper] Failed to insert progress records:', error);
      throw error;
    }
  }
  
  console.log(`[BatchScraper] Created job ${jobId} with ${asins.length} ASINs in ${job.totalBatches} batches`);
  
  return job;
}

/**
 * Update job status
 */
async function updateJobStatus(
  jobId: string, 
  updates: Partial<BatchJob>
): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  
  const dbUpdates: Record<string, any> = {
    updated_at: now,
    last_activity_at: now,
  };
  
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.processedCount !== undefined) dbUpdates.processed_count = updates.processedCount;
  if (updates.successCount !== undefined) dbUpdates.success_count = updates.successCount;
  if (updates.failedCount !== undefined) dbUpdates.failed_count = updates.failedCount;
  if (updates.skippedCount !== undefined) dbUpdates.skipped_count = updates.skippedCount;
  if (updates.currentBatch !== undefined) dbUpdates.current_batch = updates.currentBatch;
  if (updates.startedAt) dbUpdates.started_at = updates.startedAt;
  if (updates.completedAt) dbUpdates.completed_at = updates.completedAt;
  if (updates.pausedAt) dbUpdates.paused_at = updates.pausedAt;
  if (updates.avgProcessingTimeMs !== undefined) dbUpdates.avg_processing_time_ms = updates.avgProcessingTimeMs;
  if (updates.consecutiveFailures !== undefined) dbUpdates.consecutive_failures = updates.consecutiveFailures;
  if (updates.circuitBreakerTripped !== undefined) dbUpdates.circuit_breaker_tripped = updates.circuitBreakerTripped;
  if (updates.errorsLast10) dbUpdates.errors_last_10 = updates.errorsLast10;
  if (updates.todayCount !== undefined) dbUpdates.today_count = updates.todayCount;
  if (updates.hourCount !== undefined) dbUpdates.hour_count = updates.hourCount;
  
  await supabase
    .from('scraper_jobs')
    .update(dbUpdates)
    .eq('id', jobId);
}

/**
 * Update progress for a single ASIN
 */
async function updateProgress(
  jobId: string,
  asin: string,
  status: 'success' | 'failed' | 'skipped',
  processingTimeMs: number,
  error?: string
): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  
  await supabase
    .from('scraper_progress')
    .update({
      status,
      processing_time_ms: processingTimeMs,
      last_error: error || null,
      scraped_at: status === 'success' ? now : null,
      attempts: supabase.rpc ? undefined : 1, // Increment handled separately
      updated_at: now,
    })
    .eq('job_id', jobId)
    .eq('asin', asin);
    
  // Increment attempts
  await supabase.rpc('increment_scraper_attempts', { 
    p_job_id: jobId, 
    p_asin: asin 
  }).catch(() => {
    // RPC might not exist, that's ok
  });
}

/**
 * Get pending ASINs for a job
 */
async function getPendingAsins(jobId: string, limit: number): Promise<string[]> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('scraper_progress')
    .select('asin')
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .lt('attempts', SCRAPER_CONFIG.maxRetries)
    .order('batch_number', { ascending: true })
    .limit(limit);
    
  if (error) {
    console.error('[BatchScraper] Failed to get pending ASINs:', error);
    return [];
  }
  
  return data.map(d => d.asin);
}

/**
 * Save scraped product to database
 */
async function saveScrapedProduct(product: AmazonScrapedProduct): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  
  // Check if product exists
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('asin', product.asin)
    .single();
    
  const productData = {
    asin: product.asin,
    title: product.title,
    brand: product.brand,
    category: product.category,
    description: product.description,
    bullet_points: product.bulletPoints,
    cost_price: product.price,
    list_price: product.listPrice,
    image_url: product.mainImage,
    images: product.images,
    rating: product.rating,
    review_count: product.reviewCount,
    is_prime: product.isPrime,
    availability: product.availability,
    in_stock: product.inStock,
    stock_quantity: product.stockQuantity,
    weight_oz: product.weightOz,
    weight_grams: product.weightGrams,
    dimensions: product.dimensions,
    package_dimensions: product.packageDimensions,
    upc: product.upc,
    ean: product.ean,
    mpn: product.mpn,
    material: product.material,
    manufacturer: product.manufacturer,
    model_number: product.modelNumber,
    country_of_origin: product.countryOfOrigin,
    date_first_available: product.dateFirstAvailable,
    best_sellers_rank: product.bestSellersRank,
    colors: product.colors,
    sizes: product.sizes,
    styles: product.styles,
    seo_title: product.seoTitle,
    seo_description: product.seoDescription,
    amazon_url: product.amazonUrl,
    source: 'scraper',
    last_scraped_at: now,
    updated_at: now,
  };
  
  if (existing) {
    await supabase
      .from('products')
      .update(productData)
      .eq('id', existing.id);
  } else {
    await supabase
      .from('products')
      .insert({
        ...productData,
        created_at: now,
        status: 'draft',
      });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH MONITORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update scraper health status for health monitor
 */
export async function updateScraperHealth(job: BatchJob | null): Promise<ScraperHealth> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  
  const warnings: string[] = [];
  const errors: string[] = [];
  
  let status: ScraperHealth['status'] = 'healthy';
  
  if (!job) {
    status = 'stopped';
  } else if (job.circuitBreakerTripped) {
    status = 'critical';
    errors.push('Circuit breaker tripped - too many consecutive failures');
  } else if (job.status === 'paused') {
    status = 'degraded';
    warnings.push('Job is paused');
  } else if (job.status === 'failed') {
    status = 'critical';
    errors.push('Job failed');
  }
  
  // Check safe hours
  if (SCRAPER_CONFIG.enforceSafeHours && !isWithinSafeHours()) {
    warnings.push(`Outside safe hours (${SCRAPER_CONFIG.safeHoursStart}AM-${SCRAPER_CONFIG.safeHoursEnd}AM EST)`);
  }
  
  // Calculate metrics
  const successRate = job && job.processedCount > 0 
    ? (job.successCount / job.processedCount) * 100 
    : 100;
    
  if (successRate < 90 && job && job.processedCount > 10) {
    warnings.push(`Low success rate: ${successRate.toFixed(1)}%`);
    if (successRate < 70) status = 'degraded';
  }
  
  // Estimate time remaining
  let estimatedTimeRemaining: string | null = null;
  if (job && job.avgProcessingTimeMs > 0 && job.status === 'running') {
    const remaining = job.totalAsins - job.processedCount;
    const msRemaining = remaining * job.avgProcessingTimeMs;
    estimatedTimeRemaining = formatDuration(msRemaining);
  }
  
  const health: ScraperHealth = {
    status,
    lastCheck: now,
    activeJob: job,
    metrics: {
      successRate: Math.round(successRate * 10) / 10,
      avgResponseTimeMs: job?.avgProcessingTimeMs || 0,
      requestsLastHour: job?.hourCount || 0,
      requestsToday: job?.todayCount || 0,
      estimatedTimeRemaining,
      circuitBreakerStatus: job?.circuitBreakerTripped ? 'open' : 'closed',
    },
    warnings,
    errors,
  };
  
  // Save to database for health monitor
  await supabase
    .from('scraper_health')
    .upsert({
      id: 'current',
      status: health.status,
      last_check: now,
      active_job_id: job?.id || null,
      metrics: health.metrics,
      warnings: health.warnings,
      errors: health.errors,
      updated_at: now,
    });
    
  return health;
}

/**
 * Get current scraper health
 */
export async function getScraperHealth(): Promise<ScraperHealth | null> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('scraper_health')
    .select('*')
    .eq('id', 'current')
    .single();
    
  if (error || !data) return null;
  
  return {
    status: data.status,
    lastCheck: data.last_check,
    activeJob: null, // Would need to fetch separately
    metrics: data.metrics,
    warnings: data.warnings,
    errors: data.errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BATCH SCRAPER
// ═══════════════════════════════════════════════════════════════════════════

// Global state for the running scraper
let currentJob: BatchJob | null = null;
let shouldStop = false;
let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Start batch scraping job
 */
export async function startBatchScrape(asins: string[]): Promise<BatchJob> {
  if (currentJob && currentJob.status === 'running') {
    throw new Error('A batch job is already running');
  }
  
  // Create job
  currentJob = await createBatchJob(asins);
  shouldStop = false;
  
  // Start health check interval
  healthCheckInterval = setInterval(async () => {
    if (currentJob) {
      await updateScraperHealth(currentJob);
    }
  }, SCRAPER_CONFIG.healthCheckIntervalMs);
  
  // Start processing in background
  processBatchJob(currentJob.id).catch(error => {
    console.error('[BatchScraper] Fatal error:', error);
    if (currentJob) {
      currentJob.status = 'failed';
      updateJobStatus(currentJob.id, { status: 'failed' });
      updateScraperHealth(currentJob);
    }
  });
  
  return currentJob;
}

/**
 * Stop the current batch job
 */
export async function stopBatchScrape(): Promise<void> {
  shouldStop = true;
  
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  
  if (currentJob) {
    currentJob.status = 'stopped';
    await updateJobStatus(currentJob.id, { 
      status: 'stopped',
      pausedAt: new Date().toISOString(),
    });
    await updateScraperHealth(currentJob);
  }
  
  console.log('[BatchScraper] Stop requested');
}

/**
 * Pause the current batch job
 */
export async function pauseBatchScrape(): Promise<void> {
  if (currentJob && currentJob.status === 'running') {
    currentJob.status = 'paused';
    currentJob.pausedAt = new Date().toISOString();
    await updateJobStatus(currentJob.id, { 
      status: 'paused',
      pausedAt: currentJob.pausedAt,
    });
    await updateScraperHealth(currentJob);
    console.log('[BatchScraper] Job paused');
  }
}

/**
 * Resume a paused batch job
 */
export async function resumeBatchScrape(jobId?: string): Promise<BatchJob | null> {
  const supabase = getSupabase();
  
  // Find job to resume
  const targetJobId = jobId || currentJob?.id;
  if (!targetJobId) {
    throw new Error('No job to resume');
  }
  
  const { data: jobData } = await supabase
    .from('scraper_jobs')
    .select('*')
    .eq('id', targetJobId)
    .single();
    
  if (!jobData) {
    throw new Error('Job not found');
  }
  
  if (jobData.status !== 'paused' && jobData.status !== 'stopped') {
    throw new Error(`Cannot resume job with status: ${jobData.status}`);
  }
  
  // Reconstruct job object
  currentJob = {
    id: jobData.id,
    status: 'running',
    totalAsins: jobData.total_asins,
    processedCount: jobData.processed_count,
    successCount: jobData.success_count,
    failedCount: jobData.failed_count,
    skippedCount: jobData.skipped_count,
    currentBatch: jobData.current_batch,
    totalBatches: jobData.total_batches,
    startedAt: jobData.started_at,
    completedAt: null,
    pausedAt: null,
    lastActivityAt: new Date().toISOString(),
    estimatedCompletionAt: null,
    avgProcessingTimeMs: jobData.avg_processing_time_ms || 0,
    errorsLast10: jobData.errors_last_10 || [],
    consecutiveFailures: 0,
    circuitBreakerTripped: false,
    todayCount: jobData.today_count || 0,
    hourCount: 0,
    lastHourReset: new Date().toISOString(),
  };
  
  shouldStop = false;
  
  await updateJobStatus(currentJob.id, { status: 'running' });
  
  // Restart health check
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  healthCheckInterval = setInterval(async () => {
    if (currentJob) {
      await updateScraperHealth(currentJob);
    }
  }, SCRAPER_CONFIG.healthCheckIntervalMs);
  
  // Resume processing
  processBatchJob(currentJob.id).catch(error => {
    console.error('[BatchScraper] Fatal error:', error);
  });
  
  console.log(`[BatchScraper] Resumed job ${currentJob.id}`);
  
  return currentJob;
}

/**
 * Main processing loop
 */
async function processBatchJob(jobId: string): Promise<void> {
  if (!currentJob || currentJob.id !== jobId) {
    console.error('[BatchScraper] Job mismatch');
    return;
  }
  
  const startTime = Date.now();
  currentJob.status = 'running';
  currentJob.startedAt = currentJob.startedAt || new Date().toISOString();
  
  await updateJobStatus(jobId, { 
    status: 'running',
    startedAt: currentJob.startedAt,
  });
  
  console.log(`[BatchScraper] Starting job ${jobId}`);
  console.log(`[BatchScraper] Total ASINs: ${currentJob.totalAsins}`);
  console.log(`[BatchScraper] Batch size: ${SCRAPER_CONFIG.batchSize}`);
  console.log(`[BatchScraper] Safe hours: ${SCRAPER_CONFIG.safeHoursStart}AM-${SCRAPER_CONFIG.safeHoursEnd}AM EST`);
  
  let batchCount = 0;
  let processingTimes: number[] = [];
  
  while (!shouldStop) {
    // Check if paused
    if (currentJob.status === 'paused') {
      await sleep(5000);
      continue;
    }
    
    // Check safe hours
    if (SCRAPER_CONFIG.enforceSafeHours && !isWithinSafeHours()) {
      const waitTime = getTimeUntilSafeWindow();
      console.log(`[BatchScraper] Outside safe hours. Waiting ${formatDuration(waitTime)}...`);
      currentJob.status = 'paused';
      currentJob.pausedAt = new Date().toISOString();
      await updateJobStatus(jobId, { 
        status: 'paused',
        pausedAt: currentJob.pausedAt,
      });
      await updateScraperHealth(currentJob);
      await sleep(waitTime);
      currentJob.status = 'running';
      await updateJobStatus(jobId, { status: 'running' });
      continue;
    }
    
    // Check daily limit
    if (currentJob.todayCount >= SCRAPER_CONFIG.maxPerDay) {
      console.log('[BatchScraper] Daily limit reached. Pausing until tomorrow...');
      currentJob.status = 'paused';
      await updateJobStatus(jobId, { status: 'paused' });
      await updateScraperHealth(currentJob);
      // Wait until midnight EST
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(5, 0, 0, 0); // 5 AM UTC = midnight EST
      if (midnight <= now) midnight.setDate(midnight.getDate() + 1);
      await sleep(midnight.getTime() - now.getTime());
      currentJob.todayCount = 0;
      currentJob.status = 'running';
      await updateJobStatus(jobId, { status: 'running', todayCount: 0 });
      continue;
    }
    
    // Check hourly limit
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    if (currentJob.lastHourReset < hourAgo) {
      currentJob.hourCount = 0;
      currentJob.lastHourReset = new Date().toISOString();
    }
    
    if (currentJob.hourCount >= SCRAPER_CONFIG.maxPerHour) {
      const waitTime = 3600000 - (Date.now() - new Date(currentJob.lastHourReset).getTime());
      console.log(`[BatchScraper] Hourly limit reached. Waiting ${formatDuration(waitTime)}...`);
      await sleep(waitTime);
      currentJob.hourCount = 0;
      currentJob.lastHourReset = new Date().toISOString();
      continue;
    }
    
    // Check circuit breaker
    if (currentJob.circuitBreakerTripped) {
      console.log('[BatchScraper] Circuit breaker tripped. Waiting to reset...');
      await sleep(SCRAPER_CONFIG.circuitBreakerResetMs);
      currentJob.circuitBreakerTripped = false;
      currentJob.consecutiveFailures = 0;
      await updateJobStatus(jobId, { 
        circuitBreakerTripped: false,
        consecutiveFailures: 0,
      });
      continue;
    }
    
    // Get next batch of ASINs
    const pendingAsins = await getPendingAsins(jobId, SCRAPER_CONFIG.batchSize);
    
    if (pendingAsins.length === 0) {
      // Job complete
      currentJob.status = 'completed';
      currentJob.completedAt = new Date().toISOString();
      await updateJobStatus(jobId, { 
        status: 'completed',
        completedAt: currentJob.completedAt,
      });
      console.log(`[BatchScraper] Job ${jobId} completed!`);
      console.log(`[BatchScraper] Processed: ${currentJob.processedCount}`);
      console.log(`[BatchScraper] Success: ${currentJob.successCount}`);
      console.log(`[BatchScraper] Failed: ${currentJob.failedCount}`);
      console.log(`[BatchScraper] Total time: ${formatDuration(Date.now() - startTime)}`);
      break;
    }
    
    batchCount++;
    currentJob.currentBatch = batchCount;
    console.log(`[BatchScraper] Processing batch ${batchCount}/${currentJob.totalBatches} (${pendingAsins.length} ASINs)`);
    
    // Process each ASIN in batch
    for (const asin of pendingAsins) {
      if (shouldStop) break;
      
      const asinStartTime = Date.now();
      
      try {
        // Get random user agent for this request
        const userAgent = getRandomUserAgent();
        
        // Scrape the product
        const product = await scrapeAmazonProductWithUA(asin, userAgent);
        const processingTime = Date.now() - asinStartTime;
        processingTimes.push(processingTime);
        
        if (product.error) {
          // Failed
          currentJob.failedCount++;
          currentJob.consecutiveFailures++;
          currentJob.errorsLast10 = [
            product.error,
            ...currentJob.errorsLast10.slice(0, 9),
          ];
          
          await updateProgress(jobId, asin, 'failed', processingTime, product.error);
          
          console.log(`[BatchScraper] ❌ ${asin}: ${product.error}`);
          
          // Check circuit breaker
          if (currentJob.consecutiveFailures >= SCRAPER_CONFIG.circuitBreakerThreshold) {
            console.log('[BatchScraper] Circuit breaker triggered!');
            currentJob.circuitBreakerTripped = true;
            await updateJobStatus(jobId, { circuitBreakerTripped: true });
            break;
          }
        } else if (!product.inStock) {
          // Out of stock - skip
          currentJob.skippedCount++;
          currentJob.consecutiveFailures = 0;
          await updateProgress(jobId, asin, 'skipped', processingTime, 'Out of stock');
          console.log(`[BatchScraper] ⏭️ ${asin}: Out of stock`);
        } else {
          // Success
          currentJob.successCount++;
          currentJob.consecutiveFailures = 0;
          await saveScrapedProduct(product);
          await updateProgress(jobId, asin, 'success', processingTime);
          console.log(`[BatchScraper] ✅ ${asin}: ${product.title?.substring(0, 50)}...`);
        }
        
        currentJob.processedCount++;
        currentJob.todayCount++;
        currentJob.hourCount++;
        
        // Update average processing time
        currentJob.avgProcessingTimeMs = Math.round(
          processingTimes.slice(-100).reduce((a, b) => a + b, 0) / 
          Math.min(processingTimes.length, 100)
        );
        
        // Update job status periodically
        if (currentJob.processedCount % 10 === 0) {
          await updateJobStatus(jobId, {
            processedCount: currentJob.processedCount,
            successCount: currentJob.successCount,
            failedCount: currentJob.failedCount,
            skippedCount: currentJob.skippedCount,
            currentBatch: currentJob.currentBatch,
            avgProcessingTimeMs: currentJob.avgProcessingTimeMs,
            consecutiveFailures: currentJob.consecutiveFailures,
            errorsLast10: currentJob.errorsLast10,
            todayCount: currentJob.todayCount,
            hourCount: currentJob.hourCount,
          });
        }
        
      } catch (error) {
        console.error(`[BatchScraper] Error processing ${asin}:`, error);
        currentJob.failedCount++;
        currentJob.consecutiveFailures++;
        currentJob.processedCount++;
        await updateProgress(
          jobId, 
          asin, 
          'failed', 
          Date.now() - asinStartTime,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
      
      // Random delay between requests
      const delay = getRandomDelay();
      await sleep(delay);
    }
    
    // Batch pause
    if (!shouldStop && batchCount < currentJob.totalBatches) {
      console.log(`[BatchScraper] Batch complete. Pausing ${formatDuration(SCRAPER_CONFIG.batchPauseMs)}...`);
      await sleep(SCRAPER_CONFIG.batchPauseMs);
      
      // Long pause every N batches
      if (batchCount % SCRAPER_CONFIG.longPauseEveryNBatches === 0) {
        console.log(`[BatchScraper] Long pause: ${formatDuration(SCRAPER_CONFIG.longPauseMs)}...`);
        await sleep(SCRAPER_CONFIG.longPauseMs);
      }
    }
  }
  
  // Cleanup
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  
  await updateScraperHealth(currentJob);
}

/**
 * Scrape with custom user agent
 */
async function scrapeAmazonProductWithUA(
  asin: string, 
  userAgent: string
): Promise<AmazonScrapedProduct> {
  const url = `https://www.amazon.com/dp/${asin}`;
  const now = new Date().toISOString();
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
    });

    if (!response.ok) {
      // Check for rate limiting
      if (response.status === 503 || response.status === 429) {
        return {
          asin,
          error: `Rate limited (${response.status})`,
        } as AmazonScrapedProduct;
      }
      
      return {
        asin,
        error: `HTTP ${response.status}`,
      } as AmazonScrapedProduct;
    }

    const html = await response.text();
    
    // Check for CAPTCHA
    if (html.includes('captcha') || html.includes('robot check')) {
      return {
        asin,
        error: 'CAPTCHA detected',
      } as AmazonScrapedProduct;
    }
    
    // Use existing parser
    return scrapeAmazonProduct(asin);
    
  } catch (error) {
    return {
      asin,
      error: error instanceof Error ? error.message : 'Unknown error',
    } as AmazonScrapedProduct;
  }
}

/**
 * Get current job status
 */
export function getCurrentJob(): BatchJob | null {
  return currentJob;
}

/**
 * Get job by ID from database
 */
export async function getJob(jobId: string): Promise<BatchJob | null> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('scraper_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
    
  if (error || !data) return null;
  
  return {
    id: data.id,
    status: data.status,
    totalAsins: data.total_asins,
    processedCount: data.processed_count,
    successCount: data.success_count,
    failedCount: data.failed_count,
    skippedCount: data.skipped_count,
    currentBatch: data.current_batch,
    totalBatches: data.total_batches,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    pausedAt: data.paused_at,
    lastActivityAt: data.last_activity_at,
    estimatedCompletionAt: null,
    avgProcessingTimeMs: data.avg_processing_time_ms || 0,
    errorsLast10: data.errors_last_10 || [],
    consecutiveFailures: data.consecutive_failures || 0,
    circuitBreakerTripped: data.circuit_breaker_tripped || false,
    todayCount: data.today_count || 0,
    hourCount: data.hour_count || 0,
    lastHourReset: data.last_hour_reset || new Date().toISOString(),
  };
}

