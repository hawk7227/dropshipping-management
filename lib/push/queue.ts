// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/push/queue.ts
// LINES: ~130
// IMPORTS FROM: lib/contracts/product.ts (CleanProduct)
// EXPORTS TO: Generator page, push UI components
// DOES: Manages a queue of push jobs. Each product is an independent unit with its own status (queued/pushing/pushed/failed/retrying), retry count, and error. Supports configurable concurrency and batch size. One product failing does NOT block others. Progress is observable via callback.
// DOES NOT: Call Shopify API directly (that's the adapter). Render UI. Modify the product data.
// BREAKS IF: onProgress callback throws (wrapped in try/catch). Adapter function rejects without a message (caught as "Unknown error").
// ASSUMES: Adapter function signature: (products: CleanProduct[]) => Promise<{ asin: string; success: boolean; error?: string }[]>
// LEVEL: 3 — Integrated. Each job is isolated. Retry logic per product. Concurrency-controlled. Observable progress.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

import type { CleanProduct } from '../contracts/product';

// ── Job types ───────────────────────────────────────────

export type PushJobStatus = 'queued' | 'pushing' | 'pushed' | 'failed' | 'retrying';

export interface PushJob {
  product: CleanProduct;
  status: PushJobStatus;
  retries: number;
  error: string;
}

export interface PushProgress {
  total: number;
  done: number;
  pushed: number;
  failed: number;
  retrying: number;
  queued: number;
  currentBatch: string;
  jobs: PushJob[];
}

export interface PushQueueConfig {
  batchSize: number;       // Products per API call (default: 3)
  concurrency: number;     // Parallel API calls per wave (default: 4)
  maxRetries: number;      // Max retries per product (default: 2)
  delayBetweenWaves: number; // ms between waves (default: 500)
}

const DEFAULT_CONFIG: PushQueueConfig = {
  batchSize: 3,
  concurrency: 4,
  maxRetries: 2,
  delayBetweenWaves: 500,
};

// ── Adapter type ────────────────────────────────────────
// The queue doesn't know HOW to push. It calls this function.
// Shopify adapter, eBay adapter, etc. all implement this shape.

export type PushAdapter = (products: CleanProduct[]) => Promise<{ asin: string; success: boolean; error?: string }[]>;

// ── Queue runner ────────────────────────────────────────

export async function runPushQueue(
  products: CleanProduct[],
  adapter: PushAdapter,
  onProgress: (progress: PushProgress) => void,
  config: Partial<PushQueueConfig> = {},
): Promise<PushProgress> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Initialize jobs
  const jobs: PushJob[] = products.map(p => ({
    product: p, status: 'queued' as PushJobStatus, retries: 0, error: '',
  }));

  const report = (): PushProgress => ({
    total: jobs.length,
    done: jobs.filter(j => j.status === 'pushed' || j.status === 'failed').length,
    pushed: jobs.filter(j => j.status === 'pushed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    retrying: jobs.filter(j => j.status === 'retrying').length,
    queued: jobs.filter(j => j.status === 'queued').length,
    currentBatch: '',
    jobs,
  });

  const emitProgress = (msg: string) => {
    try { onProgress({ ...report(), currentBatch: msg }); } catch { /* callback error — ignore */ }
  };

  // Build batches from queued jobs
  const buildBatches = (): PushJob[][] => {
    const eligible = jobs.filter(j => j.status === 'queued' || j.status === 'retrying');
    const batches: PushJob[][] = [];
    for (let i = 0; i < eligible.length; i += cfg.batchSize) {
      batches.push(eligible.slice(i, i + cfg.batchSize));
    }
    return batches;
  };

  // Process in waves
  let waveNum = 0;
  let batches = buildBatches();

  while (batches.length > 0) {
    const waveBatches = batches.slice(0, cfg.concurrency);
    waveNum++;
    emitProgress(`Wave ${waveNum} — pushing ${waveBatches.reduce((s, b) => s + b.length, 0)} products...`);

    // Mark as pushing
    for (const batch of waveBatches) {
      for (const job of batch) job.status = 'pushing';
    }
    emitProgress(`Wave ${waveNum} — in flight...`);

    // Fire all batches concurrently
    const results = await Promise.allSettled(
      waveBatches.map(batch => adapter(batch.map(j => j.product)))
    );

    // Process results — each product independently
    for (let bi = 0; bi < results.length; bi++) {
      const result = results[bi];
      const batch = waveBatches[bi];

      if (result.status === 'rejected') {
        // Entire batch failed — retry each product independently
        for (const job of batch) {
          job.retries++;
          if (job.retries >= cfg.maxRetries) {
            job.status = 'failed';
            job.error = String(result.reason || 'Batch request failed');
          } else {
            job.status = 'retrying';
            job.error = `Retry ${job.retries}/${cfg.maxRetries}: ${String(result.reason || 'Batch failed')}`;
          }
        }
        continue;
      }

      const adapterResults = result.value || [];
      for (const job of batch) {
        const ar = adapterResults.find(r => r.asin === job.product.asin);
        if (ar?.success) {
          job.status = 'pushed';
          job.error = '';
        } else {
          job.retries++;
          if (job.retries >= cfg.maxRetries) {
            job.status = 'failed';
            job.error = ar?.error || 'No result from adapter';
          } else {
            job.status = 'retrying';
            job.error = `Retry ${job.retries}/${cfg.maxRetries}: ${ar?.error || 'Failed'}`;
          }
        }
      }
    }

    emitProgress(`Wave ${waveNum} complete — ${report().pushed} pushed, ${report().failed} failed`);

    // Rebuild batches (retrying jobs go back into the queue)
    batches = buildBatches();
    if (batches.length > 0) {
      await new Promise(r => setTimeout(r, cfg.delayBetweenWaves));
    }
  }

  const final = report();
  emitProgress(final.failed > 0
    ? `Done — ${final.pushed} pushed, ${final.failed} failed`
    : `Done — all ${final.pushed} products pushed successfully`);

  return final;
}
