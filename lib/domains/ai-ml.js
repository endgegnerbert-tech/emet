export default {
  name: "ai-ml",
  sourceHints: ["model card", "benchmark", "provider docs"],
  allowedSources: ["platform.openai.com", "openai.com", "docs.anthropic.com", "anthropic.com", "ai.google.dev", "huggingface.co", "research.google"],
  allowedSourceTypes: ["official_doc", "paper", "github_readme"],
  queryHints: ["official docs", "model card", "benchmark", "site:huggingface.co"],
  requireAuthoritative: true,
  async run() {
    return { name: "ai-ml" };
  },
};
