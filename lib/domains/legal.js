export default {
  name: "legal",
  sourceHints: ["statute", "regulation", "official guidance"],
  allowedSources: ["gov", "eur-lex.europa.eu", "ecfr.gov", "congress.gov", "justice.gov", "legislation.gov.uk", "europa.eu"],
  allowedSourceTypes: ["official_doc"],
  queryHints: ["official statute", "official regulation", "site:gov", "official guidance"],
  requireAuthoritative: true,
  async run() {
    return { name: "legal" };
  },
};
