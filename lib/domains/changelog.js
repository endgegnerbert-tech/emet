export default {
  name: "changelog",
  sourceHints: ["changelog", "release notes", "releases"],
  allowedSources: ["github.com", "docs.", "release notes"],
  queryHints: ["release notes", "changelog", "site:github.com/releases"],
  requireAuthoritative: true,
  preferRecent: true,
  async run() {
    return { name: "changelog" };
  },
};
