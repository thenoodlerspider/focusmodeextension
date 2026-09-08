# Focus Mode — Anti-Doomscroll (Firefox MV3)

Blocks infinite-scroll / short-form video traps on Instagram, YouTube, and Twitter/X.

**v1.1** adds: Instagram comment blocking, YouTube comment blocking, forced
"Following" feed + Suggested/Sponsored post hiding on Instagram, YouTube
end-screen recommendation hiding, an optional YouTube "Blank Homepage"
(search-only) mode, and Instagram Stories tray hiding. No new files or
permissions were needed — everything builds on the existing
`manifest.json`, `background.js`, and per-platform content scripts/CSS.

## File structure

```
focus-mode-extension/
├── manifest.json
├── background.js                 # webNavigation-based redirects, default settings
├── content-scripts/
│   ├── common.js                 # storage helpers, class-toggle, debounce
│   ├── instagram.js
│   ├── youtube.js
│   └── twitter.js
├── css/
│   ├── instagram.css
│   ├── youtube.css
│   └── twitter.css
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── icons/
    └── icon.svg
```

## How it works

- **CSS-first hiding.** Each platform's stylesheet is injected at
  `document_start` and hides elements via attribute selectors (e.g.
  `a[href^="/shorts/"]`), gated behind a flag class on `<html>`
  (`fm-ig-block`, `fm-yt-shorts-block`, `fm-yt-focus`, `fm-tw-focus`). Because
  `<html>` exists before the rest of the DOM is parsed, there's no flash of
  the blocked UI.
- **MutationObservers** in each content script act as a fallback sweep for
  elements that don't have a stable CSS-only selector (obfuscated class
  names, text-only labels), and are debounced to avoid perf issues on
  React-heavy pages like Twitter/X.
- **Redirects** are handled in `background.js` via `webNavigation`:
  - `onBeforeNavigate` catches hard loads / typed URLs / clicked links.
  - `onHistoryStateUpdated` catches SPA client-side routing (`pushState`),
    which is how Instagram/YouTube move between "pages" without a real
    navigation event.
  Content scripts also fire an immediate `location.replace()` as a faster
  client-side first line of defense while the background script's async
  storage lookup resolves.
- **Settings** live in `browser.storage.local` and are read by both the
  background script and every content script; the popup writes to the same
  store, and content scripts pick up changes live via
  `browser.storage.onChanged` (no reload needed for CSS-based hiding — a
  reload is only needed to fully reset JS-driven state like the Twitter tab
  click or an in-progress Shorts page).

## Toggles (in the popup)

| Toggle | Effect |
|---|---|
| Block Reels & Explore (Instagram) | Hides the nav links; redirects `/reels/*` and `/explore/*` to the feed |
| Force "Following" Feed & Hide Suggested Posts (Instagram) | Redirects Instagram's home route to `?variant=following` every time it's opened; also hides posts whose `<article>` contains "Suggested for you" or "Sponsored" |
| Hide Stories Tray (Instagram) | Hides the horizontal Stories tray at the top of the feed |
| Block Shorts (YouTube) | Hides the sidebar entry + Shorts shelves; redirects `/shorts/*` to the homepage |
| Focus Mode (YouTube) | Hides the related-videos sidebar on watch pages **and** the end-screen recommendation overlay when a video finishes |
| Blank Homepage / Search Only (YouTube) | Hides the entire homepage video grid, leaving a small "use search" message. **Off by default** — it's the most aggressive toggle. Only affects `/` (homepage); Search, Subscriptions, and Watch pages are untouched |
| Block Comments (YouTube & Instagram) | One switch, two platforms: hides `#comments`/`ytd-comments` on YouTube, and comment lists + comment input forms (incl. inside the post modal) on Instagram |
| Focus Mode (Twitter/X) | Hides "For You", auto-selects "Following"; hides the Trending module |

### Notes on the new Instagram heuristics

**Force "Following" Feed** redirects Instagram's home route
(`instagram.com/`) to `instagram.com/?variant=following`, the query param
Instagram itself recognizes for a chronological/Following-only feed. This
is handled in two places, mirroring how the Reels/Explore block works:
`background.js` redirects both hard page loads (`onBeforeNavigate`) and
SPA-style navigation like clicking the Home icon (`onHistoryStateUpdated`);
`instagram.js` does the same check client-side via `location.replace()` as
a faster first line of defense, and additionally re-checks on every
`pushState`/`replaceState`/`popstate` since Instagram's Home icon can
strip the query param without ever changing the pathname. Both checks are
idempotent — once `?variant=following` is present, `needsFollowingRedirect()`
returns `false`, so there's no redirect loop.

**Suggested/Sponsored hiding** and **Stories tray hiding** remain separate,
JS-only heuristics (`sweepSuggestedAndAds()` and `sweepStories()` in
`instagram.js`) that run regardless of the feed variant, since Instagram
can still surface suggested/sponsored content inside the Following feed —
see the comments at the top of `css/instagram.css` for why these can't be
pure CSS.

## Loading as a temporary add-on in Firefox

1. Open Firefox and go to `about:debugging`.
2. Click **"This Firefox"** in the left sidebar.
3. Click **"Load Temporary Add-on…"**.
4. Navigate into the `focus-mode-extension/` folder and select the
   **`manifest.json`** file (not a zip — Firefox wants the raw file for
   temporary loading).
5. The extension icon should appear in the toolbar. Click it to see the
   toggle popup; all toggles default to **on**.
6. Visit `instagram.com`, `youtube.com`, or `x.com`/`twitter.com` to test.

**Note:** Temporary add-ons are removed when Firefox restarts. For anything
persistent, package it (`web-ext build`) and install it as a signed/unsigned
add-on, or use `about:config` → `xpinstall.signatures.required = false` on
Firefox Developer/Nightly to load an unsigned `.xpi` permanently.

## Known limitations / things that may need tweaking over time

- Instagram and X/Twitter frequently rotate DOM structure and class names.
  The selectors here target the most stable anchors available (hrefs,
  `aria-label`, tab text) but may need updates if those platforms change
  their markup.
- The `:has()` CSS selectors in `css/youtube.css` need Firefox 121+; older
  Firefox versions fall back to the JS-based sweep in `youtube.js`.
- Twitter/X's "For You"/"Following" tabs have no stable `data-testid`, so
  that feature is JS-driven (text match + `.click()`) rather than pure CSS.
- If a platform A/B-tests a different nav layout, some elements may briefly
  reappear until the MutationObserver sweep catches them (typically <200ms).
