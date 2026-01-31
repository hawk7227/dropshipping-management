// lib/observability/monitoring.ts
// Basic monitoring hooks and alerts system for all pipelines
// Provides health checks, performance monitoring, and alerting

import { createClient } from '@supabase/supabase-js';
import { logger, LogLevel, ErrorCategory, PipelineType } from './logging';
import { retryDatabaseOperation } from './retry';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface HealthCheck {
  pipeline: PipelineType;
  status: 'healthy' | 'degraded' | 'unhealthy';
  last_check: string;
  response_time_ms: number;
  error_rate: number;
  uptime_percentage: number;
  details: Record<string, any>;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  pipeline: PipelineType;
  title: string;
  message: string;
  created_at: string;
  resolved_at?: string;
  acknowledged_at?: string;
  metadata: Record<string, any>;
}

export interface MetricThreshold {
  pipeline: PipelineType;
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  severity: 'warning' | 'error' | 'critical';
  description: string;
}

export interface SystemMetrics {
  timestamp: string;
  cpu_usage_percent: number;
  memory_usage_mb: number;
  disk_usage_percent: number;
  active_connections: number;
  database_connections: number;
  cache_hit_rate: number;
  error_rate_5min: number;
  avg_response_time_ms: number;
  throughput_per_minute: number;
}

class MonitoringService {
  private static instance: MonitoringService;
  private healthChecks: Map<PipelineType, HealthCheck> = new Map();
  private metrics: SystemMetrics[] = [];
  private alerts: Alert[] = [];
  private thresholds: MetricThreshold[] = [];

  private constructor() {
    this.initializeDefaultThresholds();
    this.startMetricsCollection();
    this.startHealthChecks();
  }

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  private initializeDefaultThresholds(): void {
    this.thresholds = [
      // Error rate thresholds
      {
        pipeline: PipelineType.PRODUCT_DISCOVERY,
        metric: 'error_rate',
        threshold: 0.1,
        operator: 'gt',
        severity: 'warning',
        description: 'High error rate in product discovery'
      },
      {
        pipeline: PipelineType.PRICE_SYNC,
        metric: 'error_rate',
        threshold: 0.15,
        operator: 'gt',
        severity: 'error',
        description: 'Critical error rate in price sync'
      },
      {
        pipeline: PipelineType.AI_ANALYSIS,
        metric: 'error_rate',
        threshold: 0.05,
        operator: 'gt',
        severity: 'warning',
        description: 'High error rate in AI analysis'
      },
      
      // Response time thresholds
      {
        pipeline: PipelineType.PRODUCT_DISCOVERY,
        metric: 'response_time_ms',
        threshold: 30000,
        operator: 'gt',
        severity: 'warning',
        description: 'Slow response time in product discovery'
      },
      {
        pipeline: PipelineType.AI_ANALYSIS,
        metric: 'response_time_ms',
        threshold: 60000,
        operator: 'gt',
        severity: 'error',
        description: 'Very slow response time in AI analysis'
      },
      
      // System metrics thresholds
      {
        pipeline: PipelineType.AI_ANALYSIS,
        metric: 'cpu_usage_percent',
        threshold: 80,
        operator: 'gt',
        severity: 'warning',
        description: 'High CPU usage in AI analysis'
      },
      {
        pipeline: PipelineType.AI_ANALYSIS,
        metric: 'memory_usage_mb',
        threshold: 1024,
        operator: 'gt',
        severity: 'error',
        description: 'High memory usage in AI analysis'
      },
      {
        pipeline: PipelineType.PRODUCT_DISCOVERY,
        metric: 'active_connections',
        threshold: 50,
        operator: 'gt',
        severity: 'warning',
        description: 'High number of active connections in product discovery'
      }
    ];
  }

  private async startMetricsCollection(): Promise<void> {
    // Collect metrics every 30 seconds
    setInterval(async () => {
      try {
        const metrics = await this.collectSystemMetrics();
        this.metrics.push(metrics);
        
        // Keep only last 100 metrics
        if (this.metrics.length > 100) {
          this.metrics = this.metrics.slice(-100);
        }
        
        // Check thresholds
        await this.checkThresholds(metrics);
        
        // Persist metrics
        await this.persistMetrics(metrics);
      } catch (error) {
        await logger.error(PipelineType.AI_ANALYSIS, ErrorCategory.SYSTEM, 
          'Failed to collect system metrics', error as Error);
      }
    }, 30000);
  }

