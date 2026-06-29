// Official target inference for high-risk docs/spec/package discovery.
// Layer: base — pure query/url helpers, no I/O.

function lower(value = "") {
  return String(value || "").toLowerCase();
}

function hostMatches(url, hosts = []) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function result(title, url, snippet, sourceType = "official_doc", officialTargetPriority = 0) {
  return { title, url, snippet, sourceType, authoritative: true, directOfficialTarget: true, officialTargetPriority };
}

function packageNameAfter(query = "", pattern) {
  const match = String(query || "").match(pattern);
  return match?.[1] || null;
}

function validPackageName(name) {
  const value = String(name || "").toLowerCase();
  return value && !["latest", "current", "version", "versions", "official", "docs", "documentation", "package", "registry"].includes(value);
}

function firstValid(...names) {
  return names.find(validPackageName) || null;
}

function plainPackageName(query = "") {
  const scoped = String(query || "").match(/@[\w.-]+\/[\w.-]+/);
  if (scoped) return scoped[0];
  return null;
}

function npmPackageName(query = "") {
  const text = String(query || "");
  if (!/\b(npm|node package|javascript package|package registry)\b/i.test(text)) return null;
  const scoped = plainPackageName(text);
  if (scoped) return scoped;
  const unscoped = text.match(/\b[a-z0-9][a-z0-9._-]{1,214}\b(?=\s+(?:npm|package|version|docs|current|latest)\b)/i);
  return unscoped ? unscoped[0] : null;
}

function pypiPackageName(query = "") {
  const text = String(query || "");
  if (!/\b(pypi|pip|python package|python library)\b/i.test(text)) return null;
  return firstValid(
    packageNameAfter(text, /\b(?:pypi|pip|python package|python library)\s+([a-z0-9][a-z0-9._-]{0,213})\b/i),
    packageNameAfter(text, /\b([a-z0-9][a-z0-9._-]{0,213})\s+(?:pypi|pip|python package|python library|python package version|latest version)\b/i),
  );
}

function cratesPackageName(query = "") {
  const text = String(query || "");
  if (!/\b(crates?\.io|crate|cargo|rust package)\b/i.test(text)) return null;
  return firstValid(
    packageNameAfter(text, /\b(?:crates?\.io|crate|cargo|rust package)\s+([a-z0-9][a-z0-9_-]{0,63})\b/i),
    packageNameAfter(text, /\b([a-z0-9][a-z0-9_-]{0,63})\s+(?:crate|cargo|crates?\.io|rust package|latest version)\b/i),
  );
}

function mavenCoordinate(query = "") {
  const text = String(query || "");
  if (!/\b(maven|gradle|jvm|java package|artifact)\b/i.test(text)) return null;
  const colon = text.match(/\b([a-z][\w.-]+\.[\w.-]+):([a-z0-9_.-]+)\b/i);
  if (colon) return { groupId: colon[1], artifactId: colon[2], query: `${colon[1]}:${colon[2]}` };
  const artifact = packageNameAfter(text, /\b(?:maven|gradle|artifact|java package)\s+([a-z0-9][a-z0-9_.-]{1,100})\b/i)
    || packageNameAfter(text, /\b([a-z0-9][a-z0-9_.-]{1,100})\s+(?:maven|gradle|artifact|java package|latest version)\b/i);
  return artifact ? { artifactId: artifact, query: artifact } : null;
}

function githubRepoSlug(query = "") {
  const text = String(query || "");
  if (!/\b(github|release|releases|tags?)\b/i.test(text)) return null;
  const match = text.match(/\b([a-z0-9_.-]+)\/([a-z0-9_.-]+)\b/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function npmPackagePath(pkg) {
  return String(pkg || "")
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/^%40/i, "@"))
    .join("/");
}

function npmRegistryPath(pkg) {
  return encodeURIComponent(String(pkg || ""));
}

