/**
 * background.js
 *
 * Five jobs:
 *   1. Navigation redirects (webNavigation) — Reels/Explore/Shorts
 *      blocking, forcing Instagram's Following feed, Reddit r/all +
 *      r/popular blocking, and the "smart homepage" redirects
 *      (home -> subscriptions/messages/inbox) and the Shorts-to-standard
 *      URL rewrite.
 *   2. Daily time-budget tracking — a repeating alarm samples which
 *      tracked-site tab is currently focused/active and ticks up its
 *      per-domain usage counter; content scripts (common.js) read that
 *      counter to decide whether to show the "time's up" overlay.
 *   3. Pomodoro sessions — start/stop state plus an alarm that clears
 *      the session and fires a notification when it ends.
 *   4. Element-picker plumbing — receives the selector the user just
 *      picked, stores it as a custom rule, and (for domains outside the
 *      five built-in platforms) requests the extra host permission and
 *      registers custom-blocker.js dynamically so the rule keeps
 *      applying on future visits.
 *   5. First-install defaults.
 *
 * The content scripts also do their own immediate client-side
 * location.replace()/overlay as a fast first line of defense (no flash
 * of blocked content while this script's async storage lookups
 * resolve), but this script is the authoritative, tab-reliable
 * mechanism — it works even before a content script has injected.
 */

// --- KEEP IN SYNC with content-scripts/common.js FM_DEFAULTS ---
const FM_DEFAULTS = {
  fmMasterEnabled: true,
  strictMode: false,
  strictModeDelaySeconds: 10,
  unlockChallengeType: 'timer',
  unlockPhrase: 'I am opening this for a specific reason',
  scheduleEnabled: false,
  scheduleStart: '09:00',
  scheduleEnd: '17:00',
  scheduleDays: [1, 2, 3, 4, 5],
  pomodoroDurationMinutes: 25,
  scrollInterruptEnabled: false,
  scrollInterruptViewports: 6,
  grayscaleEnabled: false,
  fontSimplifyEnabled: false,
  intentBarEnabled: false,
  intentBarSites: { youtube: true, reddit: true, instagram: false, twitter: false, linkedin: false },
  directLinkWhitelistEnabled: true,
  syncEnabled: false,

  igBlock: true,
  igFollowingFeed: true,
  igHideStories: true,
  igHideMetrics: false,
  igHideNotifBadges: false,
  igLimitFeedPosts: false,
  igFeedPostLimit: 4,
  igSmartHomeRedirect: false,

  ytBlockShorts: true,
  ytFocusMode: true,
  ytHideHomepage: false,
  ytShortsRedirectStandard: false,
  ytDisableAutoplay: false,
  ytHideNotifBadge: false,
  ytHideVanityMetrics: false,
  ytBlockTrendingLive: false,
  ytSmartHomeRedirect: false,

  twitterFocusMode: true,
  twHideMetrics: false,
  twHideSidebarWidgets: false,
  twHideNotifBadges: false,
  twSmartHomeRedirect: false,

  rdBlockAllPopular: false,
  rdHideHomeFeed: false,
  rdBlockVideoFeed: false,

  liBlankFeed: false,
  liHideNewsSidebar: false,

  blockComments: true,
  fmPomodoro: { active: false, endsAt: 0 }
};

const FM_LIST_DEFAULTS = {
  ytChannelWhitelist: [],
  fmBudgets: {},
  fmCustomRules: []
};

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await browser.storage.local.set({ ...FM_DEFAULTS, ...FM_LIST_DEFAULTS });
  }
});

// =========================================================================
// 1. Navigation redirects
// =========================================================================
function isBlockedInstagramPath(pathname) {
  return /^\/reels\/?/.test(pathname) || /^\/explore\/?/.test(pathname);
}

// True when the URL is Instagram's home route but is missing the
// ?variant=following param that switches the feed to Following-only.
// Checking searchParams (not just a raw string match) avoids a redirect
// loop once the param is already present.
function needsFollowingRedirect(url) {
  const isHomeRoute = url.pathname === '/' || url.pathname === '';
  const alreadyFollowing = url.searchParams.get('variant') === 'following';
  return isHomeRoute && !alreadyFollowing;
}

