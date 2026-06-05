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

// ── Google Drive load (private mode) ────────────────────────────
const GD_CLIENT_ID = '970185316494-1et3pq5g5bqk7ckt59079ra008lgfvq0.apps.googleusercontent.com';
const GD_SCOPE     = 'https://www.googleapis.com/auth/drive.file';
const GD_TOKEN_KEY = 'hk_gdrive_token';

function getGdriveToken() { return localStorage.getItem(GD_TOKEN_KEY); }

let gTokenClient = null;

function gdriveAuth(callback) {
  if (!window.google) { showToast('Google API not loaded yet'); return; }
  gTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GD_CLIENT_ID,
    scope:     GD_SCOPE,
    callback:  (resp) => {
      if (resp.error) { showToast('Google sign-in failed'); return; }
      localStorage.setItem(GD_TOKEN_KEY, resp.access_token);
      callback(resp.access_token);
    }
  });
  gTokenClient.requestAccessToken();
}

async function gdriveApiCall(token, url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (resp.status === 401) { localStorage.removeItem(GD_TOKEN_KEY); return null; }
  return resp;
}

async function gdriveLoad() {
  const doLoad = async (token) => {
    showToast('Connecting to Drive…');
    const q = encodeURIComponent(`name='Recipes' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const resp = await gdriveApiCall(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
    if (!resp) { gdriveAuth(doLoad); return; }

    const json = await resp.json();
    if (!json.files?.length) { showToast('No Recipes folder found in your Drive'); return; }

    const folderId = json.files[0].id;
    const q2       = encodeURIComponent(`'${folderId}' in parents and mimeType='application/json' and trashed=false`);
    const resp2    = await gdriveApiCall(token, `https://www.googleapis.com/drive/v3/files?q=${q2}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`);
    if (!resp2) { gdriveAuth(doLoad); return; }

    const files = (await resp2.json()).files || [];
    if (!files.length) { showToast('No files in your Recipes folder'); return; }

    const file = files[0];   // most recent
    showToast(`Loading ${file.name}…`);
    const r3 = await gdriveApiCall(token, `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
    if (!r3) { gdriveAuth(doLoad); return; }

    try {
      const parsed = await r3.json();
      if (!parsed.chapters || !parsed.recipes) throw new Error('Invalid');
      data         = parsed;
      openChapters = new Set([data.chapters[0]?.id]);
      persistToStorage();
      deskCurrentId = null; mobCurrentId = null;
      renderAll(); showPanel('deskWelcome'); mob_backToList();
      showToast(`Loaded: ${file.name} ✓`);
    } catch (e) { showToast('Load failed'); console.error(e); }
  };

  const token = getGdriveToken();
  if (token) doLoad(token);
  else gdriveAuth(doLoad);
}

// ── Public / Private mode toggle ────────────────────────────────
// Private = local only (no auto-sync on save)
// Public  = syncs to Firestore automatically on every save/delete

const MODE_KEY = 'hk_recipe_mode';

function getMode() {
  return localStorage.getItem(MODE_KEY) || 'private';
}

function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  updateModeUI();
}

function updateModeUI() {
  const mode = getMode();
  const isPublic = mode === 'public';

  // Desktop pills (in the settings panel)
  document.querySelectorAll('.mode-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show a persistent indicator in the header so the user always knows
  const indicator = document.getElementById('modeIndicator');
  if (indicator) {
    indicator.textContent   = isPublic ? '🌐 Shared' : '🔒 Private';
    indicator.style.color   = isPublic ? 'var(--success)' : 'var(--muted)';
    indicator.title         = isPublic
      ? 'Public mode — changes sync to shared book automatically'
      : 'Private mode — changes are local only';
  }
}

// Call on startup so UI reflects the saved mode
updateModeUI();
