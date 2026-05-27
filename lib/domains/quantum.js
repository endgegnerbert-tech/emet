export default {
  name: "quantum",
  sourceHints: ["vendor research", "quantum docs", "benchmark"],
  allowedSources: ["research.ibm.com", "qiskit.org", "quantumai.google", "ionq.com", "rigetti.com"],
  allowedSourceTypes: ["official_doc", "paper"],
  queryHints: ["vendor research", "site:research.ibm.com", "site:qiskit.org", "quantum benchmark"],
  requireAuthoritative: true,
  async run() {
    return { name: "quantum" };
  },
};
