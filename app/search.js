/* Cross-topic search. Builds a lightweight in-memory index of every ready
   module's markdown on first use, then ranks by title > heading > body match. */

let index = null;
let building = null;

function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // fenced blocks (journal/schedule/mermaid/formula)
    .replace(/^#+\s+/gm, ' ')
    .replace(/[*_>`|~#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function ensureIndex(manifest, fetchModuleMd) {
  if (index) return index;
  if (!building) {
    building = (async () => {
      const docs = [];
      for (const unit of manifest.units) {
        for (const mod of unit.modules) {
          if (mod.status !== 'ready') continue;
          try {
            const md = await fetchModuleMd(unit.id, mod.id);
            const headings = (md.match(/^##+\s+(.+)$/gm) || []).map((h) =>
              h.replace(/^#+\s+/, '').trim()
            );
            docs.push({
              unitId: unit.id,
              moduleId: mod.id,
              title: mod.title,
              unitTitle: unit.title,
              headings,
              text: stripMarkdown(md),
            });
          } catch {
            /* skip a module that fails to load */
          }
        }
      }
      index = docs;
      return docs;
    })();
  }
  return building;
}

export function searchIndex(docs, query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const results = [];
  for (const d of docs) {
    const titleHit = d.title.toLowerCase().includes(q);
    const headingHit = d.headings.find((h) => h.toLowerCase().includes(q)) || '';
    const lc = d.text.toLowerCase();
    const bodyIdx = lc.indexOf(q);

    let score = 0;
    if (titleHit) score += 100;
    if (headingHit) score += 40;
    if (bodyIdx >= 0) score += 10;
    if (score === 0) continue;

    let snippet = '';
    if (bodyIdx >= 0) {
      const start = Math.max(0, bodyIdx - 42);
      snippet =
        (start > 0 ? '…' : '') +
        d.text.slice(start, bodyIdx + q.length + 64).trim() +
        '…';
    } else if (headingHit) {
      snippet = headingHit;
    }

    results.push({
      unitId: d.unitId,
      moduleId: d.moduleId,
      title: d.title,
      section: headingHit,
      snippet,
      score,
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 30);
}
