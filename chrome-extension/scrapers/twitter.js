// scrapers/twitter.js — X (Twitter) Feed Scraper
// Scrolls home timeline, extracts friend tweets, skips promoted & suggested

(function() {
  'use strict';

  const PLATFORM = 'twitter';
  let isScrolling = false;
  let scrollCount = 0;
  let seenPostIds = new Set();
  let scrollTimer = null;

  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_LOADED', platform: PLATFORM });

  function checkLogin() {
    const loginBtn = document.querySelector('a[href="/login"], a[data-testid="loginButton"]');
    const isLoggedIn = !loginBtn && !!document.querySelector('nav[aria-label="Primary"], a[data-testid="AppTabBar_Home_Link"]');
    chrome.runtime.sendMessage({ type: 'LOGIN_STATUS', platform: PLATFORM, loggedIn: isLoggedIn });
    return isLoggedIn;
  }

  // Switch to Following tab if available
  function ensureFollowingTab() {
    const tabs = document.querySelectorAll('a[role="tab"], div[role="tablist"] a');
    for (const tab of tabs) {
      if (tab.textContent.trim() === 'Following') {
        const isActive = tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('r-1habvwh');
        if (!isActive) tab.click();
        break;
      }
    }
  }

  function extractPost(tweetEl) {
    try {
      const tweetLink = tweetEl.querySelector('a[href*="/status/"] time')?.closest('a') ||
                        tweetEl.querySelector('a[href*="/status/"]');
      const postId = tweetLink ? tweetLink.getAttribute('href') : null;
      if (!postId || seenPostIds.has(postId)) return null;
      seenPostIds.add(postId);

      const tweetText = tweetEl.textContent || '';

      // Ad detection
      const socialContext = tweetEl.querySelector('span[data-testid="socialContext"]');
      if (socialContext && socialContext.textContent.includes('Promoted')) {
        chrome.runtime.sendMessage({ type: 'AD_SKIPPED', platform: PLATFORM });
        return null;
      }
      const isAd = tweetText.includes('Promoted') && !!tweetEl.querySelector('div[data-testid="promotedIndicator"]');
      if (isAd) {
        chrome.runtime.sendMessage({ type: 'AD_SKIPPED', platform: PLATFORM });
        return null;
      }

      // Suggestion detection
      const isSuggestion = tweetText.includes('Who to follow') ||
                           tweetText.includes('Suggested for you') ||
                           tweetText.includes('Topics to follow') ||
                           tweetText.includes('You might like');
      if (isSuggestion) {
        chrome.runtime.sendMessage({ type: 'SUGGESTION_SKIPPED', platform: PLATFORM });
        return null;
      }

      // Extract username
      let username = 'unknown';
      let displayName = '';
      const userNameDiv = tweetEl.querySelector('div[data-testid="User-Name"]');
      if (userNameDiv) {
        const links = userNameDiv.querySelectorAll('a[href^="/"]');
        if (links.length > 0) {
          username = links[0].getAttribute('href').replace('/', '');
          displayName = links[0].textContent.trim();
        }
      }

      // Extract tweet text
      let caption = '';
      const tweetTextEl = tweetEl.querySelector('div[data-testid="tweetText"]');
      if (tweetTextEl) caption = tweetTextEl.textContent.trim();

      // Extract hashtags
      const hashtags = [];
      tweetEl.querySelectorAll('a[href*="/hashtag/"]').forEach(tag => {
        const ht = tag.textContent.trim();
        if (ht.startsWith('#')) hashtags.push(ht);
      });

      // Extract metrics
      function getMetric(testId) {
        const el = tweetEl.querySelector(`div[data-testid="${testId}"], a[href*="${testId}"]`);
        if (!el) return 0;
        const t = el.getAttribute('aria-label') || el.textContent || '';
        const match = t.match(/[\d,]+/);
        return match ? parseInt(match[0].replace(/,/g, '')) : 0;
      }

      const likes = getMetric('like');
      const retweets = getMetric('retweet');
      const replies = getMetric('reply');
      const bookmarks = getMetric('bookmark');

      // Views from analytics link
      let views = 0;
      const analyticsEl = tweetEl.querySelector('a[href*="/analytics"]');
      if (analyticsEl) {
        const viewText = analyticsEl.getAttribute('aria-label') || analyticsEl.textContent || '';
        const viewMatch = viewText.match(/[\d,]+/);
        if (viewMatch) views = parseInt(viewMatch[0].replace(/,/g, ''));
      }

      // Content type
      const hasImage = !!tweetEl.querySelector('div[data-testid="tweetPhoto"]');
      const hasVideo = !!tweetEl.querySelector('div[data-testid="videoPlayer"]');
      const isThread = !!tweetEl.querySelector('div[data-testid="Tweet-showMoreThread"]');
      const isQuoteRT = !!tweetEl.querySelector('div[data-testid="quoteTweet"]');
      const contentType = hasVideo ? 'video' : hasImage ? 'image' : isThread ? 'thread' : isQuoteRT ? 'quote' : 'text';

      // Timestamp
      let postedAt = null;
      const timeEl = tweetEl.querySelector('time[datetime]');
      if (timeEl) postedAt = timeEl.getAttribute('datetime');

      return {
        platform: PLATFORM,
        postUrl: `https://x.com${postId}`,
        postId,
        username,
        displayName,
        caption: caption.substring(0, 5000),
        hashtags,
        contentType,
        metrics: { likes, comments: replies, shares: retweets, saves: bookmarks, views },
        postedAt,
      };
    } catch (err) {
      console.error('[SocialScanner:X] Extract error:', err);
      return null;
    }
  }

  function doScroll(config) {
    if (!isScrolling) return;
    const scrollAmount = 400 + Math.floor(Math.random() * 500);
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    scrollCount++;

    let foundThisScroll = false;

    setTimeout(() => {
      const tweets = document.querySelectorAll('article[data-testid="tweet"]');
      tweets.forEach(tweetEl => {
        const rect = tweetEl.getBoundingClientRect();
        if (rect.top > -500 && rect.top < window.innerHeight + 500) {
          const post = extractPost(tweetEl);
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
      setTimeout(() => doScroll(message.config || {}), 2000);
      sendResponse({ ok: true });
    }
    if (message.type === 'STOP_SCROLL') { stopScrolling(); sendResponse({ ok: true }); }
    return true;
  });

  setTimeout(checkLogin, 2000);
  console.log('[SocialScanner:X] Content script loaded');
})();
