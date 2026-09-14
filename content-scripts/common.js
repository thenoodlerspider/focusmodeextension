/**
 * common.js
 * Loaded before every platform-specific content script (and before
 * friction.js / custom-blocker.js). Responsible for:
 *   1. Defining the default settings shape (kept in sync with
 *      background.js and options/options.js — see "KEEP IN SYNC" comments).
 *   2. Reading settings from browser.storage.local.
 *   3. Toggling CSS "flag" classes on <html> so the injected stylesheets
 *      can react purely via CSS — no JS needed to hide most elements.
 *   4. Re-applying those classes live when a toggle changes.
 *   5. Small shared helpers: debounce, domain detection, a reusable
 *      full-screen overlay builder, and the daily-time-budget check.
 *
 * NOTE ON THE MASTER SWITCH: when fmMasterEnabled is false, every flag
 * class below is force-cleared regardless of its individual setting, so
 * a single popup toggle instantly restores the untouched site.
 */

// --- KEEP IN SYNC with background.js FM_DEFAULTS and options/options.js ---
const FM_DEFAULTS = {
  // ---- Global & utility ----
  fmMasterEnabled: true,
  strictMode: false,
  strictModeDelaySeconds: 10,
  unlockChallengeType: 'timer',   // 'timer' | 'phrase'
  unlockPhrase: 'I am opening this for a specific reason',
  scheduleEnabled: false,
  scheduleStart: '09:00',
  scheduleEnd: '17:00',
  scheduleDays: [1, 2, 3, 4, 5],  // 0=Sun .. 6=Sat
  pomodoroDurationMinutes: 25,
  scrollInterruptEnabled: false,
  scrollInterruptViewports: 6,
  grayscaleEnabled: false,
  fontSimplifyEnabled: false,
  intentBarEnabled: false,
  intentBarSites: { youtube: true, reddit: true, instagram: false, twitter: false, linkedin: false },
  directLinkWhitelistEnabled: true,
  syncEnabled: false,

  // ---- Instagram ----
  igBlock: true,
  igFollowingFeed: true,
  igHideStories: true,
  igHideMetrics: false,
  igHideNotifBadges: false,
  igLimitFeedPosts: false,
  igFeedPostLimit: 4,
  igSmartHomeRedirect: false,

  // ---- YouTube ----
  ytBlockShorts: true,
  ytFocusMode: true,
  ytHideHomepage: false,
  ytShortsRedirectStandard: false,
  ytDisableAutoplay: false,
  ytHideNotifBadge: false,
  ytHideVanityMetrics: false,
  ytBlockTrendingLive: false,
  ytSmartHomeRedirect: false,

  // ---- Twitter / X ----
  twitterFocusMode: true,
  twHideMetrics: false,
  twHideSidebarWidgets: false,
  twHideNotifBadges: false,
  twSmartHomeRedirect: false,

  // ---- Reddit ----
  rdBlockAllPopular: false,
  rdHideHomeFeed: false,
  rdBlockVideoFeed: false,

  // ---- LinkedIn ----
  liBlankFeed: false,
  liHideNewsSidebar: false,

  // ---- Shared ----
  blockComments: true, // YouTube + Instagram

  // Pomodoro runtime state. Not a user-facing "setting" so much as a small
  // piece of state, but it rides along in the same storage.get() call for
  // simplicity — see popup.js for how sessions are started/stopped and
  // background.js for how they expire.
  fmPomodoro: { active: false, endsAt: 0 }
};

// Longer/structured settings live under their own storage keys so
// FM_DEFAULTS above stays a flat, easily-diffed object of scalar toggles.
const FM_LIST_DEFAULTS = {
  ytChannelWhitelist: [],   // array of channel names/handles exempt from focus rules
  fmBudgets: {},            // { instagram: minutes, youtube: minutes, ... } 0/undefined = unlimited
  fmCustomRules: []         // [{ hostname, selector, enabled }]
};

/** Fetch current settings (merged with defaults) and hand them to cb. */
function fmGetSettings(cb) {
  browser.storage.local.get(FM_DEFAULTS).then(cb).catch(() => cb(FM_DEFAULTS));
}

