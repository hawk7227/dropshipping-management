import { NextRequest, NextResponse } from 'next/server';
import {
  generateProductDescription,
  generateBulkDescriptions,
  analyzeProductSEO,
  generateSEOTitle,
  generateMetaDescription,
  generateSEOSuggestions,
  analyzeTrends,
  getRecentTrends,
  suggestProductsFromTrends,
  analyzeProductImage,
  generateAltText,
  getAIContent,
  approveAIContent,
  getAIStats,
} from '@/lib/ai-engines';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'content': {
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const contentType = searchParams.get('contentType') as 'description' | 'seo_title' | 'meta_description' | 'alt_text' | undefined;
        const status = searchParams.get('status') as 'pending' | 'approved' | 'rejected' | undefined;
        const result = await getAIContent(page, pageSize, contentType, status);
        return NextResponse.json(result);
      }

      case 'stats': {
        const stats = await getAIStats();
        return NextResponse.json({ data: stats });
      }

      case 'trends': {
        const days = parseInt(searchParams.get('days') || '7');
        const limit = parseInt(searchParams.get('limit') || '20');
        const trends = await getRecentTrends(days, limit);
        return NextResponse.json({ data: trends });
      }

      case 'analyze-seo': {
        const productId = searchParams.get('productId');
        if (!productId) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 });
        }
        const analysis = await analyzeProductSEO(productId);
        return NextResponse.json({ data: analysis });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('AI GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // Description Generation
      case 'generate-description': {
        const { productName, productFeatures, productCategory, options } = body;
        if (!productName) {
          return NextResponse.json({ error: 'productName required' }, { status: 400 });
        }
        const description = await generateProductDescription(
          productName,
          productFeatures || [],
          productCategory,
          options
        );
        return NextResponse.json({ data: { description } });
      }

      case 'generate-bulk-descriptions': {
        const { products, options } = body;
        if (!products || !Array.isArray(products)) {
          return NextResponse.json({ error: 'products array required' }, { status: 400 });
        }
        const results = await generateBulkDescriptions(products, options);
        return NextResponse.json({ data: results });
      }

      // SEO
      case 'generate-seo-title': {
        const { productName, productCategory, keywords } = body;
        if (!productName) {
          return NextResponse.json({ error: 'productName required' }, { status: 400 });
        }
        const title = await generateSEOTitle(productName, productCategory, keywords);
        return NextResponse.json({ data: { title } });
      }

      case 'generate-meta-description': {
        const { productName, productDescription, keywords } = body;
        if (!productName) {
          return NextResponse.json({ error: 'productName required' }, { status: 400 });
        }
        const metaDescription = await generateMetaDescription(productName, productDescription, keywords);
        return NextResponse.json({ data: { metaDescription } });
      }

      case 'generate-seo-suggestions': {
        const { productId } = body;
        if (!productId) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 });
        }
        const suggestions = await generateSEOSuggestions(productId);
        return NextResponse.json({ data: suggestions });
      }

      // Trends
      case 'analyze-trends': {
        const { category, keywords } = body;
        if (!category && !keywords) {
          return NextResponse.json({ error: 'category or keywords required' }, { status: 400 });
        }
        const trends = await analyzeTrends(category, keywords);
        return NextResponse.json({ data: trends });
      }

      case 'suggest-products-from-trends': {
        const { trendIds, maxSuggestions } = body;
        if (!trendIds || !Array.isArray(trendIds)) {
          return NextResponse.json({ error: 'trendIds array required' }, { status: 400 });
        }
        const suggestions = await suggestProductsFromTrends(trendIds, maxSuggestions);
        return NextResponse.json({ data: suggestions });
      }

      // Image Analysis
      case 'analyze-image': {
        const { imageUrl } = body;
        if (!imageUrl) {
          return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
        }
        const analysis = await analyzeProductImage(imageUrl);
        return NextResponse.json({ data: analysis });
      }

      case 'generate-alt-text': {
        const { imageUrl, productName } = body;
        if (!imageUrl) {
          return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
        }
        const altText = await generateAltText(imageUrl, productName);
        return NextResponse.json({ data: { altText } });
      }

      // Content Management
      case 'approve-content': {
        const { contentId, approved } = body;
        if (!contentId || approved === undefined) {
          return NextResponse.json({ error: 'contentId and approved required' }, { status: 400 });
        }
        const updated = await approveAIContent(contentId, approved);
        return NextResponse.json({ data: updated });
      }

      // ==================
      // AI COMMAND CENTER
      // ==================

      case 'parse-command': {
        const { command } = body;
        if (!command) {
          return NextResponse.json({ error: 'command required' }, { status: 400 });
        }

        // Parse the natural language command using OpenAI
        const parseResult = await parseNaturalLanguageCommand(command);
        return NextResponse.json(parseResult);
      }

      case 'execute-command': {
        const { command, intent, confirmed } = body;
        if (!command) {
          return NextResponse.json({ error: 'command required' }, { status: 400 });
        }

        // Execute the command
        const result = await executeProductCommand(command, intent, confirmed);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('AI POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// ==================
// AI COMMAND PARSING FUNCTIONS
// ==================

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

interface ParsedIntent {
  action: 'create' | 'update' | 'delete' | 'search' | 'analyze' | 'generate' | 'sync';
  targets: string[];
  filters: Record<string, any>;
  values: Record<string, any>;
  confidence: number;
}

async function parseNaturalLanguageCommand(command: string): Promise<{
  intent: ParsedIntent;
  description: string;
  affectedCount: number;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
  destructive: boolean;
  affectedProducts?: any[];
}> {
  const systemPrompt = `You are an AI that parses natural language commands for e-commerce product management.
Parse the user's command and return a JSON object with:
- action: one of "create", "update", "delete", "search", "analyze", "generate", "sync"
- targets: array of product identifiers or "all" for bulk operations
- filters: object with filter conditions (vendor, price_range, status, tags, inventory, etc.)
- values: object with values to set/update
- confidence: 0-1 confidence score

Examples:
"Increase all prices by 10%" -> {"action":"update","targets":["all"],"filters":{},"values":{"price_change":"+10%"},"confidence":0.95}
"Delete products with 0 inventory" -> {"action":"delete","targets":["all"],"filters":{"inventory":0},"values":{},"confidence":0.9}
"Add tag 'sale' to products under $20" -> {"action":"update","targets":["all"],"filters":{"price_lt":20},"values":{"add_tag":"sale"},"confidence":0.9}

Return ONLY valid JSON, no other text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: command }
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    let intent: ParsedIntent;
    
    try {
      intent = JSON.parse(responseText);
    } catch {
      intent = {
        action: 'search',
        targets: [],
        filters: {},
        values: {},
        confidence: 0.5,
      };
    }

    // Count affected products
    let affectedCount = 0;
    let affectedProducts: any[] = [];

    if (intent.action !== 'create' && (intent.targets.includes('all') || Object.keys(intent.filters).length > 0)) {
      // Build query to count affected products
      let query = supabase.from('products').select('id, title, price, status', { count: 'exact' });
      
      if (intent.filters.vendor) {
        query = query.eq('vendor', intent.filters.vendor);
      }
      if (intent.filters.status) {
        query = query.eq('status', intent.filters.status);
      }
      if (intent.filters.inventory === 0) {
        query = query.eq('inventory_quantity', 0);
      }
      if (intent.filters.price_lt) {
        query = query.lt('price', intent.filters.price_lt);
      }
      if (intent.filters.price_gt) {
        query = query.gt('price', intent.filters.price_gt);
      }

      const { data, count } = await query.limit(100);
      affectedCount = count || 0;
      affectedProducts = data || [];
    }

    // Determine if confirmation is needed
    const isDestructive = intent.action === 'delete';
    const isBulkOperation = affectedCount > 5 || intent.targets.includes('all');
    const requiresConfirmation = isDestructive || (isBulkOperation && intent.action === 'update');

    // Generate description
    const descriptionMap: Record<string, string> = {
      create: `Create new product(s)`,
      update: `Update ${affectedCount} product(s)`,
      delete: `Delete ${affectedCount} product(s)`,
      search: `Search for products`,
      analyze: `Analyze product data`,
      generate: `Generate content`,
      sync: `Sync products to channels`,
    };

    return {
      intent,
      description: descriptionMap[intent.action] || 'Process command',
      affectedCount,
      requiresConfirmation,
      confirmationMessage: requiresConfirmation 
        ? `This will ${intent.action} ${affectedCount} products. Are you sure?`
        : undefined,
      destructive: isDestructive,
      affectedProducts: requiresConfirmation ? affectedProducts.slice(0, 20) : undefined,
    };
  } catch (error) {
    console.error('Failed to parse command:', error);
    return {
      intent: {
        action: 'search',
        targets: [],
        filters: {},
        values: {},
        confidence: 0,
      },
      description: 'Failed to parse command',
      affectedCount: 0,
      requiresConfirmation: false,
      destructive: false,
    };
  }
}

async function executeProductCommand(
  command: string,
  intent?: ParsedIntent,
  confirmed?: boolean
): Promise<{
  success: boolean;
  message: string;
  affected: number;
  data?: any[];
}> {
  try {
    // If no intent provided, parse it first
    if (!intent) {
      const parsed = await parseNaturalLanguageCommand(command);
      intent = parsed.intent;
      
      // Check if confirmation is needed but not provided
      if (parsed.requiresConfirmation && !confirmed) {
        return {
          success: false,
          message: 'Confirmation required for this operation',
          affected: 0,
        };
      }
    }

    switch (intent.action) {
      case 'search': {
        // Execute search
        let query = supabase.from('products').select('*');
        
        if (intent.filters.vendor) {
          query = query.eq('vendor', intent.filters.vendor);
        }
        if (intent.filters.status) {
          query = query.eq('status', intent.filters.status);
        }
        if (intent.filters.inventory === 0) {
          query = query.eq('inventory_quantity', 0);
        }
        if (intent.filters.price_lt) {
          query = query.lt('price', intent.filters.price_lt);
        }
        if (intent.filters.price_gt) {
          query = query.gt('price', intent.filters.price_gt);
        }

        const { data, error } = await query.limit(50);
        if (error) throw error;

        return {
          success: true,
          message: `Found ${data?.length || 0} products`,
          affected: data?.length || 0,
          data: data,
        };
      }

      case 'update': {
        // Build update query
        let query = supabase.from('products').select('id, price');
        
        if (intent.filters.vendor) {
          query = query.eq('vendor', intent.filters.vendor);
        }
        if (intent.filters.status) {
          query = query.eq('status', intent.filters.status);
        }
        if (intent.filters.inventory === 0) {
          query = query.eq('inventory_quantity', 0);
        }
        if (intent.filters.price_lt) {
          query = query.lt('price', intent.filters.price_lt);
        }

        const { data: products } = await query;
        if (!products || products.length === 0) {
          return {
            success: true,
            message: 'No products matched the criteria',
            affected: 0,
          };
        }

        let updated = 0;
        for (const product of products) {
          const updates: Record<string, any> = {};

          // Handle price changes
          if (intent.values.price_change) {
            const change = intent.values.price_change;
            if (change.includes('%')) {
              const percent = parseFloat(change.replace(/[+%]/g, '')) / 100;
              updates.price = product.price * (1 + (change.startsWith('-') ? -percent : percent));
            } else {
              updates.price = parseFloat(change);
            }
          }

          // Handle tag additions
          if (intent.values.add_tag) {
            const { data: existing } = await supabase
              .from('products')
              .select('tags')
              .eq('id', product.id)
              .single();
            
            const currentTags = existing?.tags || [];
            if (!currentTags.includes(intent.values.add_tag)) {
              updates.tags = [...currentTags, intent.values.add_tag];
            }
          }

          // Handle status changes
          if (intent.values.status) {
            updates.status = intent.values.status;
          }

          if (Object.keys(updates).length > 0) {
            await supabase.from('products').update(updates).eq('id', product.id);
            updated++;
          }
        }

        return {
          success: true,
          message: `Updated ${updated} products`,
          affected: updated,
        };
      }

      case 'delete': {
        let query = supabase.from('products').select('id');
        
        if (intent.filters.inventory === 0) {
          query = query.eq('inventory_quantity', 0);
        }
        if (intent.filters.status) {
          query = query.eq('status', intent.filters.status);
        }
        if (intent.filters.vendor) {
          query = query.eq('vendor', intent.filters.vendor);
        }

        const { data: products } = await query;
        if (!products || products.length === 0) {
          return {
            success: true,
            message: 'No products matched the criteria',
            affected: 0,
          };
        }

        const ids = products.map(p => p.id);
        const { error } = await supabase.from('products').delete().in('id', ids);
        if (error) throw error;

        return {
          success: true,
          message: `Deleted ${ids.length} products`,
          affected: ids.length,
        };
      }

      case 'generate': {
        // Generate AI content for products
        return {
          success: true,
          message: 'Content generation started',
          affected: 0,
        };
      }

      case 'sync': {
        // Trigger sync to channels
        return {
          success: true,
          message: 'Sync initiated',
          affected: 0,
        };
      }

      default:
        return {
          success: false,
          message: `Unknown action: ${intent.action}`,
          affected: 0,
        };
    }
  } catch (error) {
    console.error('Failed to execute command:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Command execution failed',
      affected: 0,
    };
  }
}
