-- P9 Observability Tables Migration
-- Creates tables for structured logging, monitoring, and alerting

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SYSTEM LOGS TABLE
-- ═════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'critical')),
  category TEXT NOT NULL CHECK (category IN ('api', 'database', 'validation', 'business_logic', 'external_service', 'system', 'network', 'authentication', 'rate_limit', 'timeout')),
  pipeline TEXT NOT NULL CHECK (pipeline IN ('product_discovery', 'price_sync', 'ai_analysis', 'social_posting', 'google_shopping', 'zapier_integration', 'order_sync', 'daily_stats', 'shopify_sync')),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  context JSONB DEFAULT '{}',
  error JSONB,
  metrics JSONB DEFAULT '{}',
  recovery JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for system_logs
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_system_logs_pipeline ON system_logs(pipeline);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- SYSTEM ALERTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  pipeline TEXT NOT NULL CHECK (pipeline IN ('product_discovery', 'price_sync', 'ai_analysis', 'social_posting', 'google_shopping', 'zapier_integration', 'order_sync', 'daily_stats', 'shopify_sync')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- Add indexes for system_alerts
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_system_alerts_pipeline ON system_alerts(pipeline);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created_at ON system_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_system_alerts_resolved_at ON system_alerts(resolved_at);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- SYSTEM METRICS TABLE
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_metrics (
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  cpu_usage_percent NUMERIC DEFAULT 0,
  memory_usage_mb NUMERIC DEFAULT 0,
  disk_usage_percent NUMERIC DEFAULT 0,
  active_connections INTEGER DEFAULT 0,
  database_connections INTEGER DEFAULT 0,
  cache_hit_rate NUMERIC DEFAULT 0,
  error_rate_5min NUMERIC DEFAULT 0,
  avg_response_time_ms NUMERIC DEFAULT 0,
  throughput_per_minute INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for system_metrics
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_metrics_created_at ON system_metrics(created_at);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MONITORING THRESHOLDS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS monitoring_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline TEXT NOT NULL CHECK (pipeline IN ('product_discovery', 'price_sync', 'ai_analysis', 'social_posting', 'google_shopping', 'zapier_integration', 'order_sync', 'daily_stats', 'shopify_sync')),
  metric TEXT NOT NULL,
  threshold NUMERIC NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('gt', 'lt', 'eq', 'gte', 'lte')),
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'error', 'critical')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for pipeline+metric combination
  UNIQUE(pipeline, metric)
);

-- Add indexes for monitoring_thresholds
CREATE INDEX IF NOT EXISTS idx_monitoring_thresholds_pipeline ON monitoring_thresholds(pipeline);
CREATE INDEX IF NOT EXISTS idx_monitoring_thresholds_metric ON monitoring_thresholds(metric);
CREATE INDEX IF NOT EXISTS idx_monitoring_thresholds_severity ON monitoring_thresholds(severity);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- HEALTH CHECK RESULTS TABLE
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS health_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline TEXT NOT NULL CHECK (pipeline IN ('product_discovery', 'price_sync', 'ai_analysis', 'social_posting', 'google_shopping', 'zapier_integration', 'order_sync', 'daily_stats', 'shopify_sync')),
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
  last_check TIMESTAMPTZ DEFAULT NOW(),
  response_time_ms INTEGER DEFAULT 0,
  error_rate NUMERIC DEFAULT 0,
  uptime_percentage NUMERIC DEFAULT 0,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for health_check_results
CREATE INDEX IF NOT EXISTS idx_health_check_results_pipeline ON health_check_results(pipeline);
CREATE INDEX IF NOT EXISTS idx_health_check_results_status ON health_check_results(status);
CREATE INDEX IF NOT EXISTS idx_health_check_results_last_check ON health_check_results(last_check);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- Enable RLS on observability tables
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_check_results ENABLE ROW LEVEL SECURITY;

-- Create policies for system access
CREATE POLICY "System can access all observability data" ON system_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "System can access all alerts" ON system_alerts
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "System can access all metrics" ON system_metrics
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "System can access thresholds" ON monitoring_thresholds
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "System can access health checks" ON health_check_results
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Create policies for admin access
CREATE POLICY "Admin can access all observability data" ON system_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin can access all alerts" ON system_alerts
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin can access all metrics" ON system_metrics
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin can access thresholds" ON monitoring_thresholds
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin can access health checks" ON health_check_results
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Create policies for read-only access for authenticated users
CREATE POLICY "Users can read observability data" ON system_logs
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('user', 'admin', 'service_role'));

CREATE POLICY "Users can read alerts" ON system_alerts
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('user', 'admin', 'service_role'));

CREATE POLICY "Users can read metrics" ON system_metrics
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('user', 'admin', 'service_role'));

