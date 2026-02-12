// scrapers/tiktok.js — TikTok Feed Scraper
// Scrolls Following feed (not For You), extracts friend content, skips ads

(function() {
  'use strict';

  const PLATFORM = 'tiktok';
  let isScrolling = false;
  let scrollCount = 0;
  let seenPostIds = new Set();
  let scrollTimer = null;

  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_LOADED', platform: PLATFORM });

  function checkLogin() {
    const loginBtn = document.querySelector('button[data-e2e="top-login-button"], a[href*="/login"]');
    const isLoggedIn = !loginBtn || !!document.querySelector('div[data-e2e="profile-icon"], a[data-e2e="nav-profile"]');
    chrome.runtime.sendMessage({ type: 'LOGIN_STATUS', platform: PLATFORM, loggedIn: isLoggedIn });
    return isLoggedIn;
  }

  // Navigate to Following tab
  function ensureFollowingTab() {
    const followingTab = document.querySelector('a[data-e2e="following-page"], a[href="/following"]');
    if (followingTab && !window.location.pathname.includes('following')) {
      followingTab.click();
      return false; // navigating, wait
    }
    return true;
  }

  function extractPost(videoEl) {
    try {
      const videoLink = videoEl.querySelector('a[href*="/@"][href*="/video/"]') ||
                        videoEl.querySelector('a[href*="/video/"]');
      const postId = videoLink ? videoLink.getAttribute('href') : null;
      if (!postId || seenPostIds.has(postId)) return null;
      seenPostIds.add(postId);

      const elText = videoEl.textContent || '';
      const isAd = elText.includes('Sponsored') ||
                   elText.includes('Promoted') ||
                   !!videoEl.querySelector('[class*="Sponsored"], [data-e2e*="ad"], [class*="ad-"]');
      if (isAd) {
        chrome.runtime.sendMessage({ type: 'AD_SKIPPED', platform: PLATFORM });
        return null;
      }

      const isSuggestion = elText.includes('Suggested accounts') ||
                           elText.includes('You may also like');
      if (isSuggestion) {
        chrome.runtime.sendMessage({ type: 'SUGGESTION_SKIPPED', platform: PLATFORM });
        return null;
      }

      let username = 'unknown';
      const usernameEl = videoEl.querySelector('a[data-e2e="video-author-uniqueid"], a[href^="/@"] span, h3 a[href^="/@"]');
      if (usernameEl) {
        username = usernameEl.textContent.trim().replace('@', '');
      } else {
        const match = postId.match(/@([^/]+)/);
        if (match) username = match[1];
      }

      let caption = '';
      const descEl = videoEl.querySelector('[data-e2e="video-desc"], div[class*="DivVideoInfoContainer"] span, div[class*="caption"]');
      if (descEl) caption = descEl.textContent.trim();

      const hashtags = [];
      videoEl.querySelectorAll('a[data-e2e="search-common-link"], a[href*="/tag/"]').forEach(tag => {
        const ht = tag.textContent.trim();
        if (ht.startsWith('#')) hashtags.push(ht);
      });
      const captionTags = caption.match(/#\w+/g);
      if (captionTags) captionTags.forEach(t => { if (!hashtags.includes(t)) hashtags.push(t); });

      function parseMetric(selector) {
        const el = videoEl.querySelector(selector);
        if (!el) return 0;
        const t = el.textContent.replace(/,/g, '').trim().toLowerCase();
        if (t.includes('k')) return Math.round(parseFloat(t) * 1000);
        if (t.includes('m')) return Math.round(parseFloat(t) * 1000000);
        return parseInt(t) || 0;
      }

      const likes = parseMetric('[data-e2e="like-count"], strong[data-e2e="like-count"]');
      const comments = parseMetric('[data-e2e="comment-count"], strong[data-e2e="comment-count"]');
      const shares = parseMetric('[data-e2e="share-count"], strong[data-e2e="share-count"]');
      const saves = parseMetric('[data-e2e="undefined-count"], strong[data-e2e="undefined-count"]');

      let audioName = '';
      const audioEl = videoEl.querySelector('a[href*="/music/"], div[class*="MusicInfo"] a');
      if (audioEl) audioName = audioEl.textContent.trim();

      return {
        platform: PLATFORM,
        postUrl: `https://www.tiktok.com${postId}`,
        postId,
        username,
        caption: caption.substring(0, 5000),
        hashtags,
        contentType: 'video',
        metrics: { likes, comments, shares, saves, views: 0 },
        audioName,
        postedAt: null,
      };
    } catch (err) {
      console.error('[SocialScanner:TT] Extract error:', err);
      return null;
    }
  }

  function doScroll(config) {
    if (!isScrolling) return;
    const scrollAmount = 600 + Math.floor(Math.random() * 400);
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    scrollCount++;

    let foundThisScroll = false;

    setTimeout(() => {
      const videos = document.querySelectorAll('div[data-e2e="recommend-list-item-container"], div[class*="DivItemContainer"], div[class*="video-feed-item"]');
      videos.forEach(videoEl => {
        const rect = videoEl.getBoundingClientRect();
        if (rect.top > -500 && rect.top < window.innerHeight + 500) {
          const post = extractPost(videoEl);
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
      ensureFollowingTab();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => doScroll(message.config || {}), 3000);
      sendResponse({ ok: true });
    }
    if (message.type === 'STOP_SCROLL') { stopScrolling(); sendResponse({ ok: true }); }
    return true;
  });

  setTimeout(checkLogin, 2000);
  console.log('[SocialScanner:TT] Content script loaded');
})();
