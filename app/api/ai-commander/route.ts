// app/api/ai-commander/route.ts
// Simplified AI Commander - natural language commands
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, dryRun = false } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Use AI to understand the command
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant for an e-commerce store. Analyze the user's command and respond with a JSON object containing:
- action: the type of action (e.g., "generate_content", "analyze_prices", "create_post", "unknown")
- description: what you would do
- parameters: any extracted parameters
Always respond with valid JSON only.`
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    return NextResponse.json({
      success: true,
      dryRun,
      command: prompt,
      interpretation: result,
      message: dryRun ? 'Dry run - no actions taken' : 'Command processed'
    });

  } catch (error: any) {
    console.error('AI Commander error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'AI Commander',
    description: 'Natural language interface for store commands',
    examples: [
      'Generate a social post for my best selling product',
      'What are my top performing posts this week?',
      'Create content for Instagram about summer sales'
    ]
  });
}
