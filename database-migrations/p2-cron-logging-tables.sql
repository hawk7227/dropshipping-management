-- P2 Cron Job Logging Tables Migration
-- Creates tables for cron job execution tracking and metadata

-- ═══════════════════════════════════════════════════════════════════════════
-- CRON JOB LOGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cron_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN (
    'product-discovery', 'price-sync', 'full-price-sync', 
    'shopify-sync', 'order-sync', 'daily-stats',
    'google-shopping', 'omnipresence', 'daily-learning', 'ai-scoring'
  )),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  processed INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  message TEXT,
  details JSONB,
  error_log JSONB,
  triggered_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for cron_job_logs
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_job_type ON cron_job_logs(job_type);
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_status ON cron_job_logs(status);
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_started_at ON cron_job_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_triggered_by ON cron_job_logs(triggered_by);

-- ═══════════════════════════════════════════════════════════════════════════
-- CRON JOB METRICS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cron_job_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  date DATE NOT NULL,
  failure_rate DECIMAL(5,2) DEFAULT 0.00,
  avg_success_rate DECIMAL(5,2) DEFAULT 100.00,
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,
  avg_duration_seconds DECIMAL(8,2),
  min_duration_seconds INTEGER,
  max_duration_seconds INTEGER,
  total_processed INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for daily metrics per job type
  UNIQUE(job_type, date)
);

-- Add indexes for cron_job_metrics
CREATE INDEX IF NOT EXISTS idx_cron_job_metrics_job_type ON cron_job_metrics(job_type);
CREATE INDEX IF NOT EXISTS idx_cron_job_metrics_date ON cron_job_metrics(date);
CREATE INDEX IF NOT EXISTS idx_cron_job_metrics_last_run_at ON cron_job_metrics(last_run_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- CRON JOB HEALTH TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cron_job_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'warning', 'critical')),
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  failure_rate DECIMAL(5,2) DEFAULT 0.00,
  avg_success_rate DECIMAL(5,2) DEFAULT 100.00,
  last_24h_runs INTEGER DEFAULT 0,
  last_24h_success INTEGER DEFAULT 0,
  last_7d_runs INTEGER DEFAULT 0,
  last_7d_success INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
  issues_detected TEXT[],
  recommendations TEXT[],
  last_check_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for cron_job_health
CREATE INDEX IF NOT EXISTS idx_cron_job_health_status ON cron_job_health(status);
CREATE INDEX IF NOT EXISTS idx_cron_job_health_health_score ON cron_job_health(health_score);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on cron tables
ALTER TABLE cron_job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_job_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_job_health ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view cron job logs" ON cron_job_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage cron job logs" ON cron_job_logs
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view cron job metrics" ON cron_job_metrics
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage cron job metrics" ON cron_job_metrics
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view cron job health" ON cron_job_health
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage cron job health" ON cron_job_health
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════

