// @ts-check

/**
 * Column and row resizing functionality
 */

// Resizing state
let isResizing = false;
let currentResizeTarget = null;
let currentResizeType = null;
let startX = 0;
let startY = 0;
let startWidth = 0;
let startHeight = 0;

/**
 * Initialize resizing functionality for a table
 * @param {Element} tableWrapper - Table wrapper element
 */
function initializeResizing(tableWrapper) {
  if (!tableWrapper) {
    return;
  }

  // Column resize handles
  const columnResizeHandles = tableWrapper.querySelectorAll(
    ".column-resize-handle"
  );
  columnResizeHandles.forEach((handle) => {
    handle.addEventListener("mousedown", startColumnResize);
  });

  // Row resize using pseudo-elements - attach to the rows themselves
  const rows = tableWrapper.querySelectorAll(".resizable-row");
  rows.forEach((row) => {
    row.addEventListener("mousedown", handleRowResizeStart);
  });

  // Column resize on table cells - attach to all data cells
  const dataCells = tableWrapper.querySelectorAll(".data-table td");
  dataCells.forEach((cell) => {
    cell.addEventListener("mousedown", handleCellColumnResizeStart);
  });

  // Global mouse events (add only once)
  if (!document.body.hasAttribute("data-resize-listeners")) {
    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", endResize);
    document.body.setAttribute("data-resize-listeners", "true");
  }
}

/**
 * Handle row resize start detection
 * @param {MouseEvent} e - Mouse event
 */
function handleRowResizeStart(e) {
  // Check if the click is in the bottom resize area (last 10px of row)
  const target = /** @type {HTMLElement} */ (e.currentTarget);
  if (!target) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const clickY = e.clientY;
  const rowBottom = rect.bottom;

  // Only trigger resize if clicking in the bottom resize area
  if (clickY > rowBottom - 10) {
    startRowResize(e);
  }
}

/**
 * Start column resize
 * @param {MouseEvent} e - Mouse event
 */
function startColumnResize(e) {
  e.preventDefault();
  e.stopPropagation();

  isResizing = true;
  currentResizeType = "column";
  startX = e.clientX;

  const target = /** @type {HTMLElement} */ (e.target);
  if (!target) {
    return;
  }

  const columnIndex = parseInt(target.dataset.column || "0");
  const table = target.closest(".data-table");
  const header = table?.querySelector(`th[data-column="${columnIndex}"]`);

  if (header) {
    currentResizeTarget = /** @type {HTMLElement} */ (header);
    startWidth = header.offsetWidth;

    // Add visual feedback
    document.body.style.cursor = "col-resize";
    header.classList.add("resizing");

    console.log("Started column resize:", columnIndex, startWidth);
  }
}

/**
 * Start row resize
 * @param {MouseEvent} e - Mouse event
 */
function startRowResize(e) {
  e.preventDefault();
  e.stopPropagation();

  isResizing = true;
  currentResizeType = "row";
  startY = e.clientY;

  const row = e.currentTarget;
  const rowIndex = parseInt(row.dataset.rowIndex);

  currentResizeTarget = row;
  startHeight = row.offsetHeight;

  // Add visual feedback
  document.body.style.cursor = "row-resize";
  row.classList.add("resizing");

  console.log("Started row resize:", rowIndex, startHeight);
}

/**
 * Handle resize during mouse movement
 * @param {MouseEvent} e - Mouse event
 */
function handleResize(e) {
  if (!isResizing || !currentResizeTarget) {
    return;
  }

  e.preventDefault();

  if (currentResizeType === "column") {
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + deltaX); // Minimum width of 50px

    // Set explicit width on the header
    currentResizeTarget.style.width = newWidth + "px";
    currentResizeTarget.style.minWidth = newWidth + "px";

    // Update corresponding cells in the same column
    const columnIndex = currentResizeTarget.dataset.column;
    const table = currentResizeTarget.closest(".data-table");
    const cells = table.querySelectorAll(`td[data-column="${columnIndex}"]`);
    cells.forEach((cell) => {
      cell.style.width = newWidth + "px";
      cell.style.minWidth = newWidth + "px";
    });

    // Update CSS custom property for pinned column positioning
    if (currentResizeTarget.classList.contains("pinned")) {
      const pinnedIndex = Array.from(
        table.querySelectorAll("th.pinned")
      ).indexOf(currentResizeTarget);
      if (pinnedIndex === 0) {
        table.style.setProperty("--pinned-column-1-width", newWidth + "px");
      } else if (pinnedIndex === 1) {
        table.style.setProperty("--pinned-column-2-width", newWidth + "px");
      }
    }
  } else if (currentResizeType === "row") {
    const deltaY = e.clientY - startY;
    const newHeight = Math.max(25, startHeight + deltaY); // Minimum height of 25px

    currentResizeTarget.style.height = newHeight + "px";
    currentResizeTarget.style.minHeight = newHeight + "px";

    // Update all cells in the row
    const cells = currentResizeTarget.querySelectorAll("td");
    cells.forEach((cell) => {
      cell.style.height = newHeight + "px";
      cell.style.minHeight = newHeight + "px";
    });
  }
}

