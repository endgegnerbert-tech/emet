import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractConflictStructuredFeaturesFromPages,
  extractSufficiencyStructuredFeaturesFromPages,
} from "./router-structured-features.js";
import { QUERY_UNDERSTANDING_FIELDS } from "./query-understanding.js";
import {
  ROUTING_RISK_MARKERS,
  sourcePolicyFlagsFromOverlays,
} from "./router-policy-context.js";
import {
  GUARDED_ROUTER_DOMAINS,
  buildResearchGuardrails,
  guardrailVetoesDomainDowngrade,
} from "./research-guardrails.js";

const MIN_DEFAULT_DOMAIN_THRESHOLD = 0.35;
const MIN_HIGH_RISK_DOMAIN_THRESHOLD = 0.55;
const SUFFICIENCY_VETO_DECISIONS = new Set([
  "need_authority",
  "need_more_sources",
  "need_primary_source",
  "need_recency",
  "need_version_context",
  "need_conflict_resolution",
]);
const CONFLICT_ESCALATION_DECISIONS = new Set(["needs_review", "open_conflict"]);

let daemonProcess = null;
let isReady = false;
let messageQueue = [];
let pendingRequests = new Map();
let requestIdCounter = 1;
const domainCalibrationCache = new Map();
const domainModelClassesCache = new Map();

function envFlag(env, name, defaultValue = false) {
  const value = env[name];
  if (value === undefined) return defaultValue;
  return value === "1" || value === "true";
}

function modelExists(modelDir, name) {
  return existsSync(join(modelDir, name, "model.joblib"));
}

export function resolveTinyRouterConfig(env = process.env) {
  const enabled = envFlag(env, "EMET_TINY_ROUTER");
  const modelDir = env.EMET_TINY_ROUTER_MODEL || join(dirname(fileURLToPath(import.meta.url)), "..", "ml", "models");
  const pythonPath = env.EMET_TINY_ROUTER_PYTHON || join(process.cwd(), ".venv-router", "bin", "python");
  const daemonAvailable = enabled && existsSync(pythonPath);

  return {
    enabled: daemonAvailable,
    modelDir,
    pythonPath,
    timeoutMs: Number(env.EMET_TINY_ROUTER_TIMEOUT_MS || 50),
    tasks: {
      domain: daemonAvailable && envFlag(env, "EMET_TINY_ROUTER_DOMAIN", true) && modelExists(modelDir, "domain"),
      preflight: daemonAvailable && envFlag(env, "EMET_TINY_ROUTER_PREFLIGHT") && modelExists(modelDir, "preflight"),
      followup: daemonAvailable && envFlag(env, "EMET_TINY_ROUTER_FOLLOWUP") && modelExists(modelDir, "followup"),
      conflict: daemonAvailable && envFlag(env, "EMET_TINY_ROUTER_CONFLICT") && modelExists(modelDir, "conflict-structured"),
      sufficiency: daemonAvailable && envFlag(env, "EMET_TINY_ROUTER_SUFFICIENCY") && modelExists(modelDir, "sufficiency-structured"),
      sourceAuthority: daemonAvailable && envFlag(env, "EMET_TINY_ROUTER_SOURCE_AUTHORITY") && modelExists(modelDir, "source_authority-structured"),
      pageQuality: daemonAvailable && envFlag(env, "EMET_TINY_ROUTER_PAGE_QUALITY") && modelExists(modelDir, "page_quality-structured"),
      queryUnderstanding: daemonAvailable && envFlag(env, "EMET_TINY_ROUTER_QUERY_UNDERSTANDING") && modelExists(modelDir, "query-understanding"),
    },
  };
}

