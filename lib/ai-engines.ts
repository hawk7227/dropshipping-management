// lib/ai-engines.ts
// AI Engines: Description generator, image enhancement, SEO optimizer, trend detection

import { createClient } from '@supabase/supabase-js';
import type { AiContent, SeoMetadata, TrendData, ImageQueueItem } from '@/types/database';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY || '';

// =====================
// OPENAI HELPERS
// =====================

async function callOpenAI(
  prompt: string,
  options: { maxTokens?: number; temperature?: number; systemPrompt?: string } = {}
): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const { maxTokens = 1000, temperature = 0.7, systemPrompt } = options;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
  
  const data = await response.json();
  const content = data.choices[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || 0;

  // Save to database for tracking
  await supabase.from('ai_content').insert({
    type: 'api_call',
    input_data: { prompt: prompt.slice(0, 500) },
    output_text: content.slice(0, 1000),
    model: 'gpt-4o-mini',
    tokens_used: tokensUsed,
  });

  return content;
}

// =====================
// DESCRIPTION GENERATOR
// =====================

export async function generateProductDescription(
  product: {
    title: string;
    features?: string[];
    category?: string;
    targetAudience?: string;
  },
  options: {
    length?: 'short' | 'medium' | 'long';
    tone?: 'professional' | 'casual' | 'luxury' | 'technical';
    includeEmoji?: boolean;
  } = {}
): Promise<{ description: string; saved: boolean }> {
  const { length = 'medium', tone = 'professional', includeEmoji = false } = options;

  const lengthGuide = { short: '50-100', medium: '100-200', long: '200-400' };

  const prompt = `Write a product description for: "${product.title}"

${product.features?.length ? `Features: ${product.features.join(', ')}` : ''}
${product.category ? `Category: ${product.category}` : ''}
${product.targetAudience ? `Target audience: ${product.targetAudience}` : ''}

Requirements:
- Length: ${lengthGuide[length]} words
- Tone: ${tone}
- Focus on benefits, not just features
- Include sensory language where appropriate
- End with a subtle call to action
${includeEmoji ? '- Include relevant emojis' : '- No emojis'}

Return only the description, no labels or headers.`;

  const description = await callOpenAI(prompt, {
    maxTokens: length === 'long' ? 600 : 400,
    systemPrompt: 'You are an expert e-commerce copywriter. Create compelling product descriptions that convert browsers into buyers.',
  });

  // Save generated content
  const { error } = await supabase.from('ai_content').insert({
    type: 'description',
    input_data: { product, options },
    output_text: description,
    model: 'gpt-4o-mini',
  });

  return { description: description.trim(), saved: !error };
}

// Generate multiple description variants
export async function generateDescriptionVariants(
  product: { title: string; features?: string[] },
  count: number = 3
): Promise<string[]> {
  const tones: Array<'professional' | 'casual' | 'luxury'> = ['professional', 'casual', 'luxury'];
  const variants: string[] = [];

  for (let i = 0; i < count; i++) {
    const { description } = await generateProductDescription(product, {
      tone: tones[i % tones.length],
      length: 'medium',
    });
    variants.push(description);
  }

  return variants;
}

// =====================
// TITLE OPTIMIZER
// =====================

export async function optimizeProductTitle(
  currentTitle: string,
  options: {
    keywords?: string[];
    maxLength?: number;
    platform?: 'shopify' | 'amazon' | 'ebay' | 'google';
  } = {}
): Promise<{ title: string; suggestions: string[] }> {
  const { keywords = [], maxLength = 200, platform = 'shopify' } = options;

  const platformGuidelines: Record<string, string> = {
    shopify: 'Clear, branded, benefit-focused',
    amazon: 'Keyword-rich, specific attributes, front-load important info',
    ebay: 'Detailed, searchable, include key specs',
    google: 'Natural language, avoid keyword stuffing',
  };

  const prompt = `Optimize this product title for ${platform}: "${currentTitle}"

${keywords.length ? `Target keywords: ${keywords.join(', ')}` : ''}
Maximum length: ${maxLength} characters
Platform guidelines: ${platformGuidelines[platform]}

Provide:
1. OPTIMIZED: The best optimized title
2. ALT1: Alternative option 1
3. ALT2: Alternative option 2
4. ALT3: Alternative option 3

Format each on its own line with the label.`;

  const response = await callOpenAI(prompt, { maxTokens: 300 });

  const lines = response.split('\n').filter(l => l.trim());
  const optimized = lines.find(l => l.includes('OPTIMIZED'))?.replace(/^OPTIMIZED:?\s*/i, '').trim() || currentTitle;
  const suggestions = lines
    .filter(l => l.includes('ALT'))
    .map(l => l.replace(/^ALT\d:?\s*/i, '').trim());

  return { title: optimized, suggestions };
}

