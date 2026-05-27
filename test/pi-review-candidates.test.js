import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { reviewRowWithPi } from "../scripts/router/pi-review-candidates.mjs";

test("reviewRowWithPi parses JSON returned by a pi-compatible binary", async () => {
  const dir = mkdtempSync(join(tmpdir(), "emet-pi-review-"));
  const shim = join(dir, "pi-shim");
  writeFileSync(shim, "#!/bin/sh\necho '{\"label\":\"security\",\"confidence\":0.93,\"rationale\":\"CVE query\",\"needs_human_review\":false}'\n");
  chmodSync(shim, 0o755);

  const review = await reviewRowWithPi(
    "domain",
    { query: "CVE-2024-3094", candidateLabel: "security", inputText: "CVE-2024-3094" },
    { piBin: shim, model: "ignored-model", thinking: "minimal", timeoutMs: 5000 },
  );

  assert.equal(review.label, "security");
  assert.equal(review.confidence, 0.93);
  assert.equal(review.needs_human_review, false);
});
