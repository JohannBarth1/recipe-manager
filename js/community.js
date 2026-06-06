/* ════════════════════════════════════════════════════════════════
   js/community.js — Community panel: global chat + future features
   ════════════════════════════════════════════════════════════════ */

let _communityUnsubscribe = null;
let _communityUnreadCount = 0;
const COMMUNITY_SEEN_KEY  = 'hk_community_seen';

// ── Panel toggle (desktop) ───────────────────────────────────────
function toggleCommunityPanel() {
  const panel = document.getElementById('communitySlidein');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (isOpen) {
    _markCommunityRead();
    // Scroll to bottom
    setTimeout(() => {
      const msgs = document.getElementById('globalChatMsgsDesk');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  }
}

// ── Tab switcher ─────────────────────────────────────────────────
function switchCommunityTab(tab) {
  document.querySelectorAll('.community-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.community-section').forEach(s => {
    s.classList.remove('active');
  });
  // Activate matching sections (mobile + desktop)
  if (tab === 'chat') {
    document.getElementById('communityChat')?.classList.add('active');
    document.getElementById('communityChatDesk')?.classList.add('active');
  }
  // Future tabs: requests, challenges etc go here
}

// ── Seen tracking ────────────────────────────────────────────────
function getCommunitySeen() {
  try { return new Set(JSON.parse(localStorage.getItem(COMMUNITY_SEEN_KEY) || '[]')); }
  catch (e) { return new Set(); }
}

function markCommunitySeen(msgId) {
  const s   = getCommunitySeen();
  s.add(msgId);
  const arr = [...s].slice(-500);
  localStorage.setItem(COMMUNITY_SEEN_KEY, JSON.stringify(arr));
}

function _markCommunityRead() {
  _communityUnreadCount = 0;
  _updateCommunityBadge();
}

function _updateCommunityBadge() {
  const count = _communityUnreadCount;
  ['communityBadge', 'communityBadgeDesk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent   = count;
      el.style.display = count > 0 ? 'block' : 'none';
    }
  });
}

// ── Load & subscribe to global chat ─────────────────────────────
// Called from firebase.js after auth resolves
window.community_subscribe = function(db, collection, query, orderBy, addDoc, serverTimestamp, currentUserFn) {
  if (_communityUnsubscribe) { _communityUnsubscribe(); _communityUnsubscribe = null; }

  const { onSnapshot } = window._firestoreRefs || {};
  if (!onSnapshot) return;

  let isInitial = true;
  const seen    = getCommunitySeen();

  const q = query(collection(db, 'community_chat', 'global', 'messages'), orderBy('createdAt', 'asc'));

  _communityUnsubscribe = onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderGlobalChat(msgs, currentUserFn());

    if (isInitial) {
      msgs.forEach(m => markCommunitySeen(m.id));
    } else {
      const currentUser = currentUserFn();
      msgs.forEach(m => {
        if (seen.has(m.id)) return;
        if (m.uid === currentUser?.uid) { markCommunitySeen(m.id); return; }
        markCommunitySeen(m.id);
        // Only count as unread if panel is closed
        const deskOpen = document.getElementById('communitySlidein')?.classList.contains('open');
        const mobOpen  = document.querySelector('#mobPanelCommunity')?.classList.contains('active');
        if (!deskOpen && !mobOpen) {
          _communityUnreadCount++;
          _updateCommunityBadge();
          showToast(`💬 ${m.displayName || 'Someone'} in Community`);
        }
      });
    }
    isInitial = false;
  }, err => console.error('Community chat error:', err));
};

// ── Render messages ──────────────────────────────────────────────
function _renderGlobalChat(msgs, currentUser) {
  const containerIds = ['globalChatMsgs', 'globalChatMsgsDesk'];
  containerIds.forEach(cid => {
    const el = document.getElementById(cid);
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (!msgs.length) { el.innerHTML = ''; return; }
    el.innerHTML = msgs.map(m => {
      const mine   = m.uid === currentUser?.uid;
      const name   = m.displayName || 'Unknown';
      const time   = _communityFmtTime(m.createdAt);
      const avatar = m.photoURL
        ? `<img class="msg-avatar" src="${_cEsc(m.photoURL)}" alt="${_cEsc(name)}"/>`
        : `<div class="msg-avatar-init">${name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>`;
      const delBtn = mine
        ? `<button class="msg-delete-btn" onclick="globalChat_delete('${m.id}')" title="Delete">✕</button>`
        : '';
      return `
        <div class="msg-row ${mine ? 'mine' : ''}">
          ${avatar}
          <div class="msg-bubble-wrap">
            <div class="msg-meta">
              ${mine ? '' : _cEsc(name) + ' · '}${time}${delBtn}
            </div>
            <div class="msg-bubble">${_cEsc(m.text)}</div>
          </div>
        </div>`;
    }).join('');
    if (atBottom) el.scrollTop = el.scrollHeight;
  });
}

// ── Send / delete ────────────────────────────────────────────────
window.globalChat_keydown = function(e, prefix) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); globalChat_send(prefix); }
};

window.globalChat_send = async function(prefix) {
  const inputId = prefix === 'desk' ? 'globalChatInputDesk' : 'globalChatInput';
  const input   = document.getElementById(inputId);
  const text    = input?.value.trim();
  if (!text) return;
  input.value = '';
  if (window._globalChat_send) await window._globalChat_send(text);
};

window.globalChat_delete = async function(msgId) {
  if (!confirm('Delete this message?')) return;
  if (window._globalChat_delete) await window._globalChat_delete(msgId);
};

// ── Helpers ──────────────────────────────────────────────────────
function _communityFmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function _cEsc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Mark read when panel opens on mobile ─────────────────────────
// Called from mobile.js when community tab is selected
window.community_onOpen = function() {
  _markCommunityRead();
  setTimeout(() => {
    const msgs = document.getElementById('globalChatMsgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 50);
};
