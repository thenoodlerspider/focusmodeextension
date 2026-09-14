/**
 * options.js
 * Wires every control on the full settings page. FM_DEFAULTS / FM_LIST_DEFAULTS
 * and fmGetSettings/fmGetLists come from content-scripts/common.js, loaded
 * first in options.html — one less place to keep the settings shape in sync.
 *
 * Sections:
 *   1. Generic boolean toggle binding (data-key checkboxes), gated by
 *      Strict Mode's unlock challenge when turning a protection OFF.
 *   2. Small standalone controls: delay/challenge config, schedule,
 *      Pomodoro length, budgets, scroll-interrupt count, intent-bar
 *      sites, channel whitelist.
 *   3. Custom element-block rules table (works with element-picker.js +
 *      background.js's message handling).
 *   4. Import / Export.
 *   5. Firefox Sync mirroring.
 */

const DOMAINS = ['instagram', 'youtube', 'twitter', 'reddit', 'linkedin'];
const DOMAIN_LABELS = { instagram: 'Instagram', youtube: 'YouTube', twitter: 'Twitter / X', reddit: 'Reddit', linkedin: 'LinkedIn' };
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------
// 1. Generic boolean toggle binding + Strict Mode unlock challenge
// ---------------------------------------------------------------------
function showUnlockModal(settings) {
  return new Promise((resolve) => {
    const root = document.getElementById('unlockModalRoot');
    const backdrop = document.createElement('div');
    backdrop.className = 'fm-modal-backdrop';

    const card = document.createElement('div');
    card.className = 'fm-modal-card';

    const title = document.createElement('h3');
    title.textContent = '🔒 Strict Mode is on';
    card.appendChild(title);

    const msg = document.createElement('p');
    card.appendChild(msg);

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Turn off';
    confirmBtn.disabled = true;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'secondary';
    cancelBtn.style.marginLeft = '8px';

    function finish(result) {
      backdrop.remove();
      resolve(result);
    }
    confirmBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));

    if (settings.unlockChallengeType === 'phrase') {
      msg.textContent = `Type the phrase below exactly to confirm:  "${settings.unlockPhrase}"`;
      const input = document.createElement('input');
      input.type = 'text';
      input.addEventListener('input', () => {
        confirmBtn.disabled = input.value.trim() !== settings.unlockPhrase.trim();
      });
      card.insertBefore(input, confirmBtn);
      setTimeout(() => input.focus(), 30);
    } else {
      let seconds = settings.strictModeDelaySeconds || 10;
      msg.textContent = `You can turn this off in ${seconds}s…`;
      const tick = setInterval(() => {
        seconds -= 1;
        if (!document.body.contains(backdrop)) { clearInterval(tick); return; }
        if (seconds <= 0) {
          msg.textContent = 'You can turn this off now.';
          confirmBtn.disabled = false;
          clearInterval(tick);
        } else {
          msg.textContent = `You can turn this off in ${seconds}s…`;
        }
      }, 1000);
    }

    card.appendChild(confirmBtn);
    card.appendChild(cancelBtn);
    backdrop.appendChild(card);
    root.appendChild(backdrop);
  });
}

function bindToggle(checkbox) {
  checkbox.addEventListener('change', async () => {
    const key = checkbox.dataset.key;
    const turningOff = checkbox.checked === false;

    if (turningOff) {
      const settings = await new Promise((r) => fmGetSettings(r));
      if (settings.strictMode) {
        checkbox.checked = true; // hold the visual state until confirmed
        const confirmed = await showUnlockModal(settings);
        if (!confirmed) return;
        checkbox.checked = false;
      }
    }
    await browser.storage.local.set({ [key]: checkbox.checked });
  });
}

function loadToggles(settings) {
  document.querySelectorAll('input[type="checkbox"][data-key]').forEach((cb) => {
    cb.checked = !!settings[cb.dataset.key];
  });
}

// ---------------------------------------------------------------------
// 2. Standalone controls
// ---------------------------------------------------------------------
function bindNumberOrText(id, key, parse = (v) => v) {
  const el = document.getElementById(id);
  el.addEventListener('change', () => browser.storage.local.set({ [key]: parse(el.value) }));
}

