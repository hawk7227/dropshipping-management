// app/api/content-brain/route.ts
// ============================================================================
// AI CONTENT BRAIN API
// Handles all content generation, performance tracking, and learning
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateHighConvertingContent,
  getBrandStyleGuide,
  updateBrandStyleGuide,
  getWinningPatterns,
  analyzeWinningPatterns,
  recordPerformance,
  generateDailyReport,
  generateWeeklySummary,
} from '@/lib/ai-content-brain';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// GET - Fetch data
// ============================================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      // ==================== POSTS ====================
      case 'posts': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const platform = searchParams.get('platform');
        const status = searchParams.get('status');

        let query = supabase
          .from('social_posts')
          .select(`
            *,
            post_performance (*)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (platform) query = query.eq('platform', platform);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;

        if (error) throw error;

        // Transform data
        const posts = data?.map(post => ({
          ...post,
          performance: post.post_performance?.[0] || null,
        }));

        return NextResponse.json({ success: true, data: posts });
      }

      // ==================== REPORTS ====================
      case 'reports': {
        const limit = parseInt(searchParams.get('limit') || '7');

        const { data, error } = await supabase
          .from('daily_reports')
          .select('*')
          .order('date', { ascending: false })
          .limit(limit);

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      // ==================== PATTERNS ====================
      case 'patterns': {
        const platform = searchParams.get('platform');

        let query = supabase
          .from('winning_patterns')
          .select('*')
          .gte('confidence_score', 50)
          .order('confidence_score', { ascending: false });

        if (platform) {
          query = query.or(`platform.eq.${platform},platform.eq.all`);
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      // ==================== BRAND GUIDE ====================
      case 'brand-guide': {
        const guide = await getBrandStyleGuide();
        return NextResponse.json({ success: true, data: guide });
      }

      // ==================== TODAY'S REPORT ====================
      case 'today-report': {
        const report = await generateDailyReport();
        return NextResponse.json({ success: true, data: report });
      }

      // ==================== WEEKLY SUMMARY ====================
      case 'weekly-summary': {
        const summary = await generateWeeklySummary();
        return NextResponse.json({ success: true, data: summary });
      }

      // ==================== DASHBOARD STATS ====================
      case 'stats': {
        const days = parseInt(searchParams.get('days') || '7');
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Get posts
        const { data: posts } = await supabase
          .from('social_posts')
          .select('*, post_performance(*)')
          .gte('created_at', since);

        // Get patterns
        const { count: patternCount } = await supabase
          .from('winning_patterns')
          .select('id', { count: 'exact' })
          .gte('confidence_score', 60);

        // Calculate stats
        const publishedPosts = posts?.filter(p => p.status === 'published') || [];
        const totalImpressions = publishedPosts.reduce((sum, p) => sum + (p.post_performance?.[0]?.impressions || 0), 0);
        const totalEngagement = publishedPosts.reduce((sum, p) => {
          const perf = p.post_performance?.[0];
          return sum + (perf?.likes || 0) + (perf?.comments || 0) + (perf?.shares || 0);
        }, 0);

        const stats = {
          totalPosts: posts?.length || 0,
          publishedPosts: publishedPosts.length,
          totalImpressions,
          totalEngagement,
          avgEngagementRate: totalImpressions > 0 ? (totalEngagement / totalImpressions) * 100 : 0,
          activePatterns: patternCount || 0,
          platformBreakdown: {
            instagram: publishedPosts.filter(p => p.platform === 'instagram').length,
            facebook: publishedPosts.filter(p => p.platform === 'facebook').length,
            tiktok: publishedPosts.filter(p => p.platform === 'tiktok').length,
            twitter: publishedPosts.filter(p => p.platform === 'twitter').length,
          },
        };

        return NextResponse.json({ success: true, data: stats });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Content Brain API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ============================================================================
// POST - Create/Update data
// ============================================================================

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  try {
    switch (action) {
      // ==================== GENERATE CONTENT ====================
      case 'generate': {
        const { platform, product, contentType } = body;

        if (!platform || !product) {
          return NextResponse.json(
            { success: false, error: 'Platform and product required' },
            { status: 400 }
          );
        }

        const generatedPost = await generateHighConvertingContent(
          platform,
          product,
          { contentType }
        );

        // Save to database
        const { data: savedPost, error } = await supabase
          .from('social_posts')
          .insert({
            platform: generatedPost.platform,
            content: generatedPost.content,
            hashtags: generatedPost.hashtags,
            media_urls: generatedPost.media_suggestions,
            product_id: generatedPost.product_id,
            quality_score: generatedPost.quality_score,
            predicted_engagement: generatedPost.predicted_engagement,
            patterns_used: generatedPost.patterns_used,
            template_used: generatedPost.template_used,
            ai_generated: true,
            status: 'draft',
          })
          .select()
          .single();

        if (error) throw error;

        // Log the generation
        await supabase.from('ai_generation_log').insert({
          post_id: savedPost.id,
          platform,
          product_id: product.id,
          quality_score: generatedPost.quality_score,
          predicted_engagement: generatedPost.predicted_engagement,
          patterns_used: generatedPost.patterns_used,
          template_used: generatedPost.template_used,
          generated_content: generatedPost.content,
        });

        return NextResponse.json({ success: true, data: savedPost });
      }

      // ==================== RECORD PERFORMANCE ====================
      case 'record-performance': {
        const { postId, metrics } = body;

        if (!postId || !metrics) {
          return NextResponse.json(
            { success: false, error: 'postId and metrics required' },
            { status: 400 }
          );
        }

        await recordPerformance(postId, metrics);

        // Update AI generation log with actual performance
        const engagementRate = metrics.impressions > 0
          ? ((metrics.likes + metrics.comments + metrics.shares) / metrics.impressions) * 100
          : 0;

        await supabase
          .from('ai_generation_log')
          .update({
            was_published: true,
            actual_engagement: engagementRate,
          })
          .eq('post_id', postId);

        return NextResponse.json({ success: true });
      }

      // ==================== UPDATE BRAND GUIDE ====================
      case 'update-brand-guide': {
        const { guide } = body;
        await updateBrandStyleGuide(guide);
        return NextResponse.json({ success: true });
      }

      // ==================== TRIGGER LEARNING ====================
      case 'trigger-learning': {
        const platform = body.platform;
        const patterns = await analyzeWinningPatterns(platform);

        // Log the learning event
        await supabase.from('learning_history').insert({
          learning_type: 'pattern_discovered',
          description: `Analyzed ${patterns.length} patterns from recent posts`,
          data: { patterns, platform },
        });

        return NextResponse.json({ success: true, patterns });
      }

      // ==================== GENERATE REPORT ====================
      case 'generate-report': {
        const date = body.date;
        const report = await generateDailyReport(date);
        return NextResponse.json({ success: true, data: report });
      }

      // ==================== APPROVE POST ====================
      case 'approve-post': {
        const { postId, scheduledFor } = body;

        const { data, error } = await supabase
          .from('social_posts')
          .update({
            status: scheduledFor ? 'scheduled' : 'draft',
            scheduled_for: scheduledFor,
          })
          .eq('id', postId)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      // ==================== BATCH GENERATE ====================
      case 'batch-generate': {
        const { products, platforms = ['instagram', 'facebook', 'tiktok'] } = body;

        const results = [];

        for (const product of products) {
          for (const platform of platforms) {
            try {
              const generated = await generateHighConvertingContent(platform, product);

              // Save to queue
              const { data } = await supabase
                .from('content_queue')
                .insert({
                  platform,
                  content: generated.content,
                  hashtags: generated.hashtags,
                  media_urls: generated.media_suggestions,
                  product_id: product.id,
                  quality_score: generated.quality_score,
                  predicted_engagement: generated.predicted_engagement,
                  patterns_used: generated.patterns_used,
                  status: 'pending',
                })
                .select()
                .single();

              results.push({ platform, product: product.id, success: true, data });
            } catch (error: any) {
              results.push({ platform, product: product.id, success: false, error: error.message });
            }
          }
        }

        return NextResponse.json({ success: true, results });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Content Brain API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
