/* ════════════════════════════════════════════════════════════════
   js/utils.js — Toast, name modal, local file backup
   ════════════════════════════════════════════════════════════════ */

// ── Toast ────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── Name / filename modal ────────────────────────────────────────
let nameModalCallback = null;

function showNameModal({ title, desc, placeholder, hint, defaultVal, callback }) {
  document.getElementById('nameModalTitle').textContent   = title;
  document.getElementById('nameModalDesc').textContent    = desc;
  document.getElementById('nameModalInput').placeholder   = placeholder || '';
  document.getElementById('nameModalInput').value         = defaultVal  || '';
  document.getElementById('nameModalHint').textContent    = hint        || '';
  nameModalCallback = callback;
  document.getElementById('nameModal').classList.add('open');
  setTimeout(() => document.getElementById('nameModalInput').select(), 80);
}

function closeNameModal() {
  document.getElementById('nameModal').classList.remove('open');
  nameModalCallback = null;
}

function confirmNameModal() {
  const val = document.getElementById('nameModalInput').value.trim();
  if (!val) { document.getElementById('nameModalInput').focus(); return; }
  const cb = nameModalCallback;
  closeNameModal();
  if (cb) cb(val);
}

document.getElementById('nameModalInput').addEventListener('keydown', e => {
  if (e.key === 'Enter')  confirmNameModal();
  if (e.key === 'Escape') closeNameModal();
});

// ── Local file backup ────────────────────────────────────────────
function saveLocalFile() {
  showNameModal({
    title:      'Save Recipe File',
    desc:       'Choose a name for this recipe book.',
    placeholder:'e.g. Italian Favourites',
    defaultVal: getBookName(),
    hint:       'Saved as: [name].json',
    callback: (name) => {
      setBookName(name);
      const json  = JSON.stringify(data, null, 2);
      const blob  = new Blob([json], { type: 'application/json' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      const fname = name.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/ /g, '_') || 'recipes';
      a.href = url; a.download = `${fname}.json`; a.click();
      URL.revokeObjectURL(url);
      showToast(`${fname}.json saved`);
    }
  });
}

function loadLocalFile() {
  document.getElementById('fileInput').click();
}

function handleFileLoad(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (!parsed.chapters || !parsed.recipes) throw new Error('Invalid format');
      data         = parsed;
      openChapters = new Set([data.chapters[0]?.id]);
      persistToStorage();
      deskCurrentId = null; mobCurrentId = null;
      renderAll(); showPanel('deskWelcome'); mob_backToList();
      showToast(`Loaded: ${file.name}`);
    } catch (err) {
      showToast('Could not read file — is it a valid recipe JSON?');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ── Desktop settings panel ───────────────────────────────────────
function toggleDeskSettings() {
  document.getElementById('deskSettings').classList.toggle('open');
}

// Close settings / notif dropdown when clicking outside
document.addEventListener('click', e => {
  const settings = document.getElementById('deskSettings');
  if (
    settings.classList.contains('open') &&
    !settings.contains(e.target) &&
    !e.target.closest('[onclick="toggleDeskSettings()"]')
  ) settings.classList.remove('open');

  const notif = document.getElementById('notifDropdown');
  if (
    notif.classList.contains('open') &&
    !notif.contains(e.target) &&
    !e.target.closest('#notifBtn') &&
    !e.target.closest('#tabNotif')
  ) notif.classList.remove('open');
});

// ── Wake lock (keep screen on while cooking) ─────────────────────
if ('wakeLock' in navigator) {
  let wl;
  const requestWakeLock = async () => {
    try { wl = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
  };
  requestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
}

// ── Service worker registration ──────────────────────────────────
if (
  'serviceWorker' in navigator &&
  location.hostname !== 'www.claudeusercontent.com' &&
  location.protocol === 'https:'
) {
  window.addEventListener('load', () => {
    const swPath = new URL('./sw.js', window.location.href).pathname;
    navigator.serviceWorker.register(swPath)
      .then(reg  => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err.message));
  });
}
