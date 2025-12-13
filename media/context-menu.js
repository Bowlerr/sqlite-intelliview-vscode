// @ts-check

/**
 * Context menu functionality for table cells
 * Provides right-click context menu with copy cell and copy row options
 */

let contextMenu = null;
let currentCell = null;
let currentRow = null;
let pendingDeleteRow = null; // Store row being deleted until response comes back

/**
 * Initialize context menu functionality
 */
function initializeContextMenu() {
  // Create context menu element
  createContextMenuElement();

  // Add event listeners
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("click", hideContextMenu);
  document.addEventListener("keydown", handleContextMenuKeyboard);

  // Hide context menu when scrolling
  document.addEventListener("scroll", hideContextMenu, true);

  if (window.debug) {
    window.debug.debug("Context menu initialized");
  }
}

/**
 * Create the context menu DOM element
 */
function createContextMenuElement() {
  if (contextMenu) {
    return;
  }

  contextMenu = document.createElement("div");
  contextMenu.className = "context-menu";
  contextMenu.innerHTML = `
    <div class="context-menu-item" data-action="copy-cell">
      <span class="icon">📋</span>
      <span>Copy Cell</span>
    </div>
    <div class="context-menu-item context-menu-item-json" data-action="view-json" style="display: none;">
      <span class="icon">{}</span>
      <span>View JSON</span>
    </div>
    <div class="context-menu-item context-menu-item-json" data-action="copy-cell-json" style="display: none;">
      <span class="icon">📋</span>
      <span>Copy Formatted JSON</span>
    </div>
    <div class="context-menu-separator context-menu-separator-json" style="display: none;"></div>
    <div class="context-menu-item context-menu-item-blob" data-action="view-blob" style="display: none;">
      <span class="icon">🧩</span>
      <span>View Blob</span>
    </div>
    <div class="context-menu-item context-menu-item-blob" data-action="copy-blob-base64" style="display: none;">
      <span class="icon">📋</span>
      <span>Copy Blob (Base64)</span>
    </div>
    <div class="context-menu-item context-menu-item-blob" data-action="copy-blob-hex" style="display: none;">
      <span class="icon">📋</span>
      <span>Copy Blob (Hex)</span>
    </div>
    <div class="context-menu-separator context-menu-separator-blob" style="display: none;"></div>
    <div class="context-menu-item" data-action="copy-row">
      <span class="icon">📄</span>
      <span>Copy Row</span>
    </div>
    <div class="context-menu-item" data-action="copy-row-json">
      <span class="icon">📋</span>
      <span>Copy Row JSON</span>
    </div>
    <div class="context-menu-separator"></div>
    <div class="context-menu-item" data-action="copy-column">
      <span class="icon">🗂️</span>
      <span>Copy Column</span>
    </div>
    <div class="context-menu-item" data-action="copy-table-json">
      <span class="icon">📊</span>
      <span>Copy Table JSON</span>
    </div>
    <div class="context-menu-separator"></div>
    <div class="context-menu-item context-menu-item-fk" data-action="navigate-foreign-key" style="display: none;">
      <span class="icon">�</span>
      <span>Query Referenced Row</span>
    </div>
    <div class="context-menu-separator context-menu-separator-fk" style="display: none;"></div>
    <div class="context-menu-item context-menu-item-danger" data-action="delete-row">
      <span class="icon">🗑️</span>
      <span>Delete Row</span>
    </div>
  `;

  // Add click handlers for menu items
  contextMenu.addEventListener("click", handleContextMenuClick);

  // Prevent context menu from closing when clicking inside it
  contextMenu.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.appendChild(contextMenu);
}

/**
 * Handle right-click context menu events
 * @param {MouseEvent} e - Mouse event
 */
function handleContextMenu(e) {
  // Only handle right-clicks on table cells
  const target = /** @type {HTMLElement} */ (e.target);
  if (!target) {
    return;
  }

  const cell = target.closest(".data-table td");
  if (!cell) {
    return;
  }

  // Don't show context menu on schema tables (read-only), but allow for query results
  const table = cell.closest(".data-table");
  const tableId = table?.id;

  if (tableId && tableId.includes("schema")) {
    // Allow default context menu for schema tables only
    return;
  }

  showContextMenuForCell(e, /** @type {HTMLTableCellElement} */ (cell));
}

/**
 * Show context menu for a specific cell (used by delegated and per-cell listeners)
 * @param {MouseEvent} e - Mouse event
 * @param {HTMLTableCellElement} cell - Target table cell
 */
function showContextMenuForCell(e, cell) {
  if (!cell) {
    return;
  }

  // Don't show context menu on schema tables (read-only), but allow for query results
  const table = cell.closest(".data-table");
  const tableId = table?.id;
  if (tableId && tableId.includes("schema")) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  // Store references to current cell and row
  currentCell = cell;
  currentRow = cell.closest("tr");

  // Highlight the target cell
  clearCellHighlight();
  cell.classList.add("context-menu-target");

  // Show context menu
  showContextMenuAt(e.clientX, e.clientY);
}

/**
 * Show context menu at specified coordinates
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function showContextMenuAt(x, y) {
  if (!contextMenu) {
    return;
  }

  // Check if current cell is a foreign key cell
  const isForeignKeyCell =
    currentCell && currentCell.classList.contains("fk-cell");

  // Check if current table is a query result (read-only)
  const table = currentCell?.closest(".data-table");
  const tableId = table?.id;
  const isQueryResultTable = tableId && tableId.includes("query");

  // Show/hide delete-row option for read-only tables
  const deleteMenuItem = contextMenu.querySelector(
    '[data-action="delete-row"]'
  );
  if (deleteMenuItem) {
    if (isQueryResultTable) {
      deleteMenuItem.style.display = "none";
    } else {
      deleteMenuItem.style.display = "block";
    }
  }

  // Show/hide foreign key navigation option
  const fkMenuItem = contextMenu.querySelector(
    '[data-action="navigate-foreign-key"]'
  );
  const fkSeparator = contextMenu.querySelector(".context-menu-separator-fk");

  if (fkMenuItem && fkSeparator) {
    if (isForeignKeyCell) {
      const foreignKeyInfo = getForeignKeyInfoForCell(currentCell);
      if (foreignKeyInfo) {
        fkMenuItem.style.display = "block";
        fkSeparator.style.display = "block";

        // Update the menu item text to show querying the referenced table
        const span = fkMenuItem.querySelector("span:last-child");
        if (span) {
          span.textContent = `Query ${foreignKeyInfo.referencedTable} (${foreignKeyInfo.referencedColumn} = ${foreignKeyInfo.value})`;
        }
      } else {
        fkMenuItem.style.display = "none";
        fkSeparator.style.display = "none";
      }
    } else {
      fkMenuItem.style.display = "none";
      fkSeparator.style.display = "none";
    }
  }

  // Show/hide JSON actions
  const jsonMenuItem = contextMenu.querySelector('[data-action="view-json"]');
  const jsonCopyItem = contextMenu.querySelector(
    '[data-action="copy-cell-json"]'
  );
  const jsonSeparator = contextMenu.querySelector(
    ".context-menu-separator-json"
  );

  const jsonInfo = currentCell ? getJsonInfoForCell(currentCell) : null;
  const hasJson = !!(jsonInfo && jsonInfo.parsed);

  if (jsonMenuItem && jsonCopyItem && jsonSeparator) {
    if (hasJson) {
      jsonMenuItem.style.display = "flex";
      jsonCopyItem.style.display = "flex";
      jsonSeparator.style.display = "block";
    } else {
      jsonMenuItem.style.display = "none";
      jsonCopyItem.style.display = "none";
      jsonSeparator.style.display = "none";
    }
  }

  // Show/hide BLOB actions
  const blobViewItem = contextMenu.querySelector('[data-action="view-blob"]');
  const blobCopyB64Item = contextMenu.querySelector(
    '[data-action="copy-blob-base64"]'
  );
  const blobCopyHexItem = contextMenu.querySelector(
    '[data-action="copy-blob-hex"]'
  );
  const blobSeparator = contextMenu.querySelector(
    ".context-menu-separator-blob"
  );

  const blobInfo = currentCell ? getBlobInfoForCell(currentCell) : null;
  const hasBlob = !!blobInfo;

  if (blobViewItem && blobCopyB64Item && blobCopyHexItem && blobSeparator) {
    if (hasBlob) {
      blobViewItem.style.display = "flex";
      blobCopyB64Item.style.display = "flex";
      blobCopyHexItem.style.display = "flex";
      blobSeparator.style.display = "block";

      // Update label/icon for images
      if (blobInfo && blobInfo.isImage) {
        const icon = blobViewItem.querySelector(".icon");
        if (icon) {
          icon.textContent = "🖼️";
        }
        const textSpan = blobViewItem.querySelector("span:last-child");
        if (textSpan) {
          textSpan.textContent = "View Image";
        }
      } else {
        const icon = blobViewItem.querySelector(".icon");
        if (icon) {
          icon.textContent = "🧩";
        }
        const textSpan = blobViewItem.querySelector("span:last-child");
        if (textSpan) {
          textSpan.textContent = "View Blob";
        }
      }
    } else {
      blobViewItem.style.display = "none";
      blobCopyB64Item.style.display = "none";
      blobCopyHexItem.style.display = "none";
      blobSeparator.style.display = "none";
    }
  }

  // Position the context menu
  contextMenu.style.left = x + "px";
  contextMenu.style.top = y + "px";
  contextMenu.style.display = "block";

  // Add show class for animation
  setTimeout(() => {
    contextMenu.classList.add("show");
  }, 10);

  // Adjust position if menu goes outside viewport
  adjustContextMenuPosition();

  // Add class to body to prevent text selection
  document.body.classList.add("context-menu-active");
}

/**
 * Hide context menu
 */
