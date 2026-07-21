// Server-side PDF text extraction using `unpdf` — a serverless/edge build of pdfjs
// that runs on Cloudflare Workers (no DOMMatrix/Path2D dependency).
// Returns per-page text so downstream chunks can carry accurate page numbers.

export interface PdfPage {
  page: number;
  text: string;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfPage[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const arr = Array.isArray(text) ? text : [text];
  return arr.map((t, i) => ({
    page: i + 1,
    text: (t ?? "").replace(/\s+/g, " ").trim(),
  }));
}