/** Fetch the list-shaped settings (channel whitelist, budgets, custom rules). */
function fmGetLists(cb) {
  browser.storage.local.get(FM_LIST_DEFAULTS).then(cb).catch(() => cb(FM_LIST_DEFAULTS));
}

// Maps a settings key straight onto an <html> class name. Anything not
// listed here is handled purely in JS instead (no stable CSS-only hook).
const FM_CLASS_MAP = [
  ['igBlock', 'fm-ig-block'],
  ['igFollowingFeed', 'fm-ig-following'],
  ['igHideStories', 'fm-ig-hide-stories'],
  ['igHideMetrics', 'fm-ig-hide-metrics'],
  ['igHideNotifBadges', 'fm-ig-hide-notif'],
  ['igLimitFeedPosts', 'fm-ig-limit-feed'],

  ['ytBlockShorts', 'fm-yt-shorts-block'],
  ['ytFocusMode', 'fm-yt-focus'],
  ['ytHideHomepage', 'fm-yt-hide-homepage'],
  ['ytDisableAutoplay', 'fm-yt-no-autoplay'],
  ['ytHideNotifBadge', 'fm-yt-hide-notif'],
  ['ytHideVanityMetrics', 'fm-yt-hide-metrics'],
  ['ytBlockTrendingLive', 'fm-yt-hide-trending'],

  ['twitterFocusMode', 'fm-tw-focus'],
  ['twHideMetrics', 'fm-tw-hide-metrics'],
  ['twHideSidebarWidgets', 'fm-tw-hide-sidebar'],
  ['twHideNotifBadges', 'fm-tw-hide-notif'],

  ['rdBlockAllPopular', 'fm-rd-block-all'],
  ['rdHideHomeFeed', 'fm-rd-hide-home'],
  ['rdBlockVideoFeed', 'fm-rd-block-video'],

  ['liBlankFeed', 'fm-li-blank-feed'],
  ['liHideNewsSidebar', 'fm-li-hide-news'],

  ['blockComments', 'fm-block-comments'],
  ['grayscaleEnabled', 'fm-grayscale'],
  ['fontSimplifyEnabled', 'fm-font-simple']
];

// ---------------------------------------------------------------------
// Schedule window check — "Focus Timer / Schedule" feature. When
// scheduleEnabled is on, focus rules are only (auto-)active during the
// configured hours/days; outside that window the site behaves normally
// even if the user never touched the master switch. A running Pomodoro
// session always wins and forces rules on, regardless of the schedule.
// ---------------------------------------------------------------------
function fmIsWithinSchedule(settings) {
  const now = new Date();
  if (!settings.scheduleDays.includes(now.getDay())) return false;

  const [startH, startM] = settings.scheduleStart.split(':').map(Number);
  const [endH, endM] = settings.scheduleEnd.split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (startMins === endMins) return true; // 24h window
  if (startMins < endMins) return nowMins >= startMins && nowMins < endMins;
  return nowMins >= startMins || nowMins < endMins; // overnight window (e.g. 22:00–06:00)
}

/** True if focus rules should be active right now, combining the manual
 *  master switch, an active Pomodoro session, and the optional schedule. */
function fmIsEffectivelyEnabled(settings) {
  const pomodoroActive = !!(settings.fmPomodoro && settings.fmPomodoro.active &&
    settings.fmPomodoro.endsAt > Date.now());
  if (pomodoroActive) return true;
  if (!settings.fmMasterEnabled) return false;
  if (settings.scheduleEnabled) return fmIsWithinSchedule(settings);
  return true;
}

/** Mirror settings onto <html> as classes so CSS files can select on them. */
function fmApplyClasses(settings) {
  const root = document.documentElement;
  const masterOn = fmIsEffectivelyEnabled(settings);
  root.classList.toggle('fm-master-off', !masterOn);

  FM_CLASS_MAP.forEach(([key, cls]) => {
    root.classList.toggle(cls, masterOn && !!settings[key]);
  });
}

// Apply as early as possible — document_start guarantees <html> exists
// even before <head>/<body> are parsed, so there's no flash of blocked UI.
fmGetSettings(fmApplyClasses);

// Live-update whenever the popup/options page changes a toggle.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  fmGetSettings(fmApplyClasses);
});