function hideContextMenu() {
  if (!contextMenu) {
    return;
  }

  contextMenu.classList.remove("show");
  contextMenu.style.display = "none";

  // Clear cell highlight
  clearCellHighlight();

  // Remove active class from body
  document.body.classList.remove("context-menu-active");

  // Clear references
  currentCell = null;
  currentRow = null;
}

/**
 * Clear cell highlight
 */
function clearCellHighlight() {
  const highlighted = document.querySelectorAll(".context-menu-target");
  highlighted.forEach((cell) => {
    cell.classList.remove("context-menu-target");
  });
}

/**
 * Adjust context menu position to stay within viewport
 */
function adjustContextMenuPosition() {
  if (!contextMenu) {
    return;
  }

  const rect = contextMenu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Adjust horizontal position
  if (rect.right > viewportWidth) {
    const newLeft = viewportWidth - rect.width - 10;
    contextMenu.style.left = Math.max(10, newLeft) + "px";
  }

  // Adjust vertical position
  if (rect.bottom > viewportHeight) {
    const newTop = viewportHeight - rect.height - 10;
    contextMenu.style.top = Math.max(10, newTop) + "px";
  }
}

/**
 * Handle context menu item clicks
 * @param {MouseEvent} e - Mouse event
 */
function handleContextMenuClick(e) {
  const target = /** @type {HTMLElement} */ (e.target);
  if (!target) {
    return;
  }

  const menuItem = /** @type {HTMLElement} */ (
    target.closest(".context-menu-item")
  );
  if (!menuItem) {
    return;
  }

  const action = menuItem.dataset.action;

  if (action && currentCell) {
    executeContextMenuAction(action);
  }

  hideContextMenu();
}

/**
 * Execute context menu action
 * @param {string} action - Action to execute
 */
function executeContextMenuAction(action) {
  switch (action) {
    case "copy-cell":
      copyCellValue();
      break;
    case "view-json":
      viewCellAsJson();
      break;
    case "copy-cell-json":
      copyCellAsFormattedJson();
      break;
    case "view-blob":
      viewCellAsBlob();
      break;
    case "copy-blob-base64":
      copyCellBlobAsBase64();
      break;
    case "copy-blob-hex":
      copyCellBlobAsHex();
      break;
    case "copy-row":
      copyRowData();
      break;
    case "copy-row-json":
      copyRowDataAsJSON();
      break;
    case "copy-column":
      copyColumnData();
      break;
    case "copy-table-json":
      copyTableDataAsJSON();
      break;
    case "delete-row":
      deleteRowWithConfirmation();
      break;
    case "navigate-foreign-key":
      navigateToForeignKeyReference();
      break;
    default:
      if (window.debug) {
        window.debug.debug(`Unknown context menu action: ${action}`);
      }
  }
}

/**
 * Copy cell value to clipboard
 */
function copyCellValue() {
  if (!currentCell) {
    return;
  }

  const cellValue = getCellDisplayValue(currentCell);
  copyToClipboard(cellValue, "Cell value copied");
}

/**
 * Copy entire row data to clipboard
 */
function copyRowData() {
  if (!currentRow) {
    return;
  }

  const cells = currentRow.querySelectorAll("td");
  let hadLargeBlob = false;
  const rowData = Array.from(cells).map((cell) => {
    const res = getCellCopyValue(/** @type {HTMLTableCellElement} */ (cell), {
      mode: "tsv",
    });
    hadLargeBlob = hadLargeBlob || res.hadLargeBlob;
    return typeof res.value === "string" ? res.value : "";
  });
  const rowText = rowData.join("\t"); // Tab-separated values

  copyToClipboard(
    rowText,
    `Row data copied${hadLargeBlob ? " (some blobs omitted)" : ""}`
  );
}

/**
 * Copy entire column data to clipboard
 */
function copyColumnData() {
  if (!currentCell) {
    return;
  }

  const table = currentCell.closest(".data-table");
  if (!table) {
    return;
  }

  const columnIndex = parseInt(
    currentCell.getAttribute("data-column") || String(currentCell.cellIndex),
    10
  );

  const tableWrapper = table.closest(".enhanced-table-wrapper");
  /** @type {any} */ const vs = tableWrapper && tableWrapper.__virtualTableState;

  // Get column header
  const header = table.querySelector(`thead th:nth-child(${columnIndex + 1})`);
  const headerText = header
    ? getColumnHeaderText(header)
    : `Column ${columnIndex + 1}`;

  // Get all cell values in the column
  const columnData = [headerText];
  let hadLargeBlob = false;
  if (vs && vs.enabled === true) {
    (vs.order || []).forEach((sourceIndex) => {
      const row = vs.pageData[sourceIndex];
      const v = Array.isArray(row) ? row[columnIndex] : null;
      const bytes = normalizeBlobValue(v);
      if (bytes) {
        const mime = detectImageMime(bytes);
        const isImage = !!mime;
        const out = blobToCopyText(bytes, mime, { includeDataUrl: isImage });
        hadLargeBlob = hadLargeBlob || out.truncated === true;
        columnData.push(out.text);
      } else {
        columnData.push(v === null || v === undefined ? "" : String(v));
      }
    });
  } else {
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const cell = row.cells[columnIndex];
      if (cell) {
        const res = getCellCopyValue(cell, { mode: "tsv" });
        hadLargeBlob = hadLargeBlob || res.hadLargeBlob;
        columnData.push(typeof res.value === "string" ? res.value : "");
      }
    });
  }

  const columnText = columnData.join("\n");
  copyToClipboard(
    columnText,
    `Column data copied${hadLargeBlob ? " (some blobs omitted)" : ""}`
  );
}

/**
 * Copy entire row data as JSON to clipboard
 */
function copyRowDataAsJSON() {
  if (!currentRow) {
    return;
  }

  const table = currentRow.closest(".data-table");
  if (!table) {
    return;
  }

  // Get column headers
  const headers = table.querySelectorAll("thead th");
  const columnNames = Array.from(headers).map((header) =>
    getColumnHeaderText(header)
  );

  // Get row data
  const cells = currentRow.querySelectorAll("td");
  let hadLargeBlob = false;
  const rowData = Array.from(cells).map((cell) => {
    const res = getCellCopyValue(/** @type {HTMLTableCellElement} */ (cell), {
      mode: "json",
    });
    hadLargeBlob = hadLargeBlob || res.hadLargeBlob;
    if (typeof res.value === "string") {
      return res.value === "" ? null : res.value;
    }
    return res.value;
  });

  // Create JSON object
  const rowObject = {};
  columnNames.forEach((columnName, index) => {
    if (index < rowData.length) {
      rowObject[columnName] = rowData[index];
    }
  });

  // Convert to formatted JSON
  const jsonString = JSON.stringify(rowObject, null, 2);
  copyToClipboard(
    jsonString,
    `Row data copied as JSON${hadLargeBlob ? " (some blobs omitted)" : ""}`
  );
}

