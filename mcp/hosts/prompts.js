const DEFAULT_PROMPTS = ["current_docs", "framework_comparison"];

const PROMPT_BUILDERS = {
  current_docs: {
    name: "current_docs",
    description: "Verify a package, framework, or API question against current authoritative docs.",
    arguments: [
      { name: "topic", description: "API, package, or behavior to verify", required: true },
    ],
    build: ({ topic }) => `Use the emet tool to verify current authoritative documentation for: ${topic}. Prefer official docs, changelogs, and release notes. Return the answer with citations and note if evidence is insufficient.`,
  },
  framework_comparison: {
    name: "framework_comparison",
    description: "Compare two technologies with current docs, trade-offs, and citations.",
    arguments: [
      { name: "left", description: "First technology", required: true },
      { name: "right", description: "Second technology", required: true },
      { name: "context", description: "Decision context or constraints", required: false },
    ],
    build: ({ left, right, context }) => `Use emet in deep mode to compare ${left} vs ${right}${context ? ` for ${context}` : ""}. Prefer official docs, recent changelogs, benchmarks only when credible, and cite every major claim.`,
  },
  security_scan: {
    name: "security_scan",
    description: "Research recent vulnerabilities, advisories, and mitigations for a dependency or technology.",
    arguments: [
      { name: "target", description: "Technology, dependency, or version to check", required: true },
    ],
    build: ({ target }) => `Use emet in deep mode to find recent security vulnerabilities, CVEs, advisories, exploit notes, and mitigations for: ${target}. Prefer vendor advisories, NVD/CVE records, GitHub Security Advisories, and official release notes.`,
  },
  deep_dive: {
    name: "deep_dive",
    description: "Run a broad, citation-heavy research pass on a technical topic.",
    arguments: [
      { name: "topic", description: "Topic to research", required: true },
    ],
    build: ({ topic }) => `Use emet in deep mode for a broad technical research pass on: ${topic}. Cluster sources by authority, cite key claims, and call out conflicts or missing evidence.`,
  },
  migration_check: {
    name: "migration_check",
    description: "Check version-specific migration guidance, breaking changes, and deprecations.",
    arguments: [
      { name: "dependency", description: "Dependency, framework, or API", required: true },
      { name: "from", description: "Current version", required: false },
      { name: "to", description: "Target version", required: false },
    ],
    build: ({ dependency, from, to }) => {
      const range = from || to ? ` from ${from || "the current version"} to ${to || "the target version"}` : "";
      return `Use emet to research official migration guidance, breaking changes, deprecations, and changelogs for ${dependency}${range}. Keep the result implementation-focused and cite release notes or migration docs.`;
    },
  },
  fix_build_error: {
    name: "fix_build_error",
    description: "Cursor-oriented workflow for grounding compiler/build errors in current docs.",
    arguments: [
      { name: "error", description: "Compiler, runtime, or build error text", required: true },
      { name: "stack", description: "Relevant package/framework context", required: false },
    ],
    build: ({ error, stack }) => `Before changing code, use emet in fast or code mode to research this error${stack ? ` in ${stack}` : ""}: ${error}. Prefer official docs, issue trackers, and release notes. Return likely cause, current fix, and citations.`,
  },
  enterprise_verification: {
    name: "enterprise_verification",
    description: "VS Code/Copilot workflow for auditable external evidence.",
    arguments: [
      { name: "claim", description: "Claim, dependency decision, or implementation assumption to verify", required: true },
    ],
    build: ({ claim }) => `Use emet with requireAuthoritative where possible to verify this claim for an enterprise codebase: ${claim}. Prefer official docs, standards, vendor advisories, and cite all evidence. Flag uncertainty explicitly.`,
  },
  cli_implementation_check: {
    name: "cli_implementation_check",
    description: "Codex-oriented workflow for command/API behavior before implementation.",
    arguments: [
      { name: "task", description: "CLI or API implementation task", required: true },
    ],
    build: ({ task }) => `Use emet in code mode to verify current command/API behavior needed for: ${task}. Prefer official CLI docs, package README, changelog, and examples. Return only implementation-relevant facts with citations.`,
  },
};

function promptNamesForProfile(profile) {
  return profile?.prompts?.length ? profile.prompts : DEFAULT_PROMPTS;
}

export function listPromptsForProfile(profile) {
  return promptNamesForProfile(profile)
    .map((name) => PROMPT_BUILDERS[name])
    .filter(Boolean)
    .map(({ build, ...prompt }) => prompt);
}

export function getPromptForProfile(name, args = {}, profile) {
  const allowed = new Set(promptNamesForProfile(profile));
  const prompt = PROMPT_BUILDERS[name];
  if (!prompt || !allowed.has(name)) throw new Error(`Unknown prompt for ${profile?.displayName || "host"}: ${name}`);

  return {
    description: prompt.description,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: prompt.build(args),
        },
      },
    ],
  };
}