function isBlockedYouTubeShortsPath(pathname) {
  return /^\/shorts\//.test(pathname);
}

function isBlockedRedditPath(pathname) {
  return /^\/r\/(all|popular)\/?/i.test(pathname);
}

function isEffectivelyEnabled(settings) {
  const pomodoroActive = !!(settings.fmPomodoro && settings.fmPomodoro.active &&
    settings.fmPomodoro.endsAt > Date.now());
  if (pomodoroActive) return true;
  if (!settings.fmMasterEnabled) return false;
  if (!settings.scheduleEnabled) return true;

  const now = new Date();
  if (!settings.scheduleDays.includes(now.getDay())) return false;
  const [startH, startM] = settings.scheduleStart.split(':').map(Number);
  const [endH, endM] = settings.scheduleEnd.split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (startMins === endMins) return true;
  if (startMins < endMins) return nowMins >= startMins && nowMins < endMins;
  return nowMins >= startMins || nowMins < endMins;
}

async function handleNavigation(details) {
  // Ignore iframes/subframes — only top-level tab navigation matters.
  if (details.frameId !== 0) return;

  let url;
  try {
    url = new URL(details.url);
  } catch (e) {
    return;
  }

  const settings = await browser.storage.local.get(FM_DEFAULTS);
  if (!isEffectivelyEnabled(settings)) return;

  // ---- Instagram ----
  if (/(^|\.)instagram\.com$/.test(url.hostname)) {
    if (settings.igBlock && isBlockedInstagramPath(url.pathname)) {
      browser.tabs.update(details.tabId, { url: 'https://www.instagram.com/' });
      return;
    }
    if (settings.igSmartHomeRedirect && (url.pathname === '/' || url.pathname === '')) {
      browser.tabs.update(details.tabId, { url: 'https://www.instagram.com/direct/inbox/' });
      return;
    }
    if (settings.igFollowingFeed && needsFollowingRedirect(url)) {
      browser.tabs.update(details.tabId, { url: 'https://www.instagram.com/?variant=following' });
      return;
    }
  }

  // ---- YouTube ----
  if (/(^|\.)youtube\.com$/.test(url.hostname)) {
    if (isBlockedYouTubeShortsPath(url.pathname)) {
      if (settings.ytShortsRedirectStandard) {
        const videoId = url.pathname.split('/')[2];
        if (videoId) {
          browser.tabs.update(details.tabId, { url: `https://www.youtube.com/watch?v=${videoId}` });
          return;
        }
      } else if (settings.ytBlockShorts) {
        browser.tabs.update(details.tabId, { url: 'https://www.youtube.com/' });
        return;
      }
    }
    if (settings.ytSmartHomeRedirect && (url.pathname === '/' || url.pathname === '')) {
      browser.tabs.update(details.tabId, { url: 'https://www.youtube.com/feed/subscriptions' });
      return;
    }
  }

  // ---- Twitter / X ----
  if (/(^|\.)(twitter|x)\.com$/.test(url.hostname)) {
    if (settings.twSmartHomeRedirect && (url.pathname === '/' || url.pathname === '')) {
      browser.tabs.update(details.tabId, { url: `https://${url.hostname}/messages` });
      return;
    }
  }

  // ---- Reddit ----
  if (/(^|\.)reddit\.com$/.test(url.hostname)) {
    if (settings.rdBlockAllPopular && isBlockedRedditPath(url.pathname)) {
      browser.tabs.update(details.tabId, { url: 'https://www.reddit.com/' });
      return;
    }
  }
}

browser.webNavigation.onBeforeNavigate.addListener(handleNavigation);
browser.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);

// =========================================================================
// 2. Daily time-budget tracking
// =========================================================================
const USAGE_ALARM = 'fm-usage-tick';
browser.alarms.create(USAGE_ALARM, { periodInMinutes: 1 });

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function domainKeyForHostname(hostname) {
  if (/(^|\.)instagram\.com$/.test(hostname)) return 'instagram';
  if (/(^|\.)youtube\.com$/.test(hostname)) return 'youtube';
  if (/(^|\.)(twitter|x)\.com$/.test(hostname)) return 'twitter';
  if (/(^|\.)reddit\.com$/.test(hostname)) return 'reddit';
  if (/(^|\.)linkedin\.com$/.test(hostname)) return 'linkedin';
  return null;
}

