export default {
  name: "papers",
  sourceHints: ["arxiv", "semanticscholar", "doi"],
  allowedSources: ["arxiv.org", "semanticscholar.org", "doi.org", "pubmed.ncbi.nlm.nih.gov"],
  allowedSourceTypes: ["paper"],
  queryHints: ["site:arxiv.org", "site:semanticscholar.org", "site:doi.org"],
  requireAuthoritative: true,
  async run() {
    return { name: "papers" };
  },
};
