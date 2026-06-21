/**
 * PDF text extraction via pdfjs-dist (legacy build for Node.js).
 * Fallback path for academic, code, and deep research modes.
 */

import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

let pdfjsPromise = null;
let canvasSupportPromise = null;
let warnedMissingCanvas = false;

async function ensurePdfRuntimeSupport() {
  if (typeof process === "undefined" || !process.versions?.node) {
    return true;
  }
  if (globalThis.DOMMatrix && globalThis.ImageData) {
    return true;
  }
  if (!canvasSupportPromise) {
    canvasSupportPromise = import("@napi-rs/canvas")
      .then((mod) => mod?.default || mod)
      .then((canvas) => {
        if (!globalThis.DOMMatrix && canvas?.DOMMatrix) globalThis.DOMMatrix = canvas.DOMMatrix;
        if (!globalThis.ImageData && canvas?.ImageData) globalThis.ImageData = canvas.ImageData;
        if (!globalThis.Path2D && canvas?.Path2D) globalThis.Path2D = canvas.Path2D;
        return Boolean(globalThis.DOMMatrix && globalThis.ImageData);
      })
      .catch(() => false);
  }

  const supported = await canvasSupportPromise;
  if (!supported && !warnedMissingCanvas) {
    warnedMissingCanvas = true;
    console.warn("emet: PDF extraction unavailable: @napi-rs/canvas is missing; skipping PDF text extraction.");
  }
  return supported;
}

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").catch((err) => {
      console.error("emet: pdfjs-dist failed to load:", err.message);
      pdfjsPromise = null; // allow retry
      throw err;
    });
  }
  return pdfjsPromise;
}

/** @returns {import("pdfjs-dist/types/src/display/api").DocumentInitParameters | {data, disableAutoFetch, disableStream}} */
function buildPdfDocumentOptions(data) {
  try {
    const pkgPath = dirname(_require.resolve("pdfjs-dist/package.json"));
    return {
      data,
      disableAutoFetch: true,
      disableStream: true,
      standardFontDataUrl: `file://${resolve(pkgPath, "standard_fonts")}/`,
      cMapUrl: `file://${resolve(pkgPath, "cmaps")}/`,
      useWorkerFetch: false,
    };
  } catch {
    // Fallback: no font/cmap dirs resolved
    return { data, disableAutoFetch: true, disableStream: true };
  }
}

/**
 * Extract full text from a PDF buffer.
 * Returns { text, pages, title } or null on failure.
 */
export async function extractPdfText(buffer) {
  try {
    const supported = await ensurePdfRuntimeSupport();
    if (!supported) return null;

    const pdfjs = await loadPdfJs();
    const data = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : buffer;
    const loadingTask = pdfjs.getDocument(buildPdfDocumentOptions(data));
    const doc = await loadingTask.promise;

    const metadata = await doc.getMetadata().catch(() => ({}));
    const title = metadata?.info?.Title || null;

    const pages = [];
    let fullText = "";

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => item.str || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      pages.push(pageText);
      fullText += (fullText ? "\n\n" : "") + pageText;
    }

    await loadingTask.destroy().catch(() => {});

    return {
      text: fullText,
      pages,
      title,
      pageCount: doc.numPages,
    };
  } catch (err) {
    console.error("emet: PDF extraction failed:", err.message);
    return null;
  }
}

/**
 * Check if a URL looks like a PDF (by extension or content-type).
 */
export function isPdfUrl(url, contentType = "") {
  if (contentType && contentType.includes("pdf")) return true;
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith(".pdf") || path.includes(".pdf?");
  } catch {
    return String(url || "").toLowerCase().endsWith(".pdf");
  }
}

export default { extractPdfText, isPdfUrl };
