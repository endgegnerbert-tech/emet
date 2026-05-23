export function resolveOutputFormat(input = {}, fallback = "markdown") {
  return input && typeof input === "object" && input.format ? input.format : fallback;
}

export function shouldRequireAuthoritativeSources(input = {}, fallback = false) {
  return Boolean(input && typeof input === "object" && input.requireAuthoritative) || Boolean(fallback);
}
