import { extractVersionContext } from "./version-context.js";

function text(value) {
  return String(value || "").toLowerCase();
}

function matches(value, pattern) {
  return pattern.test(value);
}

export function classifyQuestionDomain(question) {
  const q = text(question);
  const versionContext = extractVersionContext(question);

  if (matches(q, /\b(cve-?\d{4}-\d+|cve\b|advisory|security|vulnerability|exploit|malware|ransomware|zero[-\s]?day|xss|rce|privilege escalation)\b/)) return "security";
  if (matches(q, /\b(medical|medicine|clinical|diagnos(?:is|e)|symptom|treatment|dosage|drug|medication|disease|therapy|patient|side effects?|contraindication|clinical guideline)\b/)) return "medical";
  if (matches(q, /\b(legal|law|lawsuit|liability|contract|compliance|regulation|gdpr|hipaa|copyright|trademark|patent|court|attorney|visa|immigration)\b/)) return "legal";
  if (matches(q, /\b(trading|trader|forex|options?|futures?|premarket|after-hours|market hours?|market calendar|ticker|bid ask|short interest|candlestick|broker|nasdaq|nyse|cme)\b/)) return "trading";
  if (matches(q, /\b(finance|financial|investment|investing|portfolio|mortgage|loan|insurance|retirement|bank|banking|credit score|etf|interest rate|accounting|sec filing|irs guidance)\b/)) return "finance";
  if (matches(q, /\b(status page|status|outage|incident|downtime|degraded)\b/)) return "vendor-status";
  if (matches(q, /\b(changelog|release notes?|releases?|version history|what(?:'s| is) new)\b/)) return "changelog";
  if ((versionContext.explicitVersion || /\bapi\s*version|apiversion\b/.test(q)) && (versionContext.deprecatedIntent || versionContext.removedIntent || versionContext.migrationIntent || versionContext.breakingChangeIntent)) return "changelog";
  if (matches(q, /\b(github|issue|issues|pull request|repo\b|repository\b|discussions?)\b/)) return "github";
  if (matches(q, /\b(npm|pypi|cargo|maven|rubygems|nuget|crates\.io|packagist|package registry|composer require|docker pull)\b/)) return "package-registry";
  if (matches(q, /\b(shopify|liquid theme|shopify plus|shopify app|shopify admin api|shopify checkout)\b/)) return "shopify";
  if (matches(q, /\b(arxiv|paper|papers|study|studies|scientific|scholar|doi|pubmed|journal|literature review|technical report)\b/)) return "papers";
  if (matches(q, /\b(breaking news|headline|headlines|current events?|announced|announcement|acquisition|election|war|sanctions)\b/)) return "news-current-events";
  if (matches(q, /\b(quantum|qubit|qiskit|qec|qldpc|surface code|bosonic)\b/)) return "quantum";
  if (matches(q, /\b(llm|ai|ml|machine learning|deep learning|neural network|rag|embedding|fine[-\s]?tuning|hugging ?face|transformers?|model card|prompt engineering|anthropic|openai|gemini)\b/)) return "ai-ml";
  if (matches(q, /\b(aws|amazon web services|azure|gcp|google cloud|cloudflare workers|cloud run|kubernetes|k8s|terraform|pulumi|iam|eks|ecs|lambda|s3)\b/)) return "cloud-docs";
  if (matches(q, /\b(nist|iso(?:\s|-)?\d+|soc 2|pci dss|wcag|owasp|cis benchmark|fedramp)\b/)) return "standards";
  if (matches(q, /\b(rfc|spec|specification|standard|standards|whatwg|openapi)\b/)) return "specs";
  if (matches(q, /\b(stack\s?overflow|discourse|reddit|forum|forums|hacker news)\b/)) return "forums";
  if (matches(q, /\b(near me|city hall|county clerk|dmv|bürgeramt|anmeldung|parking permit|trash pickup|public transport|bus schedule|opening hours|appointment|license office|business license)\b/)) return "local-howto";
  if (matches(q, /\b(price|pricing|cost|buy|purchase|coupon|discount|shipping|return policy|product review)\b/)) return "ecommerce";
  return "web";
}

export function normalizeResearchMode(input = {}, fallback = "fast") {
  return input && typeof input === "object" && input.mode ? input.mode : fallback;
}
