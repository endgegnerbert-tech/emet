export default {
  name: "medical",
  sourceHints: ["clinical guideline", "pubmed", "regulator"],
  allowedSources: ["nih.gov", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov", "fda.gov", "who.int", "ema.europa.eu", "cdc.gov", "nice.org.uk"],
  allowedSourceTypes: ["official_doc", "paper"],
  queryHints: ["site:pubmed.ncbi.nlm.nih.gov", "site:nih.gov", "clinical guideline", "official guidance"],
  requireAuthoritative: true,
  async run() {
    return { name: "medical" };
  },
};
