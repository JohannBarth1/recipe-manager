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
  if (tab === 'chat') {
    document.getElementById('communityChat')?.classList.add('active');
    document.getElementById('communityChatDesk')?.classList.add('active');
  } else if (tab === 'requests') {
    document.getElementById('communityRequests')?.classList.add('active');
    document.getElementById('communityRequestsDesk')?.classList.add('active');
  }
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

/* ════════════════════════════════════════════════════════════════
   REQUESTS
   ════════════════════════════════════════════════════════════════ */

const ADMIN_HASH = 'a5e744d0164540d33b1d7ea616c28f2fa97e754a4a5d7bb7b11f2bcde94a8d9d';
let _requestsFilter = 'all';
let _requests       = [];
let _requestsUnsub  = null;

// ── Hash function ────────────────────────────────────────────────
async function _sha256(str) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Subscribe to requests ────────────────────────────────────────
window.requests_subscribe = function(db, collection, query, orderBy) {
  if (_requestsUnsub) { _requestsUnsub(); _requestsUnsub = null; }
  const { onSnapshot } = window._firestoreRefs || {};
  if (!onSnapshot) return;

  const q = query(
    collection(db, 'community_requests'),
    orderBy('votes', 'desc'),
    orderBy('createdAt', 'desc')
  );
  _requestsUnsub = onSnapshot(q, snap => {
    _requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderRequests();
  }, err => console.error('Requests error:', err));
};

// ── Render request list ──────────────────────────────────────────
function _renderRequests() {
  const containers = ['requestsList', 'requestsListDesk'];
  const filtered   = _requestsFilter === 'all'
    ? _requests
    : _requests.filter(r => r.type === _requestsFilter);

  const html = filtered.length ? filtered.map(r => `
    <div class="request-card">
      <div class="request-card-top">
        <span class="request-tag ${r.type}">${r.type === 'recipe' ? '🍰 Recipe' : '⚙ Feature'}</span>
        <span class="request-status ${r.status || 'new'}"
              onclick="requestAdmin_updateStatus('${r.id}','${r.status||'new'}')"
              title="Click to update status (admin)">
          ${_statusLabel(r.status)}
        </span>
      </div>
      <div class="request-title">${_cEsc(r.title)}</div>
      ${r.description ? `<div class="request-desc">${_cEsc(r.description)}</div>` : ''}
      <div class="request-card-bottom">
        <span class="request-author">${_cEsc(r.displayName || 'Someone')}</span>
        <button class="request-vote ${(r.voters||[]).includes(window._currentUid?.()) ? 'voted' : ''}"
                onclick="requestVote('${r.id}')">
          👍 ${r.votes || 0}
        </button>
      </div>
    </div>`).join('')
  : `<div class="request-empty">No requests yet — add the first one!</div>`;

  containers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function _statusLabel(status) {
  switch(status) {
    case 'considering': return '🤔 Considering';
    case 'planned':     return '📅 Planned';
    case 'done':        return '✅ Done';
    default:            return '🆕 New';
  }
}

// ── Filter ───────────────────────────────────────────────────────
window.requestsFilter = function(type) {
  _requestsFilter = type;
  document.querySelectorAll('.requests-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === type);
  });
  _renderRequests();
};

// ── Vote ─────────────────────────────────────────────────────────
window.requestVote = async function(requestId) {
  const uid = window._currentUid?.();
  if (!uid) { showToast('Sign in to vote'); return; }
  if (window._requestVote) await window._requestVote(requestId, uid);
};

// ── Admin status update ──────────────────────────────────────────
window.requestAdmin_updateStatus = async function(requestId, currentStatus) {
  const pw     = prompt('Admin password:');
  if (!pw) return;
  const hashed = await _sha256(pw.trim());
  if (hashed !== ADMIN_HASH) { showToast('Incorrect password'); return; }

  // Show status picker
  document.getElementById('statusPickerOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id    = 'statusPickerOverlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(26,18,8,.55);z-index:300;' +
    'display:flex;align-items:center;justify-content:center;padding:1rem';
  overlay.innerHTML = `
    <div style="background:var(--warm-white);border:1px solid var(--border);
                border-radius:6px;padding:1.5rem;width:100%;max-width:300px">
      <h3 style="font-family:'Playfair Display',serif;font-size:1.1rem;
                 color:var(--brown);margin-bottom:1rem">Update Status</h3>
      ${['new','considering','planned','done'].map(s => `
        <button onclick="requestAdmin_setStatus('${requestId}','${s}')"
                style="width:100%;text-align:left;padding:.6rem .9rem;
                       margin-bottom:.4rem;border-radius:4px;cursor:pointer;
                       border:1px solid var(--border);background:${currentStatus===s?'var(--panel)':'var(--warm-white)'};
                       font-family:'Lato',sans-serif;font-size:.88rem;
                       color:var(--ink);display:block;">
          ${_statusLabel(s)}
        </button>`).join('')}
      <button onclick="document.getElementById('statusPickerOverlay').remove()"
              style="width:100%;margin-top:.4rem;padding:.5rem;border:none;
                     background:transparent;color:var(--muted);cursor:pointer;
                     font-family:'Lato',sans-serif;font-size:.82rem;">
        Cancel
      </button>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

window.requestAdmin_setStatus = async function(requestId, status) {
  document.getElementById('statusPickerOverlay')?.remove();
  if (window._requestSetStatus) await window._requestSetStatus(requestId, status);
  showToast(`Status updated to: ${_statusLabel(status)}`);
};

// ── New request modal ────────────────────────────────────────────
window.showNewRequestModal = function() {
  document.getElementById('newRequestOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id    = 'newRequestOverlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(26,18,8,.55);z-index:300;' +
    'display:flex;align-items:center;justify-content:center;padding:1rem';
  overlay.innerHTML = `
    <div style="background:var(--warm-white);border:1px solid var(--border);
                border-radius:6px;padding:1.5rem;width:100%;max-width:380px">
      <h3 style="font-family:'Playfair Display',serif;font-size:1.1rem;
                 color:var(--brown);margin-bottom:1rem">New Request</h3>
      <div class="form-row">
        <label>Type</label>
        <select id="newRequestType">
          <option value="recipe">🍰 Recipe Request</option>
          <option value="feature">⚙ Feature Request</option>
        </select>
      </div>
      <div class="form-row">
        <label>Title</label>
        <input type="text" id="newRequestTitle" placeholder="e.g. Add a sourdough recipe"/>
      </div>
      <div class="form-row">
        <label>Description (optional)</label>
        <textarea id="newRequestDesc" rows="3"
                  placeholder="Any extra details…"></textarea>
      </div>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem">
        <button onclick="document.getElementById('newRequestOverlay').remove()"
                class="btn-cancel">Cancel</button>
        <button onclick="submitNewRequest()" class="btn-save">Submit</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('newRequestTitle')?.focus(), 80);
};

window.submitNewRequest = async function() {
  const type  = document.getElementById('newRequestType')?.value;
  const title = document.getElementById('newRequestTitle')?.value.trim();
  const desc  = document.getElementById('newRequestDesc')?.value.trim();
  if (!title) { showToast('Please enter a title'); return; }
  document.getElementById('newRequestOverlay')?.remove();
  if (window._submitRequest) await window._submitRequest({ type, title, desc });
  showToast('Request submitted ✓');
};
