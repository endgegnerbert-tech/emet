export default {
  name: "forums",
  sourceHints: ["stackoverflow", "discourse", "reddit"],
  allowedSources: ["stackoverflow.com", "discourse", "reddit.com"],
  queryHints: ["site:stackoverflow.com", "discourse", "site:reddit.com"],
  async run() {
    return { name: "forums" };
  },
};
