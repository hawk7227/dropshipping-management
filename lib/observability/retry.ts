// lib/observability/retry.ts
// Retry and exponential backoff mechanism for all pipelines
// Provides configurable retry logic with jitter and circuit breaker patterns

import { logger, ErrorCategory, PipelineType } from './logging';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors: string[];
  nonRetryableErrors: string[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
  finalAttemptAt: string;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  monitoringPeriodMs: number;
}

class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      
      if (this.state === 'HALF_OPEN') {
        this.reset();
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  getState(): string {
    return this.state;
  }
}

export class RetryManager {
  private static circuitBreakers = new Map<string, CircuitBreaker>();

  private static getCircuitBreaker(key: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.circuitBreakers.has(key)) {
      const defaultConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        recoveryTimeoutMs: 60000,
        monitoringPeriodMs: 300000
      };
      this.circuitBreakers.set(key, new CircuitBreaker(config || defaultConfig));
    }
    return this.circuitBreakers.get(key)!;
  }

  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    pipeline: PipelineType,
    operationName: string,
    config: Partial<RetryConfig> = {},
    circuitBreakerConfig?: CircuitBreakerConfig
  ): Promise<RetryResult<T>> {
    const retryConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: [
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'NETWORK_ERROR',
        'TIMEOUT',
        'RATE_LIMIT',
        'SERVICE_UNAVAILABLE',
        'INTERNAL_SERVER_ERROR',
        'BAD_GATEWAY',
        'GATEWAY_TIMEOUT'
      ],
      nonRetryableErrors: [
        'VALIDATION_ERROR',
        'AUTHENTICATION_ERROR',
        'AUTHORIZATION_ERROR',
        'NOT_FOUND',
        'FORBIDDEN',
        'INVALID_REQUEST'
      ],
      ...config
    };

    const circuitBreakerKey = `${pipeline}:${operationName}`;
    const circuitBreaker = this.getCircuitBreaker(circuitBreakerKey, circuitBreakerConfig);

    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      attempts = attempt;

      try {
        // Use circuit breaker if configured
        if (circuitBreakerConfig) {
          const result = await circuitBreaker.execute(fn);
          
          return {
            success: true,
            result,
            attempts,
            totalDuration: Date.now() - startTime,
            finalAttemptAt: new Date().toISOString()
          };
        } else {
          const result = await fn();
          
          return {
            success: true,
            result,
            attempts,
            totalDuration: Date.now() - startTime,
            finalAttemptAt: new Date().toISOString()
          };
        }
      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message;
        const errorCode = (error as any).code;

        // Check if error is retryable
        const isRetryable = this.isRetryableError(errorMessage, errorCode, retryConfig);
        
        if (!isRetryable) {
          await logger.error(pipeline, ErrorCategory.SYSTEM, 
            `Non-retryable error in ${operationName} (attempt ${attempt})`, 
            lastError, {
              operation_name: operationName,
              attempt,
              error_code: errorCode,
              non_retryable: true
            });
          
          break;
        }

        // Log retry attempt
        if (attempt < retryConfig.maxAttempts) {
          const delay = this.calculateDelay(attempt, retryConfig);
          
          await logger.warn(pipeline, ErrorCategory.SYSTEM, 
            `Retrying ${operationName} (attempt ${attempt}/${retryConfig.maxAttempts})`, 
            lastError, {
              operation_name: operationName,
              attempt,
              max_attempts: retryConfig.maxAttempts,
              delay_ms: delay,
              next_retry_at: new Date(Date.now() + delay).toISOString()
            });

          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    const totalDuration = Date.now() - startTime;

    await logger.error(pipeline, ErrorCategory.SYSTEM, 
      `All retry attempts failed for ${operationName}`, 
      lastError!, {
        operation_name: operationName,
        attempts,
        max_attempts: retryConfig.maxAttempts,
        total_duration_ms: totalDuration,
        final_error_message: lastError!.message
      });

    return {
      success: false,
      error: lastError,
      attempts,
      totalDuration,
      finalAttemptAt: new Date().toISOString()
    };
  }

  private static isRetryableError(
    message: string, 
    code: string | undefined, 
    config: RetryConfig
  ): boolean {
    // Check non-retryable errors first
    if (config.nonRetryableErrors.some(nonRetryable => 
      message.includes(nonRetryable) || code === nonRetryable
    )) {
      return false;
    }

    // Check retryable errors
    return config.retryableErrors.some(retryable => 
      message.includes(retryable) || code === retryable
    );
  }

  private static calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, config.maxDelayMs);

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * jitterAmount;
    }

    return Math.max(0, Math.floor(delay));
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Convenience methods for common retry patterns
  static async retryApiCall<T>(
    fn: () => Promise<T>,
    pipeline: PipelineType,
    apiName: string,
    maxAttempts: number = 3
  ): Promise<RetryResult<T>> {
    return this.executeWithRetry(fn, pipeline, apiName, {
      maxAttempts,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitter: true
    });
  }

  static async retryDatabaseOperation<T>(
    fn: () => Promise<T>,
    pipeline: PipelineType,
    operationName: string,
    maxAttempts: number = 5
  ): Promise<RetryResult<T>> {
    return this.executeWithRetry(fn, pipeline, operationName, {
      maxAttempts,
      baseDelayMs: 500,
      maxDelayMs: 5000,
      backoffMultiplier: 1.5,
      jitter: false
    });
  }

  static async retryExternalService<T>(
    fn: () => Promise<T>,
    pipeline: PipelineType,
    serviceName: string,
    maxAttempts: number = 4
  ): Promise<RetryResult<T>> {
    return this.executeWithRetry(fn, pipeline, serviceName, {
      maxAttempts,
      baseDelayMs: 2000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: [
        'SERVICE_UNAVAILABLE',
        'TIMEOUT',
        'NETWORK_ERROR',
        'RATE_LIMIT',
        'BAD_GATEWAY',
        'GATEWAY_TIMEOUT'
      ]
    });
  }

  static async retryWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    pipeline: PipelineType,
    operationName: string,
    circuitBreakerConfig: CircuitBreakerConfig,
    retryConfig?: Partial<RetryConfig>
  ): Promise<RetryResult<T>> {
    return this.executeWithRetry(fn, pipeline, operationName, retryConfig, circuitBreakerConfig);
  }
}

// Export convenience functions
export const retryApiCall = <T>(
  fn: () => Promise<T>,
  pipeline: PipelineType,
  apiName: string,
  maxAttempts?: number
): Promise<RetryResult<T>> => {
  return RetryManager.retryApiCall(fn, pipeline, apiName, maxAttempts);
};

export const retryDatabaseOperation = <T>(
  fn: () => Promise<T>,
  pipeline: PipelineType,
  operationName: string,
  maxAttempts?: number
): Promise<RetryResult<T>> => {
  return RetryManager.retryDatabaseOperation(fn, pipeline, operationName, maxAttempts);
};

export const retryExternalService = <T>(
  fn: () => Promise<T>,
  pipeline: PipelineType,
  serviceName: string,
  maxAttempts?: number
): Promise<RetryResult<T>> => {
  return RetryManager.retryExternalService(fn, pipeline, serviceName, maxAttempts);
};

export const retryWithCircuitBreaker = <T>(
  fn: () => Promise<T>,
  pipeline: PipelineType,
  operationName: string,
  circuitBreakerConfig: CircuitBreakerConfig,
  retryConfig?: Partial<RetryConfig>
): Promise<RetryResult<T>> => {
  return RetryManager.retryWithCircuitBreaker(fn, pipeline, operationName, circuitBreakerConfig, retryConfig);
};