function loadStandaloneControls(settings) {
  document.getElementById('strictModeDelaySeconds').value = settings.strictModeDelaySeconds;
  document.getElementById('unlockChallengeType').value = settings.unlockChallengeType;
  document.getElementById('unlockPhrase').value = settings.unlockPhrase;
  document.getElementById('scheduleStart').value = settings.scheduleStart;
  document.getElementById('scheduleEnd').value = settings.scheduleEnd;
  document.getElementById('pomodoroDurationMinutes').value = settings.pomodoroDurationMinutes;
  document.getElementById('scrollInterruptViewports').value = settings.scrollInterruptViewports;
  document.getElementById('igFeedPostLimit').value = settings.igFeedPostLimit;

  renderScheduleDays(settings.scheduleDays);
  renderIntentBarSites(settings.intentBarSites);
}

function renderScheduleDays(activeDays) {
  const container = document.getElementById('scheduleDays');
  container.innerHTML = '';
  DAY_LABELS.forEach((label, i) => {
    const chip = document.createElement('label');
    chip.className = 'day-chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = activeDays.includes(i);
    input.addEventListener('change', async () => {
      const { scheduleDays } = await browser.storage.local.get({ scheduleDays: [] });
      const set = new Set(scheduleDays);
      if (input.checked) set.add(i); else set.delete(i);
      await browser.storage.local.set({ scheduleDays: Array.from(set).sort() });
    });
    chip.appendChild(input);
    chip.appendChild(document.createTextNode(label));
    container.appendChild(chip);
  });
}

function renderIntentBarSites(sites) {
  const container = document.getElementById('intentBarSites');
  container.innerHTML = '';
  DOMAINS.forEach((domain) => {
    const chip = document.createElement('label');
    chip.className = 'day-chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!sites[domain];
    input.addEventListener('change', async () => {
      const { intentBarSites } = await browser.storage.local.get({ intentBarSites: {} });
      intentBarSites[domain] = input.checked;
      await browser.storage.local.set({ intentBarSites });
    });
    chip.appendChild(input);
    chip.appendChild(document.createTextNode(DOMAIN_LABELS[domain]));
    container.appendChild(chip);
  });
}

function renderBudgetRows(budgets) {
  const container = document.getElementById('budgetRows');
  container.innerHTML = '';
  DOMAINS.forEach((domain) => {
    const row = document.createElement('div');
    row.className = 'budget-row';
    const label = document.createElement('span');
    label.textContent = DOMAIN_LABELS[domain];
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.placeholder = 'No limit';
    input.value = budgets[domain] || '';
    input.addEventListener('change', async () => {
      const { fmBudgets } = await browser.storage.local.get({ fmBudgets: {} });
      const minutes = Number(input.value) || 0;
      if (minutes > 0) fmBudgets[domain] = minutes; else delete fmBudgets[domain];
      await browser.storage.local.set({ fmBudgets });
    });
    row.appendChild(label);
    row.appendChild(input);
    container.appendChild(row);
  });
}

function loadChannelWhitelist(list) {
  document.getElementById('ytChannelWhitelist').value = (list || []).join('\n');
}

function bindChannelWhitelist() {
  const el = document.getElementById('ytChannelWhitelist');
  el.addEventListener('change', () => {
    const list = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    browser.storage.local.set({ ytChannelWhitelist: list });
  });
}

// ---------------------------------------------------------------------
// 3. Custom element-block rules table
// ---------------------------------------------------------------------
function renderRulesTable(rules) {
  const tbody = document.querySelector('#customRulesTable tbody');
  tbody.innerHTML = '';
  if (!rules.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'hint';
    td.textContent = 'No custom rules yet — use the picker above.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rules.forEach((rule, index) => {
    const tr = document.createElement('tr');

    const hostTd = document.createElement('td');
    hostTd.textContent = rule.hostname;
    tr.appendChild(hostTd);

    const selTd = document.createElement('td');
    selTd.className = 'selector-cell';
    selTd.textContent = rule.selector;
    tr.appendChild(selTd);

    const onTd = document.createElement('td');
    const onInput = document.createElement('input');
    onInput.type = 'checkbox';
    onInput.checked = rule.enabled !== false;
    onInput.addEventListener('change', async () => {
      const { fmCustomRules } = await browser.storage.local.get({ fmCustomRules: [] });
      fmCustomRules[index].enabled = onInput.checked;
      await browser.storage.local.set({ fmCustomRules });
    });
    onTd.appendChild(onInput);
    tr.appendChild(onTd);

    const delTd = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'link-btn';
    delBtn.textContent = 'Remove';
    delBtn.addEventListener('click', async () => {
      const { fmCustomRules } = await browser.storage.local.get({ fmCustomRules: [] });
      fmCustomRules.splice(index, 1);
      await browser.storage.local.set({ fmCustomRules });
    });
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    tbody.appendChild(tr);
  });
}

