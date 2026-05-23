export default {
  name: "package-registry",
  sourceHints: ["npm", "pypi", "cargo", "maven"],
  allowedSources: ["npmjs.com", "pypi.org", "crates.io", "mvnrepository.com"],
  allowedSourceTypes: ["official_doc", "github_readme"],
  queryHints: ["site:npmjs.com", "site:pypi.org", "site:crates.io", "site:mvnrepository.com"],
  requireAuthoritative: true,
  async run() {
    return { name: "package-registry" };
  },
};
