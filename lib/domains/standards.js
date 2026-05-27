export default {
  name: "standards",
  sourceHints: ["standard", "framework", "official guidance"],
  allowedSources: ["nist.gov", "cisecurity.org", "iso.org", "pcisecuritystandards.org", "owasp.org", "w3.org", "ietf.org"],
  allowedSourceTypes: ["official_doc"],
  queryHints: ["official standard", "official guidance", "site:nist.gov", "site:iso.org"],
  requireAuthoritative: true,
  async run() {
    return { name: "standards" };
  },
};
