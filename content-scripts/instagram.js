/**
 * instagram.js
 *
 * Handles everything Instagram-specific:
 *   1. Reels/Explore redirect                              (v1.0, unchanged)
 *   2. Force "Following" feed via ?variant=following redirect (UPDATED)
 *   3. Hide "Suggested for you" / Sponsored posts            (v1.1)
 *   4. Hide the Stories tray                                  (v1.1)
 *   5. Hide comment lists + comment input forms,
 *      including inside the post modal/lightbox               (v1.1)
 *
 * Instagram ships obfuscated, frequently-rotated class names, so — per the
 * project's CSS-first rule — we use CSS wherever there's a stable attribute
 * to key off (href, aria-label), and fall back to a debounced
 * MutationObserver + heuristic JS matching for everything else ("Suggested
 * for you" text, story avatar counts). Every heuristic below is commented
 * with what it's matching and why.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 1. Reels / Explore redirect (unchanged from v1.0)
  // ---------------------------------------------------------------------
  function isBlockedPath(pathname) {
    return /^\/reels\/?/.test(pathname) || /^\/explore\/?/.test(pathname);
  }

  function redirectIfBlocked(settings) {
    if (!settings.igBlock) return;
    if (isBlockedPath(location.pathname)) {
      location.replace('https://www.instagram.com/');
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // 2. Force "Following" feed — every time Instagram is opened
  //
  // Instagram recognizes a `?variant=following` query param on the home
  // route that switches the feed to chronological/Following mode. Rather
  // than simulating clicks on IG's feed-switcher UI (which has no stable
  // selector and has changed shape more than once), we simply redirect the
  // home route to that URL — the same pattern already used for the
  // Reels/Explore block above.
  //
  // Guard: only redirect when the param is MISSING, so we don't create a
  // redirect loop (once the URL is .../?variant=following, this check is a
  // no-op on subsequent runs).
  // ---------------------------------------------------------------------
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

  // Run both redirect checks together on page load — whichever applies wins.
  fmGetSettings((settings) => {
    if (!redirectIfBlocked(settings)) redirectToFollowingVariant(settings);
  });

  // ---------------------------------------------------------------------
  // 3. Hide "Suggested for you" / Sponsored posts
  //
  // Per the project's own convention, Instagram wraps every feed post in an
  // <article>. Rather than trying to isolate the exact suggested-content
  // wrapper (which changes shape often), we scan each <article>'s text for
  // the "Suggested for you" label or the word "Sponsored" that Instagram
  // renders in the post header, and hide the whole article if matched.
  // Trade-off: a caption that happens to literally say "sponsored" would
  // also be hidden — an acceptable false positive for a focus tool.
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
  //
  // Story avatars in the tray carry an aria-label containing "story" (e.g.
  // "<user>'s story"). We look for <ul> elements that contain SEVERAL such
  // avatars — requiring at least 3 matches — so we hide the actual tray
  // (a row of many avatars) without accidentally hiding an unrelated single
  // "Add to your story" action button elsewhere in the UI.
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
  // 5. Hide comments (list + input form), including inside the post modal
  //
  // The comment textarea has a stable aria-label ("Add a comment…"), which
  // is also targeted directly in css/instagram.css for an instant, JS-free
  // hide. Here we additionally hide the comment *list*: a heuristic match
  // on <ul> elements whose <li> children contain a "Like" button svg, which
  // in practice only matches actual comment lists (post galleries/carousels
  // don't have per-item like buttons). This function runs identically
  // whether the comments are on the full post page or inside the
  // role="dialog" lightbox modal — no separate modal-specific code needed,
  // since the same DOM patterns are reused inside the modal.
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
  // Reels/Explore nav-link hiding fallback (unchanged from v1.0) — kept
  // here since it shares the same observer plumbing as the new sweeps.
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
  // SPA route-change handling — shared by the Reels/Explore redirect (#1)
  // and the Following-feed redirect (#2). Instagram uses pushState/
  // replaceState + popstate for internal navigation (e.g. clicking the
  // Home icon doesn't reload the page), so we intercept the History API
  // the same way v1.0 already did.
  //
  // We track the full href (not just pathname) because clicking "Home"
  // while already on "/" can strip just the ?variant=following query
  // param via pushState without changing the pathname at all — a
  // pathname-only comparison would miss that case.
  // ---------------------------------------------------------------------
  let lastHref = location.href;
  function onRouteChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    fmGetSettings((settings) => {
      if (!redirectIfBlocked(settings)) redirectToFollowingVariant(settings);
    });
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
