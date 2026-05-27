export default {
  name: "ecommerce",
  sourceHints: ["official product", "pricing", "return policy"],
  allowedSourceTypes: ["official_doc", "news", "other"],
  queryHints: ["official product", "pricing", "return policy", "official store"],
  preferRecent: true,
  async run() {
    return { name: "ecommerce" };
  },
};
