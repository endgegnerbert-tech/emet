import { extractVersionContext } from "./version-context.js";

function text(value) {
  return String(value || "").toLowerCase();
}

export function classifyQuestionDomain(question) {
  const q = text(question);
  const versionContext = extractVersionContext(question);
  if (/(cve-|cve\b|advisory|security|vulnerability|exploit)/.test(q)) return "security";
  if (/(status page|status|outage|incident)/.test(q)) return "vendor-status";
  if (/(changelog|release notes?|releases?|version history)/.test(q)) return "changelog";
  if ((versionContext.explicitVersion || /\bapi\s*version|apiversion\b/.test(q)) && (versionContext.deprecatedIntent || versionContext.removedIntent || versionContext.migrationIntent || versionContext.breakingChangeIntent)) return "changelog";
  if (/(github|issue|issues|pull request|repo\b|repository\b|discussions?)/.test(q)) return "github";
  if (/(arxiv|paper|papers|study|(?<!pi-)research|scientific|scholar)/.test(q)) return "papers";
  if (/(rfc|spec|specification|standard|standards)/.test(q)) return "specs";
  if (/(stackoverflow|stack overflow|discourse|reddit|forum|forums)/.test(q)) return "forums";
  if (/(npm|pypi|cargo|maven|package registry|package|library)/.test(q)) return "package-registry";
  return "web";
}

export function normalizeResearchMode(input = {}, fallback = "fast") {
  return input && typeof input === "object" && input.mode ? input.mode : fallback;
}
