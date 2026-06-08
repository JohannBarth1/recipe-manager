/* ════════════════════════════════════════════════════════════════
   js/firebase.js  (ES module — loaded last in index.html)
   ════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, deleteDoc,
  collection, addDoc, getDocs, onSnapshot,
  query, orderBy, serverTimestamp, writeBatch, updateDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAhaUyytbY_ynqEgdZJh40SbSJKL8jKbeg",
  authDomain:        "erecipe-ab5e4.firebaseapp.com",
  projectId:         "erecipe-ab5e4",
  storageBucket:     "erecipe-ab5e4.firebasestorage.app",
  messagingSenderId: "73525633063",
  appId:             "1:73525633063:web:319615f3b1cc0f794c2e02"
};

const app      = initializeApp(firebaseConfig);
const db       = getFirestore(app);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

const RECIPES_COL  = 'shared_recipes';
const CHAPTERS_COL = 'shared_chapters';

let currentUser      = null;
let chatRecipeId     = null;
let chatUnsub        = null;
let allCommentUnsubs = [];


// ════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════

document.getElementById("btnGoogleSignIn").addEventListener("click", async () => {
  try { await signInWithPopup(auth, provider); }
  catch (e) { showToast("Google sign-in failed"); console.error(e); }
});

window.logout = async function () {
  _clearAllCommentSubs();
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  try { await signOut(auth); } catch (e) { console.error(e); }
};

onAuthStateChanged(auth, async user => {
  const loginScreen = document.getElementById("loginScreen");

  if (!user) {
    // ── Signed out ──────────────────────────────────────────────
    currentUser = null;
    if (window.updateUserBadge) updateUserBadge(null);
    _clearAllCommentSubs();
    if (loginScreen) {
      loginScreen.style.opacity = '1';
      loginScreen.style.display = 'flex';
      loginScreen.classList.remove('hidden');
    }
    return;
  }

  // ── Signed in ───────────────────────────────────────────────
  currentUser = user;
  if (window.updateUserBadge) updateUserBadge(user);
  if (loginScreen) {
    loginScreen.classList.add('hidden');
    setTimeout(() => loginScreen.style.display = 'none', 300);
  }

  // Persist basic profile
  try {
    await setDoc(doc(db, "users", user.uid), {
      displayName: user.displayName || "",
      email:       user.email       || "",
      photoURL:    user.photoURL    || "",
      updatedAt:   Date.now()
    }, { merge: true });
  } catch (e) { console.error("User profile save failed:", e); }

  // Load cleared notifications from Firestore
  if (window.notif_loadCleared) await notif_loadCleared();

  // Load recipes
  if (getMode() === 'public') {
    await firestoreLoad();
  } else {
    _subscribeAllCommentNotifications();
  }

// Subscribe to community features
  if (window.community_subscribe) {
    community_subscribe(
      db, collection, query, orderBy,
      addDoc, serverTimestamp,
      () => currentUser
    );
  }

  // Subscribe to broadcasts
  if (window.broadcasts_subscribe) {
    broadcasts_subscribe(db, collection, query, orderBy);
  }
});


// ════════════════════════════════════════════════════════════════
// PER-RECIPE FIRESTORE OPERATIONS
// ════════════════════════════════════════════════════════════════

window.firestoreSaveRecipe = async function (recipe) {
  if (!currentUser) return;
  if (!recipe?.id) return;
  try {
    await setDoc(
      doc(db, RECIPES_COL, recipe.id),
      { ...recipe, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error('firestoreSaveRecipe error:', e);
    showToast('Cloud sync failed — check console');
  }
};

window.firestoreSaveChapter = async function (chapter) {
  if (!currentUser) return;
  if (!chapter?.id) return;
  try {
    await setDoc(
      doc(db, CHAPTERS_COL, chapter.id),
      { ...chapter, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) { console.error('firestoreSaveChapter error:', e); }
};

window.firestoreDeleteRecipe = async function (recipeId) {
  if (!currentUser) return;
  if (!recipeId) return;
  try {
    await deleteDoc(doc(db, RECIPES_COL, recipeId));
  } catch (e) { console.error('firestoreDeleteRecipe error:', e); }
};

window.firestoreDeleteChapter = async function (chapterId) {
  if (!currentUser) return;
  if (!chapterId) return;
  try {
    await deleteDoc(doc(db, CHAPTERS_COL, chapterId));
  } catch (e) { console.error('firestoreDeleteChapter error:', e); }
};

// ════════════════════════════════════════════════════════════════
// BULK SAVE / LOAD
// ════════════════════════════════════════════════════════════════

window.firestoreSaveAll = async function () {
  if (!currentUser) { showToast("Sign in first"); return; }
  showToast("Saving to shared book…");
  try {
    const batch = writeBatch(db);
    for (const r of data.recipes) {
      batch.set(doc(db, RECIPES_COL, r.id), { ...r, updatedAt: serverTimestamp() }, { merge: true });
    }
    for (const c of data.chapters) {
      batch.set(doc(db, CHAPTERS_COL, c.id), { ...c, updatedAt: serverTimestamp() }, { merge: true });
    }
    await batch.commit();
    showToast(`Saved ${data.recipes.length} recipe${data.recipes.length !== 1 ? 's' : ''} ✓`);
  } catch (e) { showToast("Save failed — check console"); console.error(e); }
};
window.firestoreSaveShared = window.firestoreSaveAll;

window.firestoreLoad = async function () {
  showToast("Loading shared recipes…");
  try {
    const [recipeSnap, chapterSnap] = await Promise.all([
      getDocs(collection(db, RECIPES_COL)),
      getDocs(collection(db, CHAPTERS_COL))
    ]);

    const recipes  = recipeSnap.docs.map(d  => { const r = d.data(); delete r.updatedAt; return r; });
    const chapters = chapterSnap.docs.map(d => { const c = d.data(); delete c.updatedAt; return c; });

    if (!chapters.length && !recipes.length) {
      showToast("No shared recipes found yet — add some!");
      return;
    }

    const localOrder = data.chapters.map(c => c.id);
    const sorted = [
      ...chapters.filter(c =>  localOrder.includes(c.id))
                 .sort((a, b) => localOrder.indexOf(a.id) - localOrder.indexOf(b.id)),
      ...chapters.filter(c => !localOrder.includes(c.id))
    ];

    data = { recipes, chapters: sorted.length ? sorted : chapters };

    if (!data.chapters.length && recipes.length) {
      const seen = new Set();
      data.chapters = [];
      for (const r of recipes) {
        if (r.chapterId && !seen.has(r.chapterId)) {
          seen.add(r.chapterId);
          data.chapters.push({ id: r.chapterId, name: r.chapterId });
        }
      }
    }

    openChapters  = new Set([data.chapters[0]?.id]);
    persistToStorage();

    deskCurrentId = null; deskEditingId = null;
    mobCurrentId  = null; mobEditingId  = null;

    renderAll();

    const lastId     = getLastRecipeId();
    const lastRecipe = lastId && data.recipes.find(r => r.id === lastId);
    if (lastRecipe) {
      if (window.innerWidth > 640) desk_showRecipe(lastId);
      else mob_showRecipe(lastId);
    } else {
      showPanel('deskWelcome');
      mob_backToList();
    }

    showToast(`Loaded ${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} ✓`);
    _subscribeAllCommentNotifications();
  } catch (e) { showToast("Load failed — check console"); console.error(e); }
};
window.firestoreLoadShared = window.firestoreLoad;
window._currentDisplayName = () => currentUser?.displayName || currentUser?.email || '';


// ════════════════════════════════════════════════════════════════
// COMMENT NOTIFICATIONS
// ════════════════════════════════════════════════════════════════

function _clearAllCommentSubs() {
  allCommentUnsubs.forEach(u => u());
  allCommentUnsubs = [];
}

function _subscribeAllCommentNotifications() {
  _clearAllCommentSubs();
  if (!data.recipes.length) return;

  for (const recipe of data.recipes) {
    let isInitial = true;

    const unsub = onSnapshot(
      query(
        collection(db, 'recipe_comments', recipe.id, 'messages'),
        orderBy('createdAt', 'asc')
      ),
      snap => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Old bell dropdown notifications
        if (window.notif_onNewComments) {
          notif_onNewComments(msgs, recipe.id, recipe.title, currentUser?.uid, isInitial);
        }

        // New unified community feed notifications
        if (!isInitial && window.community_onRecipeComment) {
          snap.docChanges().forEach(change => {
            if (change.type !== 'added') return;
            const m = { id: change.doc.id, ...change.doc.data() };
            community_onRecipeComment(m, recipe.id, recipe.title, currentUser?.uid);
          });
        }

        isInitial = false;
      },
      err => console.warn('Notification sub error for', recipe.id, err)
    );
    allCommentUnsubs.push(unsub);
  }
}


// ════════════════════════════════════════════════════════════════
// RECIPE COMMENTS (active recipe view)
// ════════════════════════════════════════════════════════════════

function _escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function _renderChatMessages(msgs, containerIds) {
  containerIds.forEach(cid => {
    const el = document.getElementById(cid);
    if (!el) return;

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (!msgs.length) { el.innerHTML = ''; return; }

    el.innerHTML = msgs.map(m => {
      const mine   = m.uid === currentUser?.uid;
      const name   = m.displayName || 'Unknown';
      const time   = _fmtTime(m.createdAt);
      const avatar = m.photoURL
        ? `<img class="msg-avatar" src="${_escHtml(m.photoURL)}" alt="${_escHtml(name)}"/>`
        : `<div class="msg-avatar-init">${name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`;
      const delBtn = mine
        ? `<button class="msg-delete-btn" onclick="recipeChat_delete('${m.id}')" title="Delete">✕</button>`
        : '';
      return `
        <div class="msg-row ${mine ? 'mine' : ''}">
          ${avatar}
          <div class="msg-bubble-wrap">
            <div class="msg-meta">
              ${mine ? '' : _escHtml(name) + ' · '}${time}${delBtn}
            </div>
            <div class="msg-bubble">${_escHtml(m.text)}</div>
          </div>
        </div>`;
    }).join('');

    if (atBottom) el.scrollTop = el.scrollHeight;
  });
}

window.recipeChat_load = function (recipeId) {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  chatRecipeId = recipeId;

  ['deskViewChat', 'mobViewChat'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  ['deskChatInput', 'mobChatInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  if (!recipeId) return;

  const q = query(
    collection(db, 'recipe_comments', recipeId, 'messages'),
    orderBy('createdAt', 'asc')
  );

  chatUnsub = onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderChatMessages(msgs, ['deskChatMsgs', 'mobChatMsgs']);
    if (window.markNotifRead) {
      msgs.forEach(m => { if (m.uid !== currentUser?.uid) markNotifRead(m.id); });
    }
  }, err => console.error('Chat error:', err));
};

window.recipeChat_keydown = function (e, prefix) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); recipeChat_send(prefix); }
};

window.recipeChat_send = async function (prefix) {
  if (!currentUser) { showToast('Sign in to comment'); return; }
  if (!chatRecipeId) return;
  const input = document.getElementById(`${prefix}ChatInput`);
  const text  = input?.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await addDoc(collection(db, 'recipe_comments', chatRecipeId, 'messages'), {
      text,
      uid:         currentUser.uid,
      displayName: currentUser.displayName || currentUser.email,
      photoURL:    currentUser.photoURL    || '',
      createdAt:   serverTimestamp()
    });
  } catch (e) { showToast('Failed to send'); console.error(e); }
};

window.recipeChat_delete = async function (msgId) {
  if (!currentUser || !chatRecipeId) return;
  if (!confirm('Delete this comment?')) return;
  try {
    await deleteDoc(doc(db, 'recipe_comments', chatRecipeId, 'messages', msgId));
  } catch (e) { showToast('Could not delete comment'); console.error(e); }
};


// ════════════════════════════════════════════════════════════════
// CLEARED NOTIFICATIONS (persisted to Firestore)
// ════════════════════════════════════════════════════════════════

window.persistClearedNotifs = async function(ids) {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid),
      { clearedNotifs: [...ids] }, { merge: true });
  } catch(e) { console.error('persistClearedNotifs error:', e); }
};

window.loadClearedNotifs = async function() {
  if (!currentUser) return new Set();
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid));
    return new Set(snap.data()?.clearedNotifs || []);
  } catch(e) { return new Set(); }
};


// ════════════════════════════════════════════════════════════════
// COMMUNITY REQUESTS — Firestore operations
// ════════════════════════════════════════════════════════════════

window._submitRequest = async function({ type, title, desc }) {
  if (!currentUser) { showToast('Sign in first'); return; }
  try {
    await addDoc(collection(db, 'community_requests'), {
      type,
      title,
      description:  desc || '',
      uid:          currentUser.uid,
      displayName:  currentUser.displayName || currentUser.email,
      votes:        0,
      voters:       [],
      status:       'new',
      createdAt:    serverTimestamp()
    });
  } catch(e) { showToast('Submit failed'); console.error(e); }
};

window._requestVote = async function(requestId, uid) {
  try {
    const ref    = doc(db, 'community_requests', requestId);
    const snap   = await getDoc(ref);
    if (!snap.exists()) return;
    const voters   = snap.data().voters || [];
    const hasVoted = voters.includes(uid);
    await setDoc(ref, {
      votes:  hasVoted ? snap.data().votes - 1 : snap.data().votes + 1,
      voters: hasVoted ? voters.filter(v => v !== uid) : [...voters, uid]
    }, { merge: true });
  } catch(e) { showToast('Vote failed'); console.error(e); }
};

window._requestSetStatus = async function(requestId, status) {
  try {
    await setDoc(doc(db, 'community_requests', requestId), { status }, { merge: true });
  } catch(e) { showToast('Status update failed'); console.error(e); }
};

window._requestEdit = async function(requestId, { type, title, desc }) {
  try {
    await setDoc(doc(db, 'community_requests', requestId), {
      type, title, description: desc || ''
    }, { merge: true });
  } catch(e) { showToast('Edit failed'); console.error(e); }
};

window._requestDelete = async function(requestId) {
  try {
    await deleteDoc(doc(db, 'community_requests', requestId));
  } catch(e) { showToast('Delete failed'); console.error(e); }
};

window._requestChat_delete = async function(requestId, msgId) {
  if (!currentUser) return;
  try {
    await deleteDoc(doc(db, 'request_comments', requestId, 'messages', msgId));
  } catch(e) { showToast('Could not delete message'); console.error(e); }
};

window._requestChat_send = async function (requestId, text) {
  if (!currentUser) return;
  try {
    await addDoc(collection(db, 'request_comments', requestId, 'messages'), {
      text,
      uid:         currentUser.uid,
      displayName: currentUser.displayName || currentUser.email,
      photoURL:    currentUser.photoURL    || '',
      createdAt:   serverTimestamp()
    });
  } catch (e) { showToast('Failed to send'); console.error(e); }
};

// ════════════════════════════════════════════════════════════════
// BROADCASTS
// ════════════════════════════════════════════════════════════════

window._sendBroadcast = async function(message) {
  if (!currentUser) return;
  try {
    await addDoc(collection(db, 'broadcasts'), {
      message,
      uid:       currentUser.uid,
      createdAt: serverTimestamp()
    });
  } catch(e) { showToast('Broadcast failed'); console.error(e); }
};

window._broadcastEdit = async function (broadcastId, message) {
  try {
    await setDoc(doc(db, 'broadcasts', broadcastId),
      { message }, { merge: true });
  } catch (e) { showToast('Edit failed'); console.error(e); }
};

window._broadcastDelete = async function (broadcastId) {
  try {
    await deleteDoc(doc(db, 'broadcasts', broadcastId));
  } catch (e) { showToast('Delete failed'); console.error(e); }
};
// ════════════════════════════════════════════════════════════════
// MISC HELPERS
// ════════════════════════════════════════════════════════════════

// Expose Firestore refs so community.js can use them
window._firestoreRefs = { onSnapshot };
window._firestoreDb        = db;
window._firestoreQueryRefs = { collection, query, orderBy };

window._currentUid         = () => currentUser?.uid;
window._currentDisplayName = () => currentUser?.displayName || currentUser?.email || '';

// User badge (avatar in header)
window.updateUserBadge = function(user) {
  const badge  = document.getElementById('userBadge');
  const avatar = document.getElementById('userAvatar');
  const name   = document.getElementById('avatarMenuName');
  if (!badge) return;
  if (user) {
    if (avatar) avatar.src = user.photoURL || '';
    if (name)   name.textContent = user.displayName || user.email || '';
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
};

window.toggleAvatarMenu = function() {
  const menu = document.getElementById('avatarMenu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

// Close avatar menu when clicking outside
document.addEventListener('click', e => {
  const badge = document.getElementById('userBadge');
  const menu  = document.getElementById('avatarMenu');
  if (menu && badge && !badge.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// Close desktop settings when clicking outside
document.addEventListener('click', e => {
  const settings = document.getElementById('deskSettings');
  const btn      = document.querySelector('[onclick="toggleDeskSettings()"]');
  if (settings && settings.classList.contains('open') &&
      !settings.contains(e.target) && !btn?.contains(e.target)) {
    settings.classList.remove('open');
  }
});

window.toggleDeskSettings = function() {
  document.getElementById('deskSettings')?.classList.toggle('open');
};

window.getMode = function() {
  return localStorage.getItem('hk_mode') || 'private';
};
