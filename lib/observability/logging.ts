// lib/observability/logging.ts
// Structured logging system for all pipelines with error classification
// Provides centralized logging with different severity levels and structured data

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  API = 'api',
  DATABASE = 'database',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  EXTERNAL_SERVICE = 'external_service',
  SYSTEM = 'system',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout'
}

export enum PipelineType {
  PRODUCT_DISCOVERY = 'product_discovery',
  PRICE_SYNC = 'price_sync',
  AI_ANALYSIS = 'ai_analysis',
  SOCIAL_POSTING = 'social_posting',
  GOOGLE_SHOPPING = 'google_shopping',
  ZAPIER_INTEGRATION = 'zapier_integration',
  ORDER_SYNC = 'order_sync',
  DAILY_STATS = 'daily_stats',
  SHOPIFY_SYNC = 'shopify_sync'
}

export interface StructuredLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: ErrorCategory;
  pipeline: PipelineType;
  message: string;
  details: Record<string, any>;
  context: {
    user_id?: string;
    request_id?: string;
    session_id?: string;
    ip_address?: string;
    user_agent?: string;
    environment: string;
    version: string;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  metrics?: {
    duration_ms?: number;
    memory_usage_mb?: number;
    cpu_usage_percent?: number;
    records_processed?: number;
    records_failed?: number;
    retry_count?: number;
  };
  recovery?: {
    action_taken: string;
    successful: boolean;
    next_retry_at?: string;
  };
}

export interface LogFilter {
  level?: LogLevel;
  category?: ErrorCategory;
  pipeline?: PipelineType;
  start_date?: string;
  end_date?: string;
  user_id?: string;
  has_error?: boolean;
}

class Logger {
  private static instance: Logger;
  private context: StructuredLog['context'];

  private constructor() {
    this.context = {
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setContext(context: Partial<StructuredLog['context']>): void {
    this.context = { ...this.context, ...context };
  }

  private createLogEntry(
    level: LogLevel,
    category: ErrorCategory,
    pipeline: PipelineType,
    message: string,
    details: Record<string, any> = {},
    error?: Error,
    metrics?: StructuredLog['metrics']
  ): StructuredLog {
    return {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      pipeline,
      message,
      details,
      context: this.context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      } : undefined,
      metrics
    };
  }

  private async persistLog(log: StructuredLog): Promise<void> {
    try {
      // Store in database for analysis
      await supabase
        .from('system_logs')
        .insert({
          id: log.id,
          timestamp: log.timestamp,
          level: log.level,
          category: log.category,
          pipeline: log.pipeline,
          message: log.message,
          details: log.details,
          context: log.context,
          error: log.error,
          metrics: log.metrics,
          recovery: log.recovery
        });

      // Also log to console for immediate visibility
      this.logToConsole(log);
    } catch (persistError) {
      // Fallback to console only if database logging fails
      console.error('Failed to persist log:', persistError);
      this.logToConsole(log);
    }
  }

  private logToConsole(log: StructuredLog): void {
    const logMessage = `[${log.level.toUpperCase()}] [${log.category}] [${log.pipeline}] ${log.message}`;
    
    switch (log.level) {
      case LogLevel.DEBUG:
        console.debug(logMessage, log.details);
        break;
      case LogLevel.INFO:
        console.info(logMessage, log.details);
        break;
      case LogLevel.WARN:
        console.warn(logMessage, log.details);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(logMessage, log.details);
        if (log.error) {
          console.error('Error details:', log.error);
        }
        break;
    }
  }

  async debug(pipeline: PipelineType, message: string, details: Record<string, any> = {}): Promise<void> {
    const log = this.createLogEntry(LogLevel.DEBUG, ErrorCategory.SYSTEM, pipeline, message, details);
    await this.persistLog(log);
  }

  async info(pipeline: PipelineType, message: string, details: Record<string, any> = {}): Promise<void> {
    const log = this.createLogEntry(LogLevel.INFO, ErrorCategory.SYSTEM, pipeline, message, details);
    await this.persistLog(log);
  }

  async warn(pipeline: PipelineType, message: string, details: Record<string, any> = {}): Promise<void> {
    const log = this.createLogEntry(LogLevel.WARN, ErrorCategory.SYSTEM, pipeline, message, details);
    await this.persistLog(log);
  }

  async error(
    pipeline: PipelineType, 
    category: ErrorCategory, 
    message: string, 
    error: Error, 
    details: Record<string, any> = {}
  ): Promise<void> {
    const log = this.createLogEntry(LogLevel.ERROR, category, pipeline, message, details, error);
    await this.persistLog(log);
  }

  async critical(
    pipeline: PipelineType, 
    category: ErrorCategory, 
    message: string, 
    error: Error, 
    details: Record<string, any> = {}
  ): Promise<void> {
    const log = this.createLogEntry(LogLevel.CRITICAL, category, pipeline, message, details, error);
    await this.persistLog(log);
  }

  async logPipelineStart(
    pipeline: PipelineType,
    details: Record<string, any> = {}
  ): Promise<string> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.info(pipeline, 'Pipeline execution started', {
      execution_id: executionId,
      ...details
    });

    return executionId;
  }