/**
 * Copy entire table data as JSON to clipboard
 */
function copyTableDataAsJSON() {
  if (!currentCell) {
    return;
  }

  const table = currentCell.closest(".data-table");
  if (!table) {
    return;
  }

  const tableWrapper = table.closest(".enhanced-table-wrapper");
  /** @type {any} */ const vs = tableWrapper && tableWrapper.__virtualTableState;

  // Get column headers
  const headers = table.querySelectorAll("thead th");
  const columnNames = Array.from(headers).map((header) =>
    getColumnHeaderText(header)
  );

  const tableData = [];
  let hadLargeBlob = false;

  if (vs && vs.enabled === true) {
    (vs.order || []).forEach((sourceIndex) => {
      const row = vs.pageData[sourceIndex];
      const rowObject = {};
      columnNames.forEach((columnName, index) => {
        const v = Array.isArray(row) ? row[index] : null;
        const bytes = normalizeBlobValue(v);
        if (bytes) {
          const mime = detectImageMime(bytes);
          const jsonVal = blobToJsonValue(bytes, mime);
          hadLargeBlob = hadLargeBlob || jsonVal.truncated === true;
          rowObject[columnName] = jsonVal;
        } else {
          rowObject[columnName] =
            v === null || v === undefined || String(v) === ""
              ? null
              : String(v);
        }
      });
      tableData.push(rowObject);
    });
  } else {
    // Get all rows (DOM-backed)
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      const rowData = Array.from(cells).map((cell) => {
        const res = getCellCopyValue(
          /** @type {HTMLTableCellElement} */ (cell),
          { mode: "json" }
        );
        hadLargeBlob = hadLargeBlob || res.hadLargeBlob;
        if (typeof res.value === "string") {
          return res.value === "" ? null : res.value;
        }
        return res.value;
      });

      const rowObject = {};
      columnNames.forEach((columnName, index) => {
        if (index < rowData.length) {
          rowObject[columnName] = rowData[index];
        }
      });
      tableData.push(rowObject);
    });
  }

  // Convert to formatted JSON
  const jsonString = JSON.stringify(tableData, null, 2);
  copyToClipboard(
    jsonString,
    `Table data copied as JSON (${tableData.length} rows)${
      hadLargeBlob ? " (some blobs omitted)" : ""
    }`
  );
}

/**
 * Get display value from a cell
 * @param {HTMLTableCellElement} cell - Table cell element
 * @returns {string} Cell display value
 */
function getCellDisplayValue(cell) {
  const cellContent = cell.querySelector(".cell-content");
  if (cellContent) {
    const textContent = cellContent.textContent || "";
    return textContent.trim() === "NULL" ? "" : textContent.trim();
  }
  return cell.textContent?.trim() || "";
}

/**
 * Get a cell's underlying value from in-memory state (supports BLOBs).
 * @param {HTMLTableCellElement} cell
 * @returns {any}
 */
function getCellUnderlyingValue(cell) {
  const table = cell.closest(".data-table");
  const wrapper = table && table.closest(".enhanced-table-wrapper");
  if (!wrapper) {
    return null;
  }

  const colIndex = parseInt(
    cell.getAttribute("data-column") || String(cell.cellIndex),
    10
  );
  const rowEl = cell.closest("tr");
  const localIndex = parseInt(rowEl?.getAttribute("data-local-index") || "", 10);
  if (!Number.isFinite(colIndex) || !Number.isFinite(localIndex)) {
    return null;
  }

  /** @type {any} */ const vs = /** @type {any} */ (wrapper).__virtualTableState;
  if (vs && vs.enabled === true && Array.isArray(vs.pageData)) {
    const row = vs.pageData[localIndex];
    if (Array.isArray(row) && colIndex >= 0 && colIndex < row.length) {
      return row[colIndex];
    }
  }

  const tableId = wrapper.getAttribute("data-table-id") || wrapper.dataset.tableId || "";
  /** @type {any} */ const stash = /** @type {any} */ (window).__tableDataStash;
  const payload = tableId && stash && typeof stash.get === "function" ? stash.get(tableId) : null;
  if (payload && Array.isArray(payload.pageData)) {
    const row = payload.pageData[localIndex];
    if (Array.isArray(row) && colIndex >= 0 && colIndex < row.length) {
      return row[colIndex];
    }
  }

  return null;
}

/**
 * Get the best-available raw cell value (prefers virtualized backing data).
 * @param {HTMLTableCellElement} cell
 * @returns {{ value: string, truncated: boolean }}
 */
function getCellRawValue(cell) {
  const cellContent = cell.querySelector(".cell-content");
  if (cellContent) {
    const original = cellContent.getAttribute("data-original-value") || "";
    const truncated = cellContent.getAttribute("data-original-truncated") === "true";
    const isNull =
      cellContent.querySelector("em") &&
      (cellContent.textContent || "").trim() === "NULL";
    // Prefer DOM-backed original when not truncated (keeps edits in-sync even under virtualization).
    if (!truncated) {
      return { value: isNull ? "" : original, truncated: false };
    }
  }

  const table = cell.closest(".data-table");
  const wrapper = table && table.closest(".enhanced-table-wrapper");
  /** @type {any} */ const vs = wrapper && wrapper.__virtualTableState;

  const colIndex = parseInt(
    cell.getAttribute("data-column") || String(cell.cellIndex),
    10
  );

  if (vs && vs.enabled === true) {
    const rowEl = cell.closest("tr");
    const localIndex = parseInt(
      rowEl?.getAttribute("data-local-index") || "",
      10
    );
    if (Number.isFinite(localIndex) && localIndex >= 0) {
      const row = Array.isArray(vs.pageData) ? vs.pageData[localIndex] : null;
      if (Array.isArray(row) && colIndex >= 0 && colIndex < row.length) {
        const v = row[colIndex];
        if (v === null || v === undefined) {
          return { value: "", truncated: false };
        }
        return { value: String(v), truncated: false };
      }
    }
  }

  if (cellContent) {
    const original = cellContent.getAttribute("data-original-value") || "";
    const isNull =
      cellContent.querySelector("em") &&
      (cellContent.textContent || "").trim() === "NULL";
    return { value: isNull ? "" : original, truncated: true };
  }

  return { value: getCellDisplayValue(cell), truncated: false };
}

/**
 * Attempt to parse a cell value as JSON and return formatted output.
 * @param {HTMLTableCellElement} cell
 * @returns {{ parsed: any, formatted: string, truncated: boolean } | null}
 */
function getJsonInfoForCell(cell) {
  const raw = getCellRawValue(cell);
  const text = (raw.value || "").trim();
  if (!text) {
    return null;
  }

  const first = text[0];
  if (first !== "{" && first !== "[") {
    return null;
  }

  // Guard against pathological values (keeps the webview responsive).
  if (text.length > 2_000_000) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object") {
      return null;
    }
    return { parsed, formatted: JSON.stringify(parsed, null, 2), truncated: raw.truncated };
  } catch {
    return null;
  }
}

/**
 * Copy current cell as formatted JSON (if parseable).
 */
function copyCellAsFormattedJson() {
  if (!currentCell) {
    return;
  }
  const jsonInfo = getJsonInfoForCell(currentCell);
  if (!jsonInfo) {
    if (typeof showError === "function") {
      showError("Cell is not valid JSON.");
    }
    return;
  }
  const suffix = jsonInfo.truncated ? " (truncated)" : "";
  copyToClipboard(jsonInfo.formatted, `Formatted JSON copied${suffix}`);
}

/**
 * Open a readable JSON viewer for the current cell (if parseable).
 */
function viewCellAsJson() {
  if (!currentCell) {
    return;
  }
  const jsonInfo = getJsonInfoForCell(currentCell);
  if (!jsonInfo) {
    if (typeof showError === "function") {
      showError("Cell is not valid JSON.");
    }
    return;
  }

  const columnName =
    currentCell.getAttribute("data-column-name") ||
    currentCell.dataset.columnName ||
    "";

  showJsonViewerDialog({
    title: columnName ? `JSON Viewer — ${columnName}` : "JSON Viewer",
    formattedJson: jsonInfo.formatted,
    truncated: jsonInfo.truncated,
  });
}

function normalizeBlobValue(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
    return Uint8Array.from(value);
  }
  if (
    typeof value === "object" &&
    value &&
    value.type === "Buffer" &&
    Array.isArray(value.data)
  ) {
    return Uint8Array.from(value.data);
  }
  return null;
}

