'use client';

// app/social/page.tsx
// Media/Marketing - Social Media Command Center
// Phase 1: Dual-Mode Panels + Focus/Expand + Platform Previews + Two-Step Approval
// ALL existing features preserved - ADDITIVE ONLY
// ALL API calls are stubbed with TODO comments

import React, { useState, useEffect, useCallback } from 'react';

type TabType = 'capture' | 'patterns' | 'generate' | 'schedule' | 'command' | 'brain' | 'google';
type PlatformId = 'tiktok' | 'instagram' | 'youtube' | 'facebookx';
type FilterPlatform = 'all' | 'instagram' | 'twitter' | 'linkedin' | 'tiktok';
type PanelMode = 'browse' | 'preview';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'confirmed';

interface Niche { id: string; name: string; icon: string; }
interface Platform { id: PlatformId; name: string; icon: string; color: string; }
interface BrowserState { isRecording: boolean; scrapedData: any | null; }
interface HookPattern { template: string; usage: number; avgEngagement: number; }
interface FormatPattern { type: string; percentage: number; avgEngagement: number; }
interface TopicPattern { topic: string; posts: number; trend: string; }
interface BestTime { day: string; time: string; engagement: string; }
interface Pattern { hooks: HookPattern[]; formats: FormatPattern[]; topics: TopicPattern[]; bestTimes: BestTime[]; insights: string[]; }
interface GeneratedPost { id: number; platform: string; type: string; hook: string; content: string; estimatedEngagement: string; bestTime: string; confidence: number; }
interface PipelineTool { name: string; providers: string; icon: string; gradient: string; }

// NEW: Preview post with image and approval status
interface PreviewPost {
  id: string;
  platform: PlatformId;
  niche: string;
  type: string;
  hook: string;
  content: string;
  imageUrl: string | null; // null = below 75% confidence, no image generated
  confidence: number;
  estimatedEngagement: string;
  bestTime: string;
  scheduledAt: string | null;
  status: ApprovalStatus;
  createdAt: string;
  cluster?: string; // which friend cluster this targets
  tone?: string; // caption tone used
}

// ============================================================
// FRIEND INTELLIGENCE SYSTEM — AI Auto-Scroll Engine
// ============================================================

interface FriendProfile {
  name: string;
  platform: PlatformId;
  interests: string[];
  activeHours: string; // e.g. "7am-9am, 7pm-10pm"
  engagementStyle: 'liker' | 'commenter' | 'sharer' | 'lurker';
  contentTheyShare: string[]; // what they repost (gold for distribution)
  recentTopics: string[];
}

interface FriendCluster {
  id: string;
  name: string;
  icon: string;
  color: string;
  members: number;
  interests: string[];
  peakHours: string;
  shareTriggers: string[]; // what makes this group share (not just like)
  avoidTopics: string[]; // what they scroll past
  bestTone: string; // discovery, question, deal, review, comparison, lifestyle
  bestFormat: string; // reel, carousel, text, video
  platformStrength: PlatformId; // where this cluster is most active
  engagementRate: number; // avg engagement from this cluster
  lastTargeted: string | null;
}

interface ScrollSession {
  platform: PlatformId;
  postsScanned: number;
  friendPostsFound: number;
  adsSkipped: number;
  suggestionsSkipped: number;
  clustersUpdated: string[];
  startedAt: string;
  duration: string;
  status: 'running' | 'completed' | 'paused';
}

// ============================================================
// FRIEND CLUSTER DATA — Intelligence from AI Auto-Scroll
// ============================================================
const friendClusters: FriendCluster[] = [
  {
    id: 'gym-fitness',
    name: 'Gym & Fitness',
    icon: '💪',
    color: 'from-red-500 to-orange-500',
    members: 18,
    interests: ['workouts', 'supplements', 'meal prep', 'gym gear', 'recovery', 'protein'],
    peakHours: '6am-8am, 5pm-7pm',
    shareTriggers: ['cheap gear finds', 'workout hacks', 'before/after results', 'supplement deals'],
    avoidTopics: ['MLM supplements', 'clickbait transformations', 'obvious ads'],
    bestTone: 'deal',
    bestFormat: 'reel',
    platformStrength: 'instagram',
    engagementRate: 4.2,
    lastTargeted: null,
  },
  {
    id: 'tech-gadgets',
    name: 'Tech & Gadgets',
    icon: '🔧',
    color: 'from-cyan-500 to-blue-500',
    members: 12,
    interests: ['gadgets', 'AI tools', 'productivity', 'home office', 'gaming', 'phones'],
    peakHours: '10am-12pm, 8pm-11pm',
    shareTriggers: ['cheaper alternative found', 'hidden features', 'comparison tests', 'new releases'],
    avoidTopics: ['sponsored reviews', 'paid promotions', 'obvious affiliate links'],
    bestTone: 'comparison',
    bestFormat: 'carousel',
    platformStrength: 'facebookx',
    engagementRate: 3.8,
    lastTargeted: null,
  },
  {
    id: 'deal-hunters',
    name: 'Deal Hunters',
    icon: '🏷️',
    color: 'from-green-500 to-emerald-500',
    members: 24,
    interests: ['bargains', 'amazon finds', 'coupons', 'price drops', 'dupes', 'budget living'],
    peakHours: '9am-11am, 7pm-9pm (heavy on weekends)',
    shareTriggers: ['price comparison reveals', 'limited deals', '"found it cheaper"', 'bulk savings'],
    avoidTopics: ['overpriced items', 'luxury flex', 'subscription traps'],
    bestTone: 'discovery',
    bestFormat: 'reel',
    platformStrength: 'tiktok',
    engagementRate: 5.1,
    lastTargeted: null,
  },
  {
    id: 'parents-family',
    name: 'Young Parents',
    icon: '👶',
    color: 'from-pink-500 to-rose-500',
    members: 15,
    interests: ['kids products', 'family life', 'home organization', 'safety', 'school supplies', 'toys'],
    peakHours: '8pm-11pm (after kids sleep), 6am-7am',
    shareTriggers: ['life hacks for parents', 'safety recalls', 'kid-approved products', 'relatable parenting moments'],
    avoidTopics: ['parenting judgment', 'expensive luxury items', 'unsolicited advice'],
    bestTone: 'review',
    bestFormat: 'carousel',
    platformStrength: 'facebookx',
    engagementRate: 3.5,
    lastTargeted: null,
  },
  {
    id: 'health-wellness',
    name: 'Health & Wellness',
    icon: '🧘',
    color: 'from-teal-500 to-cyan-500',
    members: 10,
    interests: ['telehealth', 'mental health', 'nutrition', 'skincare', 'self-care', 'sleep'],
    peakHours: '7am-9am, 9pm-11pm',
    shareTriggers: ['relatable health struggles', 'affordable alternatives', 'doctor recommendations', 'wellness tips'],
    avoidTopics: ['miracle cures', 'medical misinformation', 'body shaming'],
    bestTone: 'lifestyle',
    bestFormat: 'reel',
    platformStrength: 'instagram',
    engagementRate: 3.2,
    lastTargeted: null,
  },
];

// ============================================================
// SMART PRODUCT POSTS — Real products matched to friend clusters
// (Replaces mockPreviewPosts with cluster-targeted, confidence-scored posts)
// ============================================================
const calculateConfidence = (product: any, cluster: FriendCluster, platform: PlatformId): number => {
  let score = 50;
  // Cluster match
  const interestMatch = cluster.interests.some(i => 
    (product.title || '').toLowerCase().includes(i) || 
    (product.category || '').toLowerCase().includes(i)
  );
  if (interestMatch) score += 15;
  // Platform match
  if (cluster.platformStrength === platform) score += 10;
  // Has image
  if (product.image_url) score += 10;
  // High engagement cluster
  if (cluster.engagementRate > 4) score += 8;
  // Not recently targeted
  if (!cluster.lastTargeted) score += 5;
  // High margin product
  if (product.profit_percent && product.profit_percent > 40) score += 7;
  // Has reviews
  if (product.rating && product.rating >= 4) score += 5;
  // Penalties
  if (!product.image_url) score -= 10;
  if (cluster.engagementRate < 3) score -= 5;
  return Math.min(Math.max(score, 10), 98);
};

// Generate smart posts from products × clusters
const generateSmartPosts = (): PreviewPost[] => {
  // Simulated product catalog (in production, fetched from /api/products)
  const products = [
    { id: 'p1', title: 'Wireless Earbuds Pro', category: 'gadgets', image_url: 'https://picsum.photos/seed/earbuds/400/400', cost_price: 8.50, retail_price: 24.99, profit_percent: 66, rating: 4.7, review_count: 12400 },
    { id: 'p2', title: 'Resistance Bands Set (5-Pack)', category: 'fitness', image_url: 'https://picsum.photos/seed/bands/400/400', cost_price: 4.20, retail_price: 18.99, profit_percent: 78, rating: 4.5, review_count: 8900 },
    { id: 'p3', title: 'LED Desk Lamp with USB Charging', category: 'home office', image_url: 'https://picsum.photos/seed/lamp/400/400', cost_price: 11.00, retail_price: 34.99, profit_percent: 69, rating: 4.6, review_count: 5200 },
    { id: 'p4', title: 'Silicone Baby Feeding Set', category: 'kids products', image_url: 'https://picsum.photos/seed/babyset/400/400', cost_price: 5.80, retail_price: 22.99, profit_percent: 75, rating: 4.8, review_count: 3100 },
    { id: 'p5', title: 'Portable Blender USB-C', category: 'health', image_url: 'https://picsum.photos/seed/blender/400/400', cost_price: 7.50, retail_price: 29.99, profit_percent: 75, rating: 4.4, review_count: 15600 },
    { id: 'p6', title: 'Blue Light Blocking Glasses', category: 'health', image_url: 'https://picsum.photos/seed/glasses/400/400', cost_price: 3.20, retail_price: 16.99, profit_percent: 81, rating: 4.3, review_count: 22000 },
    { id: 'p7', title: 'Magnetic Phone Mount for Car', category: 'gadgets', image_url: 'https://picsum.photos/seed/phonemount/400/400', cost_price: 4.00, retail_price: 19.99, profit_percent: 80, rating: 4.6, review_count: 9800 },
    { id: 'p8', title: 'Posture Corrector Brace', category: 'fitness', image_url: 'https://picsum.photos/seed/posture/400/400', cost_price: 5.50, retail_price: 24.99, profit_percent: 78, rating: 4.2, review_count: 7400 },
  ];

  const toneTemplates: Record<string, (p: any, c: FriendCluster) => { hook: string; content: string }> = {
    discovery: (p, c) => ({
      hook: `Just found this and I can't believe the price 👀`,
      content: `Okay so I've been looking for a good ${p.category || 'product'} that doesn't cost a fortune and this ${p.title} is genuinely it.\n\n${p.rating}⭐ with ${(p.review_count || 0).toLocaleString()} reviews. I paid $${p.retail_price}.\n\nThe comparable one everyone recommends is like $${Math.round(p.retail_price * 2.5)}+\n\nLink in bio if you want it 🔗`,
    }),
    question: (p, _c) => ({
      hook: `Why is nobody talking about this??`,
      content: `I keep seeing people spend $${Math.round(p.retail_price * 3)}+ on ${p.category || 'this'} when this $${p.retail_price} one exists with ${(p.review_count || 0).toLocaleString()} reviews and ${p.rating}⭐\n\nAm I missing something or are we all just overpaying? 🤔\n\nDrop a 🙋 if you want the link`,
    }),
    deal: (p, _c) => ({
      hook: `Found the exact same thing for ${Math.round((1 - p.cost_price / (p.retail_price * 2.5)) * 100)}% less`,
      content: `Price check on this ${p.title}:\n\n❌ Brand name version: $${Math.round(p.retail_price * 2.5)}\n✅ This one: $${p.retail_price}\n⭐ ${p.rating} stars, ${(p.review_count || 0).toLocaleString()} reviews\n\nSame quality. Fraction of the price.\nLink in bio 👇`,
    }),
    review: (p, _c) => ({
      hook: `Honest review after 2 weeks with this`,
      content: `I've been using this ${p.title} for about 2 weeks now and here's my honest take:\n\n✅ Quality is solid — feels like products 2-3x the price\n✅ ${(p.review_count || 0).toLocaleString()} reviews and most say the same thing\n✅ $${p.retail_price} is a fair price for what you get\n\n⚠️ Not perfect — packaging is basic and shipping took 5 days\n\nOverall: ${p.rating}/5 — would recommend\n\nLink in bio if interested`,
    }),
    comparison: (p, _c) => ({
      hook: `I found the $${p.retail_price} version of the $${Math.round(p.retail_price * 3)} one everyone buys`,
      content: `Side by side comparison:\n\nPopular brand: $${Math.round(p.retail_price * 3)} | This one: $${p.retail_price}\n\nBuild quality: ⭐⭐⭐⭐ vs ⭐⭐⭐⭐\nReviews: ~5K vs ${(p.review_count || 0).toLocaleString()}\nRating: 4.5 vs ${p.rating}\n\nI genuinely cannot tell the difference.\nSave your money. Link in bio.`,
    }),
    lifestyle: (p, _c) => ({
      hook: `My current everyday carry 🤙`,
      content: `Not sponsored just actually love this ${p.title}\n\nBeen using it daily and it's one of those things where you wonder how you lived without it\n\n$${p.retail_price} well spent imo`,
    }),
  };

  const platformMap: Record<PlatformId, string[]> = {
    instagram: ['discovery', 'lifestyle', 'review'],
    tiktok: ['question', 'deal', 'discovery'],
    facebookx: ['deal', 'comparison', 'review'],
    youtube: ['review', 'comparison', 'question'],
  };

  const posts: PreviewPost[] = [];
  const now = new Date();

  // Match each product to best clusters and generate targeted posts
  products.forEach((product, pIdx) => {
    // Find matching clusters
    const matchedClusters = friendClusters.filter(c =>
      c.interests.some(i => 
        product.title.toLowerCase().includes(i) || 
        (product.category || '').toLowerCase().includes(i)
      )
    ).slice(0, 2); // max 2 clusters per product

    if (matchedClusters.length === 0) {
      // Fallback: use deal hunters (broadest cluster)
      matchedClusters.push(friendClusters[2]);
    }

    matchedClusters.forEach((cluster, cIdx) => {
      const platform = cluster.platformStrength;
      const toneKey = cluster.bestTone;
      const template = toneTemplates[toneKey] || toneTemplates.discovery;
      const { hook, content } = template(product, cluster);
      const confidence = calculateConfidence(product, cluster, platform);

      // Parse peak hours for scheduling
      const peakHour = parseInt(cluster.peakHours.split('am')[0].split('-')[0]) || 9;
      const schedTime = new Date(now);
      schedTime.setDate(schedTime.getDate() + pIdx); // spread across days
      schedTime.setHours(peakHour + cIdx * 4, Math.floor(Math.random() * 30), 0, 0);
      if (schedTime.getHours() < 7) schedTime.setHours(7 + Math.floor(Math.random() * 3));
      if (schedTime.getHours() > 22) { schedTime.setDate(schedTime.getDate() + 1); schedTime.setHours(9); }

      const engagementEstimate = cluster.engagementRate > 4 
        ? `${Math.round(cluster.members * cluster.engagementRate * 8)}-${Math.round(cluster.members * cluster.engagementRate * 25)} reach`
        : `${Math.round(cluster.members * cluster.engagementRate * 5)}-${Math.round(cluster.members * cluster.engagementRate * 15)} reach`;

      posts.push({
        id: `smart-${product.id}-${cluster.id}`,
        platform,
        niche: cluster.id,
        type: cluster.bestFormat,
        hook,
        content,
        imageUrl: confidence >= 75 ? product.image_url : null,
        confidence,
        estimatedEngagement: engagementEstimate,
        bestTime: `${cluster.peakHours.split(',')[0]}`,
        scheduledAt: schedTime.toISOString(),
        status: confidence >= 85 ? 'approved' as ApprovalStatus : 'pending' as ApprovalStatus,
        createdAt: now.toISOString(),
        cluster: cluster.name,
        tone: toneKey,
      });
    });
  });

  // Sort by confidence (highest first)
  return posts.sort((a, b) => b.confidence - a.confidence);
};

const smartPreviewPosts = generateSmartPosts();

// DATA - exact from HTML (UNCHANGED)
const niches: Niche[] = [
  { id: 'streamsai', name: 'StreamsAI', icon: '🤖' },
  { id: 'evenbetterbuy', name: 'EvenBetterBuy', icon: '🛒' },
  { id: 'xtremenad', name: 'XtremeNad', icon: '💪' },
  { id: 'medazonhealth', name: 'MedazonHealth', icon: '🏥' },
  { id: 'stream8copilot', name: 'Stream8 Copilot', icon: '👨‍💻' }
];

const socialPlatforms: Platform[] = [
  { id: 'tiktok', name: 'TikTok', icon: '🎵', color: 'from-pink-500 to-rose-500' },
  { id: 'instagram', name: 'Instagram', icon: '📸', color: 'from-purple-500 to-pink-500' },
  { id: 'youtube', name: 'YouTube', icon: '▶️', color: 'from-red-500 to-red-600' },
  { id: 'facebookx', name: 'Facebook/X', icon: '🌐', color: 'from-blue-500 to-indigo-500' }
];

const pipelineTools: Record<string, PipelineTool[]> = {
  'AI GENERATION': [
    { name: 'Image Generator', providers: 'DALL-E 3, Flux, Midjourney', icon: '🎨', gradient: 'from-pink-500 to-rose-500' },
    { name: 'Video Generator', providers: 'Veo 5, Sora, Runway, Pika', icon: '🎬', gradient: 'from-blue-500 to-indigo-500' }
  ],
  'VIDEO OVERLAYS': [
    { name: 'Video Assembler', providers: 'JSON2Video, Shotstack', icon: '🎞️', gradient: 'from-red-500 to-orange-500' },
    { name: 'Caption Generator', providers: 'Whisper, AssemblyAI', icon: '💬', gradient: 'from-purple-500 to-violet-500' },
    { name: 'Color Grading', providers: 'LUT Apply, Auto Color', icon: '🎨', gradient: 'from-amber-500 to-yellow-500' },
    { name: 'Background Remover', providers: 'RunwayML, Remove.bg', icon: '✂️', gradient: 'from-emerald-500 to-teal-500' },
    { name: 'Audio Enhancer', providers: 'Adobe Enhance, Dolby.io', icon: '🔊', gradient: 'from-cyan-500 to-blue-500' },
    { name: 'Video Upscaler', providers: 'Topaz, Real-ESRGAN', icon: '📐', gradient: 'from-gray-500 to-slate-600' },
    { name: 'Format Converter', providers: 'Resize, Crop, Aspect Ratio', icon: '📁', gradient: 'from-rose-500 to-pink-500' },
    { name: 'Music Overlay', providers: 'Mubert, Soundraw, AIVA', icon: '🎵', gradient: 'from-fuchsia-500 to-purple-500' },
    { name: 'Effects & Transitions', providers: 'Blur, Fade, Zoom, Ken Burns', icon: '✨', gradient: 'from-sky-500 to-cyan-500' },
    { name: 'Watermark & Branding', providers: 'Logo, Text, Lower Thirds', icon: '🏷️', gradient: 'from-indigo-500 to-blue-500' }
  ],
  'IMAGE EDITING': [
    { name: 'Image Editor', providers: 'Filters, Adjustments', icon: '🖼️', gradient: 'from-violet-500 to-purple-500' },
    { name: 'Image Inpainting', providers: 'DALL-E Edit, Stability Inpaint', icon: '🪄', gradient: 'from-teal-500 to-cyan-500' }
  ],
  'ACTIONS': [
    { name: 'Export', providers: 'Save to library or download', icon: '📤', gradient: 'from-slate-500 to-gray-600' },
    { name: 'Webhook', providers: 'Custom HTTP service', icon: '🔗', gradient: 'from-gray-600 to-slate-700' }
  ]
};

const mockPatterns: Pattern = {
  hooks: [
    { template: "Stop scrolling if you...", usage: 34, avgEngagement: 12500 },
    { template: "I spent [X] hours so you don't have to", usage: 28, avgEngagement: 9800 },
    { template: "POV: You just discovered...", usage: 22, avgEngagement: 8200 },
    { template: "The [industry] doesn't want you to know this", usage: 18, avgEngagement: 15600 },
    { template: "Here's what [X] years taught me about...", usage: 15, avgEngagement: 7400 },
  ],
  formats: [
    { type: "Carousel (5-7 slides)", percentage: 38, avgEngagement: 11200 },
    { type: "Short-form video (<60s)", percentage: 32, avgEngagement: 18500 },
    { type: "Text post with image", percentage: 18, avgEngagement: 5400 },
    { type: "Thread/Story sequence", percentage: 12, avgEngagement: 8900 },
  ],
  topics: [
    { topic: "AI tools & productivity", posts: 24, trend: "rising" },
    { topic: "Behind-the-scenes content", posts: 18, trend: "stable" },
    { topic: "Before/after transformations", posts: 15, trend: "rising" },
    { topic: "Quick tips & hacks", posts: 12, trend: "stable" },
    { topic: "Industry hot takes", posts: 9, trend: "rising" },
  ],
  bestTimes: [
    { day: "Tuesday", time: "9:00 AM", engagement: "highest" },
    { day: "Thursday", time: "12:00 PM", engagement: "high" },
    { day: "Saturday", time: "10:00 AM", engagement: "high" },
  ],
  insights: [
    "Posts with faces get 38% more engagement",
    "First 3 words determine 80% of scroll-stop rate",
    "Carousel posts get 3x more saves than single images",
    "Questions in captions boost comments by 56%",
    "Posts between 150-200 words perform best"
  ]
};

const mockGeneratedPosts: GeneratedPost[] = [
  {
    id: 1, platform: "instagram", type: "carousel",
    hook: "Stop scrolling if you're still editing videos manually in 2026",
    content: "Stop scrolling if you're still editing videos manually in 2026 👇\n\nI used to spend 6+ hours editing a single video.\n\nNow? 15 minutes. Here's the AI stack that changed everything:\n\nSlide 2: The Problem\n→ Hours of cutting, trimming, adding effects\n→ Expensive software subscriptions\n→ Steep learning curves\n→ Burnout from repetitive tasks\n\nSlide 3: The Solution\nAI video generation isn't the future—it's NOW.\n\nSlide 4: My Workflow\n1. Write a script (or let AI do it)\n2. Generate video with StreamsAI\n3. Add AI voiceover\n4. Export in 4K\nTotal time: 15 minutes\n\nSlide 5: The Results\n→ 10x more content output\n→ 90% cost reduction\n→ More time for strategy\n→ Better engagement (surprisingly)\n\nSlide 6: CTA\nWant to try it yourself?\n\nLink in bio → StreamsAI free trial\nNo credit card needed.\n\n#AITools #ContentCreation #VideoMarketing #Productivity",
    estimatedEngagement: "2,500 - 5,000 likes", bestTime: "Tuesday 9:00 AM", confidence: 87
  },
  {
    id: 2, platform: "twitter", type: "thread",
    hook: "I spent 200 hours testing AI video tools so you don't have to",
    content: "I spent 200 hours testing AI video tools so you don't have to 🧵\n\nHere's what I learned (and my honest recommendations):\n\n1/ First, let me explain WHY I did this:\n\nI was spending $3,000/month on video production.\n8 hours per video.\nConstant back-and-forth with editors.\n\nSomething had to change.\n\n2/ I tested 15 different AI video tools:\n- Runway ML\n- Pika Labs\n- Sora (limited access)\n- StreamsAI\n- Synthesia\n...and 10 more\n\n3/ My criteria was simple:\n✓ Output quality (can I actually use this?)\n✓ Speed (faster than hiring?)\n✓ Cost (cheaper than $3k/month?)\n✓ Ease of use (can I do it myself?)\n\n4/ The surprising winner?\n\nIt wasn't the most expensive.\nIt wasn't the most hyped.\nIt was the one that just... worked.\n\n5/ StreamsAI consistently delivered:\n→ 4K output quality\n→ 15-minute turnaround\n→ Natural-looking results\n→ Simple interface\n\nAnd at $49/month, it's a no-brainer.",
    estimatedEngagement: "500 - 1,500 retweets", bestTime: "Wednesday 11:00 AM", confidence: 82
  },
  {
    id: 3, platform: "linkedin", type: "post",
    hook: "We cut our video production costs by 89%",
    content: "We cut our video production costs by 89%.\n\nHere's the uncomfortable truth nobody talks about:\n\nMost B2B video content doesn't need Hollywood production value.\n\nIt needs to be:\n→ Clear\n→ Consistent\n→ Fast to produce\n\nThat's it.\n\nFor the past 6 months, we've been running an experiment.\n\nWe replaced most of our video production workflow with AI tools.\n\nThe results?\n→ 89% cost reduction\n→ Same (or better) engagement\n→ 24-hour turnaround\n\nWhat's holding you back from trying AI for content creation?\n\nDrop your concerns below 👇",
    estimatedEngagement: "1,200 - 2,500 likes", bestTime: "Tuesday 8:00 AM", confidence: 79
  },
  {
    id: 4, platform: "tiktok", type: "video_script",
    hook: "POV: You just discovered the AI tool that's replacing video editors",
    content: "[VIDEO SCRIPT - 45 seconds]\n\nHOOK (0-3s):\n\"POV: You just discovered the AI tool that's replacing entire video teams\"\n\nPROBLEM (3-10s):\n\"I used to spend 8 hours editing ONE video\"\n\nDEMO (12-35s):\n[Screen recording of StreamsAI]\n\"Watch this\"\n\"Done. 4K. Professional. Ready to post.\"\n\nCTA (42-45s):\n\"Link in bio if you want to try it\"\n\n---\nCAPTION:\nThis changed my entire content game 🤯 Link in bio to try free #AITools #ContentCreator #VideoEditing #TikTokTips",
    estimatedEngagement: "50,000 - 150,000 views", bestTime: "Saturday 10:00 AM", confidence: 91
  },
  {
    id: 5, platform: "instagram", type: "reel",
    hook: "The content creation industry doesn't want you to know this",
    content: "[REEL SCRIPT - 30 seconds]\n\nHOOK (0-2s):\n[Whisper to camera]\n\"The content creation industry doesn't want you to know this...\"\n\nREVEAL (2-8s):\n[Normal voice, energetic]\n\"You don't need expensive equipment\"\n\"You don't need a team\"\n\"You don't even need editing skills\"\n\nPROOF (8-20s):\n[Split screen: Before/After]\n\"I made this entire video...\"\n[Point to screen]\n\"With just a text prompt\"\n[Show StreamsAI interface]\n\"AI does the editing, effects, even the voiceover\"\n\nCTA (20-30s):\n\"Want to see how?\"\n[Point up]\n\"Link in bio\"\n\"Free trial, no credit card\"\n\"Go create something 🚀\"\n\n---\nCAPTION:\nStill editing videos manually? 😅 This AI tool changed everything for me. Link in bio to try it free!\n\n#ContentCreator #AIVideo #ReelsStrategy #ContentTips #VideoMarketing",
    estimatedEngagement: "15,000 - 35,000 views", bestTime: "Thursday 7:00 PM", confidence: 85
  }
];

// NEW: Mock preview posts for each platform (with AI-generated image placeholders)
const mockPreviewPosts: PreviewPost[] = [
  // TikTok posts
  {
    id: 'tt-001', platform: 'tiktok', niche: 'streamsai', type: 'video_script',
    hook: 'POV: You just found the AI tool that replaces your entire editing team',
    content: '[VIDEO SCRIPT - 45s]\n\nHOOK (0-3s): "POV: You just found the AI tool that replaces your entire editing team"\n\nPROBLEM (3-10s): "I used to spend 8 hours editing ONE video"\n\nDEMO (12-35s): [Screen recording of StreamsAI]\n"Watch this... Done. 4K. Professional."\n\nCTA (42-45s): "Link in bio to try it free"\n\n#AITools #ContentCreator #VideoEditing',
    imageUrl: 'https://picsum.photos/seed/tt001/400/710',
    confidence: 91, estimatedEngagement: '50K-150K views', bestTime: 'Sat 10:00 AM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T08:00:00Z'
  },
  {
    id: 'tt-002', platform: 'tiktok', niche: 'streamsai', type: 'video_script',
    hook: 'I tested 15 AI video tools — only ONE was worth it',
    content: '[VIDEO SCRIPT - 30s]\n\nHOOK: "I tested 15 AI video tools..."\nBODY: Quick cuts showing each tool\nREVEAL: StreamsAI interface\nCTA: "Link in bio"\n\n#AIVideo #TechReview',
    imageUrl: 'https://picsum.photos/seed/tt002/400/710',
    confidence: 84, estimatedEngagement: '25K-80K views', bestTime: 'Thu 7:00 PM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T07:30:00Z'
  },
  {
    id: 'tt-003', platform: 'tiktok', niche: 'evenbetterbuy', type: 'video_script',
    hook: 'This $12 product has 4.9 stars and 50K reviews',
    content: '[VIDEO SCRIPT - 20s]\n\nHOOK: "This $12 product has 4.9 stars..."\nSHOW: Product unboxing\nREACTION: Genuine surprise\nCTA: "Link in bio for the deal"\n\n#FindsUnder20 #TikTokMadeMeBuyIt',
    imageUrl: null, // Below 75% - no image generated
    confidence: 68, estimatedEngagement: '10K-30K views', bestTime: 'Fri 6:00 PM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T07:00:00Z'
  },
  // Instagram posts
  {
    id: 'ig-001', platform: 'instagram', niche: 'streamsai', type: 'carousel',
    hook: 'Stop scrolling if you still edit videos manually in 2026',
    content: 'Slide 1: Stop scrolling if you still edit videos manually in 2026 👇\n\nSlide 2: The Problem\n→ Hours of cutting & trimming\n→ Expensive software\n→ Steep learning curves\n\nSlide 3: The Solution — AI video generation is NOW\n\nSlide 4: My Workflow\n1. Write script\n2. Generate with StreamsAI\n3. Add AI voiceover\n4. Export 4K\nTotal: 15 minutes\n\nSlide 5: Results\n→ 10x content output\n→ 90% cost reduction\n\nSlide 6: Link in bio → free trial\n\n#AITools #ContentCreation #VideoMarketing',
    imageUrl: 'https://picsum.photos/seed/ig001/400/400',
    confidence: 87, estimatedEngagement: '2.5K-5K likes', bestTime: 'Tue 9:00 AM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T08:15:00Z'
  },
  {
    id: 'ig-002', platform: 'instagram', niche: 'medazonhealth', type: 'reel',
    hook: 'Your doctor appointment shouldn\'t take 3 weeks',
    content: '[REEL - 25s]\n\nHOOK: "Your doctor appointment shouldn\'t take 3 weeks..."\nREVEAL: "What if you could see a doctor in 15 minutes?"\nPROOF: Show MedazonHealth booking flow\nCTA: "Link in bio — first visit free"\n\n#Telehealth #HealthTech #DoctorOnDemand',
    imageUrl: 'https://picsum.photos/seed/ig002/400/710',
    confidence: 78, estimatedEngagement: '5K-12K views', bestTime: 'Wed 12:00 PM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T07:45:00Z'
  },
  {
    id: 'ig-003', platform: 'instagram', niche: 'xtremenad', type: 'single_image',
    hook: 'The supplement industry is lying to you',
    content: 'The supplement industry is lying to you.\n\nMost "premium" supplements are the same formula with different labels.\n\nHere\'s what actually matters:\n→ Third-party testing\n→ Bioavailability\n→ Transparent sourcing\n\nWe do all three. Link in bio.\n\n#Supplements #Fitness #CleanLabel',
    imageUrl: null, // Below 75%
    confidence: 62, estimatedEngagement: '800-2K likes', bestTime: 'Mon 8:00 AM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T06:30:00Z'
  },
  // YouTube posts
  {
    id: 'yt-001', platform: 'youtube', niche: 'streamsai', type: 'video',
    hook: 'I Replaced My Entire Video Team with AI — Here\'s What Happened',
    content: 'TITLE: I Replaced My Entire Video Team with AI — Here\'s What Happened\n\nDESCRIPTION:\nI spent $3,000/month on video production. Then I switched to AI.\n\nIn this video:\n- My old workflow vs new workflow\n- Real cost comparison\n- Quality comparison (side by side)\n- The tools I use (StreamsAI, etc)\n- Honest pros and cons\n\n⏱ Timestamps:\n0:00 - The problem\n2:15 - Testing AI tools\n5:30 - The results\n8:00 - Cost breakdown\n10:30 - Should YOU switch?\n\nTAGS: AI video, content creation, StreamsAI, video editing, productivity',
    imageUrl: 'https://picsum.photos/seed/yt001/640/360',
    confidence: 88, estimatedEngagement: '5K-15K views', bestTime: 'Sun 2:00 PM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T09:00:00Z'
  },
  {
    id: 'yt-002', platform: 'youtube', niche: 'evenbetterbuy', type: 'short',
    hook: '5 Products Under $25 That Feel Like $100',
    content: 'TITLE: 5 Products Under $25 That Feel Like $100 #shorts\n\nDESCRIPTION:\nThese budget finds are absolutely insane quality.\n\nAll links in description 👇\n\n#budgetfinds #amazonfinds #shorts',
    imageUrl: 'https://picsum.photos/seed/yt002/400/710',
    confidence: 76, estimatedEngagement: '10K-50K views', bestTime: 'Sat 11:00 AM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T08:30:00Z'
  },
  // Facebook posts
  {
    id: 'fb-001', platform: 'facebookx', niche: 'medazonhealth', type: 'text_image',
    hook: 'We just hit 10,000 virtual appointments',
    content: '🎉 We just hit 10,000 virtual appointments on MedazonHealth!\n\nWhat started as a simple idea — "what if seeing a doctor was as easy as ordering food?" — has become a reality for thousands of Florida patients.\n\nThank you to every patient who trusted us and every doctor who believed in telehealth.\n\nThis is just the beginning. 🚀\n\n#MedazonHealth #Telehealth #Healthcare #Florida',
    imageUrl: 'https://picsum.photos/seed/fb001/600/315',
    confidence: 82, estimatedEngagement: '500-1.5K reactions', bestTime: 'Tue 10:00 AM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T07:15:00Z'
  },
  {
    id: 'fb-002', platform: 'facebookx', niche: 'xtremenad', type: 'text_image',
    hook: '90% of gym progress is what you do OUTSIDE the gym',
    content: '90% of gym progress is what you do OUTSIDE the gym.\n\nSleep. Nutrition. Recovery.\n\nMost people train hard but completely ignore the other 23 hours.\n\nHere\'s the truth: supplements don\'t replace good habits, but the RIGHT ones amplify everything you\'re already doing.\n\nWhat\'s your #1 recovery tip? 👇',
    imageUrl: null, // Below 75%
    confidence: 71, estimatedEngagement: '200-800 reactions', bestTime: 'Wed 7:00 AM',
    scheduledAt: null, status: 'pending', createdAt: '2026-02-06T06:45:00Z'
  }
];

