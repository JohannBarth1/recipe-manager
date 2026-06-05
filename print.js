/* ════════════════════════════════════════════════════════════════
   js/print.js — Print recipe cards (A6 4-up on A4) & EPUB export
   ════════════════════════════════════════════════════════════════ */

// ── Shared escape ────────────────────────────────────────────────
function _printEsc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Sectioned list for print cards ──────────────────────────────
function cardSectionedList(lines, tag) {
  const open  = () => `<${tag} style="padding-left:3.5mm;margin:0">`;
  const close = () => `</${tag}>`;
  let html    = open();
  let isOpen  = true;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.endsWith(':')) {
      if (isOpen) { html += close(); isOpen = false; }
      html += `<li class="card-subhead">${_printEsc(t.slice(0, -1))}</li>${open()}`;
      isOpen = true;
    } else {
      html += `<li>${_printEsc(t)}</li>`;
    }
  }
  if (isOpen) html += close();
  return html;
}

// ── Build a single card face ─────────────────────────────────────
function buildCard(recipe, side, bookName) {
  const ch        = data.chapters.find(c => c.id === recipe.chapterId);
  const titleText = recipe.title;
  const metaText  = (ch ? ch.name + ' · ' : '') + bookName;

  const spine = `<svg class="card-spine-svg" xmlns="http://www.w3.org/2000/svg"
    width="100%" height="100%" viewBox="0 0 20 544" preserveAspectRatio="none">
    <rect width="20" height="544" fill="#c8952a"/>
    <text x="10" y="525" font-family="Georgia,serif" font-size="14.5" font-weight="bold"
          fill="#1a1208" text-anchor="start" dominant-baseline="central"
          transform="rotate(-90,10,525)">${_printEsc(titleText)}</text>
    <text x="10" y="20" font-family="Georgia,serif" font-size="8.5" font-weight="600"
          fill="#1a1208" text-anchor="end" dominant-baseline="central"
          transform="rotate(-90,10,20)">${_printEsc(metaText)}</text>
  </svg>`;

  if (side === 'front') {
    return `<div class="recipe-card">
      ${spine}
      ${recipe.desc
        ? `<p class="card-desc" style="margin-bottom:2mm;padding-bottom:1.5mm;border-bottom:.5mm solid #c8952a">${_printEsc(recipe.desc)}</p>`
        : '<div style="border-bottom:.5mm solid #c8952a;margin-bottom:2mm;padding-bottom:0"></div>'
      }
      <div class="card-section">Ingredients</div>
      <div class="card-ing-box">${cardSectionedList(recipe.ingredients, 'ul')}</div>
    </div>`;
  }

  // back
  return `<div class="recipe-card back">
    ${spine}
    <div style="border-bottom:.5mm solid #c8952a;margin-bottom:2mm"></div>
    <div class="card-section">Instructions</div>
    ${cardSectionedList(recipe.steps, 'ol')}
    ${recipe.tip
      ? `<div class="card-tip"><strong>Tip:</strong> ${_printEsc(recipe.tip)}</div>`
      : ''}
  </div>`;
}

// ── Print cards ──────────────────────────────────────────────────
// Lays out 4 recipes per A4 sheet, front + back, ready for duplex printing.
function printCards() {
  const bookName = getBookName();
  const recipes  = data.recipes;
  if (!recipes.length) { showToast('No recipes to print'); return; }

  const pages = [];
  for (let i = 0; i < recipes.length; i += 4) {
    const batch = recipes.slice(i, i + 4);
    const blank = '<div class="recipe-card" style="border:1px dashed #ddd;background:#fafafa"></div>';

    // Front page — cards in reading order
    let front = '<div class="card-page">';
    for (let j = 0; j < 4; j++) {
      front += batch[j] ? buildCard(batch[j], 'front', bookName) : blank;
    }
    front += '</div>';

    // Back page — mirrored so cards align when flipped on short edge
    let back = '<div class="card-page back-page">';
    for (const j of [1, 0, 3, 2]) {
      back += batch[j] ? buildCard(batch[j], 'back', bookName) : blank;
    }
    back += '</div>';

    pages.push(front, back);
  }

  document.getElementById('printArea').innerHTML = pages.join('');
  window.print();
}

