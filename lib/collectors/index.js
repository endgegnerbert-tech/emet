import { HNCollector } from "./hn.js";
import { V2exCollector } from "./v2ex.js";
import { GitHubCollector } from "./github-collector.js";
import { RSSCollector } from "./rss.js";
import { YouTubeCollector } from "./youtube.js";
import { RedditCollector } from "./reddit.js";

// ponytail: Map-based lazy registry, no DI container, no factory pattern
let _registry = null;

function buildRegistry() {
  if (_registry) return _registry;
  _registry = new Map([
    ["hn", new HNCollector()],
    ["v2ex", new V2exCollector()],
    ["github", new GitHubCollector()],
    ["reddit", new RedditCollector()],
    ["rss", new RSSCollector()],
    ["youtube", new YouTubeCollector()],
  ]);
  return _registry;
}

export function getCollector(name) {
  return buildRegistry().get(String(name || "").trim().toLowerCase()) ?? null;
}

export function listCollectors() {
  return [...buildRegistry().entries()].map(([name, c]) => ({
    name,
    label: c.label,
    ...c.checkAvailability(),
  }));
}

// ponytail: YouTube is optional — doctor warns, doesn't fail
export function runCollectorDoctor() {
  const checks = listCollectors().map((c) => ({
    name: `collector:${c.name}`,
    ok: c.available,
    note: c.available ? c.label : `${c.label}: ${c.reason || "unavailable"}`,
    fix: c.installHint || "",
  }));
  return {
    ok: checks.every((c) => c.ok || c.name === "collector:youtube"),
    checks,
  };
}
