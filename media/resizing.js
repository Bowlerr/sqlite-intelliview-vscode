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
const AUTO_SCROLL_EDGE = 24;
const AUTO_SCROLL_STEP = 16;
const USE_POINTER_EVENTS =
  typeof window !== "undefined" && "PointerEvent" in window;
let activePointerId = null;
let activePointerTarget = null;

function captureResizePointer(e, target) {
  if (!(e instanceof PointerEvent)) {
    return;
  }
  if (!target || !(target instanceof HTMLElement)) {
    return;
  }
  try {
    target.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    activePointerTarget = target;
  } catch (_) {
    // ignore pointer capture errors
  }
}

function releaseResizePointer() {
  if (
    activePointerTarget &&
    activePointerTarget instanceof HTMLElement &&
    activePointerId !== null &&
    typeof activePointerTarget.releasePointerCapture === "function"
  ) {
    try {
      activePointerTarget.releasePointerCapture(activePointerId);
    } catch (_) {
      // ignore pointer release errors
    }
  }
  activePointerId = null;
  activePointerTarget = null;
}

function maybeAutoScrollForResize(e, table) {
  if (!table || !(table instanceof HTMLElement)) {
    return;
  }
  const scrollContainer = table.closest(".table-scroll-container");
  if (!scrollContainer || !(scrollContainer instanceof HTMLElement)) {
    return;
  }

  const rect = scrollContainer.getBoundingClientRect();
  let delta = 0;
  if (e.clientX >= rect.right - AUTO_SCROLL_EDGE) {
    const prev = scrollContainer.scrollLeft;
    const max = Math.max(
      0,
      scrollContainer.scrollWidth - scrollContainer.clientWidth
    );
    scrollContainer.scrollLeft = Math.min(max, prev + AUTO_SCROLL_STEP);
    delta = scrollContainer.scrollLeft - prev;
    if (delta > 0) {
      startX -= delta;
    }
  } else if (e.clientX <= rect.left + AUTO_SCROLL_EDGE) {
    const prev = scrollContainer.scrollLeft;
    scrollContainer.scrollLeft = Math.max(0, prev - AUTO_SCROLL_STEP);
    delta = prev - scrollContainer.scrollLeft;
    if (delta > 0) {
      startX += delta;
    }
  }
}

/**
 * Initialize resizing functionality for a table
 * @param {Element} tableWrapper - Table wrapper element
 */
function initializeResizing(tableWrapper) {
  if (!tableWrapper) {
    return;
  }

  // Delegated listener (significantly faster than attaching to every cell/row).
  const wrapperEl = /** @type {HTMLElement} */ (tableWrapper);
  if (wrapperEl.getAttribute("data-resize-delegated") !== "true") {
    wrapperEl.setAttribute("data-resize-delegated", "true");
    const downEvent = USE_POINTER_EVENTS ? "pointerdown" : "mousedown";
    wrapperEl.addEventListener(downEvent, (e) => {
      if (!(e instanceof MouseEvent)) {
        return;
      }

      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target) {
        return;
      }

      const handle = target.closest(".column-resize-handle");
      if (handle && handle instanceof HTMLElement) {
        startColumnResizeFromHandle(e, handle);
        return;
      }

      const row = target.closest("tr.resizable-row");
      if (row && row instanceof HTMLElement) {
        const rect = row.getBoundingClientRect();
        if (e.clientY > rect.bottom - 10) {
          startRowResizeFromRow(e, row);
          return;
        }
      }

      const cell = target.closest("td[data-column]");
      if (cell && cell instanceof HTMLElement) {
        const rect = cell.getBoundingClientRect();
        if (e.clientX > rect.right - 6) {
          startColumnResizeFromCell(e, cell);
        }
      }
    });
  }

  // Global mouse events (add only once)
  if (!document.body.hasAttribute("data-resize-listeners")) {
    if (USE_POINTER_EVENTS) {
      document.addEventListener("pointermove", handleResize);
      document.addEventListener("pointerup", endResize);
      document.addEventListener("pointercancel", endResize);
    } else {
      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", endResize);
    }
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
  captureResizePointer(e, target);

  const columnIndex = parseInt(target.dataset.column || "0");
  const table = target.closest(".data-table");
  const header = table?.querySelector(`th[data-column="${columnIndex}"]`);

  if (header) {
    captureResizePointer(e, handleEl);
    currentResizeTarget = /** @type {HTMLElement} */ (header);
    startWidth = header.offsetWidth;

    // Add visual feedback
    document.body.style.cursor = "col-resize";
    header.classList.add("resizing");

    if (window.debug) {
      window.debug.debug(
        `Started column resize: ${columnIndex}, ${startWidth}`
      );
    }
  }
}

