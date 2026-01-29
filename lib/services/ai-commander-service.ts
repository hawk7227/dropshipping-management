// lib/services/ai-commander-service.ts
// AI Command Center service layer for natural language command processing and execution

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// TYPES
// ============================================================================

export interface CommandInterpretation {
  action: string;
  category: string;
  description: string;
  target_count?: number;
  estimated_duration?: string;
  parameters: Record<string, any>;
}

export interface CommandExecution {
  execution_id: string;
  command: string;
  interpretation: CommandInterpretation;
  status: 'planned' | 'executing' | 'completed' | 'failed';
  results?: {
    success_count: number;
    error_count: number;
    affected_items: string[];
    errors: Array<{ item: string; error: string }>;
  };
  executed_at?: string;
  error?: string;
}

export interface AiCommandLog {
  id?: string;
  user_id?: string;
  command: string;
  interpretation: CommandInterpretation;
  execution: Partial<CommandExecution>;
  executed: boolean;
  dry_run: boolean;
  created_at?: string;
}

// ============================================================================
// COMMAND PARSING & INTERPRETATION
// ============================================================================

/**
 * Parse natural language command using OpenAI GPT-4
 */
export async function interpretCommand(
  command: string,
  context?: { products_count?: number; total_revenue?: number }
): Promise<CommandInterpretation> {
  const systemPrompt = `You are an AI assistant for an e-commerce dropshipping platform. Analyze user commands and respond with a JSON object containing:
- action: the specific action to perform (e.g., "update_prices", "generate_descriptions", "pause_products", "create_posts", etc.)
- category: the module affected (pricing, products, content, orders, channels)
- description: clear explanation of what will happen
- target_count: estimated number of items affected
- estimated_duration: how long this will take (e.g., "2 minutes")
- parameters: extracted parameters as key-value pairs

Categories: pricing, products, content, orders, channels, analytics, discovery

Actions include:
- Pricing: update_prices, sync_prices, apply_margin_rule, adjust_prices_by_percentage
- Products: generate_descriptions, update_titles, pause_products, activate_products, update_categories
- Content: create_social_posts, generate_seo_content, create_email_campaigns
- Orders: export_orders, fulfill_orders, process_refunds
- Channels: sync_to_shopify, sync_to_ebay, publish_to_tiktok
- Discovery: find_new_products, validate_asins, check_demand

Always respond with valid JSON only. Never include markdown or explanations.`;

  const userPrompt = `Command: "${command}"
${context ? `Context: ${JSON.stringify(context)}` : ''}

Provide the JSON interpretation.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}') as CommandInterpretation;
    return result;
  } catch (error) {
    console.error('Error interpreting command:', error);
    throw new Error('Failed to interpret command');
  }
}

/**
 * Execute a command based on interpretation
 */
export async function executeCommand(
  interpretation: CommandInterpretation,
  dryRun: boolean = true
): Promise<CommandExecution> {
  const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    let results;

    switch (interpretation.action) {
      // ================================================================
      // PRICING ACTIONS
      // ================================================================
      case 'update_prices':
        results = await executePriceUpdate(interpretation, dryRun);
        break;

      case 'sync_prices':
        results = await executePriceSync(interpretation, dryRun);
        break;

      case 'apply_margin_rule':
        results = await executeMarginRuleApplication(interpretation, dryRun);
        break;

      case 'adjust_prices_by_percentage':
        results = await executePriceAdjustment(interpretation, dryRun);
        break;

      // ================================================================
      // PRODUCT ACTIONS
      // ================================================================
      case 'generate_descriptions':
        results = await executeDescriptionGeneration(interpretation, dryRun);
        break;

      case 'update_titles':
        results = await executeTitleUpdate(interpretation, dryRun);
        break;

      case 'pause_products':
        results = await executePauseProducts(interpretation, dryRun);
        break;

      case 'activate_products':
        results = await executeActivateProducts(interpretation, dryRun);
        break;

      // ================================================================
      // CONTENT ACTIONS
      // ================================================================
      case 'create_social_posts':
        results = await executeCreateSocialPosts(interpretation, dryRun);
        break;

      case 'generate_seo_content':
        results = await executeGenerateSeoContent(interpretation, dryRun);
        break;

      // ================================================================
      // DEFAULT
      // ================================================================
      default:
        throw new Error(`Unknown action: ${interpretation.action}`);
    }

    return {
      execution_id: executionId,
      command: '', // Will be set by caller
      interpretation,
      status: dryRun ? 'planned' : 'completed',
      results,
      executed_at: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      execution_id: executionId,
      command: '', // Will be set by caller
      interpretation,
      status: 'failed',
      error: error.message,
      executed_at: new Date().toISOString(),
    };
  }
}

/**
 * Log command execution for audit trail
 */
export async function logCommandExecution(
  command: string,
  interpretation: CommandInterpretation,
  execution: Partial<CommandExecution>,
  dryRun: boolean = true
): Promise<AiCommandLog | null> {
  const { data, error } = await supabase
    .from('ai_command_logs')
    .insert({
      command,
      interpretation,
      execution,
      executed: execution.status === 'completed',
      dry_run: dryRun,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error logging command:', error);
    return null;
  }

  return data;
}

// ============================================================================
// PRICING ACTION IMPLEMENTATIONS
// ============================================================================

async function executePriceUpdate(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { filter, new_price, min_margin, max_margin } = interpretation.parameters;

  // Build query
  let query = supabase.from('products').select('id, title, cost_price');

  if (filter?.category) {
    query = query.eq('category', filter.category);
  }
  if (filter?.status) {
    query = query.eq('status', filter.status);
  }

  const { data: products, error } = await query;

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'query', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: products?.length || 0,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  // Execute updates
  const affected_items = [];
  const errors = [];

  for (const product of products || []) {
    try {
      const calculatedPrice = new_price || (product.cost_price * (1 + (min_margin || 0.3)));

      const { error: updateError } = await supabase
        .from('products')
        .update({ retail_price: calculatedPrice, updated_at: new Date().toISOString() })
        .eq('id', product.id);

      if (updateError) throw updateError;

      affected_items.push(product.id);
    } catch (err: any) {
      errors.push({ item: product.title, error: err.message });
    }
  }

  return {
    success_count: affected_items.length,
    error_count: errors.length,
    affected_items,
    errors,
  };
}

async function executePriceSync(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { source = 'amazon', limit = 50 } = interpretation.parameters;

  const { data: products, error } = await supabase
    .from('products')
    .select('id, asin, title')
    .eq('status', 'active')
    .limit(limit);

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'fetch', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: products?.length || 0,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  // In real implementation, would call Rainforest API
  const affected_items = (products || []).map(p => p.id);

  return {
    success_count: affected_items.length,
    error_count: 0,
    affected_items,
    errors: [],
  };
}

async function executeMarginRuleApplication(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { category, min_margin, target_margin, max_margin } = interpretation.parameters;

  let query = supabase.from('products').select('id, title, cost_price, retail_price');

  if (category) {
    query = query.eq('category', category);
  }

  const { data: products, error } = await query;

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'query', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: products?.length || 0,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  const affected_items = [];
  const errors = [];

  for (const product of products || []) {
    try {
      // Calculate new price with margin rule
      const costPrice = product.cost_price;
      const minPrice = costPrice * (1 + (min_margin || 0.25));
      const targetPrice = costPrice * (1 + (target_margin || 0.35));
      const maxPrice = costPrice * (1 + (max_margin || 0.5));

      const newPrice = Math.max(minPrice, Math.min(targetPrice, maxPrice));

      const { error: updateError } = await supabase
        .from('products')
        .update({ retail_price: newPrice, updated_at: new Date().toISOString() })
        .eq('id', product.id);

      if (updateError) throw updateError;

      affected_items.push(product.id);
    } catch (err: any) {
      errors.push({ item: product.title, error: err.message });
    }
  }

  return {
    success_count: affected_items.length,
    error_count: errors.length,
    affected_items,
    errors,
  };
}

async function executePriceAdjustment(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { percentage, filter } = interpretation.parameters;

  let query = supabase.from('products').select('id, title, retail_price');

  if (filter?.category) {
    query = query.eq('category', filter.category);
  }
  if (filter?.min_margin) {
    // Would need to calculate margin in real implementation
  }

  const { data: products, error } = await query;

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'query', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: products?.length || 0,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  const affected_items = [];
  const errors = [];
  const multiplier = 1 + (percentage || 0) / 100;

  for (const product of products || []) {
    try {
      const newPrice = product.retail_price * multiplier;

      const { error: updateError } = await supabase
        .from('products')
        .update({ retail_price: newPrice, updated_at: new Date().toISOString() })
        .eq('id', product.id);

      if (updateError) throw updateError;

      affected_items.push(product.id);
    } catch (err: any) {
      errors.push({ item: product.title, error: err.message });
    }
  }

  return {
    success_count: affected_items.length,
    error_count: errors.length,
    affected_items,
    errors,
  };
}

// ============================================================================
// PRODUCT ACTION IMPLEMENTATIONS
// ============================================================================

async function executeDescriptionGeneration(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { tone = 'professional', length = 'medium' } = interpretation.parameters;

  const { data: products, error } = await supabase
    .from('products')
    .select('id, title, category')
    .or('description.is.null,description.eq.""')
    .limit(50);

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'fetch', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: products?.length || 0,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  const affected_items = [];
  const errors = [];

  for (const product of products || []) {
    try {
      const prompt = `Generate a ${length} SEO-optimized product description in a ${tone} tone for: ${product.title} (Category: ${product.category})`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: length === 'short' ? 100 : length === 'medium' ? 200 : 300,
      });

      const description = response.choices[0].message.content;

      const { error: updateError } = await supabase
        .from('products')
        .update({ description, updated_at: new Date().toISOString() })
        .eq('id', product.id);

      if (updateError) throw updateError;

      affected_items.push(product.id);
    } catch (err: any) {
      errors.push({ item: product.title, error: err.message });
    }
  }

  return {
    success_count: affected_items.length,
    error_count: errors.length,
    affected_items,
    errors,
  };
}

async function executeTitleUpdate(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { style = 'seo', filter } = interpretation.parameters;

  let query = supabase.from('products').select('id, title, category');

  if (filter?.category) {
    query = query.eq('category', filter.category);
  }

  const { data: products, error } = await query.limit(50);

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'fetch', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: products?.length || 0,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  const affected_items = [];
  const errors = [];

  for (const product of products || []) {
    try {
      const prompt = `Optimize this product title for ${style}: "${product.title}". Return only the new title.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
      });

      const newTitle = response.choices[0].message.content?.trim() || product.title;

      const { error: updateError } = await supabase
        .from('products')
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq('id', product.id);

      if (updateError) throw updateError;

      affected_items.push(product.id);
    } catch (err: any) {
      errors.push({ item: product.title, error: err.message });
    }
  }

  return {
    success_count: affected_items.length,
    error_count: errors.length,
    affected_items,
    errors,
  };
}

