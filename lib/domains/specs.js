export default {
  name: "specs",
  sourceHints: ["rfc", "spec", "standard"],
  allowedSources: ["modelcontextprotocol.io", "rfc-editor.org", "datatracker.ietf.org", "w3.org"],
  allowedSourceTypes: ["official_doc"],
  queryHints: ["site:modelcontextprotocol.io/specification", "site:rfc-editor.org", "site:datatracker.ietf.org", "RFC"],
  requireAuthoritative: true,
  async run() {
    return { name: "specs" };
  },
};
