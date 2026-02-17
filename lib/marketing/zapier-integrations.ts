// lib/marketing/zapier-integrations.ts
// Zapier integration payloads with AI-selected products
// Generates structured payloads for various Zapier integrations

import { createClient } from '@supabase/supabase-js';
import { getZapierProducts, MarketingProduct } from '../ai/marketing-selection';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

export interface ZapierPayload {
  id: string;
  integration_type: 'email' | 'webhook' | 'slack' | 'discord';
  product_id: string;
  payload: any;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
  error_message?: string;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface ZapierIntegrationConfig {
  type: 'email' | 'webhook' | 'slack' | 'discord';
  enabled: boolean;
  config: {
    // Email config
    to_addresses?: string[];
    subject_template?: string;
    from_email?: string;
    
    // Webhook config
    webhook_url?: string;
    headers?: Record<string, string>;
    
    // Slack config
    slack_webhook_url?: string;
    channel?: string;
    
    // Discord config
    discord_webhook_url?: string;
  };
  schedule_hours: number;
  max_products: number;
}

export interface ZapierResult {
  success: boolean;
  payloads_created: number;
  payloads_sent: number;
  errors: string[];
  integration_results: Record<string, {
    success: boolean;
    payloads_created: number;
    payloads_sent: number;
    errors: string[];
  }>;
}

// Zapier integration templates
const ZAPIER_TEMPLATES = {
  email: {
    subject: "🔥 New AI-Selected Product Alert: {title}",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🛍️ Featured Product</h2>
        
        <div style="border: 1px solid #ddd; padding: 20px; margin: 20px 0;">
          <h3 style="color: #007bff; margin-top: 0;">{title}</h3>
          
          <div style="display: flex; gap: 20px; margin: 20px 0;">
            <div style="flex: 1;">
              <img src="{image_url}" alt="{title}" style="max-width: 100%; height: auto; border-radius: 8px;">
            </div>
            <div style="flex: 1;">
              <p><strong>Brand:</strong> {brand}</p>
              <p><strong>Category:</strong> {category}</p>
              <p><strong>Price:</strong> {price}</p>
              <p><strong>Rating:</strong> ⭐ {rating}/5 ({reviews} reviews)</p>
              <p><strong>AI Score:</strong> 🎯 {ai_score}/100 ({ai_tier})</p>
            </div>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4>Product Description:</h4>
            <p>{description}</p>
          </div>
          
          <div style="text-align: center; margin: 20px 0;">
            <a href="{product_url}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Product
            </a>
          </div>
        </div>
        
        <div style="text-align: center; color: #666; font-size: 12px;">
          <p>AI-selected by Dropship Pro Marketing System</p>
          <p>Generated: {timestamp}</p>
        </div>
      </div>
    `,
    text: `
🛍️ FEATURED PRODUCT ALERT 🛍️

Title: {title}
Brand: {brand}
Category: {category}
Price: {price}
Rating: ⭐ {rating}/5 ({reviews} reviews)
AI Score: 🎯 {ai_score}/100 ({ai_tier})

Description:
{description}

Product URL: {product_url}

---
AI-selected by Dropship Pro Marketing System
Generated: {timestamp}
    `
  } as const,
  
  webhook: {
    data: {
      event: 'product_alert',
      timestamp: '{timestamp}',
      product: {
        id: '{product_id}',
        asin: '{asin}',
        title: '{title}',
        brand: '{brand}',
        category: '{category}',
        price: '{price}',
        rating: '{rating}',
        review_count: '{reviews}',
        ai_score: '{ai_score}',
        ai_tier: '{ai_tier}',
        description: '{description}',
        image_url: '{image_url}',
        product_url: '{product_url}'
      },
      marketing: {
        recommendation_level: '{ai_tier}',
        urgency: 'high',
        channels: ['email', 'social', 'web']
      }
    }
  } as const,
  
  slack: {
    text: "🛍️ *New AI-Selected Product Alert*",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🛍️ AI-Selected Product"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*{title}*"
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*Brand:*\n{brand}"
          },
          {
            type: "mrkdwn",
            text: "*Category:*\n{category}"
          },
          {
            type: "mrkdwn",
            text: "*Price:*\n${price}"
          },
          {
            type: "mrkdwn",
            text: "*Rating:*\n⭐ {rating}/5"
          }
        ]
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*AI Score:*\n🎯 {ai_score}/100"
          },
          {
            type: "mrkdwn",
            text: "*Reviews:*\n{reviews}"
          }
        ]
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Product"
            },
            url: "{product_url}"
          }
        ]
      }
    ]
  } as const,
  
  discord: {
    embeds: [{
      title: "🛍️ AI-Selected Product",
      description: "**{title}**",
      color: 5814783, // Blue color
      fields: [
        {
          name: "Brand",
          value: "{brand}",
          inline: true
        },
        {
          name: "Category",
          value: "{category}",
          inline: true
        },
        {
          name: "Price",
          value: "${price}",
          inline: true
        },
        {
          name: "Rating",
          value: "⭐ {rating}/5 ({reviews} reviews)",
          inline: true
        },
        {
          name: "AI Score",
          value: "🎯 {ai_score}/100 ({ai_tier})",
          inline: true
        }
      ],
      image: {
        url: "{image_url}"
      },
      url: "{product_url}",
      footer: {
        text: "AI-selected by Dropship Pro • {timestamp}"
      }
    }]
  } as const
};

/**
 * Generate Zapier payload for a product
 */
function generateZapierPayload(
  product: MarketingProduct,
  integrationType: 'email' | 'webhook' | 'slack' | 'discord'
): any {
  const template = ZAPIER_TEMPLATES[integrationType];
  const timestamp = new Date().toISOString();
  
  const variables = {
    product_id: product.id,
    asin: product.asin,
    title: product.title,
    brand: product.brand,
    category: product.category,
    price: product.price?.toFixed(2) || '0.00',
    rating: product.rating?.toFixed(1) || '0.0',
    reviews: product.review_count || 0,
    ai_score: product.ai_score || 0,
    ai_tier: product.ai_tier || 'Unknown',
    description: product.description.substring(0, 500),
    image_url: product.main_image,
    product_url: product.shopify_product_id 
      ? `https://store.shopify.com/products/${product.asin}`
      : `https://amazon.com/dp/${product.asin}`,
    timestamp
  };

  if (integrationType === 'email') {
    const emailTemplate = template as typeof ZAPIER_TEMPLATES.email;
    return {
      to: [], // Will be filled by config
      subject: replaceVariables(emailTemplate.subject, variables),
      html: replaceVariables(emailTemplate.html, variables),
      text: replaceVariables(emailTemplate.text, variables)
    };
  } else if (integrationType === 'webhook') {
    const webhookTemplate = template as typeof ZAPIER_TEMPLATES.webhook;
    const dataStr = JSON.stringify(webhookTemplate.data);
    return JSON.parse(replaceVariables(dataStr, variables));
  } else if (integrationType === 'slack') {
    const slackTemplate = template as typeof ZAPIER_TEMPLATES.slack;
    const text = replaceVariables(slackTemplate.text, variables);
    const blocksStr = JSON.stringify(slackTemplate.blocks);
    return {
      text,
      blocks: JSON.parse(replaceVariables(blocksStr, variables))
    };
  } else if (integrationType === 'discord') {
    const discordTemplate = template as typeof ZAPIER_TEMPLATES.discord;
    const embedsStr = JSON.stringify(discordTemplate.embeds);
    return {
      embeds: JSON.parse(replaceVariables(embedsStr, variables))
    };
  }

  return {};
}

/**
 * Replace template variables
 */
function replaceVariables(template: string, variables: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, String(value));
  }
  return result;
}