function startColumnResizeFromHandle(e, handleEl) {
  e.preventDefault();
  e.stopPropagation();

  isResizing = true;
  currentResizeType = "column";
  startX = e.clientX;

  const columnIndex = parseInt(handleEl.dataset.column || "0");
  const table = handleEl.closest(".data-table");
  const header = table?.querySelector(`th[data-column="${columnIndex}"]`);

  if (header) {
    currentResizeTarget = /** @type {HTMLElement} */ (header);
    startWidth = header.offsetWidth;

    document.body.style.cursor = "col-resize";
    currentResizeTarget.classList.add("resizing");

    if (window.debug) {
      window.debug.debug(
        `Started column resize (delegated): ${columnIndex}, ${startWidth}`
      );
    }
  }
}

function startRowResizeFromRow(e, rowEl) {
  e.preventDefault();
  e.stopPropagation();
  captureResizePointer(e, rowEl);

  isResizing = true;
  currentResizeType = "row";
  startY = e.clientY;

  currentResizeTarget = rowEl;
  startHeight = rowEl.offsetHeight;

  document.body.style.cursor = "row-resize";
  rowEl.classList.add("resizing");

  if (window.debug) {
    const rowIndex = parseInt(rowEl.dataset.rowIndex || "0", 10);
    window.debug.debug(
      `Started row resize (delegated): ${rowIndex}, ${startHeight}`
    );
  }
}

function startColumnResizeFromCell(e, cellEl) {
  const columnIndex = parseInt(cellEl.dataset.column || "0");
  const table = cellEl.closest(".data-table");
  const header = /** @type {HTMLElement} */ (
    table?.querySelector(`th[data-column="${columnIndex}"]`)
  );

  if (!header) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  captureResizePointer(e, cellEl);

  isResizing = true;
  currentResizeType = "column";
  startX = e.clientX;

  currentResizeTarget = header;
  startWidth = header.offsetWidth;

  document.body.style.cursor = "col-resize";
  header.classList.add("resizing");
  if (table) {
    table.classList.add("resizing");
  }

  if (window.debug) {
    window.debug.debug(
      `Started column resize from cell (delegated): ${columnIndex}, ${startWidth}`
    );
  }
}

/**
 * Start row resize
 * @param {MouseEvent} e - Mouse event
 */
