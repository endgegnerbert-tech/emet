export default {
  name: "vendor-status",
  sourceHints: ["status", "incident", "outage"],
  allowedSources: ["status", "statuspage.io", "status.github.com"],
  queryHints: ["status page", "incident", "outage"],
  requireAuthoritative: true,
  async run() {
    return { name: "vendor-status" };
  },
};
