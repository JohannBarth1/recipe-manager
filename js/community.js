/* ════════════════════════════════════════════════════════════════
   js/community.js
   Community panel: Notifications feed, Requests + per-request chat,
   Challenges (stub), Admin broadcasts
   ════════════════════════════════════════════════════════════════ */

/* ── Constants ──────────────────────────────────────────────────── */
const ADMIN_HASH        = '3f83e9ad5be63bd5bf2fd009fffe6b7dd4066243975bc962edc37459c17e65b9';
const COMMUNITY_SEEN_KEY = 'hk_community_seen';

/* ── State ──────────────────────────────────────────────────────── */
let _requestsFilter    = 'all';
let _requests          = [];
let _requestsUnsub     = null;

// Per-request chat state
let _openRequestId     = null;   // which request chat is expanded
let _requestChatUnsubs = {};     // requestId → unsub fn

// Inline form state
let _editingRequestId  = null;   // which card is showing the edit form
let _showingNewForm    = false;  // whether the new-request form is visible

/* ════════════════════════════════════════════════════════════════
   PANEL TOGGLE & TAB SWITCHER
   ════════════════════════════════════════════════════════════════ */

window.toggleCommunityPanel = function () {
  const panel = document.getElementById('communitySlidein');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (isOpen) {
    if (window.notif_markAllReadOnOpen) notif_markAllReadOnOpen();
  }
};

window.switchCommunityTab = function (tab) {
  document.querySelectorAll('.community-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.community-section').forEach(s => {
    s.classList.remove('active');
  });
  const sectionMap = {
    notifications: ['communityNotifs',    'communityNotifsDesk'],
    requests:      ['communityRequests',  'communityRequestsDesk'],
    challenges:    ['communityChallenges','communityChallengesDesk']
  };
  (sectionMap[tab] || []).forEach(id => {
    document.getElementById(id)?.classList.add('active');
  });
  if (tab === 'notifications') {
    if (window._renderCommunityFeed) _renderCommunityFeed();
    if (window.notif_markAllReadOnOpen) notif_markAllReadOnOpen();
  }
  if (tab === 'requests') _renderRequests();
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
  requests_subscribe(db, collection, query, orderBy);
};

/* ════════════════════════════════════════════════════════════════
   RECIPE COMMENT HOOK
   ════════════════════════════════════════════════════════════════ */

window.community_onRecipeComment = function (msg, recipeId, recipeTitle, myUid) {
  if (window.notif_onNewComments) {
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

  // Build the list HTML — prepend inline new-request form if open
  const newFormHtml = _showingNewForm ? _newRequestFormHtml() : '';

  const listHtml = filtered.length
    ? filtered.map(r => _requestCardHtml(r, myUid)).join('')
    : '<div class="request-empty">No requests yet — add the first one!</div>';

  ['requestsList', 'requestsListDesk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = newFormHtml + listHtml;
  });

  // Update the "+ New" button label
  document.querySelectorAll('.requests-new-btn').forEach(btn => {
    btn.textContent = _showingNewForm ? '✕ Cancel' : '+ New';
  });
}

/* ════════════════════════════════════════════════════════════════
   INLINE NEW REQUEST FORM
   ════════════════════════════════════════════════════════════════ */

function _newRequestFormHtml() {
  return `
    <div class="request-inline-form" id="newRequestForm">
      <div class="request-inline-form-title">New Request</div>
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
               placeholder="e.g. Add a sourdough recipe"
               autocomplete="off"/>
      </div>
      <div class="form-row">
        <label>Description <span style="font-weight:400;text-transform:none">(optional)</span></label>
        <textarea id="newRequestDesc" rows="2"
                  placeholder="Any extra details…"></textarea>
      </div>
      <div class="request-inline-form-actions">
        <button class="btn-cancel" onclick="requestCancelNew()">Cancel</button>
        <button class="btn-save"   onclick="submitNewRequest()">Submit</button>
      </div>
    </div>`;
}

window.showNewRequestModal = function () {
  _showingNewForm = !_showingNewForm;
  // Close edit form if open
  if (_showingNewForm) _editingRequestId = null;
  _renderRequests();
  if (_showingNewForm) {
    setTimeout(() => document.getElementById('newRequestTitle')?.focus(), 80);
  }
};

window.requestCancelNew = function () {
  _showingNewForm = false;
  _renderRequests();
};

window.submitNewRequest = async function () {
  const type  = document.getElementById('newRequestType')?.value;
  const title = document.getElementById('newRequestTitle')?.value.trim();
  const desc  = document.getElementById('newRequestDesc')?.value.trim();
  if (!title) { showToast('Please enter a title'); return; }
  _showingNewForm = false;
  if (window._submitRequest) await window._submitRequest({ type, title, desc });
  showToast('Request submitted ✓');
};

/* ════════════════════════════════════════════════════════════════
   REQUEST CARD
   ════════════════════════════════════════════════════════════════ */

