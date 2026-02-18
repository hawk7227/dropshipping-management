// scrapers/facebook.js — Facebook Feed Scraper
// Scrolls news feed, extracts friend posts, skips ads & suggestions

(function() {
  'use strict';

  const PLATFORM = 'facebook';
  let isScrolling = false;
  let scrollCount = 0;
  let seenPostIds = new Set();
  let scrollTimer = null;

  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_LOADED', platform: PLATFORM });

  function checkLogin() {
    const loginForm = document.querySelector('form[action*="login"], input[name="email"][type="text"]');
    const isLoggedIn = !loginForm && !!document.querySelector('div[role="navigation"], a[aria-label*="Facebook"], div[aria-label="Create a post"]');
    chrome.runtime.sendMessage({ type: 'LOGIN_STATUS', platform: PLATFORM, loggedIn: isLoggedIn });
    return isLoggedIn;
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'fb_' + Math.abs(hash).toString(36);
  }

  function extractPost(postEl) {
    try {
      const postText = postEl.textContent || '';
      const postHash = hashString(postText.substring(0, 200));
      if (seenPostIds.has(postHash)) return null;
      seenPostIds.add(postHash);

      const isAd = postText.includes('Sponsored') ||
                   !!postEl.querySelector('a[href*="ads"], a[aria-label*="Sponsored"]') ||
                   postText.includes('Paid partnership');
      if (isAd) {
        chrome.runtime.sendMessage({ type: 'AD_SKIPPED', platform: PLATFORM });
        return null;
      }

      const isSuggestion = postText.includes('Suggested for you') ||
                           postText.includes('People You May Know') ||
                           postText.includes('Suggested groups') ||
                           postText.includes('Join group') ||
                           postText.includes('Page you might like');
      if (isSuggestion) {
        chrome.runtime.sendMessage({ type: 'SUGGESTION_SKIPPED', platform: PLATFORM });
        return null;
      }

      let username = 'unknown';
      const headerLinks = postEl.querySelectorAll('a[role="link"] strong, h3 a, h4 a, a[class*="ProfileHovercard"]');
      for (const link of headerLinks) {
        const text = link.textContent.trim();
        if (text.length > 1 && text.length < 60 && !text.includes('Sponsored')) {
          username = text;
          break;
        }
      }

      let caption = '';
      const textContainers = postEl.querySelectorAll('div[data-ad-preview="message"], div[dir="auto"]');
      for (const container of textContainers) {
        const text = container.textContent.trim();
        if (text.length > caption.length && text.length < 5000 && text !== username) {
          caption = text;
        }
      }

      const hashtags = [];
      const hashtagMatches = caption.match(/#\w+/g);
      if (hashtagMatches) hashtags.push(...hashtagMatches.slice(0, 20));

      let reactions = 0;
      const reactionEl = postEl.querySelector('span[class*="reaction"] span, div[aria-label*="reactions"] span');
      if (reactionEl) {
        const t = reactionEl.textContent.replace(/,/g, '');
        reactions = parseInt(t) || 0;
      }

      let comments = 0;
      const commentEl = postEl.querySelector('div[class*="comment"] span[class*="count"], a[href*="comments"]');
      if (commentEl) {
        const t = commentEl.textContent.replace(/[^0-9]/g, '');
        comments = parseInt(t) || 0;
      }

      let shares = 0;
      const shareEl = postEl.querySelector('div[class*="share"] span[class*="count"]');
      if (shareEl) {
        const t = shareEl.textContent.replace(/[^0-9]/g, '');
        shares = parseInt(t) || 0;
      }

      const hasVideo = !!postEl.querySelector('video, div[data-video-id]');
      const hasImage = !!postEl.querySelector('img[class*="photo"], img[src*="scontent"]');
      const hasLink = !!postEl.querySelector('a[class*="external"], a[rel="nofollow"]');
      const contentType = hasVideo ? 'video' : hasImage ? 'image' : hasLink ? 'link' : 'text';

      let postUrl = '';
      const permalink = postEl.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]');
      if (permalink) postUrl = permalink.href;

      let postedAt = null;
      const timeEl = postEl.querySelector('abbr[data-utime], span[id*="jsc"] a[role="link"]');
      if (timeEl && timeEl.getAttribute('data-utime')) {
        postedAt = new Date(parseInt(timeEl.getAttribute('data-utime')) * 1000).toISOString();
      }

      return {
        platform: PLATFORM,
        postUrl: postUrl || `fb_${postHash}`,
        postId: postHash,
        username,
        caption: caption.substring(0, 5000),
        hashtags,
        contentType,
        metrics: { likes: reactions, comments, shares, saves: 0, views: 0 },
        postedAt,
      };
    } catch (err) {
      console.error('[SocialScanner:FB] Extract error:', err);
      return null;
    }
  }

  function doScroll(config) {
    if (!isScrolling) return;
    const scrollAmount = 400 + Math.floor(Math.random() * 600);
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    scrollCount++;

    let foundThisScroll = false;

    setTimeout(() => {
      const posts = document.querySelectorAll('div[role="article"], div[data-pagelet*="FeedUnit"], div[class*="userContentWrapper"]');
      posts.forEach(postEl => {
        const rect = postEl.getBoundingClientRect();
        if (rect.top > -500 && rect.top < window.innerHeight + 500) {
          const post = extractPost(postEl);
          if (post) {
            chrome.runtime.sendMessage({ type: 'SCRAPED_POST', data: post });
            foundThisScroll = true;
          }
        }
      });

      if (!foundThisScroll) {
        chrome.runtime.sendMessage({ type: 'SCROLL_TICK', platform: PLATFORM });
      }

      if (scrollCount >= (config.MAX_SCROLL_POSTS || 100)) {
        stopScrolling();
        chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', platform: PLATFORM });
        return;
      }

      const delay = (config.SCROLL_DELAY_MIN || 2000) + Math.floor(Math.random() * ((config.SCROLL_DELAY_MAX || 6000) - (config.SCROLL_DELAY_MIN || 2000)));
      scrollTimer = setTimeout(() => doScroll(config), delay);
    }, 1500);
  }

  function stopScrolling() {
    isScrolling = false;
    if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_SCROLL') {
      if (!checkLogin()) { sendResponse({ ok: false, error: 'Not logged in' }); return true; }
      isScrolling = true;
      scrollCount = 0;
      seenPostIds.clear();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => doScroll(message.config || {}), 2000);
      sendResponse({ ok: true });
    }
    if (message.type === 'STOP_SCROLL') { stopScrolling(); sendResponse({ ok: true }); }
    return true;
  });

  setTimeout(checkLogin, 2000);
  console.log('[SocialScanner:FB] Content script loaded');
})();