async function executePauseProducts(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { filter } = interpretation.parameters;

  let query = supabase.from('products').select('id, title').eq('status', 'active');

  if (filter?.min_bsr) {
    // In real implementation, would filter by BSR
  }
  if (filter?.category) {
    query = query.eq('category', filter.category);
  }

  const { data: products, error } = await query;

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'query', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: products?.length || 0,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  const affected_items = [];
  const errors = [];

  for (const product of products || []) {
    try {
      const { error: updateError } = await supabase
        .from('products')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', product.id);

      if (updateError) throw updateError;

      affected_items.push(product.id);
    } catch (err: any) {
      errors.push({ item: product.title, error: err.message });
    }
  }

  return {
    success_count: affected_items.length,
    error_count: errors.length,
    affected_items,
    errors,
  };
}

async function executeActivateProducts(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { filter } = interpretation.parameters;

  let query = supabase.from('products').select('id, title').eq('status', 'paused');

  if (filter?.category) {
    query = query.eq('category', filter.category);
  }

  const { data: products, error } = await query;

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'query', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: products?.length || 0,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  const affected_items = [];
  const errors = [];

  for (const product of products || []) {
    try {
      const { error: updateError } = await supabase
        .from('products')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', product.id);

      if (updateError) throw updateError;

      affected_items.push(product.id);
    } catch (err: any) {
      errors.push({ item: product.title, error: err.message });
    }
  }

  return {
    success_count: affected_items.length,
    error_count: errors.length,
    affected_items,
    errors,
  };
}

