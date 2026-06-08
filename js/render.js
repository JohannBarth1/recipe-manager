/* ════════════════════════════════════════════════════════════════
   js/render.js — Render helpers shared by desktop & mobile
   ════════════════════════════════════════════════════════════════ */

// ── HTML escaping ────────────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Chapter selects ──────────────────────────────────────────────
function populateChapterSelects() {
  const opts = data.chapters
    .map(c => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join('');
  document.getElementById('deskFChapter').innerHTML = opts;
  document.getElementById('mobFChapter').innerHTML  = opts;
}

// ── Panel switcher (desktop) ─────────────────────────────────────
function showPanel(id) {
  const welcome = document.getElementById('deskWelcome');
  const recipeView = document.getElementById('deskRecipeView');
  const editor = document.getElementById('deskEditor');

  // Hide all three first
  welcome.style.display = 'none';
  recipeView.classList.remove('active');
  editor.classList.remove('active');

  // Show the requested one
  if (id === 'deskWelcome') {
    welcome.style.display = 'flex';
  } else {
    document.getElementById(id).classList.add('active');
  }
}

// ── Sectioned list renderer (ingredients / steps) ────────────────
// Lines ending in ":" become sub-headings; otherwise normal list items.
function renderSectionedList(lines, tag) {
  let html     = `<${tag}>`;
  let open     = true;
  let stepNum  = 0;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (t.endsWith(':')) {
      // Sub-heading
      if (open) { html += `</${tag}>`; open = false; }
      html += `<li style="list-style:none;font-weight:700;margin-top:.7em;margin-left:0">${esc(t.slice(0, -1))}</li>`;
      open = true;
      if (tag === 'ol') stepNum = 0;
    } else {
      if (tag === 'ol') {
        stepNum++;
        html += `<li><span class="step-num">${stepNum}</span><span>${esc(t)}</span></li>`;
      } else {
        html += `<li>${esc(t)}</li>`;
      }
    }
  }
  if (open) html += `</${tag}>`;
  return html;
}

// ── EPUB sectioned list (no step-num spans) ──────────────────────
function epubSectionedList(lines, tag) {
  let html = `<${tag}>`;
  let open = true;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.endsWith(':')) {
      if (open) { html += `</${tag}>`; open = false; }
      html += `<p class="sec-head">${esc(t.slice(0, -1))}</p><${tag}>`;
      open = true;
    } else {
      html += `<li>${esc(t)}</li>`;
    }
  }
  if (open) html += `</${tag}>`;
  return html;
}

// ── Render a recipe into a set of DOM elements ───────────────────
// ids: { chapter, title, desc, ingredients, steps, tip }
function renderRecipeInto(recipe, ids) {
  const ch = data.chapters.find(c => c.id === recipe.chapterId);
  document.getElementById(ids.chapter).textContent = ch ? ch.name : '';
  document.getElementById(ids.title).textContent   = recipe.title;

  if (ids.desc) {
    document.getElementById(ids.desc).innerHTML = esc(recipe.desc || '');
  }
  document.getElementById(ids.ingredients).innerHTML =
    renderSectionedList(recipe.ingredients, 'ul');
  document.getElementById(ids.steps).innerHTML =
    linkifyTimers(renderSectionedList(recipe.steps, 'ol'));

  const tipEl = document.getElementById(ids.tip);
  if (recipe.tip) {
    tipEl.innerHTML     = esc(recipe.tip);
    tipEl.style.display = 'block';
  } else {
    tipEl.style.display = 'none';
  }
   const bylineId = ids.byline;
if (bylineId) {
  const bylineEl = document.getElementById(bylineId);
  if (bylineEl) {
    bylineEl.textContent = recipe.createdByName
      ? `Recipe by ${recipe.createdByName}`
      : '';
    bylineEl.style.display = recipe.createdByName ? 'block' : 'none';
  }
}
}
// ── renderAll ────────────────────────────────────────────────────
function renderAll() {
  renderDesktopSidebar();
  renderMobileList();
  populateChapterSelects();
}

