#!/usr/bin/env node
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 8787);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function resolvePath(urlPath) {
  if (urlPath === "/" || urlPath === "/annotator") {
    return path.join(root, "docs", "assets", "router-annotator", "index.html");
  }
  return path.join(root, urlPath.replace(/^\//, ""));
}

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${port}`}`);
    const filePath = resolvePath(url.pathname);

    if (!filePath.startsWith(root) || !existsSync(filePath)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const body = readFileSync(filePath);
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(String(error?.message || error));
  }
});

server.listen(port, () => {
  console.log(`Router annotator running at http://localhost:${port}/annotator`);
});
