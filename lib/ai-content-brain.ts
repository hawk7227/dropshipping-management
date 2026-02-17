// lib/ai-content-brain.ts
// ============================================================================
// SELF-LEARNING AI CONTENT ENGINE
// Generates high-converting content that improves daily
// ============================================================================
//
// HOW IT WORKS:
// 1. Loads your brand style guide (voice, tone, colors, do's/don'ts)
// 2. Analyzes past performance to find winning patterns
// 3. Generates content using proven templates + brand voice
// 4. Scores content quality before publishing
// 5. Tracks performance after publishing
// 6. Learns from results and adjusts future content
// 7. Generates daily reports with insights and improvement plans
// ============================================================================

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}
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

// ============================================================================
// TYPES
// ============================================================================

interface BrandStyleGuide {
  id: string;
  brand_name: string;
  voice_tone: string;           // "friendly, confident, helpful"
  personality_traits: string[]; // ["approachable", "expert", "fun"]
  writing_style: string;        // "conversational, use contractions"
  emoji_usage: 'heavy' | 'moderate' | 'minimal' | 'none';
  hashtag_style: string;        // "mix of branded and trending"
  color_palette: string[];      // ["#FF5733", "#2ECC71"]
  content_pillars: string[];    // ["education", "entertainment", "promotion", "community"]
  do_not_use: string[];         // ["slang", "competitor names", "negative language"]
  call_to_action_style: string; // "soft sell, focus on value"
  target_audience: string;      // "25-45 year old professionals"
  unique_selling_points: string[];
}

interface WinningPattern {
  id: string;
  platform: string;
  pattern_type: 'hook' | 'format' | 'cta' | 'timing' | 'hashtag' | 'visual';
  pattern_description: string;
  example_content: string;
  avg_engagement_rate: number;
  sample_size: number;
  confidence_score: number; // 0-100
  discovered_at: string;
  last_validated: string;
}

interface ContentTemplate {
  id: string;
  name: string;
  platform: string;
  content_type: 'product' | 'lifestyle' | 'educational' | 'ugc' | 'promo' | 'engagement';
  template_structure: string;
  hook_options: string[];
  cta_options: string[];
  avg_performance_score: number;
  times_used: number;
}

interface GeneratedPost {
  id: string;
  platform: string;
  content: string;
  hashtags: string[];
  media_suggestions: string[];
  posting_time: string;
  quality_score: number;
  predicted_engagement: number;
  patterns_used: string[];
  template_used: string;
  product_id?: string;
}

interface PerformanceMetrics {
  post_id: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  engagement_rate: number;
  click_through_rate: number;
  conversions: number;
  revenue: number;
}

interface DailyReport {
  date: string;
  posts_created: number;
  posts_published: number;
  total_impressions: number;
  total_engagement: number;
  avg_engagement_rate: number;
  top_performing_post: any;
  worst_performing_post: any;
  patterns_discovered: WinningPattern[];
  insights: string[];
  improvement_plan: string[];
  next_day_strategy: string;
}

// ============================================================================
// BRAND STYLE GUIDE MANAGEMENT
// ============================================================================

/**
 * Get or create brand style guide
 */
export async function getBrandStyleGuide(): Promise<BrandStyleGuide> {
  const { data, error } = await getSupabaseClient()
    .from('brand_style_guide')
    .select('*')
    .limit(1)
    .single();

  if (data) return data;

  // Return default if none exists
  return {
    id: 'default',
    brand_name: 'Your Brand',
    voice_tone: 'friendly, confident, helpful, genuine',
    personality_traits: ['approachable', 'expert', 'trustworthy', 'fun'],
    writing_style: 'conversational but professional, use contractions, short sentences',
    emoji_usage: 'moderate',
    hashtag_style: 'mix of branded (#YourBrand) and trending, 5-15 per post on IG, 3-5 on TikTok',
    color_palette: ['#000000', '#FFFFFF'],
    content_pillars: ['product showcases', 'customer stories', 'tips & tricks', 'behind the scenes'],
    do_not_use: ['competitor names', 'negative language', 'overpromising', 'clickbait'],
    call_to_action_style: 'soft sell focused on value, invite rather than push',
    target_audience: 'value-conscious shoppers looking for quality products at fair prices',
    unique_selling_points: ['best prices', 'fast shipping', 'quality guaranteed'],
  };
}

/**
 * Update brand style guide
 */
