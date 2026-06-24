# Page-fetch adapter note (historical `scrapling.md` filename)

This file used to document a real Scrapling runtime integration. That is no longer the current setup.

## Current reality

- `emet` does **not** require a local `Scrapling/` submodule.
- `emet` does **not** require a `.venv-scrapling/` environment.
- `lib/web-research.js` is now a thin facade, not the fetch implementation site.

## What exists now

The current page-read path is centered on:

- `lib/research/fetch.js`
- `lib/page-fetch-adapter.js`
- `test/page-fetch-adapter.test.js`
- `test/web-research.test.js`

`lib/page-fetch-adapter.js` keeps the blocked/thin/dynamic heuristics. The helper name `chooseScraplingMode()` remains for compatibility/history, but it is just a small mode-selection heuristic now.

## Documentation rule

If another doc claims that users must install Scrapling, keep a local Scrapling checkout, or run `.venv-scrapling/bin/python`, that doc is stale and should be updated or archived.