// ============================================================================
// CONTENT ACTION IMPLEMENTATIONS
// ============================================================================

async function executeCreateSocialPosts(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { platforms = ['instagram'], filter } = interpretation.parameters;

  let query = supabase.from('products').select('id, title, image_url, retail_price').eq('status', 'active');

  if (filter?.top_n) {
    query = query.limit(filter.top_n);
  }

  const { data: products, error } = await query;

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'fetch', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: (products?.length || 0) * platforms.length,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  const affected_items = [];
  const errors = [];

  for (const product of products || []) {
    for (const platform of platforms) {
      try {
        const prompt = `Generate a social media post caption for ${platform} for this product: ${product.title} ($${product.retail_price}). Make it engaging with emojis and CTAs.`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
        });

        const caption = response.choices[0].message.content;

        const { error: insertError } = await supabase.from('social_posts').insert({
          product_id: product.id,
          platform,
          caption,
          image_url: product.image_url,
          status: 'draft',
          created_at: new Date().toISOString(),
        });

        if (insertError) throw insertError;

        affected_items.push(`${product.id}_${platform}`);
      } catch (err: any) {
        errors.push({ item: `${product.title} (${platform})`, error: err.message });
      }
    }
  }

  return {
    success_count: affected_items.length,
    error_count: errors.length,
    affected_items,
    errors,
  };
}

