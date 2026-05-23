import test from "node:test";
import assert from "node:assert/strict";
import webResearchExtension from "../index.js";

function browserHarnessExtension(pi) {
  pi.registerTool({ name: "browser_action" });
}

test("browser-harness and emet register independent tools", () => {
  const tools = [];
  const pi = {
    on() {},
    registerTool(tool) {
      tools.push(tool);
    },
  };

  browserHarnessExtension(pi);
  webResearchExtension(pi);

  assert.equal(tools.some((tool) => tool.name === "browser_action"), true);
  assert.equal(tools.some((tool) => tool.name === "emet"), true);
});