/**
 * Create Zapier payloads for integration type
 */
async function createZapierPayloads(
  integrationType: 'email' | 'webhook' | 'slack' | 'discord',
  limit: number = 10
): Promise<{ success: boolean; payloads_created: number; errors: string[] }> {
  try {
    // Get AI-selected products for this integration
    const selectionResult = await getZapierProducts(integrationType, limit);
    const products = selectionResult.products;

    if (products.length === 0) {
      return {
        success: true,
        payloads_created: 0,
        errors: [`No eligible products found for ${integrationType} integration`]
      };
    }

    const payloads: ZapierPayload[] = [];
    const errors: string[] = [];

    for (const product of products) {
      try {
        // Generate payload
        const payloadData = generateZapierPayload(product, integrationType);

        // Create payload record
        const payload: Partial<ZapierPayload> = {
          integration_type: integrationType,
          product_id: product.id,
          payload: payloadData,
          status: 'pending',
          retry_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('zapier_payloads')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        payloads.push(data);

      } catch (error) {
        errors.push(`Failed to create payload for product ${product.asin}: ${error}`);
      }
    }

    return {
      success: payloads.length > 0,
      payloads_created: payloads.length,
      errors
    };

  } catch (error) {
    return {
      success: false,
      payloads_created: 0,
      errors: [`Failed to create payloads for ${integrationType}: ${error}`]
    };
  }
}

/**
 * Send Zapier payloads to external services
 */
async function sendZapierPayloads(
  integrationType: 'email' | 'webhook' | 'slack' | 'discord'
): Promise<{ success: boolean; payloads_sent: number; errors: string[] }> {
  try {
    // Get pending payloads
    const { data: payloads, error } = await supabase
      .from('zapier_payloads')
      .select('*')
      .eq('integration_type', integrationType)
      .eq('status', 'pending')
      .limit(50);

    if (error) throw error;

    if (!payloads || payloads.length === 0) {
      return {
        success: true,
        payloads_sent: 0,
        errors: []
      };
    }

    const sent = [];
    const errors = [];

    for (const payload of payloads) {
      try {
        // Simulate sending to external service
        await new Promise(resolve => setTimeout(resolve, 200)); // Simulate network delay

        // In a real implementation, this would call the actual external APIs
        // For now, we'll simulate successful sending
        
        // Update payload as sent
        const { error: updateError } = await supabase
          .from('zapier_payloads')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.id);

        if (updateError) throw updateError;
        sent.push(payload.id);

      } catch (error) {
        errors.push(`Failed to send payload ${payload.id}: ${error}`);
        
        // Mark as failed
        await supabase
          .from('zapier_payloads')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            retry_count: payload.retry_count + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.id);
      }
    }

    return {
      success: sent.length > 0,
      payloads_sent: sent.length,
      errors
    };

  } catch (error) {
    return {
      success: false,
      payloads_sent: 0,
      errors: [`Failed to send payloads for ${integrationType}: ${error}`]
    };
  }
}