async function executeGenerateSeoContent(
  interpretation: CommandInterpretation,
  dryRun: boolean
): Promise<CommandExecution['results']> {
  const { filter } = interpretation.parameters;

  let query = supabase.from('products').select('id, title, category, description').eq('status', 'active');

  if (filter?.category) {
    query = query.eq('category', filter.category);
  }

  const { data: products, error } = await query.limit(50);

  if (error) {
    return {
      success_count: 0,
      error_count: 0,
      affected_items: [],
      errors: [{ item: 'fetch', error: error.message }],
    };
  }

  if (dryRun) {
    return {
      success_count: products?.length || 0,
      error_count: 0,
      affected_items: (products || []).map(p => p.id),
      errors: [],
    };
  }

  const affected_items = [];
  const errors = [];

  for (const product of products || []) {
    try {
      const prompt = `Generate SEO metadata for this product:
Title: ${product.title}
Category: ${product.category}
Description: ${product.description}

Return JSON with: meta_title (60 chars), meta_description (155 chars), keywords (5-7)`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      const seoData = JSON.parse(response.choices[0].message.content || '{}');

      const { error: updateError } = await supabase
        .from('products')
        .update({
          meta_title: seoData.meta_title,
          meta_description: seoData.meta_description,
          seo_keywords: seoData.keywords?.join(', '),
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      if (updateError) throw updateError;

      affected_items.push(product.id);
    } catch (err: any) {
      errors.push({ item: product.title, error: err.message });
    }
  }

  return {
    success_count: affected_items.length,
    error_count: errors.length,
    affected_items,
    errors,
  };
}

// ============================================================================
// COMMAND HISTORY & AUDIT
// ============================================================================

/**
 * Get recent command executions
 */
export async function getCommandHistory(limit: number = 20): Promise<AiCommandLog[]> {
  const { data, error } = await supabase
    .from('ai_command_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching command history:', error);
    return [];
  }

  return data || [];
}

/**
 * Get command statistics
 */
export async function getCommandStats(): Promise<{
  total_commands: number;
  successful: number;
  failed: number;
  total_items_affected: number;
  by_category: Record<string, number>;
  by_action: Record<string, number>;
}> {
  const { data, error } = await supabase
    .from('ai_command_logs')
    .select('*');

  if (error || !data) {
    return {
      total_commands: 0,
      successful: 0,
      failed: 0,
      total_items_affected: 0,
      by_category: {},
      by_action: {},
    };
  }

  const stats = {
    total_commands: data.length,
    successful: data.filter(d => d.executed && d.execution?.status === 'completed').length,
    failed: data.filter(d => d.execution?.status === 'failed').length,
    total_items_affected: data.reduce((sum: number, d: any) => {
      return sum + (d.execution?.results?.success_count || 0);
    }, 0),
    by_category: {} as Record<string, number>,
    by_action: {} as Record<string, number>,
  };

  for (const log of data) {
    const category = log.interpretation?.category;
    const action = log.interpretation?.action;

    if (category) {
      stats.by_category[category] = (stats.by_category[category] || 0) + 1;
    }
    if (action) {
      stats.by_action[action] = (stats.by_action[action] || 0) + 1;
    }
  }

  return stats;
}
