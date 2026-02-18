// background.js — Service Worker
// Manages scan sessions, batches scraped data, sends to ingest API
// Includes: health monitoring, stale scraper detection, API connectivity checks

const CONFIG = {
  API_BASE: 'http://localhost:3000',
  BATCH_SIZE: 10,
  BATCH_INTERVAL: 30000,
  SCROLL_DELAY_MIN: 2000,
  SCROLL_DELAY_MAX: 6000,
  MAX_SCROLL_POSTS: 100,
  AUTO_SCAN_INTERVAL: 360,
  STALE_THRESHOLD: 20,
};

let postBuffer = [];
let sessionStats = {
  instagram: { scanning: false, friendPosts: 0, adsSkipped: 0, suggestionsSkipped: 0, total: 0 },
  facebook: { scanning: false, friendPosts: 0, adsSkipped: 0, suggestionsSkipped: 0, total: 0 },
  tiktok: { scanning: false, friendPosts: 0, adsSkipped: 0, suggestionsSkipped: 0, total: 0 },
  twitter: { scanning: false, friendPosts: 0, adsSkipped: 0, suggestionsSkipped: 0, total: 0 },
};

// ============================================================
// HEALTH MONITORING
// ============================================================
let healthStatus = {
  api: { ok: null, lastCheck: null, error: null },
  instagram: { ok: null, loggedIn: null, scraperWorking: null, lastPostFound: null, scrollsSinceLastPost: 0, error: null, lastScan: null },
  facebook:  { ok: null, loggedIn: null, scraperWorking: null, lastPostFound: null, scrollsSinceLastPost: 0, error: null, lastScan: null },
  tiktok:    { ok: null, loggedIn: null, scraperWorking: null, lastPostFound: null, scrollsSinceLastPost: 0, error: null, lastScan: null },
  twitter:   { ok: null, loggedIn: null, scraperWorking: null, lastPostFound: null, scrollsSinceLastPost: 0, error: null, lastScan: null },
};

async function getApiBase() {
  return new Promise(resolve => {
    chrome.storage.local.get(['apiBase'], data => resolve(data.apiBase || CONFIG.API_BASE));
  });
}

async function checkApiHealth() {
  try {
    const base = await getApiBase();
    const res = await fetch(`${base}/api/social?action=stats`, { method: 'GET' });
    healthStatus.api = { ok: res.ok, lastCheck: new Date().toISOString(), error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    healthStatus.api = { ok: false, lastCheck: new Date().toISOString(), error: `Cannot reach API: ${err.message}` };
  }
  chrome.storage.local.set({ healthStatus });
}

function updateScraperHealth(platform, event, detail) {
  const h = healthStatus[platform];
  if (!h) return;

  switch (event) {
    case 'POST_FOUND':
      h.scraperWorking = true;
      h.lastPostFound = new Date().toISOString();
      h.scrollsSinceLastPost = 0;
      h.error = null;
      h.ok = true;
      break;
    case 'SCROLL_NO_POST':
      h.scrollsSinceLastPost = (h.scrollsSinceLastPost || 0) + 1;
      if (h.scrollsSinceLastPost >= CONFIG.STALE_THRESHOLD && h.scraperWorking !== false) {
        h.scraperWorking = false;
        h.ok = false;
        h.error = `SELECTORS_BROKEN: Scrolled ${h.scrollsSinceLastPost} times with 0 friend posts found. ${platform}'s page structure has likely changed.`;
      }
      break;
    case 'LOGIN_DETECTED':
      h.loggedIn = true;
      if (h.error && h.error.startsWith('NOT_LOGGED_IN')) h.error = null;
      break;
    case 'NOT_LOGGED_IN':
      h.loggedIn = false;
      h.ok = false;
      h.error = `NOT_LOGGED_IN: You are not signed into ${platform}. Open ${platform} in Chrome and log in.`;
      break;
    case 'SCAN_STARTED':
      h.lastScan = new Date().toISOString();
      h.scrollsSinceLastPost = 0;
      break;
    case 'SCAN_COMPLETE':
      if (sessionStats[platform]?.friendPosts === 0 && sessionStats[platform]?.total > 10) {
        h.scraperWorking = false;
        h.ok = false;
        h.error = `SELECTORS_BROKEN: Scanned ${sessionStats[platform].total} items but found 0 friend posts. Page selectors need updating.`;
      } else if (sessionStats[platform]?.friendPosts > 0) {
        h.ok = true;
        h.scraperWorking = true;
        h.error = null;
      }
      break;
    case 'CONTENT_SCRIPT_LOADED':
      h.loggedIn = true;
      break;
    case 'ERROR':
      h.ok = false;
      h.error = detail || 'Unknown error';
      break;
  }
  chrome.storage.local.set({ healthStatus });
}

// ============================================================
// MESSAGE HANDLER
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SCRAPED_POST':
      handleScrapedPost(message.data);
      updateScraperHealth(message.data?.platform, 'POST_FOUND');
      sendResponse({ ok: true });
      break;

    case 'AD_SKIPPED':
      if (sessionStats[message.platform]) {
        sessionStats[message.platform].adsSkipped++;
        sessionStats[message.platform].total++;
      }
      sendResponse({ ok: true });
      break;

    case 'SUGGESTION_SKIPPED':
      if (sessionStats[message.platform]) {
        sessionStats[message.platform].suggestionsSkipped++;
        sessionStats[message.platform].total++;
      }
      sendResponse({ ok: true });
      break;

    case 'SCROLL_TICK':
      if (sessionStats[message.platform]) sessionStats[message.platform].total++;
      updateScraperHealth(message.platform, 'SCROLL_NO_POST');
      sendResponse({ ok: true });
      break;

    case 'LOGIN_STATUS':
      updateScraperHealth(message.platform, message.loggedIn ? 'LOGIN_DETECTED' : 'NOT_LOGGED_IN');
      sendResponse({ ok: true });
      break;

    case 'CONTENT_SCRIPT_LOADED':
      updateScraperHealth(message.platform, 'CONTENT_SCRIPT_LOADED');
      sendResponse({ ok: true });
      break;

    case 'GET_CONFIG':
      sendResponse({ config: CONFIG, stats: sessionStats });
      break;

    case 'START_SCAN':
      startScan(message.platform);
      sendResponse({ ok: true });
      break;

    case 'STOP_SCAN':
      stopScan(message.platform);
      sendResponse({ ok: true });
      break;

    case 'GET_STATS':
      sendResponse({ stats: sessionStats, health: healthStatus });
      break;

    case 'GET_HEALTH':
      sendResponse({ health: healthStatus });
      break;

    case 'CHECK_API':
      checkApiHealth().then(() => sendResponse({ health: healthStatus }));
      return true;

    case 'SCAN_COMPLETE':
      handleScanComplete(message.platform);
      updateScraperHealth(message.platform, 'SCAN_COMPLETE');
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ ok: false, error: 'Unknown message type' });
  }
  return true;
});

