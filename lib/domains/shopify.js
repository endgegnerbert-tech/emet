export default {
  name: "shopify",
  sourceHints: ["shopify.dev", "help center", "admin api"],
  allowedSources: ["shopify.dev", "help.shopify.com", "shopify.com"],
  allowedSourceTypes: ["official_doc", "github_readme"],
  queryHints: ["site:shopify.dev", "site:help.shopify.com", "shopify admin api", "shopify docs"],
  requireAuthoritative: true,
  async run() {
    return { name: "shopify" };
  },
};
