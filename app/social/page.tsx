'use client';

// app/social/page.tsx
// Media/Marketing - Social Media Command Center
// Phase 1: Dual-Mode Panels + Focus/Expand + Platform Previews + Two-Step Approval
// ALL existing features preserved - ADDITIVE ONLY
// ALL API calls are stubbed with TODO comments

import React, { useState, useEffect, useCallback } from 'react';

type TabType = 'capture' | 'patterns' | 'generate' | 'schedule';
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
}

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
  const [previewPosts, setPreviewPosts] = useState<PreviewPost[]>(mockPreviewPosts);

  // Two-step approval: show confirm modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Generating visual state per post
  const [generatingVisual, setGeneratingVisual] = useState<Record<string, boolean>>({});

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

  // Load scheduled posts from DB
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

  // Load when switching to schedule tab
  useEffect(() => {
    if (activeTab === 'schedule') { loadScheduledPosts(); }
  }, [activeTab, loadScheduledPosts]);

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
            <span>🎵 {post.niche}</span>
            <span>•</span>
            <span>{post.estimatedEngagement}</span>
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
                  // BROWSE MODE - Original browser placeholder (INCREASED HEIGHT)
                  <div className="browser-placeholder-large mb-4">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-[#1a1a24] rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-[#71717a]">
                          <rect x="2" y="3" width="20" height="14" rx="2"/>
                          <path d="M8 21h8"/>
                          <path d="M12 17v4"/>
                        </svg>
                      </div>
                      <p className="text-[#71717a] text-sm mb-1">Embedded Browser</p>
                      <p className="text-[#71717a] text-xs">Chrome Extension or Electron webview will render here</p>
                    </div>
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
                    <button onClick={() => scrapeData(platform.id)} className="flex-1 flex items-center justify-center gap-2 p-3 bg-[#1a1a24] rounded-xl hover:bg-[#27272a] transition-colors text-sm" title="Scrape visible data from this browser">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-[#06b6d4]">
                        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        <path d="M9 12l2 2 4-4"/>
                      </svg>
                      <span>Scrape</span>
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

      {/* Bottom Section: How It Works + Uploaded Files - UNCHANGED */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#12121a] border border-[#27272a] rounded-2xl p-6">
          <h3 className="font-semibold mb-4">How It Works</h3>
          <div className="space-y-4">
            {[
              { step: 1, title: 'Browse Your Feed', desc: 'Embedded browser shows your social media in real-time' },
              { step: 2, title: 'Scrape & Record', desc: 'Extract data and record interactions for AI learning' },
              { step: 3, title: 'Post via Zapier', desc: 'One-click posting through your configured webhooks' },
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
            <h3 className="font-semibold">Uploaded Files</h3>
            <span className="text-sm text-[#71717a]">{uploadedFiles.length} files</span>
          </div>
          
          {uploadedFiles.length === 0 ? (
            <div className="text-center py-8 text-[#71717a]">
              <p>No files uploaded yet</p>
              <p className="text-sm mt-1">Scrape or record from browsers above</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {uploadedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-[#1a1a24] rounded-xl">
                  <div className="w-10 h-10 bg-[#a855f7]/10 rounded-lg flex items-center justify-center text-[#a855f7]">
                    {file.type.startsWith('video') ? '🎬' : '📸'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-[#71717a]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button onClick={() => removeFile(i)} className="text-[#71717a] hover:text-red-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadedFiles.length > 0 && (
            <button onClick={startAnalysis} disabled={isAnalyzing} className="w-full mt-4 py-3 bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white rounded-xl font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-3">
              {isAnalyzing ? (
                <>
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/>
                  </svg>
                  Analyzing... {Math.round(analysisProgress)}%
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42"/>
                  </svg>
                  Analyze with AI
                </>
              )}
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
            
            {/* Niche Tabs - UNCHANGED */}
            <div className="flex gap-3 mb-2 overflow-x-auto pb-2">
              {niches.map(niche => (
                <button key={niche.id} onClick={() => selectNiche(niche.id)} className={`niche-tab ${selectedNiche === niche.id ? 'active' : ''} px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap bg-[#12121a] text-gray-400 hover:text-white`}>
                  <span>{niche.icon}</span> {niche.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs - UNCHANGED */}
          <div className="flex gap-2 mb-6 border-b border-[#27272a] pb-4">
            {(['capture', 'patterns', 'generate', 'schedule'] as TabType[]).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${activeTab === tab ? 'bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white shadow-lg' : 'bg-[#12121a] text-[#a1a1aa] hover:text-white hover:bg-[#1a1a24]'}`} style={activeTab === tab ? { boxShadow: '0 10px 15px -3px rgba(168, 85, 247, 0.2)' } : {}}>
                {tab === 'capture' && '📺 Social Browsers'}
                {tab === 'patterns' && '🔍 Patterns Found'}
                {tab === 'generate' && '✨ Generate Posts'}
                {tab === 'schedule' && '📅 Schedule'}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'capture' && renderCaptureTab()}
          {activeTab === 'patterns' && renderPatternsTab()}
          {activeTab === 'generate' && renderGenerateTab()}
          {activeTab === 'schedule' && renderScheduleTab()}
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
    </>
  );
}