function detectImageMime(bytes) {
  if (!bytes || bytes.length < 4) {
    return "";
  }
  // PNG
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  // SVG (best-effort)
  try {
    const head = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.subarray(0, Math.min(bytes.length, 256))
    );
    if (head.trim().startsWith("<svg")) {
      return "image/svg+xml";
    }
  } catch (_) {
    // ignore
  }
  return "";
}

function formatBytes(bytes) {
  const b = typeof bytes === "number" && bytes >= 0 ? bytes : 0;
  if (b < 1024) {
    return `${b} B`;
  }
  const kb = b / 1024;
  if (kb < 1024) {
    return `${Math.round(kb * 10) / 10} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${Math.round(mb * 10) / 10} MB`;
  }
  const gb = mb / 1024;
  return `${Math.round(gb * 10) / 10} GB`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, /** @type {any} */ (chunk));
  }
  return btoa(binary);
}

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i];
    out += (v < 16 ? "0" : "") + v.toString(16);
  }
  return out;
}

const MAX_BLOB_COPY_BYTES_BASE64 = 5 * 1024 * 1024; // 5MB per cell (avoids UI hangs)

function blobToCopyText(bytes, mime, { includeDataUrl }) {
  const sizeText = formatBytes(bytes.length);
  if (bytes.length > MAX_BLOB_COPY_BYTES_BASE64) {
    return { text: `<BLOB ${sizeText}>`, truncated: true, sizeText };
  }
  const b64 = bytesToBase64(bytes);
  if (includeDataUrl && mime) {
    return { text: `data:${mime};base64,${b64}`, truncated: false, sizeText };
  }
  return { text: `base64:${b64}`, truncated: false, sizeText };
}

function blobToJsonValue(bytes, mime) {
  const sizeText = formatBytes(bytes.length);
  if (bytes.length > MAX_BLOB_COPY_BYTES_BASE64) {
    return {
      __type: "blob",
      bytes: bytes.length,
      mime: mime || null,
      truncated: true,
    };
  }
  return {
    __type: "blob",
    bytes: bytes.length,
    mime: mime || null,
    base64: bytesToBase64(bytes),
    sizeText,
  };
}

function getCellCopyValue(cell, { mode }) {
  const underlying = getCellUnderlyingValue(cell);
  const bytes = normalizeBlobValue(underlying);
  if (bytes) {
    const mime = detectImageMime(bytes);
    const isImage = !!mime;
    if (mode === "json") {
      const value = blobToJsonValue(bytes, mime);
      return { value, hadLargeBlob: value && value.truncated === true };
    }
    const out = blobToCopyText(bytes, mime, { includeDataUrl: isImage });
    return { value: out.text, hadLargeBlob: out.truncated === true };
  }

  const text = getCellDisplayValue(cell);
  return { value: text.trim() === "NULL" ? "" : text, hadLargeBlob: false };
}

