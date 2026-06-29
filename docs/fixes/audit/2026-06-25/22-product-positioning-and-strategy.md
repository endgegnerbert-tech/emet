# Product Positioning and Strategy for emet

Date: 2026-06-25
Status: revised brutal strategy paper
Scope: traction diagnosis, trust/product/positioning/distribution separation, wedge selection, category realism, vendor-platform risk, and messaging reset

## Executive thesis

`emet` is probably more strategically interesting than its current traction implies.

It is also probably less broadly important than its current ambition implies.

Both things can be true.

The uncomfortable diagnosis is this:

> `emet` is not yet perceived as necessary because the market can already buy or click "research" in many places, and because `emet` has not made its one defensible job painfully obvious.

The defensible job is not web search.

It is not "deep research via MCP."

It is not broad business research.

It is:

> evidence discipline for coding agents before they act on technical claims.

That means source policy, version boundaries, contradiction handling, and inspectable research state before an agent edits code, recommends a migration, picks a dependency, or reports a security fact.

This is narrower than the old story.

It is also sharper, more believable, and more sellable.

## Research base

Primary or close-to-primary sources checked for this revision:

- [OpenAI: Introducing deep research](https://openai.com/index/introducing-deep-research/)
- [OpenAI API: Deep research](https://developers.openai.com/api/docs/guides/deep-research)
- [OpenAI Help: Deep research in ChatGPT](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt)
- [OpenAI Codex web](https://developers.openai.com/codex/cloud)
- [OpenAI Codex CLI](https://developers.openai.com/codex/cli)
- [OpenAI Codex MCP docs](https://developers.openai.com/codex/mcp)
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Claude API docs: Web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
- [Claude API docs: MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [Anthropic: Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Google Gemini Deep Research overview](https://gemini.google/overview/deep-research/)
- [Google Cloud: Gemini Deep Research Agent](https://docs.cloud.google.com/gemini-enterprise-agent-platform/agents/use-deep-research)
- [Google Gemini CLI docs](https://developers.google.com/gemini-code-assist/docs/gemini-cli)
- [Google Gemini API coding-agent docs](https://ai.google.dev/gemini-api/docs/coding-agents)
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [Tavily](https://tavily.com/) and [Tavily agents docs](https://docs.tavily.com/agents)
- [Exa](https://exa.ai/) and [Exa search API docs](https://exa.ai/docs/reference/search-api-guide)
- [Brave Search MCP Server](https://github.com/brave/brave-search-mcp-server)
- [Firecrawl](https://www.firecrawl.dev/) and [Firecrawl MCP Server](https://github.com/firecrawl/firecrawl-mcp-server)
- [YouTube Data API quota cost](https://developers.google.com/youtube/v3/determine_quota_cost)
- [YouTube Data API quota audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)
- [X API pricing](https://docs.x.com/x-api/getting-started/pricing)
- [Reddit Data API Terms](https://redditinc.com/policies/data-api-terms)

## The blunt traction diagnosis

Low traction is not one problem.

It is four different problems that are easy to confuse:

- product problem
- trust problem
- positioning problem
- distribution problem

Treating all of these as "we need better docs" would be a mistake.

### 1. Product problem

The product's strongest promise is not fully true yet.

The audit is clear: source policy can be bypassed, cache identity can cross boundaries it should not cross, authority ranking can blur source classes, compatibility paths keep old flows alive, package/CLI surfaces are not deterministic enough, and logging/telemetry need tightening.

That matters because the best strategy for `emet` depends on trust.

If `emet` says "policy-aware evidence engine," then a source-policy bug is not an ordinary bug. It is a category contradiction.

The product problem is not that `emet` lacks features.

The product problem is that its premium claim requires stricter behavior than the code can currently guarantee.

### 2. Trust problem

Trust is different from quality.

A product can be technically impressive and still not trusted for its most valuable use case.

For `emet`, trust means:

- allowed sources are actually enforced
- policy-sensitive cache keys cannot replay looser results
- source classes are not silently promoted by score
- citations point to evidence that supports the claim
- logs do not leak high-detail local state
- host behavior is predictable
- a coding agent can call the tool without quietly widening the research surface

Until this is true, strong trust language should be used sparingly.

Do not overclaim "strict", "safe", "trusted", "fail-closed", or "source controlled" before those words are boringly true.

### 3. Positioning problem

The current public story is too easy to misunderstand.

"Zero-setup grounded research for AI coding agents" is not wrong. It is just not sharp enough.

Users hear:

- web search MCP
- citations
- search plus fetch
- maybe deep research
- maybe another wrapper around providers

That category is crowded and low-status.

The market already has:

- first-party deep research buttons
- web search inside assistants
- MCP search servers
- search APIs for agents
- scraping APIs
- browser automation
- RAG stacks
- hosted research agents

If `emet` does not force a different mental bucket in the first 15 seconds, it loses.

### 4. Distribution problem

Even if the positioning improves, `emet` still has a distribution problem.

Most users will not go looking for independent evidence infrastructure. They will use the research feature inside ChatGPT, Claude, Gemini, Cursor, Codex, Gemini CLI, VS Code, or their company's approved stack.

Distribution favors bundled tools.

That means `emet` must ride existing workflows:

- Codex
- Claude Code
- Gemini CLI
- Cursor
- VS Code/Copilot
- internal MCP setups
- repo-local agent workflows

The product should not ask users to leave their agent.

It should make their agent safer when technical evidence matters.

## Where `emet` might be fooling itself

### It may think sophistication is visible

Architecture is invisible to most users.

If the README reads like another search MCP, users will classify it as another search MCP, even if the internals are more careful.

### It may think broad source coverage is differentiation

Supporting docs, repos, papers, HN, V2EX, RSS, YouTube, Reddit, and pages can look impressive.

But breadth without a trust model looks like sprawl.

The product should win by knowing what each source is for, not by touching many surfaces.

### It may think citations equal trust

Citations are now table stakes.

The user problem is no longer "does the answer have links?"

The problem is:

- were these the right sources?
- did the system obey my source policy?
- did it notice contradiction?
- did it understand version boundaries?
- can I inspect why it believed the claim?

### It may think "for agents" is a wedge

Everyone is now building for agents.

"For AI agents" is no longer a differentiator. It is table stakes.

The sharper wedge is:

- for coding agents
- before code-changing decisions
- when technical evidence must be policy-bound, version-aware, and inspectable

### It may think first-party products leave a large obvious gap

The gap is not large and obvious.

OpenAI, Anthropic, and Google are moving quickly into deep research, APIs, MCP connectors, file search, Workspace, custom sources, code execution, and coding agents.

The gap is narrow:

- host-agnostic evidence state
- strict source policy
- technical research semantics
- local/repo-agent fit
- small composable tool surface

That is enough for a wedge, not enough for a broad consumer research product.

### It may think the category already exists

"Agent evidence infrastructure" is not a category users wake up wanting.

It has to be sold through painful jobs:

- stop agents from citing stale docs before migrations
- expose docs-vs-issue contradictions before edits
- enforce allowed sources for technical claims
- preserve version-aware evidence across repeated tasks

The job creates the category, not the phrase.

## What category `emet` should refuse to compete in

`emet` should explicitly refuse these fights:

### Broad web search

Do not compete with Google, Brave, Exa, Tavily, Perplexity, or built-in assistant search on general-purpose web search.

They have stronger indexes, better distribution, or clearer demand.

### Generic scraping and crawling

Do not compete with Firecrawl-style web-data infrastructure on broad scraping, JS rendering, crawling, mapping, or extraction at scale.

That is a different business with different operational burden.

### Polished research reports

Do not compete with ChatGPT deep research, Claude Research, Gemini Deep Research, or enterprise research assistants on beautiful standalone reports.

They have model, UX, export, connector, and distribution advantages.

### Broad business intelligence

Do not start with market maps, competitor reports, sales research, consumer buying guides, or executive briefing decks.

Those workflows are attractive but distribution-heavy and UX-heavy.

### General RAG infrastructure

Do not become a vector database, indexing platform, document ingestion framework, or enterprise knowledge base.

That would dilute the project and invite better-funded competitors.

### Autonomous everything-research agent

Do not claim to be a complete researcher.

The coding agent or assistant is already the orchestrator. `emet` should be the evidence discipline layer it calls.

## The exact wedge

The strongest wedge is:

> version-sensitive technical evidence for coding agents.

A fuller version:

> `emet` helps coding agents answer technical questions with enforced source policy, version-aware evidence, contradiction handling, and inspectable research state before they change code.

This wedge is narrow, but not tiny.

It includes:

- framework upgrades
- package migrations
- dependency selection
- changelog and release-note research
- API behavior changes
- docs vs implementation mismatch
- GitHub issue and maintainer-comment interpretation
- security advisory and vendor-status checks
- deprecation and compatibility research
- production-readiness checks
- implementation-plan research inside a repo

The common thread is not "research."

The common thread is "an agent may take an action, and bad evidence would make that action wrong."

## The user who should care first

The first user is not "anyone who uses AI agents."

The first user is:

> a developer or agent-workflow maintainer who has already been burned by stale, weak, or overconfident technical research.

They have seen:

- a coding agent cite old docs
- a migration plan miss a breaking change
- a package recommendation ignore maintenance reality
- a security answer cite a blog instead of an advisory
- an assistant average conflicting sources into confident prose
- a web-search tool retrieve pages but not resolve the actual technical question

That user does not need to be convinced that research can fail.

They need to be shown that `emet` prevents a specific class of failure.

## Stronger messaging alternatives

### Primary positioning

> Evidence infrastructure for coding agents.

### Founder-friendly one-liner

> `emet` keeps coding agents honest when they research technical facts before changing code.

### Developer one-liner

> Source-policy-aware research for package, framework, changelog, and GitHub evidence.

### Trust one-liner

> Search tools return pages. `emet` returns technical evidence with source policy, version context, conflicts, and gaps.

### Comparison line

> Generic search MCPs retrieve sources. First-party deep research writes reports. `emet` gives coding agents an inspectable evidence state for technical decisions.

### Product law

> Source constraints are contracts, not hints.

Use that last line only after the audit fixes make it true.

## Messaging to avoid

Avoid leading with:

- web research MCP server
- deep research through MCP
- zero-setup grounded research
- citations for agents
- search, fetch, and summarize
- supports many sources
- works with every AI agent
- better than ChatGPT deep research
- autonomous researcher
- broad research assistant

Some of these can appear as supporting details.

None should be the category claim.

## A sharper homepage/README structure

The first screen should answer four questions.

### 1. What is it?

`emet` is an evidence engine for coding agents.

### 2. When should I use it?

Use it when an agent needs technical evidence before acting: migrations, package choices, changelogs, GitHub issues, security status, API behavior, and docs-vs-reality conflicts.

### 3. Why not normal search?

Normal search finds pages. `emet` tracks source policy, claim-level evidence, version boundaries, contradictions, gaps, and citations that an agent can inspect.

### 4. Why not built-in deep research?

Built-in deep research is excellent for reports. `emet` is a small, host-agnostic evidence layer for coding-agent workflows where source policy and technical actionability matter.

## Product implications

### 1. Harden trust before broadening scope

No new surfaces should outrank:

- host/path allowlist enforcement
- policy-aware cache identity
- authoritative-source semantics
- fetch-before-network policy checks
- redirect checks
- log redaction
- deterministic CLI/MCP behavior

If this delays features, accept the delay.

Trust is the product.

### 2. Make the evidence state visible

The output should expose:

- claims
- supporting sources
- contradicting sources
- source class
- date/version context
- confidence rationale
- unresolved gaps
- suggested next check

Do not bury the differentiator in prose.

### 3. Build for agent action, not report admiration

Every output should help the host agent decide:

- can I act?
- should I ask the user?
- should I fetch more?
- should I run a local test?
- should I avoid changing code?

The answer should be implementation-useful, not merely impressive.

### 4. Keep the surface small

The public API should be boring:

- `runWebResearch`
- `webFetch`
- MCP research tool
- MCP fetch tool
- clear options for source policy, recency, mode, raw pages, and evidence output

Do not expose internal cleverness as product surface.

### 5. Treat memory as an advanced feature, not a launch slogan

Research memory is strategically important but easy to get wrong.

It should start with scoped, policy-aware reuse of validated source/evidence state, not broad personalization or vague "remembers everything" claims.

## Distribution strategy

### Best initial channel: coding-agent ecosystems

The strongest channel is where the pain occurs:

- Codex CLI and Codex web workflows
- Claude Code and MCP users
- Gemini CLI users
- Cursor and VS Code agent users
- teams building internal MCP toolchains

The install story should be framed around specific tasks:

- "Have Codex research a React 19 migration with allowed sources."
- "Have Claude Code check package deprecation using changelogs and GitHub issues."
- "Have Gemini CLI compare docs and issue evidence before editing."

### Better than broad launch: proof artifacts

The product needs public proof, not just docs.

Useful proof artifacts:

- before/after examples where generic search misses a contradiction
- migration research case studies
- source-policy bypass tests made visible
- examples of cache/version safety
- "docs vs GitHub issue" investigations
- transcripts showing an agent choosing not to act because evidence was insufficient

### Community wedge

The best community is not general AI.

The best community is:

- senior developers using coding agents seriously
- open-source maintainers tired of hallucinated package claims
- internal developer-platform engineers wiring MCP tools
- technical writers and staff engineers responsible for migrations

These people understand the cost of stale technical evidence.

## Can this become a meaningful category?

Maybe.

But the honest answer is conditional.

### The optimistic case

Agents are moving from chat to action.

As agents take more actions, the cost of bad evidence rises. In software work, a bad research step can create broken code, wrong migrations, security mistakes, or wasted review cycles.

If that pain becomes common, teams will want a layer that makes evidence policy, provenance, contradiction, and version context inspectable.

In that world, "agent evidence infrastructure" can become a meaningful category.

`emet` could be an early open, technical, developer-native version of it.

### The pessimistic case

The category never becomes explicit.

Frontier vendors absorb enough of the functionality into their agents. Developers tolerate occasional wrong research. Generic search MCPs become good enough. Teams solve high-risk cases with human review rather than specialized infrastructure.

In that world, `emet` remains a niche capability for power users and internal tool builders.

That is not failure if the project is scoped correctly.

A small, trusted, niche tool can be valuable.

It becomes failure only if the project keeps acting like it must become a broad research platform.

### The likely case

The category exists, but unevenly.

Most users will not care.

Some agent-heavy developers and teams will care a lot.

The product should be built for the second group.

## Strategic risk if frontier vendors keep improving fast

This is the largest strategic risk.

OpenAI, Anthropic, and Google can keep compressing `emet`'s opportunity by adding:

- better activity histories
- claim-level citations
- source-quality labels
- connector policy controls
- MCP-native research workflows
- stronger coding-agent integration
- file and repo-aware research
- persistent project memory
- exportable research state

If they do this well, `emet` cannot win on capability breadth.

The defense is not to outrun them feature-for-feature.

The defense is to be:

- smaller
- host-agnostic
- open and inspectable
- technical-domain specific
- stricter about source policy
- easier to wire into agent workflows
- less interested in owning the full user experience

If the vendors eventually expose excellent evidence-state primitives, `emet` may become less of an end-user product and more of a compatibility/policy shim, test harness, or local evidence adapter.

That should be acceptable.

The strategic goal is usefulness, not ego.

## What must become true before the strongest claim is safe

Before `emet` can confidently say "evidence infrastructure for coding agents," these must be true:

- strict source policy is enforced before network calls
- redirects cannot escape policy
- provider results are filtered before ranking and cache
- cache keys include policy, source, version, recency, and mode identity
- topic fallback is disabled for versioned, URL-specific, and strict-policy queries
- ranking cannot promote non-authoritative sources into authority
- evidence output distinguishes source classes and conflicts
- logs are redacted by default
- CLI/MCP host behavior is deterministic
- package install and bin execution are boringly reliable

This is not just engineering cleanup.

It is the path from "interesting project" to "credible product."

## Recommended strategy

### Phase 1: earn the trust claim

Fix the audit's policy, cache, authority, logging, package, and CLI issues before expanding features.

The release narrative should be:

> source constraints are now enforced as contracts

Only say this if it is true.

### Phase 2: expose the evidence layer

Make evidence state visible enough that users can see the difference from search:

- claim table
- support/contradiction mapping
- source classes
- unresolved gaps
- next check

This does not need a complex UI. It needs clear structured output.

### Phase 3: publish wedge examples

Ship examples around:

- package migration
- changelog interpretation
- docs vs GitHub issue contradiction
- security advisory check
- dependency production-readiness review

Each example should show why ordinary search was not enough.

### Phase 4: integrate where developers already work

Optimize docs and defaults for:

- Codex
- Claude Code
- Gemini CLI
- Cursor
- VS Code/Copilot
- internal MCP setups

The product should feel like a dependable Unix tool for agent research, not a destination app.

## Final positioning

The strongest positioning is:

> `emet` is evidence infrastructure for coding agents.

Expanded:

> It gives agents source-policy-aware, version-sensitive, contradiction-aware research state for technical decisions before they change code.

The brutally honest qualifier:

> It should not try to beat first-party deep research products at broad reports or generic search tools at web retrieval. It should win the narrower moment when an agent is about to act and the quality of its technical evidence matters.

That is a real wedge.

It is not guaranteed to become a large category.

But it is coherent, defensible, and worth building toward if the product becomes strict enough to deserve the trust.
