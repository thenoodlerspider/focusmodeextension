/**
 * common.js
 * Loaded before every platform-specific content script.
 * Responsible for:
 *   1. Defining the default settings shape.
 *   2. Reading settings from browser.storage.local.
 *   3. Toggling CSS "flag" classes on <html> so the injected stylesheets
 *      (css/instagram.css, css/youtube.css, css/twitter.css) can react
 *      purely via CSS — no JS needed to actually hide most elements.
 *   4. Re-applying those classes live when the user flips a toggle in the
 *      popup (browser.storage.onChanged).
 *   5. A small debounce helper used by the heavier MutationObservers.
 */

const FM_DEFAULTS = {
  // --- existing (v1.0) ---
  igBlock: true,          // Instagram: hide Reels/Explore nav + redirect
  ytBlockShorts: true,    // YouTube: hide Shorts nav/shelves + redirect
  ytFocusMode: true,      // YouTube: hide related videos + end-screen recs
  twitterFocusMode: true, // Twitter/X: Following-only + hide Trends

  // --- new (v1.1) ---
  igFollowingFeed: true,  // Instagram: force "Following" feed, hide Suggested/ads
  igHideStories: true,    // Instagram: hide the Stories tray
  ytHideHomepage: false,  // YouTube: "Blank Homepage" (search-only) mode — off
                           // by default since it's the most aggressive toggle
  blockComments: true     // YouTube + Instagram: hide comment sections
};

/** Fetch current settings (merged with defaults) and hand them to cb. */
function fmGetSettings(cb) {
  browser.storage.local.get(FM_DEFAULTS).then(cb).catch(() => cb(FM_DEFAULTS));
}

/** Mirror settings onto <html> as classes so CSS files can select on them. */
function fmApplyClasses(settings) {
  const root = document.documentElement;

  // existing
  root.classList.toggle('fm-ig-block', !!settings.igBlock);
  root.classList.toggle('fm-yt-shorts-block', !!settings.ytBlockShorts);
  root.classList.toggle('fm-yt-focus', !!settings.ytFocusMode);
  root.classList.toggle('fm-tw-focus', !!settings.twitterFocusMode);

  // new
  root.classList.toggle('fm-ig-following', !!settings.igFollowingFeed);
  root.classList.toggle('fm-ig-hide-stories', !!settings.igHideStories);
  root.classList.toggle('fm-yt-hide-homepage', !!settings.ytHideHomepage);
  root.classList.toggle('fm-block-comments', !!settings.blockComments);
}

// Apply as early as possible — document_start guarantees <html> exists
// even before <head>/<body> are parsed, so there's no flash of blocked UI.
fmGetSettings(fmApplyClasses);

// Live-update whenever the popup changes a toggle.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  fmGetSettings(fmApplyClasses);
});

/** Simple trailing-edge debounce, used to throttle MutationObserver callbacks. */
function fmDebounce(fn, wait) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