function sanitizeFilenamePart(text) {
  return String(text || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function extensionForMime(mime) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/bmp":
      return "bmp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

function getBlobInfoForCell(cell) {
  const underlying = getCellUnderlyingValue(cell);
  const bytes = normalizeBlobValue(underlying);
  if (!bytes) {
    return null;
  }
  const mime = detectImageMime(bytes);
  return {
    bytes,
    mime,
    isImage: !!mime,
    sizeText: formatBytes(bytes.length),
  };
}

function createHexDump(bytes, maxBytes) {
  const limit = Math.max(0, Math.min(bytes.length, maxBytes));
  const slice = bytes.subarray(0, limit);
  const lines = [];
  for (let offset = 0; offset < slice.length; offset += 16) {
    const chunk = slice.subarray(offset, offset + 16);
    let hex = "";
    let ascii = "";
    for (let i = 0; i < 16; i++) {
      if (i < chunk.length) {
        const b = chunk[i];
        hex += (b < 16 ? "0" : "") + b.toString(16) + " ";
        ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
      } else {
        hex += "   ";
        ascii += " ";
      }
    }
    const off = offset.toString(16).padStart(8, "0");
    lines.push(`${off}  ${hex} ${ascii}`);
  }
  return lines.join("\n");
}

function downloadBytes(bytes, filename, mime) {
  try {
    const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "blob.bin";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    if (typeof showError === "function") {
      showError("Failed to download blob.");
    }
  }
}

function requestDownloadBytes(bytes, filename, mime) {
  const maxBytes = 20 * 1024 * 1024; // 20MB (keeps message passing reasonable)
  if (bytes && bytes.length > maxBytes) {
    if (typeof showError === "function") {
      showError(`Blob too large to download from the viewer (${formatBytes(bytes.length)}).`);
    }
    return;
  }

  if (window.vscode && typeof window.vscode.postMessage === "function") {
    try {
      if (typeof showLoading === "function") {
        const name = filename ? String(filename) : "blob";
        showLoading(`Saving ${escapeHtmlForInnerHtml(name)}…`);
      }
      const requestId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `blob_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      window.vscode.postMessage({
        type: "downloadBlob",
        requestId,
        filename: filename || "blob.bin",
        mime: mime || "application/octet-stream",
        dataBase64: bytesToBase64(bytes || new Uint8Array()),
      });
      return;
    } catch (_) {
      // fall back to browser download
    }
  }

  if (typeof hideLoading === "function") {
    hideLoading();
  }
  downloadBytes(bytes, filename, mime);
}

function copyCellBlobAsBase64() {
  if (!currentCell) {
    return;
  }
  const info = getBlobInfoForCell(currentCell);
  if (!info) {
    if (typeof showError === "function") {
      showError("Cell is not a blob.");
    }
    return;
  }
  const maxBytes = 5 * 1024 * 1024; // 5MB
  if (info.bytes.length > maxBytes) {
    if (typeof showError === "function") {
      showError(`Blob too large to copy as base64 (${info.sizeText}).`);
    }
    return;
  }
  copyToClipboard(
    bytesToBase64(info.bytes),
    `Blob copied as base64 (${info.sizeText})`
  );
}

function copyCellBlobAsHex() {
  if (!currentCell) {
    return;
  }
  const info = getBlobInfoForCell(currentCell);
  if (!info) {
    if (typeof showError === "function") {
      showError("Cell is not a blob.");
    }
    return;
  }
  const maxBytes = 1 * 1024 * 1024; // 1MB
  if (info.bytes.length > maxBytes) {
    if (typeof showError === "function") {
      showError(`Blob too large to copy as hex (${info.sizeText}).`);
    }
    return;
  }
  copyToClipboard(
    bytesToHex(info.bytes),
    `Blob copied as hex (${info.sizeText})`
  );
}

function viewCellAsBlob() {
  if (!currentCell) {
    return;
  }
  const info = getBlobInfoForCell(currentCell);
  if (!info) {
    if (typeof showError === "function") {
      showError("Cell is not a blob.");
    }
    return;
  }
  const columnName =
    currentCell.getAttribute("data-column-name") ||
    currentCell.dataset.columnName ||
    "";

  const title = columnName
    ? `${info.isImage ? "Image" : "Blob"} Viewer — ${columnName}`
    : `${info.isImage ? "Image" : "Blob"} Viewer`;

  showBlobViewerDialog({
    title,
    bytes: info.bytes,
    mime: info.mime || "application/octet-stream",
    isImage: info.isImage,
    sizeText: info.sizeText,
  });
}

function showBlobViewerDialog(opts) {
  const overlay = document.createElement("div");
  overlay.className = "confirm-dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "confirm-dialog blob-viewer-dialog";

  const titleEl = document.createElement("h3");
  titleEl.className = "confirm-dialog-title";
  titleEl.textContent = opts.title || "Blob Viewer";

  const metaEl = document.createElement("div");
  metaEl.className = "confirm-dialog-table-info blob-viewer-meta";
  metaEl.textContent = `Size: ${opts.sizeText}${
    opts.isImage ? ` • ${opts.mime}` : ""
  }`;

  const contentEl = document.createElement("div");
  contentEl.className = "confirm-dialog-row-data blob-viewer-content";

  let objectUrl = "";
  if (opts.isImage) {
    const img = document.createElement("img");
    img.className = "blob-viewer-image";
    img.alt = "Image blob preview";
    try {
      objectUrl = URL.createObjectURL(new Blob([opts.bytes], { type: opts.mime }));
      img.src = objectUrl;
    } catch (_) {
      // ignore
    }
    contentEl.appendChild(img);
  } else {
    const maxPreview = 64 * 1024; // 64KB
    const pre = document.createElement("pre");
    pre.className = "blob-viewer-hex";
    pre.textContent = createHexDump(opts.bytes, maxPreview);
    contentEl.appendChild(pre);

    if (opts.bytes.length > maxPreview) {
      const note = document.createElement("div");
      note.className = "blob-viewer-note";
      note.textContent = `Preview truncated to ${formatBytes(maxPreview)}.`;
      contentEl.appendChild(note);
    }
  }

  const buttonsEl = document.createElement("div");
  buttonsEl.className = "confirm-dialog-buttons blob-viewer-buttons";

  const closeBtn = document.createElement("button");
  closeBtn.className = "secondary-button";
  closeBtn.textContent = "Close";

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "secondary-button";
  downloadBtn.textContent = "Download";

  const copyB64Btn = document.createElement("button");
  copyB64Btn.className = "secondary-button";
  copyB64Btn.textContent = "Copy Base64";

  const copyHexBtn = document.createElement("button");
  copyHexBtn.className = "primary-button";
  copyHexBtn.textContent = "Copy Hex";

  buttonsEl.appendChild(closeBtn);
  buttonsEl.appendChild(downloadBtn);
  buttonsEl.appendChild(copyB64Btn);
  buttonsEl.appendChild(copyHexBtn);

  dialog.appendChild(titleEl);
  dialog.appendChild(metaEl);
  dialog.appendChild(contentEl);
  dialog.appendChild(buttonsEl);
  overlay.appendChild(dialog);

  const close = () => {
    overlay.remove();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  const handleEscape = (e) => {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);

  downloadBtn.addEventListener("click", () => {
    const base = sanitizeFilenamePart(opts.title || "blob");
    const ext = extensionForMime(opts.isImage ? opts.mime : "");
    requestDownloadBytes(opts.bytes, `${base}.${ext}`, opts.mime);
  });
  copyB64Btn.addEventListener("click", () => {
    const maxBytes = 5 * 1024 * 1024;
    if (opts.bytes.length > maxBytes) {
      if (typeof showError === "function") {
        showError(`Blob too large to copy as base64 (${opts.sizeText}).`);
      }
      return;
    }
    copyToClipboard(bytesToBase64(opts.bytes), `Base64 copied (${opts.sizeText})`);
  });
  copyHexBtn.addEventListener("click", () => {
    const maxBytes = 1 * 1024 * 1024;
    if (opts.bytes.length > maxBytes) {
      if (typeof showError === "function") {
        showError(`Blob too large to copy as hex (${opts.sizeText}).`);
      }
      return;
    }
    copyToClipboard(bytesToHex(opts.bytes), `Hex copied (${opts.sizeText})`);
  });

  document.body.appendChild(overlay);
  copyHexBtn.focus();
}

/**
 * Escape HTML for insertion via innerHTML (keeps quotes intact for regex tokenization).
 * @param {string} text
 * @returns {string}
 */
function escapeHtmlForInnerHtml(text) {
  return String(text).replace(/[&<>]/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return ch;
    }
  });
}

/**
 * Format JSON with syntax highlighting (safe to insert via innerHTML).
 * @param {string} jsonString - The JSON string to format
 * @returns {string} HTML formatted JSON with syntax highlighting
 */
function formatJsonWithSyntaxHighlighting(jsonString) {
  const escaped = escapeHtmlForInnerHtml(jsonString);
  const tokenRegex =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|[{}\[\],:])/g;

  return escaped.replace(tokenRegex, (match) => {
    if (match === "{" || match === "}" || match === "[" || match === "]" || match === "," || match === ":") {
      return `<span class="json-punctuation">${match}</span>`;
    }
    if (match === "true" || match === "false") {
      return `<span class="json-boolean">${match}</span>`;
    }
    if (match === "null") {
      return `<span class="json-null">${match}</span>`;
    }
    if (match[0] === '"') {
      const isKey = match.endsWith(":");
      if (isKey) {
        const key = match.slice(0, -1);
        return `<span class="json-key">${key}</span><span class="json-punctuation">:</span>`;
      }
      return `<span class="json-string">${match}</span>`;
    }
    return `<span class="json-number">${match}</span>`;
  });
}

/**
 * Show a JSON viewer dialog.
 * @param {{ title: string, formattedJson: string, truncated: boolean }} opts
 */
function showJsonViewerDialog(opts) {
  const overlay = document.createElement("div");
  overlay.className = "confirm-dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "confirm-dialog json-viewer-dialog";

  const titleEl = document.createElement("h3");
  titleEl.className = "confirm-dialog-title";
  titleEl.textContent = opts.title || "JSON Viewer";

  const infoEl = document.createElement("div");
  infoEl.className = "confirm-dialog-table-info";
  infoEl.textContent = opts.truncated
    ? "Note: value was truncated in the table view."
    : "Tip: use Copy Formatted JSON from the context menu.";

  const jsonEl = document.createElement("div");
  jsonEl.className = "confirm-dialog-row-data json-viewer-json";
  jsonEl.innerHTML = formatJsonWithSyntaxHighlighting(opts.formattedJson);

  const buttonsEl = document.createElement("div");
  buttonsEl.className = "confirm-dialog-buttons";

  const closeBtn = document.createElement("button");
  closeBtn.className = "secondary-button";
  closeBtn.textContent = "Close";

  const copyMinBtn = document.createElement("button");
  copyMinBtn.className = "secondary-button";
  copyMinBtn.textContent = "Copy Minified";

  const copyBtn = document.createElement("button");
  copyBtn.className = "primary-button";
  copyBtn.textContent = "Copy Formatted";

  buttonsEl.appendChild(closeBtn);
  buttonsEl.appendChild(copyMinBtn);
  buttonsEl.appendChild(copyBtn);

  dialog.appendChild(titleEl);
  dialog.appendChild(infoEl);
  dialog.appendChild(jsonEl);
  dialog.appendChild(buttonsEl);
  overlay.appendChild(dialog);

  const close = () => {
    overlay.remove();
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  const handleEscape = (e) => {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);

  copyBtn.addEventListener("click", () => {
    copyToClipboard(opts.formattedJson, "Formatted JSON copied");
  });
  copyMinBtn.addEventListener("click", () => {
    try {
      const minified = JSON.stringify(JSON.parse(opts.formattedJson));
      copyToClipboard(minified, "Minified JSON copied");
    } catch {
      copyToClipboard(opts.formattedJson, "Formatted JSON copied");
    }
  });

  document.body.appendChild(overlay);
  copyBtn.focus();
}

/**
 * Get column header text
 * @param {HTMLTableHeaderCellElement} header - Table header element
 * @returns {string} Header text
 */
function getColumnHeaderText(header) {
  const columnName = header.querySelector(".column-name");
  return columnName
    ? columnName.textContent?.trim() || ""
    : header.textContent?.trim() || "";
}

/**
 * Copy text to clipboard and show notification
 * @param {string} text - Text to copy
 * @param {string} message - Success message
 */
function copyToClipboard(text, message) {
  // Use the modern clipboard API if available
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showCopySuccess(message);
      })
      .catch((err) => {
        if (window.debug) {
          window.debug.error(`Failed to copy to clipboard: ${err}`);
        }
        fallbackCopy(text, message);
      });
  } else {
    fallbackCopy(text, message);
  }
}

/**
 * Fallback copy method for older browsers
 * @param {string} text - Text to copy
 * @param {string} message - Success message
 */
function fallbackCopy(text, message) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand("copy");
    showCopySuccess(message);
  } catch (err) {
    if (window.debug) {
      window.debug.debug(`Failed to copy to clipboard: ${err}`);
    }
    showCopyError();
  }

  document.body.removeChild(textarea);
}

/**
 * Show copy success notification
 * @param {string} message - Success message
 */
function showCopySuccess(message) {
  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).showSuccess) === "function"
  ) {
    /** @type {any} */ (window).showSuccess(message);
  } else {
    if (window.debug) {
      window.debug.debug(`[ContextMenu] Copy success: ${message}`);
    }
  }
}

/**
 * Show copy error notification
 */
function showCopyError() {
  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).showError) === "function"
  ) {
    /** @type {any} */ (window).showError("Failed to copy to clipboard");
  } else {
    if (window.debug) {
      window.debug.debug("[ContextMenu] Failed to copy to clipboard");
    }
  }
}

/**
 * Handle keyboard events for context menu
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleContextMenuKeyboard(e) {
  if (e.key === "Escape") {
    hideContextMenu();
  }
}

/**
 * Get context menu actions for a specific cell
 * @param {HTMLTableCellElement} cell - Table cell
 * @returns {Array} Available actions
 */
function getContextMenuActions(cell) {
  const actions = ["copy-cell", "copy-row", "copy-row-json"];

  // Add copy column action if we have multiple rows
  const table = cell.closest(".data-table");
  if (table) {
    const tableWrapper = table.closest(".enhanced-table-wrapper");
    /** @type {any} */ const vs = tableWrapper && tableWrapper.__virtualTableState;
    const rowCount =
      vs && vs.enabled === true
        ? (vs.order || []).length
        : table.querySelectorAll("tbody tr").length;
    if (rowCount > 1) {
      actions.push("copy-column");
      actions.push("copy-table-json");
    }
  }

  // Add delete row action for editable tables
  actions.push("delete-row");

  return actions;
}

/**
 * Update context menu items based on available actions
 * @param {Array} actions - Available actions
 */
function updateContextMenuItems(actions) {
  if (!contextMenu) {
    return;
  }

  const items = contextMenu.querySelectorAll(".context-menu-item");
  items.forEach((item) => {
    const action = item.dataset.action;
    if (action && !actions.includes(action)) {
      item.classList.add("disabled");
    } else {
      item.classList.remove("disabled");
    }
  });
}

/**
 * Delete row with confirmation dialog
 */
function deleteRowWithConfirmation() {
  if (!currentRow || !currentCell) {
    if (window.debug) {
      window.debug.debug("[ContextMenu] No current row or cell for deletion");
    }
    return;
  }

  const table = currentRow.closest(".data-table");
  if (!table) {
    if (window.debug) {
      window.debug.debug("[ContextMenu] Could not find table for current row");
    }
    return;
  }

  // Store row reference to prevent it from being lost
  const rowToDelete = currentRow;
  const cellToReference = currentCell;

  // Get table name from the table ID or data attribute
  const tableId = table.id || "";
  const tableName = extractTableNameFromId(tableId);

  if (!tableName) {
    showDeleteError("Could not determine table name for deletion");
    return;
  }

  // Get row data for confirmation display
  const headers = table.querySelectorAll("thead th");
  const cells = rowToDelete.querySelectorAll("td");

  // Create JSON representation of the row
  const rowObject = {};
  for (let i = 0; i < headers.length && i < cells.length; i++) {
    const header = /** @type {HTMLTableHeaderCellElement} */ (headers[i]);
    const cell = /** @type {HTMLTableCellElement} */ (cells[i]);
    const columnName = getColumnHeaderText(header);
    const cellValue = getCellDisplayValue(cell);
    rowObject[columnName] = cellValue === "" ? null : cellValue;
  }

  // Use enhanced confirmation dialog with structured display
  showEnhancedConfirmDialog(
    "Are you sure you want to delete this row?",
    () => {
      if (window.debug) {
        window.debug.debug(
          "[ContextMenu] Delete confirmed, executing row deletion..."
        );
      }
      // Use the stored row reference instead of currentRow
      executeRowDeletion(tableName, rowToDelete);
    },
    tableName,
    rowObject
  );
}

/**
 * Execute the actual row deletion
 * @param {string} tableName - Name of the table
 * @param {HTMLTableRowElement} row - Row element to delete
 */
function executeRowDeletion(tableName, row) {
  if (window.debug) {
    window.debug.debug(
      `[ContextMenu] executeRowDeletion called with: ${tableName}, ${row}`
    );
  }

  if (!row) {
    if (window.debug) {
      window.debug.debug("[ContextMenu] No row provided for deletion");
    }
    return;
  }

  // Store the row reference for when the response comes back
  pendingDeleteRow = row;

  // Get row identifier for deletion
  const rowId = getRowIdentifier(row);

  if (!rowId) {
    showDeleteError("Could not identify row for deletion");
    return;
  }

  // Debug logging
  if (window.debug) {
    window.debug.debug(
      `[ContextMenu] Row identifier generated: ${JSON.stringify(rowId)}`
    );
  }

  // Show loading state
  showDeleteLoading();

  // Get current encryption key from state
  let currentState = {};
  let encryptionKey = "";

  try {
    if (typeof (/** @type {any} */ (window).getCurrentState) === "function") {
      currentState = window
        /** @type {any} */ .getCurrentState();
      encryptionKey = currentState.encryptionKey || "";
    }
  } catch (error) {
    if (window.debug) {
      window.debug.debug(`[ContextMenu] Could not get current state: ${error}`);
    }
  }

  // Send deletion request to extension
  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).vscode) !== "undefined"
  ) {
    const message = {
      type: "deleteRow",
      tableName: tableName,
      rowId: rowId,
      key: encryptionKey,
    };
    if (window.debug) {
      window.debug.debug(
        `[ContextMenu] Sending delete message to extension: ${JSON.stringify(
          message
        )}`
      );
    }
    /** @type {any} */ (window).vscode.postMessage(message);
  } else {
    if (window.debug) {
      window.debug.debug(
        "[ContextMenu] Cannot communicate with extension - vscode API not available"
      );
    }
    showDeleteError("Cannot communicate with extension");
  }
}

/**
 * Get row identifier for deletion (usually the primary key)
 * @param {HTMLTableRowElement} row - Row element
 * @returns {Object|null} Row identifier object
 */
function getRowIdentifier(row) {
  if (!row) {
    return null;
  }

  const table = row.closest(".data-table");
  if (!table) {
    return null;
  }

  // Get column headers to find primary key or row ID
  const headers = table.querySelectorAll("thead th");
  const cells = row.querySelectorAll("td");

  // Look for common primary key column names
  const primaryKeyColumns = ["id", "rowid", "_id", "pk"];

  for (let i = 0; i < headers.length && i < cells.length; i++) {
    const header = /** @type {HTMLTableHeaderCellElement} */ (headers[i]);
    const cell = /** @type {HTMLTableCellElement} */ (cells[i]);
    const columnName = getColumnHeaderText(header).toLowerCase();
    if (primaryKeyColumns.includes(columnName)) {
      const cellValue = getCellDisplayValue(cell);
      return {
        column: columnName,
        value: cellValue,
      };
    }
  }

  // If no primary key found, use all column values for identification
  const rowIdentifier = {};
  for (let i = 0; i < headers.length && i < cells.length; i++) {
    const header = /** @type {HTMLTableHeaderCellElement} */ (headers[i]);
    const cell = /** @type {HTMLTableCellElement} */ (cells[i]);
    const columnName = getColumnHeaderText(header);
    const cellValue = getCellDisplayValue(cell);
    rowIdentifier[columnName] = cellValue === "" ? null : cellValue;
  }

  return rowIdentifier;
}

/**
 * Extract table name from table ID
 * @param {string} tableId - Table ID
 * @returns {string|null} Table name
 */
function extractTableNameFromId(tableId) {
  if (!tableId) {
    return null;
  }

  // Table IDs are typically in format: "table-{tableName}-{timestamp}"
  const match = tableId.match(/^table-(.+?)-\d+$/);
  if (match) {
    return match[1];
  }

  // Alternative format: "table-{tableName}"
  const simpleMatch = tableId.match(/^table-(.+)$/);
  if (simpleMatch) {
    return simpleMatch[1];
  }

  return null;
}

/**
 * Show delete loading state
 */
function showDeleteLoading() {
  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).showSuccess) === "function"
  ) {
    /** @type {any} */ (window).showSuccess("Deleting row...");
  }
}

/**
 * Show delete success message
 */
function showDeleteSuccess() {
  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).showSuccess) === "function"
  ) {
    /** @type {any} */ (window).showSuccess("Row deleted successfully");
  }
}

/**
 * Show delete error message
 * @param {string} message - Error message
 */
function showDeleteError(message) {
  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).showError) === "function"
  ) {
    /** @type {any} */ (window).showError(message);
  } else {
    if (window.debug) {
      window.debug.debug(`[ContextMenu] Delete error: ${message}`);
    }
  }
}

/**
 * Handle successful row deletion
 * @param {Object} response - Response from extension
 */
function handleDeleteSuccess(response) {
  if (window.debug) {
    window.debug.debug(
      `[ContextMenu] handleDeleteSuccess called with: ${JSON.stringify(
        response
      )}`
    );
  }
  showDeleteSuccess();

  // Remove the row from the table using pendingDeleteRow
  if (pendingDeleteRow) {
    const table = pendingDeleteRow.closest(".data-table");
    if (window.debug) {
      window.debug.debug(
        `[ContextMenu] Removing row from table: ${pendingDeleteRow}`
      );
    }
    pendingDeleteRow.remove();

    // Update table statistics
    if (table) {
      updateTableStatistics(table);
    }
  } else {
    if (window.debug) {
      window.debug.debug(
        "[ContextMenu] No pendingDeleteRow found to remove from UI"
      );
    }
  }

  // Clear references
  pendingDeleteRow = null;
  currentRow = null;
  currentCell = null;
}

/**
 * Handle row deletion error
 * @param {Object} response - Error response from extension
 */
function handleDeleteError(response) {
  if (window.debug) {
    window.debug.debug(
      `[ContextMenu] handleDeleteError called with: ${JSON.stringify(response)}`
    );
  }
  showDeleteError(response.message || "Failed to delete row");

  // Clear pending delete row on error
  pendingDeleteRow = null;
}

/**
 * Update table statistics after row deletion
 * @param {HTMLTableElement} table - Table element
 */
function updateTableStatistics(table) {
  if (!table) {
    return;
  }

  const tableWrapper = table.closest(".enhanced-table-wrapper");
  if (!tableWrapper) {
    return;
  }

  // Update row count in table statistics
  const rows = table.querySelectorAll("tbody tr");
  const rowCount = rows.length;

  const recordsInfo = tableWrapper.querySelector(".records-info .stat-value");
  if (recordsInfo) {
    recordsInfo.textContent = rowCount.toLocaleString();
  }

  // Update pagination if needed
  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).updatePaginationControls) === "function"
  ) {
    // This would need to be implemented to handle pagination updates
    if (window.debug) {
      window.debug.debug("Row deleted, pagination may need updating");
    }
  }
}

/**
 * Show custom confirmation dialog
 * @param {string} message - Confirmation message
 * @param {Function} onConfirm - Callback for when user confirms
 */
function showCustomConfirmDialog(message, onConfirm) {
  // Create dialog elements
  const overlay = document.createElement("div");
  overlay.className = "confirm-dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "confirm-dialog";

  const messageEl = document.createElement("div");
  messageEl.className = "confirm-dialog-message";
  messageEl.textContent = message;

  const buttonsEl = document.createElement("div");
  buttonsEl.className = "confirm-dialog-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "confirm-dialog-btn confirm-dialog-btn-cancel";
  cancelBtn.textContent = "Cancel";

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "confirm-dialog-btn confirm-dialog-btn-confirm";
  confirmBtn.textContent = "Delete";

  buttonsEl.appendChild(cancelBtn);
  buttonsEl.appendChild(confirmBtn);

  dialog.appendChild(messageEl);
  dialog.appendChild(buttonsEl);
  overlay.appendChild(dialog);

  // Add event listeners
  const closeDialog = () => {
    overlay.remove();
  };

  cancelBtn.addEventListener("click", closeDialog);

  confirmBtn.addEventListener("click", () => {
    closeDialog();

    onConfirm();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeDialog();
    }
  });

  // Handle ESC key
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeDialog();
      document.removeEventListener("keydown", handleKeyDown);
    }
  };

  document.addEventListener("keydown", handleKeyDown);

  // Add to DOM
  document.body.appendChild(overlay);

  // Focus confirm button
  confirmBtn.focus();
}

/**
 * Show enhanced confirmation dialog with better formatting
 * @param {string} message - The confirmation message
 * @param {Function} onConfirm - Callback for when user confirms
 * @param {string} [tableName] - Optional table name
 * @param {Object} [rowData] - Optional row data object
 */
function showEnhancedConfirmDialog(message, onConfirm, tableName, rowData) {
  // Create dialog elements
  const overlay = document.createElement("div");
  overlay.className = "confirm-dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "confirm-dialog";

  // Title
  const titleEl = document.createElement("h3");
  titleEl.className = "confirm-dialog-title";
  titleEl.textContent = "Confirm Row Deletion";

  // Table info
  if (tableName) {
    const tableInfoEl = document.createElement("div");
    tableInfoEl.className = "confirm-dialog-table-info";
    tableInfoEl.textContent = `Table: ${tableName}`;
    dialog.appendChild(titleEl);
    dialog.appendChild(tableInfoEl);
  }

  // Warning message
  const warningEl = document.createElement("div");
  warningEl.className = "confirm-dialog-warning";
  warningEl.textContent =
    "⚠️ This action cannot be undone. The row will be permanently deleted from the database.";

  // Row data display
  if (rowData) {
    const rowDataEl = document.createElement("div");
    rowDataEl.className = "confirm-dialog-row-data";

    const jsonString = JSON.stringify(rowData, null, 2);
    const formattedJson = formatJsonWithSyntaxHighlighting(jsonString);
    rowDataEl.innerHTML = formattedJson;

    dialog.appendChild(warningEl);
    dialog.appendChild(rowDataEl);
  } else {
    // Fallback to simple message
    const messageEl = document.createElement("div");
    messageEl.className = "confirm-dialog-message";
    messageEl.textContent = message;
    dialog.appendChild(messageEl);
  }

  // Buttons
  const buttonsEl = document.createElement("div");
  buttonsEl.className = "confirm-dialog-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "confirm-dialog-btn confirm-dialog-btn-cancel";
  cancelBtn.textContent = "Cancel";

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "confirm-dialog-btn confirm-dialog-btn-confirm";
  confirmBtn.textContent = "Delete Row";

  buttonsEl.appendChild(cancelBtn);
  buttonsEl.appendChild(confirmBtn);
  dialog.appendChild(buttonsEl);
  overlay.appendChild(dialog);

  // Add event listeners
  const closeDialog = () => {
    overlay.remove();
  };

  cancelBtn.addEventListener("click", closeDialog);

  confirmBtn.addEventListener("click", () => {
    closeDialog();
    onConfirm();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeDialog();
    }
  });

  // Handle escape key
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      closeDialog();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);

  // Add to page and focus
  document.body.appendChild(overlay);
  confirmBtn.focus();
}

/**
 * Get foreign key information for a cell
 * @param {HTMLElement} cell - The table cell element
 * @returns {Object|null} Foreign key info with table, column, and value
 */
function getForeignKeyInfoForCell(cell) {
  if (!cell || !cell.classList.contains("fk-cell")) {
    return null;
  }

  // Get the cell value
  const cellValue = getCellDisplayValue(cell);
  if (!cellValue || cellValue === "NULL" || cellValue === "") {
    return null;
  }

  // Get the column name from the cell's data attributes
  const columnName = cell.dataset.columnName;
  if (!columnName) {
    return null;
  }

  const referencedTable = cell.dataset.fkTable;
  const referencedColumn = cell.dataset.fkColumn;

  // Only return info if both referencedTable and referencedColumn are present
  if (!columnName || !referencedTable || !referencedColumn) {
    return null;
  }

  return {
    columnName: columnName,
    value: cellValue,
    referencedTable: referencedTable,
    referencedColumn: referencedColumn,
  };
}

/**
 * Navigate to the referenced row in a foreign key relationship
 */
function navigateToForeignKeyReference() {
  if (!currentCell) {
    return;
  }

  const foreignKeyInfo = getForeignKeyInfoForCell(currentCell);
  if (!foreignKeyInfo) {
    if (typeof showError === "function") {
      showError(
        "Cannot navigate: Foreign key information is missing or incomplete for this cell."
      );
    }
    return;
  }

  // Send message to extension to execute a query for the referenced row in the referenced table
  if (window.vscode && typeof window.vscode.postMessage === "function") {
    // Generate a SQL query to find rows in the referenced table that match this foreign key value
    // Handle different data types appropriately for SQL
    let queryValue = foreignKeyInfo.value;
    let formattedValue;

    // Check if the value is numeric (integer or float)
    if (!isNaN(queryValue) && !isNaN(parseFloat(queryValue))) {
      // Numeric values don't need quotes
      formattedValue = queryValue;
    } else {
      // String values need to be properly escaped and quoted
      // Escape single quotes by doubling them (SQL standard)
      formattedValue = `'${queryValue.replace(/'/g, "''")}'`;
    }

    const query = `SELECT * FROM "${foreignKeyInfo.referencedTable}" WHERE "${foreignKeyInfo.referencedColumn}" = ${formattedValue} LIMIT 100;`;

    // Execute the query to create a new query results tab
    window.vscode.postMessage({
      type: "executeQuery",
      query: query,
      key: getCurrentEncryptionKey(),
    });

    // Don't switch tabs immediately - let the query result handler manage the tab switching
    // The displayQueryResults function will create the new tab and switch to it automatically

    // Show success message
    if (typeof showSuccess === "function") {
      showSuccess(
        `Querying ${foreignKeyInfo.referencedTable} for ${foreignKeyInfo.referencedColumn} = ${queryValue}...`
      );
    }
  }
}

