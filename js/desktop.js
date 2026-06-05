/* ════════════════════════════════════════════════════════════════
   js/desktop.js — Desktop sidebar + recipe view/editor logic
   All Firestore calls use the new per-recipe API from firebase.js:
     firestoreSaveRecipe(recipe)   — on add / edit
     firestoreDeleteRecipe(id)     — on delete
     firestoreSaveChapter(chapter) — on chapter add (in render.js)
     firestoreSaveAll()            — bulk "Save" button
     firestoreLoad()               — bulk "Load" button
   ════════════════════════════════════════════════════════════════ */

let deskCurrentId = null;
let deskEditingId = null;

// ── Show a recipe ────────────────────────────────────────────────
function desk_showRecipe(id) {
  const r = data.recipes.find(x => x.id === id);
  if (!r) return;

  deskCurrentId = id;
  deskEditingId = null;

  renderRecipeInto(r, {
    chapter:     'deskViewChapter',
    title:       'deskViewTitle',
    desc:        'deskViewDesc',
    ingredients: 'deskViewIngredients',
    steps:       'deskViewSteps',
    tip:         'deskViewTip'
  });

  showPanel('deskRecipeView');
  renderDesktopSidebar();

  // Load comments for this recipe
  if (window.recipeChat_load) recipeChat_load(id);
}

// ── Show add-recipe editor ───────────────────────────────────────
function desk_showAddRecipe() {
  deskEditingId = null;
  document.getElementById('deskEditorTitle').textContent = 'Add New Recipe';
  ['deskFTitle', 'deskFDesc', 'deskFIngredients', 'deskFSteps', 'deskFTip']
    .forEach(id => document.getElementById(id).value = '');
  populateChapterSelects();
  showPanel('deskEditor');
}

// ── Show edit-recipe editor ──────────────────────────────────────
function desk_editCurrentRecipe() {
  if (!deskCurrentId) return;
  const r = data.recipes.find(x => x.id === deskCurrentId);
  if (!r) return;

  deskEditingId = deskCurrentId;
  document.getElementById('deskEditorTitle').textContent = 'Edit Recipe';
  document.getElementById('deskFTitle').value            = r.title;
  document.getElementById('deskFDesc').value             = r.desc        || '';
  document.getElementById('deskFIngredients').value      = r.ingredients.join('\n');
  document.getElementById('deskFSteps').value            = r.steps.join('\n');
  document.getElementById('deskFTip').value              = r.tip         || '';
  populateChapterSelects();
  document.getElementById('deskFChapter').value          = r.chapterId;
  showPanel('deskEditor');
}

// ── Save recipe (add or update) ──────────────────────────────────
function desk_saveRecipe() {
  const title       = document.getElementById('deskFTitle').value.trim();
  const chapterId   = document.getElementById('deskFChapter').value;
  const desc        = document.getElementById('deskFDesc').value.trim();
  const ingredients = document.getElementById('deskFIngredients').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const steps       = document.getElementById('deskFSteps').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const tip         = document.getElementById('deskFTip').value.trim();

  if (!title)             return showToast('Please enter a recipe name');
  if (!ingredients.length)return showToast('Please add at least one ingredient');
  if (!steps.length)      return showToast('Please add at least one step');

  let recipe;

  if (deskEditingId) {
    // Update existing
    const idx = data.recipes.findIndex(r => r.id === deskEditingId);
    recipe = { ...data.recipes[idx], title, chapterId, desc, ingredients, steps, tip };
    data.recipes[idx] = recipe;
    deskCurrentId = deskEditingId;
    showToast('Recipe updated!');
  } else {
    // Add new
    const id = 'r_' + Date.now();
    recipe = { id, chapterId, title, desc, ingredients, steps, tip };
    data.recipes.push(recipe);
    deskCurrentId = id;
    showToast('Recipe added!');
  }

  openChapters.add(chapterId);
  persistToStorage();
  deskEditingId = null;

  // ── Sync to Firestore (per-recipe, not bulk) ──────────────────
if (window.firestoreSaveRecipe && getMode() === 'public') firestoreSaveRecipe(recipe);

  renderAll();
  desk_showRecipe(deskCurrentId);
}

// ── Cancel editor ────────────────────────────────────────────────
function desk_cancelEdit() {
  if (deskCurrentId) desk_showRecipe(deskCurrentId);
  else showPanel('deskWelcome');
}

// ── Delete recipe ────────────────────────────────────────────────
function desk_deleteCurrentRecipe() {
  if (!deskCurrentId) return;
  const r = data.recipes.find(x => x.id === deskCurrentId);
  if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;

  const deletedId = deskCurrentId;
  data.recipes  = data.recipes.filter(x => x.id !== deletedId);
  deskCurrentId = null;
  persistToStorage();

  // ── Sync deletion to Firestore ────────────────────────────────
  if (window.firestoreDeleteRecipe) firestoreDeleteRecipe(deletedId);

  renderAll();
  showPanel('deskWelcome');
  showToast('Recipe deleted');
}
