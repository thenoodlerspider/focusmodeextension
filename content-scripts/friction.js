/**
 * friction.js
 * Cross-platform "mindful use" mechanisms that aren't specific to any one
 * site's DOM. Loaded on all five platforms, right after common.js.
 *
 *   1. Scroll-Count Interrupts — after N viewport-heights of scrolling on
 *      a feed, show a full-screen "are you finding value in this?" pause.
 *   2. Intent Sticky Bar — on sites the user has opted in to (YouTube,
 *      Reddit, etc.), ask what they're here for before letting them
 *      browse, then keep that answer pinned at the top of the page.
 *   3. fmIsDirectOpen() — a small helper platform scripts call to decide
 *      whether the current page looks like a direct/shared permalink
 *      (opened from a chat app, not from clicking around the feed) so
 *      they can skip feed-level blocking for that one piece of content
 *      while still hiding its recommended/sidebar chrome.
 *
 * Grayscale and simplified fonts need no JS at all — they're pure CSS,
 * gated by the fm-grayscale / fm-font-simple classes common.js already
 * applies (see css/global.css).
 */

(function () {
  'use strict';

  // =====================================================================
  // 1. Scroll-Count Interrupts
  // =====================================================================
  let viewportsScrolled = 0;
  let lastScrollY = window.scrollY;
  let interruptShowing = false;

  function resetScrollCounter() {
    viewportsScrolled = 0;
    lastScrollY = window.scrollY;
  }

  function onScroll(settings) {
    if (interruptShowing) return;
    const delta = Math.abs(window.scrollY - lastScrollY);
    lastScrollY = window.scrollY;
    if (window.innerHeight <= 0) return;
    viewportsScrolled += delta / window.innerHeight;

    if (viewportsScrolled >= settings.scrollInterruptViewports) {
      showScrollInterrupt();
    }
  }

  function showScrollInterrupt() {
    interruptShowing = true;
    let seconds = 8;
    const countdownNode = document.createElement('p');
    countdownNode.className = 'fm-overlay-countdown';
    countdownNode.textContent = `You can continue in ${seconds}s…`;

    const overlay = fmShowOverlay({
      id: 'fm-scroll-interrupt',
      title: '👀 Are you finding value in this?',
      message: "You've scrolled a long way. Take a breath before you keep going.",
      extraNode: countdownNode,
      buttons: [
        {
          label: 'Keep scrolling',
          primary: true,
          disabled: true,
          onClick: (el) => {
            fmRemoveOverlay('fm-scroll-interrupt');
            interruptShowing = false;
            resetScrollCounter();
          }
        },
        {
          label: "I'm done — close tab",
          onClick: () => window.close()
        }
      ]
    });

    const continueBtn = overlay.querySelector('.fm-overlay-btn-primary');
    const tick = setInterval(() => {
      seconds -= 1;
      if (!document.getElementById('fm-scroll-interrupt')) {
        clearInterval(tick);
        return;
      }
      if (seconds <= 0) {
        countdownNode.textContent = 'You can continue now.';
        if (continueBtn) continueBtn.disabled = false;
        clearInterval(tick);
      } else {
        countdownNode.textContent = `You can continue in ${seconds}s…`;
      }
    }, 1000);
  }

  const debouncedScrollCheck = fmDebounce((settings) => onScroll(settings), 150);

  fmGetSettings((settings) => {
    if (!settings.scrollInterruptEnabled) return;
    window.addEventListener('scroll', () => {
      // Re-read settings each time is wasteful; cache once per page load
      // and let storage.onChanged below refresh it on toggle changes.
      debouncedScrollCheck(settings);
    }, { passive: true });
  });

  // =====================================================================
  // 2. Intent Sticky Bar
  // =====================================================================
  const FM_INTENT_KEY = 'fmIntentText';

  function shouldShowIntentBar(settings) {
    const domain = fmDomainKey();
    if (!domain) return false;
    return !!settings.intentBarEnabled && !!(settings.intentBarSites || {})[domain];
  }

  function renderIntentBanner(text) {
    let banner = document.getElementById('fm-intent-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'fm-intent-banner';
      (document.body || document.documentElement).prepend(banner);
    }
    banner.textContent = `🎯 ${text}`;
  }

  function promptForIntent() {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fm-overlay-input';
    input.placeholder = 'e.g. "Watching a FreeRADIUS tutorial"';

    const overlay = fmShowOverlay({
      id: 'fm-intent-gate',
      title: '🎯 What are you here for?',
      message: "Naming your reason for opening this site makes it a lot harder to slide into autopilot scrolling.",
      extraNode: input,
      buttons: [
        {
          label: 'Start browsing',
          primary: true,
          onClick: () => {
            const text = input.value.trim();
            if (!text) { input.focus(); return; }
            sessionStorage.setItem(FM_INTENT_KEY, text);
            fmRemoveOverlay('fm-intent-gate');
            renderIntentBanner(text);
          }
        }
      ]
    });
    setTimeout(() => input.focus(), 50);
  }

  fmGetSettings((settings) => {
    if (!shouldShowIntentBar(settings)) return;
    const existingIntent = sessionStorage.getItem(FM_INTENT_KEY);
    if (existingIntent) {
      renderIntentBanner(existingIntent);
    } else {
      const start = () => promptForIntent();
      if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    }
  });

  // =====================================================================
  // 3. Direct-link whitelisting helper
  //
  // Heuristic: a page is a "direct open" when either (a) there's no
  // referrer at all (typed URL, or opened from a native app/chat client
  // that strips referrers), or (b) the referrer is a different origin
  // entirely (e.g. a messaging app's in-app browser or a link preview).
  // A referrer from the *same* platform means the user navigated there by
  // clicking around inside the feed — that's exactly the browsing
  // platform scripts should keep blocking.
  // =====================================================================
  window.fmIsDirectOpen = function fmIsDirectOpen() {
    if (!document.referrer) return true;
    try {
      const refHost = new URL(document.referrer).hostname;
      return refHost !== location.hostname;
    } catch (e) {
      return true;
    }
  };
})();
