/**
 * twitter.js
 * Twitter/X doesn't give "For You" vs "Following" distinct URLs — both live
 * under /home and are switched client-side via a tablist, and most of its
 * DOM has no version-stable class names, so this file leans on JS
 * heuristics keyed off `data-testid` attributes and heading text.
 *
 *   - Hides the "For You" tab and auto-clicks "Following".
 *   - Hides the Trends/"What's happening" module and other right-rail
 *     widgets ("Who to follow", "You might like", Premium upsells).
 *   - Hides engagement counts (replies/retweets/likes/views) on tweets.
 *   - Hides unread notification badges (JS fallback for twitter.css's
 *     inline-style selector, in case X changes how it marks the badge).
 */

(function () {
  'use strict';

  function focusOn() {
    return document.documentElement.classList.contains('fm-tw-focus');
  }

  function forceFollowingTab() {
    if (!focusOn()) return;
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

    if (forYouTab) forYouTab.style.setProperty('display', 'none', 'important');
    if (followingTab && followingTab.getAttribute('aria-selected') !== 'true') {
      followingTab.click();
    }
  }

  // ---------------------------------------------------------------------
  // Sidebar module hiding — generalized beyond just Trends to cover
  // "Who to follow", "You might like", and Premium upsells. Matched by
  // heading text since X occasionally renames/rewraps these modules.
  // ---------------------------------------------------------------------
  const SIDEBAR_PATTERNS = /trending|what.?s happening|who to follow|you might like|subscribe to (x )?premium/i;

  function hideSidebarModules() {
    if (!focusOn() && !document.documentElement.classList.contains('fm-tw-hide-sidebar')) return;
    document.querySelectorAll('div[aria-label] h2, aside h2, section h2').forEach((h) => {
      const text = h.textContent?.trim();
      if (text && SIDEBAR_PATTERNS.test(text)) {
        const container = h.closest('section, div[aria-label]');
        if (container) container.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // ---------------------------------------------------------------------
  // Hide engagement counts (replies/retweets/likes/views)
  //
  // Each action button (reply/retweet/like) carries a stable data-testid;
  // the visible count is a leaf <span> inside it. We hide just that span
  // so the buttons stay clickable and the layout doesn't jump. The view
  // count has no data-testid of its own — it's the last link in the
  // action group, whose text is a bare number/K/M figure — matched by
  // text pattern instead.
  // ---------------------------------------------------------------------
  const COUNT_TESTIDS = ['reply', 'retweet', 'unretweet', 'like', 'unlike'];
  const NUMERIC_PATTERN = /^[\d,.]+[KMB]?$/;

  function hideMetrics() {
    if (!document.documentElement.classList.contains('fm-tw-hide-metrics')) return;

    COUNT_TESTIDS.forEach((testid) => {
      document.querySelectorAll(`[data-testid="${testid}"] span`).forEach((span) => {
        if (span.children.length === 0 && NUMERIC_PATTERN.test(span.textContent?.trim() || '')) {
          span.style.setProperty('display', 'none', 'important');
        }
      });
    });

    // View counts: a plain span/a inside the tweet's action group whose
    // text is just a number — not tied to a testid, so scope the search
    // to role="group" (the action bar) to avoid touching unrelated numbers.
    document.querySelectorAll('[role="group"] span').forEach((span) => {
      if (span.children.length === 0 && NUMERIC_PATTERN.test(span.textContent?.trim() || '')) {
        span.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // ---------------------------------------------------------------------
  // Notification badges — JS fallback in case X's inline-style badge
  // marker (targeted directly in twitter.css) changes shape.
  // ---------------------------------------------------------------------
  function hideNotifBadges() {
    if (!document.documentElement.classList.contains('fm-tw-hide-notif')) return;
    document.querySelectorAll('[data-testid="AppTabBar_Notifications_Link"], [data-testid="AppTabBar_DirectMessage_Link"]')
      .forEach((link) => {
        link.querySelectorAll('div, span').forEach((el) => {
          if (el.children.length === 0 && el.textContent?.trim() === '' &&
            getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)') {
            el.style.setProperty('display', 'none', 'important');
          }
        });
      });
  }

  function sweep() {
    forceFollowingTab();
    hideSidebarModules();
    hideMetrics();
    hideNotifBadges();
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