function startRowResize(e) {
  e.preventDefault();
  e.stopPropagation();
  captureResizePointer(e, /** @type {HTMLElement} */ (e.currentTarget));

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

  if (window.debug) {
    window.debug.debug(`Started row resize: ${rowIndex}, ${startHeight}`);
  }
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
    const table = currentResizeTarget.closest(".data-table");
    if (table && (e instanceof MouseEvent || e instanceof PointerEvent)) {
      maybeAutoScrollForResize(e, table);
    }
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + deltaX); // Minimum width of 50px

    // Set explicit width on the header
    currentResizeTarget.style.width = newWidth + "px";
    currentResizeTarget.style.minWidth = newWidth + "px";

    // Prefer <colgroup> to apply widths without touching every cell (much faster).
    const columnIndex = currentResizeTarget.dataset.column;
    if (table && columnIndex) {
      const col = table.querySelector(`colgroup col[data-column="${columnIndex}"]`);
      if (col && col instanceof HTMLElement) {
        col.style.width = newWidth + "px";
        col.style.maxWidth = "none";
      }
    }

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

    if (table && typeof window.updateTableWidthFromCols === "function") {
      window.updateTableWidthFromCols(table);
    }
  } else if (currentResizeType === "row") {
    const deltaY = e.clientY - startY;
    const newHeight = Math.max(25, startHeight + deltaY); // Minimum height of 25px

    currentResizeTarget.style.height = newHeight + "px";
    currentResizeTarget.style.minHeight = newHeight + "px";
    if (typeof window.updateRowMultilineForRow === "function") {
      window.updateRowMultilineForRow(currentResizeTarget, newHeight);
    }
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
  releaseResizePointer();
  document.body.style.cursor = "";

  if (currentResizeTarget) {
    currentResizeTarget.classList.remove("resizing");

    // Remove resizing class from table
    const table = currentResizeTarget.closest(".data-table");
    if (table) {
      table.classList.remove("resizing");
    }

    // Persist sizing to per-tab viewState (best-effort)
    try {
      const tableWrapper = currentResizeTarget.closest(".enhanced-table-wrapper");
      const tabKey =
        tableWrapper &&
        (tableWrapper.getAttribute("data-table") || tableWrapper.dataset.table);

      if (tabKey && typeof window.setTabViewState === "function") {
        if (currentResizeType === "column") {
          const header = currentResizeTarget;
          const columnName =
            header.getAttribute("data-column-name") ||
            header.dataset.columnName ||
            null;
          const width = header.offsetWidth;
          const changed =
            typeof startWidth === "number" && startWidth > 0
              ? Math.abs(width - startWidth) >= 2
              : true;
          if (columnName && width && changed) {
            const patch = { columnWidths: { [columnName]: width } };
            window.setTabViewState(tabKey, patch, {
              renderTabs: false,
              renderSidebar: false,
            });
          }
        } else if (currentResizeType === "row") {
          const row = currentResizeTarget;
          const rowIndex =
            row && row.getAttribute ? row.getAttribute("data-row-index") : null;
          const height = row && row.offsetHeight ? row.offsetHeight : 0;
          const changed =
            typeof startHeight === "number" && startHeight > 0
              ? Math.abs(height - startHeight) >= 2
              : true;
          if (rowIndex && height && changed) {
            const patch = { rowHeights: { [rowIndex]: height } };
            window.setTabViewState(tabKey, patch, {
              renderTabs: false,
              renderSidebar: false,
            });

            if (typeof window.updateRowMultilineForRow === "function") {
              window.updateRowMultilineForRow(row, height);
            }

            // Keep virtualization metrics (spacer heights) in sync after resizing.
            if (typeof window.refreshVirtualTable === "function" && tableWrapper) {
              window.refreshVirtualTable(tableWrapper);
            }
          }
        }
      }
    } catch (_) {
      // ignore persistence errors (e.g. during teardown)
    }

    // Show success message only when there was a meaningful change.
    const resizeType = currentResizeType === "column" ? "Column" : "Row";
    const didChange =
      currentResizeType === "column"
        ? Math.abs((currentResizeTarget.offsetWidth || 0) - (startWidth || 0)) >=
          2
        : Math.abs((currentResizeTarget.offsetHeight || 0) - (startHeight || 0)) >=
          2;
    if (didChange && typeof showSuccess !== "undefined") {
      showSuccess(`${resizeType} resized successfully`);
    }

    if (
      currentResizeType === "column" &&
      table &&
      typeof window.scheduleCellOverflowIndicators === "function"
    ) {
      window.scheduleCellOverflowIndicators(table);
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

      // Add class to table to prevent text selection during resize
      table.classList.add("resizing");

      if (window.debug) {
        window.debug.debug(
          `Started column resize from cell: ${columnIndex}, ${startWidth}`
        );
      }
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