function packageTargets(query = "") {
  const q = lower(query);
  const targets = [];
  const failClosed = /\bofficial|latest|current|version|versions?|docs?|documentation|release|releases\b/.test(q);
  const npm = npmPackageName(query);
  if (npm) {
    targets.push({
      id: "npm-package",
      expectedHosts: ["npmjs.com", "registry.npmjs.org", "npmjs.org", "github.com"],
      queryHints: [`site:npmjs.com/package/${npm}`, `${npm} npm official package`],
      directResults: [
        result(`${npm} - npm`, `https://www.npmjs.com/package/${npmPackagePath(npm)}`, `Official npm registry page for ${npm}.`, "official_doc", 20),
        result(`${npm} metadata - npm registry`, `https://registry.npmjs.org/${npmRegistryPath(npm)}`, `Official npm registry metadata API for ${npm}.`, "official_doc", 18),
      ],
      failClosed,
    });
  }

  const pypi = pypiPackageName(query);
  if (pypi) {
    targets.push({
      id: "pypi-package",
      expectedHosts: ["pypi.org", "files.pythonhosted.org", "github.com"],
      queryHints: [`site:pypi.org/project/${pypi}`, `${pypi} PyPI official package`],
      directResults: [
        result(`${pypi} - PyPI`, `https://pypi.org/project/${encodeURIComponent(pypi)}/`, `Official PyPI project page for ${pypi}.`, "official_doc", 20),
        result(`${pypi} metadata - PyPI JSON`, `https://pypi.org/pypi/${encodeURIComponent(pypi)}/json`, `Official PyPI JSON metadata API for ${pypi}.`, "official_doc", 18),
      ],
      failClosed,
    });
  }

  const crate = cratesPackageName(query);
  if (crate) {
    targets.push({
      id: "crates-package",
      expectedHosts: ["crates.io", "docs.rs", "github.com"],
      queryHints: [`site:crates.io/crates/${crate}`, `site:docs.rs/${crate}`, `${crate} crate official package`],
      directResults: [
        result(`${crate} - crates.io`, `https://crates.io/crates/${encodeURIComponent(crate)}`, `Official crates.io package page for ${crate}.`, "official_doc", 20),
        result(`${crate} metadata - crates.io API`, `https://crates.io/api/v1/crates/${encodeURIComponent(crate)}`, `Official crates.io metadata API for ${crate}.`, "official_doc", 18),
        result(`${crate} - docs.rs`, `https://docs.rs/${encodeURIComponent(crate)}`, `Official docs.rs documentation page for ${crate}.`, "official_doc", 14),
      ],
      failClosed,
    });
  }

  const maven = mavenCoordinate(query);
  if (maven) {
    const searchQuery = maven.groupId ? `g:%22${maven.groupId}%22+AND+a:%22${maven.artifactId}%22` : encodeURIComponent(maven.query);
    targets.push({
      id: "maven-package",
      expectedHosts: ["search.maven.org", "central.sonatype.com", "repo1.maven.org", "mvnrepository.com", "github.com"],
      queryHints: [`site:central.sonatype.com ${maven.query}`, `site:search.maven.org ${maven.query}`, `${maven.query} Maven Central`],
      directResults: [
        result(`${maven.query} - Maven Central Search`, `https://search.maven.org/solrsearch/select?q=${searchQuery}&rows=5&wt=json`, `Official Maven Central search API result for ${maven.query}.`, "official_doc", 18),
        result(`${maven.query} - Central Portal`, `https://central.sonatype.com/search?q=${encodeURIComponent(maven.query)}`, `Official Maven Central Portal search for ${maven.query}.`, "official_doc", 16),
      ],
      failClosed,
    });
  }

  const repo = githubRepoSlug(query);
  if (repo) {
    targets.push({
      id: "github-release",
      expectedHosts: ["github.com", "api.github.com"],
      queryHints: [`site:github.com/${repo}/releases`, `${repo} GitHub releases tags`],
      directResults: [
        result(`${repo} releases - GitHub`, `https://github.com/${repo}/releases`, `Official GitHub releases page for ${repo}.`, "github_repo", 16),
        result(`${repo} latest release - GitHub API`, `https://api.github.com/repos/${repo}/releases/latest`, `Official GitHub REST API latest-release metadata for ${repo}.`, "github_repo", 14),
        result(`${repo} tags - GitHub API`, `https://api.github.com/repos/${repo}/tags`, `Official GitHub REST API tag metadata for ${repo}.`, "github_repo", 12),
      ],
      failClosed,
    });
  }

  return targets;
}

