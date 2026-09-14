/**
 * youtube.js
 *
 *   - Shorts redirect: to the homepage, or (if ytShortsRedirectStandard is
 *     on) rewritten to the equivalent /watch?v= URL so the specific video
 *     is still watchable without landing in the auto-scrolling player.
 *     (The URL rewrite also happens in background.js for hard navigations;
 *     this covers YouTube's own SPA-internal shorts links.)
 *   - "Blank Homepage" placeholder message.
 *   - Disable Autoplay: finds YouTube's own autoplay toggle and clicks it
 *     off whenever it's on.
 *   - Channel Whitelist: on the watch page, if the video's channel is on
 *     the whitelist, exempts that page from the related-sidebar/end-screen
 *     hiding and comment blocking — an inline `!important` style beats a
 *     stylesheet `!important` rule of equal origin when it has higher
 *     specificity, which a style-attribute declaration always does, so
 *     this reliably overrides youtube.css's flag-class rules.
 *
 * Comment hiding (#comments / ytd-comments), the end-screen overlay, and
 * most vanity-metric/trending hiding are handled in css/youtube.css —
 * those elements have long-stable IDs/classnames, so no JS is needed for
 * them except where channel-whitelisting needs to override them.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Shorts redirect
  // ---------------------------------------------------------------------
  function isShortsPath(pathname) {
    return /^\/shorts\//.test(pathname);
  }

  function redirectIfShorts(settings) {
    if (!isShortsPath(location.pathname)) return;
    if (settings.ytShortsRedirectStandard) {
      const videoId = location.pathname.split('/')[2];
      if (videoId) location.replace(`https://www.youtube.com/watch?v=${videoId}`);
      return;
    }
    if (settings.ytBlockShorts) {
      location.replace('https://www.youtube.com/');
    }
  }

  fmGetSettings(redirectIfShorts);

  // ---------------------------------------------------------------------
  // "Blank Homepage" placeholder message
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
    if (existing) return;

    const target =
      document.querySelector('ytd-browse[page-subtype="home"] #primary') ||
      document.querySelector('ytd-browse[page-subtype="home"]');
    if (!target) return;

    const msg = document.createElement('div');
    msg.id = 'fm-blank-homepage-msg';
    msg.textContent = '🔍 Homepage browsing is disabled in Focus Mode — use search to find what you need.';
    msg.style.cssText = 'padding:60px 20px;text-align:center;font-size:16px;opacity:0.7;';
    target.prepend(msg);
  }

  // ---------------------------------------------------------------------
  // Disable Autoplay
  //
  // YouTube's "Autoplay" toggle on the watch page is a button with
  // aria-label starting "Autoplay is on"/"Autoplay is off" — no version-
  // stable class name, so we key entirely off that accessible label. We
  // click it (rather than mutate aria-checked directly) so YouTube's own
  // player state — and its own persisted preference cookie — actually
  // updates, not just the visual toggle.
  // ---------------------------------------------------------------------
  function disableAutoplayIfNeeded() {
    if (!document.documentElement.classList.contains('fm-yt-no-autoplay')) return;
    const toggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]') ||
      document.querySelector('button[aria-label^="Autoplay is on"]');
    if (toggle) toggle.click();
  }

  // ---------------------------------------------------------------------
  // Channel Whitelist
  //
  // Exempts a whitelisted channel's watch pages from related/end-screen
  // hiding and comment blocking. Overriding via inline style with
  // !important works because a style-attribute declaration has higher
  // specificity than any selector, and equal-importance declarations are
  // resolved by specificity within the same origin.
  // ---------------------------------------------------------------------
  function currentChannelName() {
    const el = document.querySelector('ytd-channel-name #text, #owner #channel-name, ytd-video-owner-renderer ytd-channel-name a');
    return el ? el.textContent?.trim() : null;
  }

  function applyChannelWhitelistExemption() {
    fmGetLists(({ ytChannelWhitelist }) => {
      if (!ytChannelWhitelist || !ytChannelWhitelist.length) return;
      const channel = currentChannelName();
      if (!channel) return;
      const isWhitelisted = ytChannelWhitelist.some(
        (name) => name.trim().toLowerCase() === channel.toLowerCase()
      );
      if (!isWhitelisted) return;

      ['#related', 'ytd-watch-next-secondary-results-renderer', '#comments', 'ytd-comments'].forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          el.style.setProperty('display', 'block', 'important');
        });
      });

      let banner = document.getElementById('fm-whitelist-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'fm-whitelist-banner';
        banner.textContent = `✅ "${channel}" is on your Focus Mode whitelist — normal recommendations & comments are shown here.`;
        banner.style.cssText = 'padding:10px 16px;background:#0f5132;color:#d1e7dd;font-size:13px;text-align:center;';
        const target = document.querySelector('#related, ytd-watch-next-secondary-results-renderer');
        if (target) target.prepend(banner);
      }
    });
  }

  // ---------------------------------------------------------------------
  // MutationObserver sweep — Shorts card fallback (for browsers without
  // :has() support), homepage message, autoplay toggle, and whitelist.
  // ---------------------------------------------------------------------
  function sweepNode(node) {
    if (document.documentElement.classList.contains('fm-yt-shorts-block') && node.querySelectorAll) {
      node.querySelectorAll('ytd-reel-shelf-renderer').forEach((el) => {
        el.style.setProperty('display', 'none', 'important');
      });
      node.querySelectorAll('a[href^="/shorts/"]').forEach((a) => {
        const card = a.closest(
          'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer'
        );
        if (card) card.style.setProperty('display', 'none', 'important');
      });
    }
    manageHomepageBlankMessage();
    disableAutoplayIfNeeded();
    applyChannelWhitelistExemption();
  }

  const debouncedSweep = fmDebounce(() => sweepNode(document.body), 150);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) sweepNode(node);
      });
    }
    debouncedSweep();
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
    document.getElementById('fm-whitelist-banner')?.remove();
    fmGetSettings(redirectIfShorts);
    manageHomepageBlankMessage();
  }
  window.addEventListener('yt-navigate-finish', onRouteChange);
  window.addEventListener('popstate', onRouteChange);
})();
