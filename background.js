/**
 * background.js
 * Centralizes the actual redirects using the webNavigation API:
 *   - onBeforeNavigate:     catches hard page loads / typed URLs / links.
 *   - onHistoryStateUpdated: catches SPA client-side routing (pushState),
 *                            which is how Instagram and YouTube move between
 *                            "pages" without a real navigation event.
 *
 * The content scripts also do an immediate client-side location.replace()
 * as a fast first line of defense (so there's no flash of blocked content
 * while the background script's async storage lookup resolves), but the
 * background script is the authoritative, tab-reliable mechanism — it works
 * even if a content script hasn't injected yet.
 */

const FM_DEFAULTS = {
  // existing
  igBlock: true,
  ytBlockShorts: true,
  ytFocusMode: true,
  twitterFocusMode: true,
  // new — kept in sync with content-scripts/common.js's FM_DEFAULTS
  igFollowingFeed: true,
  igHideStories: true,
  ytHideHomepage: false,
  blockComments: true
};

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await browser.storage.local.set(FM_DEFAULTS);
  }
});

function isBlockedInstagramPath(pathname) {
  return /^\/reels\/?/.test(pathname) || /^\/explore\/?/.test(pathname);
}

// NEW: true when the URL is Instagram's home route but is missing the
// ?variant=following param that switches the feed to Following-only.
// Checking searchParams (not just a raw string match) means we don't
// re-redirect once the param is already present — no redirect loop.
function needsFollowingRedirect(url) {
  const isHomeRoute = url.pathname === '/' || url.pathname === '';
  const alreadyFollowing = url.searchParams.get('variant') === 'following';
  return isHomeRoute && !alreadyFollowing;
}

function isBlockedYouTubeShortsPath(pathname) {
  return /^\/shorts\//.test(pathname);
}

async function handleNavigation(details) {
  // Ignore iframes/subframes — we only care about top-level tab navigation.
  if (details.frameId !== 0) return;

  let url;
  try {
    url = new URL(details.url);
  } catch (e) {
    return;
  }

  const settings = await browser.storage.local.get(FM_DEFAULTS);

  if (/(^|\.)instagram\.com$/.test(url.hostname)) {
    if (settings.igBlock && isBlockedInstagramPath(url.pathname)) {
      browser.tabs.update(details.tabId, { url: 'https://www.instagram.com/' });
      return;
    }
    // NEW: force the Following feed every time Instagram's home route is
    // opened — covers hard loads (onBeforeNavigate) and the SPA "Home"
    // icon click (onHistoryStateUpdated) alike.
    if (settings.igFollowingFeed && needsFollowingRedirect(url)) {
      browser.tabs.update(details.tabId, { url: 'https://www.instagram.com/?variant=following' });
      return;
    }
  }

  if (/(^|\.)youtube\.com$/.test(url.hostname) && settings.ytBlockShorts) {
    if (isBlockedYouTubeShortsPath(url.pathname)) {
      browser.tabs.update(details.tabId, { url: 'https://www.youtube.com/' });
      return;
    }
  }
}

browser.webNavigation.onBeforeNavigate.addListener(handleNavigation);
browser.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
