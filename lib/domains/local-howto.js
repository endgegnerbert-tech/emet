export default {
  name: "local-howto",
  sourceHints: ["city or county office", "official local guidance", "permit"],
  allowedSources: ["gov", "gc.ca", "gouv.fr", "admin.ch", "official"],
  allowedSourceTypes: ["official_doc", "other"],
  queryHints: ["site:gov", "official city", "official county", "permit"],
  requireAuthoritative: true,
  async run() {
    return { name: "local-howto" };
  },
};