/**
 * Get current encryption key from state
 * @returns {string|undefined} Current encryption key
 */
function getCurrentEncryptionKey() {
  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).getCurrentState) === "function"
  ) {
    const state = window
      /** @type {any} */ .getCurrentState();
    return state.encryptionKey;
  }
  return undefined;
}

/**
 * Store foreign key reference information for highlighting
 * @param {Object} foreignKeyInfo - Foreign key information
 */
function storeForeignKeyReference(foreignKeyInfo) {
  if (typeof window !== "undefined") {
    window.pendingForeignKeyHighlight = foreignKeyInfo;
  }
}

/**
 * Highlight foreign key target row after navigation
 * @param {Element} tableWrapper - Table wrapper element
 */
function highlightForeignKeyTarget(tableWrapper) {
  if (typeof window === "undefined" || !window.pendingForeignKeyHighlight) {
    return;
  }

  const foreignKeyInfo = window.pendingForeignKeyHighlight;
  const wrapper =
    tableWrapper && tableWrapper.classList && tableWrapper.classList.contains("enhanced-table-wrapper")
      ? tableWrapper
      : tableWrapper && tableWrapper.querySelector
      ? tableWrapper.querySelector(".enhanced-table-wrapper") || tableWrapper.closest(".enhanced-table-wrapper")
      : null;

  const table = (wrapper || tableWrapper).querySelector(".data-table");

  if (!table) {
    return;
  }

  // Find the column index for the referenced column
  const headers = table.querySelectorAll("thead th");
  let targetColumnIndex = -1;

  for (let i = 0; i < headers.length; i++) {
    const headerText = getColumnHeaderText
      ? getColumnHeaderText(headers[i])
      : headers[i].textContent.trim();
    if (headerText === foreignKeyInfo.referencedColumn) {
      targetColumnIndex = i;
      break;
    }
  }

  if (targetColumnIndex === -1) {
    return;
  }

  // If the table is virtualized, search the in-memory rows and scroll to the match
  // so the row is actually rendered before we try to highlight it.
  /** @type {any} */ const vs = wrapper && wrapper.__virtualTableState;
  if (vs && vs.enabled === true) {
    const desired = String(foreignKeyInfo.value ?? "").trim();
    let pos = -1;
    for (let i = 0; i < (vs.order || []).length; i++) {
      const sourceIndex = vs.order[i];
      const row = vs.pageData[sourceIndex];
      const cell = Array.isArray(row) ? row[targetColumnIndex] : null;
      const cellText = String(cell ?? "").trim();
      if (cellText === desired) {
        pos = i;
        break;
      }
    }

    if (pos !== -1) {
      const scrollContainer = wrapper.querySelector(".table-scroll-container");
      if (scrollContainer && Array.isArray(vs.prefix) && vs.prefix[pos] !== undefined) {
        scrollContainer.scrollTop = Math.max(0, Math.floor(vs.prefix[pos]));
        if (typeof window.refreshVirtualTable === "function") {
          window.refreshVirtualTable(wrapper);
        }
      }
    }
  }

  // Find the row with the matching value
  const rows = table.querySelectorAll("tbody tr");
  let targetRow = null;

  for (const row of rows) {
    const cell = row.cells[targetColumnIndex];
    if (cell) {
      const cellValue = getCellDisplayValue
        ? getCellDisplayValue(cell)
        : cell.textContent.trim();
      if (cellValue === foreignKeyInfo.value) {
        targetRow = row;
        break;
      }
    }
  }

  if (targetRow) {
    // Highlight the target row
    targetRow.classList.add("fk-target-row");

    // Use enhanced scrolling function
    scrollToTargetRow(targetRow);

    // Add a pulsing animation for better visibility
    let pulseCount = 0;
    const pulseInterval = setInterval(() => {
      if (targetRow.style) {
        targetRow.style.transform =
          pulseCount % 2 === 0 ? "scale(1.02)" : "scale(1)";
      }
      pulseCount++;
      if (pulseCount >= 6) {
        clearInterval(pulseInterval);
        if (targetRow.style) {
          targetRow.style.transform = "";
        }
      }
    }, 300);

    // Remove highlight after a few seconds
    setTimeout(() => {
      targetRow.classList.remove("fk-target-row");
    }, 4000);

    if (typeof showSuccess === "function") {
      showSuccess(
        `Found row with ${foreignKeyInfo.referencedColumn} = ${foreignKeyInfo.value}`
      );
    }
  } else {
    if (typeof showError === "function") {
      showError(
        `Row with ${foreignKeyInfo.referencedColumn} = ${foreignKeyInfo.value} not found`
      );
    }
  }

  // Clear the pending highlight
  delete window.pendingForeignKeyHighlight;
}

