import fs from "fs";
import path from "path";
import { resolvePolicyDomain, sourceAuthorityProfile, pageQualitySignals } from "../../../lib/research-policy.js";
import { extractSourceAuthorityFeatures, extractPageQualityFeatures, structuredSourceFromPage } from "../../../lib/router-structured-features.js";

const outAuth = "data/router/gold-source-authority-structured.jsonl";
const outQual = "data/router/gold-page-quality-structured.jsonl";

function getAuthorityLabel(profile) {
  if (profile.authoritative) return "authoritative";
  if (profile.domainBoost > 0) return "secondary_but_good";
  if (profile.sourceType === "forum") return "community_context";
  if (profile.reasons.includes("researchgate_placeholder")) return "unusable";
  return "weak_source";
}

function getQualityLabel(signals) {
  if (signals.blocked) return "blocked";
  if (signals.placeholder) return "placeholder";
  if (signals.negativeSignals.includes("weak_text")) return "thin";
  if (signals.negativeSignals.includes("query_overlap_low")) return "low_query_overlap";
  return "usable";
}

const lines = fs.readFileSync("data/router/examples.jsonl", "utf-8").split("\n").filter(Boolean);
const authorityRows = [];
const qualityRows = [];

// Since examples.jsonl has `inputText` in form "Sources:\n[official_doc] Title" we can parse it to get some synthetic features.
// But wait! We need URLs to run `sourceAuthorityProfile`.
// Let's generate totally synthetic page objects.
const syntheticPages = [
  { url: "https://docs.docker.com/compose/", title: "Docker Compose", text: "Official documentation for Docker Compose. Deploy and manage multi-container applications.", sourceType: "official_doc", fetchStatus: 200 },
  { url: "https://github.com/docker/compose", title: "docker/compose: Define and run multi-container applications with Docker", text: "GitHub repo for compose.", sourceType: "github_repo", fetchStatus: 200 },
  { url: "https://stackoverflow.com/questions/123/docker-error", title: "Docker compose error", text: "I have an error. How to fix? Try this workaround.", sourceType: "forum", fetchStatus: 200 },
  { url: "https://example.com/blocked", title: "Access Denied", text: "Cloudflare Access Denied.", sourceType: "other", fetchStatus: 403 },
  { url: "https://example.com/thin", title: "Short", text: "Just a short page.", sourceType: "other", fetchStatus: 200 },
  { url: "https://aws.amazon.com/s3/", title: "Amazon S3", text: "Object storage built to retrieve any amount of data from anywhere.", sourceType: "official_doc", fetchStatus: 200 },
  { url: "https://nvd.nist.gov/vuln/detail/CVE-2024-1234", title: "CVE-2024-1234", text: "Vulnerability in XYZ component allowing RCE.", sourceType: "official_doc", fetchStatus: 200 },
  { url: "https://arxiv.org/abs/2101.00123", title: "Attention Is All You Need", text: "We propose a new network architecture, the Transformer...", sourceType: "paper", fetchStatus: 200 },
];

let idCounter = 1;
for (const line of lines) {
  const row = JSON.parse(line);
  const query = row.query || "Docker";
  const domain = resolvePolicyDomain(query);

  for (const page of syntheticPages) {
    const profile = sourceAuthorityProfile({ url: page.url, title: page.title, text: page.text, query, domain });
    const authLabel = getAuthorityLabel(profile);

    const signals = pageQualitySignals({ url: page.url, title: page.title, text: page.text, query, status: page.fetchStatus, contentType: "text/html" });
    const qualLabel = getQualityLabel(signals);

    const structuredSrc = { ...page, authoritative: profile.authoritative, blocked: signals.blocked, positive: false, negative: false, versionSignals: null };

    authorityRows.push({
      task: "source_authority",
      query,
      label: authLabel,
      features: extractSourceAuthorityFeatures(query, structuredSrc, domain),
    });

    qualityRows.push({
      task: "page_quality",
      query,
      label: qualLabel,
      features: extractPageQualityFeatures(query, page),
    });
  }
}

fs.writeFileSync(outAuth, authorityRows.map(r => JSON.stringify(r)).join("\n") + "\n");
fs.writeFileSync(outQual, qualityRows.map(r => JSON.stringify(r)).join("\n") + "\n");
console.log("Wrote synthetic data to", outAuth, "and", outQual);