  private async startHealthChecks(): Promise<void> {
    // Run health checks every 2 minutes
    setInterval(async () => {
      try {
        await this.runAllHealthChecks();
      } catch (error) {
        await logger.error(PipelineType.AI_ANALYSIS, ErrorCategory.SYSTEM, 
          'Failed to run health checks', error as Error);
      }
    }, 120000);
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const timestamp = new Date().toISOString();
    
    // In a real implementation, these would come from system monitoring
    // For now, we'll simulate some metrics and get real data where possible
    
    let cpuUsage = 0;
    let memoryUsage = 0;
    let diskUsage = 0;
    let activeConnections = 0;
    let dbConnections = 0;
    let cacheHitRate = 0;
    let errorRate = 0;
    let avgResponseTime = 0;
    let throughput = 0;

    try {
      // Get database connection info
      const { data: dbInfo } = await supabase
        .from('pg_stat_activity')
        .select('count')
        .single();
      
      if (dbInfo) {
        dbConnections = dbInfo.count || 0;
      }
    } catch (error) {
      // Database might not be accessible
    }

    try {
      // Get recent error rate from logs
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from('system_logs')
        .select('level')
        .gte('timestamp', fiveMinutesAgo);
      
      if (recentLogs) {
        const totalLogs = recentLogs.length;
        const errorLogs = recentLogs.filter(log => 
          log.level === LogLevel.ERROR || log.level === LogLevel.CRITICAL
        ).length;
        errorRate = totalLogs > 0 ? errorLogs / totalLogs : 0;
      }
    } catch (error) {
      // Logs table might not be accessible
    }

    // Simulate other metrics (in real implementation, these would come from monitoring tools)
    cpuUsage = Math.random() * 100;
    memoryUsage = 512 + Math.random() * 512;
    diskUsage = 50 + Math.random() * 30;
    activeConnections = Math.floor(Math.random() * 100);
    cacheHitRate = 0.8 + Math.random() * 0.15;
    avgResponseTime = 100 + Math.random() * 500;
    throughput = Math.floor(Math.random() * 1000);

    return {
      timestamp,
      cpu_usage_percent: Math.round(cpuUsage * 100) / 100,
      memory_usage_mb: Math.round(memoryUsage),
      disk_usage_percent: Math.round(diskUsage * 100) / 100,
      active_connections: activeConnections,
      database_connections: dbConnections,
      cache_hit_rate: Math.round(cacheHitRate * 100) / 100,
      error_rate_5min: Math.round(errorRate * 10000) / 100,
      avg_response_time_ms: Math.round(avgResponseTime),
      throughput_per_minute: throughput
    };
  }

  private async checkThresholds(metrics: SystemMetrics): Promise<void> {
    for (const threshold of this.thresholds) {
      const metricValue = metrics[threshold.metric as keyof SystemMetrics] as number;
      
      if (metricValue === undefined) continue;

      let thresholdBreached = false;
      
      switch (threshold.operator) {
        case 'gt':
          thresholdBreached = metricValue > threshold.threshold;
          break;
        case 'lt':
          thresholdBreached = metricValue < threshold.threshold;
          break;
        case 'eq':
          thresholdBreached = metricValue === threshold.threshold;
          break;
        case 'gte':
          thresholdBreached = metricValue >= threshold.threshold;
          break;
        case 'lte':
          thresholdBreached = metricValue <= threshold.threshold;
          break;
      }

      if (thresholdBreached) {
        await this.createAlert({
          severity: threshold.severity,
          pipeline: threshold.pipeline,
          title: `Threshold breached: ${threshold.metric}`,
          message: `${threshold.description}. Current value: ${metricValue}, threshold: ${threshold.threshold}`,
          metadata: {
            metric: threshold.metric,
            current_value: metricValue,
            threshold: threshold.threshold,
            operator: threshold.operator
          }
        });
      }
    }
  }

  private async createAlert(alertData: Omit<Alert, 'id' | 'created_at'>): Promise<void> {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      ...alertData
    };

    this.alerts.push(alert);
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    // Persist alert
    try {
      await supabase
        .from('system_alerts')
        .insert(alert);
    } catch (error) {
      await logger.error(PipelineType.AI_ANALYSIS, ErrorCategory.DATABASE, 
        'Failed to persist alert', error as Error);
    }