function startDaemon(config) {
  if (daemonProcess) return;

  const daemonScript = join(dirname(fileURLToPath(import.meta.url)), "..", "ml", "router", "daemon.py");
  daemonProcess = spawn(config.pythonPath, [daemonScript, config.modelDir], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";

  daemonProcess.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim() === "READY") {
        isReady = true;
        for (const msg of messageQueue) {
          msg.startInferenceTimer();
          daemonProcess.stdin.write(`${msg.payload}\n`);
        }
        messageQueue = [];
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        const pending = pendingRequests.get(parsed.id);
        if (pending) {
          pendingRequests.delete(parsed.id);
          pending.resolve(parsed);
        }
      } catch {
        // ignore malformed JSON
      }
    }
  });

  daemonProcess.stderr.on("data", () => {
    // ignore stderr warnings for now
  });

  const currentProcess = daemonProcess;

  daemonProcess.on("exit", () => {
    if (daemonProcess === currentProcess) {
      daemonProcess = null;
      isReady = false;
      for (const { resolve } of pendingRequests.values()) {
        resolve({ error: "Daemon exited" });
      }
      pendingRequests.clear();
    }
  });
}

export function stopTinyRouterDaemon() {
  if (daemonProcess) {
    daemonProcess.kill();
    daemonProcess = null;
  }
  isReady = false;
  messageQueue = [];
  for (const { resolve } of pendingRequests.values()) {
    resolve({ error: "Daemon stopped manually" });
  }
  pendingRequests.clear();
}

function requestTinyRouter(config, taskPayload, signal, finalize) {
  startDaemon(config);

  const id = requestIdCounter++;
  const payload = JSON.stringify({ id, ...taskPayload });

  return new Promise((resolve) => {
    let settled = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
      pendingRequests.delete(id);
      resolve(finalize(result));
    };

    const abort = () => finish(null);

    pendingRequests.set(id, { resolve: finish });

    const startInferenceTimer = () => {
      timer = setTimeout(abort, config.timeoutMs);
      timer.unref?.();
    };

    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener?.("abort", abort, { once: true });
      if (isReady) {
        startInferenceTimer();
        daemonProcess.stdin.write(`${payload}\n`);
      } else {
        messageQueue.push({ payload, startInferenceTimer });
      }
    }
  });
}

function loadDomainModelClasses(modelDir) {
  if (domainModelClassesCache.has(modelDir)) return domainModelClassesCache.get(modelDir);

  let classes = null;
  for (const path of [join(modelDir, "domain", "metrics.json"), join(modelDir, "domain", "meta.json")]) {
    try {
      if (!existsSync(path)) continue;
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(parsed.classes) && parsed.classes.length) {
        classes = new Set(parsed.classes.map((value) => String(value)));
        break;
      }
    } catch {
      // ignore unreadable metadata
    }
  }

  domainModelClassesCache.set(modelDir, classes);
  return classes;
}

export function resolveTinyRouterSupportedDomains(modelDir) {
  return loadDomainModelClasses(modelDir);
}

export function chooseTinyRouterDomain(heuristicDomain, tinyDomain, options = {}) {
  if (!tinyDomain) return heuristicDomain;
  const supportedDomains = options.supportedDomains || (options.modelDir ? loadDomainModelClasses(options.modelDir) : null);
  if (supportedDomains && heuristicDomain && !supportedDomains.has(heuristicDomain)) return heuristicDomain;
  if (guardrailVetoesDomainDowngrade(heuristicDomain, tinyDomain, options.guardrails)) return heuristicDomain;
  return tinyDomain;
}

function loadDomainCalibration(modelDir) {
  if (domainCalibrationCache.has(modelDir)) return domainCalibrationCache.get(modelDir);
  const path = join(modelDir, "domain", "calibration.json");
  let calibration = {
    defaultThreshold: 0.80,
    highRiskThreshold: 0.75,
    domainThresholds: {},
  };

  try {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      calibration = {
        defaultThreshold: Number(parsed.defaultThreshold || 0.80),
        highRiskThreshold: Number(parsed.highRiskThreshold || 0.75),
        domainThresholds: parsed.domainThresholds && typeof parsed.domainThresholds === "object" ? parsed.domainThresholds : {},
      };
    }
  } catch {
    // keep safe defaults
  }

  domainCalibrationCache.set(modelDir, calibration);
  return calibration;
}

