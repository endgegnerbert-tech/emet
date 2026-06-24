import { classifyQuestionDomain } from "./research-intent.js";
import { extractVersionContext } from "./version-context.js";

export const QUERY_UNDERSTANDING_FIELDS = [
  "query_shape",
  "answer_shape",
  "source_family",
  "recency_need",
  "ambiguity",
];

function text(value) {
  return String(value || "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function words(value) {
  return lower(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function hasAny(textValue, patterns = []) {
  return patterns.some((pattern) => pattern.test(textValue));
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function sourceFamilyFromDomain(domain, queryLower) {
  switch (domain) {
    case "academic":
    case "papers":
    case "quantum":
      return "academic";
    case "regulated":
    case "security":
    case "specs":
    case "standards":
    case "vendor-status":
    case "medical":
    case "finance":
    case "trading":
      return "primary_source";
    case "legal":
    case "local-government":
    case "local-howto":
      return "government_or_legal";
    case "developer-docs":
    case "github":
    case "package-registry":
    case "changelog":
    case "cloud-docs":
    case "shopify":
    case "ai-ml":
      return "official_docs";
    case "current-events":
    case "news-current-events":
      return "recent_news";
    case "community":
    case "forums":
      return "community";
    case "commerce":
    case "ecommerce":
      return "product_or_ecommerce";
    default:
      if (/\b(news|headline|announced|launch|acquisition|earnings)\b/.test(queryLower)) return "recent_news";
      return "general_web";
  }
}

function classifyRecencyNeed(queryLower, versionContext) {
  if (/\b(today|right now|currently|current|latest|newest|this week|this month|status|outage|incident|price|pricing|release notes?|changelog|202[4-9])\b/.test(queryLower)) {
    return "required";
  }
  if (versionContext.versionSensitive || /\b(best practices?|recommended|compatib(?:le|ility)|support(?:ed)?|migration|deprecat(?:ed|ion)|roadmap|benchmark)\b/.test(queryLower)) {
    return "helpful";
  }
  return "none";
}

function classifyAmbiguity(queryLower, tokenCount) {
  if (/\b(it|they|them|this|that|these|those|he|she)\b/.test(queryLower)) return "high";
  if (/\b(vs\.?|versus|compare|comparison|or|either|which one|which is better|best)\b/.test(queryLower)) return "medium";
  if (/^(who|what|when|where)\b/.test(queryLower) && tokenCount <= 4) return "high";
  if (tokenCount <= 3) return "medium";
  return "low";
}

function answerShapeForQueryShape(queryShape, tokenCount = Infinity) {
  if (queryShape === "comparison") return "comparison_table";
  if (queryShape === "howto" || queryShape === "troubleshooting") return "step_by_step";
  if (queryShape === "shopping_or_ecommerce" || queryShape === "ambiguous_factoid") return "list";
  if (queryShape === "academic_review" || queryShape === "legal_medical_finance_sensitive") return "citation_heavy";
  if (queryShape === "short_fact" || (queryShape === "current_or_version_sensitive" && tokenCount <= 8)) return "short_answer";
  return "long_explanation";
}

export function classifyQueryUnderstandingKeywordBaseline(query = "") {
  const normalized = text(query);
  const q = lower(query);
  const versionContext = extractVersionContext(normalized);
  const domain = classifyQuestionDomain(normalized);

  let query_shape = "explanation";
  if (/\b(vs\.?|versus|compare|comparison)\b/.test(q)) query_shape = "comparison";
  else if (/\b(how to|how do i|guide|tutorial|steps?)\b/.test(q)) query_shape = "howto";
  else if (/\b(current|latest|today|status|outage|release|changelog|202[4-9])\b/.test(q) || versionContext.versionSensitive) query_shape = "current_or_version_sensitive";
  else if (/\b(paper|survey|literature review|research)\b/.test(q)) query_shape = "academic_review";
  else if (/^(who|when|where|which)\b/.test(q)) query_shape = "short_fact";

  const answer_shape = answerShapeForQueryShape(query_shape, 0);

  const source_family = domain === "papers"
    ? "academic"
    : /\b(official|docs|documentation|api|reference)\b/.test(q)
      ? "official_docs"
      : /\b(status|today|latest|release|news)\b/.test(q)
        ? "recent_news"
        : "general_web";

  const recency_need = classifyRecencyNeed(q, versionContext);
  const ambiguity = /\b(or|which one|it|they|them)\b/.test(q) ? "high" : "low";

  return {
    query_shape,
    answer_shape,
    source_family,
    recency_need,
    ambiguity,
    confidence: 0.5,
    decisionSource: "keyword_baseline",
  };
}

export function classifyQueryUnderstandingHeuristically(query = "", options = {}) {
  const normalized = text(query);
  const q = lower(normalized);
  const tokenList = words(normalized);
  const tokenCount = tokenList.length;
  const versionContext = extractVersionContext(normalized);
  const domain = options.domain || classifyQuestionDomain(normalized);

  const sensitive = hasAny(q, [
    /\b(symptom|diagnosis|dosage|side effects?|treatment|medical|drug|medicine|disease|therapy)\b/,
    /\b(legal|law|regulation|gdpr|tax|contract|visa|immigration|compliance|policy)\b/,
    /\b(finance|financial|invest(?:ing|ment)?|loan|mortgage|insurance|retirement|credit score|tax)\b/,
  ]);
  const academic = hasAny(q, [/\b(paper|papers|study|studies|survey|literature review|arxiv|doi|research|benchmark)\b/]) || domain === "papers";
  const shopping = hasAny(q, [/\b(buy|price|pricing|cost|cheap|cheapest|deal|shop|under \$?\d+|under \d+|product review)\b/]);
  const troubleshooting = hasAny(q, [/\b(error|errors|fix|debug|issue|issues|problem|problems|broken|fails?|failing|not working|stack trace|exception|why does)\b/]);
  const howto = hasAny(q, [/\b(how to|how do i|guide|tutorial|walkthrough|setup|install|configure|migrate|upgrade)\b/]);
  const comparison = hasAny(q, [/\b(vs\.?|versus|compare|comparison|better than|difference between|pros and cons)\b/]);
  const temporal = classifyRecencyNeed(q, versionContext) !== "none";
  const ambiguity = classifyAmbiguity(q, tokenCount);

  let query_shape = "explanation";
  let confidence = 0.6;

  if (sensitive) {
    query_shape = "legal_medical_finance_sensitive";
    confidence = 0.92;
  } else if (shopping) {
    query_shape = "shopping_or_ecommerce";
    confidence = 0.88;
  } else if (academic) {
    query_shape = "academic_review";
    confidence = 0.9;
  } else if (troubleshooting) {
    query_shape = "troubleshooting";
    confidence = 0.86;
  } else if (howto) {
    query_shape = "howto";
    confidence = 0.86;
  } else if (comparison) {
    query_shape = "comparison";
    confidence = 0.9;
  } else if (temporal) {
    query_shape = "current_or_version_sensitive";
    confidence = 0.84;
  } else if (ambiguity === "high") {
    query_shape = "ambiguous_factoid";
    confidence = 0.72;
  } else if (/^(who|when|where|which)\b/.test(q) || (/^(what|is|are|can|does|did)\b/.test(q) && tokenCount <= 8)) {
    query_shape = "short_fact";
    confidence = 0.78;
  }

  const answer_shape = answerShapeForQueryShape(query_shape, tokenCount);

  let source_family = sourceFamilyFromDomain(domain, q);
  if (sensitive && /\b(legal|law|regulation|tax|policy|visa|immigration|government)\b/.test(q)) source_family = "government_or_legal";
  else if (sensitive) source_family = "primary_source";
  else if (shopping) source_family = "product_or_ecommerce";
  else if (academic) source_family = "academic";
  else if (query_shape === "short_fact" || query_shape === "ambiguous_factoid") source_family = domain === "web" ? "encyclopedia" : sourceFamilyFromDomain(domain, q);
  else if (domain === "web" && query_shape === "current_or_version_sensitive" && /\b(price|pricing|status|outage|news|launch|announced)\b/.test(q)) source_family = "recent_news";

  const recency_need = classifyRecencyNeed(q, versionContext);

  return {
    query_shape,
    answer_shape,
    source_family,
    recency_need,
    ambiguity,
    confidence,
    decisionSource: "heuristic",
  };
}

export function applyQueryUnderstandingToConfig(config = {}, prediction = null) {
  if (!prediction) return config;
  const queryHints = [...(Array.isArray(config.queryHints) ? config.queryHints : [])];

  if (prediction.query_shape === "comparison" || prediction.answer_shape === "comparison_table") queryHints.push("comparison");
  if (prediction.query_shape === "howto" || prediction.query_shape === "troubleshooting") queryHints.push("official docs");
  if (prediction.source_family === "official_docs") queryHints.push("official docs");
  if (prediction.source_family === "academic") queryHints.push("site:arxiv.org");
  if (prediction.source_family === "primary_source") queryHints.push("official source");
  if (prediction.source_family === "government_or_legal") queryHints.push("official guidance");
  if (prediction.source_family === "product_or_ecommerce") queryHints.push("official product");
  if (prediction.recency_need === "required" || prediction.recency_need === "helpful") queryHints.push(String(new Date().getFullYear()));
  if (prediction.ambiguity === "high") queryHints.push("multiple interpretations");
  if (prediction.answer_shape === "citation_heavy") queryHints.push("references");

  return {
    ...config,
    preferRecent: config.preferRecent || prediction.recency_need !== "none",
    maxTurns: prediction.ambiguity === "high" ? Math.max(config.maxTurns || 1, 2) : config.maxTurns,
    maxQueries: ["comparison", "academic_review"].includes(prediction.query_shape) || prediction.answer_shape === "citation_heavy"
      ? Math.max(config.maxQueries || 2, 3)
      : config.maxQueries,
    queryHints: unique(queryHints),
  };
}

export function mergeQueryUnderstandingPrediction(query = "", predicted = null, options = {}) {
  const heuristic = classifyQueryUnderstandingHeuristically(query, options);
  if (!predicted) {
    return {
      heuristic,
      predicted: null,
      final: heuristic,
      confidence: heuristic.confidence,
      decisionSource: "heuristic",
      decisionReason: "heuristic",
      abstainedLabels: [...QUERY_UNDERSTANDING_FIELDS],
      plannerFeatures: applyQueryUnderstandingToConfig({}, heuristic),
    };
  }

  const final = {
    query_shape: predicted.query_shape || heuristic.query_shape,
    answer_shape: predicted.answer_shape || heuristic.answer_shape,
    source_family: predicted.source_family || heuristic.source_family,
    recency_need: predicted.recency_need || heuristic.recency_need,
    ambiguity: predicted.ambiguity || heuristic.ambiguity,
    confidence: Number.isFinite(predicted.confidence) ? predicted.confidence : heuristic.confidence,
    decisionSource: predicted.acceptedAny ? "heuristic" : "heuristic",
  };

  return {
    heuristic,
    predicted,
    final,
    confidence: final.confidence,
    decisionSource: predicted.acceptedAny ? "heuristic" : "heuristic",
    decisionReason: predicted.acceptedAny ? "heuristic_features" : "abstained_to_heuristic",
    abstainedLabels: Array.isArray(predicted.abstainedLabels) ? predicted.abstainedLabels : [],
    plannerFeatures: applyQueryUnderstandingToConfig({}, final),
  };
}

export function resolveQueryUnderstandingPlanning(baseConfig = {}, query = "", predicted = null, options = {}) {
  const decision = mergeQueryUnderstandingPrediction(query, predicted, options);
  return {
    decision,
    config: applyQueryUnderstandingToConfig(baseConfig, decision.final),
  };
}