/**
 * Scroll to target row with enhanced visibility
 * @param {Element} targetRow - The row to scroll to
 */
function scrollToTargetRow(targetRow) {
  if (!targetRow) {
    return;
  }

  // Get the table container
  const tableWrapper = targetRow.closest(".enhanced-table-wrapper");
  const tableContainer = tableWrapper?.querySelector(".table-container");

  if (tableContainer) {
    // Calculate the position of the target row relative to the container
    const rowRect = targetRow.getBoundingClientRect();
    const containerRect = tableContainer.getBoundingClientRect();

    // Check if we need to scroll
    const isRowVisible =
      rowRect.top >= containerRect.top &&
      rowRect.bottom <= containerRect.bottom;

    if (!isRowVisible) {
      // Calculate scroll position to center the row
      const rowOffsetTop = targetRow.offsetTop || 0;
      const containerScrollTop = tableContainer.scrollTop;
      const containerHeight = tableContainer.clientHeight;

      // Center the row in the container
      const targetScrollTop = rowOffsetTop - containerHeight / 2;

      // Smooth scroll to the target position
      tableContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: "smooth",
      });
    }
  }

  // Also ensure the table wrapper is visible in the main viewport
  setTimeout(() => {
    const tableRect = tableWrapper?.getBoundingClientRect();
    if (
      tableRect &&
      (tableRect.top < 0 || tableRect.bottom > window.innerHeight)
    ) {
      tableWrapper.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    }

    // Finally, ensure the row is visible
    setTimeout(() => {
      targetRow.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }, 200);
  }, 100);
}