export async function updateBrandStyleGuide(guide: Partial<BrandStyleGuide>): Promise<void> {
  await getSupabaseClient()
    .from('brand_style_guide')
    .upsert({ id: 'default', ...guide, updated_at: new Date().toISOString() });
}

// ============================================================================
// WINNING PATTERNS ANALYSIS
// ============================================================================

/**
 * Analyze past posts to find winning patterns
 */
export async function analyzeWinningPatterns(platform?: string): Promise<WinningPattern[]> {
  // Get posts with performance data
  let query = getSupabaseClient()
    .from('social_posts')
    .select('*, post_performance(*)')
    .eq('status', 'published')
    .not('engagement', 'is', null);

  if (platform) {
    query = query.eq('platform', platform);
  }

  const { data: posts } = await query.order('created_at', { ascending: false }).limit(100);

  if (!posts || posts.length < 10) {
    return getDefaultPatterns();
  }

  // Analyze patterns using AI
  const prompt = `Analyze these social media posts and their performance to identify winning patterns.

POSTS DATA:
${JSON.stringify(posts.map(p => ({
  platform: p.platform,
  content: p.content.substring(0, 200),
  engagement: p.engagement,
  likes: p.engagement?.likes || 0,
  comments: p.engagement?.comments || 0,
  shares: p.engagement?.shares || 0,
})), null, 2)}

Identify patterns in:
1. HOOKS - What opening lines get most engagement?
2. FORMATS - What content structures perform best?
3. CTAs - What calls-to-action drive action?
4. LENGTH - What content length works best?
5. EMOJIS - How does emoji usage affect engagement?
6. QUESTIONS - Do questions increase comments?

Return JSON:
{
  "patterns": [
    {
      "pattern_type": "hook|format|cta|timing|hashtag|visual",
      "pattern_description": "what the pattern is",
      "example_content": "example from the data",
      "avg_engagement_rate": number,
      "confidence_score": 0-100
    }
  ],
  "key_insight": "the most important finding"
}`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Save discovered patterns
    for (const pattern of result.patterns || []) {
      await getSupabaseClient().from('winning_patterns').upsert({
        id: `${platform || 'all'}_${pattern.pattern_type}_${Date.now()}`,
        platform: platform || 'all',
        ...pattern,
        sample_size: posts.length,
        discovered_at: new Date().toISOString(),
        last_validated: new Date().toISOString(),
      });
    }

    return result.patterns || [];
  } catch (error) {
    console.error('Pattern analysis error:', error);
    return getDefaultPatterns();
  }
}

/**
 * Default patterns based on industry best practices
 */
function getDefaultPatterns(): WinningPattern[] {
  return [
    {
      id: 'default_hook_question',
      platform: 'all',
      pattern_type: 'hook',
      pattern_description: 'Start with a question that creates curiosity',
      example_content: 'Ever wonder why your [product category] never lasts?',
      avg_engagement_rate: 4.5,
      sample_size: 0,
      confidence_score: 75,
      discovered_at: new Date().toISOString(),
      last_validated: new Date().toISOString(),
    },
    {
      id: 'default_hook_problem',
      platform: 'all',
      pattern_type: 'hook',
      pattern_description: 'Lead with a relatable problem',
      example_content: 'We\'ve all been there - [common frustration]',
      avg_engagement_rate: 4.2,
      sample_size: 0,
      confidence_score: 75,
      discovered_at: new Date().toISOString(),
      last_validated: new Date().toISOString(),
    },
    {
      id: 'default_cta_soft',
      platform: 'all',
      pattern_type: 'cta',
      pattern_description: 'Use soft CTAs that invite rather than push',
      example_content: 'Link in bio if you want to check it out 🔗',
      avg_engagement_rate: 3.8,
      sample_size: 0,
      confidence_score: 70,
      discovered_at: new Date().toISOString(),
      last_validated: new Date().toISOString(),
    },
    {
      id: 'default_format_story',
      platform: 'instagram',
      pattern_type: 'format',
      pattern_description: 'Tell a mini story with beginning, middle, end',
      example_content: 'Problem → Discovery → Solution → Result',
      avg_engagement_rate: 5.1,
      sample_size: 0,
      confidence_score: 80,
      discovered_at: new Date().toISOString(),
      last_validated: new Date().toISOString(),
    },
  ];
}

/**
 * Get winning patterns for a platform
 */
