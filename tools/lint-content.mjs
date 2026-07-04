#!/usr/bin/env node
/* Content linter — CI gate.
   Checks:
   1. Every manifest module with status "ready" has a content file (and vice versa).
   2. Every ```journal block parses and balances (sum DR === sum CR, numeric rows).
   3. Every ```schedule block parses with columns/rows of consistent width.
   4. Every ```mermaid block opens with a known diagram type.
   5. Callout tags are from the allowed set.
   6. Module has at least as many "## " sections as a floor of one per two lessons
      (completeness heuristic — combined Part 1/Part 2 lessons allowed). */

import { readFile, access } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CONTENT = path.join(ROOT, 'content');

const MERMAID_TYPES = /^(flowchart|graph|mindmap|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|timeline|quadrantChart)\b/;
const CALLOUTS = new Set(['EXAM', 'TRAP', 'MNEMONIC', 'RULE']);

const errors = [];
const warnings = [];

function err(file, msg) {
  errors.push(`${file}: ${msg}`);
}
function warn(file, msg) {
  warnings.push(`${file}: ${msg}`);
}

function extractFences(md) {
  const fences = [];
  const re = /^```(\w+)\n([\s\S]*?)^```/gm;
  let m;
  while ((m = re.exec(md)) !== null) {
    fences.push({ lang: m[1], body: m[2] });
  }
  return fences;
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function checkJournal(file, body, idx) {
  let spec;
  try {
    spec = JSON.parse(body);
  } catch (e) {
    err(file, `journal #${idx} is not valid JSON: ${e.message}`);
    return;
  }
  const entries = Array.isArray(spec.entries)
    ? spec.entries
    : [
        ...(spec.dr || []).map(([account, amount]) => ({ side: 'dr', account, amount })),
        ...(spec.cr || []).map(([account, amount]) => ({ side: 'cr', account, amount })),
      ];
  if (entries.length === 0) {
    err(file, `journal #${idx} has no entries`);
    return;
  }
  let dr = 0;
  let cr = 0;
  let numeric = true;
  for (const e of entries) {
    if (e.side !== 'dr' && e.side !== 'cr') {
      err(file, `journal #${idx} entry has invalid side "${e.side}"`);
      return;
    }
    const n = toNumber(e.amount);
    if (n === null) {
      numeric = false;
      continue;
    }
    if (e.side === 'dr') dr += n;
    else cr += n;
  }
  if (numeric && Math.abs(dr - cr) > 0.005) {
    err(file, `journal #${idx} ("${spec.desc || ''}") does not balance: DR ${dr} vs CR ${cr}`);
  }
}

function checkSchedule(file, body, idx) {
  let spec;
  try {
    spec = JSON.parse(body);
  } catch (e) {
    err(file, `schedule #${idx} is not valid JSON: ${e.message}`);
    return;
  }
  if (!Array.isArray(spec.columns) || spec.columns.length === 0) {
    err(file, `schedule #${idx} missing columns`);
    return;
  }
  const width = spec.columns.length;
  for (const [i, row] of (spec.rows || []).entries()) {
    if (!Array.isArray(row) || row.length !== width) {
      err(file, `schedule #${idx} row ${i + 1} has ${row.length} cells, expected ${width}`);
    }
  }
  if (spec.totals && spec.totals.length !== width) {
    err(file, `schedule #${idx} totals width mismatch`);
  }
}

function checkMermaid(file, body, idx) {
  const first = body.trim().split('\n')[0].trim();
  if (!MERMAID_TYPES.test(first)) {
    err(file, `mermaid #${idx} starts with unknown diagram type: "${first}"`);
  }
}

function checkCallouts(file, md) {
  const re = /^>\s*\[!(\w+)\]/gm;
  let m;
  while ((m = re.exec(md)) !== null) {
    if (!CALLOUTS.has(m[1])) {
      err(file, `unknown callout tag [!${m[1]}]`);
    }
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(CONTENT, 'manifest.json'), 'utf8'));

  const expected = new Set();
  for (const unit of manifest.units) {
    for (const mod of unit.modules) {
      const rel = `${unit.id}/${mod.id}.md`;
      const file = path.join(CONTENT, rel);
      if (mod.status === 'ready') {
        expected.add(rel);
        try {
          await access(file);
        } catch {
          err('manifest.json', `module ${unit.id}/${mod.id} is "ready" but ${rel} is missing`);
          continue;
        }
        const md = await readFile(file, 'utf8');
        const fences = extractFences(md);
        let j = 0;
        let s = 0;
        let d = 0;
        for (const f of fences) {
          if (f.lang === 'journal') checkJournal(rel, f.body, ++j);
          else if (f.lang === 'schedule') checkSchedule(rel, f.body, ++s);
          else if (f.lang === 'mermaid') checkMermaid(rel, f.body, ++d);
        }
        checkCallouts(rel, md);

        const sections = (md.match(/^## /gm) || []).length;
        const lessons = mod.lessons || 0;
        if (lessons > 0 && sections < Math.ceil(lessons / 2)) {
          warn(rel, `only ${sections} sections for ${lessons} lessons — check nothing was skipped`);
        }
        if (d === 0) {
          warn(rel, 'no mermaid diagram — every module should carry at least one revision visual');
        }
        if (!fences.some((f) => f.lang === 'recap')) {
          warn(rel, 'no recap block — every module should end with a quick recap');
        }
      }
    }
  }

  for await (const entry of glob('*/M*.md', { cwd: CONTENT })) {
    const rel = entry.split(path.sep).join('/');
    if (!expected.has(rel)) {
      const id = rel.replace('.md', '');
      warn('manifest.json', `${rel} exists but ${id} is not marked "ready" in the manifest`);
    }
  }

  for (const w of warnings) console.warn(`WARN  ${w}`);
  for (const e of errors) console.error(`ERROR ${e}`);
  console.log(`\nlint-content: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
