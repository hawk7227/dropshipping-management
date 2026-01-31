// lib/marketing/publication-tracking.ts
// Publication state and error tracking for marketing channels
// Tracks success/failure rates, retry logic, and performance metrics

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PublicationRecord {
  id: string;
  channel_type: 'social' | 'google_shopping' | 'zapier' | 'email' | 'webhook';
  channel_name: string; // e.g., 'instagram', 'facebook', 'slack', etc.
  product_id: string;
  content_id?: string; // ID of the content (post, feed item, payload)
  status: 'pending' | 'processing' | 'published' | 'failed' | 'retrying';
  published_at?: string;
  error_message?: string;
  error_code?: string;
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;
  external_id?: string; // ID from external platform
  external_url?: string; // URL to published content
  engagement?: {
    views?: number;
    clicks?: number;
    likes?: number;
    shares?: number;
    comments?: number;
  };
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PublicationStats {
  total_publications: number;
  successful_publications: number;
  failed_publications: number;
  pending_publications: number;
  success_rate: number;
  avg_retry_count: number;
  by_channel: Record<string, {
    total: number;
    successful: number;
    failed: number;
    success_rate: number;
  }>;
  by_status: Record<string, number>;
  recent_errors: Array<{
    error_message: string;
    error_code: string;
    channel_name: string;
    count: number;
    last_occurred: string;
  }>;
}

export interface RetryConfig {
  max_retries: number;
  retry_intervals: number[]; // in minutes
  backoff_multiplier: number;
  max_retry_interval: number; // in minutes
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  max_retries: 3,
  retry_intervals: [5, 15, 30], // 5min, 15min, 30min
  backoff_multiplier: 2,
  max_retry_interval: 60 // 1 hour max
};

/**
 * Create a publication record
 */
export async function createPublicationRecord(
  channelType: 'social' | 'google_shopping' | 'zapier' | 'email' | 'webhook',
  channelName: string,
  productId: string,
  contentId?: string,
  metadata?: Record<string, any>
): Promise<{ success: boolean; recordId?: string; error?: string }> {
  try {
    const record: Partial<PublicationRecord> = {
      channel_type: channelType,
      channel_name: channelName,
      product_id: productId,
      content_id: contentId,
      status: 'pending',
      retry_count: 0,
      max_retries: DEFAULT_RETRY_CONFIG.max_retries,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('publication_tracking')
      .insert(record)
      .select('id')
      .single();

    if (error) throw error;

    return { success: true, recordId: data.id };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update publication status
 */
export async function updatePublicationStatus(
  recordId: string,
  status: 'processing' | 'published' | 'failed' | 'retrying',
  errorMessage?: string,
  errorCode?: string,
  externalId?: string,
  externalUrl?: string,
  engagement?: PublicationRecord['engagement']
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Partial<PublicationRecord> = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'published') {
      updateData.published_at = new Date().toISOString();
      updateData.external_id = externalId;
      updateData.external_url = externalUrl;
      updateData.engagement = engagement;
    } else if (status === 'failed') {
      updateData.error_message = errorMessage;
      updateData.error_code = errorCode;
      
      // Get current retry count
      const { data: currentRecord } = await supabase
        .from('publication_tracking')
        .select('retry_count, max_retries')
        .eq('id', recordId)
        .single();

      if (currentRecord && currentRecord.retry_count < currentRecord.max_retries) {
        const nextRetryMinutes = DEFAULT_RETRY_CONFIG.retry_intervals[
          Math.min(currentRecord.retry_count, DEFAULT_RETRY_CONFIG.retry_intervals.length - 1)
        ];
        
        updateData.status = 'retrying';
        updateData.next_retry_at = new Date(
          Date.now() + nextRetryMinutes * 60 * 1000
        ).toISOString();
        updateData.retry_count = currentRecord.retry_count + 1;
      }
    } else if (status === 'retrying') {
      // Retry count is already incremented in the failed status handling
    }

    const { error } = await supabase
      .from('publication_tracking')
      .update(updateData)
      .eq('id', recordId);

    if (error) throw error;

    return { success: true };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get publications ready for retry
 */
export async function getPublicationsForRetry(): Promise<{ success: boolean; records?: PublicationRecord[]; error?: string }> {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('publication_tracking')
      .select('*')
      .eq('status', 'retrying')
      .lte('next_retry_at', now)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) throw error;

    return { success: true, records: data || [] };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get publication statistics
 */
export async function getPublicationStats(
  days_back: number = 7
): Promise<{ success: boolean; data?: PublicationStats; error?: string }> {
  try {
    const cutoffDate = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString();

    const { data: publications, error } = await supabase
      .from('publication_tracking')
      .select(`
        channel_type,
        channel_name,
        status,
        retry_count,
        error_message,
        error_code,
        created_at,
        updated_at
      `)
      .gte('created_at', cutoffDate);

    if (error) throw error;

    const records = publications || [];
    
    // Calculate overall statistics
    const totalPublications = records.length;
    const successfulPublications = records.filter(r => r.status === 'published').length;
    const failedPublications = records.filter(r => r.status === 'failed').length;
    const pendingPublications = records.filter(r => ['pending', 'processing', 'retrying'].includes(r.status)).length;
    
    const successRate = totalPublications > 0 ? (successfulPublications / totalPublications) * 100 : 0;
    const avgRetryCount = records.length > 0 
      ? records.reduce((sum, r) => sum + r.retry_count, 0) / records.length 
      : 0;

    // Group by channel
    const byChannel = records.reduce((acc, record) => {
      const key = `${record.channel_type}:${record.channel_name}`;
      if (!acc[key]) {
        acc[key] = { total: 0, successful: 0, failed: 0, success_rate: 0 };
      }
      acc[key].total++;
      if (record.status === 'published') acc[key].successful++;
      if (record.status === 'failed') acc[key].failed++;
      return acc;
    }, {} as Record<string, any>);

    // Calculate success rates for each channel
    Object.keys(byChannel).forEach(key => {
      const channel = byChannel[key];
      channel.success_rate = channel.total > 0 ? (channel.successful / channel.total) * 100 : 0;
    });

    // Group by status
    const byStatus = records.reduce((acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Analyze recent errors
    const errorGroups = records
      .filter(r => r.error_message)
      .reduce((acc, record) => {
        const key = `${record.error_code || 'UNKNOWN'}:${record.channel_name}`;
        if (!acc[key]) {
          acc[key] = {
            error_message: record.error_message!,
            error_code: record.error_code || 'UNKNOWN',
            channel_name: record.channel_name,
            count: 0,
            last_occurred: record.created_at
          };
        }
        acc[key].count++;
        if (record.created_at > acc[key].last_occurred) {
          acc[key].last_occurred = record.created_at;
        }
        return acc;
      }, {} as Record<string, any>);

    const recentErrors = Object.values(errorGroups)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 10);

    const stats: PublicationStats = {
      total_publications: totalPublications,
      successful_publications: successfulPublications,
      failed_publications: failedPublications,
      pending_publications: pendingPublications,
      success_rate: Math.round(successRate * 100) / 100,
      avg_retry_count: Math.round(avgRetryCount * 100) / 100,
      by_channel: byChannel,
      by_status: byStatus,
      recent_errors: recentErrors as any
    };

    return { success: true, data: stats };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get publication history for a product
 */
export async function getProductPublicationHistory(
  productId: string,
  limit: number = 20
): Promise<{ success: boolean; records?: PublicationRecord[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('publication_tracking')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { success: true, records: data || [] };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update engagement metrics for published content
 */
export async function updateEngagementMetrics(
  recordId: string,
  engagement: PublicationRecord['engagement']
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('publication_tracking')
      .update({
        engagement,
        updated_at: new Date().toISOString()
      })
      .eq('id', recordId);

    if (error) throw error;

    return { success: true };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Clean up old publication records
 */
export async function cleanupOldRecords(
  days_to_keep: number = 30
): Promise<{ success: boolean; deleted: number; error?: string }> {
  try {
    const cutoffDate = new Date(Date.now() - days_to_keep * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('publication_tracking')
      .delete()
      .lt('created_at', cutoffDate)
      .select('id');

    if (error) throw error;

    return {
      success: true,
      deleted: data?.length || 0
    };

  } catch (error) {
    return {
      success: false,
      deleted: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get channel performance metrics
 */
export async function getChannelPerformance(
  channelType?: 'social' | 'google_shopping' | 'zapier' | 'email' | 'webhook',
  days_back: number = 7
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const cutoffDate = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('publication_tracking')
      .select(`
        channel_type,
        channel_name,
        status,
        published_at,
        engagement,
        created_at
      `)
      .gte('created_at', cutoffDate);

    if (channelType) {
      query = query.eq('channel_type', channelType);
    }

    const { data, error } = await query;

    if (error) throw error;

    const records = data || [];
    
    // Calculate performance metrics
    const performance = records.reduce((acc, record) => {
      const key = record.channel_name;
      if (!acc[key]) {
        acc[key] = {
          channel_type: record.channel_type,
          channel_name: record.channel_name,
          total_publications: 0,
          successful_publications: 0,
          failed_publications: 0,
          avg_engagement: {
            views: 0,
            clicks: 0,
            likes: 0,
            shares: 0,
            comments: 0
          },
          best_performing_day: null,
          recent_trend: 'stable'
        };
      }

      acc[key].total_publications++;
      if (record.status === 'published') {
        acc[key].successful_publications++;
        
        // Aggregate engagement metrics
        if (record.engagement) {
          acc[key].avg_engagement.views += record.engagement.views || 0;
          acc[key].avg_engagement.clicks += record.engagement.clicks || 0;
          acc[key].avg_engagement.likes += record.engagement.likes || 0;
          acc[key].avg_engagement.shares += record.engagement.shares || 0;
          acc[key].avg_engagement.comments += record.engagement.comments || 0;
        }
      } else if (record.status === 'failed') {
        acc[key].failed_publications++;
      }

      return acc;
    }, {} as Record<string, any>);

    // Calculate averages and success rates
    Object.values(performance).forEach((channel: any) => {
      channel.success_rate = channel.total_publications > 0 
        ? (channel.successful_publications / channel.total_publications) * 100 
        : 0;
      
      const publishedCount = channel.successful_publications;
      if (publishedCount > 0) {
        channel.avg_engagement.views = Math.round(channel.avg_engagement.views / publishedCount);
        channel.avg_engagement.clicks = Math.round(channel.avg_engagement.clicks / publishedCount);
        channel.avg_engagement.likes = Math.round(channel.avg_engagement.likes / publishedCount);
        channel.avg_engagement.shares = Math.round(channel.avg_engagement.shares / publishedCount);
        channel.avg_engagement.comments = Math.round(channel.avg_engagement.comments / publishedCount);
      }
    });

    return { success: true, data: performance };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