  async logPipelineEnd(
    pipeline: PipelineType,
    executionId: string,
    success: boolean,
    details: Record<string, any> = {},
    error?: Error
  ): Promise<void> {
    const message = success ? 'Pipeline execution completed successfully' : 'Pipeline execution failed';
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const category = error ? this.classifyError(error) : ErrorCategory.SYSTEM;

    const log = this.createLogEntry(level, category, pipeline, message, {
      execution_id: executionId,
      success,
      ...details
    }, error);

    await this.persistLog(log);
  }

  async logRetryAttempt(
    pipeline: PipelineType,
    executionId: string,
    attempt: number,
    maxAttempts: number,
    error: Error,
    nextRetryIn: number
  ): Promise<void> {
    await this.warn(pipeline, `Retry attempt ${attempt}/${maxAttempts}`, {
      execution_id: executionId,
      attempt,
      max_attempts: maxAttempts,
      next_retry_in_seconds: nextRetryIn,
      error_message: error.message
    });
  }

  private classifyError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('database') || message.includes('sql') || message.includes('constraint')) {
      return ErrorCategory.DATABASE;
    }
    if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('token')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorCategory.RATE_LIMIT;
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes('api') || message.includes('external') || message.includes('service')) {
      return ErrorCategory.EXTERNAL_SERVICE;
    }
    
    return ErrorCategory.BUSINESS_LOGIC;
  }

  async getLogs(filter: LogFilter = {}, limit: number = 100): Promise<StructuredLog[]> {
    try {
      let query = supabase
        .from('system_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (filter.level) {
        query = query.eq('level', filter.level);
      }
      if (filter.category) {
        query = query.eq('category', filter.category);
      }
      if (filter.pipeline) {
        query = query.eq('pipeline', filter.pipeline);
      }
      if (filter.start_date) {
        query = query.gte('timestamp', filter.start_date);
      }
      if (filter.end_date) {
        query = query.lte('timestamp', filter.end_date);
      }
      if (filter.has_error) {
        query = query.not('error', 'is', null);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Failed to retrieve logs:', error);
      return [];
    }
  }

  async getLogStats(days: number = 7): Promise<any> {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('system_logs')
        .select('level, category, pipeline')
        .gte('timestamp', cutoffDate);

      if (error) throw error;

      const logs = data || [];
      
      return {
        total_logs: logs.length,
        by_level: logs.reduce((acc, log) => {
          acc[log.level] = (acc[log.level] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        by_category: logs.reduce((acc, log) => {
          acc[log.category] = (acc[log.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        by_pipeline: logs.reduce((acc, log) => {
          acc[log.pipeline] = (acc[log.pipeline] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        error_rate: logs.filter(log => log.level === LogLevel.ERROR || log.level === LogLevel.CRITICAL).length / logs.length
      };
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Convenience functions for common logging patterns
export const logPipelineExecution = async (
  pipeline: PipelineType,
  fn: () => Promise<any>,
  details: Record<string, any> = {}
): Promise<any> => {
  const executionId = await logger.logPipelineStart(pipeline, details);
  
  try {
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;
    
    await logger.logPipelineEnd(pipeline, executionId, true, {
      duration_ms: duration,
      result_summary: typeof result === 'object' ? Object.keys(result).length : 'primitive'
    });
    
    return result;
  } catch (error) {
    await logger.logPipelineEnd(pipeline, executionId, false, details, error as Error);
    throw error;
  }
};

export const logApiCall = async (
  pipeline: PipelineType,
  apiName: string,
  fn: () => Promise<any>,
  details: Record<string, any> = {}
): Promise<any> => {
  const startTime = Date.now();
  
  try {
    await logger.info(pipeline, `API call started: ${apiName}`, details);
    
    const result = await fn();
    const duration = Date.now() - startTime;
    
    await logger.info(pipeline, `API call completed: ${apiName}`, {
      api_name: apiName,
      duration_ms: duration,
      success: true
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    await logger.error(pipeline, ErrorCategory.API, `API call failed: ${apiName}`, error as Error, {
      api_name: apiName,
      duration_ms: duration,
      success: false
    });
    
    throw error;
  }
};