export function resolveTinyRouterDomainThreshold(domain, calibration = {}) {
  const floor = GUARDED_ROUTER_DOMAINS.has(domain) ? MIN_HIGH_RISK_DOMAIN_THRESHOLD : MIN_DEFAULT_DOMAIN_THRESHOLD;
  if (domain && calibration.domainThresholds && Number.isFinite(Number(calibration.domainThresholds[domain]))) {
    return Math.max(Number(calibration.domainThresholds[domain]), floor);
  }
  if (GUARDED_ROUTER_DOMAINS.has(domain)) return Math.max(Number(calibration.highRiskThreshold || 0.75), floor);
  return Math.max(Number(calibration.defaultThreshold || 0.80), floor);
}

export function acceptTinyRouterDomainPrediction(result, calibration = {}) {
  if (!result || result.error || !result.domain) return null;
  return result.confidence >= resolveTinyRouterDomainThreshold(result.domain, calibration) ? result.domain : null;
}

export async function classifyDomainWithTinyRouter(query, mode = "fast", signal, env = process.env) {
  const config = resolveTinyRouterConfig(env);
  if (!config.tasks.domain) return null;
  const calibration = loadDomainCalibration(config.modelDir);

  return requestTinyRouter(
    config,
    { task: "domain", query, mode },
    signal,
    (result) => acceptTinyRouterDomainPrediction(result, calibration),
  );
}

export function classifyFollowupWithStrongRules(query, mode = "fast", conflict = "none", sources = {}) {
  const text = String(query || "").toLowerCase();
  const sourceCount = Number(sources.source_count || 0);
  const hasAuthority = Boolean(sources.has_authority);
  const hasRecent = Boolean(sources.has_recent);
  const isRecencyQuery = /\b(latest|current|today|release|changelog|new)\b/.test(text);

  if (conflict === "severe") return "need_conflict_resolution";
  if (conflict === "minor" && !(mode === "fast" && hasAuthority && sourceCount >= 4)) return "need_conflict_resolution";
  if (isRecencyQuery && !hasRecent) return "need_recency";

  const hasVersionMatch = Boolean(sources.has_version_match);
  const hasChangelog = Boolean(sources.has_changelog);
  const hasMigration = Boolean(sources.has_migration);
  const isVersionQuery = /\b(version|migration|upgrade|v\d+)\b/.test(text);

  if (isVersionQuery && !(hasVersionMatch || hasChangelog || hasMigration)) return "need_version_context";

  if (!hasAuthority && sourceCount === 0) return "need_more_sources";
  return null;
}

export function applyConflictTinyRouterDecision(heuristicConflictDetected, structuredDecision, options = {}) {
  const allowClear = options.allowClear === true;

  if (structuredDecision === "open_conflict" || structuredDecision === "needs_review") return true;
  if (heuristicConflictDetected && !allowClear) return true;
  if (heuristicConflictDetected && ["resolved_by_authority", "resolved_by_recency", "no_conflict"].includes(structuredDecision)) {
    return false;
  }
  return Boolean(heuristicConflictDetected);
}

export function applySufficiencyTinyRouterDecision(currentSufficient, structuredDecision) {
  if (!currentSufficient) return false;
  if (SUFFICIENCY_VETO_DECISIONS.has(structuredDecision)) return false;
  return true;
}

function arrayFromMaybe(value) {
  return Array.isArray(value) ? value : [];
}

function evidenceRoutingContext(pages = []) {
  const first = Array.isArray(pages) ? pages.find(Boolean) || {} : {};
  const overlays = new Set(arrayFromMaybe(first.overlays));
  const sourcePolicyFlags = new Set([
    ...arrayFromMaybe(first.source_policy_flags),
    ...arrayFromMaybe(first.sourcePolicyFlags),
  ]);
  for (const flag of sourcePolicyFlagsFromOverlays([...overlays])) sourcePolicyFlags.add(flag);
  return {
    family: first.domain_family || first.domainFamily || "web",
    overlays,
    sourcePolicyFlags,
  };
}

export function isHighRiskEvidenceContext(query = "", pages = []) {
  const guardrails = buildResearchGuardrails(query);
  const context = evidenceRoutingContext(pages);
  return Boolean(
    guardrails.highRisk
      || context.family === "regulated"
      || [...context.overlays].some((overlay) => ROUTING_RISK_MARKERS.has(overlay))
      || [...context.sourcePolicyFlags].some((flag) => ROUTING_RISK_MARKERS.has(flag)),
  );
}