export default function MediaMarketingPage() {
  // ============================================================
  // STATE - ORIGINAL (exact match from original HTML - UNCHANGED)
  // ============================================================
  const [activeTab, setActiveTab] = useState<TabType>('capture');
  const [selectedNiche, setSelectedNiche] = useState('streamsai');
  const [showWebhookConfig, setShowWebhookConfig] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [patterns, setPatterns] = useState<Pattern | null>(null);
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<FilterPlatform>('all');
  const [showPipelinesSidebar, setShowPipelinesSidebar] = useState(false);
  
  const [browserStates, setBrowserStates] = useState<Record<PlatformId, BrowserState>>({
    tiktok: { isRecording: false, scrapedData: null },
    instagram: { isRecording: false, scrapedData: null },
    youtube: { isRecording: false, scrapedData: null },
    facebookx: { isRecording: false, scrapedData: null }
  });

  const [webhookConfig, setWebhookConfig] = useState<Record<PlatformId, string>>({
    tiktok: '', instagram: '', youtube: '', facebookx: ''
  });

  // ============================================================
  // STATE - NEW: Phase 1 additions
  // ============================================================
  // Panel mode: each panel independently toggles between browse and preview
  const [panelModes, setPanelModes] = useState<Record<PlatformId, PanelMode>>({
    tiktok: 'browse',
    instagram: 'browse',
    youtube: 'browse',
    facebookx: 'browse'
  });

  // Focus/expand mode: which panel is expanded (null = 2x2 grid)
  const [focusedPanel, setFocusedPanel] = useState<PlatformId | null>(null);

  // Preview posts per platform
  const [previewPosts, setPreviewPosts] = useState<PreviewPost[]>(smartPreviewPosts);

  // Two-step approval: show confirm modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Generating visual state per post
  const [generatingVisual, setGeneratingVisual] = useState<Record<string, boolean>>({});

  // VIDEO STUDIO STATE
  const [videoStyle, setVideoStyle] = useState<string>('kinetic');
  const [selectedVideoTemplate, setSelectedVideoTemplate] = useState<string | null>(null);
  const [videoRendering, setVideoRendering] = useState(false);

  // NICHE COMMAND VIEW STATE
  const [nicheViewOpen, setNicheViewOpen] = useState(false);
  const [nicheSubView, setNicheSubView] = useState<string>('brain');

  // GOOGLE SEO DASHBOARD STATE
  const [googleSubTab, setGoogleSubTab] = useState<'feed' | 'console' | 'seoengine' | 'sitemap' | 'schema' | 'setup'>('feed');
  const [gscDateRange, setGscDateRange] = useState<'7d' | '14d' | '28d' | '90d'>('7d');
  const [feedIssues, setFeedIssues] = useState(14);

  // EDIT POST STATE
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingHook, setEditingHook] = useState('');

  const [googleSeoTab, setGoogleSeoTab] = useState<'feed' | 'console' | 'engine' | 'sitemap' | 'schema' | 'setup'>('console');
  const [seoPages, setSeoPages] = useState<{ id: string; title: string; slug: string; status: string; impressions: number; clicks: number; content: string; niche: string; date: string }[]>([]);
  const [seoRunning, setSeoRunning] = useState(false);

  // VAULT EDIT STATE
  const [vaultEditItem, setVaultEditItem] = useState<string | null>(null);
  const [vaultEditContent, setVaultEditContent] = useState('');

  // ============================================================
  // STATE - SCHEDULE TAB
  // ============================================================
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleView, setScheduleView] = useState<'queue' | 'calendar' | 'history' | 'accounts'>('queue');
  const [isScheduling, setIsScheduling] = useState(false);
  const [postingRules, setPostingRules] = useState({
    maxPerDay: 3, minGapMinutes: 60, quietStart: 1, quietEnd: 6, autoQueue: false, autoQueueCount: 3,
  });
  const [accountStatuses] = useState<Record<string, { status: string; lastPost: string | null; todayCount: number }>>({
    instagram: { status: 'active', lastPost: null, todayCount: 0 },
    facebook: { status: 'active', lastPost: null, todayCount: 0 },
    tiktok: { status: 'expired', lastPost: null, todayCount: 0 },
    twitter: { status: 'active', lastPost: null, todayCount: 0 },
  });

  // ============================================================
  // STATE - AI AUTO-SCROLL ENGINE
  // ============================================================
  const [scrollSessions, setScrollSessions] = useState<ScrollSession[]>([]);
  const [isAutoScrolling, setIsAutoScrolling] = useState<Record<PlatformId, boolean>>({
    tiktok: false, instagram: false, youtube: false, facebookx: false
  });
  const [scrollStats, setScrollStats] = useState({
    totalScanned: 847, friendPosts: 312, adsSkipped: 189, suggestionsSkipped: 346,
    clustersIdentified: friendClusters.length, lastFullScan: new Date(Date.now() - 3600000 * 6).toISOString(),
  });
  const [clusters] = useState<FriendCluster[]>(friendClusters);
  const scrollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const loadScheduledPosts = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const res = await fetch('/api/social?action=posts&pageSize=50');
      if (res.ok) {
        const json = await res.json();
        setScheduledPosts(json.data || []);
      }
    } catch (e) {
      console.error('[Schedule] Load failed:', e);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  // Load schedule when tab switches to schedule OR on initial load
  useEffect(() => {
    if (activeTab === 'schedule' || activeTab === 'capture') { loadScheduledPosts(); }
  }, [activeTab, loadScheduledPosts]);

  // ============================================================
  // AI AUTO-SCROLL ENGINE — Simulated feed scanning
  // ============================================================
  const startAutoScroll = (platformId: PlatformId) => {
    if (isAutoScrolling[platformId]) return;
    setIsAutoScrolling(prev => ({ ...prev, [platformId]: true }));
    
    const session: ScrollSession = {
      platform: platformId,
      postsScanned: 0,
      friendPostsFound: 0,
      adsSkipped: 0,
      suggestionsSkipped: 0,
      clustersUpdated: [],
      startedAt: new Date().toISOString(),
      duration: '0s',
      status: 'running',
    };
    setScrollSessions(prev => [session, ...prev.slice(0, 9)]);

    let scanned = 0;
    const interval = setInterval(() => {
      scanned++;
      const isFriend = Math.random() > 0.55; // ~45% of feed is real friend content
      const isAd = !isFriend && Math.random() > 0.5;
      const isSuggestion = !isFriend && !isAd;
      
      setScrollSessions(prev => {
        const updated = [...prev];
        if (updated[0] && updated[0].platform === platformId) {
          updated[0] = {
            ...updated[0],
            postsScanned: scanned,
            friendPostsFound: updated[0].friendPostsFound + (isFriend ? 1 : 0),
            adsSkipped: updated[0].adsSkipped + (isAd ? 1 : 0),
            suggestionsSkipped: updated[0].suggestionsSkipped + (isSuggestion ? 1 : 0),
            duration: `${scanned * 2}s`,
            clustersUpdated: [...new Set([...updated[0].clustersUpdated, clusters[Math.floor(Math.random() * clusters.length)].name])],
          };
        }
        return updated;
      });

      setScrollStats(prev => ({
        ...prev,
        totalScanned: prev.totalScanned + 1,
        friendPosts: prev.friendPosts + (isFriend ? 1 : 0),
        adsSkipped: prev.adsSkipped + (isAd ? 1 : 0),
        suggestionsSkipped: prev.suggestionsSkipped + (isSuggestion ? 1 : 0),
      }));

      // Stop after ~50 posts scanned
      if (scanned >= 50) {
        clearInterval(interval);
        setIsAutoScrolling(prev => ({ ...prev, [platformId]: false }));
        setScrollSessions(prev => {
          const updated = [...prev];
          if (updated[0] && updated[0].platform === platformId) {
            updated[0] = { ...updated[0], status: 'completed' };
          }
          return updated;
        });
        setScrollStats(prev => ({ ...prev, lastFullScan: new Date().toISOString() }));
      }
    }, 400); // Simulate scrolling speed

    scrollIntervalRef.current = interval;
  };

  const stopAutoScroll = (platformId: PlatformId) => {
    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    setIsAutoScrolling(prev => ({ ...prev, [platformId]: false }));
    setScrollSessions(prev => {
      const updated = [...prev];
      if (updated[0] && updated[0].platform === platformId) {
        updated[0] = { ...updated[0], status: 'paused' };
      }
      return updated;
    });
  };

  const startFullScan = () => {
    const platforms: PlatformId[] = ['instagram', 'tiktok', 'facebookx', 'youtube'];
    platforms.forEach((p, i) => {
      setTimeout(() => startAutoScroll(p), i * 25000); // Stagger starts
    });
  };

  // Auto-schedule: take all approved (85+) posts and queue them
  const autoScheduleApproved = async () => {
    const autoApproved = previewPosts.filter(p => p.confidence >= 85 && p.status !== 'confirmed');
    if (autoApproved.length === 0) { alert('No high-confidence posts to auto-schedule'); return; }
    
    // Auto-approve them first
    setPreviewPosts(prev => prev.map(p => 
      p.confidence >= 85 ? { ...p, status: 'approved' as ApprovalStatus } : p
    ));
    
    // Then trigger finalConfirmAll logic
    const approved = autoApproved;
    const errors: string[] = [];
    const scheduled: string[] = [];
    const platformMapLocal: Record<string, string> = { tiktok: 'tiktok', instagram: 'instagram', facebookx: 'facebook', youtube: 'twitter' };
    
    for (const post of approved) {
      try {
        const scheduledFor = post.scheduledAt ? new Date(post.scheduledAt) : new Date(Date.now() + scheduled.length * 4 * 3600000);
        if (scheduledFor.getHours() < 7) scheduledFor.setHours(7 + Math.floor(Math.random() * 3));
        if (scheduledFor.getHours() > 22) { scheduledFor.setDate(scheduledFor.getDate() + 1); scheduledFor.setHours(9); }
        
        const res = await fetch('/api/social?action=create-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: platformMapLocal[post.platform] || post.platform,
            content: `${post.hook}\n\n${post.content}`,
            mediaUrls: post.imageUrl ? [post.imageUrl] : [],
            scheduledFor: scheduledFor.toISOString(),
            status: 'scheduled',
          }),
        });
        if (res.ok) { scheduled.push(post.id); } else { errors.push(`${post.platform}: ${post.hook.substring(0, 30)}...`); }
      } catch (e) { errors.push(`${post.platform}: network error`); }
    }
    
    if (scheduled.length > 0) {
      setPreviewPosts(prev => prev.map(p => scheduled.includes(p.id) ? { ...p, status: 'confirmed' as ApprovalStatus } : p));
      await loadScheduledPosts();
    }
    alert(`✅ Auto-scheduled ${scheduled.length} high-confidence posts${errors.length > 0 ? `\n⚠️ ${errors.length} failed: ${errors.join(', ')}` : ''}`);
  };

  // Publish a single post now
  const publishPostNow = async (postId: string) => {
    try {
      const res = await fetch('/api/social?action=publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      alert(data.success ? '✅ Published!' : `❌ Failed: ${data.error}`);
      await loadScheduledPosts();
    } catch (e) {
      alert(`❌ Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  };

  // Cancel a scheduled post (set back to draft)
  const cancelScheduledPost = async (postId: string) => {
    try {
      await fetch('/api/social?action=update-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, status: 'draft' }),
      });
      await loadScheduledPosts();
    } catch (e) { console.error('Cancel failed:', e); }
  };

  // Trigger omnipresence cron manually
  const triggerCronNow = async () => {
    try {
      const res = await fetch('/api/cron/omnipresence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'publish-scheduled' }),
      });
      const data = await res.json();
      alert(`Cron triggered: ${data.postsPublished || 0} posts published`);
      await loadScheduledPosts();
    } catch { alert('Cron trigger failed'); }
  };

  // Load saved webhook config on init (UNCHANGED)
  useEffect(() => {
    const savedWebhooks = localStorage.getItem('zapierWebhooks');
    if (savedWebhooks) {
      setWebhookConfig(JSON.parse(savedWebhooks));
    }
  }, []);

  // ============================================================
  // UTILITY FUNCTIONS - ORIGINAL (exact match - UNCHANGED)
  // ============================================================
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 85) return 'text-green-400';
    if (confidence >= 70) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const getConfidenceBg = (confidence: number): string => {
    if (confidence >= 85) return 'bg-green-500/20 border-green-500/30';
    if (confidence >= 70) return 'bg-yellow-500/20 border-yellow-500/30';
    return 'bg-orange-500/20 border-orange-500/30';
  };

  const getPlatformIcon = (platform: string): string => {
    const icons: Record<string, string> = {
      instagram: '📸', twitter: '𝕏', linkedin: '💼', tiktok: '🎵', facebook: '📘'
    };
    return icons[platform] || '📱';
  };

  // ============================================================
  // EVENT HANDLERS - ORIGINAL (exact match - UNCHANGED)
  // ============================================================
  const toggleWebhookConfig = () => setShowWebhookConfig(!showWebhookConfig);

  const updateWebhook = (platformId: PlatformId, url: string) => {
    setWebhookConfig(prev => ({ ...prev, [platformId]: url }));
  };

  const saveWebhookConfig = () => {
    localStorage.setItem('zapierWebhooks', JSON.stringify(webhookConfig));
    alert('Webhook configuration saved!');
  };

  // TODO: API STUB - scrapeData (UNCHANGED)
  const scrapeData = async (platformId: PlatformId) => {
    console.log(`[API STUB] Scraping data from ${platformId}...`);
    
    const mockScrapedData = {
      platform: platformId,
      timestamp: new Date().toISOString(),
      posts: [
        { content: 'Sample post content...', engagement: 1234, type: 'video' },
        { content: 'Another post...', engagement: 567, type: 'image' }
      ]
    };
    
    setBrowserStates(prev => ({
      ...prev,
      [platformId]: { ...prev[platformId], scrapedData: mockScrapedData }
    }));
    
    alert(`Scraped ${mockScrapedData.posts.length} posts from ${platformId}!\n\nData will be stored in Supabase with niche_id: ${selectedNiche}`);
  };

  // TODO: API STUB - toggleRecording (UNCHANGED)
  const toggleRecording = async (platformId: PlatformId) => {
    if (browserStates[platformId].isRecording) {
      setBrowserStates(prev => ({
        ...prev,
        [platformId]: { ...prev[platformId], isRecording: false }
      }));
      alert(`Recording stopped for ${platformId}`);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        
        setBrowserStates(prev => ({
          ...prev,
          [platformId]: { ...prev[platformId], isRecording: true }
        }));
        
        const mediaRecorder = new MediaRecorder(stream);
        const chunks: BlobPart[] = [];
        
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const file = new File([blob], `${platformId}-recording-${Date.now()}.webm`, { type: 'video/webm' });
          setUploadedFiles(prev => [...prev, file]);
          setBrowserStates(prev => ({
            ...prev,
            [platformId]: { ...prev[platformId], isRecording: false }
          }));
        };
        
        mediaRecorder.start();
        
        stream.getVideoTracks()[0].onended = () => {
          mediaRecorder.stop();
          setBrowserStates(prev => ({
            ...prev,
            [platformId]: { ...prev[platformId], isRecording: false }
          }));
        };
        
        alert(`Recording started for ${platformId}! Click "Stop sharing" when done.`);
      } catch (err) {
        console.error('Screen recording error:', err);
        alert('Could not start screen recording. Please allow screen sharing permission.');
      }
    }
  };

  // TODO: API STUB - postToZapier (UNCHANGED)
  const postToZapier = async (platformId: PlatformId) => {
    const webhookUrl = webhookConfig[platformId];
    
    if (!webhookUrl) {
      alert(`No Zapier webhook configured for ${platformId}.\n\nClick "⚙️ Zapier Config" to set up your webhook URL.`);
      return;
    }
    
    const payload = {
      platform: platformId,
      niche_id: selectedNiche,
      content: 'Your content here...',
      timestamp: new Date().toISOString(),
    };
    
    console.log(`[API STUB] Posting to ${platformId} via Zapier:`, payload);
    console.log(`Webhook URL: ${webhookUrl}`);
    
    alert(`Post sent to ${platformId} via Zapier!\n\nWebhook: ${webhookUrl}\nNiche: ${selectedNiche}`);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // TODO: API STUB - startAnalysis (UNCHANGED)
  const startAnalysis = () => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);

    const interval = setInterval(() => {
      setAnalysisProgress(prev => {
        const next = prev + Math.random() * 15;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsAnalyzing(false);
            setPatterns(mockPatterns);
            setActiveTab('patterns');
          }, 500);
          return 100;
        }
        return next;
      });
    }, 300);
  };

  // TODO: API STUB - generatePosts (UNCHANGED)
  const generatePosts = () => {
    setGeneratedPosts(mockGeneratedPosts);
    setActiveTab('generate');
  };

  // TODO: API STUB - generateMore (UNCHANGED)
  const generateMore = () => {
    alert('Generating 5 more posts...');
  };

  const filterPlatform = (platform: FilterPlatform) => setSelectedPlatform(platform);
  const selectNiche = (nicheId: string) => setSelectedNiche(nicheId);
  const openPipelinesSidebar = () => setShowPipelinesSidebar(true);
  const closePipelinesSidebar = () => setShowPipelinesSidebar(false);

  const copyPost = (id: number) => {
    const post = generatedPosts.find(p => p.id === id);
    if (post) {
      navigator.clipboard.writeText(post.content);
      alert('Post copied to clipboard!');
    }
  };

  // ============================================================
  // NEW EVENT HANDLERS - Phase 1
  // ============================================================
  
  // Toggle panel mode (browse/preview) independently per panel
  const togglePanelMode = (platformId: PlatformId) => {
    setPanelModes(prev => ({
      ...prev,
      [platformId]: prev[platformId] === 'browse' ? 'preview' : 'browse'
    }));
  };

  // Focus/expand a panel (click to expand, click again to collapse)
  const toggleFocusPanel = (platformId: PlatformId) => {
    setFocusedPanel(prev => prev === platformId ? null : platformId);
  };

  // Step 1 Approve: move post to 'approved' status
  const approvePost = (postId: string) => {
    setPreviewPosts(prev => prev.map(p => 
      p.id === postId ? { ...p, status: 'approved' as ApprovalStatus } : p
    ));
  };

  // Reject post
  const rejectPost = (postId: string) => {
    setPreviewPosts(prev => prev.map(p => 
      p.id === postId ? { ...p, status: 'rejected' as ApprovalStatus } : p
    ));
  };

  // Undo approval/rejection
  const resetPostStatus = (postId: string) => {
    setPreviewPosts(prev => prev.map(p => 
      p.id === postId ? { ...p, status: 'pending' as ApprovalStatus } : p
    ));
  };

  // EDIT POST — open editor with current content
  const startEditPost = (postId: string) => {
    const post = previewPosts.find(p => p.id === postId);
    if (post) { setEditingPostId(postId); setEditingHook(post.hook); setEditingContent(post.content); }
  };
  const savePostEdit = () => {
    if (!editingPostId) return;
    setPreviewPosts(prev => prev.map(p => p.id === editingPostId ? { ...p, hook: editingHook, content: editingContent } : p));
    setEditingPostId(null);
  };
  const cancelPostEdit = () => { setEditingPostId(null); };

  // SEO ENGINE — run cycle to generate pages
  const runSeoCycle = () => {
    setSeoRunning(true);
    setTimeout(() => {
      const nichePages: Record<string, string[]> = {
        medazonhealth: ['Private UTI Treatment Online Florida', 'Discreet STD Testing From Home FL', 'Online ADHD Evaluation Florida'],
        xtremenad: ['Best 5-in-1 Gummy Supplement 2026', 'Ashwagandha Gummy Benefits', 'NAD+ Supplement Guide'],
        streamsai: ['StreamsAI vs Bolt.new — Full Comparison', 'AI App Builder for Non-Developers'],
        evenbetterbuy: ['Best Wireless Earbuds Under $25', 'Cheap AirPods Alternatives 2026'],
      };
      const pages = (nichePages[selectedNiche] || nichePages.medazonhealth).map((title, i) => ({
        id: `seo-${Date.now()}-${i}`, title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        status: 'generated', impressions: 0, clicks: 0, niche: selectedNiche,
        content: `<h1>${title}</h1>\n<p>AI-generated SEO content for "${title}". This page targets long-tail keywords and includes FAQ schema markup, internal links, and E-E-A-T signals.</p>\n\n<h2>What You Need to Know</h2>\n<p>Comprehensive coverage of the topic with medically reviewed content (if health) or product comparison data (if e-commerce).</p>\n\n<h2>FAQ</h2>\n<p>Q: [auto-generated FAQ]\nA: [AI answer based on keyword intent]</p>`,
      }));
      setSeoPages(prev => [...prev, ...pages]);
      setSeoRunning(false);
    }, 3000);
  };

  // Step 2 Final Confirm: confirm all approved posts
  // Step 2 Final Confirm: save approved posts to DB as scheduled
  const finalConfirmAll = async () => {
    const approvedPosts = previewPosts.filter(p => p.status === 'approved');
    if (approvedPosts.length === 0) { setShowConfirmModal(false); return; }
    setIsScheduling(true);
    const scheduled: string[] = [];
    const errors: string[] = [];

    for (const post of approvedPosts) {
      try {
        const hoursOffset = scheduled.length * 4 + Math.floor(Math.random() * 3);
        const scheduledFor = new Date(Date.now() + hoursOffset * 60 * 60 * 1000);
        if (scheduledFor.getHours() < 7) scheduledFor.setHours(7 + Math.floor(Math.random() * 3));
        if (scheduledFor.getHours() > 22) { scheduledFor.setDate(scheduledFor.getDate() + 1); scheduledFor.setHours(8); }

        const platformMap: Record<string, string> = { facebookx: 'facebook', instagram: 'instagram', tiktok: 'tiktok', youtube: 'twitter' };
        const res = await fetch('/api/social?action=create-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: platformMap[post.platform] || post.platform,
            content: `${post.hook}\n\n${post.content}`,
            mediaUrls: post.imageUrl ? [post.imageUrl] : [],
            scheduledFor: scheduledFor.toISOString(),
          }),
        });
        if (res.ok) { scheduled.push(post.id); }
        else { errors.push(`${post.platform}: ${(await res.json()).error || 'Failed'}`); }
      } catch (e) { errors.push(`${post.platform}: ${e instanceof Error ? e.message : 'Unknown'}`); }
    }

    setPreviewPosts(prev => prev.map(p =>
      scheduled.includes(p.id) ? { ...p, status: 'confirmed' as ApprovalStatus } : p
    ));
    setShowConfirmModal(false);
    setIsScheduling(false);
    if (activeTab === 'schedule') await loadScheduledPosts();

    if (errors.length > 0) {
      alert(`Scheduled ${scheduled.length} posts. ${errors.length} failed:\n${errors.join('\n')}`);
    } else {
      alert(`✅ ${scheduled.length} posts scheduled! They'll auto-publish via the cron job.`);
    }
  };

  // Generate visual for a low-confidence post manually
  const generateVisualForPost = async (postId: string) => {
    setGeneratingVisual(prev => ({ ...prev, [postId]: true }));
    
    // TODO: API STUB - In production, call DALL-E/Flux API
    // const response = await fetch('/api/social/generate-image', {
    //   method: 'POST',
    //   body: JSON.stringify({ postId, prompt: post.hook })
    // });
    
    // Simulate generation delay
    setTimeout(() => {
      setPreviewPosts(prev => prev.map(p => 
        p.id === postId ? { ...p, imageUrl: `https://picsum.photos/seed/${postId}/400/400` } : p
      ));
      setGeneratingVisual(prev => ({ ...prev, [postId]: false }));
    }, 2000);
  };

  // Get posts filtered by platform and current niche
  const getFilteredPreviewPosts = (platformId: PlatformId): PreviewPost[] => {
    return previewPosts.filter(p => p.platform === platformId);
  };

  // Get approved posts count for confirm button badge
  const approvedCount = previewPosts.filter(p => p.status === 'approved').length;

  // ============================================================
  // PLATFORM-SPECIFIC PREVIEW COMPONENTS
  // ============================================================

  // TikTok-style post card
  const TikTokPostCard = ({ post }: { post: PreviewPost }) => (
    <div className="preview-card tiktok-card mb-3 rounded-xl overflow-hidden border border-[#27272a] bg-[#0d0d12]">
      {/* TikTok-style vertical preview */}
      <div className="relative" style={{ aspectRatio: post.imageUrl ? '9/16' : 'auto', maxHeight: '320px' }}>
        {post.imageUrl ? (
          <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="p-4 bg-[#0d0d12] min-h-[180px] flex flex-col justify-center">
            <p className="text-sm text-[#a1a1aa] whitespace-pre-wrap line-clamp-6">{post.content}</p>
          </div>
        )}
        {/* TikTok overlay UI */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          <p className="text-white text-sm font-semibold leading-tight mb-1">{post.hook}</p>
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span>🎵 {post.cluster || post.niche}</span>
            <span>•</span>
            <span>{post.tone ? `${post.tone} tone` : post.estimatedEngagement}</span>
          </div>
        </div>
        {/* TikTok side icons */}
        <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3">
          <div className="flex flex-col items-center"><span className="text-lg">❤️</span><span className="text-[10px] text-white/80">12.5K</span></div>
          <div className="flex flex-col items-center"><span className="text-lg">💬</span><span className="text-[10px] text-white/80">843</span></div>
          <div className="flex flex-col items-center"><span className="text-lg">🔖</span><span className="text-[10px] text-white/80">2.1K</span></div>
        </div>
        {/* Confidence badge */}
        <div className={`absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-medium border ${getConfidenceBg(post.confidence)}`}>
          <span className={getConfidenceColor(post.confidence)}>{post.confidence}%</span>
        </div>
      </div>
      {/* No image: Generate Visual button */}
      {!post.imageUrl && post.confidence < 75 && (
        <div className="px-3 pt-2">
          <button 
            onClick={() => generateVisualForPost(post.id)}
            disabled={generatingVisual[post.id]}
            className="w-full py-2 text-xs bg-[#1a1a24] border border-[#27272a] rounded-lg hover:border-[#a855f7] transition-colors flex items-center justify-center gap-1.5"
          >
            {generatingVisual[post.id] ? (
              <><span className="w-3 h-3 border-2 border-[#a855f7] border-t-transparent rounded-full animate-spin"></span> Generating...</>
            ) : (
              <>🎨 Generate Visual</>
            )}
          </button>
        </div>
      )}
      {/* Action buttons */}
      {renderPostActions(post)}
    </div>
  );

  // Instagram-style post card
  const InstagramPostCard = ({ post }: { post: PreviewPost }) => (
    <div className="preview-card ig-card mb-3 rounded-xl overflow-hidden border border-[#27272a] bg-[#0d0d12]">
      {/* IG Header */}
      <div className="flex items-center gap-2 p-3 border-b border-[#1a1a24]">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs">📸</div>
        <div className="flex-1">
          <p className="text-xs font-semibold">{post.niche}</p>
          <p className="text-[10px] text-[#71717a]">{post.type}</p>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getConfidenceBg(post.confidence)}`}>
          <span className={getConfidenceColor(post.confidence)}>{post.confidence}%</span>
        </div>
      </div>
      {/* IG Image */}
      {post.imageUrl ? (
        <div style={{ aspectRatio: post.type === 'reel' ? '9/16' : '1/1', maxHeight: '300px' }}>
          <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="p-4 bg-[#0a0a0f] min-h-[160px] flex flex-col justify-center border-y border-[#1a1a24]">
          <p className="text-sm text-[#a1a1aa] whitespace-pre-wrap line-clamp-6">{post.content}</p>
        </div>
      )}
      {/* IG Engagement bar */}
      <div className="p-3 border-t border-[#1a1a24]">
        <div className="flex items-center gap-4 mb-2">
          <span className="text-lg cursor-pointer hover:scale-110 transition-transform">❤️</span>
          <span className="text-lg cursor-pointer hover:scale-110 transition-transform">💬</span>
          <span className="text-lg cursor-pointer hover:scale-110 transition-transform">📤</span>
          <span className="ml-auto text-lg cursor-pointer hover:scale-110 transition-transform">🔖</span>
        </div>
        <p className="text-xs font-semibold mb-1">{post.estimatedEngagement}</p>
        <p className="text-xs text-[#a1a1aa]"><span className="font-semibold text-white">{post.niche}</span> {post.hook}</p>
        <p className="text-[10px] text-[#71717a] mt-1">Best time: {post.bestTime}</p>
      </div>
      {/* No image: Generate Visual button */}
      {!post.imageUrl && post.confidence < 75 && (
        <div className="px-3 pb-1">
          <button 
            onClick={() => generateVisualForPost(post.id)}
            disabled={generatingVisual[post.id]}
            className="w-full py-2 text-xs bg-[#1a1a24] border border-[#27272a] rounded-lg hover:border-[#a855f7] transition-colors flex items-center justify-center gap-1.5"
          >
            {generatingVisual[post.id] ? (
              <><span className="w-3 h-3 border-2 border-[#a855f7] border-t-transparent rounded-full animate-spin"></span> Generating...</>
            ) : (
              <>🎨 Generate Visual</>
            )}
          </button>
        </div>
      )}
      {renderPostActions(post)}
    </div>
  );

  // YouTube-style post card
  const YouTubePostCard = ({ post }: { post: PreviewPost }) => (
    <div className="preview-card yt-card mb-3 rounded-xl overflow-hidden border border-[#27272a] bg-[#0d0d12]">
      {/* YT Thumbnail */}
      {post.imageUrl ? (
        <div className="relative" style={{ aspectRatio: '16/9' }}>
          <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">12:34</div>
          <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium border ${getConfidenceBg(post.confidence)}`}>
            <span className={getConfidenceColor(post.confidence)}>{post.confidence}%</span>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-[#0a0a0f] min-h-[120px] flex flex-col justify-center border-b border-[#1a1a24]">
          <p className="text-sm text-[#a1a1aa] whitespace-pre-wrap line-clamp-4">{post.content}</p>
        </div>
      )}
      {/* YT Info */}
      <div className="p-3">
        <div className="flex gap-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-sm flex-shrink-0">▶️</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight line-clamp-2 mb-1">{post.hook}</p>
            <p className="text-[10px] text-[#71717a]">{post.niche} • {post.estimatedEngagement} • {post.bestTime}</p>
          </div>
        </div>
      </div>
      {!post.imageUrl && post.confidence < 75 && (
        <div className="px-3 pb-1">
          <button 
            onClick={() => generateVisualForPost(post.id)}
            disabled={generatingVisual[post.id]}
            className="w-full py-2 text-xs bg-[#1a1a24] border border-[#27272a] rounded-lg hover:border-[#a855f7] transition-colors flex items-center justify-center gap-1.5"
          >
            {generatingVisual[post.id] ? (
              <><span className="w-3 h-3 border-2 border-[#a855f7] border-t-transparent rounded-full animate-spin"></span> Generating...</>
            ) : (
              <>🎨 Generate Visual</>
            )}
          </button>
        </div>
      )}
      {renderPostActions(post)}
    </div>
  );

  // Facebook-style post card
  const FacebookPostCard = ({ post }: { post: PreviewPost }) => (
    <div className="preview-card fb-card mb-3 rounded-xl overflow-hidden border border-[#27272a] bg-[#0d0d12]">
      {/* FB Header */}
      <div className="flex items-center gap-2 p-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-sm">🌐</div>
        <div className="flex-1">
          <p className="text-sm font-semibold">{post.niche}</p>
          <p className="text-[10px] text-[#71717a]">{post.bestTime} · 🌍</p>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getConfidenceBg(post.confidence)}`}>
          <span className={getConfidenceColor(post.confidence)}>{post.confidence}%</span>
        </div>
      </div>
      {/* FB Content */}
      <div className="px-3 pb-2">
        <p className="text-sm text-[#e4e4e7] whitespace-pre-wrap line-clamp-4">{post.hook}</p>
        {post.content.length > post.hook.length && (
          <p className="text-xs text-[#71717a] mt-1 whitespace-pre-wrap line-clamp-3">{post.content.slice(post.hook.length)}</p>
        )}
      </div>
      {/* FB Image */}
      {post.imageUrl ? (
        <div style={{ aspectRatio: '1.91/1' }}>
          <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      ) : null}
      {/* FB Reactions bar */}
      <div className="px-3 py-2 border-t border-[#1a1a24]">
        <div className="flex items-center justify-between text-xs text-[#71717a] mb-2">
          <span>👍❤️ {post.estimatedEngagement}</span>
          <span>24 comments · 8 shares</span>
        </div>
        <div className="flex border-t border-[#1a1a24] pt-2 gap-1">
          <button className="flex-1 py-1.5 text-xs text-[#71717a] hover:bg-[#1a1a24] rounded-lg transition-colors">👍 Like</button>
          <button className="flex-1 py-1.5 text-xs text-[#71717a] hover:bg-[#1a1a24] rounded-lg transition-colors">💬 Comment</button>
          <button className="flex-1 py-1.5 text-xs text-[#71717a] hover:bg-[#1a1a24] rounded-lg transition-colors">📤 Share</button>
        </div>
      </div>
      {!post.imageUrl && post.confidence < 75 && (
        <div className="px-3 pb-2">
          <button 
            onClick={() => generateVisualForPost(post.id)}
            disabled={generatingVisual[post.id]}
            className="w-full py-2 text-xs bg-[#1a1a24] border border-[#27272a] rounded-lg hover:border-[#a855f7] transition-colors flex items-center justify-center gap-1.5"
          >
            {generatingVisual[post.id] ? (
              <><span className="w-3 h-3 border-2 border-[#a855f7] border-t-transparent rounded-full animate-spin"></span> Generating...</>
            ) : (
              <>🎨 Generate Visual</>
            )}
          </button>
        </div>
      )}
      {renderPostActions(post)}
    </div>
  );

  // Shared action buttons for all platform cards
  const renderPostActions = (post: PreviewPost) => (
    <div className="p-2 border-t border-[#1a1a24]">
      {post.status === 'pending' && (
        <div className="flex gap-1.5">
          <button onClick={() => startEditPost(post.id)} className="py-1.5 px-2 bg-[#a855f7]/10 text-[#a855f7] rounded-lg text-xs font-medium hover:bg-[#a855f7]/20 transition-colors flex items-center justify-center gap-1">
            ✏️
          </button>
          <button onClick={() => approvePost(post.id)} className="flex-1 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors flex items-center justify-center gap-1">
            ✅ Approve
          </button>
          <button onClick={() => rejectPost(post.id)} className="flex-1 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1">
            ✕ Reject
          </button>
        </div>
      )}
      {post.status === 'approved' && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-green-400 font-medium flex items-center gap-1">✅ Approved — awaiting confirmation</span>
          <button onClick={() => resetPostStatus(post.id)} className="text-[10px] text-[#71717a] hover:text-white underline">Undo</button>
        </div>
      )}
      {post.status === 'rejected' && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-red-400 font-medium flex items-center gap-1">✕ Rejected</span>
          <button onClick={() => resetPostStatus(post.id)} className="text-[10px] text-[#71717a] hover:text-white underline">Undo</button>
        </div>
      )}
      {post.status === 'confirmed' && (
        <div className="flex items-center justify-center">
          <span className="text-xs text-[#a855f7] font-medium flex items-center gap-1">🚀 Confirmed — queued for posting</span>
        </div>
      )}
    </div>
  );

  // Render the correct card component based on platform
  const renderPlatformPostCard = (post: PreviewPost) => {
    switch (post.platform) {
      case 'tiktok': return <TikTokPostCard key={post.id} post={post} />;
      case 'instagram': return <InstagramPostCard key={post.id} post={post} />;
      case 'youtube': return <YouTubePostCard key={post.id} post={post} />;
      case 'facebookx': return <FacebookPostCard key={post.id} post={post} />;
      default: return null;
    }
  };

  // ============================================================
  // RENDER - CAPTURE TAB (MODIFIED: larger panels + mode toggle + focus)
  // ============================================================
  const renderCaptureTab = () => (
    <>
      {/* Webhook Config Panel - UNCHANGED */}
      {showWebhookConfig && (
        <div className="mb-6 bg-[#12121a] border border-[#27272a] rounded-2xl p-6 animate-slide-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">🔗 Zapier Webhook Configuration</h3>
            <button onClick={toggleWebhookConfig} className="text-[#71717a] hover:text-white">✕</button>
          </div>
          <p className="text-[#71717a] text-sm mb-4">Configure your Zapier webhook URLs for each platform to enable one-click posting.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {socialPlatforms.map(platform => (
              <div key={platform.id}>
                <label className="block text-sm font-medium mb-2">{platform.icon} {platform.name} Webhook</label>
                <input 
                  type="url"
                  value={webhookConfig[platform.id] || ''}
                  onChange={(e) => updateWebhook(platform.id, e.target.value)}
                  placeholder="https://hooks.zapier.com/..."
                  className="w-full px-4 py-2 bg-[#1a1a24] border border-[#27272a] rounded-xl text-sm focus:border-[#a855f7] focus:outline-none"
                />
              </div>
            ))}
          </div>
          <button onClick={saveWebhookConfig} className="mt-4 px-6 py-2 bg-[#a855f7] text-white rounded-xl text-sm font-medium hover:bg-[#ec4899] transition-colors">
            Save Configuration
          </button>
        </div>
      )}

      {/* NEW: Approved posts confirm bar */}
      {approvedCount > 0 && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-between animate-slide-in">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 text-sm">✅</span>
            <span className="text-sm text-green-400 font-medium">{approvedCount} post{approvedCount !== 1 ? 's' : ''} approved — ready for final confirmation</span>
          </div>
          <button 
            onClick={() => setShowConfirmModal(true)}
            className="px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors"
          >
            Confirm & Queue All
          </button>
        </div>
      )}

      {/* AI Intelligence Bar — Scan All + Auto Schedule + Stats */}
      <div className="mb-4 p-4 bg-[#12121a] border border-[#27272a] rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-lg">🧠</span>
            <div>
              <h4 className="text-sm font-semibold">AI Friend Intelligence</h4>
              <p className="text-[10px] text-[#71717a]">{scrollStats.friendPosts} friend posts analyzed · {scrollStats.adsSkipped} ads skipped · {clusters.length} clusters identified</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={startFullScan} className="px-4 py-2 bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M12 2a10 10 0 110 20 10 10 0 010-20z"/><path d="M12 6v6l4 2"/></svg>
              Scan All Platforms
            </button>
            <button onClick={autoScheduleApproved} className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl text-xs font-semibold hover:bg-green-500/30 transition-colors flex items-center gap-2">
              ⚡ Auto-Schedule ({previewPosts.filter(p => p.confidence >= 85 && p.status !== 'confirmed').length})
            </button>
          </div>
        </div>
        {/* Cluster summary bar */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {clusters.map(c => (
            <div key={c.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0d0d12] rounded-lg flex-shrink-0">
              <span className="text-sm">{c.icon}</span>
              <span className="text-[10px] font-medium text-white">{c.name}</span>
              <span className="text-[9px] text-[#71717a]">{c.members}</span>
              <span className={`text-[9px] font-bold ${c.engagementRate > 4 ? 'text-green-400' : c.engagementRate > 3 ? 'text-yellow-400' : 'text-[#71717a]'}`}>{c.engagementRate}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4 Social Media Browser Panels - 2x2 Grid with Focus Mode */}
      <div className={`grid gap-4 mb-6 ${focusedPanel ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        {socialPlatforms.map(platform => {
          const isFocused = focusedPanel === platform.id;
          const isCollapsed = focusedPanel !== null && !isFocused;
          const mode = panelModes[platform.id];
          const platformPosts = getFilteredPreviewPosts(platform.id);
          
          if (isCollapsed) {
            // Collapsed panel - minimal bar
            return (
              <div key={platform.id} 
                onClick={() => toggleFocusPanel(platform.id)}
                className="flex items-center gap-3 p-3 bg-[#12121a] border border-[#27272a] rounded-xl cursor-pointer hover:border-[#a855f7]/50 transition-all"
              >
                <div className={`w-8 h-8 bg-gradient-to-br ${platform.color} rounded-lg flex items-center justify-center text-white text-sm`}>
                  {platform.icon}
                </div>
                <span className="text-sm font-medium">{platform.name}</span>
                <span className="text-[10px] text-[#71717a] ml-auto">Click to expand</span>
              </div>
            );
          }
          
          return (
            <div key={platform.id} className={`gradient-border transition-all duration-300 ${isFocused ? 'col-span-full' : ''}`}>
              <div className="gradient-border-inner p-5">
                {/* Panel Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 bg-gradient-to-br ${platform.color} rounded-xl flex items-center justify-center text-white text-lg`}>
                      {platform.icon}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">{platform.name}</h3>
                      <p className="text-[#71717a] text-xs">
                        {mode === 'browse' ? 'Browser placeholder - Electron/Extension integration pending' : `${platformPosts.length} AI-generated posts`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Recording badge */}
                    {browserStates[platform.id].isRecording && (
                      <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs flex items-center gap-1">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                        Recording
                      </span>
                    )}
                    
                    {/* NEW: Mode toggle pill */}
                    <div className="flex bg-[#0d0d12] rounded-lg p-0.5 border border-[#27272a]">
                      <button 
                        onClick={() => setPanelModes(prev => ({ ...prev, [platform.id]: 'browse' }))}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'browse' ? 'bg-[#a855f7] text-white' : 'text-[#71717a] hover:text-white'}`}
                      >
                        🔍 Browse
                      </button>
                      <button 
                        onClick={() => setPanelModes(prev => ({ ...prev, [platform.id]: 'preview' }))}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'preview' ? 'bg-[#a855f7] text-white' : 'text-[#71717a] hover:text-white'}`}
                      >
                        🎨 Preview
                      </button>
                    </div>

                    {/* NEW: Focus/expand button */}
                    <button 
                      onClick={() => toggleFocusPanel(platform.id)}
                      className="w-8 h-8 bg-[#0d0d12] border border-[#27272a] rounded-lg flex items-center justify-center text-[#71717a] hover:text-white hover:border-[#a855f7]/50 transition-all"
                      title={isFocused ? 'Collapse to grid' : 'Expand panel'}
                    >
                      {isFocused ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                          <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                          <line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                          <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                          <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                
                {/* Panel Content Area - LARGER HEIGHT */}
                {mode === 'browse' ? (
                  // AI AUTO-SCROLL MODE — Live feed intelligence scanner
                  <div className="mb-4 min-h-[280px]">
                    {isAutoScrolling[platform.id] ? (
                      // SCROLLING — live activity view
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          <span className="text-xs text-green-400 font-medium">AI Scrolling {platform.name} feed...</span>
                        </div>
                        {/* Live scroll stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-[#0d0d12] rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-white">{scrollSessions[0]?.platform === platform.id ? scrollSessions[0].friendPostsFound : 0}</p>
                            <p className="text-[8px] uppercase tracking-wider text-green-400">Friends Found</p>
                          </div>
                          <div className="bg-[#0d0d12] rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-[#71717a]">{scrollSessions[0]?.platform === platform.id ? scrollSessions[0].adsSkipped : 0}</p>
                            <p className="text-[8px] uppercase tracking-wider text-red-400">Ads Skipped</p>
                          </div>
                          <div className="bg-[#0d0d12] rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-[#71717a]">{scrollSessions[0]?.platform === platform.id ? scrollSessions[0].suggestionsSkipped : 0}</p>
                            <p className="text-[8px] uppercase tracking-wider text-yellow-400">Suggested Skipped</p>
                          </div>
                        </div>
                        {/* Simulated scrolling feed items */}
                        <div className="space-y-1 max-h-[120px] overflow-hidden">
                          {(scrollSessions[0]?.clustersUpdated || []).slice(-4).map((c, i) => (
                            <div key={i} className="flex items-center gap-2 px-2 py-1 bg-[#0d0d12] rounded text-xs animate-slide-in" style={{ animationDelay: `${i * 0.1}s` }}>
                              <span className="text-green-400">✓</span>
                              <span className="text-[#a1a1aa]">Learned from</span>
                              <span className="text-white font-medium">{c}</span>
                              <span className="text-[#71717a]">cluster</span>
                            </div>
                          ))}
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-[#0d0d12] rounded-full h-1.5">
                          <div className="bg-gradient-to-r from-[#06b6d4] to-[#a855f7] h-1.5 rounded-full transition-all" style={{ width: `${Math.min(((scrollSessions[0]?.postsScanned || 0) / 50) * 100, 100)}%` }}></div>
                        </div>
                      </div>
                    ) : (
                      // IDLE — show cluster intelligence summary
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#71717a]">Friend Intelligence</span>
                          <span className="text-[8px] uppercase tracking-wider text-[#71717a]">
                            Last scan: {scrollStats.lastFullScan ? `${Math.round((Date.now() - new Date(scrollStats.lastFullScan).getTime()) / 3600000)}h ago` : 'Never'}
                          </span>
                        </div>
                        {/* Cluster cards for this platform */}
                        <div className="space-y-2">
                          {clusters.filter(c => c.platformStrength === platform.id).map(c => (
                            <div key={c.id} className="flex items-center gap-3 p-2 bg-[#0d0d12] rounded-lg">
                              <span className="text-lg">{c.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white">{c.name} <span className="text-[#71717a]">({c.members})</span></p>
                                <p className="text-[10px] text-[#71717a] truncate">{c.interests.slice(0, 3).join(', ')}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-[#06b6d4]">{c.engagementRate}%</p>
                                <p className="text-[8px] text-[#71717a]">engage</p>
                              </div>
                            </div>
                          ))}
                          {clusters.filter(c => c.platformStrength === platform.id).length === 0 && (
                            <div className="text-center py-4 text-[#71717a] text-xs">
                              <p>No primary clusters for {platform.name}</p>
                              <p className="text-[10px] mt-1">Run AI Scroll to discover friend patterns</p>
                            </div>
                          )}
                        </div>
                        {/* Global stats mini */}
                        <div className="flex gap-2 text-center">
                          <div className="flex-1 bg-[#0d0d12] rounded p-1.5">
                            <p className="text-sm font-bold text-white">{scrollStats.friendPosts}</p>
                            <p className="text-[7px] uppercase text-[#71717a]">Friends Tracked</p>
                          </div>
                          <div className="flex-1 bg-[#0d0d12] rounded p-1.5">
                            <p className="text-sm font-bold text-red-400">{scrollStats.adsSkipped}</p>
                            <p className="text-[7px] uppercase text-[#71717a]">Ads Skipped</p>
                          </div>
                          <div className="flex-1 bg-[#0d0d12] rounded p-1.5">
                            <p className="text-sm font-bold text-[#a855f7]">{clusters.length}</p>
                            <p className="text-[7px] uppercase text-[#71717a]">Clusters</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // PREVIEW MODE - Scrollable AI-generated post feed
                  <div className={`preview-feed-container mb-4 overflow-y-auto pr-1 ${isFocused ? 'preview-feed-focused' : 'preview-feed-default'}`}>
                    {platformPosts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-[#71717a]">
                        <span className="text-3xl mb-3">🎨</span>
                        <p className="text-sm font-medium">No posts generated yet</p>
                        <p className="text-xs mt-1">AI will generate posts as confidence builds</p>
                      </div>
                    ) : (
                      <div className={isFocused ? 'grid grid-cols-2 lg:grid-cols-3 gap-3' : ''}>
                        {platformPosts.map(post => renderPlatformPostCard(post))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Action buttons - only show in Browse mode */}
                {mode === 'browse' && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => isAutoScrolling[platform.id] ? stopAutoScroll(platform.id) : startAutoScroll(platform.id)} 
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium transition-all ${isAutoScrolling[platform.id] ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white'}`}
                    >
                      {isAutoScrolling[platform.id] ? (
                        <><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span> Stop Scroll</>
                      ) : (
                        <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 2a10 10 0 110 20 10 10 0 010-20z"/><path d="M12 6v6l4 2"/></svg> AI Scroll</>
                      )}
                    </button>
                    
                    <button onClick={() => toggleRecording(platform.id)} className={`flex-1 flex items-center justify-center gap-2 p-3 bg-[#1a1a24] rounded-xl hover:bg-[#27272a] transition-colors text-sm ${browserStates[platform.id].isRecording ? 'recording' : ''}`} title={browserStates[platform.id].isRecording ? 'Stop recording' : 'Start screen recording'}>
                      <div className="w-3 h-3 bg-red-500 rounded-full record-dot"></div>
                      <span>{browserStates[platform.id].isRecording ? 'Stop' : 'Record'}</span>
                    </button>
                    
                    <button onClick={() => postToZapier(platform.id)} className="flex-1 flex items-center justify-center gap-2 p-3 bg-[#a855f7] text-white rounded-xl hover:bg-[#ec4899] transition-colors text-sm" title="Post content via Zapier webhook">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M22 2L11 13"/>
                        <path d="M22 2L15 22L11 13L2 9L22 2Z"/>
                      </svg>
                      <span>Post</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Section: How It Works + Upcoming Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
          <h3 className="font-semibold mb-4">How It Works</h3>
          <div className="space-y-4">
            {[
              { step: 1, title: 'Generate Content', desc: 'AI creates organic captions + images per platform from your product catalog' },
              { step: 2, title: 'Review & Approve', desc: 'Preview posts on each platform, approve the ones you like, reject the rest' },
              { step: 3, title: 'Confirm & Schedule', desc: 'Approved posts are queued with auto-spaced times (4h apart, 7am–10pm)' },
              { step: 4, title: 'Auto-Publish', desc: 'Cron posts to your personal accounts via API. Zapier fires as fallback if direct fails' },
              { step: 5, title: 'Track & Boost', desc: 'Monitor engagement. Top performers get flagged for paid ad boost later' },
            ].map(item => (
              <div key={item.step} className="flex gap-4">
                <div className="w-8 h-8 bg-[#a855f7]/10 rounded-full flex items-center justify-center text-[#a855f7] font-bold text-sm flex-shrink-0">{item.step}</div>
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-[#71717a]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Upcoming Schedule</h3>
            <span className="text-sm text-[#71717a]">{scheduledPosts.filter(p => p.status === 'scheduled').length} queued</span>
          </div>
          
          {scheduledPosts.filter(p => p.status === 'scheduled').length === 0 ? (
            <div className="text-center py-8 text-[#71717a]">
              <p>No upcoming posts</p>
              <p className="text-sm mt-1">Go to Generate → approve posts → Confirm & Queue</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {scheduledPosts.filter(p => p.status === 'scheduled').slice(0, 8).map((post: any) => (
                <div key={post.id} className="flex items-center gap-3 p-3 bg-[#1a1a24] rounded-xl">
                  <div className="text-xl">
                    {({ instagram: '📸', facebook: '📘', tiktok: '🎵', twitter: '𝕏' } as Record<string, string>)[post.platform] || '📱'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{(post.content || '').substring(0, 50)}</p>
                    <p className="text-xs text-[#71717a]">
                      {post.scheduled_for ? `${new Date(post.scheduled_for).toLocaleDateString()} at ${new Date(post.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No time set'}
                    </p>
                  </div>
                  <span className="text-xs text-[#06b6d4]">⏳</span>
                </div>
              ))}
            </div>
          )}

          {scheduledPosts.filter(p => p.status === 'scheduled').length > 0 && (
            <button onClick={() => { setActiveTab('schedule'); setScheduleView('queue'); }} className="w-full mt-4 py-3 bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white rounded-xl font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-3">
              📅 View Full Schedule
            </button>
          )}
        </div>
      </div>
    </>
  );

  // ============================================================
  // RENDER - PATTERNS TAB (UNCHANGED)
  // ============================================================
  const renderPatternsTab = () => (
    <>
      {!patterns ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-[#1a1a24] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10 text-[#71717a]">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">No Patterns Yet</h3>
          <p className="text-[#71717a] mb-6">Upload and analyze your feed to discover winning patterns</p>
          <button onClick={() => setActiveTab('capture')} className="px-6 py-2 bg-[#a855f7] text-white rounded-xl">Go to Capture</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hook Patterns */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">🎣 Top Hook Patterns</h3>
              <div className="space-y-3">
                {patterns.hooks.map((hook, i) => (
                  <div key={i} className="p-3 bg-[#1a1a24] rounded-xl">
                    <p className="text-sm font-medium mb-2">&quot;{hook.template}&quot;</p>
                    <div className="flex justify-between text-xs text-[#71717a]">
                      <span>Used {hook.usage}x</span>
                      <span>Avg {formatNumber(hook.avgEngagement)} eng</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Format Analysis */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">📊 Winning Formats</h3>
              <div className="space-y-4">
                {patterns.formats.map((format, i) => (
                  <div key={i}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">{format.type}</span>
                      <span className="text-sm text-[#71717a]">{format.percentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-[#1a1a24] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#06b6d4] to-[#a855f7]" style={{ width: `${format.percentage}%` }}></div>
                    </div>
                    <p className="text-xs text-[#71717a] mt-1">Avg {formatNumber(format.avgEngagement)} engagement</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Trending Topics */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">🔥 Hot Topics</h3>
              <div className="space-y-3">
                {patterns.topics.map((topic, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[#1a1a24] rounded-xl">
                    <div>
                      <p className="text-sm font-medium">{topic.topic}</p>
                      <p className="text-xs text-[#71717a]">{topic.posts} posts</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${topic.trend === 'rising' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                      {topic.trend === 'rising' ? '↑ Rising' : '→ Stable'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Insights */}
            <div className="lg:col-span-2 bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">💡 Key Insights</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {patterns.insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-[#1a1a24] rounded-xl">
                    <div className="w-6 h-6 bg-[#10b981]/10 rounded-full flex items-center justify-center text-[#10b981] flex-shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                    <p className="text-sm">{insight}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Best Times */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">⏰ Best Times to Post</h3>
              <div className="space-y-3">
                {patterns.bestTimes.map((time, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[#1a1a24] rounded-xl">
                    <div>
                      <p className="text-sm font-medium">{time.day}</p>
                      <p className="text-xs text-[#71717a]">{time.time}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${time.engagement === 'highest' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                      {time.engagement}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <button onClick={generatePosts} className="px-8 py-4 bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Generate Winning Posts
            </button>
          </div>
        </>
      )}
    </>
  );

  // ============================================================
  // RENDER - GENERATE TAB (UNCHANGED)
  // ============================================================
  const renderGenerateTab = () => (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-[#71717a]">Filter by platform:</span>
        {(['all', 'instagram', 'twitter', 'linkedin', 'tiktok'] as FilterPlatform[]).map(platform => (
          <button key={platform} onClick={() => filterPlatform(platform)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedPlatform === platform ? 'bg-[#a855f7] text-white' : 'bg-[#12121a] text-[#a1a1aa] hover:text-white'}`}>
            {platform === 'all' ? 'All Platforms' : platform.charAt(0).toUpperCase() + platform.slice(1)}
          </button>
        ))}
      </div>

      {generatedPosts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-[#1a1a24] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10 text-[#71717a]">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">No Posts Generated Yet</h3>
          <p className="text-[#71717a] mb-6">Analyze your feed patterns first, then generate winning content</p>
          <button onClick={() => setActiveTab('capture')} className="px-6 py-2 bg-[#a855f7] text-white rounded-xl">Start Capturing</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {generatedPosts.filter(post => selectedPlatform === 'all' || post.platform === selectedPlatform).map(post => (
              <div key={post.id} className="bg-[#12121a] border border-[#27272a] rounded-2xl overflow-hidden animate-slide-in">
                <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#1a1a24] rounded-full flex items-center justify-center text-xl">{getPlatformIcon(post.platform)}</div>
                    <div>
                      <p className="font-medium capitalize">{post.platform}</p>
                      <p className="text-xs text-[#71717a] capitalize">{post.type}</p>
                    </div>
                  </div>
                  <span className={`text-sm ${getConfidenceColor(post.confidence)}`}>{post.confidence}% match</span>
                </div>

                <div className="p-4">
                  <div className="bg-[#1a1a24] rounded-xl p-4 mb-4">
                    <p className="text-sm font-semibold text-[#06b6d4] mb-2">Hook:</p>
                    <p className="text-lg font-medium mb-4">&quot;{post.hook}&quot;</p>
                    <div className="max-h-48 overflow-y-auto text-sm text-[#a1a1aa] whitespace-pre-wrap">{post.content}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-[#1a1a24] rounded-lg p-3">
                      <p className="text-[#71717a] mb-1">Expected Engagement</p>
                      <p className="font-medium">{post.estimatedEngagement}</p>
                    </div>
                    <div className="bg-[#1a1a24] rounded-lg p-3">
                      <p className="text-[#71717a] mb-1">Best Time</p>
                      <p className="font-medium">{post.bestTime}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-[#27272a] flex gap-2">
                  <button onClick={() => copyPost(post.id)} className="flex-1 py-2 bg-[#1a1a24] rounded-xl text-sm font-medium hover:bg-[#27272a] transition-colors flex items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy
                  </button>
                  <button className="flex-1 py-2 bg-[#1a1a24] rounded-xl text-sm font-medium hover:bg-[#27272a] transition-colors flex items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                  </button>
                  <button className="flex-1 py-2 bg-[#a855f7] text-white rounded-xl text-sm font-medium hover:bg-[#ec4899] transition-colors flex items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    Schedule
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-6">
            <button onClick={generateMore} className="px-6 py-3 bg-[#12121a] border border-[#27272a] rounded-xl font-medium hover:border-[#a855f7] transition-colors flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Generate More Posts
            </button>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* REMOTION VIDEO STUDIO — Enterprise Video Generation Engine    */}
      {/* ============================================================ */}
      <div className="mt-8 bg-gradient-to-b from-[#12121a] to-[#0d0d12] border border-[#27272a] rounded-2xl overflow-hidden">
        {/* Studio Header */}
        <div className="p-6 border-b border-[#27272a]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center text-xl">🎬</div>
              <div>
                <h3 className="text-lg font-bold">Remotion Video Studio</h3>
                <p className="text-xs text-[#71717a]">AI-powered video generation · React → MP4 · 20 enterprise templates</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-green-500/10 text-green-400 text-[9px] rounded-full font-bold">ENGINE READY</span>
              <span className="px-2 py-1 bg-[#1a1a24] text-[#52525b] text-[9px] rounded-full">Remotion v4.x</span>
            </div>
          </div>
        </div>

        {/* Template Style Selector */}
        <div className="p-6">
          <div className="flex gap-3 mb-6">
            {[
              { id: 'kinetic', label: '✨ Kinetic Typography', desc: 'Base44-style · Light · Text animations', count: 10 },
              { id: 'showcase', label: '🎯 Product Showcase', desc: 'Dark mode · Mockups · Motion graphics', count: 10 },
            ].map(style => (
              <button
                key={style.id}
                onClick={() => setVideoStyle(style.id)}
                className={`flex-1 p-4 rounded-xl border transition-all ${
                  videoStyle === style.id
                    ? 'bg-[#a855f7]/10 border-[#a855f7]/50 shadow-lg shadow-[#a855f7]/10'
                    : 'bg-[#0d0d12] border-[#27272a] hover:border-[#52525b]'
                }`}
              >
                <p className="text-sm font-bold mb-1">{style.label}</p>
                <p className="text-[10px] text-[#71717a]">{style.desc}</p>
                <p className="text-[9px] text-[#52525b] mt-1">{style.count} templates</p>
              </button>
            ))}
          </div>

          {/* STYLE 1: KINETIC TYPOGRAPHY TEMPLATES (Base44 style) */}
          {videoStyle === 'kinetic' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#a1a1aa]">✨ Kinetic Typography Templates — Light Background · Word-by-Word Animations</h4>
                <span className="text-[9px] text-[#52525b]">Click any template to customize → render → schedule</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    id: 'kt-1',
                    name: 'The Vision Opener',
                    preview: 'Imagine being able to build anything',
                    niche: 'StreamsAI',
                    duration: '30s',
                    lines: [
                      { text: 'Imagine being able to', delay: 0, style: 'fade-up' },
                      { text: 'build anything', delay: 1.2, style: 'fade-up-bold' },
                      { text: 'An app. A website. A business.', delay: 3, style: 'fade-word-by-word' },
                      { text: 'Just describe it.', delay: 5, style: 'fade-up' },
                      { text: 'StreamsAI builds it.', delay: 7, style: 'scale-in-bold' },
                      { text: 'From idea to reality in seconds.', delay: 9, style: 'fade-up' },
                      { text: 'Try it free →', delay: 11.5, style: 'pulse-cta' },
                    ],
                    font: 'Inter',
                    bg: '#f5f5f5',
                    textColor: '#1a1a2e',
                    accentColor: '#7c3aed',
                  },
                  {
                    id: 'kt-2',
                    name: 'The Privacy Promise',
                    preview: 'Your health. Your business.',
                    niche: 'MedazonHealth',
                    duration: '25s',
                    lines: [
                      { text: 'Your health.', delay: 0, style: 'fade-up' },
                      { text: 'Your business.', delay: 1.5, style: 'fade-up' },
                      { text: 'Nobody else\'s.', delay: 3, style: 'scale-in-bold' },
                      { text: 'See a board-certified doctor', delay: 5, style: 'fade-word-by-word' },
                      { text: 'from your couch.', delay: 7, style: 'fade-up' },
                      { text: '$1.99 to book.', delay: 9, style: 'scale-in-bold' },
                      { text: '$189 only if YOU are satisfied', delay: 10.5, style: 'fade-up' },
                      { text: 'with your Medazon provider.', delay: 12.5, style: 'fade-up' },
                      { text: 'Not satisfied? It\'s free.', delay: 14.5, style: 'pulse-cta' },
                    ],
                    font: 'Plus Jakarta Sans',
                    bg: '#fafafa',
                    textColor: '#0f172a',
                    accentColor: '#0d9488',
                  },
                  {
                    id: 'kt-3',
                    name: 'The Replacement',
                    preview: 'Stop taking 5 pills.',
                    niche: 'XtremeNad',
                    duration: '30s',
                    lines: [
                      { text: 'Stop taking 5 pills.', delay: 0, style: 'fade-up' },
                      { text: 'Take 1 gummy.', delay: 2, style: 'scale-in-bold' },
                      { text: 'Ashwagandha', delay: 4, style: 'fade-right' },
                      { text: 'Apple Cider Vinegar', delay: 5, style: 'fade-right' },
                      { text: 'NAD+', delay: 6, style: 'fade-right' },
                      { text: 'L-Tyrosine', delay: 7, style: 'fade-right' },
                      { text: 'Garcinia Cambogia', delay: 8, style: 'fade-right' },
                      { text: 'All in one daily gummy.', delay: 10, style: 'fade-up' },
                      { text: '220,000+ people made the switch.', delay: 12, style: 'fade-word-by-word' },
                      { text: 'Free bottle. Just cover shipping.', delay: 14, style: 'pulse-cta' },
                    ],
                    font: 'DM Sans',
                    bg: '#f0fdf4',
                    textColor: '#14532d',
                    accentColor: '#16a34a',
                  },
                  {
                    id: 'kt-4',
                    name: 'The Price Shock',
                    preview: 'They charge $199 before you meet your doctor.',
                    niche: 'MedazonHealth',
                    duration: '25s',
                    lines: [
                      { text: 'Other telehealth:', delay: 0, style: 'fade-up' },
                      { text: '$199 before you even', delay: 1.5, style: 'fade-up' },
                      { text: 'meet your doctor.', delay: 3, style: 'fade-up' },
                      { text: 'Medazon:', delay: 5, style: 'scale-in-bold' },
                      { text: '$1.99 to meet your doctor.', delay: 6.5, style: 'fade-up' },
                      { text: 'Don\'t like them?', delay: 8.5, style: 'fade-up' },
                      { text: 'Walk away. It\'s free.', delay: 10, style: 'scale-in-bold' },
                      { text: 'You decide if we get paid.', delay: 12, style: 'pulse-cta' },
                    ],
                    font: 'Inter',
                    bg: '#ffffff',
                    textColor: '#18181b',
                    accentColor: '#dc2626',
                  },
                  {
                    id: 'kt-5',
                    name: 'The Builder Manifesto',
                    preview: 'You have an idea. We have the AI.',
                    niche: 'StreamsAI',
                    duration: '30s',
                    lines: [
                      { text: 'You have an idea.', delay: 0, style: 'fade-up' },
                      { text: 'We have the AI.', delay: 2, style: 'scale-in-bold' },
                      { text: 'Describe what you want to build.', delay: 4, style: 'fade-word-by-word' },
                      { text: 'An app.', delay: 6.5, style: 'fade-right' },
                      { text: 'A website.', delay: 7.5, style: 'fade-right' },
                      { text: 'A SaaS platform.', delay: 8.5, style: 'fade-right' },
                      { text: 'A tool that changes your industry.', delay: 9.5, style: 'fade-right' },
                      { text: 'Watch it come to life.', delay: 11.5, style: 'fade-up' },
                      { text: 'StreamsAI. Build anything.', delay: 13, style: 'pulse-cta' },
                    ],
                    font: 'Space Grotesk',
                    bg: '#faf5ff',
                    textColor: '#2e1065',
                    accentColor: '#8b5cf6',
                  },
                  {
                    id: 'kt-6',
                    name: 'The Switch Story',
                    preview: 'I was spending $300/month on supplements.',
                    niche: 'XtremeNad',
                    duration: '30s',
                    lines: [
                      { text: 'I was spending', delay: 0, style: 'fade-up' },
                      { text: '$300/month', delay: 1.5, style: 'scale-in-bold' },
                      { text: 'on supplements.', delay: 3, style: 'fade-up' },
                      { text: 'Pre-workout. Vitamins. Focus pills.', delay: 5, style: 'fade-word-by-word' },
                      { text: 'Ashwagandha. ACV.', delay: 7, style: 'fade-word-by-word' },
                      { text: 'Then I found one gummy', delay: 9, style: 'fade-up' },
                      { text: 'that replaced them all.', delay: 10.5, style: 'scale-in-bold' },
                      { text: '$1.95 shipping. Free bottle.', delay: 12.5, style: 'fade-up' },
                      { text: 'Try it yourself →', delay: 14.5, style: 'pulse-cta' },
                    ],
                    font: 'Inter',
                    bg: '#fef2f2',
                    textColor: '#450a0a',
                    accentColor: '#ef4444',
                  },
                  {
                    id: 'kt-7',
                    name: 'The Silent Struggle',
                    preview: 'You can\'t tell your friends.',
                    niche: 'MedazonHealth',
                    duration: '25s',
                    lines: [
                      { text: 'You can\'t tell your friends.', delay: 0, style: 'fade-up' },
                      { text: 'You can\'t sit in a waiting room.', delay: 2.5, style: 'fade-up' },
                      { text: 'You just need to see a doctor.', delay: 5, style: 'fade-up' },
                      { text: 'Privately.', delay: 7, style: 'scale-in-bold' },
                      { text: 'No sign-in sheet. No waiting room.', delay: 8.5, style: 'fade-word-by-word' },
                      { text: 'No one needs to know.', delay: 10.5, style: 'fade-up' },
                      { text: '$1.99. Private. Now.', delay: 12.5, style: 'pulse-cta' },
                    ],
                    font: 'Plus Jakarta Sans',
                    bg: '#f8fafc',
                    textColor: '#0f172a',
                    accentColor: '#6366f1',
                  },
                  {
                    id: 'kt-8',
                    name: 'The Deal Reveal',
                    preview: 'The $14.99 version of everything',
                    niche: 'EvenBetterBuy',
                    duration: '25s',
                    lines: [
                      { text: 'What if I told you', delay: 0, style: 'fade-up' },
                      { text: 'the exact same product', delay: 2, style: 'fade-up' },
                      { text: 'exists for 80% less?', delay: 3.5, style: 'scale-in-bold' },
                      { text: 'Same quality. Same specs.', delay: 5.5, style: 'fade-word-by-word' },
                      { text: 'Different price tag.', delay: 7.5, style: 'fade-up' },
                      { text: 'We find the deals', delay: 9, style: 'fade-up' },
                      { text: 'so you don\'t have to.', delay: 10.5, style: 'fade-up' },
                      { text: 'EvenBetterBuy →', delay: 12, style: 'pulse-cta' },
                    ],
                    font: 'DM Sans',
                    bg: '#fffbeb',
                    textColor: '#451a03',
                    accentColor: '#f59e0b',
                  },
                  {
                    id: 'kt-9',
                    name: 'The Tired Question',
                    preview: 'Why are you always tired?',
                    niche: 'XtremeNad',
                    duration: '30s',
                    lines: [
                      { text: 'Why are you always tired?', delay: 0, style: 'fade-up' },
                      { text: 'Always foggy?', delay: 2, style: 'fade-up' },
                      { text: 'Always unmotivated?', delay: 3.5, style: 'fade-up' },
                      { text: 'It\'s not you.', delay: 5.5, style: 'scale-in-bold' },
                      { text: 'It\'s what you\'re missing.', delay: 7, style: 'fade-up' },
                      { text: 'NAD+ for cellular energy.', delay: 9, style: 'fade-right' },
                      { text: 'Ashwagandha for stress.', delay: 10.5, style: 'fade-right' },
                      { text: 'L-Tyrosine for focus.', delay: 12, style: 'fade-right' },
                      { text: 'One gummy. Everything changes.', delay: 14, style: 'pulse-cta' },
                    ],
                    font: 'Inter',
                    bg: '#ecfdf5',
                    textColor: '#064e3b',
                    accentColor: '#059669',
                  },
                  {
                    id: 'kt-10',
                    name: 'The Code-Free Future',
                    preview: 'No code. No developers. No limits.',
                    niche: 'StreamsAI',
                    duration: '25s',
                    lines: [
                      { text: 'No code.', delay: 0, style: 'scale-in-bold' },
                      { text: 'No developers.', delay: 1.5, style: 'scale-in-bold' },
                      { text: 'No limits.', delay: 3, style: 'scale-in-bold' },
                      { text: 'Just tell the AI what to build.', delay: 5, style: 'fade-up' },
                      { text: '"Build me a booking platform', delay: 7, style: 'fade-word-by-word' },
                      { text: 'with payments and scheduling."', delay: 9, style: 'fade-word-by-word' },
                      { text: 'Done. In seconds.', delay: 11.5, style: 'scale-in-bold' },
                      { text: 'StreamsAI.com →', delay: 13, style: 'pulse-cta' },
                    ],
                    font: 'JetBrains Mono',
                    bg: '#fefce8',
                    textColor: '#1c1917',
                    accentColor: '#ca8a04',
                  },
                ].map(template => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedVideoTemplate(template.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedVideoTemplate === template.id
                        ? 'bg-[#a855f7]/10 border-[#a855f7]/50'
                        : 'bg-[#0a0a0f] border-[#27272a] hover:border-[#52525b]'
                    }`}
                  >
                    {/* Mini preview */}
                    <div className="rounded-lg mb-3 p-4 flex items-center justify-center h-24 relative overflow-hidden" style={{ background: template.bg }}>
                      <p className="text-sm font-semibold text-center leading-tight" style={{ color: template.textColor, fontFamily: template.font }}>{template.preview}</p>
                      <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/20 rounded text-[8px] text-white/80">{template.duration}</div>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-white">{template.name}</p>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${
                        template.niche === 'StreamsAI' ? 'bg-indigo-500/15 text-indigo-400' :
                        template.niche === 'MedazonHealth' ? 'bg-teal-500/15 text-teal-400' :
                        template.niche === 'XtremeNad' ? 'bg-red-500/15 text-red-400' :
                        'bg-amber-500/15 text-amber-400'
                      }`}>{template.niche}</span>
                    </div>
                    <p className="text-[10px] text-[#52525b]">{template.lines.length} scenes · {template.font} · {template.lines.filter(l => l.style === 'scale-in-bold').length} emphasis moments</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STYLE 2: PRODUCT SHOWCASE TEMPLATES (Dark mode · Motion graphics) */}
          {videoStyle === 'showcase' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#a1a1aa]">🎯 Product Showcase Templates — Dark Mode · Mockups · Dynamic Motion</h4>
                <span className="text-[9px] text-[#52525b]">Product images auto-pulled from Shopify/Supabase</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    id: 'ps-1',
                    name: 'The Gummy Reveal',
                    preview: 'Product bottle with ingredient explosion',
                    niche: 'XtremeNad',
                    duration: '30s',
                    scenes: [
                      { type: 'product-spin', asset: 'bottle', duration: 3, text: '' },
                      { type: 'ingredient-explode', asset: 'gummies', duration: 2, text: '5 Ingredients. 1 Gummy.' },
                      { type: 'text-slide', asset: null, duration: 2, text: 'Ashwagandha · ACV · NAD+' },
                      { type: 'text-slide', asset: null, duration: 2, text: 'L-Tyrosine · Garcinia Cambogia' },
                      { type: 'stat-counter', asset: null, duration: 3, text: '220,000+ happy customers' },
                      { type: 'star-rating', asset: null, duration: 2, text: '⭐ 4.9 out of 5' },
                      { type: 'testimonial', asset: 'jessica', duration: 4, text: '"This gummy changed everything." — Jessica K.' },
                      { type: 'cta-pulse', asset: 'bottle', duration: 3, text: 'Free bottle. Just cover $1.95 shipping.' },
                    ],
                    bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 100%)',
                    accentColor: '#22c55e',
                  },
                  {
                    id: 'ps-2',
                    name: 'The App Builder Demo',
                    preview: 'Screen recording of AI building an app',
                    niche: 'StreamsAI',
                    duration: '45s',
                    scenes: [
                      { type: 'screen-record', asset: 'streamsai-ui', duration: 3, text: 'Describe what you want to build...' },
                      { type: 'typing-animation', asset: null, duration: 4, text: '"Build me a fitness tracking app with workout plans and progress charts"' },
                      { type: 'build-animation', asset: 'code-stream', duration: 5, text: 'StreamsAI is building...' },
                      { type: 'mockup-reveal', asset: 'app-preview', duration: 3, text: 'Your app. Built in seconds.' },
                      { type: 'feature-cards', asset: null, duration: 4, text: 'Full stack · Deployed · Ready to use' },
                      { type: 'comparison', asset: null, duration: 3, text: 'Developers: weeks. StreamsAI: seconds.' },
                      { type: 'cta-pulse', asset: 'logo', duration: 3, text: 'Try free at StreamsAI.com' },
                    ],
                    bg: 'linear-gradient(135deg, #0a0a2e 0%, #1a0a0a 100%)',
                    accentColor: '#8b5cf6',
                  },
                  {
                    id: 'ps-3',
                    name: 'The Doctor Match',
                    preview: 'Phone mockup with doctor video call',
                    niche: 'MedazonHealth',
                    duration: '30s',
                    scenes: [
                      { type: 'phone-mockup', asset: 'medazon-app', duration: 3, text: '' },
                      { type: 'screen-flow', asset: 'booking-flow', duration: 4, text: 'Book in 30 seconds' },
                      { type: 'price-compare', asset: null, duration: 4, text: 'Teladoc: $199 | Medazon: $1.99' },
                      { type: 'video-call-mockup', asset: 'doctor-call', duration: 3, text: 'Meet your doctor' },
                      { type: 'text-slide', asset: null, duration: 3, text: 'Not satisfied? Walk away. Free.' },
                      { type: 'trust-badges', asset: null, duration: 2, text: 'Board-Certified · HIPAA · FL Licensed' },
                      { type: 'cta-pulse', asset: 'logo', duration: 3, text: '$1.99. Private. Right now.' },
                    ],
                    bg: 'linear-gradient(135deg, #0a1a1a 0%, #0a0a2e 100%)',
                    accentColor: '#0d9488',
                  },
                  {
                    id: 'ps-4',
                    name: 'The Deal Finder',
                    preview: 'Split-screen brand vs EvenBetterBuy price',
                    niche: 'EvenBetterBuy',
                    duration: '25s',
                    scenes: [
                      { type: 'product-zoom', asset: 'trending-product', duration: 3, text: '' },
                      { type: 'split-compare', asset: 'brand-vs-ebb', duration: 4, text: 'Brand: $49.99 vs Ours: $12.99' },
                      { type: 'spec-match', asset: null, duration: 3, text: 'Same specs. Same quality. 74% less.' },
                      { type: 'product-carousel', asset: 'top-deals', duration: 4, text: 'Today\'s finds:' },
                      { type: 'stat-counter', asset: null, duration: 2, text: '316 products. Always the lowest price.' },
                      { type: 'cta-pulse', asset: 'logo', duration: 3, text: 'Why pay more? EvenBetterBuy.com' },
                    ],
                    bg: 'linear-gradient(135deg, #1a1a0a 0%, #0a0a0a 100%)',
                    accentColor: '#f59e0b',
                  },
                  {
                    id: 'ps-5',
                    name: 'The Transformation Timeline',
                    preview: 'Day 1 → Day 30 energy transformation',
                    niche: 'XtremeNad',
                    duration: '35s',
                    scenes: [
                      { type: 'timeline-bar', asset: null, duration: 2, text: 'Day 1' },
                      { type: 'text-slide', asset: null, duration: 2, text: '"Always tired. Can\'t focus."' },
                      { type: 'timeline-bar', asset: null, duration: 2, text: 'Day 7' },
                      { type: 'text-slide', asset: null, duration: 2, text: '"Wait... I actually have energy?"' },
                      { type: 'timeline-bar', asset: null, duration: 2, text: 'Day 14' },
                      { type: 'text-slide', asset: null, duration: 2, text: '"Brain fog is gone. Completely."' },
                      { type: 'timeline-bar', asset: null, duration: 2, text: 'Day 30' },
                      { type: 'text-slide', asset: null, duration: 2, text: '"I don\'t know how I lived without this."' },
                      { type: 'product-spin', asset: 'bottle', duration: 3, text: '1 gummy. 5 ingredients. Your life, upgraded.' },
                      { type: 'cta-pulse', asset: null, duration: 3, text: 'Free bottle → XtremeNad.com' },
                    ],
                    bg: 'linear-gradient(180deg, #0a0a0a 0%, #0d2818 50%, #0a0a0a 100%)',
                    accentColor: '#22c55e',
                  },
                  {
                    id: 'ps-6',
                    name: 'The Privacy Shield',
                    preview: 'Lock icon animations with private healthcare messaging',
                    niche: 'MedazonHealth',
                    duration: '25s',
                    scenes: [
                      { type: 'icon-animate', asset: 'lock-icon', duration: 2, text: '' },
                      { type: 'text-slide', asset: null, duration: 3, text: 'No waiting room. No sign-in sheet.' },
                      { type: 'text-slide', asset: null, duration: 2, text: 'No one needs to know.' },
                      { type: 'shield-build', asset: 'hipaa-badge', duration: 2, text: 'HIPAA Compliant' },
                      { type: 'phone-mockup', asset: 'medazon-call', duration: 4, text: 'Private video call with your doctor' },
                      { type: 'price-reveal', asset: null, duration: 3, text: '$1.99 booking · Free if unsatisfied' },
                      { type: 'cta-pulse', asset: null, duration: 3, text: 'MedazonHealth.com — Private healthcare' },
                    ],
                    bg: 'linear-gradient(135deg, #0f172a 0%, #020617 100%)',
                    accentColor: '#6366f1',
                  },
                  {
                    id: 'ps-7',
                    name: 'The Ingredient Breakdown',
                    preview: 'Each ingredient zooms in with benefit text',
                    niche: 'XtremeNad',
                    duration: '40s',
                    scenes: [
                      { type: 'text-slide', asset: null, duration: 2, text: '5 ingredients. Here\'s what each one does:' },
                      { type: 'ingredient-card', asset: 'ashwagandha', duration: 4, text: '#1 Ashwagandha — Lowers cortisol. Reduces stress eating. Balances hormones.' },
                      { type: 'ingredient-card', asset: 'acv', duration: 4, text: '#2 Apple Cider Vinegar — Supports metabolism. Improves digestion.' },
                      { type: 'ingredient-card', asset: 'nad', duration: 4, text: '#3 NAD+ — Cellular energy. DNA repair. Anti-aging support.' },
                      { type: 'ingredient-card', asset: 'tyrosine', duration: 4, text: '#4 L-Tyrosine — Focus & mental clarity. No jitters. No crash.' },
                      { type: 'ingredient-card', asset: 'garcinia', duration: 4, text: '#5 Garcinia Cambogia — Supports healthy metabolism. Mood boost.' },
                      { type: 'product-spin', asset: 'bottle', duration: 3, text: 'All 5. One gummy. Daily.' },
                      { type: 'cta-pulse', asset: null, duration: 3, text: 'Free bottle → just $1.95 shipping' },
                    ],
                    bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a2e0a 100%)',
                    accentColor: '#84cc16',
                  },
                  {
                    id: 'ps-8',
                    name: 'The Build Montage',
                    preview: 'Rapid-fire montage of things built with StreamsAI',
                    niche: 'StreamsAI',
                    duration: '30s',
                    scenes: [
                      { type: 'text-slide', asset: null, duration: 2, text: 'People are building with StreamsAI:' },
                      { type: 'mockup-flash', asset: 'app-1', duration: 1.5, text: 'Fitness app' },
                      { type: 'mockup-flash', asset: 'app-2', duration: 1.5, text: 'E-commerce store' },
                      { type: 'mockup-flash', asset: 'app-3', duration: 1.5, text: 'CRM dashboard' },
                      { type: 'mockup-flash', asset: 'app-4', duration: 1.5, text: 'Booking platform' },
                      { type: 'mockup-flash', asset: 'app-5', duration: 1.5, text: 'Social media tool' },
                      { type: 'mockup-flash', asset: 'app-6', duration: 1.5, text: 'Patient portal' },
                      { type: 'text-slide', asset: null, duration: 3, text: 'What will YOU build?' },
                      { type: 'cta-pulse', asset: null, duration: 3, text: 'Try free → StreamsAI.com' },
                    ],
                    bg: 'linear-gradient(135deg, #1a0a2e 0%, #0a0a2e 100%)',
                    accentColor: '#a855f7',
                  },
                  {
                    id: 'ps-9',
                    name: 'The Condition Solver',
                    preview: 'Common conditions with instant care messaging',
                    niche: 'MedazonHealth',
                    duration: '30s',
                    scenes: [
                      { type: 'text-slide', asset: null, duration: 2, text: 'Need to see a doctor for...' },
                      { type: 'condition-card', asset: null, duration: 2, text: 'UTI? → See a doctor now' },
                      { type: 'condition-card', asset: null, duration: 2, text: 'STD testing? → Private, from home' },
                      { type: 'condition-card', asset: null, duration: 2, text: 'Anxiety? → Confidential evaluation' },
                      { type: 'condition-card', asset: null, duration: 2, text: 'Weight loss? → Personalized plan' },
                      { type: 'condition-card', asset: null, duration: 2, text: 'Skin issue? → Photo diagnosis' },
                      { type: 'price-reveal', asset: null, duration: 3, text: 'All conditions. $1.99. Private.' },
                      { type: 'cta-pulse', asset: null, duration: 3, text: '$189 only if YOU are satisfied.' },
                    ],
                    bg: 'linear-gradient(135deg, #0a1a2e 0%, #0a0a0a 100%)',
                    accentColor: '#06b6d4',
                  },
                  {
                    id: 'ps-10',
                    name: 'The Unboxing Experience',
                    preview: 'Product unboxing with benefit overlay text',
                    niche: 'EvenBetterBuy',
                    duration: '25s',
                    scenes: [
                      { type: 'package-arrive', asset: 'package', duration: 3, text: 'Your order arrived 🎉' },
                      { type: 'unbox-reveal', asset: 'product', duration: 3, text: '' },
                      { type: 'price-tag', asset: null, duration: 2, text: 'You paid: $12.99' },
                      { type: 'comparison-flash', asset: null, duration: 2, text: 'Brand name version: $49.99' },
                      { type: 'text-slide', asset: null, duration: 2, text: 'Same product. 74% savings.' },
                      { type: 'review-scroll', asset: null, duration: 3, text: '⭐⭐⭐⭐⭐ "Better than the brand name!"' },
                      { type: 'cta-pulse', asset: null, duration: 3, text: 'Find your deal → EvenBetterBuy.com' },
                    ],
                    bg: 'linear-gradient(135deg, #0a0a0a 0%, #2e1a0a 100%)',
                    accentColor: '#fb923c',
                  },
                ].map(template => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedVideoTemplate(template.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedVideoTemplate === template.id
                        ? 'bg-[#a855f7]/10 border-[#a855f7]/50'
                        : 'bg-[#0a0a0f] border-[#27272a] hover:border-[#52525b]'
                    }`}
                  >
                    {/* Dark preview */}
                    <div className="rounded-lg mb-3 p-4 flex items-center justify-center h-24 relative overflow-hidden" style={{ background: template.bg }}>
                      <p className="text-xs font-semibold text-center leading-tight text-white/90">{template.preview}</p>
                      <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/40 rounded text-[8px] text-white/80">{template.duration}</div>
                      <div className="absolute bottom-1 left-1 w-2 h-2 rounded-full animate-pulse" style={{ background: template.accentColor }}></div>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-white">{template.name}</p>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${
                        template.niche === 'StreamsAI' ? 'bg-indigo-500/15 text-indigo-400' :
                        template.niche === 'MedazonHealth' ? 'bg-teal-500/15 text-teal-400' :
                        template.niche === 'XtremeNad' ? 'bg-red-500/15 text-red-400' :
                        'bg-amber-500/15 text-amber-400'
                      }`}>{template.niche}</span>
                    </div>
                    <p className="text-[10px] text-[#52525b]">{template.scenes.length} scenes · {template.scenes.filter(s => s.type === 'cta-pulse').length} CTA</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RENDER PIPELINE CONTROLS */}
          <div className="mt-6 p-4 bg-[#0a0a0f] rounded-xl border border-[#27272a]">
            <h4 className="text-sm font-semibold mb-3">⚡ Render Pipeline</h4>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
              {[
                { label: 'Resolution', value: '1080×1920', options: ['720×1280', '1080×1920', '1080×1080'] },
                { label: 'FPS', value: '30', options: ['24', '30', '60'] },
                { label: 'Format', value: 'MP4 (H.264)', options: ['MP4 (H.264)', 'WebM', 'GIF'] },
                { label: 'Audio', value: 'None', options: ['None', 'Ambient', 'Music bed'] },
                { label: 'Platform', value: 'TikTok/Reels', options: ['TikTok/Reels', 'YouTube', 'Stories', 'Square'] },
              ].map((ctrl, i) => (
                <div key={i}>
                  <label className="text-[9px] text-[#52525b] uppercase tracking-wider">{ctrl.label}</label>
                  <select className="w-full mt-1 px-2 py-2 bg-[#12121a] border border-[#27272a] rounded-lg text-white text-xs">
                    {ctrl.options.map(o => <option key={o} selected={o === ctrl.value}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Render + Schedule buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setVideoRendering(true)}
                disabled={!selectedVideoTemplate || videoRendering}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                  selectedVideoTemplate && !videoRendering
                    ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:shadow-lg hover:shadow-red-500/20'
                    : 'bg-[#1a1a24] text-[#52525b] cursor-not-allowed'
                }`}
              >
                {videoRendering ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Rendering...</>
                ) : (
                  <>🎬 Render Video</>
                )}
              </button>
              <button
                disabled={!selectedVideoTemplate}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                  selectedVideoTemplate
                    ? 'bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white hover:shadow-lg hover:shadow-[#a855f7]/20'
                    : 'bg-[#1a1a24] text-[#52525b] cursor-not-allowed'
                }`}
              >
                📅 Render + Schedule
              </button>
              <button
                disabled={!selectedVideoTemplate}
                className={`py-3 px-4 rounded-xl text-sm font-semibold border transition-all ${
                  selectedVideoTemplate
                    ? 'border-[#27272a] text-[#a1a1aa] hover:border-[#a855f7]'
                    : 'border-[#1a1a24] text-[#52525b] cursor-not-allowed'
                }`}
              >
                ✏️ Edit Script
              </button>
            </div>
          </div>

          {/* RENDERING QUEUE + HISTORY */}
          <div className="mt-4 p-4 bg-[#0a0a0f] rounded-xl border border-[#27272a]">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">📼 Render Queue &amp; Library</h4>
              <span className="text-[9px] text-[#52525b]">Videos auto-stored in content_library · Ready for scheduler</span>
            </div>
            {videoRendering ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-[#12121a] rounded-lg border border-orange-500/20">
                  <span className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-orange-400">Rendering: {selectedVideoTemplate}</p>
                    <div className="w-full bg-[#27272a] rounded-full h-1.5 mt-1">
                      <div className="bg-gradient-to-r from-orange-500 to-red-500 h-1.5 rounded-full animate-pulse" style={{ width: '67%' }}></div>
                    </div>
                    <p className="text-[9px] text-[#52525b] mt-1">Frame 482/720 · 1080×1920 · H.264 · ~18s remaining</p>
                  </div>
                  <button className="text-xs text-red-400 hover:text-red-300">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-[#52525b] text-xs">No active renders. Select a template and click Render.</div>
            )}

            {/* Video library preview */}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { name: 'Vision Opener v2', niche: 'StreamsAI', date: 'Today', status: 'ready' },
                { name: 'Privacy Promise', niche: 'MedazonHealth', date: 'Today', status: 'scheduled' },
                { name: 'Gummy Reveal', niche: 'XtremeNad', date: 'Yesterday', status: 'posted' },
                { name: 'Deal Finder #4', niche: 'EvenBetterBuy', date: 'Yesterday', status: 'posted' },
              ].map((vid, i) => (
                <div key={i} className="bg-[#12121a] rounded-lg p-2 border border-[#27272a]">
                  <div className="aspect-[9/16] bg-[#1a1a24] rounded mb-2 flex items-center justify-center">
                    <span className="text-2xl">▶️</span>
                  </div>
                  <p className="text-[9px] font-semibold text-white truncate">{vid.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[7px] text-[#52525b]">{vid.date}</span>
                    <span className={`text-[7px] px-1 py-0.5 rounded ${
                      vid.status === 'ready' ? 'bg-blue-500/15 text-blue-400' :
                      vid.status === 'scheduled' ? 'bg-purple-500/15 text-purple-400' :
                      'bg-green-500/15 text-green-400'
                    }`}>{vid.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TECHNICAL ARCHITECTURE INFO */}
          <details className="mt-4">
            <summary className="text-[10px] text-[#52525b] cursor-pointer hover:text-[#a1a1aa]">🔧 Technical Architecture — Remotion Rendering Pipeline</summary>
            <div className="mt-2 p-4 bg-[#0a0a0f] rounded-xl border border-[#1a1a24] text-[10px] text-[#71717a] space-y-2">
              <p><strong className="text-[#a1a1aa]">Stack:</strong> Remotion v4 · React 18 · TypeScript · Node.js server-side rendering</p>
              <p><strong className="text-[#a1a1aa]">Pipeline:</strong> AI generates script → Remotion composition → FFmpeg encode → MP4 → Supabase storage → content_library → Scheduler</p>
              <p><strong className="text-[#a1a1aa]">Kinetic Templates:</strong> Each line is a Remotion {'<Sequence>'} with spring() animations. Styles: fade-up (translateY + opacity), fade-word-by-word (per-word delay), scale-in-bold (transform: scale), fade-right (translateX), pulse-cta (infinite pulse + glow)</p>
              <p><strong className="text-[#a1a1aa]">Showcase Templates:</strong> Scene-based compositions. Each scene type maps to a React component: ProductSpin (CSS 3D rotate), IngredientExplode (particle effect), MockupReveal (phone/laptop frame + screenshot), StatCounter (count-up animation), SplitCompare (side-by-side slide-in), CtaPulse (scale + glow loop)</p>
              <p><strong className="text-[#a1a1aa]">Compliance Gate:</strong> Before rendering XtremeNad videos, script runs through GOOGLE_SAFEGUARDS.xtremeNadCompliance.bannedPhrases. If ANY banned phrase detected → render blocked → AI rewrites with safe alternatives automatically.</p>
              <p><strong className="text-[#a1a1aa]">Auto-Schedule:</strong> AI Brain selects template based on: niche rotation → time-of-day peak → platform best fit → A/B test variant → renders at 2 AM → queued for optimal post time</p>
              <p><strong className="text-[#a1a1aa]">Formats:</strong> 9:16 (TikTok/Reels/Shorts) · 1:1 (Instagram Feed) · 16:9 (YouTube) · Auto-crop per platform from single render</p>
              <p><strong className="text-[#a1a1aa]">API Endpoint:</strong> POST /api/video/render {'{'} templateId, customLines?, niche, platform, resolution {'}'} → returns jobId → poll GET /api/video/status/{'{'}jobId{'}'} → download MP4</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );

  // ============================================================
  // RENDER - SCHEDULE TAB (FULL)
  // ============================================================
  const renderScheduleTab = () => {
    const queuedPosts = scheduledPosts.filter(p => p.status === 'scheduled');
    const publishedPosts = scheduledPosts.filter(p => p.status === 'published');
    const failedPosts = scheduledPosts.filter(p => p.status === 'failed');
    const pIcon = (p: string) => ({ instagram: '📸', facebook: '📘', tiktok: '🎵', twitter: '𝕏', youtube: '▶️' }[p] || '📱');
    const sColor = (s: string) => ({ scheduled: '#06b6d4', published: '#22c55e', failed: '#ef4444', draft: '#71717a' }[s] || '#71717a');
    const sLabel = (s: string) => ({ scheduled: '⏳ Queued', published: '✅ Posted', failed: '❌ Failed', draft: '📝 Draft' }[s] || s);

    const postsByDate: Record<string, any[]> = {};
    scheduledPosts.forEach(p => {
      const d = (p.scheduled_for || p.published_at || p.created_at || '').split('T')[0];
      if (d) { if (!postsByDate[d]) postsByDate[d] = []; postsByDate[d].push(p); }
    });

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">Post Scheduler</h3>
            <p className="text-[#71717a] text-sm mt-1">{queuedPosts.length} queued · {publishedPosts.length} published · {failedPosts.length} failed</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={triggerCronNow} className="px-4 py-2 bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all">🚀 Publish Now</button>
            <button onClick={loadScheduledPosts} className="px-4 py-2 bg-[#12121a] border border-[#27272a] rounded-xl text-[#a1a1aa] text-sm hover:text-white transition-all">↻ Refresh</button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2">
          {(['queue', 'calendar', 'history', 'accounts'] as const).map(v => (
            <button key={v} onClick={() => setScheduleView(v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${scheduleView === v ? 'bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/30' : 'bg-[#12121a] text-[#71717a] border border-[#27272a] hover:text-white'}`}>
              {v === 'queue' && `📋 Queue (${queuedPosts.length})`}
              {v === 'calendar' && '📅 Calendar'}
              {v === 'history' && `📊 History (${publishedPosts.length})`}
              {v === 'accounts' && '🔗 Accounts'}
            </button>
          ))}
        </div>

        {/* QUEUE */}
        {scheduleView === 'queue' && (
          <div className="space-y-3">
            {scheduleLoading ? (
              <div className="text-center py-12 text-[#71717a]">Loading queue...</div>
            ) : queuedPosts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#71717a] text-lg mb-2">No posts in queue</p>
                <p className="text-[#52525b] text-sm">Go to Generate tab → approve posts → Confirm & Queue</p>
              </div>
            ) : queuedPosts.map((post: any) => (
              <div key={post.id} className="flex items-center gap-4 p-4 bg-[#12121a] border border-[#27272a] rounded-xl hover:border-[#a855f7]/30 transition-all">
                <div className="text-2xl">{pIcon(post.platform)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{(post.content || '').substring(0, 120)}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-[#71717a]">{post.platform}</span>
                    <span className="text-xs" style={{ color: sColor(post.status) }}>{sLabel(post.status)}</span>
                    {post.scheduled_for && <span className="text-xs text-[#06b6d4]">📅 {new Date(post.scheduled_for).toLocaleDateString()} {new Date(post.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => publishPostNow(post.id)} className="px-3 py-1.5 bg-green-500/15 text-green-400 border border-green-500/25 rounded-lg text-xs font-medium hover:bg-green-500/25">▶ Post Now</button>
                  <button onClick={() => cancelScheduledPost(post.id)} className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs hover:bg-red-500/20">✕</button>
                </div>
              </div>
            ))}

            {failedPosts.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-red-400 mb-3">❌ Failed ({failedPosts.length})</h4>
                {failedPosts.map((post: any) => (
                  <div key={post.id} className="flex items-center gap-4 p-4 bg-red-500/5 border border-red-500/20 rounded-xl mb-2">
                    <div className="text-2xl">{pIcon(post.platform)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{(post.content || '').substring(0, 100)}</p>
                      <p className="text-xs text-red-400 mt-1">Failed — will retry via Zapier on next cron</p>
                    </div>
                    <button onClick={() => publishPostNow(post.id)} className="px-3 py-1.5 bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/25 rounded-lg text-xs font-medium hover:bg-[#a855f7]/25">↻ Retry</button>
                  </div>
                ))}
              </div>
            )}

            {/* Posting Rules */}
            <div className="mt-6 p-4 bg-[#12121a] border border-[#27272a] rounded-xl">
              <h4 className="text-sm font-semibold text-white mb-3">⚙️ Posting Rules</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Max/day per account</label>
                  <input type="number" value={postingRules.maxPerDay} onChange={e => setPostingRules(p => ({ ...p, maxPerDay: +e.target.value }))} className="w-full mt-1 px-3 py-2 bg-[#0a0a0f] border border-[#27272a] rounded-lg text-white text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Min gap (min)</label>
                  <input type="number" value={postingRules.minGapMinutes} onChange={e => setPostingRules(p => ({ ...p, minGapMinutes: +e.target.value }))} className="w-full mt-1 px-3 py-2 bg-[#0a0a0f] border border-[#27272a] rounded-lg text-white text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Quiet start (hr)</label>
                  <input type="number" min={0} max={23} value={postingRules.quietStart} onChange={e => setPostingRules(p => ({ ...p, quietStart: +e.target.value }))} className="w-full mt-1 px-3 py-2 bg-[#0a0a0f] border border-[#27272a] rounded-lg text-white text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Quiet end (hr)</label>
                  <input type="number" min={0} max={23} value={postingRules.quietEnd} onChange={e => setPostingRules(p => ({ ...p, quietEnd: +e.target.value }))} className="w-full mt-1 px-3 py-2 bg-[#0a0a0f] border border-[#27272a] rounded-lg text-white text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 mt-4 cursor-pointer">
                <input type="checkbox" checked={postingRules.autoQueue} onChange={e => setPostingRules(p => ({ ...p, autoQueue: e.target.checked }))} className="w-4 h-4 rounded" />
                <span className="text-sm text-[#a1a1aa]">Auto-queue top products daily</span>
                {postingRules.autoQueue && <input type="number" value={postingRules.autoQueueCount} onChange={e => setPostingRules(p => ({ ...p, autoQueueCount: +e.target.value }))} className="w-16 px-2 py-1 bg-[#0a0a0f] border border-[#27272a] rounded-lg text-white text-sm" />}
              </label>
            </div>
          </div>
        )}

        {/* CALENDAR */}
        {scheduleView === 'calendar' && (
          <div className="space-y-4">
            {Object.keys(postsByDate).length === 0 ? (
              <div className="text-center py-12 text-[#71717a]">No posts to show on calendar.</div>
            ) : Object.entries(postsByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, posts]) => {
              const d = new Date(date + 'T12:00:00');
              const isToday = new Date().toISOString().split('T')[0] === date;
              return (
                <div key={date} className={`p-4 rounded-xl border ${isToday ? 'bg-[#a855f7]/5 border-[#a855f7]/30' : 'bg-[#12121a] border-[#27272a]'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-sm font-bold ${isToday ? 'text-[#a855f7]' : 'text-white'}`}>{d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    {isToday && <span className="text-[10px] bg-[#a855f7]/20 text-[#a855f7] px-2 py-0.5 rounded-full font-medium">TODAY</span>}
                    <span className="text-xs text-[#52525b]">{posts.length} post{posts.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-2">
                    {posts.map((post: any) => (
                      <div key={post.id} className="flex items-center gap-3 p-2 bg-[#0a0a0f]/50 rounded-lg">
                        <span className="text-lg">{pIcon(post.platform)}</span>
                        <span className="text-xs font-mono" style={{ color: sColor(post.status) }}>{sLabel(post.status)}</span>
                        {post.scheduled_for && <span className="text-xs text-[#52525b]">{new Date(post.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                        <span className="text-xs text-[#a1a1aa] truncate flex-1">{(post.content || '').substring(0, 60)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORY */}
        {scheduleView === 'history' && (
          <div className="space-y-3">
            {publishedPosts.length === 0 ? (
              <div className="text-center py-12 text-[#71717a]">No published posts yet.</div>
            ) : publishedPosts.map((post: any) => (
              <div key={post.id} className="flex items-center gap-4 p-4 bg-[#12121a] border border-[#27272a] rounded-xl">
                <div className="text-2xl">{pIcon(post.platform)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{(post.content || '').substring(0, 120)}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-green-400">✅ Published</span>
                    {post.published_at && <span className="text-xs text-[#52525b]">{new Date(post.published_at).toLocaleDateString()} {new Date(post.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ACCOUNTS */}
        {scheduleView === 'accounts' && (
          <div className="space-y-4">
            <p className="text-sm text-[#71717a]">Connected personal accounts. Direct posting is primary — Zapier is fallback only.</p>
            {Object.entries(accountStatuses).map(([platform, info]) => (
              <div key={platform} className="flex items-center gap-4 p-4 bg-[#12121a] border border-[#27272a] rounded-xl">
                <span className="text-2xl">{pIcon(platform)}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white capitalize">{platform}</p>
                  <p className="text-xs text-[#52525b]">Posts today: {info.todayCount}/{postingRules.maxPerDay}</p>
                </div>
                <span className={`px-3 py-1 text-xs font-medium rounded-full border ${info.status === 'active' ? 'bg-green-500/15 border-green-500/25 text-green-400' : info.status === 'expired' ? 'bg-yellow-500/15 border-yellow-500/25 text-yellow-400' : 'bg-red-500/15 border-red-500/25 text-red-400'}`}>
                  {info.status === 'active' ? '✅ Active' : info.status === 'expired' ? '⚠ Expired' : '❌ Blocked'}
                </span>
                {info.status !== 'active' && (
                  <button className="px-3 py-1.5 bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/25 rounded-lg text-xs font-medium hover:bg-[#a855f7]/25">Reconnect</button>
                )}
              </div>
            ))}

            {/* Zapier Webhooks */}
            <div className="p-4 bg-[#12121a] border border-[#27272a] rounded-xl">
              <h4 className="text-sm font-semibold text-white mb-1">🔗 Zapier Fallback Webhooks</h4>
              <p className="text-xs text-[#52525b] mb-3">Fire automatically when direct posting fails.</p>
              <div className="space-y-2">
                {socialPlatforms.map(p => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="text-sm w-24 text-[#a1a1aa]">{p.name}</span>
                    <input type="text" value={webhookConfig[p.id] || ''} onChange={e => updateWebhook(p.id, e.target.value)} placeholder="https://hooks.zapier.com/..." className="flex-1 px-3 py-2 bg-[#0a0a0f] border border-[#27272a] rounded-lg text-sm text-white placeholder:text-[#3f3f46]" />
                    <span className={`w-2 h-2 rounded-full ${webhookConfig[p.id] ? 'bg-green-500' : 'bg-[#27272a]'}`} />
                  </div>
                ))}
              </div>
              <button onClick={saveWebhookConfig} className="mt-3 px-4 py-2 bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/25 rounded-lg text-xs font-medium hover:bg-[#a855f7]/25">Save Webhooks</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // STATE — COMMAND CENTER
  // ============================================================
  const [cmdSubTab, setCmdSubTab] = useState<'brands' | 'rotation' | 'leads' | 'addesigner' | 'mms' | 'stripe' | 'keys' | 'controls'>('brands');
  const [cmdBrands, setCmdBrands] = useState([
    { id: 'streamsai', name: 'StreamsAI', icon: '🤖', color: '#6366f1', desc: 'AI content platform', phone: '', status: 'not_configured' as string, landingUrl: 'https://streamsai.com', stripeProductId: '', bestDays: 'Tue/Thu', bestHours: '10am-12pm', msgStyle: 'Value-first, show ROI', ctaType: 'Try free' },
    { id: 'evenbetterbuy', name: 'EvenBetterBuy', icon: '🛒', color: '#f59e0b', desc: 'E-commerce deals & finds', phone: '', status: 'not_configured' as string, landingUrl: 'https://evenbetterbuy.com', stripeProductId: '', bestDays: 'Sat/Sun', bestHours: '9am-11am', msgStyle: 'Urgency + price comparison', ctaType: 'Shop now, limited' },
    { id: 'xtremenad', name: 'XtremeNad', icon: '💪', color: '#ef4444', desc: '5-in-1 gummy (energy, weight loss, focus)', phone: '', status: 'not_configured' as string, landingUrl: 'https://xtremenad.com', stripeProductId: '', bestDays: 'Mon/Wed', bestHours: '7am-9am', msgStyle: 'Results-focused, social proof', ctaType: 'Order today' },
    { id: 'medazonhealth', name: 'MedazonHealth', icon: '🏥', color: '#2dd4bf', desc: 'Private telehealth Florida', phone: '', status: 'not_configured' as string, landingUrl: 'https://patient.medazonhealth.com', stripeProductId: '', bestDays: 'Tue-Thu', bestHours: '6pm-8pm', msgStyle: 'Empathy + convenience', ctaType: 'Book in 60 seconds' },
  ]);
  const [cmdPaused, setCmdPaused] = useState({ social: true, sms: true, seo: true });
  const [cmdAutoApproveThreshold, setCmdAutoApproveThreshold] = useState(85);
  const [cmdFrequencyCap, setCmdFrequencyCap] = useState(2);
  const [cmdCooldownDays, setCmdCooldownDays] = useState(3);
  const [cmdQuietStart, setCmdQuietStart] = useState(21);
  const [cmdQuietEnd, setCmdQuietEnd] = useState(8);
  const [cmdMmsMessage, setCmdMmsMessage] = useState('');
  const [cmdMmsImageUrl, setCmdMmsImageUrl] = useState('');
  const [cmdMmsNiche, setCmdMmsNiche] = useState('evenbetterbuy');
  const [cmdApiKeys, setCmdApiKeys] = useState<Record<string, string>>({ clicksend_user: '', clicksend_key: '', twilio_sid: '', twilio_token: '', openai_key: '', anthropic_key: '', stripe_pk: '', stripe_sk: '', serpapi_key: '', ga4_property: '', gsc_site: '' });

  // ============================================================
  // STATE — AI BRAIN
  // ============================================================
  const [brainSubTab, setBrainSubTab] = useState<'dashboard' | 'decisions' | 'goals' | 'winloss' | 'rules' | 'learnings' | 'plan' | 'vault' | 'platforms'>('dashboard');
  const [brainGoals, setBrainGoals] = useState([
    { id: 'g1', label: 'Social posts published', target: 10, current: 0, period: 'daily' as string },
    { id: 'g2', label: 'SMS sends', target: 50, current: 0, period: 'daily' as string },
    { id: 'g3', label: 'SEO pages published', target: 2, current: 0, period: 'daily' as string },
    { id: 'g4', label: 'Conversions', target: 5, current: 0, period: 'daily' as string },
    { id: 'g5', label: 'Revenue attributed', target: 500, current: 0, period: 'weekly' as string },
    { id: 'g6', label: 'New leads captured', target: 20, current: 0, period: 'weekly' as string },
  ]);
  const [brainRules, setBrainRules] = useState({
    scoring: { clusterMatch: 15, platformMatch: 10, hasImage: 10, highEngagement: 8, notRecentlyTargeted: 5, highMargin: 7, goodReviews: 5, trendingTopic: 10, provenHook: 8, noImage: -10, lowEngagement: -5, recentlyTargeted: -8 },
    timing: { smsOpenPeak: 'Tue/Thu 10am-12pm', dealContent: 'Sat 9am-11am', speedToLead: '5 min', followUp: 'Day 1→3→7→14→30' },
    limits: { maxSmsPerWeek: 2, cooldownDays: 3, pauseAfterNoEngagement: 6, slowAfterNoEngagement: 3 },
    seo: { targetPositions11to20First: true, refreshContentDays: 90, minWordCount: 1500, internalLinksPerPage: 4, faqSectionsAlways: true },
  });
  const [brainDecisions, setBrainDecisions] = useState([
    { id: 'd1', timestamp: new Date().toISOString(), section: 'social', action: 'Generated TikTok post for EvenBetterBuy', reasoning: 'Deal Hunters cluster (24 members, 5.1% engage) is most active on TikTok. Product "Wireless Earbuds Pro" has 66% margin + 4.7★. Discovery tone selected — cluster shares "cheap gear finds". Confidence: 93%.', confidence: 93, outcome: 'pending' as string, editable: true },
    { id: 'd2', timestamp: new Date().toISOString(), section: 'sms', action: 'Queued XtremeNad SMS to Gym cluster', reasoning: 'Mon/Wed 7am-9am is XtremeNad peak (pre-gym). 18 leads in Gym & Fitness cluster haven\'t been contacted by Number C in 14+ days. Message uses "results" tone. Confidence: 87%.', confidence: 87, outcome: 'pending' as string, editable: true },
    { id: 'd3', timestamp: new Date().toISOString(), section: 'seo', action: 'Generated landing page: "best energy gummy 2026"', reasoning: 'Keyword "best energy gummy" has 2,400 monthly searches, difficulty 34/100. No existing page targets this. XtremeNad has direct product match. Generated 1,800-word article with FAQ schema. Confidence: 81%.', confidence: 81, outcome: 'pending' as string, editable: true },
  ]);
  const [brainLearnings] = useState([
    { id: 'l1', date: new Date().toISOString(), insight: 'Discovery tone posts outperform question tone by 2.3x on TikTok for deal content', source: 'Social post A/B analysis', applied: true },
    { id: 'l2', date: new Date().toISOString(), insight: 'SMS sent within 5 minutes of opt-in converts 8x higher than 24-hour delay', source: 'Industry benchmark (pre-loaded)', applied: true },
    { id: 'l3', date: new Date().toISOString(), insight: 'Carousel posts get 3x more saves than single images on Instagram', source: 'Pattern analysis (pre-loaded)', applied: true },
    { id: 'l4', date: new Date().toISOString(), insight: 'Pages with FAQ schema appear in "People Also Ask" 4x more often', source: 'SEO best practice (pre-loaded)', applied: true },
    { id: 'l5', date: new Date().toISOString(), insight: 'XtremeNad messaging performs best with before/after or results imagery', source: 'Niche strategy (pre-loaded)', applied: false },
  ]);

  // ============================================================
  // RENDER - COMMAND CENTER TAB
  // ============================================================
  const renderCommandCenter = () => {
    const cmdTabs = [
      { id: 'brands' as const, label: '🏢 Brands', badge: 4 },
      { id: 'rotation' as const, label: '🔄 Rotation' },
      { id: 'leads' as const, label: '👥 Leads', badge: 0 },
      { id: 'addesigner' as const, label: '🎨 AI Ads' },
      { id: 'mms' as const, label: '📱 MMS Builder' },
      { id: 'stripe' as const, label: '💳 Stripe' },
      { id: 'keys' as const, label: '🔑 API Keys' },
      { id: 'controls' as const, label: '🎛️ Controls' },
    ];

    return (
      <div className="space-y-4">
        {/* Master Controls Bar */}
        <div className="p-4 bg-[#12121a] border border-[#27272a] rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎯</span>
              <div>
                <h3 className="text-lg font-bold" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Marketing Command Center</h3>
                <p className="text-[10px] text-[#52525b]">4-Brand Rotation · AI Generation · Set & Forget</p>
              </div>
            </div>
            <div className="flex gap-2">
              {(['social', 'sms', 'seo'] as const).map(key => (
                <button key={key} onClick={() => setCmdPaused(p => ({ ...p, [key]: !p[key] }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${cmdPaused[key] ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${cmdPaused[key] ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'}`}/>
                  {key.toUpperCase()} {cmdPaused[key] ? 'PAUSED' : 'LIVE'}
                </button>
              ))}
            </div>
          </div>
          {/* Quick stats */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: 'Total Leads', value: '0', color: '#a855f7' },
              { label: 'Sent Today', value: '0', color: '#06b6d4' },
              { label: 'In Cooldown', value: '0', color: '#f59e0b' },
              { label: 'Opted Out', value: '0', color: '#ef4444' },
              { label: 'Conversions', value: '0', color: '#22c55e' },
            ].map((s, i) => (
              <div key={i} className="bg-[#0d0d12] rounded-lg p-2 text-center">
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[8px] uppercase tracking-wider text-[#52525b]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {cmdTabs.map(t => (
            <button key={t.id} onClick={() => setCmdSubTab(t.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${cmdSubTab === t.id ? 'bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/30' : 'bg-[#12121a] text-[#71717a] border border-[#27272a] hover:text-white'}`}>
              {t.label}
              {t.badge !== undefined && <span className="px-1.5 py-0.5 bg-[#0d0d12] rounded text-[9px]">{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* BRANDS SUB-TAB */}
        {cmdSubTab === 'brands' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {cmdBrands.map((b, idx) => (
              <div key={b.id} className="bg-[#12121a] border rounded-2xl p-5 transition-all" style={{ borderColor: `${b.color}25` }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: `${b.color}15` }}>{b.icon}</div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{b.name}</h4>
                    <p className="text-[10px] text-[#52525b]">{b.desc}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${b.phone ? 'bg-green-500' : 'bg-[#27272a]'}`}/>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Phone Number</label>
                    <input type="text" value={b.phone} onChange={e => { const u = [...cmdBrands]; u[idx].phone = e.target.value; setCmdBrands(u); }} placeholder="+1 (555) 000-0000" className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white placeholder:text-[#27272a] focus:border-[#a855f7] focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Landing URL</label>
                    <input type="text" value={b.landingUrl} onChange={e => { const u = [...cmdBrands]; u[idx].landingUrl = e.target.value; setCmdBrands(u); }} className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white focus:border-[#a855f7] focus:outline-none"/>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="bg-[#0d0d12] rounded-lg p-2">
                      <p className="text-[8px] text-[#52525b] uppercase">Best Days</p>
                      <p className="text-xs font-medium">{b.bestDays}</p>
                    </div>
                    <div className="bg-[#0d0d12] rounded-lg p-2">
                      <p className="text-[8px] text-[#52525b] uppercase">Best Hours</p>
                      <p className="text-xs font-medium">{b.bestHours}</p>
                    </div>
                    <div className="bg-[#0d0d12] rounded-lg p-2">
                      <p className="text-[8px] text-[#52525b] uppercase">Message Style</p>
                      <p className="text-xs font-medium">{b.msgStyle}</p>
                    </div>
                    <div className="bg-[#0d0d12] rounded-lg p-2">
                      <p className="text-[8px] text-[#52525b] uppercase">CTA Type</p>
                      <p className="text-xs font-medium">{b.ctaType}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ROTATION SUB-TAB */}
        {cmdSubTab === 'rotation' && (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-1">🔄 Rotation Engine Logic</h4>
              <p className="text-xs text-[#52525b] mb-4">How leads cycle through the 4 brands. Edit any rule — AI saves and applies.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Max SMS/week (all brands)</label>
                  <input type="number" value={cmdFrequencyCap} onChange={e => setCmdFrequencyCap(+e.target.value)} className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-white text-sm focus:border-[#a855f7] focus:outline-none"/>
                </div>
                <div>
                  <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Cooldown days (same #)</label>
                  <input type="number" value={cmdCooldownDays} onChange={e => setCmdCooldownDays(+e.target.value)} className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-white text-sm focus:border-[#a855f7] focus:outline-none"/>
                </div>
                <div>
                  <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Quiet start (hour)</label>
                  <input type="number" min={0} max={23} value={cmdQuietStart} onChange={e => setCmdQuietStart(+e.target.value)} className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-white text-sm focus:border-[#a855f7] focus:outline-none"/>
                </div>
                <div>
                  <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Quiet end (hour)</label>
                  <input type="number" min={0} max={23} value={cmdQuietEnd} onChange={e => setCmdQuietEnd(+e.target.value)} className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-white text-sm focus:border-[#a855f7] focus:outline-none"/>
                </div>
              </div>
              <div className="mt-4 p-3 bg-[#0d0d12] rounded-lg text-xs text-[#71717a]">
                <p className="font-medium text-white mb-2">Rotation Order per Lead:</p>
                <div className="flex items-center gap-2">
                  {cmdBrands.map((b, i) => (
                    <React.Fragment key={b.id}>
                      <span className="px-2 py-1 rounded text-[10px] font-medium" style={{ background: `${b.color}15`, color: b.color }}>{b.icon} {b.name}</span>
                      {i < cmdBrands.length - 1 && <span className="text-[#27272a]">→</span>}
                    </React.Fragment>
                  ))}
                  <span className="text-[#27272a]">→ repeat</span>
                </div>
              </div>
            </div>
            {/* Engagement rules */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-3">📊 Engagement-Based Rules</h4>
              <div className="space-y-2">
                {[
                  { rule: 'Lead replies to SMS', action: '→ Flag as engaged, increase frequency slightly, enter 1:1 mode', color: '#22c55e' },
                  { rule: 'Lead clicks link', action: '→ Track UTM, score +10, prioritize this niche for them', color: '#06b6d4' },
                  { rule: '3 sends, no engagement', action: '→ Slow to 1x/week, try different niche next', color: '#f59e0b' },
                  { rule: '6 sends, no engagement', action: '→ Auto-pause lead, flag for review', color: '#ef4444' },
                  { rule: 'Lead sends STOP', action: '→ Instant opt-out across ALL 4 numbers, suppress permanently', color: '#ef4444' },
                  { rule: 'Lead converts (purchase/booking)', action: '→ Log full attribution, shift to retention messaging', color: '#a855f7' },
                ].map((r, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-[#0d0d12] rounded-lg">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: r.color }}/>
                    <div>
                      <p className="text-xs font-medium text-white">{r.rule}</p>
                      <p className="text-[10px] text-[#71717a]">{r.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LEADS SUB-TAB */}
        {cmdSubTab === 'leads' && (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#2dd4bf]/20 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">🏥</span>
                <div className="flex-1">
                  <h4 className="font-semibold">Medazon Health Patients</h4>
                  <p className="text-xs text-[#52525b]">Connect to patient database for campaigns</p>
                </div>
                <button className="px-4 py-2 bg-[#2dd4bf]/10 border border-[#2dd4bf]/30 text-[#2dd4bf] rounded-lg text-xs font-semibold">Connect</button>
              </div>
              <div className="p-4 border-2 border-dashed border-[#2dd4bf]/30 rounded-xl text-center">
                <p className="text-sm text-[#2dd4bf]">🔗 Connect Medazon Health Patient Database</p>
              </div>
            </div>
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-3 flex items-center gap-2">📦 Bulk Upload</h4>
              <div className="grid grid-cols-3 gap-3">
                {[{ icon: '📄', label: 'Upload CSV' }, { icon: '📊', label: 'Upload Excel' }, { icon: '📋', label: 'Paste Import' }].map(m => (
                  <button key={m.label} className="p-4 bg-[#0d0d12] border border-[#27272a] rounded-xl text-center hover:border-[#a855f7]/30 transition-colors">
                    <span className="text-xl">{m.icon}</span>
                    <p className="text-xs mt-2">{m.label}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-3">🔗 API Endpoint</h4>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-3 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-[#06b6d4] font-mono">https://api.dropshippro.io/v1/leads</div>
                <button className="px-4 py-3 bg-[#06b6d4]/10 border border-[#06b6d4]/30 text-[#06b6d4] rounded-lg text-xs font-medium">📋 Copy</button>
                <button className="px-4 py-3 bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] rounded-lg text-xs font-medium">🔑 Keys</button>
              </div>
            </div>
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-3">⚡ Webhook Integration</h4>
              <div className="flex items-center gap-3 p-3 bg-[#0d0d12] rounded-lg">
                <span className="text-xl">⚡</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Make.com Integration</p>
                  <p className="text-[10px] text-[#52525b]">Connect to automate workflows with incoming leads</p>
                </div>
                <button className="px-4 py-2 bg-[#27272a] rounded-lg text-xs text-white">Configure</button>
              </div>
            </div>
            <button className="w-full p-4 bg-gradient-to-r from-[#06b6d4]/20 to-[#a855f7]/20 border border-[#06b6d4]/30 rounded-xl text-[#06b6d4] font-semibold text-sm">
              👁️ View All 0 Leads
            </button>
          </div>
        )}

        {/* AI AD DESIGNER SUB-TAB */}
        {cmdSubTab === 'addesigner' && (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-4">🎨 AI Ad Designer</h4>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Niche</label>
                  <select className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white focus:border-[#a855f7] focus:outline-none">
                    {cmdBrands.map(b => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Content Type</label>
                  <select className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white focus:border-[#a855f7] focus:outline-none">
                    <option>SMS Copy</option><option>MMS Copy + Image</option><option>Social Post</option><option>Landing Page</option><option>Product Description</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Prompt / Brief</label>
                <textarea placeholder="e.g. 'Create an MMS for XtremeNad targeting gym-goers, emphasize energy + focus benefits, include price comparison'" className="w-full mt-1 px-3 py-3 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white placeholder:text-[#3f3f46] focus:border-[#a855f7] focus:outline-none min-h-[80px] resize-y"/>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="flex-1 py-3 bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white rounded-xl text-sm font-semibold opacity-70 cursor-not-allowed">✨ Generate with Claude</button>
                <button className="flex-1 py-3 bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white rounded-xl text-sm font-semibold opacity-70 cursor-not-allowed">🎨 Generate Image (DALL·E)</button>
              </div>
              <p className="text-[10px] text-[#52525b] mt-2 text-center">Configure API keys in the 🔑 tab to enable generation</p>
            </div>
            {/* Hook formulas reference */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-3">🎣 Pre-Loaded Hook Formulas (ranked by engagement)</h4>
              <div className="space-y-2">
                {[
                  { hook: '"Stop scrolling if you ___"', engagement: '12.5K avg', best: 'TikTok, IG' },
                  { hook: '"I found the $X version of the $Y one"', engagement: '11K avg', best: 'TikTok, FB' },
                  { hook: '"The [industry] doesn\'t want you to know"', engagement: '15.6K avg', best: 'All platforms' },
                  { hook: '"I spent [X] hours so you don\'t have to"', engagement: '9.8K avg', best: 'YouTube, Twitter' },
                  { hook: '"POV: You just discovered ___"', engagement: '8.2K avg', best: 'TikTok, IG Reels' },
                  { hook: '"Reply [word] and I\'ll send you ___"', engagement: 'Lead capture', best: 'All platforms' },
                  { hook: '"Day [X] of ___"', engagement: 'Serial content', best: 'TikTok, IG Stories' },
                  { hook: '"Honest review after [X] weeks"', engagement: '7.4K avg', best: 'YouTube, IG' },
                ].map((h, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-[#0d0d12] rounded-lg">
                    <span className="text-xs font-bold text-[#52525b] w-5">#{i + 1}</span>
                    <p className="text-xs flex-1 font-medium">{h.hook}</p>
                    <span className="text-[9px] text-[#06b6d4]">{h.engagement}</span>
                    <span className="text-[9px] text-[#52525b]">{h.best}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MMS BUILDER SUB-TAB */}
        {cmdSubTab === 'mms' && (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">📱 MMS Configuration</h4>
                <span className="text-xs text-green-400">● Active</span>
              </div>
              <div className="mb-4">
                <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Brand</label>
                <div className="flex gap-2 mt-1">
                  {cmdBrands.map(b => (
                    <button key={b.id} onClick={() => setCmdMmsNiche(b.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${cmdMmsNiche === b.id ? 'text-white' : 'bg-[#0d0d12] text-[#52525b] border border-[#27272a]'}`} style={cmdMmsNiche === b.id ? { background: b.color } : undefined}>
                      {b.icon} {b.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <div className="flex justify-between">
                  <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Message</label>
                  <span className="text-[9px] text-[#52525b]">{cmdMmsMessage.length}/160</span>
                </div>
                <textarea value={cmdMmsMessage} onChange={e => e.target.value.length <= 160 && setCmdMmsMessage(e.target.value)} placeholder="Enter your MMS message..." className="w-full mt-1 px-3 py-3 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white placeholder:text-[#3f3f46] focus:border-[#a855f7] focus:outline-none min-h-[100px] resize-y"/>
              </div>
              <div className="mb-4">
                <label className="text-[9px] text-[#52525b] uppercase tracking-wider">🖼️ Media</label>
                <div className="flex gap-2 mt-1">
                  <button className="flex-1 py-3 bg-[#0d0d12] border border-[#27272a] rounded-lg text-xs text-[#71717a] hover:border-[#a855f7]/30">🖼️ Select Image</button>
                  <input type="text" value={cmdMmsImageUrl} onChange={e => setCmdMmsImageUrl(e.target.value)} placeholder="Or paste image URL" className="flex-1 px-3 py-3 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white placeholder:text-[#3f3f46] focus:border-[#a855f7] focus:outline-none"/>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-[9px] text-[#52525b] uppercase tracking-wider">🔗 Landing Page</label>
                <input type="text" value={cmdBrands.find(b => b.id === cmdMmsNiche)?.landingUrl || ''} readOnly className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-[#71717a]"/>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-3 bg-[#1a1a24] rounded-xl text-sm font-medium text-[#71717a]">👁️ Preview</button>
                <button className="flex-1 py-3 bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white rounded-xl text-sm font-semibold opacity-70 cursor-not-allowed">📤 Send to Targeted Leads</button>
              </div>
            </div>
          </div>
        )}

        {/* STRIPE SUB-TAB */}
        {cmdSubTab === 'stripe' && (
          <div className="space-y-4">
            {cmdBrands.map((b, idx) => (
              <div key={b.id} className="bg-[#12121a] border rounded-2xl p-5" style={{ borderColor: `${b.color}25` }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xl">{b.icon}</span>
                  <h4 className="font-semibold">{b.name} Checkout</h4>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[9px] text-[#52525b] uppercase">Stripe Product/Price ID</label>
                    <input type="text" value={b.stripeProductId} onChange={e => { const u = [...cmdBrands]; u[idx].stripeProductId = e.target.value; setCmdBrands(u); }} placeholder="price_xxxxx" className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white placeholder:text-[#27272a] focus:border-[#a855f7] focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-[9px] text-[#52525b] uppercase">Checkout URL</label>
                    <input type="text" placeholder="https://checkout.stripe.com/..." className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white placeholder:text-[#27272a] focus:border-[#a855f7] focus:outline-none"/>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* API KEYS SUB-TAB */}
        {cmdSubTab === 'keys' && (
          <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
            <h4 className="font-semibold mb-4">🔑 API Keys — Enter from Frontend</h4>
            <p className="text-xs text-[#52525b] mb-4">All keys stored encrypted in Supabase. Never exposed in env vars.</p>
            <div className="space-y-3">
              {[
                { group: 'SMS/MMS', keys: [{ k: 'clicksend_user', label: 'ClickSend Username' }, { k: 'clicksend_key', label: 'ClickSend API Key' }, { k: 'twilio_sid', label: 'Twilio Account SID' }, { k: 'twilio_token', label: 'Twilio Auth Token' }] },
                { group: 'AI Generation', keys: [{ k: 'openai_key', label: 'OpenAI API Key (DALL·E + GPT)' }, { k: 'anthropic_key', label: 'Anthropic API Key (Claude)' }] },
                { group: 'Payments', keys: [{ k: 'stripe_pk', label: 'Stripe Publishable Key' }, { k: 'stripe_sk', label: 'Stripe Secret Key' }] },
                { group: 'SEO & Analytics', keys: [{ k: 'serpapi_key', label: 'SerpAPI Key' }, { k: 'ga4_property', label: 'GA4 Property ID' }, { k: 'gsc_site', label: 'Search Console Site URL' }] },
              ].map(g => (
                <div key={g.group}>
                  <p className="text-[9px] text-[#52525b] uppercase tracking-wider mb-2">{g.group}</p>
                  {g.keys.map(({ k, label }) => (
                    <div key={k} className="flex items-center gap-2 mb-2">
                      <label className="text-xs text-[#71717a] w-48 flex-shrink-0">{label}</label>
                      <input type="password" value={cmdApiKeys[k] || ''} onChange={e => setCmdApiKeys(p => ({ ...p, [k]: e.target.value }))} placeholder="••••••••" className="flex-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white placeholder:text-[#27272a] focus:border-[#a855f7] focus:outline-none"/>
                      <div className={`w-2 h-2 rounded-full ${cmdApiKeys[k] ? 'bg-green-500' : 'bg-[#27272a]'}`}/>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button className="flex-1 py-3 bg-[#a855f7] text-white rounded-xl text-sm font-semibold hover:bg-[#9333ea] transition-colors">Save All Keys</button>
              <button className="px-6 py-3 bg-[#0d0d12] border border-[#27272a] rounded-xl text-sm text-[#71717a] hover:text-white">Test Connections</button>
            </div>
          </div>
        )}

        {/* MASTER CONTROLS SUB-TAB */}
        {cmdSubTab === 'controls' && (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#a855f7]/20 rounded-2xl p-6">
              <h4 className="font-semibold mb-4">🎛️ Master Controls</h4>
              <div className="space-y-3">
                {[
                  { key: 'social' as const, label: '📱 Social Posting', desc: 'Auto-publish approved posts to platforms' },
                  { key: 'sms' as const, label: '💬 SMS/MMS Rotation', desc: 'Auto-send to leads via 4-number rotation' },
                  { key: 'seo' as const, label: '🔍 SEO Publishing', desc: 'Auto-publish generated pages to domains' },
                ].map(c => (
                  <div key={c.key} className="flex items-center justify-between p-4 bg-[#0d0d12] rounded-xl">
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-[10px] text-[#52525b]">{c.desc}</p>
                    </div>
                    <button onClick={() => setCmdPaused(p => ({ ...p, [c.key]: !p[c.key] }))}
                      className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${cmdPaused[c.key] ? 'bg-yellow-500/15 border border-yellow-500/30 text-yellow-400' : 'bg-green-500/15 border border-green-500/30 text-green-400'}`}>
                      {cmdPaused[c.key] ? '⏸️ PAUSED' : '▶️ LIVE'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between p-4 bg-[#0d0d12] rounded-xl">
                  <div>
                    <p className="text-sm font-medium">⚡ Auto-Approve Threshold</p>
                    <p className="text-[10px] text-[#52525b]">Posts scoring above this are auto-approved</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={50} max={100} value={cmdAutoApproveThreshold} onChange={e => setCmdAutoApproveThreshold(+e.target.value)} className="w-16 px-2 py-2 bg-[#1a1a24] border border-[#27272a] rounded-lg text-white text-sm text-center focus:border-[#a855f7] focus:outline-none"/>
                    <span className="text-xs text-[#52525b]">%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-[#0d0d12] rounded-xl">
                  <div>
                    <p className="text-sm font-medium">📧 Daily Report Email</p>
                    <p className="text-[10px] text-[#52525b]">Receive AI-generated daily report every morning</p>
                  </div>
                  <button className="px-6 py-2.5 bg-[#27272a] rounded-xl text-xs font-bold text-[#52525b]">OFF</button>
                </div>
                <div className="flex items-center justify-between p-4 bg-[#0d0d12] rounded-xl">
                  <div>
                    <p className="text-sm font-medium">🔄 Daily Auto-Run</p>
                    <p className="text-[10px] text-[#52525b]">Run full cycle daily: generate → schedule → send</p>
                  </div>
                  <button className="px-6 py-2.5 bg-[#27272a] rounded-xl text-xs font-bold text-[#52525b]">OFF</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // RENDER - AI BRAIN TAB
  // ============================================================
  const renderAIBrain = () => {
    const brainTabs = [
      { id: 'dashboard' as const, label: '📊 Dashboard' },
      { id: 'decisions' as const, label: '📋 Decisions' },
      { id: 'goals' as const, label: '🎯 Goals' },
      { id: 'winloss' as const, label: '📈 Wins & Losses' },
      { id: 'rules' as const, label: '⚙️ Logic Rules' },
      { id: 'learnings' as const, label: '💡 Learnings' },
      { id: 'plan' as const, label: '📅 Daily Plan' },
      { id: 'vault' as const, label: '📚 Knowledge Vault' },
      { id: 'platforms' as const, label: '🔗 Platform Connections' },
    ];

    return (
      <div className="space-y-4">
        {/* Brain header */}
        <div className="p-4 bg-[#12121a] border border-[#a855f7]/20 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.04), rgba(236,72,153,0.04))' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#a855f7]/10 rounded-xl flex items-center justify-center text-2xl">🧠</div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: '#a855f7' }}>AI Brain</h3>
              <p className="text-[10px] text-[#52525b]">Every decision, every learning, every goal — viewable and editable</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"/>
              <span className="text-xs text-green-400 font-medium">Always Active</span>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {brainTabs.map(t => (
            <button key={t.id} onClick={() => setBrainSubTab(t.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${brainSubTab === t.id ? 'bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/30' : 'bg-[#12121a] text-[#71717a] border border-[#27272a] hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* DASHBOARD */}
        {brainSubTab === 'dashboard' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Decisions Made', value: brainDecisions.length, color: '#a855f7', sub: 'today' },
                { label: 'Avg Confidence', value: Math.round(brainDecisions.reduce((a, d) => a + d.confidence, 0) / (brainDecisions.length || 1)) + '%', color: '#06b6d4', sub: 'across all' },
                { label: 'Learnings Applied', value: brainLearnings.filter(l => l.applied).length, color: '#22c55e', sub: `of ${brainLearnings.length}` },
                { label: 'Self-Corrections', value: '0', color: '#f59e0b', sub: 'this week' },
              ].map((s, i) => (
                <div key={i} className="bg-[#12121a] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] font-medium text-white mt-1">{s.label}</p>
                  <p className="text-[8px] text-[#52525b]">{s.sub}</p>
                </div>
              ))}
            </div>
            {/* Recent decisions preview */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-5">
              <h4 className="font-semibold mb-3">Recent Decisions</h4>
              {brainDecisions.slice(0, 3).map(d => (
                <div key={d.id} className="p-3 bg-[#0d0d12] rounded-lg mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{d.action}</span>
                    <span className={`text-xs font-bold ${d.confidence >= 85 ? 'text-green-400' : d.confidence >= 70 ? 'text-yellow-400' : 'text-orange-400'}`}>{d.confidence}%</span>
                  </div>
                  <p className="text-[10px] text-[#71717a]">{d.reasoning.substring(0, 120)}...</p>
                </div>
              ))}
              <button onClick={() => setBrainSubTab('decisions')} className="w-full mt-2 py-2 text-xs text-[#a855f7] hover:underline">View all decisions →</button>
            </div>
          </div>
        )}

        {/* DECISIONS LOG */}
        {brainSubTab === 'decisions' && (
          <div className="space-y-3">
            {brainDecisions.map(d => (
              <div key={d.id} className="bg-[#12121a] border border-[#27272a] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${d.section === 'social' ? 'bg-pink-500/15 text-pink-400' : d.section === 'sms' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-green-500/15 text-green-400'}`}>{d.section}</span>
                    <span className="text-sm font-medium">{d.action}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${d.confidence >= 85 ? 'bg-green-500/15 text-green-400' : d.confidence >= 70 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-orange-500/15 text-orange-400'}`}>{d.confidence}%</span>
                    <span className={`px-2 py-1 rounded text-[9px] font-medium ${d.outcome === 'pending' ? 'bg-[#27272a] text-[#71717a]' : d.outcome === 'win' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>{d.outcome}</span>
                  </div>
                </div>
                <div className="p-3 bg-[#0d0d12] rounded-lg mb-2">
                  <p className="text-[9px] text-[#52525b] uppercase tracking-wider mb-1">AI Reasoning Chain</p>
                  <p className="text-xs text-[#a1a1aa] leading-relaxed">{d.reasoning}</p>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 bg-[#1a1a24] rounded-lg text-[10px] text-[#71717a] hover:text-white">✏️ Edit Reasoning</button>
                  <button className="px-3 py-1.5 bg-green-500/10 rounded-lg text-[10px] text-green-400">✅ Mark Win</button>
                  <button className="px-3 py-1.5 bg-red-500/10 rounded-lg text-[10px] text-red-400">❌ Mark Loss</button>
                  <button className="px-3 py-1.5 bg-[#1a1a24] rounded-lg text-[10px] text-[#71717a] hover:text-white ml-auto">🗑️ Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* GOALS */}
        {brainSubTab === 'goals' && (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-4">🎯 Active Goals</h4>
              <div className="space-y-4">
                {brainGoals.map((g, i) => {
                  const pct = g.target > 0 ? Math.min((g.current / g.target) * 100, 100) : 0;
                  return (
                    <div key={g.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">{g.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#71717a]">{g.current}/{g.target}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0d0d12] text-[#52525b]">{g.period}</span>
                          <input type="number" value={g.target} onChange={e => { const u = [...brainGoals]; u[i].target = +e.target.value; setBrainGoals(u); }} className="w-14 px-1 py-0.5 bg-[#0d0d12] border border-[#27272a] rounded text-xs text-white text-center focus:border-[#a855f7] focus:outline-none"/>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-[#0d0d12] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? '#22c55e' : pct >= 50 ? '#06b6d4' : '#a855f7' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* WINS & LOSSES */}
        {brainSubTab === 'winloss' && (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-4">📈 Today&apos;s Report</h4>
              <div className="p-4 bg-[#0d0d12] rounded-xl text-sm text-[#a1a1aa] whitespace-pre-wrap leading-relaxed font-mono" style={{ fontSize: '11px' }}>
{`📊 DAILY REPORT — ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏆 WINS
  • No wins recorded yet — system is paused

❌ LOSSES
  • No losses recorded yet — system is paused

📈 METRICS
  • Total reach: 0 across all channels
  • Conversions: 0
  • Revenue attributed: $0
  • SMS sent: 0 / delivered: 0% / replied: 0%
  • New leads: 0 / opted out: 0

🎯 TODAY'S PLAN
  • Configure 4 phone numbers (Step 1)
  • Enter API keys (Step 2)
  • Import lead list (Step 3)
  • Generate first content batch
  • Review & approve → unpause systems

⚙️ SELF-CORRECTIONS
  • None yet — awaiting first data cycle`}
              </div>
            </div>
          </div>
        )}

        {/* LOGIC RULES */}
        {brainSubTab === 'rules' && (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-4">⚙️ Confidence Scoring Weights</h4>
              <p className="text-xs text-[#52525b] mb-3">Edit any weight — AI recalculates all scores immediately</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(brainRules.scoring).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between p-2 bg-[#0d0d12] rounded-lg">
                    <span className="text-xs text-[#a1a1aa]">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-bold ${val >= 0 ? 'text-green-400' : 'text-red-400'}`}>{val >= 0 ? '+' : ''}{val}</span>
                      <input type="number" value={val} onChange={e => setBrainRules(r => ({ ...r, scoring: { ...r.scoring, [key]: +e.target.value } }))} className="w-12 px-1 py-1 bg-[#1a1a24] border border-[#27272a] rounded text-xs text-white text-center focus:border-[#a855f7] focus:outline-none"/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-3">⏰ Timing Rules</h4>
              <div className="space-y-2">
                {Object.entries(brainRules.timing).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between p-2 bg-[#0d0d12] rounded-lg">
                    <span className="text-xs text-[#a1a1aa]">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                    <span className="text-xs font-medium text-white">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-3">🔍 SEO Rules</h4>
              <div className="space-y-2">
                {Object.entries(brainRules.seo).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between p-2 bg-[#0d0d12] rounded-lg">
                    <span className="text-xs text-[#a1a1aa]">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                    <span className="text-xs font-medium text-white">{typeof val === 'boolean' ? (val ? '✅ Yes' : '❌ No') : val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LEARNINGS */}
        {brainSubTab === 'learnings' && (
          <div className="space-y-3">
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <h4 className="font-semibold mb-4">💡 AI Learnings</h4>
              <div className="space-y-3">
                {brainLearnings.map(l => (
                  <div key={l.id} className="p-3 bg-[#0d0d12] rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 text-sm ${l.applied ? '✅' : '💡'}`}>{l.applied ? '✅' : '💡'}</span>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-white leading-relaxed">{l.insight}</p>
                        <p className="text-[10px] text-[#52525b] mt-1">Source: {l.source}</p>
                      </div>
                      <button className={`px-2 py-1 rounded text-[9px] font-medium ${l.applied ? 'bg-green-500/10 text-green-400' : 'bg-[#27272a] text-[#71717a]'}`}>
                        {l.applied ? 'Applied' : 'Apply'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-xs text-[#71717a] hover:text-white">+ Add Custom Learning</button>
            </div>
          </div>
        )}

        {/* DAILY PLAN */}
        {brainSubTab === 'plan' && (
          <div className="space-y-4">
            {/* GOALS BANNER */}
            <div className="p-4 bg-gradient-to-r from-[#a855f7]/10 to-[#ec4899]/10 border border-[#a855f7]/20 rounded-2xl">
              <h4 className="font-semibold mb-2 text-sm">🎯 Active Goals Driving This Schedule</h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[
                  { niche: '🏥 Medazon', goal: '100 bookings/day', timeline: '60 days', revenue: '$11,340/day' },
                  { niche: '💪 XtremeNad', goal: '100 checkouts/day', timeline: '30 days', revenue: '$17,900/day' },
                  { niche: '🛒 EvenBetter', goal: 'Fix 256 feed issues', timeline: '7 days', revenue: 'Activate free listings' },
                  { niche: '🤖 StreamsAI', goal: 'SEO pages + trials', timeline: 'Ongoing', revenue: 'Trial → Paid' },
                ].map((g, i) => (
                  <div key={i} className="bg-[#0d0d12] rounded-lg p-2">
                    <p className="text-[9px] text-[#52525b]">{g.niche}</p>
                    <p className="text-xs font-bold text-white">{g.goal}</p>
                    <p className="text-[9px] text-[#71717a]">{g.timeline} · {g.revenue}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* COMPLIANCE SAFEGUARDS BANNER */}
            <div className="p-4 bg-[#12121a] border border-red-500/20 rounded-2xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🛡️</span>
                <h4 className="font-semibold text-sm text-red-400">Google Compliance Safeguards — Active on ALL Content</h4>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[
                  { rule: 'Publish velocity', value: 'Max 5 pages/day (ramped)', status: '✅' },
                  { rule: 'E-E-A-T', value: 'Author + sources + reviewer', status: '✅' },
                  { rule: 'XtremeNad phrases', value: '17 banned words blocked', status: '🔴' },
                  { rule: 'FDA disclaimer', value: 'Auto-injected on supplement pages', status: '✅' },
                  { rule: 'HIPAA', value: 'No patient data in ads/content', status: '✅' },
                  { rule: 'Price match', value: 'Feed price = website price', status: '✅' },
                  { rule: 'Keyword density', value: 'Max 2% per page', status: '✅' },
                  { rule: 'Content uniqueness', value: 'Plagiarism check before publish', status: '✅' },
                ].map((r, i) => (
                  <div key={i} className="bg-[#0d0d12] rounded-lg p-2 flex items-center gap-2">
                    <span className="text-xs">{r.status}</span>
                    <div>
                      <p className="text-[9px] text-[#52525b]">{r.rule}</p>
                      <p className="text-[10px] text-white">{r.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <details className="mt-3">
                <summary className="text-[10px] text-red-400 cursor-pointer">⚠️ XtremeNad BANNED phrases (click to view)</summary>
                <div className="mt-2 p-2 bg-[#0d0d12] rounded-lg text-[10px] text-red-300 leading-relaxed">
                  weight loss · lose weight · fat burner · fat burning · blocks fat · burns fat · melt fat · shed pounds · natural Adderall · Adderall alternative · prescription alternative · cures · treats · prevents disease · miracle · magic pill · instant cure · FDA approved · anti-aging drug
                </div>
              </details>
              <details className="mt-2">
                <summary className="text-[10px] text-green-400 cursor-pointer">✅ SAFE alternatives (click to view)</summary>
                <div className="mt-2 p-2 bg-[#0d0d12] rounded-lg text-[10px] text-green-300 leading-relaxed">
                  supports healthy metabolism · wellness support · dietary supplement · supports natural energy · cellular energy support · daily vitality · supports mental clarity · cognitive wellness · focus support · 5-in-1 gummy · daily wellness gummy
                </div>
              </details>
            </div>

            {/* MASTER DAILY SCHEDULE — 38 TASKS */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">📅 Master Daily Schedule — 38 Automated Tasks</h4>
                <span className="text-xs text-[#52525b]">All times auto-adjusted per timezone · Regenerated at 9pm daily</span>
              </div>
              <div className="space-y-1">
                {[
                  { time: '1:00 AM', task: '🗺️ Regenerate sitemaps for all 4 domains', niche: 'all', section: 'seo' },
                  { time: '2:00 AM', task: '🔍 SEO page generation: 5 Medazon + 4 XtremeNad + 2 EBB + 1 StreamsAI', niche: 'all', section: 'seo' },
                  { time: '3:00 AM', task: '📊 Pull analytics: GA4, Search Console, social, Stripe', niche: 'all', section: 'analytics' },
                  { time: '3:30 AM', task: '💰 EvenBetterBuy: competitor price check + auto-adjust + feed rebuild', niche: 'ebb', section: 'pricing' },
                  { time: '4:00 AM', task: '📈 Track keyword rankings across all 4 domains', niche: 'all', section: 'seo' },
                  { time: '4:30 AM', task: '🔎 Index check: yesterday\'s pages indexed? Resubmit if not', niche: 'all', section: 'seo' },
                  { time: '5:00 AM', task: '🛡️ COMPLIANCE: run ALL new content through safeguards engine', niche: 'all', section: 'compliance' },
                  { time: '5:30 AM', task: '🧪 A/B test evaluation: pick winners, apply learnings', niche: 'all', section: 'brain' },
                  { time: '6:00 AM', task: '📋 Daily report: bookings, checkouts, traffic, revenue vs goal', niche: 'all', section: 'brain' },
                  { time: '7:00 AM', task: '⚙️ Self-correct: rewrite pages with impressions but <1% CTR', niche: 'all', section: 'brain' },
                  { time: '7:00 AM', task: '💪 XtremeNad SMS: Gym cluster (pre-workout timing)', niche: 'xtreme', section: 'sms' },
                  { time: '7:00 AM', task: '💪 XtremeNad TikTok #1: morning energy content', niche: 'xtreme', section: 'social' },
                  { time: '8:00 AM', task: '🏥 Medazon Instagram: privacy-focused health tip', niche: 'medazon', section: 'social' },
                  { time: '8:00 AM', task: '🛒 EBB: check Merchant Center diagnostics, fix disapprovals', niche: 'ebb', section: 'gmc' },
                  { time: '9:00 AM', task: '🛒 EBB TikTok: deal of the day content', niche: 'ebb', section: 'social' },
                  { time: '9:00 AM', task: '💪 XtremeNad IG carousel: ingredient spotlight', niche: 'xtreme', section: 'social' },
                  { time: '10:00 AM', task: '🤖 StreamsAI SMS: Tech/Creator cluster', niche: 'streams', section: 'sms' },
                  { time: '10:00 AM', task: '🏥 Medazon blog publish: condition-focused article', niche: 'medazon', section: 'seo' },
                  { time: '10:00 AM', task: '💪 XtremeNad SMS: follow-up to non-converters', niche: 'xtreme', section: 'sms' },
                  { time: '12:00 PM', task: '🤖 StreamsAI TikTok: "Built this in 15 seconds"', niche: 'streams', section: 'social' },
                  { time: '12:00 PM', task: '💪 XtremeNad TikTok #2: midday content', niche: 'xtreme', section: 'social' },
                  { time: '12:00 PM', task: '🏥 Medazon Facebook: community / value post', niche: 'medazon', section: 'social' },
                  { time: '2:00 PM', task: '💪 XtremeNad YouTube Short: results/testimonial', niche: 'xtreme', section: 'social' },
                  { time: '2:00 PM', task: '🤖 StreamsAI YouTube tutorial: "How to build X"', niche: 'streams', section: 'social' },
                  { time: '2:00 PM', task: '💪 XtremeNad blog publish: ingredient/benefit article', niche: 'xtreme', section: 'seo' },
                  { time: '5:00 PM', task: '💪 XtremeNad IG Reel: after-work fitness angle', niche: 'xtreme', section: 'social' },
                  { time: '5:00 PM', task: '🛒 EBB Instagram: deal spotlight post', niche: 'ebb', section: 'social' },
                  { time: '6:00 PM', task: '🏥 Medazon SMS: after-work booking push (peak hours)', niche: 'medazon', section: 'sms' },
                  { time: '6:00 PM', task: '🏥 Medazon IG: "See a doctor from your couch. $1.99."', niche: 'medazon', section: 'social' },
                  { time: '7:00 PM', task: '💪 XtremeNad TikTok #3: evening content', niche: 'xtreme', section: 'social' },
                  { time: '7:00 PM', task: '🛒 EBB Facebook: product showcase', niche: 'ebb', section: 'social' },
                  { time: '8:00 PM', task: '🤖 StreamsAI Twitter/LinkedIn: user success story', niche: 'streams', section: 'social' },
                  { time: '9:00 PM', task: '🎯 GOAL CHECK: Medazon bookings vs 100/day target', niche: 'medazon', section: 'brain' },
                  { time: '9:00 PM', task: '🎯 GOAL CHECK: XtremeNad checkouts vs 100/day target', niche: 'xtreme', section: 'brain' },
                  { time: '9:00 PM', task: '🎯 GOAL CHECK: EBB clicks/conversions', niche: 'ebb', section: 'brain' },
                  { time: '9:00 PM', task: '🎯 GOAL CHECK: StreamsAI signups/trials', niche: 'streams', section: 'brain' },
                  { time: '9:15 PM', task: '⚙️ Self-correction: if behind on any goal → catch-up plan', niche: 'all', section: 'brain' },
                  { time: '9:30 PM', task: '📝 Generate tomorrow\'s content queue', niche: 'all', section: 'brain' },
                  { time: '10:00 PM', task: '📤 Queue all approved content for tomorrow', niche: 'all', section: 'scheduler' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 bg-[#0d0d12] rounded-lg hover:bg-[#1a1a24] transition-colors">
                    <span className="text-[10px] font-mono text-[#52525b] w-14 flex-shrink-0">{item.time}</span>
                    <span className={`px-1 py-0.5 rounded text-[7px] font-bold uppercase w-16 text-center flex-shrink-0 ${
                      item.section === 'social' ? 'bg-pink-500/15 text-pink-400' :
                      item.section === 'sms' ? 'bg-cyan-500/15 text-cyan-400' :
                      item.section === 'seo' ? 'bg-green-500/15 text-green-400' :
                      item.section === 'brain' ? 'bg-purple-500/15 text-purple-400' :
                      item.section === 'analytics' ? 'bg-blue-500/15 text-blue-400' :
                      item.section === 'pricing' ? 'bg-yellow-500/15 text-yellow-400' :
                      item.section === 'compliance' ? 'bg-red-500/15 text-red-400' :
                      item.section === 'gmc' ? 'bg-orange-500/15 text-orange-400' :
                      'bg-[#27272a] text-[#71717a]'
                    }`}>{item.section}</span>
                    <span className={`px-1 py-0.5 rounded text-[7px] w-12 text-center flex-shrink-0 ${
                      item.niche === 'medazon' ? 'bg-teal-500/10 text-teal-400' :
                      item.niche === 'xtreme' ? 'bg-red-500/10 text-red-400' :
                      item.niche === 'ebb' ? 'bg-amber-500/10 text-amber-400' :
                      item.niche === 'streams' ? 'bg-indigo-500/10 text-indigo-400' :
                      'bg-[#1a1a24] text-[#52525b]'
                    }`}>{item.niche === 'all' ? 'ALL' : item.niche === 'medazon' ? 'MED' : item.niche === 'xtreme' ? 'XTR' : item.niche === 'ebb' ? 'EBB' : 'SAI'}</span>
                    <span className="text-[10px] text-[#a1a1aa] leading-tight">{item.task}</span>
                  </div>
                ))}
              </div>

              {/* Daily totals */}
              <div className="mt-4 p-3 bg-[#0d0d12] rounded-lg">
                <p className="text-[9px] text-[#52525b] uppercase tracking-wider mb-2">Daily Output Totals</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'SEO Pages', value: '12', color: '#22c55e' },
                    { label: 'Social Posts', value: '~20', color: '#ec4899' },
                    { label: 'SMS Campaigns', value: '4', color: '#06b6d4' },
                    { label: 'Blog Articles', value: '2', color: '#a855f7' },
                  ].map((t, i) => (
                    <div key={i} className="text-center">
                      <p className="text-lg font-bold" style={{ color: t.color }}>{t.value}</p>
                      <p className="text-[8px] text-[#52525b]">{t.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button className="flex-1 py-3 bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7] rounded-xl text-sm font-semibold">✏️ Edit Plan</button>
                <button className="flex-1 py-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl text-sm font-semibold">✅ Approve Plan</button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* KNOWLEDGE VAULT — All editable prompts, templates, safeguards */}
        {/* ============================================================ */}
        {brainSubTab === 'vault' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
              <p className="text-[10px] text-blue-300">📚 <strong>Knowledge Vault</strong> — Every prompt, template, safeguard, and strategy the AI uses is stored here. Edit anything in real-time. Changes apply immediately to all content generation, scheduling, and compliance checks.</p>
            </div>

            {/* Vault sections as accordions */}
            {[
              {
                id: 'prompts',
                icon: '✍️',
                title: 'Content Prompts & Templates',
                desc: 'Social post hooks, blog article outlines, SMS messages, email sequences',
                color: '#a855f7',
                items: [
                  { label: 'MedazonHealth Social Hooks', count: 15, sample: '"Your health. Your business. Nobody else\'s. $1.99 to book..."' },
                  { label: 'XtremeNad Social Hooks', count: 12, sample: '"Stop taking 5 pills. Take 1 gummy. 220,000+ switched..."' },
                  { label: 'StreamsAI Social Hooks', count: 10, sample: '"Imagine building anything. Describe it. Watch it come to life..."' },
                  { label: 'EvenBetterBuy Social Hooks', count: 8, sample: '"Same product. 80% less. Why are you still paying brand price?"' },
                  { label: 'SMS Templates per Niche', count: 20, sample: '4 niches × 5 rotation messages each' },
                  { label: 'Blog Article Outlines', count: 8, sample: 'Condition pages, ingredient pages, comparison pages, listicles' },
                  { label: 'Email Nurture Sequences', count: 4, sample: 'Free bottle → Day 3 → Day 7 → Day 14 → Reorder' },
                  { label: 'Video Script Templates', count: 20, sample: '10 kinetic typography + 10 product showcase' },
                ],
              },
              {
                id: 'safeguards',
                icon: '🛡️',
                title: 'Compliance Safeguards',
                desc: 'Google, FTC, HIPAA rules — edit banned phrases, safe alternatives, disclaimers',
                color: '#ef4444',
                items: [
                  { label: 'XtremeNad Banned Phrases', count: 17, sample: 'weight loss, fat burner, Adderall alternative, cures, FDA approved...' },
                  { label: 'XtremeNad Safe Alternatives', count: 15, sample: 'supports healthy metabolism, wellness support, cognitive wellness...' },
                  { label: 'FDA Disclaimers', count: 4, sample: '*These statements have not been evaluated by the FDA...' },
                  { label: 'HIPAA Rules', count: 6, sample: 'No patient data in ads, no specific diagnoses in retargeting...' },
                  { label: 'Google Merchant Center Rules', count: 10, sample: 'Price accuracy, no hidden costs, subscription disclosure...' },
                  { label: 'Content Velocity Limits', count: 4, sample: 'Max 5 pages/day ramped, no duplicate content, 2% keyword density...' },
                  { label: 'E-E-A-T Requirements', count: 6, sample: 'Author bio required, 3+ sources cited, medical reviewer on health pages...' },
                ],
              },
              {
                id: 'seo',
                icon: '🔍',
                title: 'SEO Strategy & Keywords',
                desc: 'Target keywords, page templates, schema markup, internal linking rules',
                color: '#22c55e',
                items: [
                  { label: 'MedazonHealth Keywords', count: 45, sample: 'private std testing online, discreet doctor visit, telehealth Florida...' },
                  { label: 'XtremeNad Keywords', count: 30, sample: 'best 5-in-1 gummy, ashwagandha gummy benefits, NAD+ supplement...' },
                  { label: 'StreamsAI Keywords', count: 25, sample: 'build app with ai, ai website builder, no code ai platform...' },
                  { label: 'EvenBetterBuy Keywords', count: 20, sample: 'best [product] under $25, [brand] alternative cheap...' },
                  { label: 'SEO Page Templates', count: 6, sample: 'Condition page, city page, comparison page, listicle, FAQ, blog' },
                  { label: 'Schema Markup Templates', count: 4, sample: 'MedicalWebPage, Product, FAQPage, LocalBusiness' },
                  { label: 'FL City Pages List', count: 60, sample: 'Miami, Tampa, Orlando, Jacksonville... 60 cities' },
                ],
              },
              {
                id: 'pricing',
                icon: '💰',
                title: 'Pricing & Offers',
                desc: 'Product pricing, competitor undercut rules, offer strategies',
                color: '#f59e0b',
                items: [
                  { label: 'MedazonHealth Pricing Model', count: 1, sample: '$1.99 booking → $189 only if satisfied → Free if not' },
                  { label: 'XtremeNad Pricing Model', count: 2, sample: '$179 one-time OR free bottle + $1.95 shipping → $49/mo sub' },
                  { label: 'EvenBetterBuy Price Rules', count: 3, sample: 'Undercut by $0.01, floor = cost + margin, free shipping threshold' },
                  { label: 'StreamsAI Pricing', count: 1, sample: 'Free trial → $9.99/mo or $79/yr' },
                  { label: 'A/B Test Configurations', count: 41, sample: '10 per niche + 11 MedazonHealth = 41 total active tests' },
                ],
              },
              {
                id: 'schedule',
                icon: '📅',
                title: 'Schedule & Automation',
                desc: 'Daily cron jobs, posting times, content rotation, auto-correction logic',
                color: '#06b6d4',
                items: [
                  { label: 'Master Daily Cron (38 tasks)', count: 38, sample: '1AM sitemap → 2AM SEO gen → 7AM social → 9PM goal check...' },
                  { label: 'Weekly Tasks', count: 14, sample: 'Mon: keyword report, Wed: competitor analysis, Fri: compliance audit...' },
                  { label: 'Posting Time Rules', count: 4, sample: 'Per niche: peak hours, quiet hours, max per day, platform rotation' },
                  { label: 'Self-Correction Logic', count: 8, sample: 'If bookings < target → generate more pages. If CTR < 1% → rewrite.' },
                  { label: 'Goal Tracking Formulas', count: 4, sample: 'Medazon: 100 bookings/day @ 60 days. XtremeNad: 100 checkouts/day @ 30 days.' },
                ],
              },
              {
                id: 'brand',
                icon: '🎨',
                title: 'Brand Voice & Messaging',
                desc: 'Per-niche tone, taglines, value propositions, competitor positioning',
                color: '#ec4899',
                items: [
                  { label: 'MedazonHealth Brand Voice', count: 1, sample: 'Privacy-first, empathetic, zero-risk, "$189 only if YOU are satisfied"' },
                  { label: 'XtremeNad Brand Voice', count: 1, sample: 'Results-driven, testimonial-heavy, "Stop taking 5 pills"' },
                  { label: 'StreamsAI Brand Voice', count: 1, sample: 'Empowering, future-focused, "Build anything. Describe it."' },
                  { label: 'EvenBetterBuy Brand Voice', count: 1, sample: 'Smart shopper, deal hunter, "Same product. Better price."' },
                  { label: 'Competitor Positioning', count: 4, sample: 'Medazon vs Teladoc, XtremeNad vs Goli, StreamsAI vs Bolt/Lovable' },
                  { label: 'Core Taglines', count: 4, sample: 'One per niche — the single line that defines each brand' },
                ],
              },
            ].map(section => (
              <details key={section.id} className="bg-[#12121a] border border-[#27272a] rounded-xl overflow-hidden">
                <summary className="p-4 cursor-pointer hover:bg-[#1a1a24] transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{section.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: section.color }}>{section.title}</p>
                      <p className="text-[10px] text-[#52525b]">{section.desc}</p>
                    </div>
                    <span className="text-[9px] bg-[#1a1a24] px-2 py-1 rounded-full text-[#71717a]">{section.items.reduce((a, i) => a + i.count, 0)} items</span>
                  </div>
                </summary>
                <div className="border-t border-[#27272a] p-4 space-y-2">
                  {section.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-[#0d0d12] rounded-lg hover:bg-[#1a1a24] transition-colors cursor-pointer group">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-white">{item.label}</p>
                          <span className="text-[8px] bg-[#27272a] px-1.5 py-0.5 rounded text-[#71717a]">{item.count}</span>
                        </div>
                        <p className="text-[9px] text-[#52525b] mt-0.5 truncate">{item.sample}</p>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-[9px] bg-[#a855f7]/10 text-[#a855f7] rounded border border-[#a855f7]/20">Edit</button>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-[9px] bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">View</button>
                    </div>
                  ))}
                </div>
              </details>
            ))}

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Prompts', value: '97', color: '#a855f7' },
                { label: 'Safeguard Rules', value: '62', color: '#ef4444' },
                { label: 'SEO Keywords', value: '120+', color: '#22c55e' },
                { label: 'Video Templates', value: '20', color: '#f59e0b' },
              ].map((s, i) => (
                <div key={i} className="bg-[#12121a] border border-[#27272a] rounded-xl p-3 text-center">
                  <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[9px] text-[#52525b]">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* PLATFORM CONNECTIONS — Direct OAuth Posting                   */}
        {/* ============================================================ */}
        {brainSubTab === 'platforms' && (
          <div className="space-y-4">
            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
              <p className="text-[10px] text-green-300">🔗 <strong>Direct Platform Posting</strong> — Connect your personal accounts via OAuth. Posts go directly from this page to your platforms as if you posted yourself. Zapier is fallback only. All tokens stored encrypted in Supabase.</p>
            </div>

            {/* Platform connection cards */}
            <div className="space-y-3">
              {[
                {
                  platform: 'TikTok',
                  icon: '🎵',
                  color: '#ff0050',
                  status: 'disconnected',
                  authUrl: '/api/auth/tiktok',
                  scopes: 'video.publish, video.upload, user.info.basic',
                  postMethod: 'TikTok Content Posting API v2',
                  features: ['Post videos directly', 'Schedule via API', 'Analytics read-back', 'Comment management'],
                  note: 'Requires TikTok for Developers app approval. Video posts only (no text-only).',
                },
                {
                  platform: 'Instagram',
                  icon: '📸',
                  color: '#E4405F',
                  status: 'disconnected',
                  authUrl: '/api/auth/instagram',
                  scopes: 'instagram_basic, instagram_content_publish, pages_show_list',
                  postMethod: 'Instagram Graph API via Facebook Business',
                  features: ['Post photos/carousels/reels', 'Schedule up to 25/day', 'Story posting', 'Insights read-back'],
                  note: 'Requires Facebook Business account linked to Instagram Professional account.',
                },
                {
                  platform: 'Facebook',
                  icon: '📘',
                  color: '#1877F2',
                  status: 'disconnected',
                  authUrl: '/api/auth/facebook',
                  scopes: 'pages_manage_posts, pages_read_engagement, publish_video',
                  postMethod: 'Facebook Graph API v19.0',
                  features: ['Post to Pages (text, photo, video, link)', 'Schedule posts', 'Boost posts via API', 'Comment management', 'Insights'],
                  note: 'Posts to your Facebook Page, not personal profile. Page must be connected.',
                },
                {
                  platform: 'YouTube',
                  icon: '▶️',
                  color: '#FF0000',
                  status: 'disconnected',
                  authUrl: '/api/auth/youtube',
                  scopes: 'youtube.upload, youtube.force-ssl, youtube.readonly',
                  postMethod: 'YouTube Data API v3',
                  features: ['Upload videos/Shorts', 'Set title, description, tags', 'Schedule publish time', 'Playlist management'],
                  note: 'Videos uploaded as unlisted by default, then set to public at scheduled time.',
                },
                {
                  platform: 'Twitter / X',
                  icon: '𝕏',
                  color: '#1DA1F2',
                  status: 'disconnected',
                  authUrl: '/api/auth/twitter',
                  scopes: 'tweet.write, tweet.read, users.read, media.write',
                  postMethod: 'Twitter API v2 + Media Upload',
                  features: ['Post tweets (text + media)', 'Thread creation', 'Schedule tweets', 'Analytics'],
                  note: 'Requires Twitter/X Developer Portal app with Elevated access for media uploads.',
                },
                {
                  platform: 'LinkedIn',
                  icon: '💼',
                  color: '#0A66C2',
                  status: 'disconnected',
                  authUrl: '/api/auth/linkedin',
                  scopes: 'w_member_social, r_liteprofile, w_organization_social',
                  postMethod: 'LinkedIn Marketing API',
                  features: ['Post articles/text/images', 'Company page posting', 'Schedule posts', 'Analytics'],
                  note: 'Can post to personal profile or company page. Requires LinkedIn Marketing Developer app.',
                },
              ].map((p, i) => (
                <div key={i} className="bg-[#12121a] border border-[#27272a] rounded-xl overflow-hidden">
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: `${p.color}15` }}>
                      {p.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{p.platform}</h4>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${
                          p.status === 'connected' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/10 text-red-400'
                        }`}>{p.status === 'connected' ? '✅ Connected' : '⚠️ Not Connected'}</span>
                      </div>
                      <p className="text-[9px] text-[#52525b]">{p.postMethod}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {p.features.map((f, fi) => (
                          <span key={fi} className="text-[7px] px-1 py-0.5 bg-[#1a1a24] rounded text-[#71717a]">{f}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        p.status === 'connected'
                          ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                          : 'bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white hover:shadow-lg hover:shadow-[#a855f7]/20'
                      }`}
                    >
                      {p.status === 'connected' ? '✅ Connected' : '🔗 Connect'}
                    </button>
                  </div>
                  <details>
                    <summary className="px-4 py-2 bg-[#0d0d12] border-t border-[#1a1a24] text-[9px] text-[#52525b] cursor-pointer hover:text-[#a1a1aa]">
                      OAuth details & scopes
                    </summary>
                    <div className="px-4 py-3 bg-[#0d0d12] text-[10px] text-[#71717a] space-y-1">
                      <p><strong className="text-[#a1a1aa]">Scopes:</strong> {p.scopes}</p>
                      <p><strong className="text-[#a1a1aa]">Auth URL:</strong> <code className="text-[#06b6d4]">{p.authUrl}</code></p>
                      <p><strong className="text-[#a1a1aa]">Note:</strong> {p.note}</p>
                    </div>
                  </details>
                </div>
              ))}
            </div>

            {/* Posting flow diagram */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-4">
              <h4 className="text-sm font-semibold mb-3">📤 How Direct Posting Works</h4>
              <div className="flex items-center gap-2 text-[10px] text-[#a1a1aa] flex-wrap">
                <span className="px-2 py-1 bg-[#a855f7]/10 rounded text-[#a855f7]">AI generates content</span>
                <span className="text-[#52525b]">→</span>
                <span className="px-2 py-1 bg-[#ec4899]/10 rounded text-[#ec4899]">You approve in Generate tab</span>
                <span className="text-[#52525b]">→</span>
                <span className="px-2 py-1 bg-[#06b6d4]/10 rounded text-[#06b6d4]">Queued in Schedule tab</span>
                <span className="text-[#52525b]">→</span>
                <span className="px-2 py-1 bg-green-500/10 rounded text-green-400">At scheduled time: POST via OAuth</span>
                <span className="text-[#52525b]">→</span>
                <span className="px-2 py-1 bg-[#f59e0b]/10 rounded text-[#f59e0b]">Posted as YOU on your page</span>
              </div>
              <div className="mt-3 p-2 bg-[#0d0d12] rounded-lg">
                <p className="text-[9px] text-[#52525b]">
                  <strong className="text-[#71717a]">Fallback chain:</strong> OAuth direct post → if fails → retry 1x → if fails → Zapier webhook → if fails → alert you + save as draft.
                  All posts logged in schedule history with platform post ID for tracking.
                </p>
              </div>
            </div>

            {/* Quick connect all */}
            <button className="w-full py-4 bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-[#a855f7]/20 transition-all">
              🔗 Connect All Platforms
            </button>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // RENDER - GOOGLE SEO DASHBOARD (Full)
  // ============================================================
  const renderGoogleSEO = () => {
    const googleTabs = [
      { id: 'feed' as const, label: '🛒 Shopping Feed', badge: feedIssues > 0 ? String(feedIssues) : undefined },
      { id: 'console' as const, label: '🔍 Search Console' },
      { id: 'seoengine' as const, label: '📄 SEO Engine' },
      { id: 'sitemap' as const, label: '🗺️ Sitemap' },
      { id: 'schema' as const, label: '📋 Schema' },
      { id: 'setup' as const, label: '⚙️ Setup' },
    ];
    const nicheN = niches.find(n => n.id === selectedNiche)?.name || '';
    return (
      <div className="space-y-4">
        {/* Google SEO Header */}
        <div className="p-4 bg-[#12121a] border border-[#22c55e]/20 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.04), rgba(6,182,212,0.04))' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#22c55e]/10 rounded-xl flex items-center justify-center text-2xl">🔍</div>
            <div className="flex-1">
              <h3 className="text-lg font-bold" style={{ color: '#22c55e' }}>Google SEO Dashboard — {nicheN}</h3>
              <p className="text-[10px] text-[#52525b]">Shopping Feed · Search Console · SEO Engine · Sitemap · Schema · Setup</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-green-400">Live</span>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {googleTabs.map(t => (
            <button key={t.id} onClick={() => setGoogleSubTab(t.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${googleSubTab === t.id ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30' : 'bg-[#12121a] text-[#71717a] border border-[#27272a] hover:text-white'}`}>
              {t.label}
              {t.badge && <span className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* ====== SHOPPING FEED ====== */}
        {googleSubTab === 'feed' && (
          <div className="space-y-4">
            {/* Feed KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Products', value: selectedNiche === 'evenbetterbuy' ? '316' : selectedNiche === 'xtremenad' ? '12' : '0', color: '#22c55e' },
                { label: 'Feed Issues', value: selectedNiche === 'evenbetterbuy' ? '256' : '0', color: selectedNiche === 'evenbetterbuy' ? '#ef4444' : '#22c55e' },
                { label: 'Active in GMC', value: selectedNiche === 'evenbetterbuy' ? '60' : '0', color: '#06b6d4' },
                { label: 'Disapproved', value: selectedNiche === 'evenbetterbuy' ? '14' : '0', color: '#ef4444' },
              ].map((k, i) => (
                <div key={i} className="bg-[#12121a] border border-[#27272a] rounded-xl p-4">
                  <p className="text-[10px] text-[#52525b]">{k.label}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Feed actions */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-4">
                <h4 className="text-sm font-semibold mb-2">Feed URL</h4>
                <div className="flex gap-2">
                  <input readOnly value={`https://${selectedNiche === 'evenbetterbuy' ? 'dropshipping-management-ten' : selectedNiche}.vercel.app/api/shopping-feed`} className="flex-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] truncate" />
                  <button className="px-4 py-2 bg-[#22c55e] text-white rounded-lg text-xs font-semibold hover:bg-[#16a34a]">Copy</button>
                </div>
                <p className="text-[9px] text-[#52525b] mt-2">Submit to Google Merchant Center → Products → Feeds</p>
              </div>
              <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-4">
                <h4 className="text-sm font-semibold mb-2">Actions</h4>
                <div className="space-y-2">
                  <button className="w-full py-2 bg-[#22c55e]/10 border border-[#22c55e]/30 text-[#22c55e] rounded-lg text-xs font-semibold hover:bg-[#22c55e]/20">🔄 Regenerate Feed XML</button>
                  <button className="w-full py-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-semibold hover:bg-blue-500/20">📊 Check Feed Health</button>
                </div>
              </div>
            </div>

            {/* Product table */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
                <h4 className="text-sm font-semibold">Products in Feed</h4>
                <div className="flex gap-2">
                  <input placeholder="Search products..." className="px-3 py-1.5 bg-[#0d0d12] border border-[#27272a] rounded-lg text-xs text-white placeholder:text-[#3f3f46] focus:border-[#22c55e] focus:outline-none w-48" />
                  <select className="px-3 py-1.5 bg-[#0d0d12] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa]">
                    <option>All Status</option><option>Active</option><option>Disapproved</option><option>Pending</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-[#27272a] text-[#52525b]"><th className="text-left p-3">Product</th><th className="text-left p-3">Price</th><th className="text-left p-3">Status</th><th className="text-left p-3">Issues</th></tr></thead>
                  <tbody>
                    {(() => {
                      const products = selectedNiche === 'evenbetterbuy' ? [
                        { name: 'Wireless Earbuds Pro', price: '$24.99', status: 'Active', issues: 'None' },
                        { name: 'USB-C Hub 7-in-1', price: '$18.49', status: 'Active', issues: 'None' },
                        { name: 'LED Strip Lights 50ft', price: '$12.99', status: 'Disapproved', issues: 'Missing GTIN' },
                        { name: 'Portable Blender', price: '$22.99', status: 'Disapproved', issues: 'Image quality' },
                        { name: 'Phone Stand Adjustable', price: '$9.99', status: 'Active', issues: 'None' },
                      ] : selectedNiche === 'xtremenad' ? [
                        { name: 'XtremeNad 5-in-1 Gummy (30ct)', price: '$49.00', status: 'Active', issues: 'None' },
                        { name: 'XtremeNad 5-in-1 Gummy (60ct)', price: '$89.00', status: 'Active', issues: 'None' },
                        { name: 'XtremeNad Free Bottle Trial', price: '$1.95', status: 'Pending', issues: 'Subscription disclosure' },
                      ] : [
                        { name: 'No products configured yet', price: '-', status: 'N/A', issues: 'Setup required' },
                      ];
                      return products.map((p, i) => (
                        <tr key={i} className="border-b border-[#1a1a24] hover:bg-[#1a1a24]">
                          <td className="p-3 text-white">{p.name}</td>
                          <td className="p-3 text-[#a1a1aa]">{p.price}</td>
                          <td className="p-3"><span className={`text-[9px] px-2 py-0.5 rounded-full ${p.status === 'Active' ? 'bg-green-500/15 text-green-400' : p.status === 'Disapproved' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}`}>{p.status}</span></td>
                          <td className="p-3 text-[#71717a]">{p.issues}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====== SEARCH CONSOLE ====== */}
        {googleSubTab === 'console' && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Clicks', value: '0', change: '↑ +12%', changeColor: '#22c55e' },
                { label: 'Impressions', value: '0', change: '↑ +8%', changeColor: '#22c55e' },
                { label: 'Avg CTR', value: '0.0%', change: '↓ -0.3%', changeColor: '#ef4444' },
                { label: 'Avg Position', value: '0.0', change: '↑ -1.2', changeColor: '#22c55e' },
              ].map((k, i) => (
                <div key={i} className="bg-[#12121a] border border-[#27272a] rounded-xl p-4">
                  <p className="text-[10px] text-[#52525b]">{k.label}</p>
                  <p className="text-2xl font-bold text-white mt-1">{k.value}</p>
                  <p className="text-[10px] mt-1" style={{ color: k.changeColor }}>{k.change}</p>
                </div>
              ))}
            </div>
            {/* Date range */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {(['7d', '14d', '28d', '90d'] as const).map(r => (
                  <button key={r} onClick={() => setGscDateRange(r)} className={`px-3 py-1.5 rounded-lg text-xs ${gscDateRange === r ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30' : 'bg-[#12121a] text-[#71717a] border border-[#27272a]'}`}>{r}</button>
                ))}
              </div>
              <button className="px-4 py-2 bg-gradient-to-r from-[#22c55e] to-[#06b6d4] text-white rounded-lg text-xs font-semibold">Fetch from GSC</button>
            </div>
            {/* Queries table */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
              <h4 className="text-sm font-semibold mb-4">Search Queries (0)</h4>
              <div className="text-center py-8">
                <p className="text-4xl mb-2">🔍</p>
                <p className="text-sm text-[#71717a]">No search queries yet</p>
                <p className="text-[10px] text-[#52525b] mt-1">Connect GSC API key in Setup tab, then click &quot;Fetch from GSC&quot;</p>
              </div>
            </div>
            {/* Top pages */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
              <h4 className="text-sm font-semibold mb-4">Top Pages by Clicks</h4>
              <div className="text-center py-6 text-[#52525b] text-xs">No page data yet — connect GSC to populate</div>
            </div>
          </div>
        )}

        {/* ====== SEO ENGINE ====== */}
        {googleSubTab === 'seoengine' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total SEO Pages', value: String(seoPages.length), color: '#22c55e' },
                { label: 'Total Impressions (30d)', value: '0', sub: 'Across all generated SEO pages' },
                { label: 'Last Run', value: 'Never run', color: '#71717a' },
              ].map((k, i) => (
                <div key={i} className="bg-[#12121a] border border-[#27272a] rounded-xl p-4">
                  <p className="text-[10px] text-[#52525b]">{k.label}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: k.color || '#fff' }}>{k.value}</p>
                  {k.sub && <p className="text-[9px] text-[#52525b] mt-1">{k.sub}</p>}
                </div>
              ))}
            </div>
            {/* Run SEO Cycle */}
            <div className="flex justify-end">
              <button className="px-6 py-2.5 bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-[#7c3aed]/20">Run SEO Cycle</button>
            </div>
            {/* Generated pages list */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
              <h4 className="text-sm font-semibold mb-4">Generated Pages</h4>
              {seoPages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-4xl mb-2">🌱</p>
                  <p className="text-sm font-semibold text-[#71717a]">No SEO pages yet</p>
                  <p className="text-[10px] text-[#52525b] mt-1">Click &quot;Run SEO Cycle&quot; to auto-generate landing pages.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-[#27272a] text-[#52525b]"><th className="text-left p-3">Page</th><th className="text-left p-3">Impressions</th><th className="text-left p-3">Clicks</th><th className="text-left p-3">Status</th><th className="text-left p-3">Created</th></tr></thead>
                  <tbody>{seoPages.map((p, i) => (
                    <tr key={i} className="border-b border-[#1a1a24]"><td className="p-3 text-white">{p.title}</td><td className="p-3 text-[#a1a1aa]">{p.impressions}</td><td className="p-3 text-[#a1a1aa]">{p.clicks}</td><td className="p-3"><span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">{p.status}</span></td><td className="p-3 text-[#52525b]">{p.date}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            {/* SEO Queue — pages to generate */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
              <h4 className="text-sm font-semibold mb-3">📋 SEO Page Queue — {nicheN}</h4>
              <div className="space-y-1.5">
                {(selectedNiche === 'medazonhealth' ? ['Private UTI Treatment Online Florida','Discreet STD Testing From Home FL','Online ADHD Evaluation FL — Private','See Doctor Without Insurance FL — $1.99','MedazonHealth vs Teladoc','Online Doctor Miami','Telehealth Tampa','Telehealth Orlando','Telehealth Jacksonville'] : selectedNiche === 'xtremenad' ? ['Best 5-in-1 Gummy 2026','Ashwagandha Gummy Benefits','NAD+ Supplement Guide','XtremeNad vs Goli','Energy Gummy No Caffeine','L-Tyrosine Focus','ACV Gummy vs Liquid'] : selectedNiche === 'streamsai' ? ['StreamsAI vs Bolt.new','Build Booking with AI','AI App Builder','StreamsAI vs Lovable','Build E-Commerce with AI'] : ['Fix 256 feed errors','Optimize 316 titles','Best [X] under $25 pages']).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-[#0d0d12] rounded-lg border border-[#1a1a24]">
                    <span className="text-[9px] text-[#52525b] w-5">{i + 1}.</span>
                    <span className="text-[10px] text-white flex-1">{p}</span>
                    <span className="text-[7px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded">queued</span>
                    <button className="text-[8px] px-2 py-1 bg-[#22c55e]/10 text-[#22c55e] rounded hover:bg-[#22c55e]/20">Generate</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ====== SITEMAP ====== */}
        {googleSubTab === 'sitemap' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
                <h4 className="text-sm font-semibold mb-1">XML Sitemap</h4>
                <p className="text-[10px] text-[#52525b] mb-3">Submit to Google Search Console → Sitemaps</p>
                <div className="flex gap-2 mb-3">
                  <input readOnly value={`https://${selectedNiche === 'evenbetterbuy' ? 'dropshipping-management-ten' : selectedNiche}.vercel.app/api/sitemap`} className="flex-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] truncate" />
                  <button className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg text-xs font-semibold">Copy</button>
                </div>
                <button className="w-full py-2 bg-[#12121a] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] hover:text-white">Preview XML</button>
              </div>
              <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
                <h4 className="text-sm font-semibold mb-1">IndexNow</h4>
                <p className="text-[10px] text-[#52525b] mb-3">Instantly notify Bing & Yandex about new pages</p>
                <button className="w-full py-2.5 bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white rounded-lg text-sm font-semibold mb-2">Ping IndexNow</button>
                <p className="text-[9px] text-[#52525b]">Requires INDEXNOW_KEY env var</p>
              </div>
            </div>
            {/* Sitemap stats */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
              <h4 className="text-sm font-semibold mb-3">Sitemap Contents</h4>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Product Pages', value: selectedNiche === 'evenbetterbuy' ? '316' : selectedNiche === 'xtremenad' ? '12' : '0' },
                  { label: 'SEO Pages', value: String(seoPages.length) },
                  { label: 'Blog Posts', value: '0' },
                  { label: 'Total URLs', value: selectedNiche === 'evenbetterbuy' ? String(316 + seoPages.length) : String(seoPages.length) },
                ].map((s, i) => (
                  <div key={i} className="bg-[#0d0d12] rounded-lg p-3 text-center border border-[#1a1a24]">
                    <p className="text-xl font-bold text-white">{s.value}</p>
                    <p className="text-[8px] text-[#52525b]">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ====== SCHEMA ====== */}
        {googleSubTab === 'schema' && (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
              <h4 className="text-sm font-semibold mb-4">Structured Data Snippets</h4>
              <div className="space-y-4">
                {[
                  { file: 'product-schema.liquid', types: ['Product', 'AggregateOffer', 'AggregateRating'], desc: 'Price, availability, stars in Google search results', code: "{% render 'product-schema', product: product %}", fields: ['title', 'price', 'compare_at_price', 'image', 'rating', 'competitor prices'], ready: true },
                  { file: 'faq-howto-schema.liquid', types: ['FAQPage'], desc: 'Expandable FAQ accordion in search results', code: "{% render 'faq-howto-schema', product: product %}", fields: ['questions', 'answers'], ready: true },
                  ...(selectedNiche === 'medazonhealth' ? [{ file: 'medical-schema.liquid', types: ['MedicalWebPage', 'Physician'], desc: 'Medical page structured data for health content', code: "{% render 'medical-schema', page: page %}", fields: ['specialty', 'credential', 'name', 'review'], ready: false }] : []),
                  ...(selectedNiche === 'evenbetterbuy' ? [{ file: 'local-business-schema.liquid', types: ['LocalBusiness'], desc: 'Local business info for Google Maps', code: "{% render 'local-business-schema' %}", fields: ['name', 'address', 'phone', 'hours'], ready: false }] : []),
                ].map((s, i) => (
                  <div key={i} className="bg-[#0d0d12] border border-[#1a1a24] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">📄</span>
                        <span className="text-sm font-semibold text-white">{s.file}</span>
                        {s.types.map((t, ti) => <span key={ti} className="text-[8px] px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded">{t}</span>)}
                      </div>
                      <span className={`text-[9px] ${s.ready ? 'text-green-400' : 'text-yellow-400'}`}>{s.ready ? '✓ Ready' : '⏳ Draft'}</span>
                    </div>
                    <p className="text-[10px] text-[#71717a] mb-2">{s.desc}</p>
                    <div className="flex gap-2 mb-2">
                      <code className="flex-1 px-3 py-2 bg-[#12121a] rounded-lg text-[10px] text-[#06b6d4] font-mono">{s.code}</code>
                      <button className="px-4 py-2 bg-[#1a1a24] text-white rounded-lg text-xs font-semibold hover:bg-[#27272a]">Copy</button>
                    </div>
                    <div className="flex gap-1 flex-wrap">{s.fields.map((f, fi) => <span key={fi} className="text-[8px] px-1.5 py-0.5 bg-[#1a1a24] rounded text-[#71717a]">{f}</span>)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ====== SETUP ====== */}
        {googleSubTab === 'setup' && (
          <div className="space-y-4">
            {/* Setup steps */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
              <h4 className="text-sm font-semibold mb-4">Setup Checklist</h4>
              <div className="space-y-3">
                {[
                  { step: 1, title: 'Google Merchant Center', desc: 'Submit Shopping feed for free product listings', status: 'pending' },
                  { step: 2, title: 'Google Search Console', desc: 'Submit sitemap and enable search performance API', status: 'pending' },
                  { step: 3, title: 'Shopify Theme Snippets', desc: 'Add structured data to your storefront', status: 'pending' },
                  { step: 4, title: 'IndexNow (Optional)', desc: 'Instant Bing/Yandex indexing', status: 'pending' },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-[#0d0d12] border border-[#1a1a24] rounded-xl">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${s.status === 'done' ? 'bg-green-500/20 text-green-400' : 'bg-[#3b82f6]/20 text-[#3b82f6]'}`}>{s.step}</div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{s.title}</p>
                      <p className="text-[10px] text-[#52525b]">{s.desc}</p>
                    </div>
                    <span className={`text-[9px] px-2 py-1 rounded-full ${s.status === 'done' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{s.status === 'done' ? '✅ Done' : '⏳ Pending'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* API Keys */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
              <h4 className="text-sm font-semibold mb-4">API Keys & Environment Variables</h4>
              <div className="space-y-2">
                {[
                  { key: 'GOOGLE_SEARCH_CONSOLE_KEY', label: 'Google Search Console API', set: false },
                  { key: 'GOOGLE_MERCHANT_CENTER_ID', label: 'Merchant Center Account ID', set: false },
                  { key: 'INDEXNOW_KEY', label: 'IndexNow Verification Key', set: false },
                  { key: 'OPENAI_API_KEY', label: 'OpenAI (SEO content generation)', set: false },
                  { key: 'ANTHROPIC_API_KEY', label: 'Claude (SEO content generation)', set: false },
                ].map((k, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-[#0d0d12] rounded-lg border border-[#1a1a24]">
                    <code className="text-[10px] text-[#06b6d4] font-mono flex-1">{k.key}</code>
                    <span className="text-[10px] text-[#52525b]">{k.label}</span>
                    <span className={`text-[8px] px-2 py-0.5 rounded-full ${k.set ? 'bg-green-500/15 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{k.set ? '✅ Set' : '❌ Not set'}</span>
                    <button className="text-[8px] px-2 py-1 bg-[#27272a] text-white rounded hover:bg-[#3f3f46]">Edit</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Automated Schedule */}
            <div className="bg-[#12121a] border border-[#27272a] rounded-xl p-6">
              <h4 className="text-sm font-semibold mb-4">Automated Schedule</h4>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-[#27272a] text-[#52525b] uppercase text-[9px]"><th className="text-left p-3">Job</th><th className="text-left p-3">Schedule</th><th className="text-left p-3">What It Does</th><th className="text-left p-3">Status</th></tr></thead>
                <tbody>
                  {[
                    { job: 'google-shopping', schedule: 'Daily 5 AM', desc: 'Regenerates Shopping feed XML', status: 'active' },
                    { job: 'omnipresence', schedule: 'Daily 6 AM', desc: 'SEO landing pages + FAQ schemas → Shopify', status: 'active' },
                    { job: 'daily-learning', schedule: 'Daily 11 PM', desc: 'GSC data fetch + behavioral segmentation', status: 'active' },
                    { job: 'competitor-prices', schedule: 'Daily 3:30 AM', desc: 'Rainforest API price check + auto-adjust', status: selectedNiche === 'evenbetterbuy' ? 'active' : 'disabled' },
                    { job: 'compliance-check', schedule: 'Daily 5 AM', desc: 'Banned phrases scan on all new content', status: selectedNiche === 'xtremenad' ? 'active' : 'disabled' },
                  ].map((j, i) => (
                    <tr key={i} className="border-b border-[#1a1a24] hover:bg-[#1a1a24]">
                      <td className="p-3 text-white font-mono">{j.job}</td>
                      <td className="p-3 text-[#a1a1aa]">{j.schedule}</td>
                      <td className="p-3 text-[#71717a]">{j.desc}</td>
                      <td className="p-3"><span className={`text-[9px] px-2 py-0.5 rounded-full ${j.status === 'active' ? 'bg-green-500/15 text-green-400' : 'bg-[#27272a] text-[#52525b]'}`}>{j.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // NICHE COMMAND VIEW — Full one-page niche dashboard component
  // ============================================================
  const NicheCommandView = ({ selectedNiche, niches, onNavigate }: { selectedNiche: string; niches: Niche[]; onNavigate: (tab: TabType) => void }) => {
    const niche = niches.find(n => n.id === selectedNiche);
    const n = niche?.name || ''; const icon = niche?.icon || '';
    const sc = (s: string) => ({ social: '#ec4899', sms: '#06b6d4', seo: '#22c55e', brain: '#a855f7', compliance: '#ef4444', gmc: '#f97316', pricing: '#eab308', analytics: '#6366f1', queue: '#71717a' }[s] || '#71717a');
    // Per-niche configs
    const configs: Record<string, any> = {
      medazonhealth: { kpis: [{l:'Bookings',v:'0',t:'100/day',c:'#22c55e'},{l:'Revenue',v:'$0',t:'$11,340/day',c:'#a855f7'},{l:'Organic',v:'0',t:'80K/day',c:'#06b6d4'},{l:'Pages',v:'0',t:'400+',c:'#f59e0b'},{l:'Social',v:'0',t:'4/day',c:'#ec4899'},{l:'Proceed%',v:'0%',t:'60%+',c:'#8b5cf6'}], goal:'100 bookings/day in 60 days', day:'Day 1/60', rules:['✅ HIPAA compliance enforced','✅ $1.99 booking → $189 only if satisfied','✅ E-E-A-T: medical reviewer required','✅ FL license + board-certified displayed','🔗 GBP optimization active','📊 A/B: privacy vs price vs speed CTAs'], learns:['Privacy-first > price-first by 23%','Evening 6-8pm = 2x bookings'], tests:['Privacy vs Price CTA','Video preview ON/OFF','"Free if unsatisfied" placement'], social:[{t:'8:00 AM',p:'📸 IG',k:'Privacy health tip'},{t:'12:00 PM',p:'📘 FB',k:'Community value post'},{t:'6:00 PM',p:'📸 IG',k:'"$1.99 to see a doctor"'},{t:'6:30 PM',p:'📘 FB',k:'Testimonial card'}], seo:['Private UTI Treatment Online FL','Discreet STD Testing From Home FL','Online ADHD Evaluation FL','See Doctor Without Insurance FL','MedazonHealth vs Teladoc','Online Doctor Miami','Telehealth Tampa'], sched:[{t:'2AM',s:'seo',k:'Gen 5 condition/city pages'},{t:'5AM',s:'compliance',k:'HIPAA + E-E-A-T check'},{t:'6AM',s:'analytics',k:'GA4 + Search Console'},{t:'7AM',s:'seo',k:'Rewrite <1% CTR pages'},{t:'8AM',s:'social',k:'IG: health tip'},{t:'10AM',s:'seo',k:'Blog: condition article'},{t:'12PM',s:'social',k:'FB: value post'},{t:'6PM',s:'sms',k:'Booking push'},{t:'6PM',s:'social',k:'IG: $1.99 post'},{t:'9PM',s:'brain',k:'Goal check'},{t:'10PM',s:'queue',k:'Queue tomorrow'}], vids:[{n:'Privacy Promise',ty:'Kinetic'},{n:'Price Shock',ty:'Kinetic'},{n:'Silent Struggle',ty:'Kinetic'},{n:'Doctor Match',ty:'Showcase'},{n:'Privacy Shield',ty:'Showcase'},{n:'Condition Solver',ty:'Showcase'}], vault:[{l:'Social Hooks',c:15},{l:'SMS Rotation',c:5},{l:'SEO Keywords',c:45},{l:'Blog Templates',c:6},{l:'HIPAA Rules',c:15},{l:'A/B Tests',c:11},{l:'Brand Voice',c:1},{l:'FL Cities',c:60},{l:'Video Templates',c:6}] },
      xtremenad: { kpis: [{l:'Checkouts',v:'0',t:'100/day',c:'#22c55e'},{l:'Revenue',v:'$0',t:'$17,900/day',c:'#a855f7'},{l:'Organic',v:'0',t:'80K/day',c:'#06b6d4'},{l:'Views',v:'0',t:'50K/day',c:'#f59e0b'},{l:'Social',v:'0',t:'5/day',c:'#ec4899'},{l:'Bottle CVR',v:'0%',t:'Track',c:'#8b5cf6'}], goal:'100 checkouts/day in 30 days', day:'Day 1/30', rules:['🛡️ 17 BANNED phrases — blocks before publish','✅ Safe alternatives: wellness support, cognitive wellness','✅ FDA disclaimer auto-injected','⚠️ SEPARATE GMC account','✅ Two-version: Compliant (ads) vs Aggressive (owned)','📊 A/B: free bottle vs $179, hook variants'], learns:['"Stop taking 5 pills" = highest TT engagement','Free bottle 3x vs $179 for cold traffic'], tests:['Free bottle vs $179','Ingredient-led vs results-led','5-in-1 vs individual focus'], social:[{t:'7:00 AM',p:'🎵 TT',k:'Morning energy'},{t:'9:00 AM',p:'📸 IG',k:'Ingredient carousel'},{t:'12:00 PM',p:'🎵 TT',k:'"Stop taking 5 pills"'},{t:'2:00 PM',p:'▶️ YT',k:'Testimonial Short'},{t:'5:00 PM',p:'📸 IG',k:'Fitness Reel'},{t:'7:00 PM',p:'🎵 TT',k:'Evening content'}], seo:['Best 5-in-1 Gummy 2026','Ashwagandha Gummy Benefits','NAD+ Supplement Guide','XtremeNad vs Goli','Energy Gummy No Caffeine','L-Tyrosine Focus','ACV Gummy vs Liquid'], sched:[{t:'2AM',s:'seo',k:'Gen 4 SEO pages'},{t:'5AM',s:'compliance',k:'Banned phrases — ZERO TOLERANCE'},{t:'7AM',s:'sms',k:'Gym cluster push'},{t:'7AM',s:'social',k:'TT #1'},{t:'9AM',s:'social',k:'IG carousel'},{t:'10AM',s:'sms',k:'Non-converter follow-up'},{t:'12PM',s:'social',k:'TT #2'},{t:'2PM',s:'social',k:'YT Short'},{t:'2PM',s:'seo',k:'Blog article'},{t:'5PM',s:'social',k:'IG Reel'},{t:'7PM',s:'social',k:'TT #3'},{t:'9PM',s:'brain',k:'Goal check'},{t:'9:15PM',s:'brain',k:'Self-correct'}], vids:[{n:'The Replacement',ty:'Kinetic'},{n:'Switch Story',ty:'Kinetic'},{n:'Tired Question',ty:'Kinetic'},{n:'Gummy Reveal',ty:'Showcase'},{n:'Timeline',ty:'Showcase'},{n:'Ingredients',ty:'Showcase'}], vault:[{l:'Social Hooks',c:12},{l:'SMS Rotation',c:5},{l:'SEO Keywords',c:30},{l:'Banned Phrases',c:17},{l:'Safe Alternatives',c:15},{l:'FDA Disclaimers',c:4},{l:'A/B Tests',c:10},{l:'Video Templates',c:6}] },
      streamsai: { kpis: [{l:'Trials',v:'0',t:'Growing',c:'#22c55e'},{l:'Trial→Paid',v:'0%',t:'15-25%',c:'#a855f7'},{l:'Organic',v:'0',t:'Growing',c:'#06b6d4'},{l:'Pages',v:'0',t:'100+',c:'#f59e0b'},{l:'Social',v:'0',t:'4/day',c:'#ec4899'},{l:'Demos',v:'0',t:'Track',c:'#8b5cf6'}], goal:'Build SEO + trial pipeline', day:'Ongoing', rules:['✅ Comparison pages (vs Bolt, Lovable, Replit, Cursor)','✅ Tutorial templates ready','🔗 Trial funnel tracking'], learns:['"Built this in 15 seconds" = best TT','Comparison pages 2x vs generic'], tests:['Free trial vs freemium','"Build anything" vs "No code"','Demo autoplay vs click'], social:[{t:'12:00 PM',p:'🎵 TT',k:'"Built this in 15 seconds"'},{t:'2:00 PM',p:'▶️ YT',k:'Tutorial'},{t:'4:00 PM',p:'𝕏 TW',k:'Success story'},{t:'8:00 PM',p:'💼 LI',k:'Case study'}], seo:['StreamsAI vs Bolt.new','Build Booking with AI','AI App Builder','StreamsAI vs Lovable','Build E-Commerce with AI'], sched:[{t:'2AM',s:'seo',k:'Gen 1 page'},{t:'6AM',s:'analytics',k:'Trial data'},{t:'10AM',s:'sms',k:'Tech cluster'},{t:'12PM',s:'social',k:'TT demo'},{t:'2PM',s:'social',k:'YT tutorial'},{t:'4PM',s:'social',k:'Twitter story'},{t:'8PM',s:'social',k:'LinkedIn case study'},{t:'9PM',s:'brain',k:'Goal check'}], vids:[{n:'Vision Opener',ty:'Kinetic'},{n:'Builder Manifesto',ty:'Kinetic'},{n:'Code-Free Future',ty:'Kinetic'},{n:'App Builder Demo',ty:'Showcase'},{n:'Build Montage',ty:'Showcase'}], vault:[{l:'Social Hooks',c:10},{l:'SEO Keywords',c:25},{l:'Comparison Templates',c:4},{l:'A/B Tests',c:10},{l:'Video Templates',c:5}] },
      evenbetterbuy: { kpis: [{l:'Orders',v:'0',t:'Growing',c:'#22c55e'},{l:'Revenue',v:'$0',t:'Growing',c:'#a855f7'},{l:'Feed',v:'256 issues',t:'0',c:'#ef4444'},{l:'Products',v:'316',t:'All',c:'#f59e0b'},{l:'Social',v:'0',t:'3/day',c:'#ec4899'},{l:'Price Rank',v:'TBD',t:'Lowest',c:'#8b5cf6'}], goal:'Fix feed, price leadership', day:'Ongoing', rules:['⚠️ 256 GMC feed issues','✅ Competitor price auto-check','✅ Undercut $0.01, floor price','✅ Feed rebuild after adjust','📊 316 titles need optimization'], learns:['$0.01 undercut = 40% more clicks','TT deal reveals = best engagement'], tests:['Price-first vs savings-first','Side-by-side vs standalone','Free ship $25/$35/$50'], social:[{t:'9:00 AM',p:'🎵 TT',k:'Deal of the day'},{t:'5:00 PM',p:'📸 IG',k:'Deal spotlight'},{t:'7:00 PM',p:'📘 FB',k:'Product showcase'}], seo:['Fix 256 feed errors','Optimize 316 titles','Activate free listings','Best [X] under $25 pages','Competitor monitoring'], sched:[{t:'3:30AM',s:'pricing',k:'Price check + adjust'},{t:'4AM',s:'seo',k:'Rebuild feed'},{t:'6AM',s:'analytics',k:'Shopify + GMC data'},{t:'8AM',s:'gmc',k:'Diagnostics check'},{t:'9AM',s:'social',k:'TT deal'},{t:'5PM',s:'social',k:'IG spotlight'},{t:'7PM',s:'social',k:'FB showcase'},{t:'9PM',s:'brain',k:'Goal check'}], vids:[{n:'Deal Reveal',ty:'Kinetic'},{n:'Deal Finder',ty:'Showcase'},{n:'Unboxing',ty:'Showcase'}], vault:[{l:'Social Hooks',c:8},{l:'SEO Keywords',c:20},{l:'Price Rules',c:3},{l:'Feed Fixes',c:256},{l:'Title Templates',c:316},{l:'A/B Tests',c:10},{l:'Video Templates',c:3}] },
    };
    const d = configs[selectedNiche] || configs.medazonhealth;
    const Section = ({ icon: si, title: st, color: sco, badge, children, open: so }: { icon: string; title: string; color: string; badge?: string; children: React.ReactNode; open?: boolean }) => (
      <details open={so} className="bg-[#12121a] border border-[#27272a] rounded-2xl overflow-hidden">
        <summary className="p-3.5 cursor-pointer hover:bg-[#1a1a24] flex items-center gap-2"><span>{si}</span><span className="text-sm font-bold" style={{color: sco}}>{st}</span>{badge && <span className="text-[8px] text-[#52525b] ml-1">{badge}</span>}</summary>
        <div className="px-4 pb-4 space-y-2">{children}</div>
      </details>
    );
    const Card = ({ children }: { children: React.ReactNode }) => <div className="bg-[#0d0d12] rounded-xl p-3 border border-[#1a1a24]">{children}</div>;
    return (
      <div className="space-y-3">
        {/* KPI Header */}
        <div className="bg-[#12121a] border border-[#a855f7]/20 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.04), rgba(236,72,153,0.04))' }}>
          <div className="p-3 border-b border-[#27272a] flex items-center gap-3">
            <div className="w-10 h-10 bg-[#a855f7]/10 rounded-xl flex items-center justify-center text-xl">{icon}</div>
            <div className="flex-1"><h2 className="text-lg font-bold">{n}</h2><p className="text-[9px] text-[#52525b]">🎯 {d.goal} · {d.day}</p></div>
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><span className="text-[9px] text-green-400">AI Active</span>
          </div>
          <div className="p-3 grid grid-cols-3 lg:grid-cols-6 gap-2">
            {d.kpis.map((k: any, i: number) => (
              <div key={i} className="bg-[#0d0d12] rounded-lg p-2 text-center border border-[#1a1a24]">
                <p className="text-lg font-bold" style={{color:k.c}}>{k.v}</p><p className="text-[7px] text-white">{k.l}</p><p className="text-[6px] text-[#52525b]">→ {k.t}</p>
              </div>
            ))}
          </div>
        </div>
        {/* 🧠 Brain */}
        <Section icon="🧠" title="AI Brain" color="#a855f7" badge="Goals · Rules · Learnings · A/B Tests" open>
          <Card><p className="text-xs font-semibold text-[#a855f7] mb-1">🎯 {d.goal}</p><div className="w-full bg-[#27272a] rounded-full h-2"><div className="bg-gradient-to-r from-[#a855f7] to-[#ec4899] h-2 rounded-full" style={{width:'3%'}}></div></div><p className="text-[7px] text-[#52525b] mt-1">{d.day}</p></Card>
          <Card><p className="text-[8px] text-[#52525b] uppercase tracking-wider mb-1.5">⚙️ Active Rules</p>{d.rules.map((r: string, i: number) => <p key={i} className="text-[9px] text-[#a1a1aa]">{r}</p>)}</Card>
          <div className="grid grid-cols-2 gap-2">
            <Card><p className="text-[8px] text-[#52525b] uppercase mb-1">💡 Learnings</p>{d.learns.map((l: string, i: number) => <p key={i} className="text-[9px] text-[#a1a1aa]">• {l}</p>)}</Card>
            <Card><p className="text-[8px] text-[#52525b] uppercase mb-1">📊 A/B Tests</p>{d.tests.map((t: string, i: number) => <p key={i} className="text-[9px] text-[#f59e0b]">⚡ {t}</p>)}</Card>
          </div>
        </Section>
        {/* 📱 Social */}
        <Section icon="📱" title="Social Media" color="#ec4899" badge={`${d.social.length} posts today`} open>
          <div className="grid grid-cols-3 gap-2">
            {[{l:'Posted',v:'0',c:'#ec4899'},{l:'Queued',v:String(d.social.length),c:'#06b6d4'},{l:'This Week',v:'0',c:'#22c55e'}].map((s,i)=> <div key={i} className="bg-[#0d0d12] rounded-lg p-2 text-center border border-[#1a1a24]"><p className="text-lg font-bold" style={{color:s.c}}>{s.v}</p><p className="text-[7px] text-[#52525b]">{s.l}</p></div>)}
          </div>
          <Card>{d.social.map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2 p-1.5 bg-[#12121a] rounded-lg mb-1">
              <span className="text-[8px] font-mono text-[#52525b] w-14">{s.t}</span><span className="text-[10px] w-8">{s.p}</span><span className="text-[9px] text-[#a1a1aa] truncate flex-1">{s.k}</span>
              <button className="text-[7px] px-1.5 py-0.5 bg-[#a855f7]/10 text-[#a855f7] rounded">✏️ Edit</button>
              <button className="text-[7px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Post Now</button>
            </div>
          ))}</Card>
          <button onClick={() => onNavigate('generate')} className="w-full py-2 bg-[#ec4899]/10 border border-[#ec4899]/30 rounded-xl text-xs text-[#ec4899] font-semibold">✨ Generate More Posts</button>
        </Section>
        {/* 🔍 Google/SEO — Full Dashboard with Sub-Tabs */}
        <Section icon="🔍" title="Google / SEO Dashboard" color="#22c55e" badge={`Shopping Feed · Search Console · SEO Engine · Sitemap · Schema · Setup`} open>
          {/* Google sub-tabs */}
          {(() => {
            const [googleTab, setGoogleTab] = React.useState<string>('searchconsole');
            const gTabs = [
              { id: 'shoppingfeed', icon: '🛒', label: 'Shopping Feed', count: selectedNiche === 'evenbetterbuy' ? 14 : 0 },
              { id: 'searchconsole', icon: '🔍', label: 'Search Console' },
              { id: 'seoengine', icon: '📄', label: 'SEO Engine' },
              { id: 'sitemap', icon: '🗺️', label: 'Sitemap' },
              { id: 'schema', icon: '📋', label: 'Schema' },
              { id: 'setup', icon: '⚙️', label: 'Setup' },
            ];
            return (<>
              <div className="flex gap-1 overflow-x-auto pb-2 mb-2">
                {gTabs.map(t => (
                  <button key={t.id} onClick={() => setGoogleTab(t.id)} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-medium whitespace-nowrap flex items-center gap-1 transition-all ${googleTab === t.id ? 'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30' : 'bg-[#0d0d12] text-[#71717a] hover:text-white border border-[#1a1a24]'}`}>
                    <span>{t.icon}</span> {t.label} {t.count !== undefined && <span className="px-1 py-0.5 bg-[#27272a] rounded text-[7px]">{t.count}</span>}
                  </button>
                ))}
              </div>

              {/* SHOPPING FEED */}
              {googleTab === 'shoppingfeed' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { l: 'Total Products', v: selectedNiche === 'evenbetterbuy' ? '316' : '0', c: '#22c55e' },
                      { l: 'Active', v: selectedNiche === 'evenbetterbuy' ? '302' : '0', c: '#06b6d4' },
                      { l: 'Errors', v: selectedNiche === 'evenbetterbuy' ? '14' : '0', c: '#ef4444' },
                      { l: 'Pending Review', v: '0', c: '#f59e0b' },
                    ].map((s, i) => <div key={i} className="bg-[#0d0d12] rounded-lg p-2 text-center border border-[#1a1a24]"><p className="text-lg font-bold" style={{color:s.c}}>{s.v}</p><p className="text-[7px] text-[#52525b]">{s.l}</p></div>)}
                  </div>
                  {selectedNiche === 'evenbetterbuy' && (
                    <Card>
                      <p className="text-[8px] text-[#52525b] uppercase mb-1">⚠️ Feed Errors (14)</p>
                      {['Missing GTIN/MPN for 6 products', 'Price mismatch on 3 items', 'Image quality too low on 2 items', 'Missing shipping info on 3 items'].map((e, i) => (
                        <div key={i} className="flex items-center gap-2 p-1 bg-[#12121a] rounded-lg mb-1">
                          <span className="text-[8px] text-red-400">❌</span>
                          <span className="text-[9px] text-[#a1a1aa] flex-1">{e}</span>
                          <button className="text-[6px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Auto-Fix</button>
                        </div>
                      ))}
                    </Card>
                  )}
                  <div className="flex gap-2">
                    <button className="flex-1 py-2 bg-green-500/10 border border-green-500/30 rounded-xl text-xs text-green-400 font-semibold">🔄 Regenerate Feed XML</button>
                    <button className="flex-1 py-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-400 font-semibold">📤 Submit to GMC</button>
                  </div>
                </div>
              )}

              {/* SEARCH CONSOLE */}
              {googleTab === 'searchconsole' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { l: 'Total Clicks', v: '0', delta: '↑ +12%', dc: '#22c55e' },
                      { l: 'Impressions', v: '0', delta: '↑ +8%', dc: '#22c55e' },
                      { l: 'Avg CTR', v: '0.0%', delta: '↓ -0.3%', dc: '#ef4444' },
                      { l: 'Avg Position', v: '0.0', delta: '↑ -1.2', dc: '#22c55e' },
                    ].map((s, i) => <div key={i} className="bg-[#0d0d12] rounded-lg p-2 text-center border border-[#1a1a24]"><p className="text-lg font-bold text-white">{s.v}</p><p className="text-[7px]" style={{color:s.dc}}>{s.delta}</p><p className="text-[6px] text-[#52525b]">{s.l}</p></div>)}
                  </div>
                  <div className="flex gap-1">
                    {['7d','14d','28d','90d'].map(p => <button key={p} className="px-2 py-1 text-[8px] rounded bg-[#0d0d12] text-[#71717a] hover:text-white border border-[#1a1a24]">{p}</button>)}
                  </div>
                  <Card>
                    <p className="text-[8px] text-[#52525b] uppercase mb-1">Search Queries (0)</p>
                    <p className="text-[9px] text-[#52525b] text-center py-4">No search query data yet. Connect GSC to fetch.</p>
                  </Card>
                  <button className="w-full py-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-400 font-semibold">🔄 Fetch from GSC</button>
                </div>
              )}

              {/* SEO ENGINE */}
              {googleTab === 'seoengine' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: 'Total SEO Pages', v: '0', c: '#22c55e' },
                      { l: 'Total Impressions (30d)', v: '0', c: '#06b6d4' },
                      { l: 'Last Run', v: 'Never', c: '#71717a' },
                    ].map((s, i) => <div key={i} className="bg-[#0d0d12] rounded-lg p-2 text-center border border-[#1a1a24]"><p className="text-lg font-bold" style={{color:s.c}}>{s.v}</p><p className="text-[7px] text-[#52525b]">{s.l}</p></div>)}
                  </div>
                  <Card>
                    <p className="text-[8px] text-[#52525b] uppercase mb-1">Generated Pages</p>
                    {d.seo.map((p: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-1 bg-[#12121a] rounded-lg mb-1">
                        <span className="text-[8px] text-[#52525b] w-4">{i+1}.</span>
                        <span className="text-[9px] text-[#a1a1aa] flex-1 truncate">{p}</span>
                        <button className="text-[6px] px-1 py-0.5 bg-[#a855f7]/10 text-[#a855f7] rounded">✏️ Edit</button>
                        <button className="text-[6px] px-1 py-0.5 bg-green-500/10 text-green-400 rounded">Publish</button>
                        <span className="text-[6px] px-1 py-0.5 bg-yellow-500/10 text-yellow-400 rounded">pending</span>
                      </div>
                    ))}
                  </Card>
                  <button className="w-full py-2 bg-[#a855f7]/10 border border-[#a855f7]/30 rounded-xl text-xs text-[#a855f7] font-semibold">🚀 Run SEO Cycle</button>
                </div>
              )}

              {/* SITEMAP */}
              {googleTab === 'sitemap' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Card>
                      <p className="text-[9px] font-semibold text-white mb-1">XML Sitemap</p>
                      <p className="text-[8px] text-[#52525b] mb-2">Submit to Google Search Console → Sitemaps</p>
                      <div className="flex items-center gap-2">
                        <code className="text-[8px] text-[#06b6d4] bg-[#12121a] px-2 py-1 rounded flex-1 truncate">{`https://${selectedNiche === 'evenbetterbuy' ? 'dropshipping-management-ten.vercel.app' : selectedNiche === 'medazonhealth' ? 'patient.medazonhealth.com' : selectedNiche === 'xtremenad' ? 'xtremenad.com' : 'streamsai.com'}/api/sitemap`}</code>
                        <button className="text-[7px] px-2 py-1 bg-blue-500/10 text-blue-400 rounded font-semibold">Copy</button>
                      </div>
                      <button className="w-full mt-2 py-1.5 bg-[#0d0d12] border border-[#27272a] rounded text-[8px] text-[#71717a]">Preview XML</button>
                    </Card>
                    <Card>
                      <p className="text-[9px] font-semibold text-white mb-1">IndexNow</p>
                      <p className="text-[8px] text-[#52525b] mb-2">Instantly notify Bing & Yandex about new pages</p>
                      <button className="w-full py-2 bg-green-500/10 border border-green-500/30 rounded-lg text-xs text-green-400 font-semibold">Ping IndexNow</button>
                      <p className="text-[7px] text-[#52525b] mt-1">Requires INDEXNOW_KEY env var</p>
                    </Card>
                  </div>
                </div>
              )}

              {/* SCHEMA */}
              {googleTab === 'schema' && (
                <div className="space-y-2">
                  <p className="text-[8px] text-[#52525b] uppercase mb-1">Structured Data Snippets</p>
                  {(selectedNiche === 'evenbetterbuy' ? [
                    { file: 'product-schema.liquid', types: ['Product', 'AggregateOffer', 'AggregateRating'], desc: 'Price, availability, stars in Google search results', fields: ['title','price','compare_at_price','image','rating','competitor prices'], ready: true },
                    { file: 'faq-howto-schema.liquid', types: ['FAQPage'], desc: 'Expandable FAQ accordion in search results', fields: ['question','answer'], ready: true },
                    { file: 'breadcrumb-schema.liquid', types: ['BreadcrumbList'], desc: 'Navigation path in search results', fields: ['hierarchy'], ready: true },
                  ] : selectedNiche === 'medazonhealth' ? [
                    { file: 'medical-webpage-schema.liquid', types: ['MedicalWebPage', 'MedicalOrganization'], desc: 'Medical page schema for E-E-A-T compliance', fields: ['doctor','specialty','condition'], ready: false },
                    { file: 'faq-schema.liquid', types: ['FAQPage'], desc: 'FAQ accordion for condition pages', fields: ['question','answer'], ready: false },
                    { file: 'local-business-schema.liquid', types: ['LocalBusiness', 'MedicalBusiness'], desc: 'Google Business Profile structured data', fields: ['name','address','phone','hours'], ready: false },
                  ] : selectedNiche === 'xtremenad' ? [
                    { file: 'product-schema.liquid', types: ['Product', 'Offer'], desc: 'Product schema for supplement pages', fields: ['name','price','ingredients','rating'], ready: false },
                    { file: 'faq-schema.liquid', types: ['FAQPage'], desc: 'FAQ for ingredient/benefit pages', fields: ['question','answer'], ready: false },
                  ] : [
                    { file: 'software-schema.liquid', types: ['SoftwareApplication', 'Offer'], desc: 'App schema for comparison pages', fields: ['name','price','category','os'], ready: false },
                  ]).map((s, i) => (
                    <Card key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <p className="text-[10px] font-semibold text-white">{s.file}</p>
                          <div className="flex gap-1 mt-0.5">{s.types.map((t, ti) => <span key={ti} className="text-[7px] px-1 py-0.5 bg-green-500/10 text-green-400 rounded">{t}</span>)}</div>
                        </div>
                        <span className={`text-[7px] ${s.ready ? 'text-green-400' : 'text-yellow-400'}`}>{s.ready ? '✓ Ready' : '⏳ Not Created'}</span>
                      </div>
                      <p className="text-[8px] text-[#52525b] mb-1">{s.desc}</p>
                      <div className="flex items-center gap-1 bg-[#12121a] p-1.5 rounded-lg mb-1">
                        <code className="text-[7px] text-[#06b6d4] flex-1">{`{% render '${s.file.replace('.liquid','')}', product: product %}`}</code>
                        <button className="text-[7px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded font-semibold">Copy</button>
                      </div>
                      <div className="flex gap-1">{s.fields.map((f, fi) => <span key={fi} className="text-[6px] px-1 py-0.5 bg-[#27272a] text-[#71717a] rounded">{f}</span>)}</div>
                    </Card>
                  ))}
                </div>
              )}

              {/* SETUP */}
              {googleTab === 'setup' && (
                <div className="space-y-2">
                  {[
                    { step: 1, title: 'Google Merchant Center', desc: 'Submit Shopping feed for free product listings', done: false },
                    { step: 2, title: 'Google Search Console', desc: 'Submit sitemap and enable search performance API', done: false },
                    { step: 3, title: 'Shopify Theme Snippets', desc: 'Add structured data to your storefront', done: selectedNiche === 'evenbetterbuy' },
                    { step: 4, title: 'IndexNow (Optional)', desc: 'Instant Bing/Yandex indexing', done: false },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 bg-[#0d0d12] rounded-xl border border-[#1a1a24]">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${s.done ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>{s.done ? '✓' : s.step}</div>
                      <div className="flex-1">
                        <p className="text-[10px] font-semibold text-white">{s.title}</p>
                        <p className="text-[8px] text-[#52525b]">{s.desc}</p>
                      </div>
                      <button className={`text-[7px] px-2 py-1 rounded font-semibold ${s.done ? 'bg-green-500/10 text-green-400' : 'bg-[#a855f7]/10 text-[#a855f7]'}`}>{s.done ? '✓ Done' : 'Set Up'}</button>
                    </div>
                  ))}
                  <Card>
                    <p className="text-[8px] text-[#52525b] uppercase mb-1.5">Automated Schedule</p>
                    <div className="space-y-1">
                      {[
                        { job: 'google-shopping', sched: 'Daily 5 AM', desc: 'Regenerates Shopping feed XML' },
                        { job: 'omnipresence', sched: 'Daily 6 AM', desc: 'SEO landing pages + FAQ schemas → Shopify' },
                        { job: 'daily-learning', sched: 'Daily 11 PM', desc: 'GSC data fetch + behavioral segmentation' },
                      ].map((j, i) => (
                        <div key={i} className="flex items-center gap-3 p-1.5 bg-[#12121a] rounded-lg">
                          <code className="text-[8px] text-[#06b6d4] font-mono w-28">{j.job}</code>
                          <span className="text-[8px] text-[#71717a] w-16">{j.sched}</span>
                          <span className="text-[8px] text-[#a1a1aa] flex-1">{j.desc}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}
            </>);
          })()}
        </Section>
        {/* 📅 Schedule */}
        <Section icon="📅" title="Full Daily Schedule" color="#06b6d4" badge={`${d.sched.length} tasks`}>
          <Card>{d.sched.map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2 p-1 bg-[#12121a] rounded-lg mb-1">
              <span className="text-[8px] font-mono text-[#52525b] w-12">{s.t}</span>
              <span className="px-1 py-0.5 rounded text-[6px] font-bold uppercase w-14 text-center" style={{background:`${sc(s.s)}15`,color:sc(s.s)}}>{s.s}</span>
              <span className="text-[9px] text-[#a1a1aa] truncate flex-1">{s.k}</span>
            </div>
          ))}</Card>
        </Section>
        {/* 🎬 Videos */}
        <Section icon="🎬" title="Video Templates" color="#f59e0b" badge={`${d.vids.length} Remotion templates`}>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">{d.vids.map((v: any, i: number) => (
            <div key={i} className="bg-[#0d0d12] rounded-lg p-2 border border-[#1a1a24] hover:border-[#f59e0b]/30 cursor-pointer">
              <div className="aspect-video bg-[#1a1a24] rounded mb-1 flex items-center justify-center"><span className="text-lg">▶️</span></div>
              <p className="text-[8px] font-semibold text-white truncate">{v.n}</p><p className="text-[6px] text-[#52525b]">{v.ty}</p>
            </div>
          ))}</div>
          <button onClick={() => onNavigate('generate')} className="w-full py-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-xl text-xs text-[#f59e0b] font-semibold">🎬 Open Video Studio</button>
        </Section>
        {/* 📚 Vault */}
        <Section icon="📚" title="Knowledge Vault" color="#8b5cf6" badge={`${d.vault.reduce((a: number, v: any) => a + v.c, 0)} items`}>
          {d.vault.map((v: any, i: number) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-[#0d0d12] rounded-lg group border border-[#1a1a24]">
              <span className="text-[9px] text-white flex-1">{v.l}</span><span className="text-[7px] bg-[#27272a] px-1.5 py-0.5 rounded text-[#71717a]">{v.c}</span>
              <button className="opacity-0 group-hover:opacity-100 text-[7px] px-1.5 py-0.5 bg-[#a855f7]/10 text-[#a855f7] rounded">Edit</button>
              <button className="opacity-0 group-hover:opacity-100 text-[7px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">View</button>
            </div>
          ))}
        </Section>
        {/* 🔗 Connections */}
        <Section icon="🔗" title="Platform Connections" color="#06b6d4" badge="0/6 connected">
          <p className="text-[8px] text-[#52525b]">Post as YOU via OAuth. Zapier = fallback only.</p>
          {[{p:'TikTok',i:'🎵'},{p:'Instagram',i:'📸'},{p:'Facebook',i:'📘'},{p:'YouTube',i:'▶️'},{p:'Twitter/X',i:'𝕏'},{p:'LinkedIn',i:'💼'}].map((pl,i)=>(
            <div key={i} className="flex items-center gap-2 p-2 bg-[#0d0d12] rounded-lg border border-[#1a1a24]">
              <span>{pl.i}</span><span className="text-[9px] text-white flex-1">{pl.p}</span>
              <span className="text-[7px] px-1 py-0.5 bg-red-500/10 text-red-400 rounded-full">Not Connected</span>
              <button className="text-[7px] px-2 py-1 bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white rounded font-semibold">Connect</button>
            </div>
          ))}
          <div className="p-2 bg-[#0d0d12] rounded-lg border border-[#1a1a24]"><p className="text-[7px] text-[#52525b]"><strong>Flow:</strong> AI generates → You approve → Queued → POST via OAuth as you → Fallback: Zapier</p></div>
        </Section>

        {/* 🔍 GOOGLE SEO DASHBOARD — Full sub-tabs matching EBB system */}
        <Section icon="🔍" title="Google SEO Dashboard" color="#4285f4" badge="Shopping Feed · Search Console · SEO Engine · Sitemap · Schema · Setup">
          {/* Google sub-tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {[{id:'feed',l:'🛒 Shopping Feed',c:14},{id:'console',l:'🔎 Search Console'},{id:'engine',l:'📄 SEO Engine'},{id:'sitemap',l:'🗺️ Sitemap'},{id:'schema',l:'📋 Schema'},{id:'setup',l:'⚙️ Setup'}].map(t=>(
              <button key={t.id} onClick={()=>setGoogleSeoTab(t.id as any)} className={`px-2 py-1 rounded text-[8px] font-medium whitespace-nowrap ${googleSeoTab===t.id?'bg-[#4285f4]/20 text-[#4285f4] border border-[#4285f4]/30':'bg-[#0d0d12] text-[#71717a] hover:text-white'}`}>
                {t.l}{t.c?<span className="ml-1 bg-[#4285f4]/20 text-[#4285f4] px-1 rounded text-[7px]">{t.c}</span>:null}
              </button>
            ))}
          </div>

          {/* SHOPPING FEED */}
          {googleSeoTab==='feed' && (
            <Card>
              <p className="text-xs font-semibold mb-2">🛒 Shopping Feed</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-[#12121a] rounded-lg p-2 text-center"><p className="text-lg font-bold text-[#22c55e]">316</p><p className="text-[7px] text-[#52525b]">Products</p></div>
                <div className="bg-[#12121a] rounded-lg p-2 text-center"><p className="text-lg font-bold text-red-400">256</p><p className="text-[7px] text-[#52525b]">Errors</p></div>
                <div className="bg-[#12121a] rounded-lg p-2 text-center"><p className="text-lg font-bold text-[#f59e0b]">14</p><p className="text-[7px] text-[#52525b]">Warnings</p></div>
              </div>
              <div className="space-y-1">
                {['Missing GTIN (78 products)','Price mismatch (45 products)','Missing shipping info (33 products)','Image too small (28 products)','Missing product category (22 products)'].map((e,i)=>(
                  <div key={i} className="flex items-center gap-2 p-1.5 bg-[#12121a] rounded-lg"><span className="text-red-400 text-[9px]">❌</span><span className="text-[9px] text-[#a1a1aa] flex-1">{e}</span><button className="text-[7px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Auto-Fix</button></div>
                ))}
              </div>
              <button className="w-full mt-2 py-2 bg-[#4285f4]/10 border border-[#4285f4]/30 rounded-lg text-xs text-[#4285f4] font-semibold">🔄 Regenerate Feed XML</button>
            </Card>
          )}

          {/* SEARCH CONSOLE */}
          {googleSeoTab==='console' && (
            <Card>
              <p className="text-xs font-semibold mb-2">🔎 Search Console</p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[{l:'Total Clicks',v:'0',d:'↑ +12%',dc:'#22c55e'},{l:'Impressions',v:'0',d:'↑ +8%',dc:'#22c55e'},{l:'Avg CTR',v:'0.0%',d:'↓ -0.3%',dc:'#ef4444'},{l:'Avg Position',v:'0.0',d:'↑ -1.2',dc:'#22c55e'}].map((m,i)=>(
                  <div key={i} className="bg-[#12121a] rounded-lg p-2"><p className="text-[7px] text-[#52525b]">{m.l}</p><p className="text-lg font-bold text-white">{m.v}</p><p className="text-[7px]" style={{color:m.dc}}>{m.d}</p></div>
                ))}
              </div>
              <div className="flex gap-1 mb-2">{['7d','14d','28d','90d'].map(p=><button key={p} className="px-2 py-0.5 rounded text-[8px] bg-[#12121a] text-[#71717a] hover:text-white">{p}</button>)}</div>
              <p className="text-[9px] text-[#52525b]">Search Queries (0)</p>
              <p className="text-xs text-[#71717a] text-center py-4">Connect Google Search Console API to see live data</p>
              <button className="w-full py-2 bg-[#4285f4]/10 border border-[#4285f4]/30 rounded-lg text-xs text-[#4285f4] font-semibold">🔗 Fetch from GSC</button>
            </Card>
          )}

          {/* SEO ENGINE */}
          {googleSeoTab==='engine' && (
            <Card>
              <p className="text-xs font-semibold mb-2">📄 SEO Engine</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-[#12121a] rounded-lg p-2 text-center"><p className="text-lg font-bold text-white">{seoPages.filter(p=>p.niche===selectedNiche).length}</p><p className="text-[7px] text-[#52525b]">Total Pages</p></div>
                <div className="bg-[#12121a] rounded-lg p-2 text-center"><p className="text-lg font-bold text-white">0</p><p className="text-[7px] text-[#52525b]">Impressions (30d)</p></div>
                <div className="bg-[#12121a] rounded-lg p-2 text-center">
                  <p className="text-[7px] text-[#52525b] mb-1">Last Run</p>
                  <p className="text-[9px] text-white">{seoPages.length > 0 ? 'Just now' : 'Never'}</p>
                  <button onClick={runSeoCycle} disabled={seoRunning} className="w-full mt-1 py-1.5 bg-[#7c3aed] text-white rounded text-[8px] font-semibold disabled:opacity-50">{seoRunning ? '⏳ Running...' : '▶️ Run SEO Cycle'}</button>
                </div>
              </div>
              <p className="text-[9px] font-semibold text-white mb-1">Generated Pages</p>
              {seoPages.filter(p=>p.niche===selectedNiche).length === 0 ? (
                <p className="text-[9px] text-[#52525b] text-center py-4">No SEO pages yet. Click &quot;Run SEO Cycle&quot; to auto-generate landing pages.</p>
              ) : (
                <div className="space-y-1">
                  {seoPages.filter(p=>p.niche===selectedNiche).map((pg,i)=>(
                    <div key={i} className="flex items-center gap-2 p-1.5 bg-[#12121a] rounded-lg group">
                      <span className="text-[9px] text-[#a1a1aa] flex-1 truncate">{pg.title}</span>
                      <span className="text-[7px] px-1 py-0.5 bg-green-500/10 text-green-400 rounded">{pg.status}</span>
                      <button onClick={()=>{setVaultEditItem(pg.id);setVaultEditContent(pg.content);}} className="opacity-0 group-hover:opacity-100 text-[7px] px-1.5 py-0.5 bg-[#a855f7]/10 text-[#a855f7] rounded">✏️ Edit</button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* SITEMAP */}
          {googleSeoTab==='sitemap' && (
            <Card>
              <p className="text-xs font-semibold mb-2">🗺️ XML Sitemap</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[8px] text-[#52525b]">Submit to Google Search Console → Sitemaps</p>
                  <div className="flex gap-1 mt-1"><input readOnly value={`https://${selectedNiche === 'evenbetterbuy' ? 'dropshipping-management-ten.vercel.app' : selectedNiche + '.com'}/api/sitemap`} className="flex-1 px-2 py-1.5 bg-[#12121a] border border-[#27272a] rounded text-[8px] text-white" /><button className="px-2 py-1.5 bg-[#4285f4] text-white rounded text-[8px] font-semibold">Copy</button></div>
                  <button className="w-full mt-2 py-1.5 bg-[#12121a] border border-[#27272a] rounded text-[8px] text-[#71717a]">Preview XML</button>
                </div>
                <div>
                  <p className="text-xs font-semibold">IndexNow</p>
                  <p className="text-[8px] text-[#52525b]">Instantly notify Bing &amp; Yandex about new pages</p>
                  <button className="w-full mt-2 py-2 bg-[#22c55e] text-white rounded text-[9px] font-bold">Ping IndexNow</button>
                  <p className="text-[7px] text-[#52525b] mt-1">Requires INDEXNOW_KEY env var</p>
                </div>
              </div>
            </Card>
          )}

          {/* SCHEMA */}
          {googleSeoTab==='schema' && (
            <Card>
              <p className="text-xs font-semibold mb-2">📋 Structured Data Snippets</p>
              {[
                {file:'product-schema.liquid',types:['Product','AggregateOffer','AggregateRating'],desc:'Price, availability, stars in Google search results',fields:['title','price','compare_at_price','image','rating','competitor prices']},
                {file:'faq-howto-schema.liquid',types:['FAQPage'],desc:'Expandable FAQ accordion in search results',fields:['questions','answers']},
                {file:'medical-schema.liquid',types:['MedicalWebPage','Physician'],desc:'Medical credibility signals for health pages',fields:['author','reviewer','condition','specialty']},
                {file:'local-business-schema.liquid',types:['LocalBusiness'],desc:'Google Maps & local pack visibility',fields:['name','address','phone','hours','rating']},
              ].map((s,i)=>(
                <div key={i} className="bg-[#12121a] rounded-lg p-2 mb-2 border border-[#1a1a24]">
                  <div className="flex items-center justify-between mb-1">
                    <div><p className="text-[9px] font-semibold text-white">{s.file}</p><div className="flex gap-1 mt-0.5">{s.types.map(t=><span key={t} className="text-[6px] px-1 py-0.5 bg-green-500/10 text-green-400 rounded">{t}</span>)}</div></div>
                    <span className="text-[7px] text-green-400">✓ Ready</span>
                  </div>
                  <p className="text-[8px] text-[#52525b]">{s.desc}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <code className="flex-1 text-[7px] bg-[#0d0d12] px-2 py-1 rounded text-[#06b6d4] truncate">{`{% render '${s.file.replace('.liquid','')}', product: product %}`}</code>
                    <button className="text-[7px] px-2 py-1 bg-[#4285f4] text-white rounded font-semibold">Copy</button>
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap">{s.fields.map(f=><span key={f} className="text-[6px] px-1 py-0.5 bg-[#1a1a24] rounded text-[#71717a]">{f}</span>)}</div>
                </div>
              ))}
            </Card>
          )}

          {/* SETUP */}
          {googleSeoTab==='setup' && (
            <Card>
              <p className="text-xs font-semibold mb-3">⚙️ Setup Checklist</p>
              {[
                {n:1,title:'Google Merchant Center',desc:'Submit Shopping feed for free product listings',done:false},
                {n:2,title:'Google Search Console',desc:'Submit sitemap and enable search performance API',done:false},
                {n:3,title:'Shopify Theme Snippets',desc:'Add structured data to your storefront',done:false},
                {n:4,title:'IndexNow (Optional)',desc:'Instant Bing/Yandex indexing',done:false},
              ].map((s,i)=>(
                <div key={i} className="flex items-center gap-3 p-2.5 bg-[#12121a] rounded-lg mb-1.5 border border-[#1a1a24]">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${s.done ? 'bg-green-500 text-white' : 'bg-[#4285f4]/20 text-[#4285f4]'}`}>{s.done ? '✓' : s.n}</div>
                  <div><p className="text-[10px] font-semibold text-white">{s.title}</p><p className="text-[8px] text-[#52525b]">{s.desc}</p></div>
                </div>
              ))}
              <p className="text-xs font-semibold mt-3 mb-2">Automated Schedule</p>
              <div className="border border-[#1a1a24] rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 gap-0 bg-[#1a1a24] px-2 py-1"><span className="text-[7px] text-[#52525b] uppercase">Job</span><span className="text-[7px] text-[#52525b] uppercase">Schedule</span><span className="text-[7px] text-[#52525b] uppercase">What It Does</span></div>
                {[
                  {job:'google-shopping',time:'Daily 5 AM',desc:'Regenerates Shopping feed XML'},
                  {job:'omnipresence',time:'Daily 6 AM',desc:'SEO landing pages + FAQ schemas → Shopify'},
                  {job:'daily-learning',time:'Daily 11 PM',desc:'GSC data fetch + behavioral segmentation'},
                ].map((j,i)=>(
                  <div key={i} className="grid grid-cols-3 gap-0 px-2 py-1.5 border-t border-[#1a1a24]">
                    <span className="text-[8px] font-semibold text-white">{j.job}</span>
                    <span className="text-[8px] text-[#71717a]">{j.time}</span>
                    <span className="text-[8px] text-[#a1a1aa]">{j.desc}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Section>
      </div>
    );
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <>
      <style>{`
        body { background: #0a0a0f; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .gradient-border { background: linear-gradient(135deg, #06b6d4, #a855f7, #ec4899); padding: 2px; border-radius: 1rem; }
        .gradient-border-inner { background: #12121a; border-radius: calc(1rem - 2px); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .animate-pulse-slow { animation: pulse 2s ease-in-out infinite; }
        .drag-over { border-color: #a855f7 !important; background: rgba(168, 85, 247, 0.1) !important; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-in { animation: slideIn 0.3s ease-out; }
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-slide-in-right { animation: slideInRight 0.3s ease-out; }
        .niche-tab { transition: all 0.2s ease; }
        .niche-tab.active { background: #6366f1 !important; color: white !important; }
        .tool-card { transition: all 0.2s ease; cursor: pointer; }
        .tool-card:hover { background: #252535; border-color: #6366f1; transform: translateX(4px); }
        .glow-purple { box-shadow: 0 0 20px rgba(139, 92, 246, 0.4); }
        .pipelines-sidebar { position: fixed; top: 0; right: 0; height: 100vh; width: 380px; background: #0a0a0f; border-left: 1px solid #1a1a26; z-index: 1000; }
        .sidebar-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; }
        
        /* UPDATED: Larger browser placeholder */
        .browser-placeholder-large { min-height: 480px; background: #0d0d12; border: 1px solid #27272a; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-direction: column; }
        /* Keep old class for backward compat */
        .browser-placeholder { min-height: 280px; background: #0d0d12; border: 1px solid #27272a; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-direction: column; }
        
        /* NEW: Preview feed containers */
        .preview-feed-default { max-height: 480px; }
        .preview-feed-focused { max-height: 70vh; }
        
        /* NEW: Preview card hover effects */
        .preview-card { transition: all 0.2s ease; }
        .preview-card:hover { border-color: rgba(168, 85, 247, 0.3); }
        
        /* NEW: Line clamp utilities */
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-4 { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-6 { display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
        
        /* NEW: Confirm modal overlay */
        .confirm-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1001; display: flex; align-items: center; justify-content: center; }
        .confirm-modal { background: #12121a; border: 1px solid #27272a; border-radius: 1rem; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto; }
        
        /* Scrollbar styling for preview feeds */
        .preview-feed-default::-webkit-scrollbar,
        .preview-feed-focused::-webkit-scrollbar { width: 4px; }
        .preview-feed-default::-webkit-scrollbar-track,
        .preview-feed-focused::-webkit-scrollbar-track { background: transparent; }
        .preview-feed-default::-webkit-scrollbar-thumb,
        .preview-feed-focused::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
        .preview-feed-default::-webkit-scrollbar-thumb:hover,
        .preview-feed-focused::-webkit-scrollbar-thumb:hover { background: #a855f7; }
        
        .recording { animation: pulse 1s ease-in-out infinite; }
        .recording .record-dot { background: #ef4444; }
      `}</style>
      
      <div className="min-h-screen p-6" style={{ background: '#0a0a0f' }}>
        <div className="max-w-7xl mx-auto">
          {/* Header - UNCHANGED */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-[#06b6d4] via-[#a855f7] to-[#ec4899] rounded-2xl flex items-center justify-center shadow-lg" style={{ boxShadow: '0 10px 15px -3px rgba(168, 85, 247, 0.2)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-7 h-7">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Media/Marketing</h1>
                  <p className="text-[#71717a]">Social Media Command Center - Scrape, Record, Post</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={toggleWebhookConfig} className="px-4 py-2.5 text-sm font-medium text-gray-400 bg-[#12121a] border border-[#27272a] rounded-xl hover:bg-[#1a1a24] flex items-center gap-2">⚙️ Zapier Config</button>
                <button className="px-4 py-2.5 text-sm font-medium text-gray-400 bg-[#12121a] border border-[#27272a] rounded-xl hover:bg-[#1a1a24] flex items-center gap-2">📥 Import</button>
              </div>
            </div>
            
            {/* NICHE SELECTOR + TOOLS TOGGLE */}
            <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-2">
              {niches.map(niche => (
                <button key={niche.id} onClick={() => { selectNiche(niche.id); setNicheViewOpen(true); }} className={`px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-all ${selectedNiche === niche.id && nicheViewOpen ? 'bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white shadow-lg shadow-[#a855f7]/20' : 'bg-[#12121a] text-gray-400 hover:text-white border border-[#27272a]'}`}>
                  <span>{niche.icon}</span> {niche.name}
                </button>
              ))}
              <div className="h-8 w-px bg-[#27272a] mx-1 flex-shrink-0"></div>
              <button onClick={() => { setNicheViewOpen(false); setActiveTab('generate'); }} className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-all flex-shrink-0 ${!nicheViewOpen && activeTab === 'generate' ? 'bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white shadow-lg' : 'bg-[#12121a] text-gray-400 hover:text-white border border-[#27272a]'}`}>
                🛠️ Tools
              </button>
              <button onClick={() => { setNicheViewOpen(false); setActiveTab('google'); }} className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-all flex-shrink-0 ${!nicheViewOpen && activeTab === 'google' ? 'bg-gradient-to-r from-[#22c55e] to-[#06b6d4] text-white shadow-lg' : 'bg-[#12121a] text-gray-400 hover:text-white border border-[#27272a]'}`}>
                🔍 Google SEO
              </button>
            </div>
          </div>

          {/* NICHE VIEW — one scrollable dashboard per niche */}
          {nicheViewOpen && <NicheCommandView selectedNiche={selectedNiche} niches={niches} onNavigate={(tab: TabType) => { setNicheViewOpen(false); setActiveTab(tab); }} />}

          {/* TOOLS MODE — Original tabs */}
          {!nicheViewOpen && (
            <>
              <div className="flex gap-2 mb-6 border-b border-[#27272a] pb-4">
                {(['capture', 'patterns', 'generate', 'schedule', 'command', 'brain', 'google'] as TabType[]).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${activeTab === tab ? 'bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white shadow-lg' : 'bg-[#12121a] text-[#a1a1aa] hover:text-white hover:bg-[#1a1a24]'}`} style={activeTab === tab ? { boxShadow: '0 10px 15px -3px rgba(168, 85, 247, 0.2)' } : {}}>
                    {tab === 'capture' && '📺 Social Browsers'}
                    {tab === 'patterns' && '🔍 Patterns Found'}
                    {tab === 'generate' && '✨ Generate Posts'}
                    {tab === 'schedule' && '📅 Schedule'}
                    {tab === 'command' && '🎯 Command Center'}
                    {tab === 'brain' && '🧠 AI Brain'}
                    {tab === 'google' && '🔍 Google SEO'}
                  </button>
                ))}
              </div>
              {activeTab === 'capture' && renderCaptureTab()}
              {activeTab === 'patterns' && renderPatternsTab()}
              {activeTab === 'generate' && renderGenerateTab()}
              {activeTab === 'schedule' && renderScheduleTab()}
              {activeTab === 'command' && renderCommandCenter()}
              {activeTab === 'brain' && renderAIBrain()}
              {activeTab === 'google' && renderGoogleSEO()}
            </>
          )}
        </div>
      </div>

      {/* Pipelines Sidebar - UNCHANGED */}
      {showPipelinesSidebar && (
        <>
          <div className="sidebar-overlay" onClick={closePipelinesSidebar}></div>
          <div className="pipelines-sidebar animate-slide-in-right">
            <div className="p-6 border-b border-[#27272a] flex items-center justify-between">
              <h3 className="font-semibold">Pipeline Tools</h3>
              <button onClick={closePipelinesSidebar} className="text-[#71717a] hover:text-white">✕</button>
            </div>
            <div className="p-4 overflow-y-auto h-[calc(100vh-80px)]">
              {Object.entries(pipelineTools).map(([category, tools]) => (
                <div key={category} className="mb-6">
                  <h4 className="text-xs font-semibold text-[#71717a] uppercase tracking-wider mb-3">{category}</h4>
                  <div className="space-y-2">
                    {tools.map((tool, i) => (
                      <div key={i} className="tool-card p-3 bg-[#12121a] border border-[#27272a] rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 bg-gradient-to-br ${tool.gradient} rounded-lg flex items-center justify-center text-white`}>{tool.icon}</div>
                          <div>
                            <p className="font-medium text-sm">{tool.name}</p>
                            <p className="text-xs text-[#71717a]">{tool.providers}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* NEW: Two-Step Approval - Final Confirm Modal */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="confirm-modal animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#27272a]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Final Confirmation</h3>
                  <p className="text-sm text-[#71717a]">Review approved posts before they go live</p>
                </div>
                <button onClick={() => setShowConfirmModal(false)} className="text-[#71717a] hover:text-white text-xl">✕</button>
              </div>
            </div>
            
            <div className="p-6 space-y-3">
              {previewPosts.filter(p => p.status === 'approved').map(post => (
                <div key={post.id} className="flex items-center gap-3 p-3 bg-[#1a1a24] rounded-xl">
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#0d0d12] flex items-center justify-center flex-shrink-0 text-lg">
                      {socialPlatforms.find(p => p.id === post.platform)?.icon}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{post.hook}</p>
                    <div className="flex items-center gap-2 text-xs text-[#71717a]">
                      <span className="capitalize">{post.platform}</span>
                      <span>•</span>
                      <span>{post.niche}</span>
                      <span>•</span>
                      <span>{post.bestTime}</span>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceBg(post.confidence)}`}>
                    <span className={getConfidenceColor(post.confidence)}>{post.confidence}%</span>
                  </div>
                  <button onClick={() => resetPostStatus(post.id)} className="text-[#71717a] hover:text-red-400 text-sm">✕</button>
                </div>
              ))}
              
              {previewPosts.filter(p => p.status === 'approved').length === 0 && (
                <div className="text-center py-8 text-[#71717a]">
                  <p>No approved posts remaining</p>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-[#27272a] flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-3 bg-[#1a1a24] rounded-xl text-sm font-medium hover:bg-[#27272a] transition-colors">
                Cancel
              </button>
              <button 
                onClick={finalConfirmAll}
                disabled={previewPosts.filter(p => p.status === 'approved').length === 0}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                🚀 Confirm & Queue {previewPosts.filter(p => p.status === 'approved').length} Posts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VAULT / SEO PAGE EDIT MODAL */}
      {vaultEditItem && (
        <div className="confirm-modal-overlay" onClick={() => setVaultEditItem(null)}>
          <div className="confirm-modal animate-slide-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="p-5 border-b border-[#27272a] flex items-center justify-between">
              <h3 className="text-lg font-bold">✏️ Edit Content</h3>
              <button onClick={() => setVaultEditItem(null)} className="text-[#71717a] hover:text-white text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <textarea value={vaultEditContent} onChange={e => setVaultEditContent(e.target.value)} className="w-full px-3 py-3 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white focus:border-[#a855f7] focus:outline-none min-h-[350px] resize-y font-mono" />
              <div className="flex gap-2">
                <button onClick={() => setVaultEditItem(null)} className="flex-1 py-3 bg-[#1a1a24] rounded-xl text-sm font-medium hover:bg-[#27272a]">Cancel</button>
                <button onClick={() => {
                  // Save the edit — update seoPages if it's an SEO page, or vault items
                  setSeoPages(prev => prev.map(p => p.id === vaultEditItem ? { ...p, content: vaultEditContent } : p));
                  setVaultEditItem(null);
                }} className="flex-1 py-3 bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white rounded-xl text-sm font-semibold">💾 Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT POST MODAL */}
      {editingPostId && (
        <div className="confirm-modal-overlay" onClick={cancelPostEdit}>
          <div className="confirm-modal animate-slide-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="p-5 border-b border-[#27272a] flex items-center justify-between">
              <h3 className="text-lg font-bold">✏️ Edit Post</h3>
              <button onClick={cancelPostEdit} className="text-[#71717a] hover:text-white text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Hook / Title</label>
                <input value={editingHook} onChange={e => setEditingHook(e.target.value)} className="w-full mt-1 px-3 py-2 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white focus:border-[#a855f7] focus:outline-none" />
              </div>
              <div>
                <label className="text-[9px] text-[#52525b] uppercase tracking-wider">Content</label>
                <textarea value={editingContent} onChange={e => setEditingContent(e.target.value)} className="w-full mt-1 px-3 py-3 bg-[#0d0d12] border border-[#27272a] rounded-lg text-sm text-white focus:border-[#a855f7] focus:outline-none min-h-[250px] resize-y font-mono" />
              </div>
              <div className="flex gap-2">
                <button onClick={cancelPostEdit} className="flex-1 py-3 bg-[#1a1a24] rounded-xl text-sm font-medium hover:bg-[#27272a]">Cancel</button>
                <button onClick={savePostEdit} className="flex-1 py-3 bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white rounded-xl text-sm font-semibold">💾 Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

