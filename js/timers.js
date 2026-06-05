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

// ── Tray toggle ──────────────────────────────────────────────────
function timerTrayToggle() {
  const tray   = document.getElementById('timerTray');
  tray.classList.toggle('open');
  const isOpen = tray.classList.contains('open');

  document.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));
  if (isOpen) {
    const tt = document.getElementById('tabTimer');
    if (tt) tt.classList.add('active');
  } else {
    document.getElementById('tabRecipes').classList.add('active');
  }
  timerUpdateNotifRow();
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
  const row    = document.getElementById('timerNotifRow');
  const status = document.getElementById('timerNotifStatus');
  if (!row) return;
  if (!('Notification' in window)) { row.style.display = 'none'; return; }

  if (Notification.permission === 'granted') {
    status.textContent         = '🔔 Alerts on';
    status.style.color         = '#2a7a4a';
    row.querySelector('button').style.display = 'none';
  } else if (Notification.permission === 'denied') {
    status.textContent         = '🔕 Alerts blocked in browser settings';
    row.querySelector('button').style.display = 'none';
  } else {
    status.textContent         = 'Alerts: off';
    row.querySelector('button').style.display = '';
  }
}

// ── Add a timer ──────────────────────────────────────────────────
function timerAdd(minutes, label, context) {
  ensureAudioCtx();
  const id           = timerNextId++;
  const secs         = minutes * 60;
  const displayLabel = context ? `${label} — ${context}` : label;
  const t = { id, label: displayLabel, totalSecs: secs, remaining: secs, interval: null, done: false };
  timers.push(t);
  t.interval = setInterval(() => timerTick(id), 1000);
  timerRender();
  if (!document.getElementById('timerTray').classList.contains('open')) timerTrayToggle();
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
  t.remaining--;
  if (t.remaining <= 0) {
    t.remaining = 0;
    t.done      = true;
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
  timerRender();
}

function timerReset(id) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  if (t.interval) clearInterval(t.interval);
  t.remaining = t.totalSecs;
  t.done      = false;
  t.interval  = setInterval(() => timerTick(id), 1000);
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
  const list = document.getElementById('timerList');
  if (!list) return;

  list.innerHTML = timers.map(t => `
    <div class="timer-card ${t.done ? 'done' : ''}">
      <div class="timer-card-label">${t.label}</div>
      <div class="timer-card-time">${t.done ? 'Done!' : timerFmt(t.remaining)}</div>
      ${t.done ? `<button class="timer-card-btn" onclick="timerReset(${t.id})">↺</button>` : ''}
      <button class="timer-card-btn" onclick="timerRemove(${t.id})">✕</button>
    </div>`).join('');

  const lbl = document.getElementById('timerListLabel');
  if (lbl) lbl.style.display = timers.length ? '' : 'none';

  // Badge on timer tab
  const badge   = document.getElementById('timerBadge');
  const running = timers.filter(t => !t.done).length;
  if (badge) { badge.textContent = running; badge.style.display = running > 0 ? 'block' : 'none'; }
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

// ── Init ─────────────────────────────────────────────────────────
timerUpdateNotifRow();
