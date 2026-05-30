export const ROUTING_FAMILIES = ["web", "developer-docs", "academic", "regulated", "current-events", "commerce", "community", "local-government"];
export const ROUTING_OVERLAYS = ["security", "github", "forums", "package-registry", "changelog", "papers", "specs", "vendor-status", "legal", "medical", "finance", "trading", "cloud-docs", "ai-ml", "ecommerce", "quantum", "shopify", "standards", "news-current-events", "local-howto"];
export const SOURCE_POLICY_FLAGS = ["official-only", "primary-source-required", "recency-required", "version-sensitive"];
export const QUERY_UNDERSTANDING_SOURCE_FAMILIES = ["official_docs", "academic", "primary_source", "government_or_legal", "product_or_ecommerce", "recent_news", "community", "encyclopedia"];
export const ROUTING_RISK_MARKERS = new Set(["security", "medical", "legal", "finance", "trading", "standards", "official-only", "primary-source-required"]);

export function normalizeRoutingToken(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function uniqueRoutingTokens(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(normalizeRoutingToken).filter(Boolean))];
}

export function sourcePolicyFlagsFromOverlays(overlays = []) {
  return uniqueRoutingTokens(overlays).filter((overlay) => SOURCE_POLICY_FLAGS.includes(overlay));
}
