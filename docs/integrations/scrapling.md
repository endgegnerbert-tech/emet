# Scrapling integration

`emet` uses Scrapling as an optional resilient page-fetch fallback for blocked, thin, or JavaScript-heavy pages.

## Runtime path

- Node entry point: `lib/page-fetch-adapter.js`
- Research call site: `lib/web-research.js`
- Tests: `test/page-fetch-adapter.test.js`, `test/web-research.test.js`

The normal HTTP/Jina path stays first. Scrapling is only attempted after `assessPageAttempt()` marks a page as weak, blocked, or dynamic.

## Local source checkout

The repository keeps `Scrapling/` as a submodule checkout from:

```text
https://github.com/D4Vinci/Scrapling.git
```

This is useful for local development because `page-fetch-adapter.js` adds that checkout to `PYTHONPATH` before importing `scrapling`.

Package consumers do not receive the submodule in the npm package. For packaged/runtime installs, Scrapling must be available in the configured Python environment.

## Python environment

Default resolution order:

1. `PYTHON` environment variable
2. `.venv-scrapling/bin/python`
3. `python3`

The runtime probe imports:

```python
lxml
patchright
playwright
scrapling
```

If the probe fails, `fetchWithScrapling()` returns `null` and `emet` falls back without failing the research run.

## Cleanup decision

Do not archive or delete `Scrapling/` while the fallback path is active. Keep it as a correctly declared submodule, or replace the integration with a documented pip dependency and update `page-fetch-adapter.js` first.
