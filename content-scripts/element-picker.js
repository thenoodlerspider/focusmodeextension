/**
 * element-picker.js
 * A minimal, uBlock-style "click to hide" tool. NOT a static content
 * script — background.js injects this on demand (via
 * browser.scripting.executeScript, using the activeTab permission
 * granted by the user's click in the popup) when "Pick element to
 * block" is pressed. Runs once, cleans up after itself.
 *
 * Flow: highlight whatever's under the cursor -> on click, freeze that
 * choice -> build a reasonably-stable CSS selector for it -> send it to
 * background.js to store as a custom rule (and, for domains outside the
 * five built-in platforms, to request the extra host permission needed
 * to keep applying it on future visits).
 */

(function () {
  'use strict';

  // Guard against double-injection if the user clicks the button twice.
  if (window.__fmPickerActive) return;
  window.__fmPickerActive = true;

  const highlight = document.createElement('div');
  highlight.id = 'fm-picker-highlight';
  document.documentElement.appendChild(highlight);

  const hint = document.createElement('div');
  hint.id = 'fm-picker-hint';
  hint.textContent = 'Click an element to hide it on this site. Press Esc to cancel.';
  document.documentElement.appendChild(hint);

  let hovered = null;

  function moveHighlightTo(el) {
    const r = el.getBoundingClientRect();
    highlight.style.top = `${r.top + window.scrollY}px`;
    highlight.style.left = `${r.left + window.scrollX}px`;
    highlight.style.width = `${r.width}px`;
    highlight.style.height = `${r.height}px`;
  }

  function buildSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;

    // Prefer a couple of stable-looking classes over the full class list
    // (frameworks often add layout/utility classes that shift constantly).
    const stableClasses = Array.from(el.classList).filter((c) => c.length > 2).slice(0, 2);
    if (stableClasses.length) {
      const sel = el.tagName.toLowerCase() + stableClasses.map((c) => `.${CSS.escape(c)}`).join('');
      if (document.querySelectorAll(sel).length <= 20) return sel;
    }

    // Fall back to a short nth-child path from the nearest ancestor with
    // an id, or from <body> if none exists — good enough to be reusable
    // without being so specific it breaks on every re-render.
    const parts = [];
    let node = el;
    for (let depth = 0; depth < 4 && node && node.nodeType === 1; depth++) {
      if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
      const parent = node.parentElement;
      if (!parent) { parts.unshift(node.tagName.toLowerCase()); break; }
      const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      const index = siblings.indexOf(node) + 1;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
      node = parent;
    }
    return parts.join(' > ');
  }

  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    highlight.remove();
    hint.remove();
    window.__fmPickerActive = false;
  }

  function onMouseMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hovered || el === highlight || el === hint) return;
    hovered = el;
    moveHighlightTo(el);
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!hovered) return cleanup();

    const selector = buildSelector(hovered);
    hovered.style.setProperty('display', 'none', 'important');
    browser.runtime.sendMessage({
      type: 'fm-add-custom-rule',
      hostname: location.hostname,
      selector
    });
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') cleanup();
  }

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
})();