// ── Desktop sidebar ──────────────────────────────────────────────
function renderDesktopSidebar() {
  const list = document.getElementById('deskChapterList');
  list.innerHTML = data.chapters.map(ch => {
    const recipes = data.recipes.filter(r => r.chapterId === ch.id);
    const isOpen  = openChapters.has(ch.id);
    return `
      <div class="chapter-group">
        <div class="chapter-heading ${isOpen ? 'open' : ''}" onclick="toggleChapter('${ch.id}')">
          <span>${esc(ch.name)}</span>
          <div style="display:flex;align-items:center;gap:2px">
            <span class="ch-arrow">›</span>
            <span onclick="event.stopPropagation();chapterMenu('${ch.id}',this)"
                  style="padding:2px 8px;font-size:.85rem;color:var(--muted);cursor:pointer">⋯</span>
          </div>
        </div>
        <div class="recipe-list ${isOpen ? 'open' : ''}">
          ${recipes.map(r => `
            <div class="recipe-item ${r.id === deskCurrentId ? 'active' : ''}"
                 onclick="desk_showRecipe('${r.id}')">${esc(r.title)}</div>
          `).join('')}
        </div>
      </div>`;
  }).join('');
}

// ── Mobile chapter list ──────────────────────────────────────────
function renderMobileList() {
  const list = document.getElementById('mobChapterList');
  list.innerHTML = data.chapters.map(ch => {
    const recipes = data.recipes.filter(r => r.chapterId === ch.id);
    const isOpen  = openChapters.has(ch.id);
    return `
      <div>
        <div class="mob-chapter-heading ${isOpen ? 'open' : ''}" onclick="mob_toggleChapter('${ch.id}')">
          <span>${esc(ch.name)}</span>
          <div style="display:flex;align-items:center;gap:4px">
            <span class="ch-arrow" style="transition:transform .2s;${isOpen ? 'transform:rotate(90deg)' : ''}">›</span>
            <span onclick="event.stopPropagation();chapterMenu('${ch.id}',this)"
                  style="padding:2px 6px;font-size:.8rem;color:var(--muted);cursor:pointer">⋯</span>
          </div>
        </div>
        <div class="mob-recipe-list ${isOpen ? 'open' : ''}">
          ${recipes.map(r => `
            <div class="mob-recipe-row" onclick="mob_showRecipe('${r.id}')">
              <span>${esc(r.title)}</span><span class="arrow">›</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');
}

// ── Chapter toggle ───────────────────────────────────────────────
function toggleChapter(id) {
  openChapters.has(id) ? openChapters.delete(id) : openChapters.add(id);
  renderDesktopSidebar();
}

// ── Chapter context menu (move / delete) ─────────────────────────
function chapterMenu(id, triggerEl) {
  const ch       = data.chapters.find(c => c.id === id);
  const idx      = data.chapters.findIndex(c => c.id === id);
  const isFirst  = idx === 0;
  const isLast   = idx === data.chapters.length - 1;
  const isMobile = window.innerWidth <= 640;

  document.getElementById('chapterMenuEl')?.remove();
  const menu = document.createElement('div');
  menu.id    = 'chapterMenuEl';

  if (isMobile) {
    menu.style.cssText =
      'position:fixed;inset:0;background:rgba(26,18,8,.5);z-index:120;display:flex;align-items:flex-end';
    menu.innerHTML = `
      <div style="width:100%;background:var(--warm-white);border-top:2px solid var(--gold);padding-bottom:env(safe-area-inset-bottom)">
        <div style="padding:.8rem 1.2rem;font-family:'Playfair Display',serif;font-size:1rem;color:var(--brown);border-bottom:1px solid var(--border)">${esc(ch.name)}</div>
        ${!isFirst ? `<div onclick="moveChapter('${id}',-1);document.getElementById('chapterMenuEl').remove();renderAll()"
                          style="padding:.9rem 1.2rem;font-size:.95rem;cursor:pointer;border-bottom:1px solid var(--border)">▲ Move Up</div>` : ''}
        ${!isLast  ? `<div onclick="moveChapter('${id}',1);document.getElementById('chapterMenuEl').remove();renderAll()"
                          style="padding:.9rem 1.2rem;font-size:.95rem;cursor:pointer;border-bottom:1px solid var(--border)">▼ Move Down</div>` : ''}
        <div onclick="document.getElementById('chapterMenuEl').remove();deleteChapter('${id}')"
             style="padding:.9rem 1.2rem;font-size:.95rem;cursor:pointer;color:var(--danger);border-bottom:1px solid var(--border)">✕ Delete Chapter</div>
        <div onclick="document.getElementById('chapterMenuEl').remove()"
             style="padding:.9rem 1.2rem;font-size:.95rem;cursor:pointer;color:var(--muted)">Cancel</div>
      </div>`;
    menu.addEventListener('click', e => { if (e.target === menu) menu.remove(); });
  } else {
    const rect = triggerEl.getBoundingClientRect();
    menu.style.cssText =
      `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;` +
      `background:var(--warm-white);border:1px solid var(--border);border-radius:4px;` +
      `box-shadow:0 4px 16px rgba(0,0,0,.15);z-index:120;min-width:160px;overflow:hidden`;
    menu.innerHTML = `
      ${!isFirst ? `<div onclick="moveChapter('${id}',-1);document.getElementById('chapterMenuEl').remove()"
                        style="padding:.6rem 1rem;font-size:.82rem;cursor:pointer;border-bottom:1px solid var(--border)">▲ Move Up</div>` : ''}
      ${!isLast  ? `<div onclick="moveChapter('${id}',1);document.getElementById('chapterMenuEl').remove()"
                        style="padding:.6rem 1rem;font-size:.82rem;cursor:pointer;border-bottom:1px solid var(--border)">▼ Move Down</div>` : ''}
      <div onclick="document.getElementById('chapterMenuEl').remove();deleteChapter('${id}')"
           style="padding:.6rem 1rem;font-size:.82rem;cursor:pointer;color:var(--danger)">✕ Delete</div>`;
    setTimeout(() => document.addEventListener('click', function h(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', h); }
    }), 0);
  }
  document.body.appendChild(menu);
}

// ── Chapter move / delete ────────────────────────────────────────
function moveChapter(id, dir) {
  const idx    = data.chapters.findIndex(c => c.id === id);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= data.chapters.length) return;
  [data.chapters[idx], data.chapters[newIdx]] = [data.chapters[newIdx], data.chapters[idx]];
  persistToStorage();
  renderAll();
}

function deleteChapter(id) {
  const ch      = data.chapters.find(c => c.id === id);
  const recipes = data.recipes.filter(r => r.chapterId === id);
  const count   = recipes.length;
  const warn    = count > 0
    ? ` It contains ${count} recipe${count > 1 ? 's' : ''} which will also be deleted.`
    : '';
  if (!confirm(`Delete chapter "${ch.name}"?${warn}`)) return;

  // Capture recipe IDs before wiping local data
  const deletedRecipeIds = recipes.map(r => r.id);

  data.chapters = data.chapters.filter(c => c.id !== id);
  data.recipes  = data.recipes.filter(r => r.chapterId !== id);

  if (deskCurrentId && !data.recipes.find(r => r.id === deskCurrentId)) {
    deskCurrentId = null;
    showPanel('deskWelcome');
  }
  if (mobCurrentId && !data.recipes.find(r => r.id === mobCurrentId)) {
    mobCurrentId = null;
  }
  persistToStorage();
  renderAll();

  // Sync to Firestore
  if (getMode() === 'public') {
    if (window.firestoreDeleteChapter) firestoreDeleteChapter(id);
    deletedRecipeIds.forEach(rid => {
      if (window.firestoreDeleteRecipe) firestoreDeleteRecipe(rid);
    });
  }

  showToast(`"${ch.name}" deleted`);
}

// ── Chapter modal ────────────────────────────────────────────────
function showAddChapter() {
  document.getElementById('newChapterName').value = '';
  document.getElementById('chapterModal').classList.add('open');
  setTimeout(() => document.getElementById('newChapterName').focus(), 80);
}

function closeChapterModal() {
  document.getElementById('chapterModal').classList.remove('open');
}

function addChapter() {
  const name = document.getElementById('newChapterName').value.trim();
  if (!name) { showToast('Please enter a chapter name'); return; }
  const id = 'ch_' + Date.now();
  const chapter = { id, name };
  data.chapters.push(chapter);
  openChapters.add(id);
  persistToStorage();

  // Sync new chapter to Firestore
if (window.firestoreSaveChapter && getMode() === 'public') firestoreSaveChapter(chapter);

  renderAll();
  closeChapterModal();
  showToast(`"${name}" added`);
}

document.getElementById('newChapterName').addEventListener('keydown', e => {
  if (e.key === 'Enter')  addChapter();
  if (e.key === 'Escape') closeChapterModal();
});
