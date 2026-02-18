-- database-migrations/webhook-logs.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- WEBHOOK LOGS TABLE — Spec Item 36 (supporting)
-- Idempotency tracking + audit trail for Shopify webhooks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS webhook_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      TEXT NOT NULL,
  topic           TEXT NOT NULL,
  shop_domain     TEXT NOT NULL DEFAULT '',
  success         BOOLEAN NOT NULL DEFAULT true,
  message         TEXT DEFAULT NULL,
  payload_summary TEXT DEFAULT NULL,
  processing_ms   INTEGER DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique on webhook_id for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs (webhook_id);

-- Index for querying by topic and time
CREATE INDEX IF NOT EXISTS idx_webhook_logs_topic_created ON webhook_logs (topic, created_at DESC);

-- Auto-clean old logs (keep 30 days)
-- Run: DELETE FROM webhook_logs WHERE created_at < now() - interval '30 days';

-- Enable RLS
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_logs_read" ON webhook_logs FOR SELECT USING (true);
CREATE POLICY "webhook_logs_write" ON webhook_logs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE webhook_logs IS 'Audit trail for Shopify webhook processing. Used for idempotency checks.';