export function resolveSufficiencyDecisionThreshold(decision = "", query = "", pages = []) {
  const highRisk = isHighRiskEvidenceContext(query, pages);
  if (SUFFICIENCY_VETO_DECISIONS.has(decision)) return highRisk ? 0.65 : 0.55;
  return highRisk ? 0.90 : 0.75;
}

export function resolveConflictDecisionThreshold(decision = "", query = "", pages = []) {
  const highRisk = isHighRiskEvidenceContext(query, pages);
  if (CONFLICT_ESCALATION_DECISIONS.has(decision)) return highRisk ? 0.60 : 0.55;
  return highRisk ? 0.85 : 0.60;
}

export function resolveFollowupDecisionThreshold(action = "", query = "", sources = {}) {
  const highRisk = buildResearchGuardrails(query).highRisk
    || sources.domain_family === "regulated"
    || arrayFromMaybe(sources.overlays).some((overlay) => ROUTING_RISK_MARKERS.has(overlay))
    || arrayFromMaybe(sources.source_policy_flags).some((flag) => ROUTING_RISK_MARKERS.has(flag));
  if (action === "stop") return highRisk ? 0.90 : 0.75;
  return highRisk ? 0.65 : 0.60;
}

export function classifyFollowupHeuristically(query, mode = "fast", conflict = "none", sources = {}) {
  const text = String(query || "").toLowerCase();
  const sourceCount = Number(sources.source_count || 0);
  const hasAuthority = Boolean(sources.has_authority);
  const isAcademicQuery = /\b(paper|papers|arxiv|doi|publisher|survey|review|research)\b/.test(text);

  const strongRule = classifyFollowupWithStrongRules(query, mode, conflict, sources);
  if (strongRule) return strongRule;

  if (mode === "academic" || isAcademicQuery) {
    if (isAcademicQuery) return "need_primary_source";
    if (!hasAuthority) return "need_authority";
    if (sourceCount < 4) return "need_more_sources";
    return "stop";
  }

  if (mode === "deep") {
    if (!hasAuthority) return "need_authority";
    if (sourceCount <= 1) return "need_more_sources";
    if (sourceCount < 3) return "need_more_sources";
    return "stop";
  }

  if (mode === "fast" || mode === "code") {
    if (hasAuthority && sourceCount >= 1) return "stop";
    if (sourceCount >= 3) return "stop";
    return null;
  }

  if (!hasAuthority) return "need_authority";
  if (sourceCount === 0) return "need_more_sources";
  return "stop";
}

export async function classifyFollowupWithTinyRouter(query, mode, conflict, sources, signal, env = process.env) {
  if (!envFlag(env, "EMET_TINY_ROUTER_FOLLOWUP")) return null;

  const strongRule = classifyFollowupWithStrongRules(query, mode, conflict, sources);
  if (strongRule) return strongRule;

  const config = resolveTinyRouterConfig(env);
  if (!config.tasks.followup) return classifyFollowupHeuristically(query, mode, conflict, sources);

  return requestTinyRouter(
    config,
    { task: "followup", query, mode, conflict, sources },
    signal,
    (result) => (result && !result.error && result.action && result.confidence >= resolveFollowupDecisionThreshold(result.action, query, sources)
      ? result.action
      : classifyFollowupHeuristically(query, mode, conflict, sources)),
  );
}

export async function classifyConflictWithTinyRouter(query, pages = [], signal, env = process.env) {
  const config = resolveTinyRouterConfig(env);
  if (!config.tasks.conflict) return null;

  const features = extractConflictStructuredFeaturesFromPages(query, pages);
  return requestTinyRouter(
    config,
    { task: "conflict", features },
    signal,
    (result) => (result && !result.error && result.decision && result.confidence >= resolveConflictDecisionThreshold(result.decision, query, pages) ? result.decision : null),
  );
}