document.getElementById('pickElement').addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'fm-start-picker' });
});

// ---------------------------------------------------------------------
// 4. Import / Export
// ---------------------------------------------------------------------
document.getElementById('exportSettings').addEventListener('click', async () => {
  const all = await browser.storage.local.get(null);
  delete all.fmUsageState; // machine/day-specific, not a "setting"
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'focus-mode-settings.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importSettings').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const status = document.getElementById('importStatus');
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    await browser.storage.local.set(parsed);
    status.textContent = '✅ Settings imported. Reload this page to see them applied.';
  } catch (err) {
    status.textContent = '⚠️ Could not import that file — make sure it\'s a Focus Mode export.';
  }
  e.target.value = '';
});

// ---------------------------------------------------------------------
// 5. Firefox Sync mirroring
//
// A single bundled key keeps this well under storage.sync's per-item and
// total quotas, and avoids many small sync writes. Custom rules and daily
// usage are deliberately excluded — the former is often site-list-heavy
// and machine-specific in practice, the latter is per-day/per-device by
// definition.
// ---------------------------------------------------------------------
const SYNC_KEY = 'fmSyncBlob';
let lastPushedJSON = null;

function buildSyncPayload(settings, lists) {
  const payload = { ...settings };
  delete payload.fmPomodoro; // runtime state, not a setting
  payload.ytChannelWhitelist = lists.ytChannelWhitelist;
  payload.fmBudgets = lists.fmBudgets;
  return payload;
}

async function pushToSync() {
  const settings = await new Promise((r) => fmGetSettings(r));
  if (!settings.syncEnabled) return;
  const lists = await new Promise((r) => fmGetLists(r));
  const payload = buildSyncPayload(settings, lists);
  const json = JSON.stringify(payload);
  if (json === lastPushedJSON) return; // avoid redundant writes / ping-pong with the pull below
  lastPushedJSON = json;
  await browser.storage.sync.set({ [SYNC_KEY]: payload });
}

async function pullFromSync() {
  const { [SYNC_KEY]: payload } = await browser.storage.sync.get(SYNC_KEY);
  if (!payload) return;
  lastPushedJSON = JSON.stringify(payload);
  await browser.storage.local.set(payload);
  location.reload(); // simplest way to re-render every control consistently
}

document.querySelector('input[data-key="syncEnabled"]').addEventListener('change', async (e) => {
  if (e.target.checked) await pushToSync();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') pushToSync();
  if (area === 'sync' && changes[SYNC_KEY]) pullFromSync();
});

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
async function init() {
  const settings = await new Promise((r) => fmGetSettings(r));
  const lists = await new Promise((r) => fmGetLists(r));

  loadToggles(settings);
  loadStandaloneControls(settings);
  renderBudgetRows(lists.fmBudgets);
  loadChannelWhitelist(lists.ytChannelWhitelist);
  renderRulesTable(lists.fmCustomRules);

  document.querySelectorAll('input[type="checkbox"][data-key]').forEach(bindToggle);
  bindNumberOrText('strictModeDelaySeconds', 'strictModeDelaySeconds', Number);
  bindNumberOrText('unlockChallengeType', 'unlockChallengeType');
  bindNumberOrText('unlockPhrase', 'unlockPhrase');
  bindNumberOrText('scheduleStart', 'scheduleStart');
  bindNumberOrText('scheduleEnd', 'scheduleEnd');
  bindNumberOrText('pomodoroDurationMinutes', 'pomodoroDurationMinutes', Number);
  bindNumberOrText('scrollInterruptViewports', 'scrollInterruptViewports', Number);
  bindNumberOrText('igFeedPostLimit', 'igFeedPostLimit', Number);
  bindChannelWhitelist();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.fmCustomRules) renderRulesTable(changes.fmCustomRules.newValue || []);
  });
}

init();
