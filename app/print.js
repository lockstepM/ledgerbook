/* Print flows.
   - Module: window.print() on current view (print.css hides chrome).
   - Unit: render every ready module of the unit into #print-root, mark body,
     print, then clean up. */

import { renderMarkdown } from './render.js';

export function printModule() {
  window.print();
}

export async function printUnit(unit, strings, fetchModuleMd) {
  const root = document.getElementById('print-root');
  const cover = `<div class="print-unit-cover">
    <span class="unit-code">${unit.id}</span>
    <h1>${escapeHtml(unit.title)}</h1>
    <p class="print-meta">${escapeHtml(strings.appName)} · ${escapeHtml(strings.print.unitCoverSuffix)}</p>
  </div>`;

  const sections = [];
  for (const mod of unit.modules) {
    if (mod.status !== 'ready') continue;
    const md = await fetchModuleMd(unit.id, mod.id);
    const holder = document.createElement('section');
    holder.className = 'print-module';
    holder.innerHTML = `<div class="module-eyebrow">
        <span class="module-ref">${unit.id} ${mod.id}</span>
        <span>${escapeHtml(unit.title)}</span>
      </div>
      <h1 class="module-heading">${escapeHtml(mod.title)}</h1>
      <div class="prose"></div>`;
    await renderMarkdown(md, holder.querySelector('.prose'));
    sections.push(holder);
  }

  root.innerHTML = cover;
  for (const s of sections) root.appendChild(s);
  root.classList.toggle('cheatsheet', unit.layout === 'cheatsheet');

  document.body.classList.add('printing-unit');
  const cleanup = () => {
    document.body.classList.remove('printing-unit');
    root.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  /* Give the browser a beat to lay out SVGs before the print dialog. */
  await new Promise((r) => setTimeout(r, 250));
  window.print();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
