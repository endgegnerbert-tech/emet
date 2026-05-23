import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEvalCases(domain) {
  const dir = join(process.cwd(), "eval", "cases", domain);
  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b))
      .map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")));
  } catch {
    return [];
  }
}
