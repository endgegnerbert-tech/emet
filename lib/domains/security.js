export default {
  name: "security",
  sourceHints: ["cve", "advisory", "security bulletin"],
  allowedSources: ["nvd.nist.gov", "cisa.gov", "mitre.org", "ubuntu.com", "redhat.com", "debian.org", "suse.com"],
  allowedSourceTypes: ["official_doc", "paper"],
  queryHints: ["nvd", "cisa", "mitre", "advisory", "cve"],
  requireAuthoritative: true,
  async run() {
    return { name: "security" };
  },
};