CREATE POLICY "Users can read thresholds" ON monitoring_thresholds
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('user', 'admin', 'service_role'));

CREATE POLICY "Users can read health checks" ON health_check_results
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('user', 'admin', 'service_role'));

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- Create triggers for updated_at on observability tables
CREATE TRIGGER update_system_logs_updated_at 
  BEFORE UPDATE ON system_logs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_alerts_updated_at 
  BEFORE UPDATE ON system_alerts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_metrics_updated_at 
  BEFORE UPDATE ON system_metrics 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monitoring_thresholds_updated_at 
  BEFORE UPDATE ON monitoring_thresholds 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_health_check_results_updated_at 
  BEFORE UPDATE ON health_check_results 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- VIEWS FOR COMMON QUERIES
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- Recent logs view
CREATE OR REPLACE VIEW recent_system_logs AS
SELECT 
  id,
  timestamp,
  level,
  category,
  pipeline,
  message,
  context,
  error,
  metrics,
  recovery
FROM system_logs
ORDER BY timestamp DESC
LIMIT 100;

-- Critical alerts view
CREATE OR REPLACE VIEW critical_system_alerts AS
SELECT 
  id,
  severity,
  pipeline,
  title,
  message,
  created_at,
  resolved_at,
  acknowledged_at,
  metadata
FROM system_alerts
WHERE severity IN ('error', 'critical')
  AND resolved_at IS NULL
ORDER BY created_at DESC;

-- System metrics summary view
CREATE OR REPLACE VIEW system_metrics_summary AS
SELECT 
  timestamp,
  cpu_usage_percent,
  memory_usage_mb,
  disk_usage_percent,
  active_connections,
  database_connections,
  cache_hit_rate,
  error_rate_5min,
  avg_response_time_ms,
  throughput_per_minute
FROM system_metrics
ORDER BY timestamp DESC
LIMIT 24;

-- Health check status view
CREATE OR REPLACE VIEW health_check_status AS
SELECT 
  pipeline,
  status,
  last_check,
  response_time_ms,
  error_rate,
  uptime_percentage,
  details
FROM health_check_results
ORDER BY last_check DESC;

-- Alert trends view
CREATE OR REPLACE VIEW alert_trends AS
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  pipeline,
  severity,
  COUNT(*) as alert_count
FROM system_alerts
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), pipeline, severity
ORDER BY hour DESC, pipeline, severity DESC;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE system_logs IS 'Structured logging for all system events with error classification and metrics';
COMMENT ON TABLE system_alerts IS 'System alerts with severity levels and acknowledgment tracking';
COMMENT ON TABLE system_metrics IS 'System performance metrics collected every 30 seconds';
COMMENT ON TABLE monitoring_thresholds IS 'Configurable thresholds for monitoring and alerting';
COMMENT ON TABLE health_check_results IS 'Health check results for all pipelines with status tracking';

COMMENT ON COLUMN system_logs.level IS 'Log level: debug, info, warn, error, critical';
COMMENT ON COLUMN system_logs.category IS 'Error category: api, database, validation, business_logic, external_service, system, network, authentication, rate_limit, timeout';
COMMENT ON COLUMN system_logs.pipeline IS 'Pipeline: product_discovery, price_sync, ai_analysis, social_posting, google_shopping, zapier_integration, order_sync, daily_stats, shopify_sync';
COMMENT ON COLUMN system_logs.error IS 'Error details with stack trace and code when available';
COMMENT ON COLUMN system_logs.metrics IS 'Performance metrics: duration_ms, memory_usage_mb, cpu_usage_percent, records_processed, records_failed, retry_count';
COMMENT ON COLUMN system_logs.recovery IS 'Recovery actions taken: action_taken, successful, next_retry_at';

COMMENT ON TABLE system_alerts IS 'System alerts with severity levels and tracking';
COMMENT ON COLUMN system_alerts.severity IS 'Alert severity: info, warning, error, critical';
COMMENT ON COLUMN system_alerts.resolved_at IS 'When the alert was resolved';
COMMENT ON COLUMN system_alerts.acknowledged_at IS 'When the alert was acknowledged';

COMMENT ON TABLE system_metrics IS 'System performance metrics collected automatically';
COMMENT ON COLUMN system_metrics.error_rate_5min IS 'Error rate over the last 5 minutes (percentage * 100)';
COMMENT ON TABLE system_metrics.avg_response_time_ms IS 'Average response time in milliseconds';
COMMENT ON TABLE system_metrics.throughput_per_minute IS 'Throughput per minute';

COMMENT ON TABLE monitoring_thresholds IS 'Configurable thresholds for monitoring and alerting';
COMMENT ON COLUMN monitoring_thresholds.operator IS 'Comparison operator: gt, lt, eq, gte, lte';
COMMENT ON COLUMN monitoring_thresholds.severity IS 'Alert severity when threshold is breached: warning, error, critical';

