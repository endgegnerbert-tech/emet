export default {
  name: "cloud-docs",
  sourceHints: ["cloud docs", "reference", "provider docs"],
  allowedSources: ["docs.aws.amazon.com", "aws.amazon.com", "learn.microsoft.com", "cloud.google.com", "kubernetes.io", "developer.hashicorp.com", "docs.docker.com", "docs.github.com"],
  allowedSourceTypes: ["official_doc", "github_readme"],
  queryHints: ["official docs", "reference", "site:docs.aws.amazon.com", "site:learn.microsoft.com", "site:cloud.google.com", "site:developer.hashicorp.com"],
  requireAuthoritative: true,
  async run() {
    return { name: "cloud-docs" };
  },
};
