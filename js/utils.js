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
  toggleSettingsPanel(); // alias for backwards compatibility
}
function toggleSettingsPanel() {
  document.getElementById('settingsSlidein')?.classList.toggle('open');
}

// Close settings / notif dropdown when clicking outside
document.addEventListener('click', e => {
  const notif = document.getElementById('notifDropdown');
  if (
    notif.classList.contains('open') &&
    !notif.contains(e.target) &&
    !e.target.closest('#headerNotifBtn') &&   // ← was checking wrong selectors
    !e.target.closest('#tabNotif')
  ) notif.classList.remove('open');
     if (!e.target.closest('#userBadge')) {
    const menu = document.getElementById('avatarMenu');
    if (menu) menu.style.display = 'none';
  }
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
    const q    = encodeURIComponent(`name='Recipes' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const resp = await gdriveApiCall(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
    if (!resp) { gdriveAuth(doLoad); return; }

    const json = await resp.json();
    if (!json.files?.length) { showToast('No Recipes folder found in your Drive'); return; }

    const folderId = json.files[0].id;
    const q2       = encodeURIComponent(`'${folderId}' in parents and mimeType='application/json' and trashed=false`);
    const resp2    = await gdriveApiCall(token, `https://www.googleapis.com/drive/v3/files?q=${q2}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`);
    if (!resp2) { gdriveAuth(doLoad); return; }

    const files = (await resp2.json()).files || [];
    if (!files.length) { showToast('No recipe files found in your Recipes folder'); return; }

    // Show picker modal
   _showDriveFilePicker(files, async (fileId, fileName) => {
     _setLastDriveFile(fileId, fileName);
     showToast(`Loading ${fileName}…`);
      const r3 = await gdriveApiCall(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
      if (!r3) { gdriveAuth(doLoad); return; }
      try {
        const parsed = await r3.json();
        if (!parsed.chapters || !parsed.recipes) throw new Error('Invalid format');
        data         = parsed;
        openChapters = new Set([data.chapters[0]?.id]);
        persistToStorage();
        deskCurrentId = null; mobCurrentId = null;
        renderAll(); showPanel('deskWelcome'); mob_backToList();
        showToast(`Loaded: ${fileName} ✓`);
      } catch (e) { showToast('Load failed — invalid file'); console.error(e); }
    });
  };

  const token = getGdriveToken();
  if (token) doLoad(token);
  else gdriveAuth(doLoad);
}

function _showDriveFilePicker(files, onSelect) {
  // Remove any existing picker
  document.getElementById('drivePickerOverlay')?.remove();

  const fmt = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const overlay = document.createElement('div');
  overlay.id    = 'drivePickerOverlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(26,18,8,.6);z-index:150;' +
    'display:flex;align-items:center;justify-content:center;padding:1rem';

  overlay.innerHTML = `
    <div style="background:var(--warm-white);border:1px solid var(--border);border-radius:6px;
                padding:1.8rem;width:100%;max-width:400px;max-height:80vh;display:flex;flex-direction:column;">
      <h3 style="font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--brown);
                 margin-bottom:.3rem">Choose a Recipe Book</h3>
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:1rem">
        Select a file from your Google Drive <em>Recipes</em> folder:
      </p>
      <div style="flex:1;overflow-y:auto;border:1px solid var(--border);border-radius:4px;">
        ${files.map(f => `
          <div onclick="document.getElementById('drivePickerOverlay')._select('${f.id}','${f.name.replace(/'/g, "\\'")}')"
               style="padding:.75rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;
                      display:flex;align-items:center;justify-content:space-between;
                      transition:background .12s;"
               onmouseover="this.style.background='var(--panel)'"
               onmouseout="this.style.background=''">
            <div>
              <div style="font-size:.88rem;font-weight:700;color:var(--ink)">${f.name}</div>
              <div style="font-size:.7rem;color:var(--muted);margin-top:2px">${fmt(f.modifiedTime)}</div>
            </div>
            <span style="color:var(--muted);font-size:.8rem">›</span>
          </div>`).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:1rem">
        <button onclick="document.getElementById('drivePickerOverlay').remove()"
                class="btn-cancel">Cancel</button>
      </div>
    </div>`;

  // Attach the select handler directly on the element so it has closure over onSelect
  overlay._select = (fileId, fileName) => {
    overlay.remove();
    onSelect(fileId, fileName);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ── Public / Private mode toggle ────────────────────────────────
// Private = local only (no auto-sync on save)
// Public  = syncs to Firestore automatically on every save/delete

const MODE_KEY = 'hk_recipe_mode';

function getMode() {
  return localStorage.getItem(MODE_KEY) || 'public';
}

const GDRIVE_LAST_FILE_KEY = 'hk_gdrive_last_file';

function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);

  if (mode === 'public') {
    updateModeUI();
    if (window.firestoreLoad) firestoreLoad();
  } else {
    // Clear recipe list immediately
    data         = { chapters: [], recipes: [] };
    openChapters = new Set();
    deskCurrentId = null;
    mobCurrentId  = null;
    renderAll();
    showPanel('deskWelcome');
    if (window.mob_backToList) mob_backToList();
    updateModeUI();

    // Check for a previously loaded Drive file
    const lastFile = _getLastDriveFile();
    if (lastFile) {
      // Reload silently
      _gdriveLoadFileById(lastFile.id, lastFile.name);
    } else {
      // Go through the full picker flow
      gdriveLoad();
    }
  }
}

function _getLastDriveFile() {
  try {
    const s = localStorage.getItem(GDRIVE_LAST_FILE_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

function _setLastDriveFile(id, name) {
  localStorage.setItem(GDRIVE_LAST_FILE_KEY, JSON.stringify({ id, name }));
}

async function _gdriveLoadFileById(fileId, fileName) {
  const doLoad = async (token) => {
    showToast(`Loading ${fileName}…`);
    const r = await gdriveApiCall(
      token,
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    );
    if (!r) {
      // Token expired — re-auth then retry
      gdriveAuth(doLoad);
      return;
    }
    try {
      const parsed = await r.json();
      if (!parsed.chapters || !parsed.recipes) throw new Error('Invalid format');
      data         = parsed;
      openChapters = new Set([data.chapters[0]?.id]);
      persistToStorage();
      deskCurrentId = null; mobCurrentId = null;
      renderAll();
      showPanel('deskWelcome');
      if (window.mob_backToList) mob_backToList();
      showToast(`Loaded: ${fileName} ✓`);
    } catch (e) {
      showToast('Could not reload file — please use Load button');
      console.error(e);
    }
  };

  const token = getGdriveToken();
  if (token) doLoad(token);
  else gdriveAuth(doLoad);
}

function updateModeUI() {
  const mode     = getMode();
  const isPublic = mode === 'public';

  // Mode pill buttons — both desktop and mobile sets
  document.querySelectorAll('.mode-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
    btn.classList.toggle('pub',
      btn.dataset.mode === 'public' && isPublic);
  });

  // Publish buttons — visible in private mode only
  document.querySelectorAll('.btn-publish').forEach(btn => {
    btn.style.display = isPublic ? 'none' : '';
  });

  // Load/Save backup buttons — visible in private mode only
  document.querySelectorAll('.sync-actions').forEach(el => {
    el.style.display = isPublic ? 'none' : '';
  });

  // Sync dot colour
  const dot = document.getElementById('syncDot');
  if (dot) {
    dot.style.background = isPublic ? '#2a7a4a' : 'var(--muted)';
    dot.title            = isPublic ? 'Shared mode — syncing' : 'Private mode';
  }
}

// Call on startup so UI reflects the saved mode
updateModeUI();
window.updateModeUI = updateModeUI;

function toggleAvatarMenu() {
  const menu = document.getElementById('avatarMenu');
  if (!menu) return;
  const isOpen = menu.style.display === 'block';
  menu.style.display = isOpen ? 'none' : 'block';
}

function updateUserBadge(user) {
  const badge  = document.getElementById('userBadge');
  const avatar = document.getElementById('userAvatar');
  const name   = document.getElementById('avatarMenuName');
  if (!badge) return;

  if (user) {
    if (avatar && user.photoURL) avatar.src = user.photoURL;
    if (name) name.textContent = user.displayName || user.email || '';
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

async function _publishRecipe(recipe, btn) {
  if (!window.firestoreSaveRecipe) { showToast('Not signed in'); return; }
  if (btn) { btn.textContent = '✓ Published'; btn.disabled = true; }
  await firestoreSaveRecipe(recipe);
  showToast(`"${recipe.title}" published to shared book ✓`);
}

// ── Publish nudge ────────────────────────────────────────────────
let _recipesViewedThisSession = 0;
const NUDGE_KEY = 'hk_nudge_shown';

function trackRecipeView(recipe) {
  if (getMode() !== 'private') return;
  if (sessionStorage.getItem(NUDGE_KEY)) return;
  _recipesViewedThisSession++;
  if (_recipesViewedThisSession >= 3) _showPublishNudge(recipe);
}

function _showPublishNudge(recipe) {
  sessionStorage.setItem(NUDGE_KEY, '1');
  document.getElementById('publishNudge')?.remove();

  const nudge = document.createElement('div');
  nudge.id    = 'publishNudge';
  nudge.style.cssText = `
    position:fixed;bottom:calc(var(--mob-nav-h) + 1rem);left:50%;
    transform:translateX(-50%);
    background:var(--ink);color:var(--light-brown);
    padding:.9rem 1.2rem;border-radius:6px;
    border:1px solid var(--gold);
    box-shadow:0 4px 20px rgba(0,0,0,.3);
    z-index:201;max-width:320px;width:calc(100% - 2rem);
    font-family:'Lato',sans-serif;font-size:.82rem;line-height:1.5;
    display:flex;flex-direction:column;gap:.6rem;`;
  nudge.innerHTML = `
    <div>
      <div style="font-weight:700;color:var(--gold);margin-bottom:.2rem">
        🌐 Share this recipe?
      </div>
      Would you like to publish <strong style="color:var(--light-brown)">${_escNudge(recipe.title)}</strong>
      to the shared book so others can enjoy it?
    </div>
    <div style="display:flex;gap:.5rem;justify-content:flex-end">
      <button onclick="document.getElementById('publishNudge').remove()"
              style="background:transparent;border:1px solid #555;color:var(--muted);
                     padding:.35rem .8rem;border-radius:3px;cursor:pointer;
                     font-family:'Lato',sans-serif;font-size:.75rem;">
        Not now
      </button>
      <button onclick="_publishNudgeRecipe('${recipe.id}')"
              style="background:var(--gold);border:none;color:#fff;
                     padding:.35rem .8rem;border-radius:3px;cursor:pointer;
                     font-family:'Lato',sans-serif;font-size:.75rem;font-weight:700;">
        ☁ Publish
      </button>
    </div>`;
  document.body.appendChild(nudge);
  setTimeout(() => document.getElementById('publishNudge')?.remove(), 12000);
}

function _escNudge(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function _publishNudgeRecipe(recipeId) {
  document.getElementById('publishNudge')?.remove();
  const recipe = data.recipes.find(r => r.id === recipeId);
  if (!recipe || !window.firestoreSaveRecipe) return;
  await firestoreSaveRecipe(recipe);
  showToast(`"${recipe.title}" published ✓`);
}

// Close all desktop slide-ins except the one specified
function closeOtherSlidein(keep) {
  if (keep !== 'community') document.getElementById('communitySlidein')?.classList.remove('open');
  if (keep !== 'timers')    document.getElementById('timersSlidein')?.classList.remove('open');
  if (keep !== 'settings')  document.getElementById('settingsSlidein')?.classList.remove('open');
}
