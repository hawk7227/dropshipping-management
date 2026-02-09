import { z } from 'zod';

// Base schemas for common fields
const ImageSchema = z.object({
  link: z.string(),
  variant: z.string().optional(),
});

const CategorySchema = z.object({
  name: z.string(),
  link: z.string(),
  category_id: z.string(),
});

const RatingBreakdownSchema = z.object({
  five_star: z.object({
    percentage: z.number(),
    count: z.number(),
  }),
  four_star: z.object({
    percentage: z.number(),
    count: z.number(),
  }),
  three_star: z.object({
    percentage: z.number(),
    count: z.number(),
  }),
  two_star: z.object({
    percentage: z.number(),
    count: z.number(),
  }),
  one_star: z.object({
    percentage: z.number(),
    count: z.number(),
  }),
});

const VideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  profile_image_url: z.string(),
  profile_link: z.string(),
  public_name: z.string(),
  creator_type: z.string(),
  vendor_code: z.string(),
  vendor_name: z.string(),
  vendor_tracking_id: z.string(),
  video_image_id: z.string(),
  video_image_url: z.string(),
  video_image_url_unchanged: z.string(),
  video_image_width: z.string(),
  video_image_height: z.string(),
  video_image_extension: z.string(),
  video_url: z.string(),
  video_previews: z.string(),
  video_mime_type: z.string(),
  duration: z.string(),
  closed_captions: z.string(),
  type: z.string(),
  related_products: z.string().optional(),
  product_asin: z.string().optional(),
  parent_asin: z.string().optional(),
});

// Rainforest Import Product Response Schema
export const RainforestImportProductSchema = z.object({
  title: z.string(),
  search_alias: z.object({
    title: z.string(),
    value: z.string(),
  }),
  title_excluding_variant_name: z.string(),
  keywords: z.string(),
  keywords_list: z.array(z.string()),
  is_collection: z.boolean(),
  asin: z.string(),
  parent_asin: z.string(),
  gtin: z.string(),
  link: z.string(),
  brand: z.string(),
  sell_on_amazon: z.boolean(),
  variants: z.array(z.object({
    is_current_product: z.boolean(),
    title: z.string(),
    dimensions: z.array(z.any()).optional(),
    asin: z.string(),
    link: z.string(),
  })),
  variant_asins_flat: z.string(),
  proposition_65_warning: z.boolean(),
  has_size_guide: z.boolean(),
  categories: z.array(CategorySchema),
  categories_flat: z.string(),
  description: z.string(),
  a_plus_content: z.object({
    has_a_plus_content: z.boolean(),
    has_brand_story: z.boolean(),
    brand_story: z.object({
      hero_image: z.string(),
      brand_store: z.any(),
      images: z.array(z.any()),
    }).optional(),
    third_party: z.boolean(),
  }),
  sub_title: z.object({
    text: z.string(),
    link: z.string(),
  }),
  amazons_choice: z.object({
    link: z.string(),
    badge_text: z.string(),
  }),
  rating: z.number(),
  rating_breakdown: RatingBreakdownSchema,
  ratings_total: z.number(),
  main_image: z.object({
    link: z.string(),
  }),
  images: z.array(ImageSchema),
  images_count: z.number(),
  images_flat: z.string(),
  videos_count: z.number(),
  videos_additional: z.array(VideoSchema),
  has_360_view: z.boolean(),
  is_bundle: z.boolean(),
  feature_bullets: z.array(z.string()),
  feature_bullets_count: z.number(),
  feature_bullets_flat: z.string(),
  important_information: z.object({
    sections: z.array(z.any()),
  }),
  top_reviews: z.array(z.any()),
});

