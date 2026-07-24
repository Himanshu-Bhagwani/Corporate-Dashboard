/**
 * pdfExtractor.js
 * Primary path: pdfjs-dist (legacy build) — gives REAL x/y coordinates for every
 * text span, which the row grouper and column detector depend on. Text
 * extraction does not need the `canvas` native module (only rendering does),
 * so the DOMMatrix/Path2D polyfill warnings in Node are harmless.
 *
 * Fallback path: pdf-parse with synthetic coordinates — only used if pdfjs
 * fails entirely (e.g. corrupted xref). Kept for resilience; quality is lower
 * because the flat text stream loses visual ordering.
 */

const pdfParse = require('pdf-parse');

/**
 * Extracts text items with real coordinates using pdfjs-dist.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Array<{text, x, y, height, page}>>}
 */
async function extractWithPdfjs(pdfBuffer) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const items = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    for (const it of textContent.items) {
      const text = (it.str || '').trim();
      if (!text) continue;
      items.push({
        text,
        x: it.transform[4],
        y: it.transform[5],
        height: it.height || Math.abs(it.transform[3]) || 10,
        page: pageNum,
      });
    }
    page.cleanup();
  }
  await doc.destroy();

  if (items.length === 0) {
    throw new Error('PDF_EXTRACTION_FAILED: No text content found in PDF');
  }
  return items;
}

/**
 * Legacy fallback: flat text from pdf-parse with synthesised coordinates.
 * NOTE: y is inverted (larger = earlier line) to match the row grouper's
 * descending-y sort, which assumes real PDF coordinates.
 */
async function extractWithPdfParse(pdfBuffer) {
  const data = await pdfParse(pdfBuffer);
  if (!data || !data.text || !data.text.trim()) {
    throw new Error('PDF_EXTRACTION_FAILED: No text content found in PDF');
  }

  const lines = data.text.split('\n');
  const items = [];
  const totalLines = lines.length;

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let xOffset = 0;
    const tokens = trimmed.split(/\s{2,}/);
    tokens.forEach((token) => {
      if (!token.trim()) return;
      items.push({
        text: token.trim(),
        // Invert Y so line order survives the grouper's descending sort.
        y: (totalLines - lineIndex) * 12,
        x: xOffset,
        height: 12,
        page: 1,
      });
      xOffset += token.length * 6;
    });
  });

  if (items.length === 0) {
    throw new Error('PDF_EXTRACTION_FAILED: No text content found in PDF');
  }
  return items;
}

/**
 * Extracts raw text items from a PDF buffer with coordinates.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Array>}
 */
async function extractTextWithCoords(pdfBuffer) {
  if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
    throw new Error('PDF_EXTRACTION_FAILED: Invalid or empty PDF buffer');
  }

  try {
    const items = await extractWithPdfjs(pdfBuffer);
    console.log(`[pdfExtractor] pdfjs-dist extracted ${items.length} positioned text items`);
    return items;
  } catch (pdfjsErr) {
    console.warn('[pdfExtractor] pdfjs-dist failed, falling back to pdf-parse:', pdfjsErr.message);
  }

  try {
    const items = await extractWithPdfParse(pdfBuffer);
    console.log(`[pdfExtractor] pdf-parse fallback extracted ${items.length} synthetic items`);
    return items;
  } catch (error) {
    if (error.message && error.message.includes('PDF_EXTRACTION_FAILED')) {
      throw error;
    }
    console.error('[pdfExtractor] Internal Error:', error);
    throw new Error('PDF_EXTRACTION_FAILED: ' + (error.message || 'Unknown pdf-parse error'));
  }
}

module.exports = { extractTextWithCoords };