export async function getWinningPatterns(platform: string): Promise<WinningPattern[]> {
  const { data } = await getSupabaseClient()
    .from('winning_patterns')
    .select('*')
    .or(`platform.eq.${platform},platform.eq.all`)
    .gte('confidence_score', 60)
    .order('confidence_score', { ascending: false })
    .limit(10);

  if (data && data.length > 0) {
    return data;
  }

  return getDefaultPatterns().filter(p => p.platform === platform || p.platform === 'all');
}

// ============================================================================
// CONTENT GENERATION ENGINE
// ============================================================================

/**
 * Generate high-converting content for a platform
 */
export async function generateHighConvertingContent(
  platform: 'instagram' | 'facebook' | 'tiktok' | 'twitter',
  product: {
    id: string;
    title: string;
    description: string;
    price: number;
    compareAtPrice?: number;
    images: string[];
    benefits?: string[];
  },
  options?: {
    contentType?: 'product' | 'lifestyle' | 'educational' | 'promo' | 'engagement';
    useTemplate?: string;
  }
): Promise<GeneratedPost> {
  // 1. Load brand style guide
  const brandGuide = await getBrandStyleGuide();

  // 2. Get winning patterns for this platform
  const patterns = await getWinningPatterns(platform);

  // 3. Get content templates
  const templates = await getContentTemplates(platform, options?.contentType);

  // 4. Platform-specific rules
  const platformRules = getPlatformRules(platform);

  // 5. Generate content with GPT-4
  const prompt = `You are a world-class social media copywriter. Generate a ${platform} post that will CONVERT viewers into buyers.

BRAND STYLE GUIDE:
- Brand Name: ${brandGuide.brand_name}
- Voice/Tone: ${brandGuide.voice_tone}
- Personality: ${brandGuide.personality_traits.join(', ')}
- Writing Style: ${brandGuide.writing_style}
- Emoji Usage: ${brandGuide.emoji_usage}
- DO NOT use: ${brandGuide.do_not_use.join(', ')}
- CTA Style: ${brandGuide.call_to_action_style}
- Target Audience: ${brandGuide.target_audience}

PRODUCT:
- Title: ${product.title}
- Description: ${product.description}
- Price: $${product.price}
${product.compareAtPrice ? `- Was: $${product.compareAtPrice} (${Math.round((1 - product.price / product.compareAtPrice) * 100)}% OFF!)` : ''}
- Benefits: ${product.benefits?.join(', ') || 'quality, value, fast shipping'}

WINNING PATTERNS TO USE (these performed best for this audience):
${patterns.map(p => `- ${p.pattern_type.toUpperCase()}: ${p.pattern_description} (${p.confidence_score}% confidence)`).join('\n')}

PLATFORM RULES (${platform}):
${platformRules}

CONTENT TYPE: ${options?.contentType || 'product showcase'}

${templates.length > 0 ? `TEMPLATE TO FOLLOW:
${templates[0].template_structure}

HOOK OPTIONS: ${templates[0].hook_options.join(' | ')}
CTA OPTIONS: ${templates[0].cta_options.join(' | ')}` : ''}

REQUIREMENTS:
1. Use the winning patterns identified above
2. Match the brand voice exactly
3. Include a hook that stops the scroll
4. Focus on BENEFITS, not just features
5. Include social proof if possible
6. End with a clear but soft CTA
7. Make it feel authentic, NOT salesy

Return JSON:
{
  "content": "the full post content",
  "hashtags": ["hashtag1", "hashtag2", ...],
  "hook_used": "which hook pattern was used",
  "cta_used": "which CTA pattern was used",
  "media_suggestions": ["description of ideal image/video"],
  "posting_time": "best time to post (HH:MM format)",
  "reasoning": "why this content will convert"
}`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    // 6. Score the content quality
    const qualityScore = await scoreContentQuality(result.content, platform, brandGuide);

    // 7. Predict engagement based on patterns used
    const predictedEngagement = predictEngagement(result, patterns);

    const generatedPost: GeneratedPost = {
      id: `gen_${Date.now()}`,
      platform,
      content: result.content,
      hashtags: result.hashtags || [],
      media_suggestions: result.media_suggestions || [],
      posting_time: result.posting_time || getOptimalTime(platform),
      quality_score: qualityScore,
      predicted_engagement: predictedEngagement,
      patterns_used: [result.hook_used, result.cta_used].filter(Boolean),
      template_used: templates[0]?.id || 'none',
      product_id: product.id,
    };

    // 8. If quality score is below threshold, regenerate
    if (qualityScore < 70) {
      console.log(`Quality score ${qualityScore} below threshold, regenerating...`);
      return generateHighConvertingContent(platform, product, options);
    }

    return generatedPost;
  } catch (error) {
    console.error('Content generation error:', error);
    throw error;
  }
}

