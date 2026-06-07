/* ════════════════════════════════════════════════════════════════
   js/community.js
   Community panel: Notifications feed, Requests + per-request chat,
   Challenges (stub), Admin broadcasts
   ════════════════════════════════════════════════════════════════ */

/* ── Constants ──────────────────────────────────────────────────── */
const ADMIN_HASH        = 'a5e744d0164540d33b1d7ea616c28f2fa97e754a4a5d7bb7b11f2bcde94a8d9d';
const COMMUNITY_SEEN_KEY = 'hk_community_seen';

/* ── State ──────────────────────────────────────────────────────── */
let _requestsFilter    = 'all';
let _requests          = [];
let _requestsUnsub     = null;

// Per-request chat state
let _openRequestId     = null;      // which request card is expanded
let _requestChatUnsubs = {};        // requestId → unsub fn

/* ════════════════════════════════════════════════════════════════
   PANEL TOGGLE & TAB SWITCHER
   ════════════════════════════════════════════════════════════════ */

window.toggleCommunityPanel = function () {
  const panel = document.getElementById('communitySlidein');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (isOpen) {
    // Mark all notifications read when panel opens
    if (window.notif_markAllReadOnOpen) notif_markAllReadOnOpen();
  }
};

window.switchCommunityTab = function (tab) {
  // Update tab buttons in ALL community panels (mobile + desktop)
  document.querySelectorAll('.community-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // Hide all sections
  document.querySelectorAll('.community-section').forEach(s => {
    s.classList.remove('active');
  });

  // Show the matching sections
  const sectionMap = {
    notifications: ['communityNotifs',      'communityNotifsDesk'],
    requests:      ['communityRequests',     'communityRequestsDesk'],
    challenges:    ['communityChallenges',   'communityChallengesDesk']
  };
  (sectionMap[tab] || []).forEach(id => {
    document.getElementById(id)?.classList.add('active');
  });

  // Re-render relevant content
  if (tab === 'notifications') {
    if (window._renderCommunityFeed) _renderCommunityFeed();
    if (window.notif_markAllReadOnOpen) notif_markAllReadOnOpen();
  }
  if (tab === 'requests') {
    _renderRequests();
  }
};

/* ════════════════════════════════════════════════════════════════
   MOBILE: called from mobile.js when community tab selected
   ════════════════════════════════════════════════════════════════ */

window.community_onOpen = function () {
  if (window.notif_markAllReadOnOpen) notif_markAllReadOnOpen();
};

/* ════════════════════════════════════════════════════════════════
   SUBSCRIBE — called from firebase.js after sign-in
   ════════════════════════════════════════════════════════════════ */

window.community_subscribe = function (
  db, collection, query, orderBy,
  addDoc, serverTimestamp, currentUserFn
) {
  // Subscribe to requests
  requests_subscribe(db, collection, query, orderBy);
};

/* ════════════════════════════════════════════════════════════════
   RECIPE COMMENT HOOK — called from firebase.js _subscribeAllCommentNotifications
   ════════════════════════════════════════════════════════════════ */

window.community_onRecipeComment = function (msg, recipeId, recipeTitle, myUid) {
  // Delegate to notifications.js — it handles the feed rendering
  if (window.notif_onNewComments) {
    // Pass as a single-item array with isInitial=false
    notif_onNewComments([msg], recipeId, recipeTitle, myUid, false);
  }
};

/* ════════════════════════════════════════════════════════════════
   REQUESTS — subscribe
   ════════════════════════════════════════════════════════════════ */

window.requests_subscribe = function (db, collection, query, orderBy) {
  if (_requestsUnsub) { _requestsUnsub(); _requestsUnsub = null; }
  const { onSnapshot } = window._firestoreRefs || {};
  if (!onSnapshot) return;

  const q = query(
    collection(db, 'community_requests'),
    orderBy('votes',     'desc'),
    orderBy('createdAt', 'desc')
  );

  _requestsUnsub = onSnapshot(q, snap => {
    _requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderRequests();
  }, err => console.error('Requests sub error:', err));
};

/* ════════════════════════════════════════════════════════════════
   REQUESTS — render
   ════════════════════════════════════════════════════════════════ */

function _renderRequests() {
  const myUid    = window._currentUid?.();
  const filtered = _requestsFilter === 'all'
    ? _requests
    : _requests.filter(r => r.type === _requestsFilter);

  const html = filtered.length
    ? filtered.map(r => _requestCardHtml(r, myUid)).join('')
    : '<div class="request-empty">No requests yet — add the first one!</div>';

  ['requestsList', 'requestsListDesk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function _requestCardHtml(r, myUid) {
  const voted    = (r.voters || []).includes(myUid);
  const isOwner  = r.uid === myUid;
  const chatOpen = _openRequestId === r.id;

  return `
    <div class="request-card" id="rcard-${r.id}">
      <div class="request-card-top">
        <span class="request-tag ${r.type}">
          ${r.type === 'recipe' ? '🍰 Recipe' : '⚙ Feature'}
        </span>
        <span class="request-status ${r.status || 'new'}"
              onclick="requestAdmin_updateStatus('${r.id}','${r.status || 'new'}')"
              title="Click to update status (admin)">
          ${_statusLabel(r.status)}
        </span>
      </div>

      <div class="request-title">${_cEsc(r.title)}</div>
      ${r.description ? `<div class="request-desc">${_cEsc(r.description)}</div>` : ''}

      <div class="request-card-bottom">
        <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap">
          <span class="request-author">${_cEsc(r.displayName || 'Someone')}</span>
          <button class="request-card-btn"
                  onclick="requestToggleChat('${r.id}')">
            💬 ${chatOpen ? 'Hide' : 'Chat'}
          </button>
          ${isOwner ? `
            <button class="request-card-btn"
                    onclick="requestEditModal('${r.id}')">✏ Edit</button>
            <button class="request-card-btn danger"
                    onclick="requestDeleteConfirm('${r.id}')">🗑 Delete</button>
          ` : ''}
        </div>
        <button class="request-vote ${voted ? 'voted' : ''}"
                onclick="requestVote('${r.id}')">
          👍 ${r.votes || 0}
        </button>
      </div>

      <!-- Per-request chat -->
      <div class="request-chat ${chatOpen ? 'open' : ''}"
           id="rchat-${r.id}">
        <div class="chat-messages request-chat-msgs"
             id="rchat-msgs-${r.id}"></div>
        <div class="chat-input-row">
          <textarea class="chat-textarea"
                    id="rchat-input-${r.id}"
                    placeholder="Reply… (Enter to send)" rows="1"
                    onkeydown="requestChat_keydown(event,'${r.id}')"></textarea>
          <button class="chat-send-btn"
                  onclick="requestChat_send('${r.id}')"
                  title="Send">➤</button>
        </div>
      </div>
    </div>`;
}

function _statusLabel(status) {
  switch (status) {
    case 'considering': return '🤔 Considering';
    case 'planned':     return '📅 Planned';
    case 'done':        return '✅ Done';
    default:            return '🆕 New';
  }
}

/* ════════════════════════════════════════════════════════════════
   PER-REQUEST CHAT
   ════════════════════════════════════════════════════════════════ */

window.requestToggleChat = function (requestId) {
  const wasOpen = _openRequestId === requestId;

  // Collapse any open chat
  if (_openRequestId) {
    const oldChat = document.getElementById(`rchat-${_openRequestId}`);
    if (oldChat) oldChat.classList.remove('open');
    // Unsubscribe old listener
    if (_requestChatUnsubs[_openRequestId]) {
      _requestChatUnsubs[_openRequestId]();
      delete _requestChatUnsubs[_openRequestId];
    }
    _openRequestId = null;
  }

  if (wasOpen) {
    // Was already open — we just closed it, done
    _renderRequests();
    return;
  }

  // Open new chat
  _openRequestId = requestId;
  _renderRequests(); // re-render so card shows open state

  // Subscribe to messages
  _subscribeRequestChat(requestId);
};

function _subscribeRequestChat(requestId) {
  const { onSnapshot } = window._firestoreRefs || {};
  if (!onSnapshot || !window._firestoreDb) return;

  // We need collection/query/orderBy — stored on firebase.js exposes them
  const { collection, query, orderBy } = window._firestoreQueryRefs || {};
  if (!collection) return;

  const q = query(
    collection(window._firestoreDb, 'request_comments', requestId, 'messages'),
    orderBy('createdAt', 'asc')
  );

  const unsub = onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderRequestChatMsgs(requestId, msgs);

    // Notify others via notifications.js
    const myUid = window._currentUid?.();
    snap.docChanges().forEach(change => {
      if (change.type !== 'added') return;
      const m = { id: change.doc.id, ...change.doc.data() };
      if (m.uid === myUid) return;
      const req = _requests.find(r => r.id === requestId);
      if (window.notif_onRequestComment) {
        notif_onRequestComment(m, requestId, req?.title || 'a request', myUid);
      }
    });
  }, err => console.error('Request chat sub error:', requestId, err));

  _requestChatUnsubs[requestId] = unsub;
}