export async function classifySufficiencyWithTinyRouter(query, pages = [], signal, env = process.env) {
  const config = resolveTinyRouterConfig(env);
  if (!config.tasks.sufficiency) return null;

  const features = extractSufficiencyStructuredFeaturesFromPages(query, pages);
  return requestTinyRouter(
    config,
    { task: "sufficiency", features },
    signal,
    (result) => (result && !result.error && result.decision && result.confidence >= resolveSufficiencyDecisionThreshold(result.decision, query, pages) ? result.decision : null),
  );
}

export async function classifySourceAuthorityWithTinyRouter(query, source, domainFamily, signal, env = process.env) {
  const config = resolveTinyRouterConfig(env);
  if (!config.tasks.sourceAuthority) return null;

  const { extractSourceAuthorityFeatures } = await import("./router-structured-features.js");
  const features = extractSourceAuthorityFeatures(query, source, domainFamily);
  return requestTinyRouter(
    config,
    { task: "source_authority", features },
    signal,
    (result) => (result && !result.error && result.decision ? { label: result.decision, confidence: result.confidence } : null),
  );
}

export async function classifyPageQualityWithTinyRouter(query, page, signal, env = process.env) {
  const config = resolveTinyRouterConfig(env);
  if (!config.tasks.pageQuality) return null;

  const { extractPageQualityFeatures } = await import("./router-structured-features.js");
  const features = extractPageQualityFeatures(query, page);
  return requestTinyRouter(
    config,
    { task: "page_quality", features },
    signal,
    (result) => (result && !result.error && result.decision ? { label: result.decision, confidence: result.confidence } : null),
  );
}

function finalizeQueryUnderstandingResult(result) {
  if (!result || result.error) return null;
  const accepted = Object.fromEntries(QUERY_UNDERSTANDING_FIELDS.map((field) => [field, result[field] || null]));
  const acceptedAny = QUERY_UNDERSTANDING_FIELDS.some((field) => Boolean(accepted[field]));
  const confidences = result.confidences && typeof result.confidences === "object"
    ? Object.fromEntries(QUERY_UNDERSTANDING_FIELDS.map((field) => [field, result.confidences[field]]).filter(([, value]) => value !== undefined))
    : {};
  const predictedLabels = result.predictedLabels && typeof result.predictedLabels === "object"
    ? Object.fromEntries(QUERY_UNDERSTANDING_FIELDS.map((field) => [field, result.predictedLabels[field]]).filter(([, value]) => value !== undefined))
    : {};
  const abstainedLabels = Array.isArray(result.abstainedLabels)
    ? result.abstainedLabels.filter((field) => QUERY_UNDERSTANDING_FIELDS.includes(field))
    : QUERY_UNDERSTANDING_FIELDS.filter((field) => !accepted[field]);
  return {
    ...accepted,
    acceptedAny,
    abstainedLabels,
    confidence: Number(result.confidence || 0),
    confidences,
    predictedLabels,
  };
}

export async function classifyPreflightWithTinyRouter(query, mode = "fast", signal, env = process.env) {
  const config = resolveTinyRouterConfig(env);
  if (!config.tasks.preflight) return null;

  return requestTinyRouter(
    config,
    { task: "preflight", query, mode },
    signal,
    (result) => {
      const queryUnderstanding = finalizeQueryUnderstandingResult(result);
      if (!queryUnderstanding) return null;
      const domainResult = {
        domain: result.domain,
        confidence: Number(result.confidences?.domain ?? result.confidence ?? 0),
      };
      return {
        domain: acceptTinyRouterDomainPrediction(domainResult, loadDomainCalibration(config.modelDir)),
        queryUnderstanding,
        confidence: Number(result.confidence || 0),
        confidences: result.confidences && typeof result.confidences === "object" ? result.confidences : {},
        predictedLabels: result.predictedLabels && typeof result.predictedLabels === "object" ? result.predictedLabels : {},
        abstainedLabels: Array.isArray(result.abstainedLabels) ? result.abstainedLabels : [],
      };
    },
  );
}

export async function classifyQueryUnderstandingWithTinyRouter(query, mode = "fast", signal, env = process.env) {
  const config = resolveTinyRouterConfig(env);
  if (!config.tasks.queryUnderstanding) return null;

  return requestTinyRouter(
    config,
    { task: "query_understanding", query, mode },
    signal,
    finalizeQueryUnderstandingResult,
  );
}
