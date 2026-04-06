const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// Set worker for Node.js environment
pdfjs.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.js');

/**
 * Extracts raw text items with their spatial coordinates from a PDF buffer.
 * @param {Buffer} pdfBuffer - The PDF file buffer.
 * @returns {Promise<Array>} - Array of items: { text, x, y, page, height }
 */
async function extractTextWithCoords(pdfBuffer) {
  if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
    throw new Error('PDF_EXTRACTION_FAILED: Invalid or empty PDF buffer');
  }

  try {
    const data = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjs.getDocument({
      data,
      disableFontFace: true,
      verbosity: 0
    });
    
    const pdf = await loadingTask.promise;
    if (!pdf || pdf.numPages === 0) {
      throw new Error('PDF_EXTRACTION_FAILED: PDF has no pages or is unreadable');
    }

    const items = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      if (textContent && Array.isArray(textContent.items)) {
        textContent.items.forEach(item => {
          if (item && item.str && item.str.trim() && item.transform) {
            items.push({
              text: item.str,
              x: item.transform[4],
              y: item.transform[5],
              height: item.transform[3], // scaleY
              page: i
            });
          }
        });
      }
    }

    if (items.length === 0) {
      throw new Error('PDF_EXTRACTION_FAILED: No text content found in PDF');
    }

    return items;
  } catch (error) {
    // Preserve our custom error codes, otherwise wrap generic ones
    if (error.message && error.message.includes('PDF_EXTRACTION_FAILED')) {
      throw error;
    }
    console.error('[pdfExtractor] Internal Error:', error);
    throw new Error('PDF_EXTRACTION_FAILED: ' + (error.message || 'Unknown PDFJS error'));
  }
}

module.exports = { extractTextWithCoords };
