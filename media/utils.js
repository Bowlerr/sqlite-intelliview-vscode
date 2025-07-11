// @ts-check

/**
 * Utility functions for the SQLite IntelliView
 */

/**
 * Performance utility - debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait  if (typeof value === 'string') {
    // Simple HTML escaping since escapeHtml may not be available
    return value.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
  }Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate unique table ID
 * @param {string} tableName - Table name
 * @returns {string} Unique table ID
 */
function generateTableId(tableName) {
  return `table-${tableName || "query"}-${Date.now()}`;
}

/**
 * Get column name from header element
 * @param {Element} header - Header element
 * @returns {string} Column name
 */
function getColumnName(header) {
  const nameElement = header.querySelector(".column-name");
  return nameElement ? nameElement.textContent : "";
}

/**
 * Check if element is visible
 * @param {Element} element - Element to check
 * @returns {boolean} True if visible
 */
function isElementVisible(element) {
  if (!element) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * Get cell value as text
 * @param {Element} cell - Cell element
 * @returns {string} Cell text content
 */
function getCellValue(cell) {
  if (!cell) {
    return "";
  }
  return cell.textContent.trim();
}

/**
 * Compare values for sorting
 * @param {string} a - First value
 * @param {string} b - Second value
 * @param {string} direction - Sort direction ('asc' or 'desc')
 * @returns {number} Comparison result
 */
function compareValues(a, b, direction = "asc") {
  // Handle NULL values
  if (a === "NULL" && b === "NULL") {
    return 0;
  }
  if (a === "NULL") {
    return direction === "asc" ? 1 : -1;
  }
  if (b === "NULL") {
    return direction === "asc" ? -1 : 1;
  }

  // Try numeric comparison first
  const numA = parseFloat(a);
  const numB = parseFloat(b);

  if (!isNaN(numA) && !isNaN(numB)) {
    return direction === "asc" ? numA - numB : numB - numA;
  }

  // String comparison
  const result = a.localeCompare(b);
  return direction === "asc" ? result : -result;
}

/**
 * Format number with thousands separator
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * Get plural form of word
 * @param {number} count - Count
 * @param {string} singular - Singular form
 * @param {string} plural - Plural form (optional)
 * @returns {string} Correct form
 */
function pluralize(count, singular, plural) {
  if (count === 1) {
    return singular;
  }
  return plural || `${singular}s`;
}

/**
 * Sanitize filename for export
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

/**
 * Create CSV content from table data
 * @param {Array} headers - Table headers
 * @param {Array} rows - Table rows
 * @returns {string} CSV content
 */
function createCSVContent(headers, rows) {
  let csvContent = "";

  // Add headers
  csvContent += headers.join(",") + "\n";

  // Add rows
  rows.forEach((row) => {
    const csvRow = row.map((cell) => {
      let value = cell;
      if (value === "NULL") {
        value = "";
      }

      // Escape commas and quotes
      if (value.includes(",") || value.includes('"')) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    });
    csvContent += csvRow.join(",") + "\n";
  });

  return csvContent;
}

/**
 * Download content as file
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} type - MIME type
 */
function downloadFile(content, filename, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Format cell value for display
 * @param {any} value - Value to format
 * @returns {string} Formatted value
 */
function formatCellValue(value) {
  if (value === null || value === undefined) {
    return '<span class="null-value">NULL</span>';
  }

  if (typeof value === "string") {
    return escapeHtml ? escapeHtml(value) : value;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

/**
 * Format file size in bytes
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB"];
  if (bytes === 0) {
    return "0 Bytes";
  }

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
}

// Make formatCellValue available globally for browser context
if (typeof window !== "undefined") {
  window.formatCellValue = formatCellValue;
}

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    debounce,
    generateTableId,
    getColumnName,
    isElementVisible,
    getCellValue,
    compareValues,
    formatNumber,
    pluralize,
    sanitizeFilename,
    createCSVContent,
    downloadFile,
    formatCellValue,
    formatFileSize,
  };
}