async function tickUsage() {
  try {
    const win = await browser.windows.getLastFocused({ populate: false });
    if (!win || !win.focused) return; // browser itself isn't focused — user is elsewhere

    const [activeTab] = await browser.tabs.query({ active: true, windowId: win.id });
    if (!activeTab || !activeTab.url) return;

    let hostname;
    try { hostname = new URL(activeTab.url).hostname; } catch (e) { return; }
    const domain = domainKeyForHostname(hostname);
    if (!domain) return;

    const { fmUsageState, fmMasterEnabled, ytChannelWhitelist } =
      await browser.storage.local.get({ fmUsageState: null, fmMasterEnabled: true, ytChannelWhitelist: [] });
    if (fmMasterEnabled === false) return;

    const today = todayString();
    const state = (fmUsageState && fmUsageState.date === today) ? fmUsageState : { date: today, domains: {} };
    state.domains[domain] = (state.domains[domain] || 0) + 60; // one alarm tick = 60s

    await browser.storage.local.set({ fmUsageState: state });
  } catch (e) {
    // Tab/window can legitimately vanish between the query and the read —
    // just skip this tick.
  }
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === USAGE_ALARM) tickUsage();
  if (alarm.name === 'fm-pomodoro-end') endPomodoro(true);
});

// =========================================================================
// 3. Pomodoro sessions
// =========================================================================
async function startPomodoro(durationMinutes) {
  const endsAt = Date.now() + durationMinutes * 60000;
  await browser.storage.local.set({ fmPomodoro: { active: true, endsAt } });
  browser.alarms.create('fm-pomodoro-end', { when: endsAt });
}

async function endPomodoro(notify) {
  await browser.storage.local.set({ fmPomodoro: { active: false, endsAt: 0 } });
  browser.alarms.clear('fm-pomodoro-end');
  if (notify && browser.notifications) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon.svg'),
      title: 'Focus Mode',
      message: 'Your Pomodoro session is over — nice work.'
    });
  }
}

// =========================================================================
// 4. Element-picker / custom-rule plumbing
// =========================================================================
const BUILT_IN_HOST_PATTERNS = [
  /(^|\.)instagram\.com$/, /(^|\.)youtube\.com$/, /(^|\.)(twitter|x)\.com$/,
  /(^|\.)reddit\.com$/, /(^|\.)linkedin\.com$/
];

async function registerCustomBlockerFor(hostname) {
  const origin = `*://*.${hostname}/*`;
  try {
    const granted = await browser.permissions.request({ origins: [origin] });
    if (!granted) return false;

    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [`fm-custom-${hostname}`] });
    if (existing.length) await browser.scripting.unregisterContentScripts({ ids: [`fm-custom-${hostname}`] });

    await browser.scripting.registerContentScripts([{
      id: `fm-custom-${hostname}`,
      matches: [origin],
      js: ['content-scripts/custom-blocker.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true
    }]);
    return true;
  } catch (e) {
    return false;
  }
}

// Single dispatch point for every message the popup/options/picker send —
// keeping one listener avoids ambiguity about which listener's returned
// promise wins when several could match.
browser.runtime.onMessage.addListener(async (message) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'fm-add-custom-rule': {
      const { fmCustomRules } = await browser.storage.local.get({ fmCustomRules: [] });
      fmCustomRules.push({ hostname: message.hostname, selector: message.selector, enabled: true });
      await browser.storage.local.set({ fmCustomRules });

      const isBuiltIn = BUILT_IN_HOST_PATTERNS.some((re) => re.test(message.hostname));
      if (!isBuiltIn) await registerCustomBlockerFor(message.hostname);
      return;
    }

    // Invoked by popup.js when the user clicks "Pick element to block".
    case 'fm-start-picker': {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/element-picker.js'] });
      await browser.scripting.insertCSS({ target: { tabId: tab.id }, files: ['css/picker.css'] });
      return;
    }

    case 'fm-start-pomodoro':
      return startPomodoro(message.minutes);

    case 'fm-stop-pomodoro':
      return endPomodoro(false);

    default:
      return;
  }
});
