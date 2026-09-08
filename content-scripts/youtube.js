/**
 * youtube.js
 *
 * - Redirects any /shorts/* URL back to the homepage.                (v1.0)
 * - MutationObserver fallback for Shorts cards without stable
 *   attributes.                                                       (v1.0)
 * - NEW: manages the "Blank Homepage" placeholder message shown when
 *   ytHideHomepage is on and the video grid is hidden.
 *
 * Comment hiding (#comments / ytd-comments) and end-screen recommendation
 * hiding (.html5-endscreen / .ytp-endscreen-content) are handled entirely
 * in css/youtube.css — those elements have permanently stable
 * IDs/classnames YouTube has used for years, so no JS is needed for them.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Shorts redirect (unchanged from v1.0)
  // ---------------------------------------------------------------------
  function isShortsPath(pathname) {
    return /^\/shorts\//.test(pathname);
  }

  function redirectIfShorts(settings) {
    if (!settings.ytBlockShorts) return;
    if (isShortsPath(location.pathname)) {
      location.replace('https://www.youtube.com/');
    }
  }

  fmGetSettings(redirectIfShorts);

  // ---------------------------------------------------------------------
  // NEW: "Blank Homepage" placeholder message.
  //
  // css/youtube.css hides the video grid via YouTube's own
  // ytd-browse[page-subtype="home"] attribute — a first-party attribute
  // YouTube itself sets to mark the homepage section, so it's reliable and
  // needs no JS. This function just inserts (and removes) a small
  // friendly message in the now-empty space so the page doesn't look
  // broken, and only on the homepage route.
  // ---------------------------------------------------------------------
  function manageHomepageBlankMessage() {
    const existing = document.getElementById('fm-blank-homepage-msg');
    const shouldShow =
      document.documentElement.classList.contains('fm-yt-hide-homepage') &&
      /^\/?$/.test(location.pathname);

    if (!shouldShow) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return; // already inserted for this page view

    const target =
      document.querySelector('ytd-browse[page-subtype="home"] #primary') ||
      document.querySelector('ytd-browse[page-subtype="home"]');
    if (!target) return; // homepage container not mounted yet — a later sweep will retry

    const msg = document.createElement('div');
    msg.id = 'fm-blank-homepage-msg';
    msg.textContent = '🔍 Homepage browsing is disabled in Focus Mode — use search to find what you need.';
    msg.style.cssText =
      'padding:60px 20px;text-align:center;font-size:16px;opacity:0.7;';
    target.prepend(msg);
  }

  // ---------------------------------------------------------------------
  // MutationObserver fallback for Shorts cards without stable attributes
  // (unchanged from v1.0), extended to also drive the homepage message
  // since YouTube's SPA shell mounts/remounts ytd-browse on navigation.
  // ---------------------------------------------------------------------
  function sweepNode(node) {
    if (document.documentElement.classList.contains('fm-yt-shorts-block')) {
      if (node.querySelectorAll) {
        node.querySelectorAll('ytd-reel-shelf-renderer').forEach((el) => {
          el.style.setProperty('display', 'none', 'important');
        });
        node.querySelectorAll('a[href^="/shorts/"]').forEach((a) => {
          const card = a.closest(
            'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer'
          );
          if (card) card.style.setProperty('display', 'none', 'important');
        });
        if (node.matches && node.matches('a[href^="/shorts/"]')) {
          const card = node.closest(
            'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer'
          );
          if (card) card.style.setProperty('display', 'none', 'important');
        }
      }
    }
    manageHomepageBlankMessage();
  }

  const debouncedHomepageCheck = fmDebounce(manageHomepageBlankMessage, 150);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) sweepNode(node);
      });
    }
    debouncedHomepageCheck();
  });

  function start() {
    sweepNode(document.body);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  // YouTube's SPA shell fires this custom event on every internal navigation.
  let lastPath = location.pathname;
  function onRouteChange() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    fmGetSettings(redirectIfShorts);
    manageHomepageBlankMessage();
  }
  window.addEventListener('yt-navigate-finish', onRouteChange);
  window.addEventListener('popstate', onRouteChange);
})();
