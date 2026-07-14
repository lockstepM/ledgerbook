/* Markdown → HTML pipeline with accounting renderers.
   Custom fenced blocks: journal, schedule, mermaid.
   Callouts: blockquotes starting with [!EXAM] [!TRAP] [!MNEMONIC] [!RULE]. */

const CALLOUT_RE = /^\[!(EXAM|TRAP|MNEMONIC|RULE)\]\s*/;

let uiStrings = null;
let diagramSeq = 0;

export function initRenderer(strings) {
  uiStrings = strings;
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: mermaidThemeVariables(),
    flowchart: { curve: 'basis', htmlLabels: false },
    fontFamily: getComputedStyle(document.documentElement)
      .getPropertyValue('--font-body') || 'sans-serif',
  });
}

function mermaidThemeVariables() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    primaryColor: v('--ledger-tint'),
    primaryTextColor: v('--ink'),
    primaryBorderColor: v('--ledger-line'),
    lineColor: v('--graphite'),
    secondaryColor: v('--accent-soft'),
    tertiaryColor: v('--surface'),
    background: v('--surface'),
    mainBkg: v('--ledger-tint'),
    nodeTextColor: v('--ink'),
    fontSize: '14px',
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAmount(n) {
  if (typeof n === 'string') return n;
  return n.toLocaleString('en-US');
}

/* ---------- journal block ----------
   { "desc": "...", "entries": [ {"side":"dr","account":"...","amount":1000}, ... ] }
   or shorthand: { "desc": "...", "dr": [["Account", 100]], "cr": [["Account", 100]] } */

function normalizeJournal(spec) {
  if (Array.isArray(spec.entries)) return spec.entries;
  const rows = [];
  for (const [account, amount] of spec.dr || []) rows.push({ side: 'dr', account, amount });
  for (const [account, amount] of spec.cr || []) rows.push({ side: 'cr', account, amount });
  return rows;
}

function renderJournal(spec) {
  const s = uiStrings.journal;
  const rows = normalizeJournal(spec)
    .map((e) => {
      const isDr = e.side === 'dr';
      return `<tr>
        <td class="je-side">${isDr ? s.drLabel : s.crLabel}</td>
        <td class="je-account ${isDr ? 'je-debit' : 'je-credit'}">${escapeHtml(e.account)}</td>
        <td class="je-amount je-dr">${isDr ? formatAmount(e.amount) : ''}</td>
        <td class="je-amount je-cr">${isDr ? '' : formatAmount(e.amount)}</td>
      </tr>`;
    })
    .join('');
  const caption = spec.desc
    ? `<div class="journal-caption">${escapeHtml(spec.desc)}</div>`
    : '';
  return `<figure class="journal">${caption}<table>
    <tbody>${rows}</tbody></table></figure>`;
}

/* ---------- schedule block ----------
   { "caption": "...", "columns": ["Period", "Cash", ...],
     "rows": [["1", 5000, ...], ...], "totals": ["Total", 20000, ...] } */

function renderSchedule(spec) {
  const head = (spec.columns || [])
    .map((c) => `<th scope="col">${escapeHtml(c)}</th>`)
    .join('');
  const body = (spec.rows || [])
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${escapeHtml(formatAmount(c))}</td>`).join('')}</tr>`
    )
    .join('');
  const totals = spec.totals
    ? `<tr class="is-total">${spec.totals
        .map((c) => `<td>${escapeHtml(formatAmount(c))}</td>`)
        .join('')}</tr>`
    : '';
  const caption = spec.caption
    ? `<div class="schedule-caption">${escapeHtml(spec.caption)}</div>`
    : '';
  return `<figure class="schedule">${caption}<div class="schedule-scroll"><table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}${totals}</tbody></table></div></figure>`;
}

/* ---------- marked extensions ---------- */

function buildMarked() {
  const renderer = {
    code({ text, lang }) {
      if (lang === 'journal') {
        return renderJournal(JSON.parse(text));
      }
      if (lang === 'schedule') {
        return renderSchedule(JSON.parse(text));
      }
      if (lang === 'recap') {
        const inner = window.marked.parse(text);
        return `<aside class="recap"><span class="recap-label">${escapeHtml(uiStrings.recap.title)}</span>${inner}</aside>`;
      }
      if (lang === 'mermaid') {
        diagramSeq += 1;
        return `<div class="diagram"><pre class="mermaid-src" id="diagram-${diagramSeq}">${escapeHtml(text)}</pre></div>`;
      }
      if (lang === 'formula') {
        const inline = (l) =>
          window.marked.parseInline ? window.marked.parseInline(l) : escapeHtml(l);
        const lines = text
          .trim()
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => `<div class="formula-line">${inline(l)}</div>`)
          .join('');
        return `<div class="formula-box">${lines}</div>`;
      }
      return `<pre><code>${escapeHtml(text)}</code></pre>`;
    },
    blockquote({ tokens }) {
      const inner = this.parser.parse(tokens);
      const m = inner.match(/^<p>\s*\[!(EXAM|TRAP|MNEMONIC|RULE)\]\s*/);
      if (m) {
        const kind = m[1];
        const label = uiStrings.callouts[kind] || kind;
        const body = inner.replace(CALLOUT_RE_HTML(kind), '<p>');
        return `<aside class="callout callout-${kind.toLowerCase()}">
          <span class="callout-label">${escapeHtml(label)}</span>${body}</aside>`;
      }
      return `<blockquote>${inner}</blockquote>`;
    },
    table(token) {
      const html = window.marked.Renderer.prototype.table.call(this, token);
      return `<div class="table-wrap">${html}</div>`;
    },
  };
  window.marked.use({ renderer, gfm: true, breaks: false });
}

function CALLOUT_RE_HTML(kind) {
  return new RegExp(`^<p>\\s*\\[!${kind}\\]\\s*`);
}

let markedReady = false;

export async function renderMarkdown(md, container) {
  if (!markedReady) {
    buildMarked();
    markedReady = true;
  }
  container.innerHTML = window.marked.parse(md);
  await renderDiagrams(container);
}

async function renderDiagrams(container) {
  const nodes = container.querySelectorAll('pre.mermaid-src');
  if (nodes.length && document.fonts && document.fonts.status !== 'loaded') {
    await document.fonts.ready;
  }
  for (const node of nodes) {
    const src = node.textContent;
    try {
      const { svg } = await window.mermaid.render(`svg-${node.id}-${Date.now()}`, src);
      const holder = node.parentElement;
      holder.innerHTML = svg;
    } catch (err) {
      node.classList.add('diagram-error');
      console.error('mermaid render failed', err);
    }
  }
}
