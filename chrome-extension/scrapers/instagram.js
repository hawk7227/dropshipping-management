// scrapers/instagram.js — Instagram Feed Scraper
// Scrolls home feed, extracts friend posts, skips ads & suggestions
// Reports health: login status, stale selectors, scroll ticks

(function() {
  'use strict';

  const PLATFORM = 'instagram';
  let isScrolling = false;
  let scrollCount = 0;
  let seenPostIds = new Set();
  let scrollTimer = null;

  // Report that content script loaded
  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_LOADED', platform: PLATFORM });

  // ============================================================
  // LOGIN DETECTION
  // ============================================================
  function checkLogin() {
    // Instagram shows a login form if not logged in
    const loginForm = document.querySelector('form[id="loginForm"], input[name="username"], button[type="submit"][class*="Login"]');
    const isLoggedIn = !loginForm && !!document.querySelector('nav, svg[aria-label="Home"], a[href="/direct/inbox/"]');
    chrome.runtime.sendMessage({ type: 'LOGIN_STATUS', platform: PLATFORM, loggedIn: isLoggedIn });
    return isLoggedIn;
  }

  // ============================================================
  // DOM SELECTORS — Instagram's feed structure
  // Update these when Instagram changes their HTML
  // ============================================================
  const SELECTORS = {
    feedPost: 'article[role="presentation"], article:has(header)',
    username: 'header a[href^="/"][role="link"] span, header a[href^="/"] > div > span',
    caption: 'div[class*="Caption"] span, ul li span[dir="auto"], div > span[dir="auto"]',
    likeCount: 'section span[class*="Like"] span, a[href*="liked_by"] span, button span[class*="like"]',
    commentCount: 'a[href*="/comments/"] span',
    timestamp: 'time[datetime]',
    videoIndicator: 'video, span[aria-label*="Reel"], svg[aria-label*="Reel"]',
    carouselIndicator: 'div[class*="Carousel"], button[aria-label*="Next"], div[class*="carousel"]',
    hashtag: 'a[href^="/explore/tags/"]',
    adIndicator: 'span:has-text("Sponsored"), a[href*="Sponsored"], div[class*="Sponsored"], span[class*="Paid"]',
    suggestionIndicator: 'div:has-text("Suggested for you"), div:has-text("suggested posts"), div:has-text("Suggested Posts")',
  };

  // ============================================================
  // POST EXTRACTION
  // ============================================================
  function extractPost(article) {
    try {
      const postLink = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      const postId = postLink ? postLink.getAttribute('href') : null;
      if (!postId || seenPostIds.has(postId)) return null;
      seenPostIds.add(postId);

      // Check if this is an ad
      const articleText = article.textContent || '';
      const isAd = articleText.includes('Sponsored') || 
                   articleText.includes('Paid partnership') ||
                   !!article.querySelector('[class*="Sponsored"], [class*="paid"]');
      if (isAd) {
        chrome.runtime.sendMessage({ type: 'AD_SKIPPED', platform: PLATFORM });
        return null;
      }

      // Check if this is suggested content
      const parentText = article.parentElement?.textContent || '';
      const isSuggestion = parentText.includes('Suggested for you') ||
                           parentText.includes('suggested posts');
      if (isSuggestion) {
        chrome.runtime.sendMessage({ type: 'SUGGESTION_SKIPPED', platform: PLATFORM });
        return null;
      }

      // Extract username
      let username = 'unknown';
      const userEl = article.querySelector(SELECTORS.username);
      if (userEl) username = userEl.textContent.trim();

      // Extract caption
      let caption = '';
      const captionEls = article.querySelectorAll(SELECTORS.caption);
      for (const el of captionEls) {
        const text = el.textContent.trim();
        if (text.length > caption.length && text.length < 5000) caption = text;
      }

      // Extract hashtags
      const hashtags = [];
      article.querySelectorAll(SELECTORS.hashtag).forEach(tag => {
        const ht = tag.textContent.trim();
        if (ht.startsWith('#')) hashtags.push(ht);
      });

      // Extract metrics
      let likes = 0;
      const likeEl = article.querySelector(SELECTORS.likeCount);
      if (likeEl) likes = parseMetricText(likeEl.textContent);

      let comments = 0;
      const commentEl = article.querySelector(SELECTORS.commentCount);
      if (commentEl) comments = parseMetricText(commentEl.textContent);

      // Detect content type
      const hasVideo = !!article.querySelector(SELECTORS.videoIndicator);
      const hasCarousel = !!article.querySelector(SELECTORS.carouselIndicator);
      const contentType = hasVideo ? 'reel' : hasCarousel ? 'carousel' : 'image';

      // Extract timestamp
      let postedAt = null;
      const timeEl = article.querySelector(SELECTORS.timestamp);
      if (timeEl) postedAt = timeEl.getAttribute('datetime');

      return {
        platform: PLATFORM,
        postUrl: `https://www.instagram.com${postId}`,
        postId,
        username,
        caption: caption.substring(0, 5000),
        hashtags,
        contentType,
        metrics: { likes, comments, shares: 0, saves: 0, views: 0 },
        postedAt,
      };
    } catch (err) {
      console.error('[SocialScanner:IG] Extract error:', err);
      return null;
    }
  }

  function parseMetricText(text) {
    if (!text) return 0;
    text = text.replace(/,/g, '').trim().toLowerCase();
    if (text.includes('k')) return Math.round(parseFloat(text) * 1000);
    if (text.includes('m')) return Math.round(parseFloat(text) * 1000000);
    return parseInt(text) || 0;
  }

  // ============================================================
  // SCROLL ENGINE
  // ============================================================
  function doScroll(config) {
    if (!isScrolling) return;

    const scrollAmount = 300 + Math.floor(Math.random() * 500);
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    scrollCount++;

    let foundThisScroll = false;

    setTimeout(() => {
      const articles = document.querySelectorAll('article');
      articles.forEach(article => {
        const rect = article.getBoundingClientRect();
        if (rect.top > -500 && rect.top < window.innerHeight + 500) {
          const post = extractPost(article);
          if (post) {
            chrome.runtime.sendMessage({ type: 'SCRAPED_POST', data: post });
            foundThisScroll = true;
          }
        }
      });

      // Report scroll tick if nothing found (for stale detection)
      if (!foundThisScroll) {
        chrome.runtime.sendMessage({ type: 'SCROLL_TICK', platform: PLATFORM });
      }

      if (scrollCount >= (config.MAX_SCROLL_POSTS || 100)) {
        stopScrolling();
        chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', platform: PLATFORM });
        return;
      }

      const delay = (config.SCROLL_DELAY_MIN || 2000) + 
                    Math.floor(Math.random() * ((config.SCROLL_DELAY_MAX || 6000) - (config.SCROLL_DELAY_MIN || 2000)));
      scrollTimer = setTimeout(() => doScroll(config), delay);
    }, 1500);
  }

  function stopScrolling() {
    isScrolling = false;
    if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
  }

  // ============================================================
  // MESSAGE LISTENER
  // ============================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_SCROLL') {
      if (!checkLogin()) {
        sendResponse({ ok: false, error: 'Not logged in' });
        return true;
      }
      isScrolling = true;
      scrollCount = 0;
      seenPostIds.clear();

      if (window.location.pathname.length > 1 && !window.location.pathname.startsWith('/direct')) {
        window.location.href = 'https://www.instagram.com/';
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => doScroll(message.config || {}), 2000);
      }
      sendResponse({ ok: true });
    }

    if (message.type === 'STOP_SCROLL') {
      stopScrolling();
      sendResponse({ ok: true });
    }

    return true;
  });

  // Check login on page load
  setTimeout(checkLogin, 2000);

  console.log('[SocialScanner:IG] Content script loaded');
})();
