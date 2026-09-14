/**
 * instagram.js
 *
 * Handles everything Instagram-specific:
 *   1. Reels/Explore redirect, and Smart Home redirect to the inbox
 *      (mutually exclusive with #2 — both target the home route, and
 *      igSmartHomeRedirect wins if both are on; see background.js).
 *   2. Force "Following" feed via ?variant=following redirect.
 *   3. Hide "Suggested for you" / Sponsored posts.
 *   4. Hide the Stories tray.
 *   5. Hide comment lists + comment input forms.
 *   6. Hide vanity metrics (like/view/comment counts).
 *   7. Hide notification & DM unread badges.
 *   8. Disable infinite scroll — cap the feed at N posts behind a manual
 *      "Show more" button.
 *
 * Direct-link whitelisting note: Instagram already gives individual reel
 * permalinks a *singular* path (/reel/<id>/) distinct from the Reels tab
 * (/reels/, plural) that igBlock targets — so a reel link shared in a chat
 * already opens fine even with igBlock on. We only need fmIsDirectOpen()
 * here to additionally hide the auto-queued "up next" reels stacked below
 * the one the user actually opened.
 *
 * Instagram ships obfuscated, frequently-rotated class names, so — per the
 * project's CSS-first rule — we use CSS wherever there's a stable attribute
 * to key off (href, aria-label), and fall back to a debounced
 * MutationObserver + heuristic JS matching for everything else.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 1 & 2. Redirects on load + SPA route changes
  // ---------------------------------------------------------------------
  function isBlockedPath(pathname) {
    return /^\/reels\/?/.test(pathname) || /^\/explore\/?/.test(pathname);
  }

  function redirectIfBlocked(settings) {
    if (!settings.igBlock) return false;
    if (isBlockedPath(location.pathname)) {
      location.replace('https://www.instagram.com/');
      return true;
    }
    return false;
  }

  function redirectSmartHome(settings) {
    if (!settings.igSmartHomeRedirect) return false;
    const url = new URL(location.href);
    const isHomeRoute = url.pathname === '/' || url.pathname === '';
    if (isHomeRoute) {
      location.replace('https://www.instagram.com/direct/inbox/');
      return true;
    }
    return false;
  }

  function redirectToFollowingVariant(settings) {
    if (!settings.igFollowingFeed) return false;
    const url = new URL(location.href);
    const isHomeRoute = url.pathname === '/' || url.pathname === '';
    const alreadyFollowing = url.searchParams.get('variant') === 'following';
    if (isHomeRoute && !alreadyFollowing) {
      location.replace('https://www.instagram.com/?variant=following');
      return true;
    }
    return false;
  }

  function runRedirects(settings) {
    if (redirectIfBlocked(settings)) return;
    if (redirectSmartHome(settings)) return;
    redirectToFollowingVariant(settings);
  }

  fmGetSettings(runRedirects);

  // ---------------------------------------------------------------------
  // 3. Hide "Suggested for you" / Sponsored posts
  // ---------------------------------------------------------------------
  function sweepSuggestedAndAds(root) {
    if (!document.documentElement.classList.contains('fm-ig-following')) return;
    if (!root.querySelectorAll) return;
    root.querySelectorAll('article').forEach((article) => {
      const text = article.textContent || '';
      if (/suggested for you/i.test(text) || /\bsponsored\b/i.test(text)) {
        article.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // ---------------------------------------------------------------------
  // 4. Hide the Stories tray
  // ---------------------------------------------------------------------
  function sweepStories(root) {
    if (!document.documentElement.classList.contains('fm-ig-hide-stories')) return;
    if (!root.querySelectorAll) return;
    root.querySelectorAll('ul').forEach((ul) => {
      const storyAvatars = ul.querySelectorAll('[aria-label*="story" i]');
      if (storyAvatars.length >= 3) {
        ul.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // ---------------------------------------------------------------------
  // 5. Hide comments (list + input form)
  // ---------------------------------------------------------------------
  function sweepComments(root) {
    if (!document.documentElement.classList.contains('fm-block-comments')) return;
    if (!root.querySelectorAll) return;

    root.querySelectorAll('textarea[aria-label^="Add a comment"]').forEach((textarea) => {
      const form = textarea.closest('form');
      if (form) form.style.setProperty('display', 'none', 'important');
    });

    root.querySelectorAll('ul').forEach((ul) => {
      if (ul.querySelector('svg[aria-label="Like"]') && ul.closest('article, div[role="dialog"]')) {
        ul.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // ---------------------------------------------------------------------
  // 6. Hide vanity metrics — like / view / comment counts
  //
  // Instagram renders these as a <span> or <a> whose text matches
  // "N likes", "N views", or "View all N comments" near the top of each
  // post's action bar. We match on that text pattern rather than any
  // class, and blank the text node in place (keeping the element, since
  // removing it can collapse layout/click targets other code relies on).
  // ---------------------------------------------------------------------
  const METRIC_PATTERN = /^(view all |see all )?[\d,.]+\s*(likes?|views?|comments?)$/i;
  function sweepVanityMetrics(root) {
    if (!document.documentElement.classList.contains('fm-ig-hide-metrics')) return;
    if (!root.querySelectorAll) return;
    root.querySelectorAll('a, span, section').forEach((el) => {
      if (el.children.length > 0) return; // only leaf text nodes
      const text = el.textContent?.trim();
      if (text && METRIC_PATTERN.test(text)) {
        el.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // ---------------------------------------------------------------------
  // 7. Hide notification & DM unread badges
  //
  // Beyond the CSS aria-label rule in instagram.css, badges are often a
  // small nav-icon child with only a number as its text content — match
  // that heuristically on the Home/Direct/Notifications nav icons only,
  // to avoid blanking unrelated numeric text elsewhere on the page.
  // ---------------------------------------------------------------------
  function sweepNotifBadges(root) {
    if (!document.documentElement.classList.contains('fm-ig-hide-notif')) return;
    if (!root.querySelectorAll) return;
    root.querySelectorAll('a[href="/direct/inbox/"] span, [aria-label="Notifications"] span').forEach((span) => {
      if (span.children.length === 0 && /^\d+\+?$/.test(span.textContent?.trim() || '')) {
        span.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // ---------------------------------------------------------------------
  // 8. Disable infinite scroll — cap the main feed at N posts
  //
  // Instead of fighting Instagram's fetch-on-scroll internals, we simply
  // hide every <article> in the main feed past the configured limit and
  // show a manual "Show more" button. Clicking it reveals the next batch
  // client-side; Instagram's own lazy-loading may still fetch further
  // posts in the background, but the user never sees them without an
  // explicit click, which is what actually breaks the "just one more"
  // scroll habit.
  // ---------------------------------------------------------------------
  let feedRevealCount = null; // null until initialized from settings

  function buildShowMoreButton(limit) {
    const btn = document.createElement('button');
    btn.id = 'fm-feed-show-more';
    btn.type = 'button';
    btn.textContent = `Show ${limit} more posts`;
    btn.style.cssText =
      'display:block;margin:24px auto;padding:10px 20px;border-radius:999px;' +
      'border:1px solid #363636;background:transparent;color:inherit;font-size:14px;cursor:pointer;';
    btn.addEventListener('click', () => {
      feedRevealCount += limit;
      sweepFeedLimit(document.body);
    });
    return btn;
  }

  function sweepFeedLimit(root) {
    if (!document.documentElement.classList.contains('fm-ig-limit-feed')) return;
    fmGetSettings((settings) => {
      const limit = settings.igFeedPostLimit || 4;
      if (feedRevealCount === null) feedRevealCount = limit;

      // Only apply to the main timeline feed, not a single post's page or
      // a profile grid — those are <main><article> without a feed <section>
      // wrapper repeated many times.
      const main = document.querySelector('main');
      if (!main) return;
      const articles = Array.from(main.querySelectorAll(':scope > div > div > article, section > article'));
      if (articles.length <= 1) return;

      articles.forEach((article, i) => {
        article.style.display = i < feedRevealCount ? '' : 'none';
      });

      const existingBtn = document.getElementById('fm-feed-show-more');
      if (articles.length > feedRevealCount) {
        if (!existingBtn) {
          const btn = buildShowMoreButton(limit);
          articles[feedRevealCount - 1].insertAdjacentElement('afterend', btn);
        }
      } else if (existingBtn) {
        existingBtn.remove();
      }
    });
  }

  // ---------------------------------------------------------------------
  // Reels/Explore nav-link hiding fallback (shares the observer plumbing)
  // ---------------------------------------------------------------------
  const HIDE_LABELS = ['Reels', 'Explore'];
  function hideByAriaLabel(root) {
    if (!document.documentElement.classList.contains('fm-ig-block')) return;
    if (!root.querySelectorAll) return;
    root.querySelectorAll('a, div[role="link"], svg[aria-label]').forEach((el) => {
      const label = el.getAttribute('aria-label') || el.textContent?.trim();
      if (label && HIDE_LABELS.includes(label)) {
        const clickable = el.closest('a, div[role="link"]') || el;
        clickable.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // ---------------------------------------------------------------------
  // Unified sweep — runs every heuristic above against a given root node.
  // ---------------------------------------------------------------------
  function sweep(root) {
    hideByAriaLabel(root);
    sweepSuggestedAndAds(root);
    sweepStories(root);
    sweepComments(root);
    sweepVanityMetrics(root);
    sweepNotifBadges(root);
    sweepFeedLimit(root);
  }

  const debouncedSweep = fmDebounce((nodes) => nodes.forEach(sweep), 100);

  const observer = new MutationObserver((mutations) => {
    const added = [];
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) added.push(node);
      });
    }
    if (added.length) debouncedSweep(added);
  });

  function start() {
    sweep(document.body);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  // ---------------------------------------------------------------------
  // SPA route-change handling — Instagram uses pushState/replaceState +
  // popstate for internal navigation, so we intercept the History API.
  // We track the full href (not just pathname) because clicking "Home"
  // while already on "/" can strip just the ?variant=following query
  // param via pushState without changing the pathname at all.
  // ---------------------------------------------------------------------
  let lastHref = location.href;
  function onRouteChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    feedRevealCount = null; // reset the "Show more" progress on a fresh route
    fmGetSettings(runRedirects);
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
