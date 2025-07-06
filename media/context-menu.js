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

  console.log("Context menu initialized");
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

  // Don't show context menu on schema or query result tables (read-only)
  const table = cell.closest(".data-table");
  const tableWrapper = table?.closest(".enhanced-table-wrapper");
  const tableId = table?.id;

  if (tableId && (tableId.includes("schema") || tableId.includes("query"))) {
    // Allow default context menu for read-only tables
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
  showContextMenu(e.clientX, e.clientY);
}

/**
 * Show context menu at specified coordinates
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function showContextMenu(x, y) {
  if (!contextMenu) {
    return;
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
    default:
      console.log("Unknown context menu action:", action);
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
  const rowData = Array.from(cells).map((cell) => getCellDisplayValue(cell));
  const rowText = rowData.join("\t"); // Tab-separated values

  copyToClipboard(rowText, "Row data copied");
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

  const columnIndex = currentCell.cellIndex;
  const rows = table.querySelectorAll("tbody tr");

  // Get column header
  const header = table.querySelector(`thead th:nth-child(${columnIndex + 1})`);
  const headerText = header
    ? getColumnHeaderText(header)
    : `Column ${columnIndex + 1}`;

  // Get all cell values in the column
  const columnData = [headerText];
  rows.forEach((row) => {
    const cell = row.cells[columnIndex];
    if (cell) {
      columnData.push(getCellDisplayValue(cell));
    }
  });

  const columnText = columnData.join("\n");
  copyToClipboard(columnText, "Column data copied");
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
  const rowData = Array.from(cells).map((cell) => {
    const value = getCellDisplayValue(cell);
    // Convert empty strings back to null for JSON representation
    return value === "" ? null : value;
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
  copyToClipboard(jsonString, "Row data copied as JSON");
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

  // Get column headers
  const headers = table.querySelectorAll("thead th");
  const columnNames = Array.from(headers).map((header) =>
    getColumnHeaderText(header)
  );

  // Get all rows
  const rows = table.querySelectorAll("tbody tr");
  const tableData = [];

  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    const rowData = Array.from(cells).map((cell) => {
      const value = getCellDisplayValue(cell);
      // Convert empty strings back to null for JSON representation
      return value === "" ? null : value;
    });

    // Create row object
    const rowObject = {};
    columnNames.forEach((columnName, index) => {
      if (index < rowData.length) {
        rowObject[columnName] = rowData[index];
      }
    });

    tableData.push(rowObject);
  });

  // Convert to formatted JSON
  const jsonString = JSON.stringify(tableData, null, 2);
  copyToClipboard(
    jsonString,
    `Table data copied as JSON (${tableData.length} rows)`
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
        console.error("Failed to copy to clipboard:", err);
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
    console.error("Failed to copy to clipboard:", err);
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
    console.log(message);
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
    console.error("Failed to copy to clipboard");
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
    const rows = table.querySelectorAll("tbody tr");
    if (rows.length > 1) {
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
    console.error("No current row or cell for deletion");
    return;
  }

  const table = currentRow.closest(".data-table");
  if (!table) {
    console.error("Could not find table for current row");
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
  const cells = rowToDelete.querySelectorAll("td");
  const rowData = Array.from(cells).map((cell) => getCellDisplayValue(cell));
  const firstCellValue = rowData[0] || "Unknown";

  // Show confirmation dialog
  const confirmMessage = `Are you sure you want to delete this row?\n\nTable: ${tableName}\nFirst cell: ${firstCellValue}\n\nThis action cannot be undone.`;

  // Use custom confirmation dialog since VS Code webviews may restrict native confirm()
  showCustomConfirmDialog(confirmMessage, () => {
    console.log("Delete confirmed, executing row deletion...");
    // Use the stored row reference instead of currentRow
    executeRowDeletion(tableName, rowToDelete);
  });
}

/**
 * Execute the actual row deletion
 * @param {string} tableName - Name of the table
 * @param {HTMLTableRowElement} row - Row element to delete
 */
function executeRowDeletion(tableName, row) {
  console.log("executeRowDeletion called with:", tableName, row);

  if (!row) {
    console.error("No row provided for deletion");
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
  console.log("Row identifier generated:", rowId);

  // Show loading state
  showDeleteLoading();

  // Get current encryption key from state
  let currentState = {};
  let encryptionKey = "";

  try {
    if (typeof (/** @type {any} */ (window).getCurrentState) === "function") {
      currentState = (window)
        /** @type {any} */ .getCurrentState();
      encryptionKey = currentState.encryptionKey || "";
    }
  } catch (error) {
    console.warn("Could not get current state:", error);
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
    console.log("Sending delete message to extension:", message);
    /** @type {any} */ (window).vscode.postMessage(message);
  } else {
    console.error(
      "Cannot communicate with extension - vscode API not available"
    );
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
    console.error("Delete error:", message);
  }
}

/**
 * Handle successful row deletion
 * @param {Object} response - Response from extension
 */
function handleDeleteSuccess(response) {
  console.log("handleDeleteSuccess called with:", response);
  showDeleteSuccess();

  // Remove the row from the table using pendingDeleteRow
  if (pendingDeleteRow) {
    const table = pendingDeleteRow.closest(".data-table");
    console.log("Removing row from table:", pendingDeleteRow);
    pendingDeleteRow.remove();

    // Update table statistics
    if (table) {
      updateTableStatistics(table);
    }
  } else {
    console.warn("No pendingDeleteRow found to remove from UI");
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
  console.log("handleDeleteError called with:", response);
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
    console.log("Row deleted, pagination may need updating");
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
    console.log("Delete button clicked in confirmation dialog");
    closeDialog();
    console.log("About to call onConfirm callback");
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

// Make functions available globally
if (typeof window !== "undefined") {
  /** @type {any} */ (window).initializeContextMenu = initializeContextMenu;
  /** @type {any} */ (window).hideContextMenu = hideContextMenu;
  /** @type {any} */ (window).copyCellValue = copyCellValue;
  /** @type {any} */ (window).copyRowData = copyRowData;
  /** @type {any} */ (window).copyRowDataAsJSON = copyRowDataAsJSON;
  /** @type {any} */ (window).copyColumnData = copyColumnData;
  /** @type {any} */ (window).copyTableDataAsJSON = copyTableDataAsJSON;
  /** @type {any} */ (window).deleteRowWithConfirmation =
    deleteRowWithConfirmation;
  /** @type {any} */ (window).showCustomConfirmDialog = showCustomConfirmDialog;
  /** @type {any} */ (window).handleDeleteSuccess = handleDeleteSuccess;
  /** @type {any} */ (window).handleDeleteError = handleDeleteError;
}
