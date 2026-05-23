# pi-research Scrapling fetch design

## Goal
Make `pi-research` more robust at page retrieval by adding a small fetch adapter layer that can fall back to Scrapling only when needed.

## Recommendation
Use **approach A: minimal adapter + heuristics**.

Keep the current fast path for normal sites, and escalate only when the page clearly needs it.

## Current state
`lib/web-research.js` currently fetches pages with plain `fetch()`, then falls back to Jina reader for some URLs. This is fast, but it misses:
- JS-rendered pages
- anti-bot / Cloudflare-protected pages
- empty or misleading HTML responses
- some rate-limited pages where a browser-like fetch would succeed

Scrapling already provides the right primitives:
- `AsyncFetcher` for normal async HTTP fetches
- `DynamicFetcher` for JS-rendered pages
- `StealthyFetcher` for anti-bot pages
- lazy imports, so unused fetchers do not add overhead

## Scope
### In scope
- Add one small fetch abstraction in pi-research
- Use `AsyncFetcher` as the first Scrapling-backed option
- Escalate to `DynamicFetcher` and `StealthyFetcher` only when heuristics say so
- Keep Jina fallback as a separate fallback path
- Preserve current output shape and research flow

### Out of scope
- Scrapling spider system
- full browser automation as the default
- new ranking or synthesis logic
- changing research modes or public API shape

## Proposed flow
For each candidate URL:
1. try current fast HTTP fetch path
2. if the result is weak or blocked, try `AsyncFetcher`
3. if the page still looks thin or unreadable, try Jina reader
4. if the page looks JS-driven, try `DynamicFetcher`
5. if the page looks blocked or rate-limited, try `StealthyFetcher`

## Heuristics
Escalation should happen only on clear signals:
- HTTP 403 / 429
- blocked or challenge-like HTML
- very short body
- parsed text below threshold
- page shell with little content
- evidence that important text is loaded by JavaScript

No site should go straight to stealth by default.

## Design notes
- Keep heuristics cheap: string checks and text-length checks only
- Keep fetch selection local to one URL at a time
- Do not let Scrapling become the default path for normal sources
- Use async-first code so parallel research stays fast
- Preserve existing caching and deduping logic

## Implementation shape
Add a small internal module that decides:
- which fetcher to try first
- when to escalate
- when to stop and return content

`lib/web-research.js` should call that module instead of directly owning all fallback decisions.

## Testing
Add tests for:
- normal static page stays on fast path
- 403/429 triggers escalation
- short/empty body triggers fallback
- JS-heavy page prefers dynamic fetch
- anti-bot signs prefer stealth fetch
- normal URLs do not accidentally pay browser cost

## Success criteria
- better success rate on hard pages
- no meaningful slowdown on normal pages
- no API changes for callers
- no unnecessary Scrapling overhead on the common path
