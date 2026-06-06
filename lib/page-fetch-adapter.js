import { WEAK_PAGE_POLICY } from "./research-policy.js";

export const BLOCKED_PATTERNS = [
  /cloudflare/i,
  /turnstile/i,
  /captcha/i,
  /please enable cookies/i,
  /bot detection/i,
  /verify you are human/i,
  /security check/i,
  /access denied/i,
  /temporarily unavailable/i,
  /attention required/i,
  /challenge-platform/i,
];
export const DYNAMIC_PATTERNS = [
  /__next_data__/i,
  /__nuxt__/i,
  /data-reactroot/i,
  /hydrat/i,
  /window\.__INITIAL_STATE__/i,
  /id=["']app["']/i,
  /id=["']root["']/i,
];

export function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function assessPageAttempt({ status = 200, body = "", contentType = "", url = "" } = {}) {
  const text = String(body || "");
  const plain = stripHtml(text);
  const lower = `${text}\n${url}`.toLowerCase();
  const antiBotSignal = BLOCKED_PATTERNS.some((pattern) => pattern.test(lower));
  const negativeSignals = [];

  if (plain.length < WEAK_PAGE_POLICY.weakTextLimit) negativeSignals.push("weak_text");
  else if (plain.length < WEAK_PAGE_POLICY.thinTextLimit) negativeSignals.push("thin_text");
  if (antiBotSignal) negativeSignals.push("placeholder");
  if (!/text\/(html|plain)/i.test(contentType) && plain.length < 500) negativeSignals.push("unsupported_content_type");

  const blocked = status === 403
    || status === 429
    || (antiBotSignal && plain.length < WEAK_PAGE_POLICY.blockedTextLimit);
  const dynamic = !blocked && (DYNAMIC_PATTERNS.some((pattern) => pattern.test(lower)) || (text.includes("<script") && plain.length < WEAK_PAGE_POLICY.weakTextLimit));
  const weak = blocked || negativeSignals.includes("weak_text") || negativeSignals.length >= WEAK_PAGE_POLICY.minNegativeSignals;

  return {
    blocked,
    dynamic,
    weak,
    mode: blocked ? "stealthy" : dynamic ? "dynamic" : "async",
    plainLength: plain.length,
    negativeSignals,
  };
}

export function chooseScraplingMode(input) {
  return assessPageAttempt(input).mode;
}

export const pageFetchAdapter = {
  assessPageAttempt,
  chooseScraplingMode,
};
