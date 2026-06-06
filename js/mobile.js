/* ════════════════════════════════════════════════════════════════
   js/mobile.js — Mobile panel + recipe view/editor logic
   Mirrors desktop.js but for the mobile tab/panel layout.
   Firestore calls mirror desktop.js exactly.
   ════════════════════════════════════════════════════════════════ */

let mobCurrentId = null;
let mobEditingId = null;

// ── Panel switcher ───────────────────────────────────────────────
function mob_showPanel(panelId) {
  document.querySelectorAll('.mob-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');
}

// ── Tab switcher ─────────────────────────────────────────────────
function mob_switchTab(tab) {
  document.getElementById('timerTray').classList.remove('open');
  document.getElementById('notifDropdown').classList.remove('open');
  document.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));

  if (tab === 'recipes') {
    document.getElementById('tabRecipes').classList.add('active');
    mob_showPanel('mobPanelList');
  } else {
    document.getElementById('tabSettings').classList.add('active');
    mob_showPanel('mobPanelSettings');
  }
}

// ── Chapter toggle ───────────────────────────────────────────────
function mob_toggleChapter(id) {
  openChapters.has(id) ? openChapters.delete(id) : openChapters.add(id);
  renderMobileList();
}

// ── Show a recipe ────────────────────────────────────────────────
function mob_showRecipe(id) {
  const r = data.recipes.find(x => x.id === id);
  if (!r) return;

  mobCurrentId = id;
setLastRecipeId(id);
  renderRecipeInto(r, {
    chapter:     'mobViewChapter',
    title:       'mobViewTitle',
    desc:        'mobViewDesc',
    ingredients: 'mobViewIngredients',
    steps:       'mobViewSteps',
    tip:         'mobViewTip'
  });

  mob_showPanel('mobPanelView');
  document.querySelector('#mobPanelView .mob-view-scroll').scrollTop = 0;

  // Load comments for this recipe
  if (window.recipeChat_load) recipeChat_load(id);
}

// ── Back to list ─────────────────────────────────────────────────
function mob_backToList() {
  mob_showPanel('mobPanelList');
  document.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tabRecipes').classList.add('active');
}

// ── Show add-recipe editor ───────────────────────────────────────
function mob_showAddRecipe() {
  mobEditingId = null;
  document.getElementById('mobEditorTitle').textContent = 'Add New Recipe';
  ['mobFTitle', 'mobFDesc', 'mobFIngredients', 'mobFSteps', 'mobFTip']
    .forEach(id => document.getElementById(id).value = '');
  populateChapterSelects();
  mob_showPanel('mobPanelEditor');
  document.querySelector('#mobPanelEditor .mob-editor-scroll').scrollTop = 0;
}

// ── Show edit-recipe editor ──────────────────────────────────────
function mob_editCurrentRecipe() {
  if (!mobCurrentId) return;
  const r = data.recipes.find(x => x.id === mobCurrentId);
  if (!r) return;

  mobEditingId = mobCurrentId;
  document.getElementById('mobEditorTitle').textContent = 'Edit Recipe';
  document.getElementById('mobFTitle').value            = r.title;
  document.getElementById('mobFDesc').value             = r.desc        || '';
  document.getElementById('mobFIngredients').value      = r.ingredients.join('\n');
  document.getElementById('mobFSteps').value            = r.steps.join('\n');
  document.getElementById('mobFTip').value              = r.tip         || '';
  populateChapterSelects();
  document.getElementById('mobFChapter').value          = r.chapterId;
  mob_showPanel('mobPanelEditor');
  document.querySelector('#mobPanelEditor .mob-editor-scroll').scrollTop = 0;
}

// ── Save recipe (add or update) ──────────────────────────────────
function mob_saveRecipe() {
  const title       = document.getElementById('mobFTitle').value.trim();
  const chapterId   = document.getElementById('mobFChapter').value;
  const desc        = document.getElementById('mobFDesc').value.trim();
  const ingredients = document.getElementById('mobFIngredients').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const steps       = document.getElementById('mobFSteps').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const tip         = document.getElementById('mobFTip').value.trim();

  if (!title)              return showToast('Please enter a recipe name');
  if (!ingredients.length) return showToast('Please add at least one ingredient');
  if (!steps.length)       return showToast('Please add at least one step');

  let recipe;

  if (mobEditingId) {
    // Update existing
    const idx = data.recipes.findIndex(r => r.id === mobEditingId);
    recipe = { ...data.recipes[idx], title, chapterId, desc, ingredients, steps, tip };
    data.recipes[idx] = recipe;
    mobCurrentId = mobEditingId;
    showToast('Recipe updated!');
  } else {
    // Add new
    const id = 'r_' + Date.now();
    recipe = { id, chapterId, title, desc, ingredients, steps, tip };
    data.recipes.push(recipe);
    mobCurrentId = id;
    showToast('Recipe added!');
  }

  openChapters.add(chapterId);
  persistToStorage();
  mobEditingId = null;

  // ── Sync to Firestore (per-recipe, not bulk) ──────────────────
if (window.firestoreSaveRecipe && getMode() === 'public') firestoreSaveRecipe(recipe);

  renderAll();
  mob_showRecipe(mobCurrentId);
}

// ── Cancel editor ────────────────────────────────────────────────
function mob_cancelEdit() {
  if (mobCurrentId) mob_showRecipe(mobCurrentId);
  else mob_backToList();
}

// ── Delete recipe ────────────────────────────────────────────────
function mob_deleteCurrentRecipe() {
  if (!mobCurrentId) return;
  const r = data.recipes.find(x => x.id === mobCurrentId);
  if (!confirm(`Delete "${r.title}"?`)) return;

  const deletedId = mobCurrentId;
  data.recipes = data.recipes.filter(x => x.id !== deletedId);
clearLastRecipeId();
  mobCurrentId = null;
  persistToStorage();

  // ── Sync deletion to Firestore ────────────────────────────────
if (window.firestoreDeleteRecipe && getMode() === 'public') firestoreDeleteRecipe(deletedId);

  renderAll();
  mob_backToList();
  showToast('Recipe deleted');
}
// ── App init (runs after all scripts have loaded) ────────────────
renderAll();
showPanel('deskWelcome');
