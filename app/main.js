/* App entry: loads manifest + UI strings, builds nav, routes #/UNIT/MODULE. */

import { initRenderer, renderMarkdown } from './render.js';
import { printModule, printUnit } from './print.js';
import { isRead, setRead, unitProgress } from './progress.js';

const state = {
  manifest: null,
  strings: null,
  mdCache: new Map(),
};

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function fetchModuleMd(unitId, moduleId) {
  const key = `${unitId}/${moduleId}`;
  if (state.mdCache.has(key)) return state.mdCache.get(key);
  const res = await fetch(`content/${unitId}/${moduleId}.md`);
  if (!res.ok) throw new Error(`content ${key}: ${res.status}`);
  const md = await res.text();
  state.mdCache.set(key, md);
  return md;
}

function findUnit(unitId) {
  return state.manifest.units.find((u) => u.id === unitId) || null;
}

function findModule(unit, moduleId) {
  return unit ? unit.modules.find((m) => m.id === moduleId) || null : null;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- Sidebar ---------- */

function buildSidebar() {
  const s = state.strings;
  const nav = document.getElementById('sidebar');
  nav.setAttribute('aria-label', s.nav.unitsLabel);
  nav.innerHTML = state.manifest.units
    .map((unit) => {
      const prog = unitProgress(unit);
      const items = unit.modules
        .map((mod) => {
          const href = `#/${unit.id}/${mod.id}`;
          const ready = mod.status === 'ready';
          const tick = ready && isRead(unit.id, mod.id) ? '✓' : '';
          const badge = !ready
            ? `<span class="badge">${s.nav.pendingBadge}</span>`
            : '';
          return `<li><a class="module-link ${ready ? '' : 'is-pending'}" href="${href}" data-route="${unit.id}/${mod.id}">
            <span class="module-code">${mod.id}</span>
            <span class="module-title-text">${escapeHtml(mod.title)}</span>
            ${badge}
            <span class="module-tick" aria-hidden="true">${tick}</span>
          </a></li>`;
        })
        .join('');
      return `<div class="unit-block">
        <button class="unit-head" data-unit="${unit.id}" aria-expanded="true">
          <span class="unit-code">${unit.id}</span>
          <span>${escapeHtml(unit.title)}</span>
          <span class="unit-progress">${prog.read}/${prog.total}</span>
        </button>
        <ul class="module-list" id="modlist-${unit.id}">${items}</ul>
      </div>`;
    })
    .join('');

  nav.querySelectorAll('.unit-head').forEach((btn) => {
    btn.addEventListener('click', () => {
      const list = document.getElementById(`modlist-${btn.dataset.unit}`);
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      list.style.display = open ? 'none' : '';
    });
  });
}

function markActiveLink(routeKey) {
  document.querySelectorAll('.module-link').forEach((a) => {
    if (a.dataset.route === routeKey) {
      a.setAttribute('aria-current', 'page');
    } else {
      a.removeAttribute('aria-current');
    }
  });
}

/* ---------- Views ---------- */

function daysToExam() {
  const exam = new Date(state.manifest.examDate + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((exam - now) / 86400000);
}

function renderHome() {
  const s = state.strings;
  const days = daysToExam();
  const readyCount = state.manifest.units
    .flatMap((u) => u.modules)
    .filter((m) => m.status === 'ready').length;

  const countdown =
    days >= 0
      ? `${s.home.examCountdownPrefix} ${days} ${s.home.examCountdownSuffix}`
      : s.home.examPast;

  const cards = state.manifest.units
    .map((unit) => {
      const chips = unit.modules
        .map((mod) => {
          const cls = mod.status === 'ready' ? 'is-ready' : 'is-pending';
          return `<a class="chip ${cls}" href="#/${unit.id}/${mod.id}">${mod.id}</a>`;
        })
        .join('');
      return `<div class="unit-card">
        <h2><span class="unit-code">${unit.id}</span>${escapeHtml(unit.title)}</h2>
        <div class="unit-card-modules">${chips}</div>
      </div>`;
    })
    .join('');

  document.getElementById('content').innerHTML = `
    <div class="home-hero">
      <p class="exam-count">${countdown} · ${readyCount} ${s.home.readyCountLabel}</p>
      <h1>${escapeHtml(s.home.title)}</h1>
      <p>${escapeHtml(s.home.intro)}</p>
      <div class="home-legend">
        <span>● ${s.home.legendReady}</span>
        <span>○ ${s.home.legendPending}</span>
        <span>△ ${s.home.legendSlides}</span>
      </div>
    </div>
    <div class="unit-cards">${cards}</div>`;
  document.getElementById('topbar-crumb').textContent = '';
}

function moduleNeighbors(unit, mod) {
  const all = [];
  for (const u of state.manifest.units) {
    for (const m of u.modules) {
      if (m.status === 'ready') all.push({ unit: u, mod: m });
    }
  }
  const idx = all.findIndex((x) => x.unit.id === unit.id && x.mod.id === mod.id);
  return {
    prev: idx > 0 ? all[idx - 1] : null,
    next: idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null,
  };
}

async function renderModule(unitId, moduleId) {
  const s = state.strings;
  const unit = findUnit(unitId);
  const mod = findModule(unit, moduleId);
  const content = document.getElementById('content');

  if (!unit || !mod) {
    content.innerHTML = `<div class="module-frame"><p>${escapeHtml(s.errors.notFound)}</p></div>`;
    return;
  }

  document.getElementById('topbar-crumb').textContent = `${unit.id} ${mod.id}`;

  if (mod.status !== 'ready') {
    content.innerHTML = `<div class="module-frame">
      <div class="module-eyebrow"><span class="module-ref">${unit.id} ${mod.id}</span>
        <span>${escapeHtml(unit.title)}</span></div>
      <h1 class="module-heading">${escapeHtml(mod.title)}</h1>
      <p>${escapeHtml(s.errors.pendingBody)}</p>
    </div>`;
    return;
  }

  let md;
  try {
    md = await fetchModuleMd(unitId, moduleId);
  } catch {
    content.innerHTML = `<div class="module-frame"><p>${escapeHtml(s.errors.loadFailed)}</p></div>`;
    return;
  }

  const read = isRead(unitId, moduleId);
  const slidesNotice =
    mod.source === 'slides'
      ? `<p class="slides-only-notice">${escapeHtml(s.module.slidesOnlyNotice)}</p>`
      : '';

  content.innerHTML = `<article class="module-frame">
    <div class="module-eyebrow">
      <span class="module-ref">${unit.id} ${mod.id}</span>
      <span>${escapeHtml(unit.title)}</span>
      <span>· ${mod.lessons} ${s.module.lessonsSuffix}</span>
    </div>
    <h1 class="module-heading">${escapeHtml(mod.title)}</h1>
    <div class="module-actions">
      <button class="btn ${read ? 'is-done' : ''}" id="btn-read">${read ? s.module.markUnread : s.module.markRead}</button>
      <button class="btn" id="btn-print-module">${s.module.printModule}</button>
      <button class="btn" id="btn-print-unit">${s.module.printUnit} ${unit.id}</button>
    </div>
    ${slidesNotice}
    <div class="prose" id="prose"></div>
    <nav class="module-footer" id="module-footer"></nav>
  </article>`;

  await renderMarkdown(md, document.getElementById('prose'));

  const { prev, next } = moduleNeighbors(unit, mod);
  document.getElementById('module-footer').innerHTML = `
    ${prev ? `<a class="btn" href="#/${prev.unit.id}/${prev.mod.id}">← ${prev.unit.id} ${prev.mod.id}</a>` : '<span></span>'}
    ${next ? `<a class="btn" href="#/${next.unit.id}/${next.mod.id}">${next.unit.id} ${next.mod.id} →</a>` : '<span></span>'}`;

  document.getElementById('btn-read').addEventListener('click', () => {
    setRead(unitId, moduleId, !isRead(unitId, moduleId));
    buildSidebar();
    markActiveLink(`${unitId}/${moduleId}`);
    renderModule(unitId, moduleId);
  });
  document.getElementById('btn-print-module').addEventListener('click', printModule);
  document.getElementById('btn-print-unit').addEventListener('click', () => {
    printUnit(unit, s, fetchModuleMd);
  });
}

/* ---------- Router ---------- */

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  closeSidebar();
  if (!hash) {
    markActiveLink('');
    renderHome();
    return;
  }
  const [unitId, moduleId] = hash.split('/');
  markActiveLink(`${unitId}/${moduleId}`);
  await renderModule(unitId, moduleId);
  document.getElementById('content').scrollTop = 0;
  window.scrollTo(0, 0);
}

/* ---------- Mobile nav ---------- */

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('is-open');
  document.getElementById('sidebar-scrim').hidden = true;
  document.getElementById('nav-toggle').setAttribute('aria-expanded', 'false');
}

function wireChrome() {
  const s = state.strings;
  const brand = document.getElementById('brand-link');
  brand.innerHTML = `${escapeHtml(s.appName)}<span class="brand-tag">${escapeHtml(s.appTagline)}</span>`;

  const toggle = document.getElementById('nav-toggle');
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  toggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open');
    scrim.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  scrim.addEventListener('click', closeSidebar);
}

/* ---------- Boot ---------- */

async function boot() {
  const [manifest, strings] = await Promise.all([
    fetchJson('content/manifest.json'),
    fetchJson('content/ui-strings.json'),
  ]);
  state.manifest = manifest;
  state.strings = strings;
  document.title = strings.appName;

  initRenderer(strings);
  wireChrome();
  buildSidebar();
  window.addEventListener('hashchange', route);
  await route();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
