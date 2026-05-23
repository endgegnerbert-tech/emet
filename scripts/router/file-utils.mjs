import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export function writeJsonl(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}