/**
 * Platform-specific rules
 */
function getPlatformRules(platform: string): string {
  const rules: Record<string, string> = {
    instagram: `
- Max 2,200 characters (but 125-150 shows before "more")
- Use 5-15 relevant hashtags (mix popular + niche)
- First line is CRITICAL - must stop the scroll
- Use line breaks for readability
- Emojis increase engagement by 48%
- Best times: 11am-1pm and 7pm-9pm
- Carousel posts get 1.4x more reach
- Reels get 22% more engagement than static posts`,

    tiktok: `
- Keep it SHORT and punchy
- Hook in first 1-3 seconds is everything
- Use trending sounds when relevant
- 3-5 hashtags max (1 branded, rest trending)
- Vertical video format (9:16)
- Best times: 7pm-11pm
- Raw/authentic > polished
- End with a hook to watch again or follow`,

    facebook: `
- Can be longer form (up to 63,206 chars)
- 1-3 hashtags max (they're not big here)
- Questions increase comments 100%+
- Native video gets 10x more reach than links
- Best times: 1pm-4pm
- Share value first, sell second
- Community building > direct selling`,

    twitter: `
- Max 280 characters
- 1-2 hashtags max
- Be witty, clever, or controversial
- Threads for longer content
- Engage with replies
- Best times: 9am and 12pm
- News-jacking works well`,
  };

  return rules[platform] || rules.instagram;
}

/**
 * Get optimal posting time for platform
 */
function getOptimalTime(platform: string): string {
  const times: Record<string, string[]> = {
    instagram: ['11:00', '13:00', '19:00'],
    tiktok: ['19:00', '21:00', '23:00'],
    facebook: ['13:00', '15:00', '16:00'],
    twitter: ['09:00', '12:00', '17:00'],
  };

  const platformTimes = times[platform] || times.instagram;
  return platformTimes[Math.floor(Math.random() * platformTimes.length)];
}

// ============================================================================
// CONTENT QUALITY SCORING
// ============================================================================

/**
 * Score content quality (0-100)
 */
async function scoreContentQuality(
  content: string,
  platform: string,
  brandGuide: BrandStyleGuide
): Promise<number> {
  const prompt = `Score this ${platform} post on a scale of 0-100 for conversion potential.

CONTENT:
"${content}"

BRAND GUIDELINES:
- Voice: ${brandGuide.voice_tone}
- Don't use: ${brandGuide.do_not_use.join(', ')}

SCORING CRITERIA:
1. Hook strength (0-20): Does the first line stop the scroll?
2. Brand voice match (0-20): Does it sound like the brand?
3. Value clarity (0-20): Is the benefit immediately clear?
4. CTA effectiveness (0-20): Will people take action?
5. Platform optimization (0-20): Is it optimized for ${platform}?

Return JSON:
{
  "hook_score": 0-20,
  "voice_score": 0-20,
  "value_score": 0-20,
  "cta_score": 0-20,
  "platform_score": 0-20,
  "total_score": 0-100,
  "weaknesses": ["what could be improved"],
  "strengths": ["what's working well"]
}`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.total_score || 70;
  } catch (error) {
    return 70; // Default score if scoring fails
  }
}

/**
 * Predict engagement based on patterns
 */
function predictEngagement(content: any, patterns: WinningPattern[]): number {
  let baseEngagement = 2.5; // Industry average

  // Boost for each winning pattern used
  for (const pattern of patterns) {
    if (content.hook_used?.includes(pattern.pattern_description) || 
        content.cta_used?.includes(pattern.pattern_description)) {
      baseEngagement += (pattern.avg_engagement_rate - 2.5) * (pattern.confidence_score / 100);
    }
  }

  return Math.round(baseEngagement * 10) / 10;
}

// ============================================================================
// CONTENT TEMPLATES
// ============================================================================

