/* ════════════════════════════════════════════════════════════════
   js/notifications.js — In-app notification bell
   Receives comment events from firebase.js via notif_onNewComments()
   ════════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────────
let notifItems = [];
const SEEN_KEY = 'hk_seen_comments';

// Track which recipe subscriptions have completed their initial load
const _initialLoadDone = new Set();

function getSeenComments() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch (e) { return new Set(); }
}

function markNotifSeen(msgId) {
  const s   = getSeenComments();
  s.add(msgId);
  const arr = [...s].slice(-500);
  localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

function markNotifRead(msgId) {
  const n = notifItems.find(x => x.id === msgId);
  if (n && !n.read) { n.read = true; updateNotifBadge(); }
}

// Called by firebase.js on every snapshot update
// isInitial = true means this is the first snapshot fire (existing messages)
window.notif_onNewComments = function(msgs, recipeId, recipeTitle, myUid, isInitial) {
  const seen = getSeenComments();

  if (isInitial) {
    // On first load, just mark everything as seen — don't notify for old messages
    msgs.forEach(m => markNotifSeen(m.id));
    return;
  }

  // Subsequent snapshots — only process genuinely new messages
  msgs.forEach(m => {
    if (m.uid === myUid)   { markNotifSeen(m.id); return; } // own message
    if (seen.has(m.id))    return;                           // already processed

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

    // Also show a toast so the user knows immediately
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

// ── Mark all read ────────────────────────────────────────────────
function markAllRead() {
  notifItems.forEach(n => n.read = true);
  updateNotifBadge();
  renderNotifDropdown();
}

// ── Badge counter ────────────────────────────────────────────────
function updateNotifBadge() {
  const count    = notifItems.filter(n => !n.read).length;

  // Desktop bell badge
  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'block' : 'none';
  }

  // Mobile nav badge
  const mobBadge = document.getElementById('mobNotifBadge');
  if (mobBadge) {
    mobBadge.textContent = count;
    mobBadge.style.display = count > 0 ? 'block' : 'none';
  }
}

// ── Helpers ──────────────────────────────────────────────────────
function _esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _timeAgo(ts) {
  if (!ts) return 'just now';  // ← was returning '' which caused empty time labels
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return 'just now';  // ← guard against bad timestamps
  const secs = Math.floor((Date.now() - d) / 1000);
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Refresh "time ago" labels every minute so "just now" → "2m ago" etc.
setInterval(() => {
  notifItems.forEach(n => {
    // timeAgo is recalculated fresh on render, so just re-render if open
  });
  const dropdown = document.getElementById('notifDropdown');
  if (dropdown.classList.contains('open')) renderNotifDropdown();
  updateNotifBadge();
}, 60000);
