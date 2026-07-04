# Ledgerbook

Personal condensed study notes, rendered as a static, installable web app.

- Zero-build vanilla JS; content lives in `content/` as Markdown with typed
  fenced blocks (`journal`, `schedule`, `recap`, `mermaid`).
- `node tools/lint-content.mjs` validates content (journals must balance,
  manifest and files must agree) and gates the Pages deploy.
- Serve locally: `python3 -m http.server` from the repo root.

Private study material — not indexed, not for redistribution.