// The schedule window and Pomodoro countdown both change purely with the
// clock, with no storage.onChanged event to hook — re-evaluate every 30s
// so a session ending or a scheduled window opening/closing is caught
// without needing a page reload.
setInterval(() => fmGetSettings(fmApplyClasses), 30000);

/** Simple trailing-edge debounce, used to throttle MutationObserver callbacks. */
function fmDebounce(fn, wait) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ---------------------------------------------------------------------
// Domain detection — every platform script and the shared friction /
// budget logic needs a canonical short key for "which site is this".
// ---------------------------------------------------------------------
function fmDomainKey(hostname = location.hostname) {
  if (/(^|\.)instagram\.com$/.test(hostname)) return 'instagram';
  if (/(^|\.)youtube\.com$/.test(hostname)) return 'youtube';
  if (/(^|\.)(twitter|x)\.com$/.test(hostname)) return 'twitter';
  if (/(^|\.)reddit\.com$/.test(hostname)) return 'reddit';
  if (/(^|\.)linkedin\.com$/.test(hostname)) return 'linkedin';
  return null;
}

// ---------------------------------------------------------------------
// Reusable full-screen overlay — used by the daily time-budget block,
// the schedule lockout, the scroll-count interrupt, and unlock
// challenges. One implementation means one visual language for every
// "Focus Mode is stepping in" moment (styled in css/global.css).
//
// opts: { id, title, message, extraNode, buttons: [{label, onClick, primary, disabled}] }
// Returns the overlay element (already appended to <html>).
// ---------------------------------------------------------------------
function fmShowOverlay(opts) {
  const existing = document.getElementById(opts.id);
  if (existing) return existing;

  const overlay = document.createElement('div');
  overlay.id = opts.id;
  overlay.className = 'fm-overlay';

  const card = document.createElement('div');
  card.className = 'fm-overlay-card';

  const title = document.createElement('h1');
  title.className = 'fm-overlay-title';
  title.textContent = opts.title;
  card.appendChild(title);

  const msg = document.createElement('p');
  msg.className = 'fm-overlay-message';
  msg.textContent = opts.message;
  card.appendChild(msg);

  if (opts.extraNode) card.appendChild(opts.extraNode);

  if (opts.buttons && opts.buttons.length) {
    const row = document.createElement('div');
    row.className = 'fm-overlay-buttons';
    opts.buttons.forEach((btn) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = btn.label;
      el.className = btn.primary ? 'fm-overlay-btn fm-overlay-btn-primary' : 'fm-overlay-btn';
      el.disabled = !!btn.disabled;
      el.addEventListener('click', () => btn.onClick(el));
      row.appendChild(el);
      btn._el = el;
    });
    card.appendChild(row);
  }

  overlay.appendChild(card);
  (document.body || document.documentElement).appendChild(overlay);
  return overlay;
}

function fmRemoveOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ---------------------------------------------------------------------
// Daily time-budget check. Actual time-tracking happens in
// background.js (a tab can sit open without being the focused/active
// one); this just reads the ticked-up usage and decides whether to
// block the page the user is currently looking at.
// ---------------------------------------------------------------------
function fmCheckBudget() {
  const domain = fmDomainKey();
  if (!domain) return;

  browser.storage.local.get(['fmBudgets', 'fmUsageState', 'fmMasterEnabled']).then((data) => {
    if (data.fmMasterEnabled === false) return;
    const budgetMinutes = (data.fmBudgets || {})[domain];
    if (!budgetMinutes) return; // 0 / undefined = unlimited

    const usage = data.fmUsageState || {};
    const usedSeconds = (usage.domains || {})[domain] || 0;
    if (usedSeconds >= budgetMinutes * 60) {
      fmShowOverlay({
        id: 'fm-budget-overlay',
        title: "⏳ Time's up for today",
        message: `You've hit your ${budgetMinutes}-minute daily budget for this site. It resets at midnight.`,
        buttons: [{ label: 'Close this tab', primary: true, onClick: () => window.close() }]
      });
    } else {
      fmRemoveOverlay('fm-budget-overlay');
    }
  });
}

fmCheckBudget();
// Usage ticks up in the background on a timer, independent of this
// page's own JS, so re-check periodically rather than only on load.
setInterval(fmCheckBudget, 20000);
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.fmUsageState || changes.fmBudgets)) fmCheckBudget();
});
