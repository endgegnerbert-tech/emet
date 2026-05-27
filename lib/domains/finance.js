export default {
  name: "finance",
  sourceHints: ["regulator", "filing", "official guidance"],
  allowedSources: ["sec.gov", "investor.gov", "irs.gov", "federalreserve.gov", "ecb.europa.eu", "finra.org", "consumerfinance.gov"],
  allowedSourceTypes: ["official_doc", "news"],
  queryHints: ["official guidance", "regulator filing", "site:sec.gov", "site:investor.gov"],
  requireAuthoritative: true,
  async run() {
    return { name: "finance" };
  },
};
