# Security Policy

## Report a vulnerability

Please **do not open a public GitHub issue** for security bugs.

Preferred path:

1. Use GitHub's private **Report a vulnerability** flow for this repository if it is available.
2. If private reporting is not available, contact the maintainer privately through GitHub before any public disclosure.

## What to include

Please include:

- affected package/version
- exact host/runtime (`Pi`, `Claude Code`, `Codex`, `Cursor`, `Gemini`, `VS Code/Copilot`, plain CLI)
- reproduction steps
- impact
- proof-of-concept or minimal testcase
- whether secrets, tokens, cookies, or local files are involved

Please **do not** paste real secrets, tokens, cookies, or private data into a public channel.

## Response expectations

Best effort targets:

- acknowledgement within **5 business days**
- follow-up when triage confirms impact
- coordinated disclosure after a fix or mitigation is ready

## Scope

In scope examples:

- remote code execution
- path traversal
- sensitive data exposure
- auth/token/cookie leakage
- unsafe fetch/logging behavior that can expose secrets
- package/distribution issues that make users run the wrong code

Out of scope examples:

- support requests
- feature requests
- missing integrations for unsupported social platforms
- rate limits or blocks imposed by third-party services
- vulnerabilities in user code, user prompts, or third-party dependencies with no emet-specific exploit path

## Supported versions

Please reproduce on the **latest published version** of `@black-knight.dev/emet` before reporting.

Security fixes are expected to land on the current release line first.
