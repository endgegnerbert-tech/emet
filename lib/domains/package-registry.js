export default {
  name: "package-registry",
  sourceHints: ["npm", "pypi", "cargo", "crates.io", "maven", "github releases"],
  allowedSources: ["npmjs.com", "registry.npmjs.org", "npmjs.org", "pypi.org", "files.pythonhosted.org", "crates.io", "docs.rs", "search.maven.org", "central.sonatype.com", "repo1.maven.org", "mvnrepository.com", "api.github.com", "github.com"],
  allowedSourceTypes: ["official_doc", "github_readme", "github_repo"],
  queryHints: ["site:npmjs.com", "site:pypi.org", "site:crates.io", "site:docs.rs", "site:search.maven.org", "site:central.sonatype.com"],
  requireAuthoritative: true,
  async run() {
    return { name: "package-registry" };
  },
};