    // Log alert
    await logger.warn(alert.pipeline, ErrorCategory.SYSTEM, 
      `Alert created: ${alert.title}`, 
      new Error(alert.message), {
        alert_id: alert.id,
        severity: alert.severity
      });
  }

  private async runAllHealthChecks(): Promise<void> {
    const pipelines = Object.values(PipelineType);
    
    for (const pipeline of pipelines) {
      try {
        const healthCheck = await this.runHealthCheck(pipeline);
        this.healthChecks.set(pipeline, healthCheck);
        
        // Log health status changes
        const previousHealth = this.healthChecks.get(pipeline);
        if (previousHealth && previousHealth.status !== healthCheck.status) {
          await logger.info(pipeline, `Health status changed from ${previousHealth.status} to ${healthCheck.status}`, {
            previous_status: previousHealth.status,
            new_status: healthCheck.status,
            response_time_ms: healthCheck.response_time_ms,
            error_rate: healthCheck.error_rate
          });
        }
      } catch (error) {
        await logger.error(pipeline, ErrorCategory.SYSTEM, 
          `Health check failed for ${pipeline}`, error as Error);
      }
    }
  }

  private async runHealthCheck(pipeline: PipelineType): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Simulate health check logic
      const responseTime = Math.random() * 1000 + 100;
      const errorRate = Math.random() * 0.1;
      const uptime = 0.95 + Math.random() * 0.05;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (errorRate > 0.1 || responseTime > 5000) {
        status = 'unhealthy';
      } else if (errorRate > 0.05 || responseTime > 2000) {
        status = 'degraded';
      }

      return {
        pipeline,
        status,
        last_check: new Date().toISOString(),
        response_time_ms: Math.round(responseTime),
        error_rate: Math.round(errorRate * 10000) / 100,
        uptime_percentage: Math.round(uptime * 10000) / 100,
        details: {
          response_time_ms: Math.round(responseTime),
          error_rate: Math.round(errorRate * 10000) / 100,
          uptime_percentage: Math.round(uptime * 10000) / 100
        }
      };
    } catch (error) {
      return {
        pipeline,
        status: 'unhealthy',
        last_check: new Date().toISOString(),
        response_time_ms: Date.now() - startTime,
        error_rate: 1,
        uptime_percentage: 0,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private async persistMetrics(metrics: SystemMetrics): Promise<void> {
    try {
      await supabase
        .from('system_metrics')
        .insert(metrics);
    } catch (error) {
      // Metrics table might not exist yet
      await logger.error(PipelineType.AI_ANALYSIS, ErrorCategory.DATABASE, 
        'Failed to persist metrics', error as Error);
    }
  }

  // Public API methods
  async getHealthChecks(): Promise<HealthCheck[]> {
    return Array.from(this.healthChecks.values());
  }

  async getHealthCheck(pipeline: PipelineType): Promise<HealthCheck | undefined> {
    return this.healthChecks.get(pipeline);
  }

  async getAlerts(severity?: string, pipeline?: PipelineType): Promise<Alert[]> {
    let alerts = this.alerts;
    
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    if (pipeline) {
      alerts = alerts.filter(alert => alert.pipeline === pipeline);
    }
    
    return alerts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged_at = new Date().toISOString();
      
      try {
        await supabase
          .from('system_alerts')
          .update({ acknowledged_at: alert.acknowledged_at })
          .eq('id', alertId);
      } catch (error) {
        await logger.error(PipelineType.AI_ANALYSIS, ErrorCategory.DATABASE, 
          'Failed to acknowledge alert', error as Error);
      }
    }
  }

  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved_at = new Date().toISOString();
      
      try {
        await supabase
          .from('system_alerts')
          .update({ resolved_at: alert.resolved_at })
          .eq('id', alertId);
      } catch (error) {
        await logger.error(PipelineType.AI_ANALYSIS, ErrorCategory.DATABASE, 
          'Failed to resolve alert', error as Error);
      }
    }
  }

  async getSystemMetrics(minutes: number = 60): Promise<SystemMetrics[]> {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    
    return this.metrics
      .filter(metric => new Date(metric.timestamp) >= cutoffTime)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async addThreshold(threshold: MetricThreshold): Promise<void> {
    this.thresholds.push(threshold);
    
    await logger.info(PipelineType.AI_ANALYSIS, 'Threshold added', {
      pipeline: threshold.pipeline,
      metric: threshold.metric,
      threshold: threshold.threshold,
      operator: threshold.operator,
      severity: threshold.severity
    });
  }

  async removeThreshold(pipeline: PipelineType, metric: string): Promise<void> {
    this.thresholds = this.thresholds.filter(
      t => !(t.pipeline === pipeline && t.metric === metric)
    );
    
    await logger.info(PipelineType.AI_ANALYSIS, 'Threshold removed', {
      pipeline,
      metric
    });
  }
}

// Export singleton instance
export const monitoring = MonitoringService.getInstance();
