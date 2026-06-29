export default {
  name: "standards",
  sourceHints: ["standard", "framework", "official guidance", "web platform spec"],
  allowedSources: ["nist.gov", "cisecurity.org", "iso.org", "pcisecuritystandards.org", "owasp.org", "w3.org", "ietf.org", "rfc-editor.org", "datatracker.ietf.org", "whatwg.org", "html.spec.whatwg.org", "dom.spec.whatwg.org", "fetch.spec.whatwg.org", "tc39.es"],
  allowedSourceTypes: ["official_doc"],
  queryHints: ["official standard", "official guidance", "site:nist.gov", "site:iso.org", "site:whatwg.org", "site:tc39.es"],
  requireAuthoritative: true,
  async run() {
    return { name: "standards" };
  },
};
