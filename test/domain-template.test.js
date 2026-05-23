import test from "node:test";
import assert from "node:assert/strict";
import templatePack from "../lib/domains/template.js";

test("template domain pack exposes the starter interface", () => {
  assert.equal(templatePack.name, "template");
  assert.ok(Array.isArray(templatePack.sourceHints));
  assert.ok(typeof templatePack.run === "function");
});
