# Social Intelligence Scanner — Chrome Extension

## What This Does
Scrolls your real social media feeds (Instagram, Facebook, TikTok, X) and extracts friend posts while skipping all ads and suggested content. Data flows to your dashboard's AI Friend Intelligence system.

## How It Works
1. You stay logged into your social accounts normally in Chrome
2. Click the extension popup → "Scan All Platforms" (or scan one at a time)
3. Extension opens each platform in a background tab
4. AI auto-scrolls your feed with human-like timing (2-6 second random delays)
5. For each post it encounters:
   - **Friend post** → extracts username, caption, hashtags, engagement metrics, content type → sends to your API
   - **Sponsored / Ad** → skips, increments ads-skipped counter
   - **Suggested for you** → skips, increments suggestions-skipped counter
6. After ~100 posts per platform (configurable), scan completes
7. Data appears in your dashboard under AI Friend Intelligence

## Setup

### 1. Load the Extension
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select this `chrome-extension` folder
5. Pin the extension to your toolbar

### 2. Run the Migration
Run `supabase-migration.sql` in your Supabase SQL Editor to create:
- `scraped_content` — stores friend posts
- `scroll_sessions` — logs scan history
- `friend_clusters` — auto-detected interest groups

### 3. Configure
1. Click the extension icon
2. Set **API Endpoint** to your app URL (default: `http://localhost:3000`)
3. Set **Posts per scan** (default: 100)
4. Set **Auto-scan interval** (default: every 6 hours)

### 4. First Scan
1. Make sure you're logged into Instagram, Facebook, TikTok, and X in Chrome
2. Click "🚀 Scan All Platforms"
3. Watch the live stats in the popup
4. Check your dashboard at `/social` → Capture tab

## What Gets Scraped Per Platform

### Instagram
- Username, caption text, hashtags
- Likes, comments count
- Content type (image, carousel, reel)
- Post timestamp, post URL
- Skips: Sponsored posts, Suggested For You, Paid partnerships

### Facebook
- Username/display name, post text, hashtags
- Reactions, comments, shares count
- Content type (text, image, video, shared link)
- Post timestamp, post URL
- Skips: Sponsored, People You May Know, Suggested groups, Page suggestions

### TikTok
- Username, caption/description, hashtags
- Likes, comments, shares, saves count
- Audio/sound name, video duration
- Post URL
- Switches to "Following" tab (not For You) to only see friends
- Skips: Sponsored, Promoted, Suggested accounts

### X (Twitter)
- Username, display name, tweet text, hashtags
- Likes, retweets, replies, bookmarks, views
- Content type (text, image, video, thread, quote RT)
- Post timestamp, post URL
- Switches to "Following" tab (not For You)
- Skips: Promoted tweets, Who to follow, Topics to follow

## Auto-Scan
The extension auto-scans every 6 hours (configurable) using Chrome Alarms API. This runs in the background even when the popup is closed. Platforms are scanned sequentially with 2-minute gaps between each.

## Important Notes

### DOM Selectors
Social platforms frequently change their HTML structure. If scraping stops working:
1. Open the platform in Chrome
2. Right-click a post → Inspect
3. Compare the DOM structure with the selectors in `scrapers/[platform].js`
4. Update selectors as needed

### Rate Limiting
- Default scroll speed: 2-6 seconds between scrolls (randomized)
- Default max posts: 100 per scan per platform
- These mimic human scrolling behavior
- Don't set delays below 1 second — platforms may flag automated behavior

### Privacy
- All data stays in YOUR Supabase database
- No data is sent to any third party
- The extension only reads content from feeds you're already logged into
- Friend names/usernames are stored only for cluster analysis

## File Structure
```
chrome-extension/
├── manifest.json          — Extension config + permissions
├── background.js          — Service worker (batch sends, scan control, auto-scan)
├── popup.html             — Extension popup UI (controls + stats)
├── scrapers/
│   ├── instagram.js       — Instagram feed scraper
│   ├── facebook.js        — Facebook feed scraper
│   ├── tiktok.js          — TikTok feed scraper
│   └── twitter.js         — X/Twitter feed scraper
├── icons/
│   ├── icon16.png         — Toolbar icon
│   ├── icon48.png         — Extension page icon
│   └── icon128.png        — Chrome Web Store icon
├── supabase-migration.sql — Database tables
└── README.md              — This file
```
