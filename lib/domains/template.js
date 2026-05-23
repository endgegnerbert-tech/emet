export default {
  name: "template",
  description: "Minimal domain pack example for emet",
  sourceHints: ["web"],
  queryHints: ["site:example.com"],
  async run(question, options) {
    return {
      claims: [
        {
          text: `This is a minimal example for a domain pack: ${question}`,
          evidence: [
            {
              type: "web",
              source: "https://example.com",
              snippet: "Minimal example",
            },
          ],
          confidence: "medium",
          confidenceDescription: "Just an example",
        },
      ],
      evidenceSummary: "Starter example only.",
      sourceTypes: ["other"],
    };
  },
};
