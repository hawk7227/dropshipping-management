// app/api/cron/daily-learning/route.ts
// ============================================================================
// DAILY LEARNING & IMPROVEMENT CRON
// Runs at 11 PM daily to analyze performance and plan for tomorrow
// Schedule: "0 23 * * *" (11 PM daily)
// ============================================================================
//
// WHAT IT DOES:
// 1. Collects all performance data from today
// 2. Analyzes what worked and what didn't
// 3. Discovers new winning patterns
// 4. Validates existing patterns
// 5. Generates improvement plan for tomorrow
// 6. Creates daily report with accountability metrics
// 7. Adjusts content strategy based on learnings
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import {
  analyzeWinningPatterns,
  generateDailyReport,
  getBrandStyleGuide,
} from '@/lib/ai-content-brain';

export const runtime = 'nodejs';
export const maxDuration = 300;

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ============================================================================
// MAIN LEARNING CYCLE
// ============================================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('🧠 Starting Daily Learning Cycle...\n');

  const results = {
    success: true,
    date: new Date().toISOString().split('T')[0],
    learning_cycle: {
      patterns_analyzed: 0,
      new_patterns_discovered: 0,
      patterns_validated: 0,
      patterns_deprecated: 0,
    },
    performance_analysis: {
      posts_analyzed: 0,
      avg_engagement_today: 0,
      avg_engagement_last_7_days: 0,
      improvement_from_yesterday: 0,
    },
    ai_accuracy: {
      predictions_evaluated: 0,
      avg_accuracy: 0,
      best_prediction: null as any,
      worst_prediction: null as any,
    },
    daily_report: null as any,
    improvement_plan: [] as string[],
    strategy_adjustments: [] as string[],
    errors: [] as string[],
    duration: 0,
  };

  try {
    // ========================================
    // STEP 1: Collect Today's Performance
    // ========================================
    console.log('📊 Step 1: Collecting performance data...');
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: todaysPosts } = await supabase
      .from('social_posts')
      .select('*, post_performance(*)')
      .gte('published_at', `${today}T00:00:00Z`)
      .lte('published_at', `${today}T23:59:59Z`)
      .eq('status', 'published');

    const { data: weeksPosts } = await supabase
      .from('social_posts')
      .select('*, post_performance(*)')
      .gte('published_at', `${weekAgo}T00:00:00Z`)
      .eq('status', 'published');

    const { data: yesterdaysPosts } = await supabase
      .from('social_posts')
      .select('*, post_performance(*)')
      .gte('published_at', `${yesterday}T00:00:00Z`)
      .lte('published_at', `${yesterday}T23:59:59Z`)
      .eq('status', 'published');

    results.performance_analysis.posts_analyzed = todaysPosts?.length || 0;

    // Calculate engagement rates
    const calcEngagementRate = (posts: any[]) => {
      if (!posts || posts.length === 0) return 0;
      const total = posts.reduce((sum, p) => {
        const perf = p.post_performance?.[0];
        if (!perf || !perf.impressions) return sum;
        const eng = (perf.likes + perf.comments + perf.shares) / perf.impressions * 100;
        return sum + eng;
      }, 0);
      return total / posts.length;
    };

    results.performance_analysis.avg_engagement_today = calcEngagementRate(todaysPosts || []);
    results.performance_analysis.avg_engagement_last_7_days = calcEngagementRate(weeksPosts || []);
    
    const yesterdayRate = calcEngagementRate(yesterdaysPosts || []);
    results.performance_analysis.improvement_from_yesterday = 
      yesterdayRate > 0 
        ? ((results.performance_analysis.avg_engagement_today - yesterdayRate) / yesterdayRate) * 100 
        : 0;

    console.log(`   - Posts analyzed: ${results.performance_analysis.posts_analyzed}`);
    console.log(`   - Today's avg engagement: ${results.performance_analysis.avg_engagement_today.toFixed(2)}%`);
    console.log(`   - 7-day avg engagement: ${results.performance_analysis.avg_engagement_last_7_days.toFixed(2)}%`);

    // ========================================
    // STEP 2: Analyze Winning Patterns
    // ========================================
    console.log('\n🔍 Step 2: Analyzing patterns...');

    const platforms = ['instagram', 'facebook', 'tiktok'];
    let totalNewPatterns = 0;

    for (const platform of platforms) {
      try {
        const patterns = await analyzeWinningPatterns(platform);
        totalNewPatterns += patterns.length;
        console.log(`   - ${platform}: Found ${patterns.length} patterns`);
      } catch (error) {
        console.error(`   - ${platform}: Error analyzing patterns`);
      }
    }

    results.learning_cycle.patterns_analyzed = totalNewPatterns;
    results.learning_cycle.new_patterns_discovered = totalNewPatterns;

    // ========================================
    // STEP 3: Validate Existing Patterns
    // ========================================
    console.log('\n✅ Step 3: Validating existing patterns...');

    const { data: existingPatterns } = await supabase
      .from('winning_patterns')
      .select('*')
      .gte('confidence_score', 50);

    let validated = 0;
    let deprecated = 0;

    for (const pattern of existingPatterns || []) {
      // Check if pattern still performs well
      const { data: recentPosts } = await supabase
        .from('social_posts')
        .select('*, post_performance(*)')
        .contains('patterns_used', [pattern.pattern_description])
        .gte('published_at', weekAgo)
        .eq('status', 'published');

      if (recentPosts && recentPosts.length >= 3) {
        const avgEng = calcEngagementRate(recentPosts);
        
        if (avgEng < 1.5) {
          // Pattern is underperforming - deprecate
          await supabase
            .from('winning_patterns')
            .update({ 
              confidence_score: Math.max(0, pattern.confidence_score - 20),
              is_active: pattern.confidence_score - 20 > 30,
            })
            .eq('id', pattern.id);
          deprecated++;
        } else if (avgEng > 3) {
          // Pattern still performing well - boost confidence
          await supabase
            .from('winning_patterns')
            .update({ 
              confidence_score: Math.min(100, pattern.confidence_score + 5),
              last_validated: new Date().toISOString(),
            })
            .eq('id', pattern.id);
          validated++;
        }
      }
    }

    results.learning_cycle.patterns_validated = validated;
    results.learning_cycle.patterns_deprecated = deprecated;
    console.log(`   - Validated: ${validated}, Deprecated: ${deprecated}`);

    // ========================================
    // STEP 4: Evaluate AI Prediction Accuracy
    // ========================================
    console.log('\n🎯 Step 4: Evaluating AI accuracy...');

    const { data: predictions } = await supabase
      .from('ai_generation_log')
      .select('*')
      .eq('was_published', true)
      .not('actual_engagement', 'is', null)
      .gte('created_at', weekAgo);

    if (predictions && predictions.length > 0) {
      results.ai_accuracy.predictions_evaluated = predictions.length;

      // Calculate accuracy (how close prediction was to actual)
      const accuracies = predictions.map(p => {
        const diff = Math.abs((p.predicted_engagement || 0) - (p.actual_engagement || 0));
        const maxVal = Math.max(p.predicted_engagement || 1, p.actual_engagement || 1);
        return (1 - diff / maxVal) * 100;
      });

      results.ai_accuracy.avg_accuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;

      // Find best and worst predictions
      const sorted = predictions.sort((a, b) => {
        const accA = Math.abs((a.predicted_engagement || 0) - (a.actual_engagement || 0));
        const accB = Math.abs((b.predicted_engagement || 0) - (b.actual_engagement || 0));
        return accA - accB;
      });

      results.ai_accuracy.best_prediction = {
        predicted: sorted[0]?.predicted_engagement,
        actual: sorted[0]?.actual_engagement,
        platform: sorted[0]?.platform,
      };

      results.ai_accuracy.worst_prediction = {
        predicted: sorted[sorted.length - 1]?.predicted_engagement,
        actual: sorted[sorted.length - 1]?.actual_engagement,
        platform: sorted[sorted.length - 1]?.platform,
      };

      console.log(`   - Predictions evaluated: ${results.ai_accuracy.predictions_evaluated}`);
      console.log(`   - Average accuracy: ${results.ai_accuracy.avg_accuracy.toFixed(1)}%`);
    }

    // ========================================
    // STEP 5: Generate Daily Report
    // ========================================
    console.log('\n📋 Step 5: Generating daily report...');

    const dailyReport = await generateDailyReport(today);
    results.daily_report = dailyReport;
    results.improvement_plan = dailyReport.improvement_plan || [];

    console.log(`   - Insights generated: ${dailyReport.insights?.length || 0}`);
    console.log(`   - Improvements planned: ${dailyReport.improvement_plan?.length || 0}`);

    // ========================================
    // STEP 6: Generate Strategy Adjustments
    // ========================================
    console.log('\n🎯 Step 6: Generating strategy adjustments...');

    const strategyPrompt = `Based on today's social media performance, generate specific strategy adjustments for tomorrow.

TODAY'S PERFORMANCE:
- Posts published: ${results.performance_analysis.posts_analyzed}
- Avg engagement rate: ${results.performance_analysis.avg_engagement_today.toFixed(2)}%
- Change from yesterday: ${results.performance_analysis.improvement_from_yesterday > 0 ? '+' : ''}${results.performance_analysis.improvement_from_yesterday.toFixed(1)}%
- 7-day average: ${results.performance_analysis.avg_engagement_last_7_days.toFixed(2)}%

AI ACCURACY:
- Prediction accuracy: ${results.ai_accuracy.avg_accuracy.toFixed(1)}%

PATTERNS:
- New patterns discovered: ${results.learning_cycle.new_patterns_discovered}
- Patterns deprecated: ${results.learning_cycle.patterns_deprecated}

Generate 3-5 SPECIFIC, ACTIONABLE strategy adjustments for tomorrow.
Focus on:
1. What content types to prioritize
2. What posting times to use
3. Which patterns to use more/less
4. Any platform-specific adjustments

Return JSON:
{
  "strategy_adjustments": ["adjustment 1", "adjustment 2", ...],
  "priority_platform": "which platform needs most focus",
  "content_focus": "what type of content to create more of",
  "avoid": "what to do less of"
}`;

    try {
      const strategyResponse = await getOpenAI().chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: strategyPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.5,
      });

      const strategy = JSON.parse(strategyResponse.choices[0].message.content || '{}');
      results.strategy_adjustments = strategy.strategy_adjustments || [];

      console.log(`   - Strategy adjustments: ${results.strategy_adjustments.length}`);
    } catch (error) {
      console.error('   - Error generating strategy');
      results.errors.push('Failed to generate strategy adjustments');
    }

    // ========================================
    // STEP 7: Log Learning History
    // ========================================
    console.log('\n💾 Step 7: Saving learning history...');

    await getSupabaseClient().from('learning_history').insert({
      learning_type: 'strategy_shift',
      description: `Daily learning cycle completed for ${today}`,
      data: {
        performance: results.performance_analysis,
        patterns: results.learning_cycle,
        accuracy: results.ai_accuracy,
        adjustments: results.strategy_adjustments,
      },
      impact_score: Math.round(results.performance_analysis.improvement_from_yesterday),
    });

    // ========================================
    // COMPLETE
    // ========================================
    results.duration = Math.round((Date.now() - startTime) / 1000);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🧠 DAILY LEARNING CYCLE COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📊 Posts analyzed: ${results.performance_analysis.posts_analyzed}`);
    console.log(`📈 Today's engagement: ${results.performance_analysis.avg_engagement_today.toFixed(2)}%`);
    console.log(`${results.performance_analysis.improvement_from_yesterday >= 0 ? '✅' : '⚠️'} Change: ${results.performance_analysis.improvement_from_yesterday >= 0 ? '+' : ''}${results.performance_analysis.improvement_from_yesterday.toFixed(1)}%`);
    console.log(`🔍 Patterns discovered: ${results.learning_cycle.new_patterns_discovered}`);
    console.log(`✅ Patterns validated: ${results.learning_cycle.patterns_validated}`);
    console.log(`❌ Patterns deprecated: ${results.learning_cycle.patterns_deprecated}`);
    console.log(`🎯 AI accuracy: ${results.ai_accuracy.avg_accuracy.toFixed(1)}%`);
    console.log(`⏱️ Duration: ${results.duration}s`);
    console.log('═══════════════════════════════════════════════════════');

    return NextResponse.json(results);

  } catch (error: any) {
    console.error('Daily learning error:', error);
    results.success = false;
    results.errors.push(error.message);
    results.duration = Math.round((Date.now() - startTime) / 1000);
    return NextResponse.json(results, { status: 500 });
  }
}

// ============================================================================
// MANUAL TRIGGER
// ============================================================================

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action } = body;

  switch (action) {
    case 'analyze-patterns':
      const platform = body.platform;
      const patterns = await analyzeWinningPatterns(platform);
      return NextResponse.json({ success: true, patterns });

    case 'generate-report':
      const date = body.date || new Date().toISOString().split('T')[0];
      const report = await generateDailyReport(date);
      return NextResponse.json({ success: true, report });

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}
