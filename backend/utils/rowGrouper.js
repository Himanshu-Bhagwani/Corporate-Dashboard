/**
 * Groups raw text items into logical rows based on spatial proximity.
 * @param {Array} items - Array of text items with x, y, and page.
 * @returns {Array} - Array of rows, where each row is an array of strings.
 */
function groupIntoRows(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('ROW_DETECTION_FAILED: No text items provided for grouping');
  }

  try {
    const rows = [];
    // Sort by page first, then by Y coordinate (descending), then by X coordinate (ascending)
    const sortedItems = [...items].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (Math.abs(a.y - b.y) > 5) return b.y - a.y; // 5 units tolerance
      return a.x - b.x;
    });

    let currentRow = [];
    let lastY = -1;
    let lastPage = -1;

    sortedItems.forEach(item => {
      if (!item) return;

      const isNewPage = lastPage !== -1 && item.page !== lastPage;
      const isNewRow = lastY !== -1 && Math.abs(item.y - lastY) > 5;

      if (isNewPage || isNewRow) {
        if (currentRow.length > 0) rows.push(currentRow);
        currentRow = [];
      }

      currentRow.push(item.text || '');
      lastY = item.y;
      lastPage = item.page;
    });

    if (currentRow.length > 0) rows.push(currentRow);

    if (rows.length === 0) {
      throw new Error('ROW_DETECTION_FAILED: Could not reconstruct any rows from PDF text');
    }

    return rows;
  } catch (error) {
    if (error.message.startsWith('ROW_DETECTION_FAILED')) throw error;
    console.error('[rowGrouper] Internal Error:', error);
    throw new Error('ROW_DETECTION_FAILED: ' + (error.message || 'Unknown grouping error'));
  }
}

/**
 * Groups raw text items into logical rows, preserving x-coordinates for column detection.
 * Each cell in a row is { text, x } instead of just a string.
 * @param {Array} items - Array of text items with x, y, page, and height.
 * @returns {Array} - Array of rows, where each row is an array of { text: string, x: number }.
 */
function groupIntoRowsWithCoords(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('ROW_DETECTION_FAILED: No text items provided for grouping');
  }

  try {
    const rows = [];
    const sortedItems = [...items].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
      return a.x - b.x;
    });

    let currentRow = [];
    let lastY = -1;
    let lastPage = -1;

    sortedItems.forEach(item => {
      if (!item) return;

      const isNewPage = lastPage !== -1 && item.page !== lastPage;
      const isNewRow = lastY !== -1 && Math.abs(item.y - lastY) > 5;

      if (isNewPage || isNewRow) {
        if (currentRow.length > 0) rows.push(currentRow);
        currentRow = [];
      }

      currentRow.push({ text: item.text || '', x: item.x });
      lastY = item.y;
      lastPage = item.page;
    });

    if (currentRow.length > 0) rows.push(currentRow);

    if (rows.length === 0) {
      throw new Error('ROW_DETECTION_FAILED: Could not reconstruct any rows from PDF text');
    }

    return rows;
  } catch (error) {
    if (error.message.startsWith('ROW_DETECTION_FAILED')) throw error;
    console.error('[rowGrouper] Internal Error:', error);
    throw new Error('ROW_DETECTION_FAILED: ' + (error.message || 'Unknown grouping error'));
  }
}

module.exports = { groupIntoRows, groupIntoRowsWithCoords };
