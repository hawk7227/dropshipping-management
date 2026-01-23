// lib/social-marketing.ts
// Multi-platform social media marketing with AI-generated content

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface PostParams {
  product_id?: string;
  product?: any;
  caption?: string;
  ai_caption?: boolean;
  image_url?: string;
  video_url?: string;
  schedule?: string; // ISO datetime
  hashtags?: string[];
}

interface PostResult {
  platform: string;
  success: boolean;
  post_id?: string;
  url?: string;
  error?: string;
}

/**
 * Generate AI caption for product post
 */
export async function generateCaption(
  product: any,
  platform: 'instagram' | 'facebook' | 'tiktok' | 'twitter',
  style: 'promotional' | 'lifestyle' | 'educational' = 'promotional'
): Promise<{ caption: string; hashtags: string[] }> {
  
  const platformLimits: Record<string, number> = {
    instagram: 2200,
    facebook: 63206,
    tiktok: 300,
    twitter: 280
  };

  const maxLength = platformLimits[platform] || 500;

  const prompt = `Generate a ${platform} post caption for this product:
  
Product: ${product.title}
Price: $${product.price}
Description: ${product.description || 'N/A'}

Style: ${style}
Max length: ${maxLength} characters (including hashtags)

Requirements:
- ${platform === 'instagram' ? 'Include emoji sparingly, hook in first line, call to action' : ''}
- ${platform === 'facebook' ? 'Conversational tone, ask a question, include CTA' : ''}
- ${platform === 'tiktok' ? 'Trendy, casual, include trending sounds reference if applicable' : ''}
- ${platform === 'twitter' ? 'Concise, witty, include 2-3 hashtags max' : ''}

Respond in JSON:
{
  "caption": "Your caption here",
  "hashtags": ["tag1", "tag2", "tag3"]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.8
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}

/**
 * Post to Instagram via Meta Graph API
 */
async function postToInstagram(params: PostParams): Promise<PostResult> {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_PAGE_ID) {
    return { platform: 'instagram', success: false, error: 'Meta credentials not configured' };
  }

  try {
    // Generate caption if needed
    let caption = params.caption || '';
    if (params.ai_caption && params.product) {
      const generated = await generateCaption(params.product, 'instagram');
      caption = `${generated.caption}\n\n${generated.hashtags.map(t => '#' + t).join(' ')}`;
    }

    const imageUrl = params.image_url || params.product?.images?.[0]?.src;
    if (!imageUrl) {
      return { platform: 'instagram', success: false, error: 'No image provided' };
    }

    // Step 1: Create container
    const containerResponse = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.META_PAGE_ID}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption,
          access_token: process.env.META_ACCESS_TOKEN
        })
      }
    );

    const container = await containerResponse.json();
    if (container.error) {
      return { platform: 'instagram', success: false, error: container.error.message };
    }

    // Step 2: Publish
    const publishResponse = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.META_PAGE_ID}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: process.env.META_ACCESS_TOKEN
        })
      }
    );

    const published = await publishResponse.json();
    if (published.error) {
      return { platform: 'instagram', success: false, error: published.error.message };
    }

    return {
      platform: 'instagram',
      success: true,
      post_id: published.id,
      url: `https://instagram.com/p/${published.id}`
    };

  } catch (error: any) {
    return { platform: 'instagram', success: false, error: error.message };
  }
}

/**
 * Post to Facebook Page
 */
async function postToFacebook(params: PostParams): Promise<PostResult> {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_PAGE_ID) {
    return { platform: 'facebook', success: false, error: 'Meta credentials not configured' };
  }

  try {
    let message = params.caption || '';
    if (params.ai_caption && params.product) {
      const generated = await generateCaption(params.product, 'facebook');
      message = `${generated.caption}\n\n${generated.hashtags.map(t => '#' + t).join(' ')}`;
    }

    const imageUrl = params.image_url || params.product?.images?.[0]?.src;
    
    // Post with or without image
    const endpoint = imageUrl 
      ? `https://graph.facebook.com/v18.0/${process.env.META_PAGE_ID}/photos`
      : `https://graph.facebook.com/v18.0/${process.env.META_PAGE_ID}/feed`;

    const body: any = {
      message,
      access_token: process.env.META_ACCESS_TOKEN
    };
    
    if (imageUrl) {
      body.url = imageUrl;
    }

    if (params.schedule) {
      body.published = false;
      body.scheduled_publish_time = Math.floor(new Date(params.schedule).getTime() / 1000);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    if (result.error) {
      return { platform: 'facebook', success: false, error: result.error.message };
    }

    return {
      platform: 'facebook',
      success: true,
      post_id: result.id || result.post_id,
      url: `https://facebook.com/${result.id || result.post_id}`
    };

  } catch (error: any) {
    return { platform: 'facebook', success: false, error: error.message };
  }
}

/**
 * Post to TikTok
 */
async function postToTikTok(params: PostParams): Promise<PostResult> {
  if (!process.env.TIKTOK_ACCESS_TOKEN) {
    return { platform: 'tiktok', success: false, error: 'TikTok credentials not configured' };
  }

  // TikTok requires video content
  if (!params.video_url) {
    return { platform: 'tiktok', success: false, error: 'TikTok requires video content' };
  }

  try {
    let caption = params.caption || '';
    if (params.ai_caption && params.product) {
      const generated = await generateCaption(params.product, 'tiktok');
      caption = `${generated.caption} ${generated.hashtags.map(t => '#' + t).join(' ')}`;
    }

    // TikTok API v2 - Content Posting
    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        post_info: {
          title: caption.substring(0, 300),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: params.video_url
        }
      })
    });

    const result = await response.json();
    if (result.error?.code) {
      return { platform: 'tiktok', success: false, error: result.error.message };
    }

    return {
      platform: 'tiktok',
      success: true,
      post_id: result.data?.publish_id
    };

  } catch (error: any) {
    return { platform: 'tiktok', success: false, error: error.message };
  }
}

/**
 * Main entry point - post to specified platform
 */
export async function postToSocial(
  platform: string,
  params: PostParams
): Promise<PostResult> {
  switch (platform) {
    case 'instagram':
      return await postToInstagram(params);
    case 'facebook':
      return await postToFacebook(params);
    case 'tiktok':
      return await postToTikTok(params);
    default:
      return { platform, success: false, error: `Unknown platform: ${platform}` };
  }
}

/**
 * Schedule posts across multiple platforms
 */
export async function schedulePost(params: {
  products: any[];
  platforms: string[];
  schedule: string;
  ai_caption?: boolean;
}): Promise<{
  scheduled: number;
  results: PostResult[];
}> {
  const results: PostResult[] = [];

  for (const product of params.products) {
    for (const platform of params.platforms) {
      const result = await postToSocial(platform, {
        product,
        ai_caption: params.ai_caption ?? true,
        schedule: params.schedule,
        image_url: product.images?.[0]?.src
      });
      results.push(result);
    }
  }

  return {
    scheduled: results.filter(r => r.success).length,
    results
  };
}

/**
 * Get posting schedule recommendations
 */
export function getOptimalPostTimes(platform: string, timezone: string = 'America/New_York'): string[] {
  // Based on general social media best practices
  const times: Record<string, string[]> = {
    instagram: ['11:00', '14:00', '19:00'],
    facebook: ['09:00', '13:00', '16:00'],
    tiktok: ['07:00', '12:00', '19:00', '22:00'],
    twitter: ['08:00', '12:00', '17:00']
  };

  return times[platform] || ['12:00', '18:00'];
}
