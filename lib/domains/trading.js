export default {
  name: "trading",
  sourceHints: ["exchange", "market hours", "regulator"],
  allowedSources: ["sec.gov", "cftc.gov", "finra.org", "nasdaq.com", "nyse.com", "cmegroup.com"],
  allowedSourceTypes: ["official_doc", "news"],
  queryHints: ["official exchange", "market hours", "site:nasdaq.com", "site:nyse.com"],
  requireAuthoritative: true,
  preferRecent: true,
  async run() {
    return { name: "trading" };
  },
};
