/* ════════════════════════════════════════════════════════════════
   js/data.js — Local data model, persistence, defaults
   ════════════════════════════════════════════════════════════════ */

const LS_KEY      = 'hk_recipe_book_v2';
const BOOK_NAME_KEY = 'hk_book_name';

const DEFAULT_DATA = {
  chapters: [
    { id: 'breakfast', name: 'Breakfast Foods' },
    { id: 'cakes',     name: 'Cakes'           },
    { id: 'cookies',   name: 'Cookies'          },
    { id: 'candy',     name: 'Candy'            },
    { id: 'mains',     name: 'Meat & Main Dishes' }
  ],
  recipes: [
    {
      id: 'r1',
      chapterId: 'breakfast',
      title: 'Cowboy Coffee Cake',
      desc: 'A rustic, hearty coffee cake with a thick brown sugar crumble.',
      ingredients: [
        '2 cups all-purpose flour',
        '3/4 cup brown sugar, packed',
        '1/4 cup granulated sugar',
        '1/2 tsp salt',
        '1 1/2 tsp cinnamon',
        '1/2 cup cold unsalted butter, cut into pieces',
        '1 tsp baking powder',
        '1/2 tsp baking soda',
        '1 large egg',
        '1 cup buttermilk'
      ],
      steps: [
        'Preheat oven to 375F (190C). Grease an 8x8 inch baking pan.',
        'Combine flour, both sugars, salt, and cinnamon. Cut in cold butter until crumbly.',
        'Scoop out 1/2 cup of crumb mixture for topping.',
        'Stir baking powder and soda into remaining mix. Add egg and buttermilk, stir until just combined.',
        'Spread in pan, sprinkle crumble on top.',
        'Bake 25-30 minutes until golden. Cool 10 minutes before slicing.'
      ],
      tip: 'No buttermilk? Add 1 tbsp vinegar to 1 cup regular milk and let sit 5 minutes.'
    }
  ]
};

// ── State ────────────────────────────────────────────────────────
let data         = loadFromStorage();
let openChapters = new Set([data.chapters[0]?.id]);

// ── Persistence ──────────────────────────────────────────────────
function loadFromStorage() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) return JSON.parse(s);
  } catch (e) { /* ignore */ }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function persistToStorage() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

function getBookName()  { return localStorage.getItem(BOOK_NAME_KEY) || 'My Recipes'; }
function setBookName(n) { localStorage.setItem(BOOK_NAME_KEY, n); }