async function getContentTemplates(platform: string, contentType?: string): Promise<ContentTemplate[]> {
  let query = getSupabaseClient()
    .from('content_templates')
    .select('*')
    .eq('platform', platform);

  if (contentType) {
    query = query.eq('content_type', contentType);
  }

  const { data } = await query.order('avg_performance_score', { ascending: false }).limit(5);

  if (data && data.length > 0) {
    return data;
  }

  // Default templates
  return [
    {
      id: 'default_product',
      name: 'Product Showcase',
      platform,
      content_type: 'product',
      template_structure: `
[HOOK - Stop the scroll]

[PROBLEM - Relate to the audience]

[SOLUTION - Introduce the product]

[BENEFITS - 2-3 key benefits with emojis]

[SOCIAL PROOF - If available]

[CTA - Soft call to action]

[HASHTAGS]`,
      hook_options: [
        'Ever wonder why...?',
        'POV: You finally found...',
        'The secret to [outcome]...',
        'Stop scrolling if you...',
      ],
      cta_options: [
        'Link in bio 🔗',
        'Tap to shop ✨',
        'Comment "WANT" for the link!',
        'Save this for later 📌',
      ],
      avg_performance_score: 75,
      times_used: 0,
    },
  ];
}

// ============================================================================
// PERFORMANCE TRACKING & LEARNING
// ============================================================================

/**
 * Record post performance and learn from it
 */
export async function recordPerformance(
  postId: string,
  metrics: PerformanceMetrics
): Promise<void> {
  // Save metrics
  await getSupabaseClient().from('post_performance').upsert({
    post_id: postId,
    ...metrics,
    recorded_at: new Date().toISOString(),
  });

  // Update the post's engagement
  await getSupabaseClient()
    .from('social_posts')
    .update({
      engagement: {
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        saves: metrics.saves,
      },
    })
    .eq('id', postId);

  // Trigger learning if we have enough data
  await triggerLearning();
}

/**
 * Trigger the learning process
 */
async function triggerLearning(): Promise<void> {
  const { count } = await getSupabaseClient()
    .from('social_posts')
    .select('id', { count: 'exact' })
    .eq('status', 'published')
    .not('engagement', 'is', null);

  // Learn after every 10 new posts with data
  if (count && count % 10 === 0) {
    console.log('Triggering learning cycle...');
    await analyzeWinningPatterns();
  }
}

// ============================================================================
// DAILY REPORT GENERATION
// ============================================================================

/**
 * Generate comprehensive daily report
 */
export async function generateDailyReport(date?: string): Promise<DailyReport> {
  const reportDate = date || new Date().toISOString().split('T')[0];
  const startOfDay = `${reportDate}T00:00:00Z`;
  const endOfDay = `${reportDate}T23:59:59Z`;

  // Get today's posts
  const { data: todaysPosts } = await getSupabaseClient()
    .from('social_posts')
    .select('*, post_performance(*)')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);

  const posts = todaysPosts || [];

  // Calculate metrics
  const publishedPosts = posts.filter(p => p.status === 'published');
  const totalImpressions = publishedPosts.reduce((sum, p) => sum + (p.post_performance?.[0]?.impressions || 0), 0);
  const totalEngagement = publishedPosts.reduce((sum, p) => {
    const perf = p.post_performance?.[0];
    return sum + (perf?.likes || 0) + (perf?.comments || 0) + (perf?.shares || 0);
  }, 0);
  const avgEngagementRate = totalImpressions > 0 
    ? (totalEngagement / totalImpressions) * 100 
    : 0;

  // Find top and worst performers
  const sortedByEngagement = publishedPosts
    .filter(p => p.post_performance?.[0])
    .sort((a, b) => {
      const engA = (a.post_performance[0]?.likes || 0) + (a.post_performance[0]?.comments || 0);
      const engB = (b.post_performance[0]?.likes || 0) + (b.post_performance[0]?.comments || 0);
      return engB - engA;
    });

  const topPost = sortedByEngagement[0] || null;
  const worstPost = sortedByEngagement[sortedByEngagement.length - 1] || null;

  // Analyze patterns discovered today
  const newPatterns = await analyzeWinningPatterns();

  // Generate AI insights and improvement plan
  const analysisPrompt = `Analyze this daily social media performance and provide actionable insights.

TODAY'S STATS (${reportDate}):
- Posts Created: ${posts.length}
- Posts Published: ${publishedPosts.length}
- Total Impressions: ${totalImpressions}
- Total Engagement: ${totalEngagement}
- Avg Engagement Rate: ${avgEngagementRate.toFixed(2)}%

TOP PERFORMING POST:
${topPost ? `Platform: ${topPost.platform}
Content: "${topPost.content?.substring(0, 200)}..."
Likes: ${topPost.post_performance?.[0]?.likes || 0}
Comments: ${topPost.post_performance?.[0]?.comments || 0}` : 'No data'}

WORST PERFORMING POST:
${worstPost ? `Platform: ${worstPost.platform}
Content: "${worstPost.content?.substring(0, 200)}..."
Likes: ${worstPost.post_performance?.[0]?.likes || 0}
Comments: ${worstPost.post_performance?.[0]?.comments || 0}` : 'No data'}

PATTERNS DISCOVERED:
${newPatterns.map(p => `- ${p.pattern_type}: ${p.pattern_description}`).join('\n')}

Provide:
1. 3-5 key insights from today's performance
2. 3-5 specific improvements for tomorrow
3. A one-sentence strategy for tomorrow

Return JSON:
{
  "insights": ["insight 1", "insight 2", ...],
  "improvement_plan": ["action 1", "action 2", ...],
  "tomorrow_strategy": "one clear strategy statement"
}`;

  let insights: string[] = [];
  let improvementPlan: string[] = [];
  let tomorrowStrategy = '';

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: analysisPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    insights = result.insights || [];
    improvementPlan = result.improvement_plan || [];
    tomorrowStrategy = result.tomorrow_strategy || '';
  } catch (error) {
    console.error('Report analysis error:', error);
    insights = ['Unable to generate insights - check API'];
    improvementPlan = ['Continue with current strategy'];
    tomorrowStrategy = 'Maintain consistency while monitoring performance';
  }

  const report: DailyReport = {
    date: reportDate,
    posts_created: posts.length,
    posts_published: publishedPosts.length,
    total_impressions: totalImpressions,
    total_engagement: totalEngagement,
    avg_engagement_rate: Math.round(avgEngagementRate * 100) / 100,
    top_performing_post: topPost ? {
      platform: topPost.platform,
      content_preview: topPost.content?.substring(0, 100) + '...',
      likes: topPost.post_performance?.[0]?.likes || 0,
      comments: topPost.post_performance?.[0]?.comments || 0,
    } : null,
    worst_performing_post: worstPost && worstPost !== topPost ? {
      platform: worstPost.platform,
      content_preview: worstPost.content?.substring(0, 100) + '...',
      likes: worstPost.post_performance?.[0]?.likes || 0,
      comments: worstPost.post_performance?.[0]?.comments || 0,
    } : null,
    patterns_discovered: newPatterns,
    insights,
    improvement_plan: improvementPlan,
    next_day_strategy: tomorrowStrategy,
  };

  // Save report
  await getSupabaseClient().from('daily_reports').upsert({
    date: reportDate,
    ...report,
    created_at: new Date().toISOString(),
  });

  return report;
}

