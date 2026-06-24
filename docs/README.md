# emet docs

Pinned: [README](../README.md) · [tool reference](./tool-reference.md) · [quickstarts](./quickstarts.md) · [hosts](./hosts/README.md) · [examples](./examples.md) · [pipeline](./pipeline.md) · [SECURITY](../SECURITY.md) · [CONTRIBUTING](../CONTRIBUTING.md) · [CHANGELOG](../CHANGELOG.md)

## Start here

- **New user:** [quickstarts](./quickstarts.md)
- **Need host-specific setup:** [hosts/README.md](./hosts/README.md)
- **Need option semantics / best call shapes:** [tool-reference.md](./tool-reference.md)
- **Want real prompts/tool calls:** [examples](./examples.md)
- **Need the current release context:** [releases](./releases/)
- **Need security reporting rules:** [SECURITY.md](../SECURITY.md)

## What emet covers

- live web/docs research
- repo and package lookup
- raw page fetches via `web_fetch`
- full page text via `options.rawPages: true`
- local file grounding via `options.files`
- community/media retrieval via `options.platforms`
- checkpointed research sessions via `interactive: true`

Supported community/media backends today:

- Hacker News (`hn`)
- V2EX (`v2ex`)
- GitHub (`github`)
- RSS/Atom (`rss`)
- YouTube (`youtube`)

Not every social network is supported. Community/media retrieval is read-only and explicit.

## Reference and internals

- [tool-reference.md](./tool-reference.md) — modes, options, and best call patterns
- [hosts/README.md](./hosts/README.md) — shortest path per supported host
- [reference/README.md](./reference/README.md) — stable reference entrypoint
- [pipeline.md](./pipeline.md) — maintainer pipeline/module overview
- [policies/](./policies/) — retrieval policy docs
- [releases/](./releases/) — shipped release notes

Top-level docs should stay evergreen and task-first. Historical plans, fixes, and release notes stay separate so the front door does not rot.

## Project history and deep dives

These are useful for maintainers, audits, and archaeology:

- [fixes/](./fixes/)
- [issues/](./issues/)
- [plans/](./plans/)
- [archive/](./archive/)
