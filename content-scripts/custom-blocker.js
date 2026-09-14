/**
 * custom-blocker.js
 * Applies the user's own "hide this element" rules — created via the
 * element picker (see element-picker.js + options/options.js) — on top
 * of everything else Focus Mode does.
 *
 * This file is loaded two ways:
 *   1. Statically, on the five built-in platforms (declared in
 *      manifest.json's content_scripts), so custom rules "just work"
 *      alongside the built-in ones with no extra permission prompt.
 *   2. Dynamically, via browser.scripting.registerContentScripts, for
 *      any *other* domain the user has picked an element on — background.js
 *      registers this same file against that domain once the optional
 *      host permission is granted. Either way the logic below is
 *      identical: read the rules for this hostname, apply them, keep
 *      applying them as the page mutates.
 */

(function () {
  'use strict';

  function rulesForThisHost(rules) {
    return (rules || []).filter((r) => r.enabled !== false && location.hostname.endsWith(r.hostname));
  }

  function applyRules(rules) {
    const active = rulesForThisHost(rules);
    active.forEach((rule) => {
      let matches;
      try {
        matches = document.querySelectorAll(rule.selector);
      } catch (e) {
        return; // a stale/invalid selector shouldn't break the page
      }
      matches.forEach((el) => el.style.setProperty('display', 'none', 'important'));
    });
  }

  function refresh() {
    browser.storage.local.get({ fmCustomRules: [] }).then((data) => applyRules(data.fmCustomRules));
  }

  refresh();

  const debouncedRefresh = (typeof fmDebounce === 'function') ? fmDebounce(refresh, 300) : refresh;
  const observer = new MutationObserver(() => debouncedRefresh());

  function start() {
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fmCustomRules) refresh();
  });
})();