COMMENT ON TABLE health_check_results IS 'Health check results for all pipelines';
COMMENT ON COLUMN health_check_results.status IS 'Health status: healthy, degraded, unhealthy';
COMMENT ON COLUMN health_check_results.uptime_percentage IS 'Uptime percentage (0-100)';
COMMENT ON COLUMN health_check_results.error_rate IS 'Error rate (percentage * 100)';

-- ═════════════════════════════════════════════════════════════════════════
-- FUNCTIONS FOR AUTOMATED CLEANUP
-- ═════════════════════════════════════════════════════════════════════════════

-- Function to clean up old logs (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM system_logs 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  DELETE FROM system_alerts 
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND resolved_at IS NOT NULL;
  
  DELETE FROM system_metrics 
    WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;

-- Function to archive old metrics (keep last 7 days, archive older)
CREATE OR REPLACE FUNCTION archive_old_metrics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Archive old metrics to archive table
  INSERT INTO system_metrics_archive
  SELECT * FROM system_metrics
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  DELETE FROM system_metrics 
    WHERE created_at < NOW() -- Keep only last 7 days
    AND id NOT IN (
      SELECT id FROM (
        SELECT id FROM system_metrics
        ORDER BY created_at DESC
        LIMIT 1000
      )
    );
END;
$$;

-- Schedule cleanup function to run daily
CREATE OR REPLACE FUNCTION schedule_daily_cleanup()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM cleanup_old_logs();
  PERFORM archive_old_metrics();
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- TRIGGER FOR AUTOMATED CLEANUP
-- ═══════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE TRIGGER schedule_daily_cleanup_trigger
AFTER INSERT ON system_metrics
FOR EACH ROW
WHEN (SELECT COUNT(*) FROM system_metrics WHERE created_at < NOW() - INTERVAL '7 days') > 1000
EXECUTE FUNCTION schedule_daily_cleanup();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_system_logs_pipeline_level_timestamp ON system_logs(pipeline, level, timestamp);
CREATE INDEX IF NOT EXISTS idx_system_logs_category_pipeline_timestamp ON system_logs(category, pipeline, timestamp);
CREATE INDEX IF NOT EXISTS idx_system_alerts_pipeline_severity_created_at ON system_alerts(pipeline, severity, created_at);
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity_created_at ON system_alerts(severity, created_at);
CREATE INDEX IF NOT EXISTS idx_health_check_results_pipeline_status_last_check ON health_check_results(pipeline, status, last_check);

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════

-- Summary view for dashboard
CREATE OR REPLACE VIEW observability_dashboard AS
SELECT 
  (SELECT COUNT(*) FILTER (WHERE level = 'error' OR level = 'critical') FROM system_logs WHERE created_at >= NOW() - INTERVAL '24 hours') as error_count_24h,
  (SELECT COUNT(*) FROM system_alerts WHERE created_at >= NOW() - INTERVAL '24 hours' AND resolved_at IS NULL) as active_alerts_count_24h,
  (SELECT AVG(error_rate_5min) FROM system_metrics WHERE timestamp >= NOW() - INTERVAL '1 hour') as avg_error_rate_1h,
  (SELECT AVG(response_time_ms) FROM system_metrics WHERE timestamp >= NOW() - INTERVAL '1 hour') as avg_response_time_1h,
  (SELECT COUNT(*) FILTER (WHERE status = 'healthy') FROM health_check_results) as healthy_pipelines,
  (SELECT COUNT(*) FILTER (WHERE status = 'unhealthy') FROM health_check_results) as unhealthy_pipelines,
  (SELECT AVG(uptime_percentage) FROM health_check_results) as avg_uptime_percentage
FROM system_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
UNION ALL
SELECT system_alerts
WHERE created_at >= NOW() - INTERVAL '24 hours'
UNION ALL
SELECT system_metrics
WHERE timestamp >= NOW() - INTERVAL '1 hour'
UNION ALL
SELECT health_check_results
WHERE last_check >= NOW() - INTERVAL '2 minutes';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════

-- Function to get observability summary
CREATE OR REPLACE FUNCTION get_observability_summary()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'error_count_24h', error_count_24h,
    'active_alerts_count_24h', active_alerts_count_24h,
    'avg_error_rate_1h', avg_error_rate_1h,
    'avg_response_time_1h', avg_response_time_1h,
    'healthy_pipelines', healthy_pipelines,
    'unhealthy_pipelines', unhealthy_pipelines,
    'avg_uptime_percentage', avg_uptime_percentage
  ) as result INTO result;
  
  RETURN result;
END;
$$;
