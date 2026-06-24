# AGENTS.md — emet

## Commands

```bash
npm test                                # 260 tests
npm run check                           # tests + pack
node --test test/boundary-audit.test.js # verify layer boundaries
node bin/emet.js doctor                 # collector health
npm run pack:dry                        # verify publishable
```

## Never touch

- `lib/web-research.js` — pure re-export facade. Add logic to `lib/research/<module>.js`.
- `lib/research-memory.js` — persistent cache. No auth tokens, cookies, or secrets.
- Base-layer modules — no `fetch()`, no filesystem, no `process.env`.

## Layers (strict — imports go inward only)

```
Facade:      lib/web-research.js
Workbench:   lib/research/pipeline.js
Platform:    lib/research/{search,fetch,queries,synthesis}.js
Adapter:     lib/retrieval/community.js  lib/collectors/  mcp/  bin/  index.js
Base:        lib/research/{cache,config,helpers}.js  lib/research-{contract,session,flow}.js
Base:        lib/retrieval/normalize.js  lib/research{,-evidence,-policy,...}.js
Infra:       lib/research-memory.js  lib/local-logger.js
```

Hard rules:

```
Base         → no imports from Platform, Adapter, Workbench
Retrieval    → returns candidates, never decides sufficiency
Collectors   → never synthesize answers
MCP/Pi/CLI   → import only runWebResearch, webFetch
Logs/traces  → no auth tokens, cookies, API keys
```

## Adding code

1. Pick the right layer from above.
2. Write the module. Every new module gets one `test/<name>.test.js`.
3. Add to `package.json` `files`.
4. Run `npm run check`.
5. If a new dependency: stdlib first, existing dep second, new dep last. Base layer = zero non-stdlib deps.

## Ponytail

No DI, no single-implementation interfaces, no plugin frameworks.
Stdlib > dependency, native > library, deletion > addition.
Mark shortcuts with `// ponytail:` comment.
