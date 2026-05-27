export default {
  name: "news-current-events",
  sourceHints: ["breaking news", "wire service", "official statement"],
  allowedSources: ["reuters.com", "apnews.com", "bbc.com", "bloomberg.com", "ft.com", "axios.com"],
  allowedSourceTypes: ["news", "official_doc"],
  queryHints: ["breaking news", "official statement", "site:reuters.com", "site:apnews.com"],
  preferRecent: true,
  async run() {
    return { name: "news-current-events" };
  },
};
