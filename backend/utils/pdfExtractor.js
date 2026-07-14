/**
 * pdfExtractor.js
 * Uses `pdf-parse` instead of `pdfjs-dist` so there is no dependency on the
 * `canvas` native module that is unavailable in Vercel's Lambda environment.
 */

const pdfParse = require('pdf-parse');

/**
 * Extracts raw text items from a PDF buffer.
 * Returns an array of synthetic "items" that are compatible with the
 * shape expected by the rest of the codebase (text, x, y, page, height).
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Array>}
 */
async function extractTextWithCoords(pdfBuffer) {
  if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
    throw new Error('PDF_EXTRACTION_FAILED: Invalid or empty PDF buffer');
  }

  try {
    const data = await pdfParse(pdfBuffer);

    if (!data || !data.text || !data.text.trim()) {
      throw new Error('PDF_EXTRACTION_FAILED: No text content found in PDF');
    }

    // Split the flat text into lines and convert to synthetic coord items.
    // pdf-parse doesn't give us real x/y, so we synthesise positions using
    // line number as the Y axis (sufficient for the bank-statement parser).
    const lines = data.text.split('\n');
    const items = [];

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Tokenise by whitespace so that wide-spaced columns work the same
      // way as they did with pdfjs, which returned individual word spans.
      let xOffset = 0;
      const tokens = trimmed.split(/\s{2,}/); // split on 2+ spaces (column gaps)
      tokens.forEach((token) => {
        if (!token.trim()) return;
        items.push({
          text: token.trim(),
          x: xOffset,
          y: lineIndex * 12, // synthetic Y: 12pt per line
          height: 12,
          page: lineIndex < data.numpages * 50 ? Math.floor(lineIndex / 50) + 1 : 1,
        });
        xOffset += token.length * 6; // synthetic X: ~6pt per char
      });
    });

    if (items.length === 0) {
      throw new Error('PDF_EXTRACTION_FAILED: No text content found in PDF');
    }

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