function _renderRequestChatMsgs(requestId, msgs) {
  const el = document.getElementById(`rchat-msgs-${requestId}`);
  if (!el) return;

  const myUid    = window._currentUid?.();
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;

  if (!msgs.length) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = msgs.map(m => {
    const mine   = m.uid === myUid;
    const name   = m.displayName || 'Unknown';
    const time   = _fmtTime(m.createdAt);
    const avatar = m.photoURL
      ? `<img class="msg-avatar" src="${_cEsc(m.photoURL)}" alt="${_cEsc(name)}"/>`
      : `<div class="msg-avatar-init">${name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`;
    const delBtn = mine
      ? `<button class="msg-delete-btn"
                 onclick="_deleteRequestChatMsg('${requestId}','${m.id}')"
                 title="Delete">✕</button>`
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
}

window.requestChat_keydown = function (e, requestId) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    requestChat_send(requestId);
  }
};

window.requestChat_send = async function (requestId) {
  const myUid = window._currentUid?.();
  if (!myUid) { showToast('Sign in to reply'); return; }

  const input = document.getElementById(`rchat-input-${requestId}`);
  const text  = input?.value.trim();
  if (!text) return;
  input.value = '';

  // Use firebase.js helper
  if (window._requestChat_send) {
    await window._requestChat_send(requestId, text);
  }
};

