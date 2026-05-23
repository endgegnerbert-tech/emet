export default {
  name: "github",
  sourceHints: ["issues", "discussions", "pull requests", "readme"],
  allowedSources: ["github.com"],
  queryHints: ["site:github.com", "issues", "discussions", "readme"],
  async run() {
    return { name: "github" };
  },
};