// Make functions available globally
if (typeof window !== "undefined") {
  /** @type {any} */ (window).initializeContextMenu = initializeContextMenu;
  /** @type {any} */ (window).hideContextMenu = hideContextMenu;
  /** @type {any} */ (window).showContextMenu = showContextMenuForCell;
  /** @type {any} */ (window).copyCellValue = copyCellValue;
  /** @type {any} */ (window).copyRowData = copyRowData;
  /** @type {any} */ (window).copyRowDataAsJSON = copyRowDataAsJSON;
  /** @type {any} */ (window).copyColumnData = copyColumnData;
  /** @type {any} */ (window).copyTableDataAsJSON = copyTableDataAsJSON;
  /** @type {any} */ (window).deleteRowWithConfirmation =
    deleteRowWithConfirmation;
  /** @type {any} */ (window).showCustomConfirmDialog = showCustomConfirmDialog;
  /** @type {any} */ (window).showEnhancedConfirmDialog =
    showEnhancedConfirmDialog;
  /** @type {any} */ (window).handleDeleteSuccess = handleDeleteSuccess;
  /** @type {any} */ (window).handleDeleteError = handleDeleteError;
  /** @type {any} */ (window).highlightForeignKeyTarget =
    highlightForeignKeyTarget;
  /** @type {any} */ (window).scrollToTargetRow = scrollToTargetRow;
}
