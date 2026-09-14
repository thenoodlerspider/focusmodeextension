/**
 * reddit.js
 *
 *   - Block r/all and r/popular: redirected back to the front page, the
 *     same on-load + SPA route-change pattern used on the other platforms
 *     (the hard-navigation case is also covered by background.js so a
 *     freshly-typed URL never even flashes the blocked page).
 *   - Hide Home Feed: blanks the front-page post list while leaving
 *     search and direct subreddit URLs fully usable — mirrors YouTube's
 *     "Blank Homepage" placeholder pattern.
 *   - Block Reddit Video/Shorts Feed: hides the TikTok-style immersive
 *     vertical video feed (mostly handled in reddit.css; this covers the
 *     "watch" route directly in case the feed element loads before the
 *     stylesheet's attribute selector can match).
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Block r/all and r/popular
  // ---------------------------------------------------------------------
  function isBlockedPath(pathname) {
    return /^\/r\/(all|popular)\/?/i.test(pathname);
  }

  function redirectIfBlocked(settings) {
    if (!settings.rdBlockAllPopular) return false;
    if (isBlockedPath(location.pathname)) {
      location.replace('https://www.reddit.com/');
      return true;
    }
    return false;
  }

  fmGetSettings(redirectIfBlocked);

  // ---------------------------------------------------------------------
  // Blank Home Feed
  // ---------------------------------------------------------------------
  function isHomeRoute() {
    return /^\/?$/.test(location.pathname);
  }

  function manageHomeBlankMessage() {
    const existing = document.getElementById('fm-rd-blank-home-msg');
    const shouldShow = document.documentElement.classList.contains('fm-rd-hide-home') && isHomeRoute();

    if (!shouldShow) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    const feed = document.querySelector('shreddit-feed, [data-testid="frontpage-feed"], #main-content');
    if (!feed) return;

    feed.style.setProperty('display', 'none', 'important');
    const msg = document.createElement('div');
    msg.id = 'fm-rd-blank-home-msg';
    msg.textContent = '🔍 The Reddit home feed is disabled in Focus Mode — search or open a subreddit directly.';
    msg.style.cssText = 'padding:60px 20px;text-align:center;font-size:16px;opacity:0.7;';
    feed.insertAdjacentElement('afterend', msg);
  }

  // ---------------------------------------------------------------------
  // Block the immersive video/shorts feed
  // ---------------------------------------------------------------------
  function hideVideoFeed(root) {
    if (!document.documentElement.classList.contains('fm-rd-block-video')) return;
    if (!root.querySelectorAll) return;
    root.querySelectorAll('shreddit-feed[feed-type="watch"], [data-testid="videofeed"]').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
  }

  function sweep(root) {
    manageHomeBlankMessage();
    hideVideoFeed(root);
  }

  const debouncedSweep = fmDebounce((nodes) => nodes.forEach(sweep), 150);
  const observer = new MutationObserver((mutations) => {
    const added = [];
    for (const m of mutations) {
      m.addedNodes.forEach((node) => { if (node.nodeType === 1) added.push(node); });
    }
    if (added.length) debouncedSweep(added);
    else sweep(document.body);
  });

  function start() {
    sweep(document.body);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  // Reddit's new shell is also a pushState SPA.
  let lastHref = location.href;
  function onRouteChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    fmGetSettings(redirectIfBlocked);
    manageHomeBlankMessage();
  }
  ['pushState', 'replaceState'].forEach((method) => {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      onRouteChange();
      return result;
    };
  });
  window.addEventListener('popstate', onRouteChange);
})();