// ============================================================
// SCRAPED POST HANDLER
// ============================================================
function handleScrapedPost(post) {
  const platform = post.platform;
  if (sessionStats[platform]) {
    sessionStats[platform].friendPosts++;
    sessionStats[platform].total++;
  }
  postBuffer.push({ ...post, scraped_at: new Date().toISOString() });
  if (postBuffer.length >= CONFIG.BATCH_SIZE) flushBuffer();
}

// ============================================================
// FLUSH BUFFER
// ============================================================
async function flushBuffer() {
  if (postBuffer.length === 0) return;
  const batch = [...postBuffer];
  postBuffer = [];

  try {
    const base = await getApiBase();
    const response = await fetch(`${base}/api/social?action=ingest-scroll-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: batch, stats: sessionStats }),
    });

    if (!response.ok) {
      healthStatus.api.ok = false;
      healthStatus.api.error = `API returned ${response.status}`;
      postBuffer = [...batch, ...postBuffer];
    } else {
      healthStatus.api.ok = true;
      healthStatus.api.error = null;
      const result = await response.json();
      console.log(`[SocialScanner] Ingested ${batch.length} posts, server: ${result.ingested || 0}`);
    }
  } catch (err) {
    healthStatus.api.ok = false;
    healthStatus.api.error = `Network error: ${err.message}`;
    postBuffer = [...batch, ...postBuffer];
  }
  chrome.storage.local.set({ healthStatus });
}

// ============================================================
// SCAN CONTROL
// ============================================================
function startScan(platform) {
  sessionStats[platform] = { scanning: true, friendPosts: 0, adsSkipped: 0, suggestionsSkipped: 0, total: 0 };
  updateScraperHealth(platform, 'SCAN_STARTED');

  const urlPatterns = {
    instagram: '*://www.instagram.com/*',
    facebook: '*://www.facebook.com/*',
    tiktok: '*://www.tiktok.com/*',
    twitter: '*://x.com/*',
  };

  chrome.tabs.query({ url: urlPatterns[platform] }, (tabs) => {
    if (tabs.length === 0) {
      const urls = {
        instagram: 'https://www.instagram.com/',
        facebook: 'https://www.facebook.com/',
        tiktok: 'https://www.tiktok.com/following',
        twitter: 'https://x.com/home',
      };
      chrome.tabs.create({ url: urls[platform], active: false }, (tab) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { type: 'START_SCROLL', config: CONFIG });
            }, 3000);
          }
        });
      });
    } else {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'START_SCROLL', config: CONFIG });
    }
  });
}

function stopScan(platform) {
  sessionStats[platform].scanning = false;
  const urlPatterns = {
    instagram: '*://www.instagram.com/*',
    facebook: '*://www.facebook.com/*',
    tiktok: '*://www.tiktok.com/*',
    twitter: '*://x.com/*',
  };
  chrome.tabs.query({ url: urlPatterns[platform] }, (tabs) => {
    if (tabs.length > 0) chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_SCROLL' });
  });
  flushBuffer();
}

function handleScanComplete(platform) {
  sessionStats[platform].scanning = false;
  flushBuffer();
  chrome.storage.local.set({
    [`lastScan_${platform}`]: new Date().toISOString(),
    [`lastStats_${platform}`]: sessionStats[platform],
  });
}

// ============================================================
// ALARMS
// ============================================================
chrome.alarms.create('autoScan', { periodInMinutes: CONFIG.AUTO_SCAN_INTERVAL });
chrome.alarms.create('healthCheck', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoScan') {
    ['instagram', 'facebook', 'tiktok', 'twitter'].forEach((p, i) => {
      setTimeout(() => startScan(p), i * 120000);
    });
  }
  if (alarm.name === 'healthCheck') checkApiHealth();
});

setInterval(flushBuffer, CONFIG.BATCH_INTERVAL);
checkApiHealth();

chrome.storage.local.get(['healthStatus'], (data) => {
  if (data.healthStatus) {
    Object.keys(healthStatus).forEach(k => {
      if (data.healthStatus[k]) healthStatus[k] = { ...data.healthStatus[k] };
    });
  }
});

console.log('[SocialScanner] Background service worker initialized');
