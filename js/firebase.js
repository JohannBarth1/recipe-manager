/* ════════════════════════════════════════════════════════════════
   js/firebase.js  (ES module — loaded last in index.html)

   Exports to window:
     firestoreSaveRecipe(recipe)    — called by desktop.js / mobile.js on save
     firestoreDeleteRecipe(id)      — called by desktop.js / mobile.js on delete
     firestoreSaveChapter(chapter)  — called by render.js on chapter add
     firestoreSaveAll()             — "Save" button (bulk push)
     firestoreLoad()                — "Load" button (bulk pull)
     recipeChat_load(recipeId)      — load & subscribe to comments
     recipeChat_keydown(e, prefix)  — textarea keydown handler
     recipeChat_send(prefix)        — send a comment
     recipeChat_delete(msgId)       — delete own comment
     logout()                       — sign out
   ════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, deleteDoc,
  collection, addDoc, getDocs, onSnapshot,
  query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// ── Config — replace with your own project values ────────────────
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

// ── Firestore collection names ───────────────────────────────────
const RECIPES_COL  = 'shared_recipes';   // one doc per recipe
const CHAPTERS_COL = 'shared_chapters';  // one doc per chapter

// ── Runtime state ────────────────────────────────────────────────
let currentUser       = null;
let chatRecipeId      = null;
let chatUnsub         = null;   // active comment listener for the open recipe
let allCommentUnsubs  = [];     // notification listeners for all recipes


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
    currentUser = null;
    _clearAllCommentSubs();
    if (loginScreen) {
      loginScreen.style.opacity = '1';
      loginScreen.style.display = 'flex';
      loginScreen.classList.remove('hidden');
    }
    return;
  }

  // Signed in
  currentUser = user;
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
// In public mode, auto-load shared recipes on every sign-in / page refresh
 if (getMode() === 'public') {
    await firestoreLoad();
  } else {
    _subscribeAllCommentNotifications();
  }
});


// ════════════════════════════════════════════════════════════════
// PER-RECIPE FIRESTORE OPERATIONS
// Called automatically from desktop.js and mobile.js
// ════════════════════════════════════════════════════════════════

/**
 * Save (or update) a single recipe document.
 * Called whenever a recipe is added or edited.
 */
window.firestoreSaveRecipe = async function (recipe) {
  if (!currentUser) return;   // not signed in — skip silently
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

/**
 * Save (or update) a single chapter document.
 * Called whenever a chapter is added.
 */
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

/**
 * Delete a recipe document.
 * Called whenever a recipe is deleted locally.
 */
window.firestoreDeleteRecipe = async function (recipeId) {
  if (!currentUser) return;
  if (!recipeId) return;
  try {
    await deleteDoc(doc(db, RECIPES_COL, recipeId));
  } catch (e) { console.error('firestoreDeleteRecipe error:', e); }
};


// ════════════════════════════════════════════════════════════════
// BULK SAVE — "Save" button
// Pushes all local recipes & chapters to Firestore in one batch.
// Nothing is deleted from Firestore — additive only.
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

// Keep the old name working so any bookmarked calls don't break
window.firestoreSaveShared = window.firestoreSaveAll;


// ════════════════════════════════════════════════════════════════
// BULK LOAD — "Load" button
// Pulls all Firestore recipes & chapters, merges into local data.
// ════════════════════════════════════════════════════════════════

window.firestoreLoad = async function () {
  showToast("Loading shared recipes…");
  try {
    const [recipeSnap, chapterSnap] = await Promise.all([
      getDocs(collection(db, RECIPES_COL)),
      getDocs(collection(db, CHAPTERS_COL))
    ]);

    // Strip server-only fields before storing locally
    const recipes  = recipeSnap.docs.map(d  => { const r = d.data(); delete r.updatedAt; return r; });
    const chapters = chapterSnap.docs.map(d => { const c = d.data(); delete c.updatedAt; return c; });

    if (!chapters.length && !recipes.length) {
      showToast("No shared recipes found yet — add some!");
      return;
    }

    // Preserve the user's local chapter ordering where possible
    const localOrder = data.chapters.map(c => c.id);
    const sorted = [
      ...chapters.filter(c =>  localOrder.includes(c.id))
                 .sort((a, b) => localOrder.indexOf(a.id) - localOrder.indexOf(b.id)),
      ...chapters.filter(c => !localOrder.includes(c.id))
    ];

    data = {
      recipes,
      chapters: sorted.length ? sorted : chapters
    };

    // Fallback: if Firestore has no chapter docs, reconstruct from recipe chapterId fields
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

    // Reset view state
    deskCurrentId = null; deskEditingId = null;
    mobCurrentId  = null; mobEditingId  = null;

    renderAll();
    showPanel('deskWelcome');
    mob_backToList();
    showToast(`Loaded ${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} ✓`);

    // Re-subscribe notifications for the newly loaded recipe set
    _subscribeAllCommentNotifications();
  } catch (e) { showToast("Load failed — check console"); console.error(e); }
};

// Keep the old name working
window.firestoreLoadShared = window.firestoreLoad;


// ════════════════════════════════════════════════════════════════
// COMMENT NOTIFICATIONS
// Subscribe to comment streams for every recipe so we can surface
// new comments as notification bell items.
// ════════════════════════════════════════════════════════════════

function _clearAllCommentSubs() {
  allCommentUnsubs.forEach(u => u());
  allCommentUnsubs = [];
}

function _subscribeAllCommentNotifications() {
  _clearAllCommentSubs();
  for (const recipe of data.recipes) {
    const unsub = onSnapshot(
      query(collection(db, 'recipe_comments', recipe.id, 'messages'), orderBy('createdAt', 'asc')),
      snap => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (window.notif_onNewComments) {
          notif_onNewComments(msgs, recipe.id, recipe.title, currentUser?.uid);
        }
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
      const mine    = m.uid === currentUser?.uid;
      const name    = m.displayName || 'Unknown';
      const time    = _fmtTime(m.createdAt);
      const avatar  = m.photoURL
        ? `<img class="msg-avatar" src="${_escHtml(m.photoURL)}" alt="${_escHtml(name)}"/>`
        : `<div class="msg-avatar-init">${name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`;
      const delBtn  = mine
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

/**
 * Load and subscribe to comments for the currently-viewed recipe.
 * Called by desk_showRecipe() and mob_showRecipe().
 */
window.recipeChat_load = function (recipeId) {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  chatRecipeId = recipeId;

  // Show chat panels and clear inputs
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

    // Mark all visible messages as read in the notification system
    if (window.markNotifRead) {
      msgs.forEach(m => {
        if (m.uid !== currentUser?.uid) markNotifRead(m.id);
      });
    }
  }, err => console.error('Chat error:', err));
};

/** Enter key sends, Shift+Enter inserts newline */
window.recipeChat_keydown = function (e, prefix) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); recipeChat_send(prefix); }
};

/** Send a new comment */
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

/** Delete own comment (Firestore rules enforce uid match server-side too) */
window.recipeChat_delete = async function (msgId) {
  if (!currentUser || !chatRecipeId) return;
  if (!confirm('Delete this comment?')) return;
  try {
    await deleteDoc(doc(db, 'recipe_comments', chatRecipeId, 'messages', msgId));
  } catch (e) { showToast('Could not delete comment'); console.error(e); }
};
