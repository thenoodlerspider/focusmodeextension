# Focus Mode — Anti-Doomscroll (Firefox MV3)

A Firefox extension that blocks infinite-scroll and short-form video traps
across Instagram, YouTube, Twitter/X, Reddit, and LinkedIn — with schedules,
daily time budgets, and a set of mindful-use nudges on top.

## Features

### Global & Utility
- **Master switch** — disable/enable every rule at once without losing individual settings.
- **Focus Timer / Schedule** — auto-enable focus rules during set hours/days.
- **Pomodoro timer** — start a session from the popup; rules stay on for its duration regardless of the master switch.
- **Strict Mode** — adds a configurable delay *or* a typed motivation phrase before any protection can be turned off (including Strict Mode itself).
- **Daily Time Budget** — cap daily minutes per site; the tab is blocked once the budget's spent.
- **Scroll-Count Interrupts** — an 8-second "are you finding value in this?" pause after N screens of scrolling.
- **Grayscale & simplified fonts** — strip color and polish from feeds.
- **Intent Sticky Bar** — ask what you're here for before browsing YouTube/Reddit/etc., then pin the answer at the top of the page.
- **Direct-link handling** — links shared from chats aren't treated the same as feed browsing.
- **Custom Domain & Element Blocker** — a click-to-hide picker for any element on any site, uBlock-style.
- **Import / Export** — back up or transfer your settings as JSON.
- **Firefox Sync** — mirror your settings across devices signed into the same Firefox Account.

### Instagram
Block Reels & Explore, force the chronological Following feed, hide suggested/sponsored posts, the Stories tray, vanity metrics, and notification badges; cap the feed at N posts behind a manual "Show more"; optional smart-redirect straight to the inbox.

### YouTube
Block Shorts (or rewrite them to standard video links), disable autoplay, hide the notification badge, vanity metrics/dates, Trending & Live tabs, related videos, and end-screen recommendations; blank/search-only homepage; per-channel whitelist to exempt educational channels from focus rules; optional smart-redirect straight to Subscriptions.

### Twitter / X
Following-only feed, hidden metrics (likes/retweets/replies/views), hidden sidebar widgets (Trends, Who to follow, Premium upsells), hidden notification badges, optional smart-redirect straight to Messages.

### Reddit
Block r/all and r/popular, blank the home feed (search & direct subreddit links still work), block the immersive video/shorts feed.

### LinkedIn
Blank the news feed (Jobs, Messaging & Search stay active), hide the "LinkedIn News" sidebar module.

---

## How to Load in Firefox

1. Open Firefox and navigate to `about:debugging`.
2. Click **This Firefox** in the left sidebar.
3. Click **Load Temporary Add-on…**.
4. Navigate into your `focus-mode-extension/` folder and select **`manifest.json`**.
5. Click the toolbar icon for quick controls (master switch, Pomodoro, element picker), or click **Open full settings** for everything else.

*(Note: Temporary add-ons reset when Firefox restarts.)*

## Notes on how a few features work

- **Daily budgets** are tracked by a background alarm that samples the
  currently-focused, active tab once a minute — so budgets track actual
  attention, not just an open tab sitting in the background.
- **The element picker** uses the `activeTab` permission for the tab you
  invoke it from. For domains outside the five built-in platforms, picking
  an element requests a one-time, domain-scoped host permission so the
  rule can keep applying on future visits to that same site.
- **Strict Mode** guards every toggle on the settings page, including its
  own — turning it off requires the same delay/phrase challenge as
  anything else, closing the obvious "just disable Strict Mode first"
  loophole.
