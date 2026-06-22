const HOST_ALIASES = new Map([
  ["claude", "claude-code"],
  ["claude-code", "claude-code"],
  ["anthropic", "claude-code"],
  ["cursor", "cursor"],
  ["vscode", "vscode-copilot"],
  ["vs-code", "vscode-copilot"],
  ["visual-studio-code", "vscode-copilot"],
  ["copilot", "vscode-copilot"],
  ["github-copilot", "vscode-copilot"],
  ["codex", "codex"],
  ["openai-codex", "codex"],
  ["gemini", "gemini"],
  ["gemini-cli", "gemini"],
  ["generic", "generic"],
]);

const COMMON_TOOL_ANNOTATIONS = {
  title: "emet grounded web research",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const PACKAGE_NAME = "@black-knight.dev/emet";
const TOOL_COMMAND = "emet";
const GLOBAL_INSTALL_COMMAND = `npm install -g ${PACKAGE_NAME}`;

function buildInstallSnippet(snippet) {
  return `${GLOBAL_INSTALL_COMMAND}\n${snippet}`;
}

function buildMcpServersSnippet(serverConfig) {
  return buildInstallSnippet(JSON.stringify({ mcpServers: { [TOOL_COMMAND]: serverConfig } }, null, 2));
}

function buildServersSnippet(serverConfig) {
  return buildInstallSnippet(JSON.stringify({ servers: { [TOOL_COMMAND]: serverConfig } }, null, 2));
}

function buildCodexSnippet() {
  return buildInstallSnippet(`[mcp_servers.${TOOL_COMMAND}]\ncommand = "${TOOL_COMMAND}"`);
}

export const HOST_PROFILES = {
  generic: {
    id: "generic",
    displayName: "Generic MCP Host",
    match: [],
    configSurface: "Any MCP-compatible stdio client",
    installSnippet: buildInstallSnippet(`command: ${TOOL_COMMAND}`),
    toolDescription: "Read-only live web research with ranked sources and citations. Use for current or uncertain facts; avoid repeat calls after a sufficient result.",
    instruction: "Use emet as a read-only research layer. Prefer one focused query, inspect citations, and only call again when the status says evidence is insufficient or conflicting.",
    prompts: ["current_docs", "framework_comparison"],
  },
  "claude-code": {
    id: "claude-code",
    displayName: "Claude Code",
    match: ["claude", "anthropic"],
    configSurface: "Claude Code MCP stdio config",
    installSnippet: buildInstallSnippet(`claude mcp add ${TOOL_COMMAND} -- ${TOOL_COMMAND}`),
    toolDescription: "Claude Code profile: read-only citations for implementation decisions, dependency docs, migration notes, and ambiguity checks before code changes.",
    instruction: "Claude Code: call emet before editing when a task depends on current APIs, migration guidance, security advisories, or conflicting external docs. Use prompts for reusable research workflows; sampling is optional and must degrade safely.",
    prompts: ["current_docs", "migration_check", "security_scan", "framework_comparison"],
  },
  cursor: {
    id: "cursor",
    displayName: "Cursor",
    match: ["cursor"],
    configSurface: ".cursor/mcp.json",
    installSnippet: buildMcpServersSnippet({ command: TOOL_COMMAND }),
    toolDescription: "Cursor profile: read-only cited lookup for compiler errors, library APIs, framework migrations, and official-doc verification. Safe for autonomous use when local context is insufficient.",
    instruction: "Cursor: prefer short, targeted emet calls for build errors, unknown APIs, and current docs. Do not replace local code search; use emet to verify external facts and return citations the IDE chat can inspect.",
    prompts: ["current_docs", "fix_build_error", "migration_check", "framework_comparison"],
  },
  "vscode-copilot": {
    id: "vscode-copilot",
    displayName: "VS Code / GitHub Copilot",
    match: ["vscode", "visual studio code", "copilot"],
    configSurface: ".vscode/mcp.json or user MCP settings",
    installSnippet: buildServersSnippet({ type: "stdio", command: TOOL_COMMAND }),
    toolDescription: "VS Code/Copilot profile: read-only, auditable research with citations for enterprise-safe docs, security, and version checks.",
    instruction: "VS Code/Copilot: use emet when an answer needs auditable external evidence. Favor authoritative sources, preserve citations, and keep workspace changes separate from research output.",
    prompts: ["current_docs", "enterprise_verification", "security_scan", "migration_check"],
  },
  codex: {
    id: "codex",
    displayName: "Codex",
    match: ["codex", "openai"],
    configSurface: "Codex MCP config",
    installSnippet: buildCodexSnippet(),
    toolDescription: "Codex profile: concise read-only research for CLI implementation plans, package docs, changelogs, and cross-checking command behavior.",
    instruction: "Codex: use emet to ground implementation plans in current package docs, changelogs, and command references. Keep calls narrow and treat citations as evidence for later verification.",
    prompts: ["current_docs", "cli_implementation_check", "migration_check", "framework_comparison"],
  },
  gemini: {
    id: "gemini",
    displayName: "Gemini CLI",
    match: ["gemini"],
    configSurface: "~/.gemini/settings.json mcpServers",
    installSnippet: buildMcpServersSnippet({ command: TOOL_COMMAND }),
    toolDescription: "Gemini profile: prompt-friendly cited research for deep dives, API docs, comparisons, and slash-command style workflows.",
    instruction: "Gemini: expose emet prompts as reusable research commands. Use deep mode for broad comparisons and fast mode for focused official-doc checks.",
    prompts: ["current_docs", "deep_dive", "security_scan", "framework_comparison"],
  },
};

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeHostId(value) {
  const key = slug(value);
  if (!key) return null;
  return HOST_ALIASES.get(key) || (HOST_PROFILES[key] ? key : null);
}

export function detectHostId({ clientInfo, env = process.env, requestedHost } = {}) {
  const explicit = normalizeHostId(requestedHost || env.EMET_MCP_HOST || env.MCP_HOST);
  if (explicit) return explicit;

  const haystack = [clientInfo?.name, clientInfo?.title, clientInfo?.version, env.TERM_PROGRAM, env.CURSOR_TRACE_ID ? "cursor" : ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const profile of Object.values(HOST_PROFILES)) {
    if (profile.id === "generic") continue;
    if (profile.match.some((needle) => haystack.includes(needle))) return profile.id;
  }

  return "generic";
}

export function getHostProfile(hostId = "generic") {
  return HOST_PROFILES[normalizeHostId(hostId) || hostId] || HOST_PROFILES.generic;
}

export function resolveHostProfile(options = {}) {
  return getHostProfile(detectHostId(options));
}

export function buildHostInstructions(profile = HOST_PROFILES.generic) {
  return [
    "Use emet for current facts, docs, best practices, comparisons, and citations. Search if unsure.",
    profile.instruction,
    "Use default auto mode for straightforward factual/docs research; use interactive checkpoints for exploratory source/refinement choices.",
    "Use platforms for community/sentiment retrieval, but require authoritative follow-up for factual, security, legal, medical, finance, package, version, or outage claims.",
    "MCP best practice: tools are read-only, resources expose reusable context, prompts expose repeatable workflows, and sampling/elicitation must remain optional client-mediated capabilities.",
  ].filter(Boolean).join("\n");
}

export function buildHostProfileMeta(profile = HOST_PROFILES.generic) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    configSurface: profile.configSurface,
  };
}

export function applyHostProfileToTool(tool, profile = HOST_PROFILES.generic) {
  return {
    ...tool,
    description: `${tool.description} ${profile.toolDescription}`.trim(),
    annotations: {
      ...COMMON_TOOL_ANNOTATIONS,
      ...(tool.annotations || {}),
    },
    _meta: {
      ...(tool._meta || {}),
      "emet/hostProfile": buildHostProfileMeta(profile),
      "emet/readOnly": true,
      "emet/citationRequired": true,
    },
  };
}

export function buildHostResource(profile = HOST_PROFILES.generic) {
  return {
    ...buildHostProfileMeta(profile),
    installSnippet: profile.installSnippet,
    prompts: profile.prompts,
    toolDescription: profile.toolDescription,
    instructions: buildHostInstructions(profile),
  };
}
