// app/api/ai-commander/full/route.ts
// Complete AI Command Center API with command execution and history

import { NextRequest, NextResponse } from 'next/server';
import {
  interpretCommand,
  executeCommand,
  logCommandExecution,
  getCommandHistory,
  getCommandStats,
} from '@/lib/services/ai-commander-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const { command, dryRun = true } = await request.json();

    if (!command) {
      return NextResponse.json(
        { error: 'Command is required' },
        { status: 400 }
      );
    }

    switch (action) {
      // ============================================================
      // INTERPRET COMMAND (dry run)
      // ============================================================
      case 'interpret': {
        const interpretation = await interpretCommand(command);
        return NextResponse.json({ success: true, interpretation });
      }

      // ============================================================
      // EXECUTE COMMAND
      // ============================================================
      case 'execute': {
        const interpretation = await interpretCommand(command);
        const execution = await executeCommand(interpretation, dryRun);

        // Log execution
        await logCommandExecution(command, interpretation, execution, dryRun);

        return NextResponse.json({
          success: true,
          command,
          interpretation,
          execution,
          dryRun,
        });
      }

      // ============================================================
      // EXECUTE & CONFIRM (first interpret, then confirm execution)
      // ============================================================
      case 'execute-confirm': {
        const interpretation = await interpretCommand(command);
        const execution = await executeCommand(interpretation, false); // Not a dry run

        // Log execution
        await logCommandExecution(command, interpretation, execution, false);

        return NextResponse.json({
          success: true,
          command,
          interpretation,
          execution,
          dryRun: false,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('AI Commander error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      // ============================================================
      // GET HISTORY
      // ============================================================
      case 'history': {
        const limit = parseInt(searchParams.get('limit') || '20');
        const history = await getCommandHistory(limit);
        return NextResponse.json({ success: true, data: history });
      }

      // ============================================================
      // GET STATS
      // ============================================================
      case 'stats': {
        const stats = await getCommandStats();
        return NextResponse.json({ success: true, data: stats });
      }

      // ============================================================
      // GET EXAMPLES
      // ============================================================
      case 'examples': {
        return NextResponse.json({
          success: true,
          examples: [
            {
              command: 'Update all product prices to be 15% cheaper than Amazon',
              category: 'pricing',
              action: 'update_prices',
            },
            {
              command: 'Generate AI descriptions for products missing them',
              category: 'products',
              action: 'generate_descriptions',
            },
            {
              command: 'Apply 35% margin rule to all kitchen products',
              category: 'pricing',
              action: 'apply_margin_rule',
            },
            {
              command: 'Create social posts for the top 10 best selling products',
              category: 'content',
              action: 'create_social_posts',
            },
            {
              command: 'Sync competitor prices from Amazon',
              category: 'pricing',
              action: 'sync_prices',
            },
            {
              command: 'Pause products with margin below 20%',
              category: 'products',
              action: 'pause_products',
            },
            {
              command: 'Generate SEO content for all active products',
              category: 'content',
              action: 'generate_seo_content',
            },
            {
              command: 'Increase prices by 5% for low-demand items',
              category: 'pricing',
              action: 'adjust_prices_by_percentage',
            },
          ],
        });
      }

      default:
        return NextResponse.json(
          { success: true, message: 'AI Commander API' },
          { status: 200 }
        );
    }
  } catch (error: any) {
    console.error('AI Commander GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
