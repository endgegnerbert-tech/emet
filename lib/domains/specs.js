export default {
  name: "specs",
  sourceHints: ["rfc", "spec", "standard"],
  allowedSources: ["rfc-editor.org", "datatracker.ietf.org", "w3.org"],
  allowedSourceTypes: ["official_doc"],
  queryHints: ["site:rfc-editor.org", "site:datatracker.ietf.org", "RFC"],
  requireAuthoritative: true,
  async run() {
    return { name: "specs" };
  },
};
