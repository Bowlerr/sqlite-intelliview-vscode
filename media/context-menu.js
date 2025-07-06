// @ts-check

/**
 * Context menu functionality for table cells
 * Provides right-click context menu with copy cell and copy row options
 */

let contextMenu = null;
let currentCell = null;
let currentRow = null;

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
    <div class="context-menu-separator"></div>
    <div class="context-menu-item" data-action="copy-column">
      <span class="icon">🗂️</span>
      <span>Copy Column</span>
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
    case "copy-column":
      copyColumnData();
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
  const actions = ["copy-cell", "copy-row"];

  // Add copy column action if we have multiple rows
  const table = cell.closest(".data-table");
  if (table) {
    const rows = table.querySelectorAll("tbody tr");
    if (rows.length > 1) {
      actions.push("copy-column");
    }
  }

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

// Make functions available globally
if (typeof window !== "undefined") {
  /** @type {any} */ (window).initializeContextMenu = initializeContextMenu;
  /** @type {any} */ (window).hideContextMenu = hideContextMenu;
  /** @type {any} */ (window).copyCellValue = copyCellValue;
  /** @type {any} */ (window).copyRowData = copyRowData;
  /** @type {any} */ (window).copyColumnData = copyColumnData;
}
