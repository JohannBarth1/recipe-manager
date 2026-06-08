/* ════════════════════════════════════════════════════════════════
   js/timers.js — Countdown timers, audio alerts, inline buttons
   ════════════════════════════════════════════════════════════════ */

// ── Audio context ────────────────────────────────────────────────
let audioCtx = null;

function ensureAudioCtx() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch (e) { /* ignore */ }
  return audioCtx;
}

// ── Timer state ──────────────────────────────────────────────────
let timers     = [];
let timerNextId = 1;

// ── Panel toggle ─────────────────────────────────────────────────
function timerTrayToggle() {
  // Legacy — now routes to correct handler based on viewport
  if (window.innerWidth <= 640) {
    mob_switchTab('timers');
  } else {
    toggleTimerPanel();
  }
}

function toggleTimerPanel() {
  const panel = document.getElementById('timersSlidein');
  if (!panel) return;
  panel.classList.toggle('open');
  timerUpdateNotifRow();
  timerRender();
}

// ── Notification permission row ──────────────────────────────────
function timerRequestPermission() {
  Notification.requestPermission().then(p => {
    timerUpdateNotifRow();
    if (p === 'granted') showToast('Alerts enabled ✓');
    else showToast('Alerts blocked — check browser settings');
  });
}

function timerUpdateNotifRow() {
  [
    { row: 'timerNotifRow',     status: 'timerNotifStatus'     },
    { row: 'timerNotifRowDesk', status: 'timerNotifStatusDesk' }
  ].forEach(({ row, status }) => {
    const rowEl    = document.getElementById(row);
    const statusEl = document.getElementById(status);
    if (!rowEl || !statusEl) return;
    if (!('Notification' in window)) { rowEl.style.display = 'none'; return; }
    if (Notification.permission === 'granted') {
      statusEl.textContent = '🔔 Alerts on';
      statusEl.style.color = '#2a7a4a';
      rowEl.querySelector('button').style.display = 'none';
    } else if (Notification.permission === 'denied') {
      statusEl.textContent = '🔕 Alerts blocked';
      rowEl.querySelector('button').style.display = 'none';
    } else {
      statusEl.textContent = 'Alerts: off';
      rowEl.querySelector('button').style.display = '';
    }
  });
}

// ── Add a timer ──────────────────────────────────────────────────
function timerAdd(minutes, label, context) {
  ensureAudioCtx();
  const id           = timerNextId++;
  const displayLabel = context ? `${label} — ${context}` : label;
  const endsAt       = Date.now() + minutes * 60 * 1000;
  const t = { id, label: displayLabel, totalSecs: minutes * 60, endsAt, interval: null, done: false };
  timers.push(t);
  t.interval = setInterval(() => timerTick(id), 1000);
  timerScheduleNotification(t);
   timerRender();
// Open the correct timers panel depending on viewport
if (window.innerWidth <= 640) {
  mob_switchTab('timers');
} else {
  const panel = document.getElementById('timersSlidein');
  if (panel && !panel.classList.contains('open')) toggleTimerPanel();
}
}

function timerAddCustom() {
  const val  = parseInt(document.getElementById('timerCustomVal').value);
  const unit = document.getElementById('timerCustomUnit').value;
  if (!val || val < 1) { showToast('Enter a valid number'); return; }
  const mins  = unit === 'hr' ? val * 60 : val;
  const label = unit === 'hr' ? `${val} hr` : `${val} min`;
  document.getElementById('timerCustomVal').value = '';
  timerAdd(mins, label);
}

// ── Tick ─────────────────────────────────────────────────────────
function timerTick(id) {
  const t = timers.find(x => x.id === id);
  if (!t || t.done) return;
  const remaining = Math.round((t.endsAt - Date.now()) / 1000);
  if (remaining <= 0) {
    t.done = true;
    clearInterval(t.interval);
    timerNotify(t.label);
  }
  timerRender();
}

// ── Notify on completion ─────────────────────────────────────────
function timerNotify(label) {
  // Audio beep
  try {
    const ctx = ensureAudioCtx();
    if (ctx && ctx.state === 'running') {
      const beep = (freq, start, dur) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq; o.type = 'sine';
        g.gain.setValueAtTime(0.6, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        o.start(ctx.currentTime + start);
        o.stop(ctx.currentTime + start + dur);
      };
      beep(880, 0, .3); beep(880, .35, .3); beep(880, .7, .5);
    }
  } catch (e) { /* ignore */ }

  // Vibration
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);

  // Desktop notification
  if (Notification.permission === 'granted') {
    new Notification('⏱ Timer done!', {
      body: label + ' is up.',
      icon: 'icon-192.png',
      requireInteraction: true
    });
  }

  showToast('⏱ ' + label + ' — done!');
}

