export function createEvidence(evidence = {}) {
  return {
    type: evidence.type || "web",
    source: evidence.source || "",
    snippet: evidence.snippet || "",
  };
}

export function createClaim(claim = {}) {
  return {
    text: claim.text || "",
    confidence: claim.confidence || "low",
    evidence: Array.isArray(claim.evidence) ? claim.evidence.map(createEvidence) : [],
  };
}

export function explainConfidence(confidence = "low", evidenceCount = 0) {
  if (confidence === "high" && evidenceCount >= 2) return "Multiple sources support this claim.";
  if (confidence === "medium") return "Some supporting evidence was found.";
  return "Limited supporting evidence was found.";
}