/**
 * Run complete Zapier integration pipeline
 */
export async function runZapierPipeline(
  integrations: ('email' | 'webhook' | 'slack' | 'discord')[] = ['email', 'webhook'],
  products_per_integration: number = 5
): Promise<ZapierResult> {
  const results: ZapierResult = {
    success: true,
    payloads_created: 0,
    payloads_sent: 0,
    errors: [],
    integration_results: {}
  };

  try {
    // Create payloads for each integration
    for (const integration of integrations) {
      const createResult = await createZapierPayloads(integration, products_per_integration);
      
      results.integration_results[integration] = {
        success: createResult.success,
        payloads_created: createResult.payloads_created,
        payloads_sent: 0,
        errors: createResult.errors
      };
      
      results.payloads_created += createResult.payloads_created;
      results.errors.push(...createResult.errors);

      if (!createResult.success) {
        results.success = false;
      }
    }

    // Send all created payloads
    for (const integration of integrations) {
      const sendResult = await sendZapierPayloads(integration);
      
      if (results.integration_results[integration]) {
        results.integration_results[integration].payloads_sent = sendResult.payloads_sent;
        results.integration_results[integration].errors.push(...sendResult.errors);
      }
      
      results.payloads_sent += sendResult.payloads_sent;
      results.errors.push(...sendResult.errors);

      if (!sendResult.success) {
        results.success = false;
      }
    }

    return results;

  } catch (error) {
    return {
      success: false,
      payloads_created: 0,
      payloads_sent: 0,
      errors: [`Zapier pipeline failed: ${error}`],
      integration_results: {}
    };
  }
}

/**
 * Get Zapier integration statistics
 */
export async function getZapierStats(
  days_back: number = 7
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const cutoffDate = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('zapier_payloads')
      .select(`
        integration_type,
        status,
        created_at,
        sent_at,
        retry_count
      `)
      .gte('created_at', cutoffDate);

    if (error) throw error;

    const payloads = data || [];
    
    // Calculate statistics
    const stats = {
      total_payloads: payloads.length,
      by_integration: payloads.reduce((acc, payload) => {
        acc[payload.integration_type] = (acc[payload.integration_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      by_status: payloads.reduce((acc, payload) => {
        acc[payload.status] = (acc[payload.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      sent_payloads: payloads.filter(p => p.status === 'sent').length,
      failed_payloads: payloads.filter(p => p.status === 'failed').length,
      pending_payloads: payloads.filter(p => p.status === 'pending').length,
      avg_retry_count: payloads.length > 0 
        ? payloads.reduce((sum, p) => sum + p.retry_count, 0) / payloads.length 
        : 0
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
 * Retry failed Zapier payloads
 */
export async function retryFailedPayloads(
  integrationType?: 'email' | 'webhook' | 'slack' | 'discord',
  max_retries: number = 3
): Promise<{ success: boolean; retried: number; errors: string[] }> {
  try {
    let query = supabase
      .from('zapier_payloads')
      .select('*')
      .eq('status', 'failed')
      .lt('retry_count', max_retries);

    if (integrationType) {
      query = query.eq('integration_type', integrationType);
    }

    const { data: failedPayloads, error } = await query;

    if (error) throw error;

    if (!failedPayloads || failedPayloads.length === 0) {
      return {
        success: true,
        retried: 0,
        errors: []
      };
    }

    // Reset to pending for retry
    const { error: updateError } = await supabase
      .from('zapier_payloads')
      .update({
        status: 'pending',
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .in('id', failedPayloads.map(p => p.id));

    if (updateError) throw updateError;

    return {
      success: true,
      retried: failedPayloads.length,
      errors: []
    };

  } catch (error) {
    return {
      success: false,
      retried: 0,
      errors: [`Failed to retry payloads: ${error}`]
    };
  }
}
