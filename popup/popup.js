/**
 * popup.js
 * Reads current settings from browser.storage.local into the toggle
 * switches, and writes back immediately whenever one is flipped.
 * Content scripts pick up changes live via browser.storage.onChanged,
 * but a full effect on an already-open tab (e.g. a Shorts redirect firing,
 * or a hidden nav item re-appearing) needs that tab reloaded — hence the
 * footer note in popup.html.
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

const checkboxes = document.querySelectorAll('input[type="checkbox"][data-key]');

async function loadSettings() {
  const settings = await browser.storage.local.get(FM_DEFAULTS);
  checkboxes.forEach((cb) => {
    cb.checked = !!settings[cb.dataset.key];
  });
}

checkboxes.forEach((cb) => {
  cb.addEventListener('change', async () => {
    await browser.storage.local.set({ [cb.dataset.key]: cb.checked });
  });
});

loadSettings();