// =====================
// SEO OPTIMIZER
// =====================

export async function analyzeSEO(content: {
  title: string;
  description: string;
  url?: string;
  productId?: string;
}): Promise<SeoMetadata> {
  const prompt = `Analyze this product for SEO and provide improvements:

Title: ${content.title}
Description: ${content.description}
${content.url ? `URL: ${content.url}` : ''}

Provide in this exact format:
META_TITLE: (max 60 chars)
META_DESCRIPTION: (max 160 chars)
KEYWORDS: keyword1, keyword2, keyword3, keyword4, keyword5
OG_TITLE: (max 60 chars)
OG_DESCRIPTION: (max 200 chars)
SEO_SCORE: (0-100)
RECOMMENDATIONS: issue1 | issue2 | issue3`;

  const response = await callOpenAI(prompt, {
    maxTokens: 500,
    systemPrompt: 'You are an SEO expert. Provide actionable, specific recommendations.',
  });

  // Parse response
  const getValue = (key: string) => {
    const match = response.match(new RegExp(`${key}:\\s*(.+?)(?=\\n|$)`, 'i'));
    return match?.[1]?.trim() || null;
  };

  const keywords = getValue('KEYWORDS')?.split(',').map(k => k.trim()) || [];
  const recommendations = (getValue('RECOMMENDATIONS')?.split('|') || []).map(r => ({
    type: 'suggestion' as const,
    category: 'seo',
    message: r.trim(),
    impact: 'medium' as const,
  }));

  const seoData: Omit<SeoMetadata, 'id' | 'created_at' | 'updated_at'> = {
    product_id: content.productId || null,
    page_url: content.url || null,
    meta_title: getValue('META_TITLE'),
    meta_description: getValue('META_DESCRIPTION'),
    keywords,
    og_title: getValue('OG_TITLE'),
    og_description: getValue('OG_DESCRIPTION'),
    og_image: null,
    schema_markup: generateProductSchema(content),
    seo_score: parseInt(getValue('SEO_SCORE') || '0'),
    recommendations,
  };

  // Save to database
  const { data, error } = await supabase
    .from('seo_metadata')
    .upsert(seoData, { onConflict: 'product_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Generate product schema markup
function generateProductSchema(product: { title: string; description: string; url?: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    ...(product.url && { url: product.url }),
  };
}

// Bulk SEO analysis
export async function bulkAnalyzeSEO(products: Array<{
  id: string;
  title: string;
  description: string;
}>): Promise<{ analyzed: number; avgScore: number }> {
  let totalScore = 0;
  let analyzed = 0;

  for (const product of products) {
    try {
      const result = await analyzeSEO({
        title: product.title,
        description: product.description,
        productId: product.id,
      });
      totalScore += result.seo_score || 0;
      analyzed++;
    } catch (error) {
      console.error(`SEO analysis failed for ${product.id}:`, error);
    }
  }

  return {
    analyzed,
    avgScore: analyzed > 0 ? Math.round(totalScore / analyzed) : 0,
  };
}

// =====================
// IMAGE ENHANCEMENT
// =====================

// Queue image for processing
export async function queueImageProcessing(
  imageUrl: string,
  processingType: 'enhance' | 'background_remove' | 'resize' | 'compress',
  options: {
    productId?: string;
    settings?: Record<string, unknown>;
  } = {}
): Promise<ImageQueueItem> {
  const { data, error } = await supabase
    .from('image_queue')
    .insert({
      product_id: options.productId || null,
      original_url: imageUrl,
      processing_type: processingType,
      status: 'pending',
      settings: options.settings || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Remove background using remove.bg API
export async function removeBackground(imageUrl: string): Promise<string> {
  if (!REMOVE_BG_API_KEY) throw new Error('Remove.bg API key not configured');

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': REMOVE_BG_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      size: 'auto',
      format: 'png',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Remove.bg error: ${error}`);
  }

  // Return base64 image data
  const buffer = await response.arrayBuffer();
  return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
}

// Process image queue item
export async function processImageQueueItem(itemId: string): Promise<ImageQueueItem> {
  const { data: item, error } = await supabase
    .from('image_queue')
    .select('*')
    .eq('id', itemId)
    .single();

  if (error || !item) throw new Error('Queue item not found');

  try {
    await supabase.from('image_queue').update({ status: 'processing' }).eq('id', itemId);

    let processedUrl: string;

    switch (item.processing_type) {
      case 'background_remove':
        processedUrl = await removeBackground(item.original_url);
        break;
      default:
        throw new Error(`Unsupported processing type: ${item.processing_type}`);
    }

    const { data: updated, error: updateError } = await supabase
      .from('image_queue')
      .update({
        processed_url: processedUrl,
        status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .select()
      .single();

    if (updateError) throw updateError;
    return updated;
  } catch (error) {
    await supabase
      .from('image_queue')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq('id', itemId);
    throw error;
  }
}

// Get image queue status
export async function getImageQueue(options: {
  status?: string;
  productId?: string;
  limit?: number;
}): Promise<ImageQueueItem[]> {
  let query = supabase
    .from('image_queue')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.status) query = query.eq('status', options.status);
  if (options.productId) query = query.eq('product_id', options.productId);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// =====================
// TREND DETECTION
// =====================

export async function analyzeTrends(
  category: string,
  options: { keywords?: string[]; limit?: number } = {}
): Promise<TrendData[]> {
  const { keywords = [], limit = 10 } = options;

  const prompt = `Analyze current e-commerce trends for: "${category}"
${keywords.length ? `Related keywords: ${keywords.join(', ')}` : ''}

Provide ${limit} trending keywords/topics in this format:
KEYWORD | SEARCH_VOLUME (estimate: low/medium/high) | TREND_SCORE (1-100) | COMPETITION (low/medium/high) | RELATED_KEYWORDS

One per line, no numbering.`;

  const response = await callOpenAI(prompt, {
    maxTokens: 500,
    systemPrompt: 'You are a market research analyst specializing in e-commerce trends.',
  });

  const volumeMap: Record<string, number> = { low: 1000, medium: 10000, high: 100000 };
  
  const trends: TrendData[] = response
    .split('\n')
    .filter(l => l.includes('|'))
    .map(line => {
      const [keyword, volume, score, competition, related] = line.split('|').map(s => s.trim());
      return {
        id: crypto.randomUUID(),
        keyword: keyword || '',
        category,
        search_volume: volumeMap[volume?.toLowerCase()] || 5000,
        trend_score: parseFloat(score) || 50,
        competition_level: competition?.toLowerCase() as 'low' | 'medium' | 'high' || null,
        related_keywords: related?.split(',').map(k => k.trim()) || null,
        source: 'ai_analysis' as const,
        recorded_at: new Date().toISOString(),
      };
    });

  // Save to database
  if (trends.length > 0) {
    await supabase.from('trend_data').insert(trends);
  }

  return trends;
}

// Get stored trends
export async function getTrends(options: {
  category?: string;
  minScore?: number;
  limit?: number;
  days?: number;
}): Promise<TrendData[]> {
  const since = new Date();
  since.setDate(since.getDate() - (options.days || 30));

  let query = supabase
    .from('trend_data')
    .select('*')
    .gte('recorded_at', since.toISOString())
    .order('trend_score', { ascending: false });

  if (options.category) query = query.eq('category', options.category);
  if (options.minScore) query = query.gte('trend_score', options.minScore);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// =====================
// AI CONTENT HISTORY
// =====================

export async function getAiContentHistory(options: {
  type?: string;
  limit?: number;
}): Promise<AiContent[]> {
  let query = supabase
    .from('ai_content')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.type) query = query.eq('type', options.type);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// =====================
// UTILITIES
// =====================

export function isAiConfigured(): boolean {
  return !!OPENAI_API_KEY;
}

export async function testAiConnection(): Promise<{ success: boolean; error?: string }> {
  if (!isAiConfigured()) {
    return { success: false, error: 'OpenAI API key not configured' };
  }

  try {
    await callOpenAI('Say "connected" in one word.', { maxTokens: 10 });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