function _requestCardHtml(r, myUid) {
  const voted    = (r.voters || []).includes(myUid);
  const isOwner  = r.uid === myUid;
  const chatOpen = _openRequestId === r.id;
  const editing  = _editingRequestId === r.id;

  // Show inline edit form instead of normal card content when editing
  if (editing) {
    return `
      <div class="request-card" id="rcard-${r.id}">
        <div class="request-inline-form-title">Edit Request</div>
        <div class="form-row">
          <label>Type</label>
          <select id="editRequestType">
            <option value="recipe"  ${r.type === 'recipe'  ? 'selected' : ''}>🍰 Recipe Request</option>
            <option value="feature" ${r.type === 'feature' ? 'selected' : ''}>⚙ Feature Request</option>
          </select>
        </div>
        <div class="form-row">
          <label>Title</label>
          <input type="text" id="editRequestTitle"
                 value="${_cEsc(r.title)}" autocomplete="off"/>
        </div>
        <div class="form-row">
          <label>Description <span style="font-weight:400;text-transform:none">(optional)</span></label>
          <textarea id="editRequestDesc" rows="2">${_cEsc(r.description || '')}</textarea>
        </div>
        <div class="request-inline-form-actions">
          <button class="btn-cancel" onclick="requestCancelEdit()">Cancel</button>
          <button class="btn-save"   onclick="submitRequestEdit('${r.id}')">Save</button>
        </div>
      </div>`;
  }

  return `
    <div class="request-card" id="rcard-${r.id}">
      <div class="request-card-top">
        <span class="request-tag ${r.type}">
          ${r.type === 'recipe' ? '🍰 Recipe' : '⚙ Feature'}
        </span>
        <span class="request-status ${r.status || 'new'}"
              onclick="requestCycleStatus('${r.id}','${r.status || 'new'}')"
              title="Click to change status">
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
                    onclick="requestStartEdit('${r.id}')">✏ Edit</button>
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
   STATUS — cycle through without password
   ════════════════════════════════════════════════════════════════ */

window.requestCycleStatus = async function (requestId, currentStatus) {
  const cycle = ['new', 'considering', 'planned', 'done'];
  const next  = cycle[(cycle.indexOf(currentStatus) + 1) % cycle.length];
  if (window._requestSetStatus) await window._requestSetStatus(requestId, next);
  showToast(`Status: ${_statusLabel(next)}`);
};

/* ════════════════════════════════════════════════════════════════
   INLINE EDIT FORM
   ════════════════════════════════════════════════════════════════ */

window.requestStartEdit = function (requestId) {
  _editingRequestId = requestId;
  _showingNewForm   = false;       // close new form if open
  _renderRequests();
  setTimeout(() => document.getElementById('editRequestTitle')?.focus(), 80);
};

window.requestCancelEdit = function () {
  _editingRequestId = null;
  _renderRequests();
};

window.submitRequestEdit = async function (requestId) {
  const type  = document.getElementById('editRequestType')?.value;
  const title = document.getElementById('editRequestTitle')?.value.trim();
  const desc  = document.getElementById('editRequestDesc')?.value.trim();
  if (!title) { showToast('Please enter a title'); return; }
  _editingRequestId = null;
  if (window._requestEdit) await window._requestEdit(requestId, { type, title, desc });
  showToast('Request updated ✓');
};

/* ════════════════════════════════════════════════════════════════
   FILTER / VOTE / DELETE
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

/* ════════════════════════════════════════════════════════════════
   PER-REQUEST CHAT
   ════════════════════════════════════════════════════════════════ */

window.requestToggleChat = function (requestId) {
  const wasOpen = _openRequestId === requestId;

  if (_openRequestId) {
    const oldChat = document.getElementById(`rchat-${_openRequestId}`);
    if (oldChat) oldChat.classList.remove('open');
    if (_requestChatUnsubs[_openRequestId]) {
      _requestChatUnsubs[_openRequestId]();
      delete _requestChatUnsubs[_openRequestId];
    }
    _openRequestId = null;
  }

  if (wasOpen) { _renderRequests(); return; }

  _openRequestId = requestId;
  _renderRequests();
  _subscribeRequestChat(requestId);
};

function _subscribeRequestChat(requestId) {
  const { onSnapshot } = window._firestoreRefs || {};
  if (!onSnapshot || !window._firestoreDb) return;

  const { collection, query, orderBy } = window._firestoreQueryRefs || {};
  if (!collection) return;

  const q = query(
    collection(window._firestoreDb, 'request_comments', requestId, 'messages'),
    orderBy('createdAt', 'asc')
  );

  let isInitialLoad = true;

  const unsub = onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderRequestChatMsgs(requestId, msgs);

    if (!isInitialLoad) {
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
    }
    isInitialLoad = false;
  }, err => console.error('Request chat sub error:', requestId, err));

  _requestChatUnsubs[requestId] = unsub;
}

function _renderRequestChatMsgs(requestId, msgs) {
  const el = document.getElementById(`rchat-msgs-${requestId}`);
  if (!el) return;

  const myUid    = window._currentUid?.();
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;

  if (!msgs.length) { el.innerHTML = ''; return; }

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

    el.addEventListener('mousedown',   start);
    el.addEventListener('touchstart',  start,  { passive: true });
    el.addEventListener('mouseup',     cancel);
    el.addEventListener('mouseleave',  cancel);
    el.addEventListener('touchend',    cancel);
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
   INIT
   ════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  _initBroadcastTrigger();
});
