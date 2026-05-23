# emet assessment

## Short verdict
- Good research tool.
- Not yet a strong exact-answer benchmark solver.

## What it does well
- finds relevant sources
- ranks and filters sources
- fetches and synthesizes live web pages
- handles current facts better than a static model

## Where it still struggles
- hard multi-hop questions
- exact-answer benchmarks
- final answer extraction when the evidence is weak or noisy

## What would improve the real tool
- better search/routing
- better follow-up queries
- better final-answer extraction
- better recency handling for current facts
- better benchmark-specific answer formatting

## Benchmark note
- BrowseComp is a stress test for multi-hop browsing and exact answers.
- FreshQA is closer to the real product use case.
- Improving the benchmark behavior should help the real tool, but only if the changes target search, fetch, and synthesis quality.

## Why MCP showed up
- MCP was the harness layer I used to inspect and run commands.
- `emet` is still the actual extension/tool name.
- So the logs show MCP because that is the transport/tooling layer, not because the tool changed name.