// ============================================================================
// WEEKLY PERFORMANCE SUMMARY
// ============================================================================

export async function generateWeeklySummary(): Promise<any> {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: reports } = await getSupabaseClient()
    .from('daily_reports')
    .select('*')
    .gte('date', weekAgo.toISOString().split('T')[0])
    .lte('date', today.toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (!reports || reports.length === 0) {
    return { error: 'No data for this week' };
  }

  const totalPosts = reports.reduce((sum, r) => sum + r.posts_published, 0);
  const totalImpressions = reports.reduce((sum, r) => sum + r.total_impressions, 0);
  const totalEngagement = reports.reduce((sum, r) => sum + r.total_engagement, 0);
  const avgEngagement = reports.reduce((sum, r) => sum + r.avg_engagement_rate, 0) / reports.length;

  // Find best day
  const bestDay = reports.reduce((best, current) => 
    (current.avg_engagement_rate > best.avg_engagement_rate) ? current : best
  );

  // Compile all insights
  const allInsights = reports.flatMap(r => r.insights || []);
  const allImprovements = reports.flatMap(r => r.improvement_plan || []);

  return {
    week_start: weekAgo.toISOString().split('T')[0],
    week_end: today.toISOString().split('T')[0],
    total_posts: totalPosts,
    total_impressions: totalImpressions,
    total_engagement: totalEngagement,
    avg_engagement_rate: Math.round(avgEngagement * 100) / 100,
    best_performing_day: bestDay.date,
    daily_breakdown: reports.map(r => ({
      date: r.date,
      posts: r.posts_published,
      engagement_rate: r.avg_engagement_rate,
    })),
    top_insights: [...new Set(allInsights)].slice(0, 5),
    key_improvements: [...new Set(allImprovements)].slice(0, 5),
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  // Brand management
  getBrandStyleGuide,
  updateBrandStyleGuide,

  // Content generation
  generateHighConvertingContent,
  
  // Patterns & learning
  analyzeWinningPatterns,
  getWinningPatterns,
  
  // Performance
  recordPerformance,
  
  // Reports
  generateDailyReport,
  generateWeeklySummary,
};
