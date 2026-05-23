import {
  classifyDomainWithTinyRouter,
  classifyConflictWithTinyRouter,
  classifySufficiencyWithTinyRouter,
  classifyFollowupWithTinyRouter
} from "../../lib/tiny-router.js";
import { stopTinyRouterDaemon } from "../../lib/tiny-router.js";

const ENV = {
  EMET_TINY_ROUTER: "1",
  EMET_TINY_ROUTER_FOLLOWUP: "1",
  EMET_TINY_ROUTER_CONFLICT: "1",
  EMET_TINY_ROUTER_SUFFICIENCY: "1",
  EMET_TINY_ROUTER_MODEL: ".cache/models/emet-router",
  EMET_TINY_ROUTER_PYTHON: ".venv-router/bin/python",
};

// 1. Domain Test Cases
const domainCases = [
  { query: "how to boil an egg perfectly", expected: null }, // heuristic fallback (web)
  { query: "CVE-2024-3094 xz utils backdoor analysis", expected: "security" },
  { query: "Attention is all you need NeurIPS", expected: "papers" },
  { query: "React 19 RC release notes", expected: "changelog" },
  { query: "npm install left-pad failing", expected: "package-registry" },
  { query: "nextjs issue 55431 hydration error", expected: "github" },
  { query: "AWS eu-central-1 outage report today", expected: "vendor-status" },
  { query: "RFC 793 Transmission Control Protocol", expected: "specs" },
  { query: "reddit how to fix arch linux wifi", expected: "forums" },
];

// 2. Conflict Test Cases
const conflictCases = [
  {
    query: "is node 20 stable yet?",
    pages: [
      { title: "Node 20 Release", url: "https://nodejs.org", sourceType: "official_doc", text: "Node 20 is now LTS and completely stable.", authoritative: true },
      { title: "Blog", url: "https://dev.to/foo", sourceType: "blog", text: "Node 20 is completely broken and not supported." }
    ],
    // Blog contradicts official doc -> should be resolved_by_authority or needs_review, not no_conflict.
  },
  {
    query: "react server components support in vite",
    pages: [
      { title: "Vite Docs", url: "https://vitejs.dev", sourceType: "official_doc", text: "Vite currently does not support React Server Components natively.", authoritative: true },
      { title: "Vite PR", url: "https://github.com/vitejs/vite", sourceType: "github_repo", text: "We are experimenting with RSC support.", authoritative: true }
    ]
  }
];

// 3. Sufficiency Test Cases
const sufficiencyCases = [
  {
    query: "CVE-2023-4863 details",
    pages: [
      { title: "Random News", url: "https://news.com", sourceType: "news", text: "There is a new CVE called CVE-2023-4863." }
    ]
    // Only one weak source for security -> should veto and return need_authority or similar.
  },
  {
    query: "CVE-2023-4863 details",
    pages: [
      { title: "NVD", url: "https://nvd.nist.gov", sourceType: "official_doc", text: "CVE-2023-4863: Heap buffer overflow in libwebp...", authoritative: true }
    ]
    // Authoritative source present -> should return sufficient.
  }
];

// 4. Followup Test Cases
const followupCases = [
  {
    query: "docker buildx multi architecture",
    mode: "deep",
    conflict: "none",
    sources: { has_authority: false, source_count: 2, has_forum: true, has_news: false, has_recent: false }
    // No authority in deep mode -> should return need_authority
  },
  {
    query: "CVE-2024-3094 xz utils backdoor analysis",
    mode: "deep",
    conflict: "severe",
    sources: { has_authority: true, source_count: 4, has_forum: true, has_news: true, has_recent: true }
    // severe conflict -> should return need_conflict_resolution
  }
];

async function run() {
  console.log("=== RUNNING UNSEEN DATA EVALUATION ===\n");

  let correctDomain = 0;
  for (const c of domainCases) {
    const res = await classifyDomainWithTinyRouter(c.query, "fast", undefined, ENV);
    const pass = res === c.expected;
    if (pass) correctDomain++;
    console.log(`[Domain] Query: "${c.query}"\n  -> Expected: ${c.expected}, Got: ${res} [${pass ? "PASS" : "FAIL"}]`);
  }
  console.log(`Domain Accuracy: ${correctDomain}/${domainCases.length} (${((correctDomain/domainCases.length)*100).toFixed(1)}%)\n`);

  for (const c of conflictCases) {
    const res = await classifyConflictWithTinyRouter(c.query, c.pages, undefined, ENV);
    console.log(`[Conflict] Query: "${c.query}"\n  -> Router Decision: ${res}`);
  }
  console.log();

  for (const c of sufficiencyCases) {
    const res = await classifySufficiencyWithTinyRouter(c.query, c.pages, undefined, ENV);
    console.log(`[Sufficiency] Query: "${c.query}"\n  -> Router Decision: ${res}`);
  }
  console.log();

  for (const c of followupCases) {
    const res = await classifyFollowupWithTinyRouter(c.query, c.mode, c.conflict, c.sources, undefined, ENV);
    console.log(`[Followup] Query: "${c.query}" (Mode: ${c.mode}, Conflict: ${c.conflict})\n  -> Router Decision: ${res}`);
  }
  console.log();

  stopTinyRouterDaemon();
}

run().catch(console.error);
