/**
 * twitter.js
 * Twitter/X doesn't give "For You" vs "Following" distinct URLs — both live
 * under /home and are switched client-side via a tablist. There's also no
 * stable data-testid on the tabs themselves, so unlike Instagram/YouTube we
 * do this hiding/clicking primarily in JS rather than pure CSS.
 *
 * - Hides the "For You" tab.
 * - Auto-clicks "Following" if it isn't already the active tab.
 * - Hides the Trends/"What's happening" module in the right rail.
 * All gated behind html.fm-tw-focus (see content-scripts/common.js).
 */

(function () {
  'use strict';

  function enabled() {
    return document.documentElement.classList.contains('fm-tw-focus');
  }

  function forceFollowingTab() {
    if (!enabled()) return;
    // The tab strip only exists on the Home timeline.
    if (!/^\/home\/?$/.test(location.pathname)) return;

    const tabs = document.querySelectorAll('[role="tab"]');
    if (!tabs.length) return;

    let forYouTab = null;
    let followingTab = null;
    tabs.forEach((tab) => {
      const label = tab.textContent?.trim().toLowerCase();
      if (label === 'for you') forYouTab = tab;
      if (label === 'following') followingTab = tab;
    });

    if (forYouTab) {
      forYouTab.style.setProperty('display', 'none', 'important');
    }
    if (followingTab && followingTab.getAttribute('aria-selected') !== 'true') {
      followingTab.click();
    }
  }

  function hideTrends() {
    if (!enabled()) return;
    // Primary target: the aria-labelled trending region (see twitter.css).
    // Fallback: match on the section heading text, since X occasionally
    // renames/rewraps this module.
    document.querySelectorAll('div[aria-label] h2, aside h2, section h2').forEach((h) => {
      const text = h.textContent?.trim();
      if (text && /trending|what.?s happening|trends for you/i.test(text)) {
        const container = h.closest('section, div[aria-label]');
        if (container) container.style.setProperty('display', 'none', 'important');
      }
    });
  }

  function sweep() {
    forceFollowingTab();
    hideTrends();
  }

  sweep();

  // Debounced MutationObserver — X re-renders extremely often, so we throttle
  // hard to avoid janking the timeline scroll.
  const debouncedSweep = fmDebounce(sweep, 200);
  const observer = new MutationObserver(() => debouncedSweep());

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  // X's SPA routing (pushState-based) — re-sweep shortly after navigation
  // so newly-mounted tabs/trends get caught even before the observer fires.
  ['pushState', 'replaceState'].forEach((method) => {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      setTimeout(sweep, 300);
      return result;
    };
  });
  window.addEventListener('popstate', () => setTimeout(sweep, 300));
})();