const DOC_TARGET_RULES = [
  {
    id: "react-docs",
    when: /\breact\b/,
    topic: /\b(docs?|documentation|reference|api|hook|hooks?|component|jsx|use[A-Z]?\w*)\b/i,
    expectedHosts: ["react.dev"],
    queryHints: ["site:react.dev/reference", "site:react.dev/learn", "React official docs"],
  },
  {
    id: "python-docs",
    when: /\bpython\b/,
    topic: /\b(docs?|documentation|reference|stdlib|standard library|release notes?|whatsnew|what'?s new|pep)\b/i,
    expectedHosts: ["docs.python.org", "peps.python.org"],
    queryHints: ["site:docs.python.org", "site:peps.python.org", "Python official docs"],
  },
  {
    id: "node-docs",
    when: /\bnode(?:\.js|js)?\b/,
    topic: /\b(docs?|documentation|reference|api|release notes?|lts|module|modules?)\b/i,
    expectedHosts: ["nodejs.org"],
    queryHints: ["site:nodejs.org/api", "site:nodejs.org/en/blog/release", "Node.js official docs"],
  },
  {
    id: "web-platform-docs",
    when: /\b(mdn|html|css|javascript|web api|web platform|dom|fetch api|service worker|whatwg|w3c)\b/,
    topic: /\b(docs?|documentation|reference|spec|specification|standard|api)\b/i,
    expectedHosts: ["developer.mozilla.org", "html.spec.whatwg.org", "dom.spec.whatwg.org", "fetch.spec.whatwg.org", "w3.org"],
    queryHints: ["site:developer.mozilla.org", "site:whatwg.org", "site:w3.org", "MDN official reference"],
  },
  {
    id: "kubernetes-docs",
    when: /\b(kubernetes|kubectl|k8s)\b/,
    topic: /\b(docs?|documentation|reference|api|manifest|yaml|resource|release notes?)\b/i,
    expectedHosts: ["kubernetes.io"],
    queryHints: ["site:kubernetes.io/docs", "Kubernetes official docs"],
  },
  {
    id: "docker-docs",
    when: /\b(docker|dockerfile|compose|container)\b/,
    topic: /\b(docs?|documentation|reference|api|compose|dockerfile|release notes?)\b/i,
    expectedHosts: ["docs.docker.com"],
    queryHints: ["site:docs.docker.com", "Docker official docs"],
  },
  {
    id: "cloud-provider-docs",
    when: /\b(aws|amazon web services|azure|gcp|google cloud|terraform|hashicorp)\b/,
    topic: /\b(docs?|documentation|reference|api|iam|policy|sdk|cli|release notes?)\b/i,
    expectedHosts: ["docs.aws.amazon.com", "aws.amazon.com", "learn.microsoft.com", "cloud.google.com", "developer.hashicorp.com"],
    queryHints: ["site:docs.aws.amazon.com", "site:learn.microsoft.com", "site:cloud.google.com", "site:developer.hashicorp.com"],
  },
  {
    id: "github-docs",
    when: /\bgithub\b/,
    topic: /\b(docs?|documentation|reference|api|actions|workflow|rest|graphql)\b/i,
    expectedHosts: ["docs.github.com", "api.github.com", "github.com"],
    queryHints: ["site:docs.github.com", "GitHub official docs"],
  },
  {
    id: "openai-docs",
    when: /\b(openai|chatgpt|responses api|assistants api)\b/,
    topic: /\b(docs?|documentation|reference|api|models?|pricing|changelog)\b/i,
    expectedHosts: ["platform.openai.com", "developers.openai.com", "openai.com"],
    queryHints: ["site:platform.openai.com/docs", "site:developers.openai.com", "OpenAI official docs"],
  },
  {
    id: "anthropic-docs",
    when: /\b(anthropic|claude)\b/,
    topic: /\b(docs?|documentation|reference|api|models?|pricing|changelog)\b/i,
    expectedHosts: ["docs.anthropic.com", "anthropic.com"],
    queryHints: ["site:docs.anthropic.com", "Anthropic official docs"],
  },
];

function docsTargets(query = "") {
  const q = lower(query);
  const requiresOfficial = /\bofficial|docs?|documentation|reference|api|spec|specification|standard|release notes?|changelog|latest|current\b/.test(q);
  return DOC_TARGET_RULES
    .filter((rule) => rule.when.test(q) && rule.topic.test(query))
    .map((rule) => ({
      id: rule.id,
      expectedHosts: rule.expectedHosts,
      queryHints: rule.queryHints,
      directResults: [],
      failClosed: requiresOfficial,
    }));
}

export function inferOfficialTargets(query = "") {
  const q = lower(query);
  const targets = [...docsTargets(query), ...packageTargets(query)];

  if (/\bopenai\b/.test(q) && /\bcodex\b/.test(q)) {
    const urls = [
      result(
        "Model Context Protocol - Codex | OpenAI Developers",
        "https://developers.openai.com/codex/mcp",
        "Official OpenAI Codex documentation for MCP setup, server support, and tool context.",
        "official_doc",
        /\bmcp\b/.test(q) ? 20 : 5,
      ),
      result(
        "Features - Codex CLI | OpenAI Developers",
        "https://developers.openai.com/codex/cli/features",
        "Official OpenAI Codex CLI feature documentation.",
        "official_doc",
        5,
      ),
    ];
    targets.push({
      id: "openai-codex",
      expectedHosts: ["developers.openai.com", "platform.openai.com", "openai.com"],
      queryHints: ["site:developers.openai.com/codex", "OpenAI Codex official docs"],
      directResults: /\bmcp\b/.test(q) ? urls : urls.slice(1),
      failClosed: /\bofficial|docs?|documentation|reference|mcp\b/.test(q),
    });
  }

  if (/\b(model context protocol|mcp)\b/.test(q) && /\b(spec|specification|tools?|resources?|prompts?|inputschema|outputschema|list|call)\b/.test(q)) {
    const directResults = [
      result(
        "Tools - Model Context Protocol",
        "https://modelcontextprotocol.io/specification/2025-11-25/server/tools",
        "Official MCP specification for tool discovery, schemas, annotations, listChanged, and tools/call.",
        "official_doc",
        /\btools?|inputschema|outputschema|call|list\b/.test(q) ? 20 : 8,
      ),
      result(
        "Resources - Model Context Protocol",
        "https://modelcontextprotocol.io/specification/2025-11-25/server/resources",
        "Official MCP specification for resources exposed by servers.",
        "official_doc",
        /\bresources?\b/.test(q) ? 20 : 4,
      ),
      result(
        "Prompts - Model Context Protocol",
        "https://modelcontextprotocol.io/specification/2025-11-25/server/prompts",
        "Official MCP specification for prompt templates exposed by servers.",
        "official_doc",
        /\bprompts?\b/.test(q) ? 20 : 4,
      ),
    ];
    targets.push({
      id: "mcp-spec",
      expectedHosts: ["modelcontextprotocol.io"],
      queryHints: ["site:modelcontextprotocol.io/specification MCP", "Model Context Protocol official specification"],
      directResults,
      failClosed: true,
    });
  }

  if (targets.length === 0) {
    return { ids: [], expectedHosts: [], queryHints: [], directResults: [], failClosed: false };
  }

  return {
    ids: [...new Set(targets.map((target) => target.id))],
    expectedHosts: [...new Set(targets.flatMap((target) => target.expectedHosts))],
    queryHints: [...new Set(targets.flatMap((target) => target.queryHints))],
    directResults: targets.flatMap((target) => target.directResults),
    failClosed: targets.some((target) => target.failClosed),
  };
}

export function matchesOfficialTarget(url, target = {}) {
  return !target?.expectedHosts?.length || hostMatches(url, target.expectedHosts);
}
