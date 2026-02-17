// lib/marketing/social-posting.ts
// Social media posting pipeline with templated content
// Uses AI-selected products for social media marketing

import { createClient } from '@supabase/supabase-js';
import { getSocialMediaProducts, MarketingProduct } from '../ai/marketing-selection';

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

export interface SocialPost {
  id: string;
  platform: 'instagram' | 'facebook' | 'twitter' | 'tiktok';
  product_id: string;
  content: string;
  image_url?: string;
  hashtags: string[];
  scheduled_at?: string;
  published_at?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface SocialPostTemplate {
  platform: 'instagram' | 'facebook' | 'twitter' | 'tiktok';
  template: string;
  hashtags: string[];
  character_limit: number;
  image_required: boolean;
}

export interface SocialPostingResult {
  success: boolean;
  posts_created: number;
  posts_scheduled: number;
  errors: string[];
  platform_results: Record<string, {
    success: boolean;
    posts_created: number;
    errors: string[];
  }>;
}

// Social media post templates (no LLM generation - templated only)
const SOCIAL_TEMPLATES: SocialPostTemplate[] = [
  {
    platform: 'instagram',
    template: "🔥 HOT DEAL ALERT! 🔥\n\n{title}\n\n⭐ {rating}/5 stars ({reviews} reviews)\n💰 ${price}\n\n{description}\n\n🛒 Shop now via link in bio!\n\n#dropshipping #deals #{category} #{brand}",
    hashtags: ['dropshipping', 'deals', 'shopping', 'onlineshopping'],
    character_limit: 2200,
    image_required: true
  },
  {
    platform: 'facebook',
    template: "🛍️ FEATURED PRODUCT 🛍️\n\n{title}\n\n✨ Rating: {rating}/5 stars ({reviews} reviews)\n💵 Price: ${price}\n\n{description}\n\n🎯 Perfect for anyone looking for quality {category} products!\n\n👉 Click the link to purchase: {shopify_url}\n\n#shopping #deals #{brand} #{category}",
    hashtags: ['shopping', 'deals', 'products', 'reviews'],
    character_limit: 8000,
    image_required: true
  },
  {
    platform: 'twitter',
    template: "🔥 {title} - Only ${price}! ⭐ {rating}/5 ({reviews} reviews)\n\n{short_description}\n\n🛒 Shop now: {shopify_url}\n\n#{category} #{brand} #deals",
    hashtags: ['deals', 'shopping', 'products'],
    character_limit: 280,
    image_required: false
  },
  {
    platform: 'tiktok',
    template: "✨ TRENDING PRODUCT ALERT! ✨\n\n{title}\n\n💰 ${price}\n⭐ {rating}/5 stars\n\nPerfect for {category} lovers! 🎯\n\n#tiktokmademebuyit #shopping #deals #{brand} #{category}",
    hashtags: ['tiktokmademebuyit', 'shopping', 'deals', 'products'],
    character_limit: 150,
    image_required: true
  }
];

/**
 * Generate social media post content from template
 */
function generatePostContent(
  product: MarketingProduct,
  template: SocialPostTemplate
): { content: string; hashtags: string[] } {
  const { title, brand, category, description, rating, review_count, price } = product;
  
  // Truncate description for character limits
  const maxDescLength = Math.floor(template.character_limit * 0.3);
  const shortDescription = description.length > maxDescLength 
    ? description.substring(0, maxDescLength) + "..."
    : description;

  // Replace template variables
  let content = template.template
    .replace(/{title}/g, title)
    .replace(/{brand}/g, brand)
    .replace(/{category}/g, category)
    .replace(/{description}/g, description)
    .replace(/{short_description}/g, shortDescription)
    .replace(/{rating}/g, (rating || 0).toString())
    .replace(/{reviews}/g, (review_count || 0).toString())
    .replace(/{price}/g, price ? `$${price.toFixed(2)}` : 'Price not available')
    .replace(/{shopify_url}/g, product.shopify_product_id 
      ? `https://store.shopify.com/products/${product.asin}` 
      : 'Link in bio');

  // Add hashtags
  const hashtags = [...template.hashtags];
  if (brand && !hashtags.includes(brand.toLowerCase())) {
    hashtags.push(brand.toLowerCase());
  }
  if (category) {
    const categoryTags = category.toLowerCase().split(' ').map(tag => tag.replace(/[^a-z0-9]/g, ''));
    hashtags.push(...categoryTags);
  }

  return { content, hashtags };
}

/**
 * Create social media posts for a platform
 */
async function createPostsForPlatform(
  platform: 'instagram' | 'facebook' | 'twitter' | 'tiktok',
  limit: number = 5
): Promise<{ success: boolean; posts_created: number; errors: string[] }> {
  try {
    // Get AI-selected products for this platform
    const selectionResult = await getSocialMediaProducts(platform, limit);
    const products = selectionResult.products;

    if (products.length === 0) {
      return {
        success: true,
        posts_created: 0,
        errors: [`No eligible products found for ${platform}`]
      };
    }

    const template = SOCIAL_TEMPLATES.find(t => t.platform === platform);
    if (!template) {
      return {
        success: false,
        posts_created: 0,
        errors: [`No template found for platform: ${platform}`]
      };
    }

    const posts: SocialPost[] = [];
    const errors: string[] = [];

    for (const product of products) {
      try {
        // Check if image is required and available
        if (template.image_required && !product.main_image) {
          errors.push(`Product ${product.asin} missing required image for ${platform}`);
          continue;
        }

        // Generate content
        const { content, hashtags } = generatePostContent(product, template);

        // Create post record
        const postData: Partial<SocialPost> = {
          platform,
          product_id: product.id,
          content,
          image_url: product.main_image,
          hashtags,
          status: 'draft',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('social_posts')
          .insert(postData)
          .select()
          .single();

        if (error) throw error;
        posts.push(data);

      } catch (error) {
        errors.push(`Failed to create post for product ${product.asin}: ${error}`);
      }
    }

    return {
      success: posts.length > 0,
      posts_created: posts.length,
      errors
    };

  } catch (error) {
    return {
      success: false,
      posts_created: 0,
      errors: [`Failed to create posts for ${platform}: ${error}`]
    };
  }
}

/**
 * Schedule social media posts for publishing
 */
export async function scheduleSocialPosts(
  platform?: 'instagram' | 'facebook' | 'twitter' | 'tiktok',
  schedule_hours_ahead: number = 24
): Promise<{ success: boolean; posts_scheduled: number; errors: string[] }> {
  try {
    let query = supabase
      .from('social_posts')
      .select('*')
      .eq('status', 'draft');

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: posts, error } = await query;

    if (error) throw error;

    if (!posts || posts.length === 0) {
      return {
        success: true,
        posts_scheduled: 0,
        errors: []
      };
    }

    // Schedule posts evenly over the next few hours
    const now = new Date();
    const intervalMs = (schedule_hours_ahead * 60 * 60 * 1000) / posts.length;

    const updates = posts.map((post, index) => {
      const scheduledTime = new Date(now.getTime() + (index * intervalMs));
      return supabase
        .from('social_posts')
        .update({
          scheduled_at: scheduledTime.toISOString(),
          status: 'scheduled',
          updated_at: new Date().toISOString()
        })
        .eq('id', post.id);
    });

    await Promise.all(updates);

    return {
      success: true,
      posts_scheduled: posts.length,
      errors: []
    };

  } catch (error) {
    return {
      success: false,
      posts_scheduled: 0,
      errors: [`Failed to schedule posts: ${error}`]
    };
  }
}

/**
 * Run complete social posting pipeline
 */
export async function runSocialPostingPipeline(
  platforms: ('instagram' | 'facebook' | 'twitter' | 'tiktok')[] = ['instagram', 'facebook', 'twitter'],
  posts_per_platform: number = 3
): Promise<SocialPostingResult> {
  const results: SocialPostingResult = {
    success: true,
    posts_created: 0,
    posts_scheduled: 0,
    errors: [],
    platform_results: {}
  };

  try {
    // Create posts for each platform
    for (const platform of platforms) {
      const platformResult = await createPostsForPlatform(platform, posts_per_platform);
      
      results.platform_results[platform] = platformResult;
      results.posts_created += platformResult.posts_created;
      results.errors.push(...platformResult.errors);

      if (!platformResult.success) {
        results.success = false;
      }
    }

    // Schedule all created posts
    if (results.posts_created > 0) {
      const scheduleResult = await scheduleSocialPosts();
      results.posts_scheduled = scheduleResult.posts_scheduled;
      results.errors.push(...scheduleResult.errors);

      if (!scheduleResult.success) {
        results.success = false;
      }
    }

    return results;

  } catch (error) {
    return {
      success: false,
      posts_created: 0,
      posts_scheduled: 0,
      errors: [`Pipeline failed: ${error}`],
      platform_results: {}
    };
  }
}

/**
 * Get social media posting statistics
 */
export async function getSocialPostingStats(
  days_back: number = 7
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const cutoffDate = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('social_posts')
      .select(`
        platform,
        status,
        created_at,
        published_at,
        engagement
      `)
      .gte('created_at', cutoffDate);

    if (error) throw error;

    const posts = data || [];
    
    // Calculate statistics
    const stats = {
      total_posts: posts.length,
      by_platform: posts.reduce((acc, post) => {
        acc[post.platform] = (acc[post.platform] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      by_status: posts.reduce((acc, post) => {
        acc[post.status] = (acc[post.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      engagement: {
        total_likes: posts.reduce((sum, post) => sum + (post.engagement?.likes || 0), 0),
        total_comments: posts.reduce((sum, post) => sum + (post.engagement?.comments || 0), 0),
        total_shares: posts.reduce((sum, post) => sum + (post.engagement?.shares || 0), 0),
        total_views: posts.reduce((sum, post) => sum + (post.engagement?.views || 0), 0)
      },
      published_posts: posts.filter(p => p.status === 'published').length,
      scheduled_posts: posts.filter(p => p.status === 'scheduled').length,
      failed_posts: posts.filter(p => p.status === 'failed').length
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
 * Publish scheduled posts (would be called by external service)
 */
export async function publishScheduledPosts(): Promise<{ success: boolean; published: number; errors: string[] }> {
  try {
    const now = new Date().toISOString();

    const { data: scheduledPosts, error } = await supabase
      .from('social_posts')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now);

    if (error) throw error;

    if (!scheduledPosts || scheduledPosts.length === 0) {
      return {
        success: true,
        published: 0,
        errors: []
      };
    }

    const published = [];
    const errors = [];

    // In a real implementation, this would call the actual social media APIs
    // For now, we'll simulate publishing
    for (const post of scheduledPosts) {
      try {
        // Simulate API call to social media platform
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay

        // Update post as published
        const { error: updateError } = await supabase
          .from('social_posts')
          .update({
            status: 'published',
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', post.id);

        if (updateError) throw updateError;
        published.push(post.id);

      } catch (error) {
        errors.push(`Failed to publish post ${post.id}: ${error}`);
        
        // Mark as failed
        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString()
          })
          .eq('id', post.id);
      }
    }

    return {
      success: published.length > 0,
      published: published.length,
      errors
    };

  } catch (error) {
    return {
      success: false,
      published: 0,
      errors: [`Failed to publish scheduled posts: ${error}`]
    };
  }
}
