#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { classifyQuestionDomain } from "../../../lib/research-intent.js";

function calculateMetrics(y_true, y_pred, classes) {
  const metrics = {};
  let totalF1 = 0;

  for (const cls of classes) {
    let tp = 0, fp = 0, fn = 0;
    for (let i = 0; i < y_true.length; i++) {
      if (y_true[i] === cls && y_pred[i] === cls) tp++;
      else if (y_pred[i] === cls) fp++;
      else if (y_true[i] === cls) fn++;
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    metrics[cls] = { precision, recall, f1, support: tp + fn };
    totalF1 += f1;
  }

  const macroF1 = totalF1 / classes.length;

  let accuracy = 0;
  for (let i = 0; i < y_true.length; i++) {
    if (y_true[i] === y_pred[i]) accuracy++;
  }
  accuracy /= y_true.length;

  return { macroF1, accuracy, classes: metrics };
}

function main() {
  const goldPath = "data/router/gold-domain.jsonl";
  const outPath = "metrics/router/domain-baseline.json";

  const lines = readFileSync(goldPath, "utf8").split("\n").filter(Boolean);
  const examples = lines.map(line => JSON.parse(line));

  const y_true = [];
  const y_pred = [];

  let highRiskDowngrades = 0;
  const highRiskClasses = new Set(["security", "papers", "specs", "changelog", "medical", "legal", "finance", "trading", "standards"]);

  for (const ex of examples) {
    y_true.push(ex.label);
    const pred = classifyQuestionDomain(ex.query);
    y_pred.push(pred);

    if (highRiskClasses.has(ex.label) && pred === "web") {
      highRiskDowngrades++;
    }
  }

  const uniqueClasses = [...new Set(y_true)];
  const metrics = calculateMetrics(y_true, y_pred, uniqueClasses);

  const report = {
    task: "domain",
    eval_set_size: examples.length,
    macro_f1: metrics.macroF1,
    accuracy: metrics.accuracy,
    high_risk_downgrades: highRiskDowngrades,
    classes: metrics.classes
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

  console.log(`Heuristic Macro-F1: ${metrics.macroF1.toFixed(4)}`);
  console.log(`High-risk downgrades to web: ${highRiskDowngrades}`);
}

main();
