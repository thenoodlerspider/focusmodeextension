/**
 * linkedin.js
 *
 *   - Blank News Feed: hides the main feed wall (mostly CSS, see
 *     linkedin.css) and drops in a placeholder message + a direct link to
 *     Jobs, so the page doesn't look broken. Jobs, Messaging, and Search
 *     are untouched — this only ever targets the feed route.
 *   - Hide "LinkedIn News" Sidebar: matched by heading text, since the
 *     module's wrapper class name has changed across redesigns.
 */

(function () {
  'use strict';

  function isFeedRoute() {
    return /^\/(feed\/?)?$/.test(location.pathname);
  }

  function manageFeedBlankMessage() {
    const existing = document.getElementById('fm-li-blank-feed-msg');
    const shouldShow = document.documentElement.classList.contains('fm-li-blank-feed') && isFeedRoute();

    if (!shouldShow) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    const main = document.querySelector('main.scaffold-layout__main');
    if (!main) return;

    const msg = document.createElement('div');
    msg.id = 'fm-li-blank-feed-msg';
    msg.style.cssText = 'padding:60px 20px;text-align:center;font-size:16px;opacity:0.7;';
    msg.textContent = '🔍 The LinkedIn feed is disabled in Focus Mode — use Search or Jobs to find what you need.';
    main.prepend(msg);
  }

  const NEWS_PATTERN = /linkedin news/i;
  function hideNewsSidebar(root) {
    if (!document.documentElement.classList.contains('fm-li-hide-news')) return;
    if (!root.querySelectorAll) return;
    root.querySelectorAll('h2, h3, header').forEach((h) => {
      const text = h.textContent?.trim();
      if (text && NEWS_PATTERN.test(text)) {
        const container = h.closest('section, aside, div[class*="news"]') || h.parentElement;
        if (container) container.style.setProperty('display', 'none', 'important');
      }
    });
  }

  function sweep(root) {
    manageFeedBlankMessage();
    hideNewsSidebar(root);
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

  let lastHref = location.href;
  function onRouteChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    manageFeedBlankMessage();
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
