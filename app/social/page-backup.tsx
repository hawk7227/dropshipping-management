'use client';

// app/social/page.tsx
// Media/Marketing - Social Media Command Center
// Converted from HTML to React - Zero visual changes - All features included
// ALL API calls are stubbed with TODO comments

import React, { useState, useEffect } from 'react';

type TabType = 'capture' | 'patterns' | 'generate' | 'schedule';
type PlatformId = 'tiktok' | 'instagram' | 'youtube' | 'facebookx';
type FilterPlatform = 'all' | 'instagram' | 'twitter' | 'linkedin' | 'tiktok';

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

// DATA - exact from HTML
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

export default function MediaMarketingPage() {
  // STATE - exact match from original HTML
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

  // Load saved webhook config on init
  useEffect(() => {
    const savedWebhooks = localStorage.getItem('zapierWebhooks');
    if (savedWebhooks) {
      setWebhookConfig(JSON.parse(savedWebhooks));
    }
  }, []);

  // UTILITY FUNCTIONS - exact match from original HTML
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

  const getPlatformIcon = (platform: string): string => {
    const icons: Record<string, string> = {
      instagram: '📸', twitter: '𝕏', linkedin: '💼', tiktok: '🎵', facebook: '📘'
    };
    return icons[platform] || '📱';
  };

  // EVENT HANDLERS - exact match from original HTML
  const toggleWebhookConfig = () => setShowWebhookConfig(!showWebhookConfig);

  const updateWebhook = (platformId: PlatformId, url: string) => {
    setWebhookConfig(prev => ({ ...prev, [platformId]: url }));
  };

  const saveWebhookConfig = () => {
    localStorage.setItem('zapierWebhooks', JSON.stringify(webhookConfig));
    alert('Webhook configuration saved!');
  };

  // TODO: API STUB - scrapeData
  const scrapeData = async (platformId: PlatformId) => {
    console.log(`[API STUB] Scraping data from ${platformId}...`);
    
    // TODO: In production - Extract DOM content from embedded browser
    // const response = await fetch('/api/social/scrape', {
    //   method: 'POST',
    //   body: JSON.stringify({ platformId, nicheId: selectedNiche })
    // });
    
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
    
    // TODO: API STUB - Send to Supabase
    // await supabase.from('scraped_data').insert({
    //   niche_id: selectedNiche,
    //   scraped_data: mockScrapedData,
    //   scraped_at: new Date().toISOString(),
    //   confidence_score: 0.0
    // });
  };

  // TODO: API STUB - toggleRecording
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

  // TODO: API STUB - postToZapier
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
    
    // TODO: API STUB - In production, POST to Zapier
    // const response = await fetch(webhookUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload)
    // });
    
    alert(`Post sent to ${platformId} via Zapier!\n\nWebhook: ${webhookUrl}\nNiche: ${selectedNiche}`);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // TODO: API STUB - startAnalysis
  const startAnalysis = () => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);

    // TODO: API STUB - In production, call AI analysis API
    // const response = await fetch('/api/social/analyze', {
    //   method: 'POST',
    //   body: JSON.stringify({ files: uploadedFiles, nicheId: selectedNiche })
    // });

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

  // TODO: API STUB - generatePosts
  const generatePosts = () => {
    // TODO: API STUB - In production, call AI generation API
    // const response = await fetch('/api/social/generate', {
    //   method: 'POST',
    //   body: JSON.stringify({ patterns, nicheId: selectedNiche })
    // });
    
    setGeneratedPosts(mockGeneratedPosts);
    setActiveTab('generate');
  };

  // TODO: API STUB - generateMore
  const generateMore = () => {
    // TODO: API STUB - Would call AI to generate more posts
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
  // RENDER - CAPTURE TAB
  // ============================================================
  const renderCaptureTab = () => (
    <>
      {/* Webhook Config Panel */}
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

      {/* 4 Social Media Browser Panels - 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {socialPlatforms.map(platform => (
          <div key={platform.id} className="gradient-border">
            <div className="gradient-border-inner p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 bg-gradient-to-br ${platform.color} rounded-xl flex items-center justify-center text-white text-lg`}>
                    {platform.icon}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">{platform.name}</h3>
                    <p className="text-[#71717a] text-xs">Browser placeholder - Electron/Extension integration pending</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {browserStates[platform.id].isRecording && (
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs flex items-center gap-1">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                      Recording
                    </span>
                  )}
                </div>
              </div>
              
              <div className="browser-placeholder mb-4">
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
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Section: How It Works + Uploaded Files */}
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
  // RENDER - PATTERNS TAB
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
  // RENDER - GENERATE TAB
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
  // RENDER - SCHEDULE TAB
  // ============================================================
  const renderScheduleTab = () => (
    <div className="text-center py-16">
      <div className="w-20 h-20 bg-[#1a1a24] rounded-2xl flex items-center justify-center mx-auto mb-6">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10 text-[#71717a]">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
      <h3 className="text-xl font-semibold mb-2">Content Calendar</h3>
      <p className="text-[#71717a] mb-6">Coming soon - schedule and auto-post your generated content</p>
      <div className="flex justify-center gap-4">
        <button className="px-6 py-2 bg-[#12121a] border border-[#27272a] rounded-xl text-[#71717a]">Connect Instagram</button>
        <button className="px-6 py-2 bg-[#12121a] border border-[#27272a] rounded-xl text-[#71717a]">Connect Twitter</button>
      </div>
    </div>
  );

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
        .browser-placeholder { min-height: 280px; background: #0d0d12; border: 1px solid #27272a; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-direction: column; }
        .recording { animation: pulse 1s ease-in-out infinite; }
        .recording .record-dot { background: #ef4444; }
      `}</style>
      
      <div className="min-h-screen p-6" style={{ background: '#0a0a0f' }}>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
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
            
            {/* Niche Tabs */}
            <div className="flex gap-3 mb-2 overflow-x-auto pb-2">
              {niches.map(niche => (
                <button key={niche.id} onClick={() => selectNiche(niche.id)} className={`niche-tab ${selectedNiche === niche.id ? 'active' : ''} px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap bg-[#12121a] text-gray-400 hover:text-white`}>
                  <span>{niche.icon}</span> {niche.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs */}
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

      {/* Pipelines Sidebar */}
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
    </>
  );
}