-- Create triggers for updated_at on cron tables
CREATE TRIGGER update_cron_job_logs_updated_at 
  BEFORE UPDATE ON cron_job_logs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cron_job_metrics_updated_at 
  BEFORE UPDATE ON cron_job_metrics 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cron_job_health_updated_at 
  BEFORE UPDATE ON cron_job_health 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- AUTOMATIC METRICS UPDATE FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_cron_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update metrics for completed jobs
  INSERT INTO cron_job_metrics (
    job_type,
    date,
    total_runs,
    successful_runs,
    failed_runs,
    avg_duration_seconds,
    min_duration_seconds,
    max_duration_seconds,
    total_processed,
    total_errors,
    last_run_at,
    last_status,
    updated_at
  )
  SELECT 
    job_type,
    CURRENT_DATE as date,
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
    ROUND(AVG(duration_seconds), 2) as avg_duration_seconds,
    MIN(duration_seconds) as min_duration_seconds,
    MAX(duration_seconds) as max_duration_seconds,
    SUM(processed) as total_processed,
    SUM(errors) as total_errors,
    MAX(started_at) as last_run_at,
    MAX(status) as last_status,
    NOW() as updated_at
  FROM cron_job_logs
  WHERE DATE(started_at) = CURRENT_DATE
  GROUP BY job_type
  ON CONFLICT (job_type, date) 
  DO UPDATE SET
    total_runs = EXCLUDED.total_runs,
    successful_runs = EXCLUDED.successful_runs,
    failed_runs = EXCLUDED.failed_runs,
    avg_duration_seconds = EXCLUDED.avg_duration_seconds,
    min_duration_seconds = EXCLUDED.min_duration_seconds,
    max_duration_seconds = EXCLUDED.max_duration_seconds,
    total_processed = EXCLUDED.total_processed,
    total_errors = EXCLUDED.total_errors,
    last_run_at = EXCLUDED.last_run_at,
    last_status = EXCLUDED.last_status,
    updated_at = EXCLUDED.updated_at;

  -- Update health status
  INSERT INTO cron_job_health (
    job_type,
    status,
    last_success_at,
    last_failure_at,
    consecutive_failures,
    failure_rate,
    avg_success_rate,
    last_24h_runs,
    last_24h_success,
    last_7d_runs,
    last_7d_success,
    health_score,
    issues_detected,
    recommendations,
    last_check_at,
    updated_at
  )
  SELECT 
    job_type,
    CASE 
      WHEN last_7d_success = 0 THEN 'critical'
      WHEN last_7d_success < last_7d_runs * 0.8 THEN 'warning'
      ELSE 'healthy'
    END as status,
    last_success_at,
    last_failure_at,
    consecutive_failures,
    ROUND(
      CASE 
        WHEN last_7d_runs = 0 THEN 0
        ELSE (last_7d_runs::DECIMAL - last_7d_success::DECIMAL) / last_7d_runs::DECIMAL * 100
      END, 2
    ) as failure_rate,
    ROUND(
      CASE 
        WHEN last_7d_runs = 0 THEN 100
        ELSE last_7d_success::DECIMAL / last_7d_runs::DECIMAL * 100
      END, 2
    ) as avg_success_rate,
    last_24h_runs,
    last_24h_success,
    last_7d_runs,
    last_7d_success,
    CASE 
      WHEN last_7d_success = 0 THEN 0
      WHEN last_7d_success < last_7d_runs * 0.5 THEN 25
      WHEN last_7d_success < last_7d_runs * 0.8 THEN 50
      WHEN last_7d_success < last_7d_runs * 0.95 THEN 75
      ELSE 100
    END as health_score,
    CASE 
      WHEN last_7d_success = 0 THEN ARRAY['No successful runs in 7 days']
      WHEN consecutive_failures > 3 THEN ARRAY[CONCAT('High failure rate: ', consecutive_failures::TEXT, ' consecutive failures')]
      WHEN avg_success_rate < 90 THEN ARRAY['Low success rate detected']
      ELSE ARRAY[]::TEXT[]
    END as issues_detected,
    CASE 
      WHEN last_7d_success = 0 THEN ARRAY['Investigate job failures', 'Check error logs', 'Verify dependencies']
      WHEN consecutive_failures > 3 THEN ARRAY['Review recent error logs', 'Check system resources', 'Verify external API status']
      WHEN avg_success_rate < 90 THEN ARRAY['Monitor job performance', 'Review error patterns']
      ELSE ARRAY[]::TEXT[]
    END as recommendations,
    NOW() as last_check_at,
    NOW() as updated_at
  FROM (
    SELECT 
      job_type,
      MAX(started_at) FILTER (WHERE status = 'completed') as last_success_at,
      MAX(started_at) FILTER (WHERE status = 'failed') as last_failure_at,
      COUNT(*) FILTER (WHERE status = 'failed' AND 
        started_at > NOW() - INTERVAL '7 days'
        AND started_at = (
          SELECT MAX(started_at) 
          FROM cron_job_logs c2 
          WHERE c2.job_type = cron_job_logs.job_type 
          AND c2.status = 'failed'
          AND c2.started_at > NOW() - INTERVAL '7 days'
        )
      ) as consecutive_failures,
      COUNT(*) as last_7d_runs,
      COUNT(*) FILTER (WHERE status = 'completed' AND started_at > NOW() - INTERVAL '7 days') as last_7d_success,
      COUNT(*) FILTER (WHERE status = 'completed' AND started_at > NOW() - INTERVAL '1 day') as last_24h_success,
      COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '1 day') as last_24h_runs
    FROM cron_job_logs
    WHERE started_at > NOW() - INTERVAL '7 days'
    GROUP BY job_type
  ) as metrics
  ON CONFLICT (job_type) 
  DO UPDATE SET
    status = EXCLUDED.status,
    last_success_at = EXCLUDED.last_success_at,
    last_failure_at = EXCLUDED.last_failure_at,
    consecutive_failures = EXCLUDED.consecutive_failures,
    failure_rate = EXCLUDED.failure_rate,
    avg_success_rate = EXCLUDED.avg_success_rate,
    last_24h_runs = EXCLUDED.last_24h_runs,
    last_24h_success = EXCLUDED.last_24h_success,
    last_7d_runs = EXCLUDED.last_7d_runs,
    last_7d_success = EXCLUDED.last_7d_success,
    health_score = EXCLUDED.health_score,
    issues_detected = EXCLUDED.issues_detected,
    recommendations = EXCLUDED.recommendations,
    last_check_at = EXCLUDED.last_check_at,
    updated_at = EXCLUDED.updated_at;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update metrics after cron job completion
CREATE TRIGGER update_cron_metrics_trigger
  AFTER INSERT OR UPDATE ON cron_job_logs
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed'))
  EXECUTE FUNCTION update_cron_metrics();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE cron_job_logs IS 'Detailed log of all cron job executions with timing and results';
COMMENT ON TABLE cron_job_metrics IS 'Daily aggregated metrics for each cron job type';
COMMENT ON TABLE cron_job_health IS 'Health monitoring for cron jobs with failure tracking and alerts';

COMMENT ON COLUMN cron_job_logs.job_type IS 'Type of cron job: product-discovery, price-sync, etc.';
COMMENT ON COLUMN cron_job_logs.status IS 'Job status: running, completed, failed';
COMMENT ON COLUMN cron_job_logs.duration_seconds IS 'How long the job took to complete';
COMMENT ON COLUMN cron_job_logs.processed IS 'Number of items processed by the job';
COMMENT ON COLUMN cron_job_logs.error_log IS 'Detailed error information if job failed';

COMMENT ON COLUMN cron_job_metrics.failure_rate IS 'Percentage of failed runs in the time period';
COMMENT ON COLUMN cron_job_metrics.avg_success_rate IS 'Percentage of successful runs in the time period';
COMMENT ON COLUMN cron_job_health.health_score IS 'Overall health score (0-100) for the job';

COMMENT ON COLUMN cron_job_health.consecutive_failures IS 'Number of failures in a row';
COMMENT ON COLUMN cron_job_health.issues_detected IS 'Array of detected issues for the job';
COMMENT ON COLUMN cron_job_health.recommendations IS 'Array of recommended actions';