// Rainforest Price Sync Response Schema
export const RainforestPriceSyncSchema = z.object({
  request_info: z.object({
    success: z.boolean(),
    credits_used: z.number(),
    credits_used_this_request: z.number(),
    credits_remaining: z.number(),
    credits_reset_at: z.string(),
  }),
  request_parameters: z.object({
    type: z.string(),
    amazon_domain: z.string(),
    asin: z.string(),
  }),
  request_metadata: z.object({
    created_at: z.string(),
    processed_at: z.string(),
    total_time_taken: z.number(),
    amazon_url: z.string(),
  }),
  product: z.object({
    title: z.string(),
    search_alias: z.object({
      title: z.string(),
      value: z.string(),
    }),
    keywords: z.string(),
    keywords_list: z.array(z.string()),
    is_collection: z.boolean(),
    asin: z.string(),
    parent_asin: z.string(),
    gtin: z.string(),
    link: z.string(),
    brand: z.string(),
    sell_on_amazon: z.boolean(),
    proposition_65_warning: z.boolean(),
    has_size_guide: z.boolean(),
    categories: z.array(CategorySchema),
    categories_flat: z.string(),
    description: z.string(),
    sub_title: z.object({
      text: z.string(),
      link: z.string(),
    }),
    amazons_choice: z.object({
      link: z.string(),
      badge_text: z.string(),
    }),
    marketplace_id: z.string(),
    rating: z.number(),
    rating_breakdown: RatingBreakdownSchema,
    ratings_total: z.number(),
    main_image: z.object({
      link: z.string(),
    }),
    images: z.array(ImageSchema),
    images_count: z.number(),
    images_flat: z.string(),
    videos_count: z.number(),
    videos_additional: z.array(z.any()),
    has_360_view: z.boolean(),
    is_bundle: z.boolean(),
    feature_bullets: z.array(z.string()),
    feature_bullets_count: z.number(),
    feature_bullets_flat: z.string(),
    important_information: z.object({
      sections: z.array(z.any()),
    }),
    top_reviews: z.array(z.any()),
    bestsellers_rank: z.array(z.any()),
    buybox_winner: z.object({
      maximum_order_quantity: z.any(),
      subscribe_and_save: z.any(),
      price_only_available_in_cart: z.boolean(),
      return_policy: z.any(),
      is_prime: z.boolean(),
      is_prime_exclusive_deal: z.boolean(),
      is_amazon_fresh: z.boolean(),
      condition: z.any(),
      availability: z.any(),
      fulfillment: z.any(),
      price: z.any(),
      rrp: z.any(),
      unit_price: z.any(),
      shipping: z.any(),
    }),
    specifications_flat: z.string(),
    recent_sales: z.string(),
    material: z.string(),
    manufacturer: z.string(),
    model_number: z.string(),
    bestsellers_rank_flat: z.string(),
  }),
  brand_store: z.object({
    id: z.string(),
    link: z.string(),
  }),
  frequently_bought_together: z.object({
    total_price: z.object({
      symbol: z.string(),
      value: z.number(),
      currency: z.string(),
      raw: z.string(),
    }),
    products: z.array(z.any()),
  }),
  similar_to_consider: z.object({
    asin: z.string(),
    link: z.string(),
    title: z.string(),
    rating: z.number(),
    ratings_total: z.number(),
    image: z.string(),
    is_prime: z.boolean(),
  }),
});

// Shopify Product Response Schema
export const ShopifyProductSchema = z.object({
  products: z.array(z.object({
    id: z.number(),
    title: z.string(),
    body_html: z.string(),
    vendor: z.string(),
    product_type: z.string(),
    created_at: z.string(),
    handle: z.string(),
    updated_at: z.string(),
    published_at: z.string(),
    template_suffix: z.string().nullable(),
    published_scope: z.string(),
    tags: z.string(),
    status: z.string(),
    admin_graphql_api_id: z.string(),
    variants: z.array(z.any()),
    options: z.array(z.any()),
    images: z.array(z.any()),
    image: z.any(),
  }))
});

// Export types
export type RainforestImportProductResponse = z.infer<typeof RainforestImportProductSchema>;
export type RainforestPriceSyncResponse = z.infer<typeof RainforestPriceSyncSchema>;
export type ShopifyProductResponse = z.infer<typeof ShopifyProductSchema>;
