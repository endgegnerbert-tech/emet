import web from "./web.js";
import github from "./github.js";
import forums from "./forums.js";
import security from "./security.js";
import packageRegistry from "./package-registry.js";
import changelog from "./changelog.js";
import papers from "./papers.js";
import specs from "./specs.js";
import vendorStatus from "./vendor-status.js";

const PACKS = {
  web,
  github,
  forums,
  security,
  "package-registry": packageRegistry,
  changelog,
  papers,
  specs,
  "vendor-status": vendorStatus,
};

const DOMAIN_NAMES = ["web", "github", "security", "papers", "specs", "changelog", "forums", "package-registry", "vendor-status"];

export function listDomainPacks() {
  return [...DOMAIN_NAMES];
}

export function getDomainPack(name = "web") {
  return PACKS[name] || web;
}

import { classifyQuestionDomain } from "../research-intent.js";

export function resolveDomainConfig(questionOrDomain = "web") {
  const name = PACKS[questionOrDomain] ? questionOrDomain : classifyQuestionDomain(questionOrDomain);
  const pack = PACKS[name] || PACKS.web;
  return {
    domain: name,
    allowedSources: pack.allowedSources || [],
    allowedSourceTypes: pack.allowedSourceTypes || [],
    queryHints: pack.queryHints || [],
    requireAuthoritative: Boolean(pack.requireAuthoritative),
    format: pack.format || "markdown",
  };
}