// ── EPUB export ──────────────────────────────────────────────────
async function buildEpub(bookName) {
  const JSZip = window.JSZip;
  const zip   = new JSZip();

  // mimetype must be first and uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:schemas:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const css = `body{font-family:Georgia,serif;margin:1em 1.2em;line-height:1.4}
h1{font-size:1.5em;border-bottom:2px solid #333;padding-bottom:.2em;margin-bottom:.2em}
h2{font-size:1.1em;border-bottom:1px solid #bbb;padding-bottom:.15em;margin-top:.9em;margin-bottom:.3em}
p.intro{font-style:italic;color:#555;font-size:.9em}
.ing{border-left:2px solid #c8952a;padding:.3em .6em;margin:.3em 0 .6em}
ul,ol{margin:.2em 0 .2em 1.3em;padding:0}li{margin:.2em 0;font-size:.95em}
.tip{font-style:italic;color:#666;padding:.4em .7em;border:1px dashed #bbb;margin-top:.8em;font-size:.88em}
.chapter-title{page-break-before:always}`;
  zip.file('OEBPS/style/main.css', css);

  const x    = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const wrap = (title, body) =>
    `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${x(title)}</title>
<link rel="stylesheet" type="text/css" href="style/main.css"/></head>
<body>${body}</body></html>`;

  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Cover page
  zip.file('OEBPS/cover.xhtml', wrap(bookName, `
    <h1>${x(bookName)}</h1>
    <p class="intro">All your favourite recipes.</p>
    <ul>${data.chapters.map(c => `<li>${x(c.name)}</li>`).join('')}</ul>
    <p style="color:#888;font-size:.85em;margin-top:2em">Last updated: ${dateStr}</p>`));

  const mf  = [
    `<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`,
    `<item id="css"   href="style/main.css" media-type="text/css"/>`,
    `<item id="ncx"   href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="nav"   href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
  ];
  const sp       = [`<itemref idref="cover"/>`];
  const ncxPoints= [`<navPoint id="cover" playOrder="1"><navLabel><text>Title Page</text></navLabel><content src="cover.xhtml"/></navPoint>`];
  const navItems = [`<li><a href="cover.xhtml">Title Page</a></li>`];
  let po = 2;

  for (const ch of data.chapters) {
    const rs = data.recipes.filter(r => r.chapterId === ch.id);
    if (!rs.length) continue;

    const chFname = `ch_${ch.id}.xhtml`;
    zip.file(`OEBPS/${chFname}`, wrap(ch.name,
      `<h1 class="chapter-title">${x(ch.name)}</h1><ul>${rs.map(r => `<li>${x(r.title)}</li>`).join('')}</ul>`));
    mf.push(`<item id="ch_${ch.id}" href="${chFname}" media-type="application/xhtml+xml"/>`);
    sp.push(`<itemref idref="ch_${ch.id}"/>`);

    const chNavLi = [];
    po++;

    for (const r of rs) {
      const rid   = r.id.replace(/[^a-z0-9_]/gi, '_');
      const fname = `recipe_${rid}.xhtml`;

      let body = `<h1>${x(r.title)}</h1>`;
      if (r.desc) body += `<p class="intro">${x(r.desc)}</p>`;
      body += `<h2>Ingredients</h2><div class="ing">${epubSectionedList(r.ingredients, 'ul')}</div>`;
      body += `<h2>Instructions</h2>${epubSectionedList(r.steps, 'ol')}`;
      if (r.tip) body += `<div class="tip"><strong>Tip:</strong> ${x(r.tip)}</div>`;

      zip.file(`OEBPS/${fname}`, wrap(r.title, body));
      mf.push(`<item id="${rid}" href="${fname}" media-type="application/xhtml+xml"/>`);
      sp.push(`<itemref idref="${rid}"/>`);
      ncxPoints.push(`<navPoint id="r_${rid}" playOrder="${po}"><navLabel><text>${x(r.title)}</text></navLabel><content src="${fname}"/></navPoint>`);
      chNavLi.push(`<li><a href="${fname}">${x(r.title)}</a></li>`);
      po++;
    }
    navItems.push(`<li><a href="${chFname}">${x(ch.name)}</a><ol>${chNavLi.join('')}</ol></li>`);
  }

  const safeId = bookName.replace(/[^a-z0-9]/gi, '-').toLowerCase();

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${safeId}</dc:identifier>
    <dc:title>${x(bookName)}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>${mf.join('')}</manifest>
  <spine toc="ncx">${sp.join('')}</spine>
</package>`);

  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${safeId}"/></head>
  <docTitle><text>${x(bookName)}</text></docTitle>
  <navMap>${ncxPoints.join('')}</navMap>
</ncx>`);

  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><h1>Contents</h1><ol>${navItems.join('')}</ol></nav></body>
</html>`);

  const blob  = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  const fname = bookName.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/ /g, '_') || 'recipes';
  return { blob, fname };
}

async function exportEpub() {
  showNameModal({
    title:      'Download EPUB',
    desc:       'Book title and filename.',
    placeholder:'e.g. Italian Favourites',
    defaultVal: getBookName(),
    hint:       'Saved as: [name].epub',
    callback: async (name) => {
      try {
        setBookName(name);
        showToast('Building EPUB…');
        const { blob, fname } = await buildEpub(name);
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = `${fname}.epub`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('EPUB downloaded!');
      } catch (e) {
        showToast('EPUB build failed');
        console.error(e);
      }
    }
  });
}
