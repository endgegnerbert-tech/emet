import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

export function appendJsonl(path, row) {
  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(path, `${prefix}${JSON.stringify(row)}\n`, { flag: "a" });
}

export function stableReviewId(parts = []) {
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex");
}

export function stripAnsi(text = "") {
  return String(text).replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

export function extractJsonObject(text = "") {
  const clean = stripAnsi(text).trim();
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last > first) return clean.slice(first, last + 1);
  return clean;
}

export function runPiReview(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      "--no-tools",
      "--no-context-files",
      "--no-skills",
      "--no-session",
      ...(options.noExtensions ? ["--no-extensions"] : []),
      ...(options.noPromptTemplates ? ["--no-prompt-templates"] : []),
      ...(options.noThemes ? ["--no-themes"] : []),
      "--model", options.model,
      ...(options.thinking ? ["--thinking", options.thinking] : []),
      "-p",
      prompt,
    ];

    const child = spawn(options.piBin || "pi", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = Number(options.timeoutMs || 0);
    const timer = timeoutMs > 0 ? setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`pi review timed out after ${timeoutMs}ms`));
    }, timeoutMs) : null;
    timer?.unref?.();

    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`pi exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

export async function withRetry(fn, maxRetries = 5) {
  for (let index = 0; index < maxRetries; index += 1) {
    try {
      return await fn();
    } catch (error) {
      if (index === maxRetries - 1) throw error;
      const message = error?.message || String(error);
      const isRateLimit = message.includes("429") || message.includes("usage_limit_reached") || message.includes("Quota");
      const delay = isRateLimit ? (2 ** index * 2000 + Math.random() * 2000) : (2 ** index * 1000 + Math.random() * 500);
      console.warn(`[Retry ${index + 1}/${maxRetries}] Failed: ${message.split("\n")[0]}. Waiting ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return null;
}

export async function processQueue(items, concurrency, processor) {
  let index = 0;
  let done = 0;
  const workers = Array(concurrency).fill(null).map(async () => {
    while (index < items.length) {
      const item = items[index++];
      await processor(item);
      done += 1;
      if (done % 10 === 0) console.log(`Progress: ${done} / ${items.length}`);
    }
  });
  await Promise.all(workers);
}
