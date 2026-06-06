/**
 * PDF text extraction via pdfjs-dist (legacy build for Node.js).
 * Fallback path for academic, code, and deep research modes.
 */

let pdfjsPromise = null;

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").catch((err) => {
      console.error("emet: pdfjs-dist failed to load:", err.message);
      pdfjsPromise = null; // allow retry
      throw err;
    });
  }
  return pdfjsPromise;
}

/**
 * Extract full text from a PDF buffer.
 * Returns { text, pages, title } or null on failure.
 */
export async function extractPdfText(buffer) {
  try {
    const pdfjs = await loadPdfJs();
    const data = Buffer.isBuffer(buffer) ? buffer.slice(0) : buffer;
    const loadingTask = pdfjs.getDocument({ data, disableAutoFetch: true, disableStream: true });
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