// ── Remove / reset ───────────────────────────────────────────────
function timerRemove(id) {
  const t = timers.find(x => x.id === id);
  if (t && t.interval) clearInterval(t.interval);
  timers = timers.filter(x => x.id !== id);

  // Cancel the SW-scheduled notification
  navigator.serviceWorker?.ready.then(reg => {
    reg.active.postMessage({ type: 'CANCEL_TIMER', id });
  });

  timerRender();
}

function timerReset(id) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  if (t.interval) clearInterval(t.interval);
  t.endsAt    = Date.now() + t.totalSecs * 1000;
  t.done      = false;
  t.interval  = setInterval(() => timerTick(id), 1000);
  timerScheduleNotification(t);
  timerRender();
}

// ── Format mm:ss or h:mm:ss ──────────────────────────────────────
function timerFmt(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Render timer list ────────────────────────────────────────────
function timerRender() {
  const html = timers.map(t => {
    const remaining = Math.round((t.endsAt - Date.now()) / 1000);
    return `
      <div class="timer-card ${t.done ? 'done' : ''}">
        <div class="timer-card-label">${t.label}</div>
        <div class="timer-card-time">${t.done ? 'Done!' : timerFmt(Math.max(0, remaining))}</div>
        ${t.done ? `<button class="timer-card-btn" onclick="timerReset(${t.id})">↺</button>` : ''}
        <button class="timer-card-btn" onclick="timerRemove(${t.id})">✕</button>
      </div>`;
  }).join('');

  // Update both lists
  ['timerList', 'timerListDesk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });

  // Running label
  ['timerListLabel', 'timerListLabelDesk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = timers.length ? '' : 'none';
  });

  // Badge on timer tab + desktop header
  const running = timers.filter(t => !t.done).length;
  ['timerBadge', 'timerBadgeDesk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = running; el.style.display = running > 0 ? 'block' : 'none'; }
  });
}

// ── Desktop custom timer (uses separate inputs) ──────────────────
function timerAddCustomDesk() {
  const val  = parseInt(document.getElementById('timerCustomValDesk').value);
  const unit = document.getElementById('timerCustomUnitDesk').value;
  if (!val || val < 1) { showToast('Enter a valid number'); return; }
  const mins  = unit === 'hr' ? val * 60 : val;
  const label = unit === 'hr' ? `${val} hr` : `${val} min`;
  document.getElementById('timerCustomValDesk').value = '';
  timerAdd(mins, label);
}

// ── Linkify time mentions in recipe text ─────────────────────────
// Turns "bake 25 minutes" into "bake 25 minutes [⏱ Start]"
const TIME_RE = /(\d+(?:[.,½¼¾]\d*)?)\s*(hours?|hrs?|minutes?|mins?)/gi;

function linkifyTimers(text) {
  return text.replace(TIME_RE, (match, num, unit, offset, string) => {
    let n = parseFloat(
      num.replace(',', '.').replace('½', '.5').replace('¼', '.25').replace('¾', '.75')
    );
    const isHour = /^h/i.test(unit);
    const mins   = isHour ? Math.round(n * 60) : Math.round(n);
    if (mins < 1 || mins > 600) return match;

    // Build a short context label from surrounding sentence
    const before      = string.slice(0, offset);
    const sentStart   = Math.max(before.lastIndexOf('.'), before.lastIndexOf('\n')) + 1;
    const after       = string.slice(offset + match.length);
    const sentEnd     = after.search(/[.\n]|$/);
    const sentence    = (before.slice(sentStart) + match + after.slice(0, sentEnd)).trim();
    const context     = sentence.replace(/<[^>]+>/g, '').trim().slice(0, 60);
    const safeCtx     = context.replace(/'/g, "\\'");
    const label       = match.trim();

    return `${match}<button class="inline-timer-btn" onclick="timerAdd(${mins},'${label}','${safeCtx}')">⏱ Start</button>`;
  });
}

function timerScheduleNotification(t) {
  if (Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;
  const delay = t.endsAt - Date.now();
  if (delay <= 0) return;

  navigator.serviceWorker.ready.then(reg => {
    // Post a message to the SW to schedule the notification
    reg.active.postMessage({
      type:  'SCHEDULE_TIMER',
      id:    t.id,
      label: t.label,
      delay: delay
    });
  });
}
// ── Init ─────────────────────────────────────────────────────────
timerUpdateNotifRow();
