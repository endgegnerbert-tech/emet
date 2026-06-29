# Scope
Audit focus: test coverage quality, eval realism, stale docs, compatibility leftovers, dead modules, and decorative fields.

# Files inspected
- [/Users/einarjaeger/github/emet/lib/eval/runner.js](/Users/einarjaeger/github/emet/lib/eval/runner.js)
- [/Users/einarjaeger/github/emet/lib/eval/case-loader.js](/Users/einarjaeger/github/emet/lib/eval/case-loader.js)
- [/Users/einarjaeger/github/emet/eval/cases/web/basic.json](/Users/einarjaeger/github/emet/eval/cases/web/basic.json)
- [/Users/einarjaeger/github/emet/eval/cases/forums/basic.json](/Users/einarjaeger/github/emet/eval/cases/forums/basic.json)
- [/Users/einarjaeger/github/emet/eval/cases/github/basic.json](/Users/einarjaeger/github/emet/eval/cases/github/basic.json)
- [/Users/einarjaeger/github/emet/eval/cases/package-registry/basic.json](/Users/einarjaeger/github/emet/eval/cases/package-registry/basic.json)
- [/Users/einarjaeger/github/emet/eval/cases/papers/basic.json](/Users/einarjaeger/github/emet/eval/cases/papers/basic.json)
- [/Users/einarjaeger/github/emet/eval/cases/security/basic.json](/Users/einarjaeger/github/emet/eval/cases/security/basic.json)
- [/Users/einarjaeger/github/emet/eval/cases/changelog/basic.json](/Users/einarjaeger/github/emet/eval/cases/changelog/basic.json)
- [/Users/einarjaeger/github/emet/eval/cases/github/authority.json](/Users/einarjaeger/github/emet/eval/cases/github/authority.json)
- [/Users/einarjaeger/github/emet/eval/cases/papers/researchgate-and-vendor.json](/Users/einarjaeger/github/emet/eval/cases/papers/researchgate-and-vendor.json)
- [/Users/einarjaeger/github/emet/eval/cases/web/blocked-placeholder.json](/Users/einarjaeger/github/emet/eval/cases/web/blocked-placeholder.json)
- [/Users/einarjaeger/github/emet/eval/cases/web/followup-dead-end.json](/Users/einarjaeger/github/emet/eval/cases/web/followup-dead-end.json)
- [/Users/einarjaeger/github/emet/test/eval-runner.test.js](/Users/einarjaeger/github/emet/test/eval-runner.test.js)
- [/Users/einarjaeger/github/emet/docs/pipeline.md](/Users/einarjaeger/github/emet/docs/pipeline.md)
- [/Users/einarjaeger/github/emet/README.md](/Users/einarjaeger/github/emet/README.md)
- [/Users/einarjaeger/github/emet/docs/releases/1.4.5.md](/Users/einarjaeger/github/emet/docs/releases/1.4.5.md)
- [/Users/einarjaeger/github/emet/lib/research-contract.js](/Users/einarjaeger/github/emet/lib/research-contract.js)
- [/Users/einarjaeger/github/emet/lib/research-session.js](/Users/einarjaeger/github/emet/lib/research-session.js)
- [/Users/einarjaeger/github/emet/lib/research-trace.js](/Users/einarjaeger/github/emet/lib/research-trace.js)

# Findings
1. High risk: the eval suite is mostly a static helper check, not a regression harness for the real pipeline. `lib/eval/runner.js` only calls pure helpers like `classifyQuestionDomain()`, `buildFollowUpQuery()`, `pageQualitySignals()`, `scoreSourceEntry()`, and `evaluateSufficiency()`. `test/eval-runner.test.js` then only asserts pass-rate shape plus three domains at `1.0`. Nothing here runs `runWebResearch()`, exercises fetch/search, or proves the end-to-end turn loop still works.
2. Medium risk: the eval corpus is thin and partly decorative, so it can look broader than it is. Seven of the basic fixtures are single-question smoke cases (`web/basic.json`, `forums/basic.json`, `github/basic.json`, `package-registry/basic.json`, `papers/basic.json`, `security/basic.json`, `changelog/basic.json`) and the extra fields `expectedQuality` / `expectedClaims` are never read anywhere in `lib/eval/runner.js`. Only `github/authority.json`, `papers/researchgate-and-vendor.json`, `web/blocked-placeholder.json`, and `web/followup-dead-end.json` actually assert behavior beyond domain naming. That leaves ranking, fetch quality, and realistic failure modes undermeasured.
3. Medium risk: `docs/pipeline.md` is out of sync with the current repo shape and package scripts. It still tells maintainers that `npm run check` runs `audit:roadmap`, lists `npm run audit:roadmap`, `npm run audit:promotion`, and `npm run check:promotion`, and says canonical router scripts live under `scripts/router/`. None of those scripts/directories exist in `package.json` or the workspace now. It also still names `lib/tiny-router.js` as an infra module even though that file is gone.

# Risks and open questions
- I did not find a clearly dead runtime module in the scoped files; the main leftovers are compatibility shims that are still intentionally referenced. `lib/research-contract.js` still maps `collector_*` and `web_research`, `lib/research-session.js` still exports `COLLECTOR_*` aliases, and the tests still assert those names. If the migration is truly finished, those should be time-boxed for deletion; if not, the docs should say they are temporary.
- `lib/research-trace.js` looks noisy, but the trace fields are still consumed by runtime/evidence code, so I did not treat them as dead.
- The eval corpus is repo-local only; `package.json` does not ship `eval/` or `test/`, so the benchmark remains a development-only guardrail.

# Recommended fixes
- Make the eval runner prove runtime behavior, not just helper behavior. A good first step is one fixture path that drives `runWebResearch()` with deterministic mocked fetch/search responses and asserts the resulting synthesis and trace shape.
- Delete or wire up the decorative fixture fields. If `expectedQuality` and `expectedClaims` are not part of the contract, remove them from the JSON cases; if they are, teach `lib/eval/runner.js` to enforce them.
- Refresh `docs/pipeline.md` against `package.json` and the actual tree. Remove the dead router references, fix the `check` command description, and only document scripts that still exist.
- Decide whether the legacy compatibility surface should stay. If not, remove the `collector_*` / `COLLECTOR_*` shims and update the tests and release notes in the same pass.

# Suggested tests
- Add a regression test that fails if `runEvalSuite()` can pass without calling the runtime pipeline or without observing any probe metadata.
- Add a fixture-level test that asserts `expectedQuality` / `expectedClaims` are either consumed or absent from every case file.
- Add a docs sync test that checks `docs/pipeline.md` only mentions scripts that exist in `package.json` and files that exist on disk.
- Add a migration test for the legacy-action surface so any future deletion of `collector_*` / `legacyAction` shims is intentional and visible.
