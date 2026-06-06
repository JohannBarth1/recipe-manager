/* ════════════════════════════════════════════════════════════════
   js/notifications.js — In-app notification bell
   Receives comment events from firebase.js via notif_onNewComments()
   ════════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────────
let notifItems = [];
const SEEN_KEY = 'hk_seen_comments';

// In-memory cleared set — loaded from Firestore on sign-in
let _clearedNotifs = new Set();

// ── Seen tracking (localStorage) ────────────────────────────────
// Tracks which message IDs have been processed so we never
// show the same notification twice, even across page refreshes.
function getSeenComments() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch (e) { return new Set(); }
}

function markNotifSeen(msgId) {
  const s   = getSeenComments();
  s.add(msgId);
  const arr = [...s].slice(-500);   // keep last 500 only
  localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

// ── Cleared tracking (Firestore, via firebase.js) ────────────────
// Notifications cleared via "Mark all read" are stored in Firestore
// so the cleared state syncs across all the user's devices.

// Called from firebase.js after auth resolves — loads cleared list
window.notif_loadCleared = async function() {
  if (window.loadClearedNotifs) {
    _clearedNotifs = await loadClearedNotifs();
  }
};

// ── Mark a single notification as read (when recipe is opened) ───
function markNotifRead(msgId) {
  const n = notifItems.find(x => x.id === msgId);
  if (n && !n.read) { n.read = true; updateNotifBadge(); }
}

// ── Called by firebase.js on every snapshot update ───────────────
// msgs      = full array of messages for this recipe
// isInitial = true on the first snapshot (existing messages)
//             false on all subsequent snapshots (real-time updates)
window.notif_onNewComments = function(msgs, recipeId, recipeTitle, myUid, isInitial) {
  const seen = getSeenComments();

  if (isInitial) {
    // First snapshot contains all existing messages — mark as seen
    // so we never notify for messages that existed before this session.
    // New users are handled here too: all past messages are silently
    // marked seen on first sign-in, so no notification backlog.
    msgs.forEach(m => markNotifSeen(m.id));
    return;
  }

  // Subsequent snapshots — only genuinely new messages reach here
  msgs.forEach(m => {
    if (m.uid === myUid)          { markNotifSeen(m.id); return; } // own message
    if (seen.has(m.id))           return;  // already processed this session
    if (_clearedNotifs.has(m.id)) return;  // user explicitly cleared this

    markNotifSeen(m.id);

    notifItems.unshift({
      id:            m.id,
      recipeId,
      recipeName:    recipeTitle,
      commenterName: m.displayName || 'Someone',
      text:          m.text || '',
      timeAgo:       _timeAgo(m.createdAt),
      read:          false
    });

    updateNotifBadge();

    // Toast so the user knows immediately even if dropdown is closed
    showToast(`💬 ${m.displayName || 'Someone'} commented on ${recipeTitle}`);
  });
};

// ── Toggle dropdown ──────────────────────────────────────────────
function toggleNotifDropdown() {
  const d = document.getElementById('notifDropdown');
  d.classList.toggle('open');
  if (d.classList.contains('open')) renderNotifDropdown();
}

// ── Render dropdown list ─────────────────────────────────────────
function renderNotifDropdown() {
  const list = document.getElementById('notifList');
  if (!notifItems.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  list.innerHTML = notifItems.slice(0, 30).map((n, i) => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="notifClick(${i})">
      <div class="notif-body">
        <div class="notif-recipe">${_esc(n.recipeName)}</div>
        <div class="notif-text">
          <em>${_esc(n.commenterName)}</em>:
          ${_esc(n.text.slice(0, 80))}${n.text.length > 80 ? '…' : ''}
        </div>
        <div class="notif-time">${n.timeAgo}</div>
      </div>
    </div>`).join('');
}

// ── Click a notification → navigate to recipe ────────────────────
function notifClick(i) {
  notifItems[i].read = true;
  updateNotifBadge();
  renderNotifDropdown();

  const n = notifItems[i];
  const r = data.recipes.find(x => x.id === n.recipeId);
  if (!r) return;

  document.getElementById('notifDropdown').classList.remove('open');
  if (window.innerWidth > 640) desk_showRecipe(n.recipeId);
  else mob_showRecipe(n.recipeId);
}

// ── Mark all read & clear the list ──────────────────────────────
// Persists cleared IDs to Firestore so they don't reappear on
// refresh or on other devices the user is signed into.
function markAllRead() {
  notifItems.forEach(n => _clearedNotifs.add(n.id));
  notifItems = [];
  updateNotifBadge();
  renderNotifDropdown();
  // Sync cleared list to Firestore (defined in firebase.js)
  if (window.persistClearedNotifs) persistClearedNotifs(_clearedNotifs);
}

// ── Badge counter ────────────────────────────────────────────────
function updateNotifBadge() {
  const count = notifItems.filter(n => !n.read).length;

  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.textContent   = count;
    badge.style.display = count > 0 ? 'block' : 'none';
  }

  const mobBadge = document.getElementById('mobNotifBadge');
  if (mobBadge) {
    mobBadge.textContent   = count;
    mobBadge.style.display = count > 0 ? 'block' : 'none';
  }
}

// ── Helpers ──────────────────────────────────────────────────────
function _esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _timeAgo(ts) {
  if (!ts) return 'just now';
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return 'just now';
  const secs = Math.floor((Date.now() - d) / 1000);
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Refresh time labels every minute ────────────────────────────
setInterval(() => {
  // Recalculate timeAgo for each item so labels stay accurate
  notifItems.forEach(n => {
    if (n._createdAt) n.timeAgo = _timeAgo(n._createdAt);
  });
  const dropdown = document.getElementById('notifDropdown');
  if (dropdown && dropdown.classList.contains('open')) renderNotifDropdown();
  updateNotifBadge();
}, 60000);
