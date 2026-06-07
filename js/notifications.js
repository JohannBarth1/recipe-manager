/* ════════════════════════════════════════════════════════════════
   js/notifications.js — In-app notifications
   Feeds both the legacy bell dropdown and the unified community
   notifications feed in the community panel.
   ════════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────────
let notifItems = [];
const SEEN_KEY = 'hk_seen_comments';

// In-memory cleared set — loaded from Firestore on sign-in
let _clearedNotifs = new Set();

// ── Seen tracking (localStorage) ────────────────────────────────
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

// ── Cleared tracking (Firestore, via firebase.js) ────────────────
window.notif_loadCleared = async function () {
  if (window.loadClearedNotifs) {
    _clearedNotifs = await loadClearedNotifs();
  }
};

// ── Mark a single notification as read (when recipe is opened) ───
function markNotifRead(msgId) {
  const n = notifItems.find(x => x.id === msgId);
  if (n && !n.read) {
    n.read = true;
    updateNotifBadge();
    _renderCommunityFeed();
  }
}
window.markNotifRead = markNotifRead;

// ── Called by firebase.js on every snapshot update ───────────────
window.notif_onNewComments = function (msgs, recipeId, recipeTitle, myUid, isInitial) {
  const seen = getSeenComments();

  if (isInitial) {
    msgs.forEach(m => markNotifSeen(m.id));
    return;
  }

  msgs.forEach(m => {
    if (m.uid === myUid)          { markNotifSeen(m.id); return; }
    if (seen.has(m.id))           return;
    if (_clearedNotifs.has(m.id)) return;

    markNotifSeen(m.id);

    notifItems.unshift({
      id:            m.id,
      recipeId,
      recipeName:    recipeTitle,
      commenterName: m.displayName || 'Someone',
      text:          m.text || '',
      _createdAt:    m.createdAt,
      timeAgo:       _timeAgo(m.createdAt),
      read:          false,
      type:          'recipe_comment'
    });

    updateNotifBadge();
    _renderCommunityFeed();
  });
};

// ── Called by firebase.js for new request chat messages ─────────
window.notif_onRequestComment = function (msg, requestId, requestTitle, myUid) {
  if (msg.uid === myUid)          return;
  if (_clearedNotifs.has(msg.id)) return;

  notifItems.unshift({
    id:            msg.id,
    requestId,
    requestTitle,
    commenterName: msg.displayName || 'Someone',
    text:          msg.text || '',
    _createdAt:    msg.createdAt,
    timeAgo:       _timeAgo(msg.createdAt),
    read:          false,
    type:          'request_comment'
  });

  updateNotifBadge();
  _renderCommunityFeed();
};

// ── Called by community.js when a broadcast arrives ─────────────
window.notif_addBroadcast = function (broadcast, showToastMsg) {
  // Don't duplicate — check if already in feed
  if (notifItems.find(n => n.id === broadcast.id)) return;

  notifItems.unshift({
    id:            broadcast.id,
    uid:           broadcast.uid  || '',
    text:          broadcast.message || '',
    commenterName: 'Admin',
    _createdAt:    broadcast.createdAt,
    timeAgo:       _timeAgo(broadcast.createdAt),
    read:          !showToastMsg,
    type:          'broadcast',
    _expanded:     false
  });

  updateNotifBadge();
  _renderCommunityFeed();

  if (showToastMsg) {
    showToast(`📢 ${broadcast.message}`);
  }
};

// ── Dismiss all (community panel button) ────────────────────────
window.dismissAllNotifs = function () {
  notifItems.forEach(n => _clearedNotifs.add(n.id));
  notifItems = [];
  updateNotifBadge();
  _renderCommunityFeed();
  if (window.persistClearedNotifs) persistClearedNotifs(_clearedNotifs);
};

// ── Legacy bell dropdown (kept for desktop header bell) ──────────
function toggleNotifDropdown() {
  const d = document.getElementById('notifDropdown');
  if (!d) return;
  d.classList.toggle('open');
  if (d.classList.contains('open')) _renderBellDropdown();
}

function _renderBellDropdown() {
  const list = document.getElementById('notifList');
  if (!list) return;
  if (!notifItems.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  list.innerHTML = notifItems.slice(0, 30).map((n, i) => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="notifClick(${i})">
      <div class="notif-body">
        <div class="notif-recipe">${_nEsc(n.recipeName || n.requestTitle || '')}</div>
        <div class="notif-text">
          <em>${_nEsc(n.commenterName)}</em>:
          ${_nEsc((n.text || '').slice(0, 80))}${n.text.length > 80 ? '…' : ''}
        </div>
        <div class="notif-time">${n.timeAgo}</div>
      </div>
    </div>`).join('');
}

function notifClick(i) {
  notifItems[i].read = true;
  updateNotifBadge();
  _renderBellDropdown();
  _renderCommunityFeed();

  const n = notifItems[i];
  document.getElementById('notifDropdown')?.classList.remove('open');

  if (n.type === 'request_comment') {
    // Open community panel on Requests tab
    if (window.innerWidth > 640) {
      document.getElementById('communitySlidein')?.classList.add('open');
    } else {
      if (window.mob_switchTab) mob_switchTab('community');
    }
    if (window.switchCommunityTab) switchCommunityTab('requests');
    return;
  }

  // recipe_comment — navigate to recipe
  if (!n.recipeId) return;
  if (window.innerWidth > 640) desk_showRecipe(n.recipeId);
  else mob_showRecipe(n.recipeId);
}

function markAllRead() {
  notifItems.forEach(n => _clearedNotifs.add(n.id));
  notifItems = [];
  updateNotifBadge();
  _renderBellDropdown();
  _renderCommunityFeed();
  if (window.persistClearedNotifs) persistClearedNotifs(_clearedNotifs);
}

// ── Community panel notification feed ───────────────────────────
function _renderCommunityFeed() {
  const containers = ['communityNotifsList', 'communityNotifsListDesk'];
  const html = notifItems.length
    ? notifItems.slice(0, 50).map((n, i) => {
        const icon  = n.type === 'broadcast'       ? '📢'
                      : n.type === 'request_comment' ? '📋' : '💬';
        const title = n.type === 'broadcast'
          ? 'Admin Broadcast'
          : n.type === 'request_comment'
            ? `Reply on "${_nEsc(n.requestTitle || '')}"`
            : `Comment on ${_nEsc(n.recipeName || '')}`;

        if (n.type === 'broadcast') {
          const myUid   = window._currentUid?.();
          const isOwner = n.uid && n.uid === myUid;
          const full    = n.text || '';
          const LIMIT   = 120;
          const expanded = n._expanded || false;
          const preview  = full.length > LIMIT && !expanded
            ? full.slice(0, LIMIT) + '…'
            : full;
          const showMoreBtn = full.length > LIMIT
            ? `<button class="notif-feed-more-btn"
                       onclick="event.stopPropagation();notifBroadcastToggle(${i})">
                 ${expanded ? 'Show less' : 'Show more'}
               </button>`
            : '';
          const ownerBtns = isOwner ? `
            <div class="notif-feed-owner-btns">
              <button class="request-card-btn"
                      onclick="event.stopPropagation();notifBroadcastEdit(${i})">✏ Edit</button>
              <button class="request-card-btn danger"
                      onclick="event.stopPropagation();notifBroadcastDelete(${i})">🗑 Delete</button>
            </div>` : '';
          return `
            <div class="notif-feed-item ${n.read ? '' : 'unread'}"
                 onclick="notifFeedClick(${i})">
              <div class="notif-feed-icon">${icon}</div>
              <div class="notif-feed-body">
                <div class="notif-feed-title">${title}</div>
                <div class="notif-feed-text">${_nEsc(preview)}</div>
                ${showMoreBtn}
                ${ownerBtns}
                <div class="notif-feed-time">${n.timeAgo}</div>
              </div>
            </div>`;
        }

        const preview = (n.text || '').slice(0, 100) + (n.text.length > 100 ? '…' : '');
        return `
          <div class="notif-feed-item ${n.read ? '' : 'unread'}"
               onclick="notifFeedClick(${i})">
            <div class="notif-feed-icon">${icon}</div>
            <div class="notif-feed-body">
              <div class="notif-feed-title">${title}</div>
              <div class="notif-feed-text">
                <strong>${_nEsc(n.commenterName)}</strong>: ${_nEsc(preview)}
              </div>
              <div class="notif-feed-time">${n.timeAgo}</div>
            </div>
          </div>`;
      }).join('')
    : '<div class="notif-feed-empty">No notifications yet</div>';

  containers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}
window._renderCommunityFeed = _renderCommunityFeed;

window.notifFeedClick = function (i) {
  if (!notifItems[i]) return;
  notifItems[i].read = true;
  updateNotifBadge();
  _renderCommunityFeed();

  const n = notifItems[i];

  if (n.type === 'request_comment') {
    if (window.switchCommunityTab) switchCommunityTab('requests');
    return;
  }

  // Navigate to recipe, keeping community panel open
  if (!n.recipeId) return;
  if (window.innerWidth > 640) desk_showRecipe(n.recipeId);
  else {
    document.getElementById('communitySlidein')?.classList.remove('open');
    mob_showRecipe(n.recipeId);
  }
};

// ── Badge counter ─────────────────────────────────────────────────
function updateNotifBadge() {
  const count = notifItems.filter(n => !n.read).length;

  // Legacy bell badge
  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.textContent   = count;
    badge.style.display = count > 0 ? 'block' : 'none';
  }

  // Community panel badges (desktop header + mobile nav)
  ['communityBadge', 'communityBadgeDesk'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent   = count;
    el.style.display = count > 0 ? 'block' : 'none';
  });
}
window.updateNotifBadge = updateNotifBadge;

// ── Mark all as read when community panel opens ──────────────────
window.notif_markAllReadOnOpen = function () {
  notifItems.forEach(n => n.read = true);
  updateNotifBadge();
  _renderCommunityFeed();
};

// ── Broadcast interactions ───────────────────────────────────────
window.notifBroadcastToggle = function (i) {
  if (!notifItems[i]) return;
  notifItems[i]._expanded = !notifItems[i]._expanded;
  _renderCommunityFeed();
};

window.notifBroadcastEdit = function (i) {
  const n = notifItems[i];
  if (!n) return;
  const newMsg = prompt('Edit broadcast:', n.text);
  if (!newMsg?.trim() || newMsg.trim() === n.text) return;
  if (window._broadcastEdit) {
    window._broadcastEdit(n.id, newMsg.trim()).then(() => {
      n.text = newMsg.trim();
      _renderCommunityFeed();
      showToast('Broadcast updated ✓');
    });
  }
};

window.notifBroadcastDelete = function (i) {
  const n = notifItems[i];
  if (!n) return;
  if (!confirm('Delete this broadcast?')) return;
  if (window._broadcastDelete) {
    window._broadcastDelete(n.id).then(() => {
      notifItems.splice(i, 1);
      updateNotifBadge();
      _renderCommunityFeed();
      showToast('Broadcast deleted');
    });
  }
};

// ── Helpers ──────────────────────────────────────────────────────
function _nEsc(s) {
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
  notifItems.forEach(n => {
    if (n._createdAt) n.timeAgo = _timeAgo(n._createdAt);
  });
  const dropdown = document.getElementById('notifDropdown');
  if (dropdown?.classList.contains('open')) _renderBellDropdown();
  _renderCommunityFeed();
  updateNotifBadge();
}, 60_000);