/**
 * End resize operation
 * @param {MouseEvent} e - Mouse event
 */
function endResize(e) {
  if (!isResizing) {
    return;
  }

  isResizing = false;
  document.body.style.cursor = "";

  if (currentResizeTarget) {
    currentResizeTarget.classList.remove("resizing");

    // Show success message
    const resizeType = currentResizeType === "column" ? "Column" : "Row";
    if (typeof showSuccess !== "undefined") {
      showSuccess(`${resizeType} resized successfully`);
    }
  }

  currentResizeTarget = null;
  currentResizeType = null;
}

/**
 * Initialize table layout with proper column widths
 * @param {Element} tableWrapper - Table wrapper element
 */
function initializeTableLayout(tableWrapper) {
  if (!tableWrapper) {
    return;
  }

  const table = tableWrapper.querySelector(".data-table");
  if (!table) {
    return;
  }

  // Set initial column widths based on content
  const headers = table.querySelectorAll("th");
  headers.forEach((header, index) => {
    // Get the maximum content width for this column
    const columnCells = table.querySelectorAll(`td[data-column="${index}"]`);
    let maxWidth = header.offsetWidth;

    columnCells.forEach((cell) => {
      const cellWidth = cell.scrollWidth;
      if (cellWidth > maxWidth) {
        maxWidth = cellWidth;
      }
    });

    // Set a reasonable minimum width
    const finalWidth = Math.max(120, Math.min(maxWidth + 20, 300));

    header.style.width = finalWidth + "px";
    header.style.minWidth = finalWidth + "px";

    columnCells.forEach((cell) => {
      cell.style.width = finalWidth + "px";
      cell.style.minWidth = finalWidth + "px";
    });
  });

  // Update pinned column positions if any exist
  const pinnedHeaders = table.querySelectorAll("th.pinned");
  if (pinnedHeaders.length > 0) {
    updatePinnedColumnPositions(table);
  }
}

/**
 * Update positions of pinned columns
 * @param {Element} table - Table element
 */
function updatePinnedColumnPositions(table) {
  const pinnedHeaders = table.querySelectorAll("th.pinned");
  let cumulativeWidth = 0;

  pinnedHeaders.forEach((header, index) => {
    const columnIndex = header.dataset.column;
    const width = header.offsetWidth;

    // Set left position for this pinned column
    header.style.left = cumulativeWidth + "px";

    // Update all cells in this column
    table
      .querySelectorAll(`td[data-column="${columnIndex}"].pinned`)
      .forEach((cell) => {
        cell.style.left = cumulativeWidth + "px";
      });

    cumulativeWidth += width;
  });
}

/**
 * Add resize observer for dynamic content adjustments
 * @param {Element} tableWrapper - Table wrapper element
 */
function addResizeObserver(tableWrapper) {
  if (!tableWrapper || !window.ResizeObserver) {
    return;
  }

  const table = tableWrapper.querySelector(".data-table");
  if (!table) {
    return;
  }

  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      // Update pinned column positions when table size changes
      const pinnedHeaders = table.querySelectorAll("th.pinned");
      if (pinnedHeaders.length > 0) {
        updatePinnedColumnPositions(table);
      }
    });
  });

  resizeObserver.observe(table);

  // Store observer for cleanup if needed
  tableWrapper.resizeObserver = resizeObserver;
}

/**
 * Handle column resize start from table cells
 * @param {MouseEvent} e - Mouse event
 */
function handleCellColumnResizeStart(e) {
  if (!(e instanceof MouseEvent)) {
    return;
  }

  // Check if the click is in the right resize area (last 6px of cell)
  const target = /** @type {HTMLElement} */ (e.currentTarget);
  if (!target) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const clickX = e.clientX;
  const cellRight = rect.right;

  // Only trigger resize if clicking in the right resize area
  if (clickX > cellRight - 6) {
    // Find the column index from the cell's data-column attribute
    const columnIndex = parseInt(target.dataset.column || "0");
    const table = target.closest(".data-table");
    const header = /** @type {HTMLElement} */ (
      table?.querySelector(`th[data-column="${columnIndex}"]`)
    );

    if (header) {
      e.preventDefault();
      e.stopPropagation();

      isResizing = true;
      currentResizeType = "column";
      startX = e.clientX;

      currentResizeTarget = header;
      startWidth = header.offsetWidth;

      // Add visual feedback
      document.body.style.cursor = "col-resize";
      header.classList.add("resizing");

      console.log("Started column resize from cell:", columnIndex, startWidth);
    }
  }
}

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    initializeResizing,
    initializeTableLayout,
    updatePinnedColumnPositions,
    addResizeObserver,
  };
}
