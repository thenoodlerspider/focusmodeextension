/**
 * popup.js
 * Quick-access controls only: the master switch, Pomodoro start/stop,
 * today's per-site usage, and the element picker trigger. Everything
 * else (per-platform toggles, schedule, budgets, whitelist, custom
 * rules, import/export, sync) lives in options/options.js — there's too
 * much of it now to fit in a popup usefully.
 */

const DOMAIN_LABELS = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  twitter: 'Twitter / X',
  reddit: 'Reddit',
  linkedin: 'LinkedIn'
};

const masterCheckbox = document.getElementById('fmMasterEnabled');
const pomodoroIdle = document.getElementById('pomodoroIdle');
const pomodoroActiveEl = document.getElementById('pomodoroActive');
const pomodoroCountdown = document.getElementById('pomodoroCountdown');
const pomodoroDurationSelect = document.getElementById('pomodoroDuration');

async function loadMasterSwitch() {
  const { fmMasterEnabled } = await browser.storage.local.get({ fmMasterEnabled: true });
  masterCheckbox.checked = fmMasterEnabled;
}

masterCheckbox.addEventListener('change', async () => {
  await browser.storage.local.set({ fmMasterEnabled: masterCheckbox.checked });
});

// --- Pomodoro ---
let countdownTimer = null;

function formatMMSS(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function renderPomodoro() {
  const { fmPomodoro } = await browser.storage.local.get({ fmPomodoro: { active: false, endsAt: 0 } });
  const active = fmPomodoro.active && fmPomodoro.endsAt > Date.now();

  pomodoroIdle.classList.toggle('hidden', active);
  pomodoroActiveEl.classList.toggle('hidden', !active);

  clearInterval(countdownTimer);
  if (active) {
    const tick = () => {
      const remaining = fmPomodoro.endsAt - Date.now();
      if (remaining <= 0) { renderPomodoro(); return; }
      pomodoroCountdown.textContent = formatMMSS(remaining);
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
}

document.getElementById('pomodoroStart').addEventListener('click', async () => {
  const minutes = Number(pomodoroDurationSelect.value);
  await browser.runtime.sendMessage({ type: 'fm-start-pomodoro', minutes });
  renderPomodoro();
});

document.getElementById('pomodoroStop').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'fm-stop-pomodoro' });
  renderPomodoro();
});

// --- Today's usage ---
async function renderUsage() {
  const { fmUsageState, fmBudgets } = await browser.storage.local.get({ fmUsageState: null, fmBudgets: {} });
  const list = document.getElementById('usageList');
  const today = new Date().toISOString().slice(0, 10);
  const domains = (fmUsageState && fmUsageState.date === today) ? fmUsageState.domains : {};
  const entries = Object.entries(domains).filter(([, seconds]) => seconds > 0);

  if (!entries.length) {
    list.innerHTML = '<li class="hint">No tracked sites visited yet today.</li>';
    return;
  }

  list.innerHTML = '';
  entries.sort((a, b) => b[1] - a[1]).forEach(([domain, seconds]) => {
    const li = document.createElement('li');
    const minutes = Math.round(seconds / 60);
    const budget = fmBudgets[domain];
    li.textContent = budget
      ? `${DOMAIN_LABELS[domain] || domain}: ${minutes} / ${budget} min`
      : `${DOMAIN_LABELS[domain] || domain}: ${minutes} min`;
    if (budget && minutes >= budget) li.classList.add('over-budget');
    list.appendChild(li);
  });
}

// --- Element picker ---
document.getElementById('pickElement').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'fm-start-picker' });
  window.close(); // the popup would otherwise sit on top of the page being picked from
});

// --- Full settings link ---
document.getElementById('openOptions').addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

loadMasterSwitch();
renderPomodoro();
renderUsage();