window._deleteRequestChatMsg = async function (requestId, msgId) {
  if (!confirm('Delete this message?')) return;
  if (window._requestChat_delete) {
    await window._requestChat_delete(requestId, msgId);
  }
};

/* ════════════════════════════════════════════════════════════════
   REQUESTS — filter / vote / admin
   ════════════════════════════════════════════════════════════════ */

window.requestsFilter = function (type) {
  _requestsFilter = type;
  document.querySelectorAll('.requests-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === type);
  });
  _renderRequests();
};

window.requestVote = async function (requestId) {
  const uid = window._currentUid?.();
  if (!uid) { showToast('Sign in to vote'); return; }
  if (window._requestVote) await window._requestVote(requestId, uid);
};

window.requestDeleteConfirm = function (requestId) {
  if (!confirm('Delete this request?')) return;
  if (window._requestDelete) window._requestDelete(requestId);
};

window.requestEditModal = function (requestId) {
  const r = _requests.find(x => x.id === requestId);
  if (!r) return;

  document.getElementById('editRequestOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id    = 'editRequestOverlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(26,18,8,.55);z-index:300;' +
    'display:flex;align-items:center;justify-content:center;padding:1rem';
  overlay.innerHTML = `
    <div style="background:var(--warm-white);border:1px solid var(--border);
                border-radius:6px;padding:1.5rem;width:100%;max-width:380px">
      <h3 style="font-family:'Playfair Display',serif;font-size:1.1rem;
                 color:var(--brown);margin-bottom:1rem">Edit Request</h3>
      <div class="form-row">
        <label>Type</label>
        <select id="editRequestType">
          <option value="recipe" ${r.type === 'recipe' ? 'selected' : ''}>🍰 Recipe Request</option>
          <option value="feature" ${r.type === 'feature' ? 'selected' : ''}>⚙ Feature Request</option>
        </select>
      </div>
      <div class="form-row">
        <label>Title</label>
        <input type="text" id="editRequestTitle" value="${_cEsc(r.title)}"/>
      </div>
      <div class="form-row">
        <label>Description (optional)</label>
        <textarea id="editRequestDesc" rows="3">${_cEsc(r.description || '')}</textarea>
      </div>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem">
        <button onclick="document.getElementById('editRequestOverlay').remove()"
                class="btn-cancel">Cancel</button>
        <button onclick="submitRequestEdit('${requestId}')" class="btn-save">Save</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('editRequestTitle')?.focus(), 80);
};

window.submitRequestEdit = async function (requestId) {
  const type  = document.getElementById('editRequestType')?.value;
  const title = document.getElementById('editRequestTitle')?.value.trim();
  const desc  = document.getElementById('editRequestDesc')?.value.trim();
  if (!title) { showToast('Please enter a title'); return; }
  document.getElementById('editRequestOverlay')?.remove();
  if (window._requestEdit) await window._requestEdit(requestId, { type, title, desc });
  showToast('Request updated ✓');
};

// ── Admin status update ──────────────────────────────────────────
window.requestAdmin_updateStatus = async function (requestId, currentStatus) {
  const pw = prompt('Admin password:');
  if (!pw) return;
  const hashed = await _sha256(pw.trim());
  if (hashed !== ADMIN_HASH) { showToast('Incorrect password'); return; }

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
      ${['new', 'considering', 'planned', 'done'].map(s => `
        <button onclick="requestAdmin_setStatus('${requestId}','${s}')"
                style="width:100%;text-align:left;padding:.6rem .9rem;
                       margin-bottom:.4rem;border-radius:4px;cursor:pointer;
                       border:1px solid var(--border);
                       background:${currentStatus === s ? 'var(--panel)' : 'var(--warm-white)'};
                       font-family:'Lato',sans-serif;font-size:.88rem;color:var(--ink);display:block">
          ${_statusLabel(s)}
        </button>`).join('')}
      <button onclick="document.getElementById('statusPickerOverlay').remove()"
              style="width:100%;margin-top:.4rem;padding:.5rem;border:none;
                     background:transparent;color:var(--muted);cursor:pointer;
                     font-family:'Lato',sans-serif;font-size:.82rem">
        Cancel
      </button>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

window.requestAdmin_setStatus = async function (requestId, status) {
  document.getElementById('statusPickerOverlay')?.remove();
  if (window._requestSetStatus) await window._requestSetStatus(requestId, status);
  showToast(`Status updated to: ${_statusLabel(status)}`);
};

/* ════════════════════════════════════════════════════════════════
   NEW REQUEST MODAL
   ════════════════════════════════════════════════════════════════ */

window.showNewRequestModal = function () {
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
        <input type="text" id="newRequestTitle"
               placeholder="e.g. Add a sourdough recipe"/>
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

window.submitNewRequest = async function () {
  const type  = document.getElementById('newRequestType')?.value;
  const title = document.getElementById('newRequestTitle')?.value.trim();
  const desc  = document.getElementById('newRequestDesc')?.value.trim();
  if (!title) { showToast('Please enter a title'); return; }
  document.getElementById('newRequestOverlay')?.remove();
  if (window._submitRequest) await window._submitRequest({ type, title, desc });
  showToast('Request submitted ✓');
};

/* ════════════════════════════════════════════════════════════════
   ADMIN BROADCAST (long-press on community button)
   ════════════════════════════════════════════════════════════════ */

function _initBroadcastTrigger() {
  ['commBroadcastTriggerDesk', 'commBroadcastTriggerMob'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    let pressTimer = null;

    const start = () => {
      pressTimer = setTimeout(async () => {
        const pw = prompt('Admin password:');
        if (!pw) return;
        const hashed = await _sha256(pw.trim());
        if (hashed !== ADMIN_HASH) { showToast('Incorrect password'); return; }

        const msg = prompt('Broadcast message:');
        if (!msg?.trim()) return;
        if (window._sendBroadcast) await window._sendBroadcast(msg.trim());
        showToast('Broadcast sent ✓');
      }, 800);
    };

    const cancel = () => clearTimeout(pressTimer);

    el.addEventListener('mousedown',  start);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('mouseup',    cancel);
    el.addEventListener('mouseleave', cancel);
    el.addEventListener('touchend',   cancel);
    el.addEventListener('touchcancel', cancel);
  });
}

/* ════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════ */

async function _sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function _fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function _cEsc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ════════════════════════════════════════════════════════════════
   INIT (runs once DOM is ready)
   ════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  _initBroadcastTrigger();
});
