# clash-arena (starfall-game) — agent guide

Vite + React + TypeScript game UI. Source in `src/`, static assets in `public/`, build output in `dist/` (do not edit).

## Commands

| Task | Command |
|------|---------|
| Install deps | `npm ci` |
| Dev server | `npm run dev -- --host 0.0.0.0 --port 5173` |
| Production build | `npm run build` |
| Typecheck | `npm run typecheck` |

After UI changes, run **`npm run build`** to verify. Attach a screenshot or short screen recording when the task is visual.

## Do not touch

- `dist/` — generated; never commit unless user asks
- `node_modules/`
- Bulk pin/model assets under `public/pins/`, `public/models/` unless task is explicitly about assets

## Conventions

- Match existing code style; minimal focused diffs
- Game UI icons: raster PNG/WebP only (see `.cursor/rules/game-assets-raster-only.mdc`)
- i18n: add keys to `src/i18n/messages/ru.json` and `en.json` when adding user-visible strings

## Cursor Cloud specific instructions

Cloud agents run on Ubuntu with Node 22. Environment is defined in `.cursor/environment.json`; `vite` terminal may already be running on port **5173**.

1. Run `npm ci` if dependencies look stale
2. For code changes: `npm run build` (required before opening PR)
3. For UI verification: open `http://localhost:5173` in the browser, navigate to the changed screen, capture screenshot or video
4. One task = one focused PR; describe what was tested
5. Do not run long asset pipelines (`pins:regenerate-all`, etc.) unless the task requires it

No secrets required for a standard build. LLM/API keys are optional and not needed for build or typecheck.
