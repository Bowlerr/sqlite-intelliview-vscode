// @ts-check

/**
 * Table creation and management functionality with pagination
 */

// Pagination settings
const PAGINATION_CONFIG = {
  defaultPageSize: 100,
  pageSizeOptions: [50, 100, 200, 500, 1000],
  maxVisiblePages: 5,
};

/**
 * Create enhanced data table HTML with pagination
 * @param {Array} data - Table data rows
 * @param {Array} columns - Column names
 * @param {string} tableName - Table name
 * @param {Object} options - Pagination options
 * @returns {string} HTML string for the table
 */
function createDataTable(data, columns, tableName = "", options = {}) {
  const {
    page = 1,
    pageSize = PAGINATION_CONFIG.defaultPageSize,
    totalRows = data.length,
    foreignKeys = [], // Add foreign keys to options
    isQueryResult = false, // Whether this is a query result
    query = null, // Original SQL query for result tabs
    allowEditing = null, // Override editing permission
  } = options;

  // Create foreign key lookup map
  const foreignKeyMap = new Map();
  if (Array.isArray(foreignKeys) && foreignKeys.length > 0) {
    foreignKeys.forEach((fk) => {
      if (fk && fk.column && fk.referencedTable && fk.referencedColumn) {
        foreignKeyMap.set(fk.column, fk);
      }
    });
  } else if (Array.isArray(options.columns)) {
    // Fallback: detect FKs from columns metadata
    options.columns.forEach((col) => {
      if (col && col.isForeignKey && col.refTable && col.refColumn) {
        foreignKeyMap.set(col.name, {
          column: col.name,
          referencedTable: col.refTable,
          referencedColumn: col.refColumn,
        });
      }
    });
  }

  const tableId = generateTableId
    ? generateTableId(tableName)
    : `table-${tableName || "query"}-${Date.now()}`;

  const currentPage = options.currentPage || options.page || 1;
  const totalPages = Math.ceil(totalRows / pageSize);

  // Check if this is a schema table (not editable)
  // Note: Query results should have most table features enabled
  const isSchemaTable = tableName === "schema";
  
  // Determine if editing should be allowed
  const isEditable = allowEditing !== null 
    ? allowEditing 
    : !isSchemaTable && !isQueryResult; // Query results default to read-only for data integrity

  // When we have totalRows from backend, data is already paginated
  // When we don't have totalRows, we need to paginate the data locally
  let pageData = data;
  let startIndex = 0;
  let endIndex = data.length;

  if (options.totalRows) {
    // Backend pagination - data is already for the current page
    startIndex = (currentPage - 1) * pageSize;
    endIndex = Math.min(startIndex + data.length, totalRows);
    pageData = data;
  } else {
    // Local pagination - need to slice the data
    startIndex = (currentPage - 1) * pageSize;
    endIndex = Math.min(startIndex + pageSize, totalRows);
    pageData = data.slice(startIndex, endIndex);
  }

  return `
    <div class="enhanced-table-wrapper" data-table="${tableName}" data-table-id="${tableId}" data-total-rows="${totalRows}" data-page-size="${pageSize}" data-current-page="${currentPage}">
      <div class="table-controls">
        <div class="table-search">
          <input type="text" class="search-input" placeholder="Search table..." />
          <button class="search-clear" title="Clear search">×</button>
        </div>
        <div class="table-pagination-info">
          <span class="records-info">
            <span class="stat-item">
              <span class="stat-value">${totalRows.toLocaleString()}</span>
              <span class="stat-label">Records</span>
            </span>
            <span class="stat-separator">•</span>
            <span class="stat-item">
              <span class="stat-value">${columns.length}</span>
              <span class="stat-label">Columns</span>
            </span>
          </span>
        </div>
        <div class="table-actions">
          ${
            isEditable
              ? `<span class="table-editable-indicator" title="Double-click cells to edit">✏️ Editable</span>`
              : isQueryResult
              ? `<span class="table-readonly-indicator" title="Query results are read-only">🧮 Query Result</span>`
              : `<span class="table-readonly-indicator" title="Schema data is read-only">🔒 Read-only</span>`
          }
          <div class="page-size-selector">
            <label for="page-size-${tableId}">Show:</label>
            <select id="page-size-${tableId}" class="page-size-select">
              ${PAGINATION_CONFIG.pageSizeOptions
                .map(
                  (size) =>
                    `<option value="${size}" ${
                      size === pageSize ? "selected" : ""
                    }>${size}</option>`
                )
                .join("")}
            </select>
          </div>
          <button class="table-action-btn" title="Export visible data" data-action="export">💾 Export</button>
        </div>
      </div>
      <div class="table-scroll-container">
        <table class="data-table resizable-table" id="${tableId}" role="table" aria-label="Database table data">
          <thead>
            <tr role="row">
              ${columns
                .map((col, index) => {
                  let fkInfo = foreignKeyMap.get(col);
                  let isForeignKey = !!fkInfo;
                  let fkClass = isForeignKey ? " fk-column" : "";
                  // Fallback: try to extract FK info from column metadata if not present
                  if (!isForeignKey && options.columns) {
                    const colMeta = options.columns.find((c) => c.name === col);
                    if (
                      colMeta &&
                      colMeta.isForeignKey &&
                      colMeta.refTable &&
                      colMeta.refColumn
                    ) {
                      isForeignKey = true;
                      fkClass = " fk-column";
                    }
                  }
                  return `
                <th class="sortable-header resizable-header${fkClass}" 
                    data-column="${index}" 
                    data-sort="none" 
                    role="columnheader" 
                    tabindex="0"
                    aria-sort="none"
                    aria-label="Column ${col}, sortable${
                    isForeignKey ? ", foreign key" : ""
                  }"
                  data-column-name="${col}">
                  <div class="column-header">
                    <span class="column-name">${col}</span>
                    ${
                      isForeignKey ? `<span class="fk-indicator">🔗</span>` : ""
                    }
                    <button class="pin-btn" 
                            title="Pin column ${col}" 
                            data-action="pin" 
                            data-column="${index}"
                            aria-label="Pin column ${col}"
                            aria-pressed="false">📌</button>
                  </div>
                  <span class="sort-indicator" aria-hidden="true">⇅</span>
                  <div class="resize-handle column-resize-handle" 
                       data-column="${index}" 
                       role="separator" 
                       aria-label="Resize column ${col}"
                       aria-orientation="vertical"></div>
                </th>
              `;
                })
                .join("")}
            </tr>
          </thead>
          <tbody role="rowgroup" class="table-body">
            ${renderTableRows(
              pageData,
              startIndex,
              columns,
              isSchemaTable,
              isEditable,
              foreignKeyMap,
              options
            )}
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <div class="table-info">
          <span class="visible-rows">Showing ${
            startIndex + 1
          }-${endIndex} of ${totalRows.toLocaleString()} rows</span>
          <span class="selected-info"></span>
        </div>
        <div class="table-pagination">
          ${createPaginationControls(currentPage, totalPages, tableId)}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render table rows with proper indexing
 * @param {Array} data - Row data to render
 * @param {number} startIndex - Starting row index for global numbering
 * @param {Array} columns - Column names for data attributes
 * @param {boolean} isSchemaTable - Whether this is a schema table 
 * @param {boolean} isEditable - Whether cells should be editable
 * @returns {string} HTML string for table rows
 */
function renderTableRows(
  data,
  startIndex = 0,
  columns = [],
  isSchemaTable = false,
  isEditable = true,
  foreignKeyMap = new Map(),
  options = {}
) {
  return data
    .map((row, localIndex) => {
      const globalIndex = startIndex + localIndex;
      return `
        <tr data-row-index="${globalIndex}" data-local-index="${localIndex}" class="resizable-row" role="row">
          ${row
            .map((cell, cellIndex) => {
              const columnName = columns[cellIndex];
              let isForeignKey = foreignKeyMap.has(columnName);
              let fkClass = isForeignKey ? " fk-cell" : "";
              let fkInfo = foreignKeyMap.get(columnName);
              let fkTable = null;
              let fkColumn = null;
              // Fallback: try to extract FK info from column metadata if not present
              if (
                !isForeignKey &&
                Array.isArray(columns) &&
                options &&
                options.columns
              ) {
                const colMeta = options.columns.find(
                  (c) => c.name === columnName
                );
                if (
                  colMeta &&
                  colMeta.isForeignKey &&
                  colMeta.refTable &&
                  colMeta.refColumn
                ) {
                  isForeignKey = true;
                  fkClass = " fk-cell";
                  fkTable = colMeta.refTable;
                  fkColumn = colMeta.refColumn;
                }
              }
              if (
                isForeignKey &&
                !fkTable &&
                fkInfo &&
                fkInfo.referencedTable &&
                fkInfo.referencedColumn
              ) {
                fkTable = fkInfo.referencedTable;
                fkColumn = fkInfo.referencedColumn;
              }

              return `
            <td data-column="${cellIndex}" 
                class="data-cell${fkClass}" 
                role="gridcell"
                tabindex="0"
                ${isEditable ? `data-editable="true"` : ""}
                ${isEditable ? `data-row-index="${globalIndex}"` : ""}
                data-column-name="${
                  columns ? columns[cellIndex] : `col_${cellIndex}`
                }"
                ${
                  isForeignKey && fkTable && fkColumn
                    ? `data-fk-table="${fkTable}" data-fk-column="${fkColumn}"`
                    : ""
                }
                aria-label="Row ${globalIndex + 1}, Column ${cellIndex + 1}: ${
                cell !== null ? String(cell).substring(0, 50) : "null"
              }${isForeignKey ? " (Foreign Key)" : ""}">
              <div class="cell-content" data-original-value="${
                cell !== null ? String(cell).replace(/"/g, "&quot;") : ""
              }">
                ${
                  cell !== null
                    ? String(cell)
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#39;")
                    : "<em>NULL</em>"
                }
              </div>
              ${
                isEditable
                  ? `<div class="cell-editing-controls" style="display: none;">
                <input type="text" class="cell-input" />
                <button class="cell-save-btn" title="Save changes">✓</button>
                <button class="cell-cancel-btn" title="Cancel changes">✗</button>
              </div>`
                  : ""
              }
            </td>
          `;
            })
            .join("")}
        </tr>
      `;
    })
    .join("");
}

/**
 * Create pagination controls HTML
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {string} tableId - Table identifier
 * @returns {string} HTML string for pagination controls
 */
function createPaginationControls(currentPage, totalPages, tableId) {
  if (totalPages <= 1) {
    return "";
  }

  const maxVisible = PAGINATION_CONFIG.maxVisiblePages;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  // Adjust start if we're near the end
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  let paginationHTML = `
    <div class="pagination-controls" data-table-id="${tableId}">
      <button class="pagination-btn" data-action="first" ${
        currentPage === 1 ? "disabled" : ""
      } title="First page">
        ⏮️
      </button>
      <button class="pagination-btn" data-action="prev" ${
        currentPage === 1 ? "disabled" : ""
      } title="Previous page">
        ⏪
      </button>
      <div class="pagination-pages">
  `;

  // Add ellipsis if needed at start
  if (startPage > 1) {
    paginationHTML += `<button class="pagination-btn page-btn" data-page="1">1</button>`;
    if (startPage > 2) {
      paginationHTML += `<span class="pagination-ellipsis">...</span>`;
    }
  }

  // Add visible page numbers
  for (let i = startPage; i <= endPage; i++) {
    paginationHTML += `
      <button class="pagination-btn page-btn ${
        i === currentPage ? "active" : ""
      }" 
              data-page="${i}">${i}</button>
    `;
  }

  // Add ellipsis if needed at end
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += `<span class="pagination-ellipsis">...</span>`;
    }
    paginationHTML += `<button class="pagination-btn page-btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  paginationHTML += `
      </div>
      <button class="pagination-btn" data-action="next" ${
        currentPage === totalPages ? "disabled" : ""
      } title="Next page">
        ⏩
      </button>
      <button class="pagination-btn" data-action="last" ${
        currentPage === totalPages ? "disabled" : ""
      } title="Last page">
        ⏭️
      </button>
    </div>
    <div class="page-input-container">
      <label for="page-input-${tableId}">Go to page:</label>
      <input type="number" id="page-input-${tableId}" class="page-input" 
             min="1" max="${totalPages}" value="${currentPage}" />
      <button class="pagination-btn" data-action="go">Go</button>
    </div>
  `;

  return paginationHTML;
}

/**
 * Filter table rows based on search term
 * @param {Element} tableWrapper - Table wrapper element
 * @param {string} searchTerm - Search term
 */
function filterTable(tableWrapper, searchTerm) {
  const table = tableWrapper.querySelector(".data-table");
  const rows = table.querySelectorAll("tbody tr");
  let visibleCount = 0;

  const term = searchTerm.toLowerCase();

  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    let rowMatches = false;

    cells.forEach((cell) => {
      const cellText = getCellValue ? getCellValue(cell) : cell.textContent;
      if (cellText.toLowerCase().includes(term)) {
        rowMatches = true;
      }
    });

    if (rowMatches || searchTerm === "") {
      row.style.display = "";
      visibleCount++;
    } else {
      row.style.display = "none";
    }
  });

  // Update row count
  const visibleRowsSpan = tableWrapper.querySelector(".visible-rows");
  if (visibleRowsSpan) {
    const totalRows = rows.length;
    visibleRowsSpan.textContent = `Showing ${visibleCount} of ${totalRows} ${
      pluralize ? pluralize(totalRows, "row") : "rows"
    }`;
  }
}

/**
 * Sort table by column
 * @param {Element} table - Table element
 * @param {number} columnIndex - Column index to sort by
 */
function sortTableByColumn(table, columnIndex) {
  const header = table.querySelector(`th[data-column="${columnIndex}"]`);
  const currentSort = header.dataset.sort;
  const tbody = table.querySelector("tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));

  // Reset all other sort indicators
  table.querySelectorAll("th").forEach((th) => {
    if (th !== header) {
      th.dataset.sort = "none";
      th.querySelector(".sort-indicator").textContent = "⇅";
    }
  });

  // Determine new sort direction
  let newSort = "asc";
  if (currentSort === "none") {
    newSort = "asc";
  } else if (currentSort === "asc") {
    newSort = "desc";
  } else {
    newSort = "asc";
  }

  // Sort rows
  rows.sort((a, b) => {
    const aCell = a.querySelector(`td[data-column="${columnIndex}"]`);
    const bCell = b.querySelector(`td[data-column="${columnIndex}"]`);
    const aValue = getCellValue
      ? getCellValue(aCell)
      : aCell.textContent.trim();
    const bValue = getCellValue
      ? getCellValue(bCell)
      : bCell.textContent.trim();

    return compareValues
      ? compareValues(aValue, bValue, newSort)
      : newSort === "asc"
      ? aValue.localeCompare(bValue)
      : bValue.localeCompare(aValue);
  });

  // Update header
  header.dataset.sort = newSort;
  header.querySelector(".sort-indicator").textContent =
    newSort === "asc" ? "↑" : "↓";

  // Re-append sorted rows
  rows.forEach((row) => tbody.appendChild(row));

  if (typeof showSuccess !== "undefined") {
    showSuccess(`Table sorted by column ${columnIndex + 1} (${newSort}ending)`);
  }
}

/**
 * Toggle column pin state
 * @param {Element} table - Table element
 * @param {number} columnIndex - Column index to pin/unpin
 */
function toggleColumnPin(table, columnIndex) {
  if (!table) {
    console.warn("Table not found for pinning");
    return;
  }

  const headers = table.querySelectorAll("th");
  const header = headers[columnIndex];

  if (!header) {
    console.warn(`Header ${columnIndex} not found`);
    return;
  }

  const isPinned = header.classList.contains("pinned");

  if (isPinned) {
    // Unpin column: remove .pinned, add .unpinned
    header.classList.remove("pinned");
    header.classList.add("unpinned");
    table
      .querySelectorAll(`td[data-column="${columnIndex}"]`)
      .forEach((cell) => {
        cell.classList.remove("pinned");
        cell.classList.add("unpinned");
      });

    // Update pin button with accessibility
    const pinBtn = header.querySelector('[data-action="pin"]');
    if (pinBtn) {
      pinBtn.style.opacity = "0.6";
      pinBtn.title = "Pin column";
      pinBtn.setAttribute("aria-pressed", "false");
      pinBtn.setAttribute(
        "aria-label",
        `Pin column ${
          header.querySelector(".column-name")?.textContent || columnIndex
        }`
      );
      pinBtn.textContent = "📌";
    }

    // Recalculate pinned column positions
    if (typeof updatePinnedColumnPositions !== "undefined") {
      updatePinnedColumnPositions(table);
    }

    if (typeof showSuccess !== "undefined") {
      showSuccess(`Column unpinned`);
    }
  } else {
    // Pin column: remove .unpinned, add .pinned
    header.classList.remove("unpinned");
    header.classList.add("pinned");
    table
      .querySelectorAll(`td[data-column="${columnIndex}"]`)
      .forEach((cell) => {
        cell.classList.remove("unpinned");
        cell.classList.add("pinned");
      });

    // Update pin button with accessibility
    const pinBtn = header.querySelector('[data-action="pin"]');
    if (pinBtn) {
      pinBtn.style.opacity = "1";
      pinBtn.title = "Unpin column";
      pinBtn.setAttribute("aria-pressed", "true");
      pinBtn.setAttribute(
        "aria-label",
        `Unpin column ${
          header.querySelector(".column-name")?.textContent || columnIndex
        }`
      );
      pinBtn.textContent = "📍";
    }

    // Recalculate pinned column positions
    if (typeof updatePinnedColumnPositions !== "undefined") {
      updatePinnedColumnPositions(table);
    }

    if (typeof showSuccess !== "undefined") {
      showSuccess(`Column pinned`);
    }
  }
}

/**
 * Show column filter dialog
 * @param {Element} table - Table element
 * @param {number} columnIndex - Column index to filter
 */
function showColumnFilter(table, columnIndex) {
  const header = table.querySelector(`th[data-column="${columnIndex}"]`);
  const columnName = getColumnName
    ? getColumnName(header)
    : header.querySelector(".column-name")
    ? header.querySelector(".column-name").textContent
    : `Column ${columnIndex + 1}`;

  const filterValue = prompt(`Filter column "${columnName}" by value:`, "");

  if (filterValue !== null) {
    filterTableByColumn(table, columnIndex, filterValue);
  }
}

/**
 * Filter table by specific column value
 * @param {Element} table - Table element
 * @param {number} columnIndex - Column index to filter
 * @param {string} filterValue - Filter value
 */
function filterTableByColumn(table, columnIndex, filterValue) {
  const rows = table.querySelectorAll("tbody tr");
  let visibleCount = 0;

  rows.forEach((row) => {
    const cell = row.querySelector(`td[data-column="${columnIndex}"]`);
    const cellValue = getCellValue ? getCellValue(cell) : cell.textContent;
    const shouldShow =
      filterValue === "" ||
      cellValue.toLowerCase().includes(filterValue.toLowerCase());

    if (shouldShow) {
      row.style.display = "";
      visibleCount++;
    } else {
      row.style.display = "none";
    }
  });

  // Update row count
  const tableWrapper = table.closest(".enhanced-table-wrapper");
  const visibleRowsSpan = tableWrapper.querySelector(".visible-rows");
  if (visibleRowsSpan) {
    const totalRows = rows.length;
    visibleRowsSpan.textContent = `Showing ${visibleCount} of ${totalRows} ${
      pluralize ? pluralize(totalRows, "row") : "rows"
    }`;
  }

  const filterMsg = filterValue
    ? `Column "${columnIndex + 1}" filtered by "${filterValue}"`
    : "Column filter cleared";
  if (typeof showSuccess !== "undefined") {
    showSuccess(filterMsg);
  }
}

/**
 * Export table data as CSV
 * @param {Element} tableWrapper - Table wrapper element
 */
function exportTableData(tableWrapper) {
  const table = tableWrapper.querySelector(".data-table");
  const visibleRows = table.querySelectorAll(
    'tbody tr:not([style*="display: none"])'
  );

  // Get headers
  const headers = Array.from(table.querySelectorAll("th .column-name")).map(
    (th) => th.textContent
  );

  // Get visible row data
  const rowData = Array.from(visibleRows).map((row) => {
    return Array.from(row.querySelectorAll("td")).map((td) => {
      let value = getCellValue ? getCellValue(td) : td.textContent.trim();
      return value === "NULL" ? "" : value;
    });
  });

  // Create CSV content
  const csvContent = createCSVContent ? createCSVContent(headers, rowData) : "";

  // Download file
  if (typeof downloadFile !== "undefined") {
    const filename = sanitizeFilename
      ? sanitizeFilename("table_data.csv")
      : "table_data.csv";
    downloadFile(csvContent, filename);
  }

  if (typeof showSuccess !== "undefined") {
    showSuccess("Table data exported successfully!");
  }
}

/**
 * Refresh table data
 * @param {Element} tableWrapper - Table wrapper element
 */
function refreshTableData(tableWrapper) {
  // This would trigger a refresh of the current table data
  // For now, just show a message
  if (typeof showSuccess !== "undefined") {
    showSuccess("Table data refreshed!");
  }
}

/**
 * Update the positioning of pinned columns
 * @param {HTMLElement} table - The table element
 */
function updatePinnedColumnPositions(table) {
  const pinnedHeaders = table.querySelectorAll("th.pinned");
  let cumulativeWidth = 0;

  pinnedHeaders.forEach((header, index) => {
    const columnIndex = header.getAttribute("data-column");

    // Set the left position for this pinned column
    header.style.left = `${cumulativeWidth}px`;

    // Apply same positioning to all cells in this column
    table
      .querySelectorAll(`td[data-column="${columnIndex}"]`)
      .forEach((cell) => {
        cell.style.left = `${cumulativeWidth}px`;
      });

    // Add this column's width to cumulative width for next column
    cumulativeWidth += header.offsetWidth;
  });

  // Update CSS custom properties for advanced positioning
  const tableWrapper = table.closest(".enhanced-table-wrapper");
  if (tableWrapper && pinnedHeaders.length > 0) {
    tableWrapper.style.setProperty(
      "--first-column-width",
      `${pinnedHeaders[0]?.offsetWidth || 150}px`
    );
    if (pinnedHeaders.length > 1) {
      tableWrapper.style.setProperty(
        "--second-column-width",
        `${pinnedHeaders[1]?.offsetWidth || 150}px`
      );
    }
  }
}

/**
 * Handle pagination actions
 * @param {Element} tableWrapper - Table wrapper element
 * @param {string} action - Pagination action (first, prev, next, last, goto)
 * @param {string|number} value - Page number or action value
 */
function handlePagination(tableWrapper, action, value) {
  if (!tableWrapper) {
    return;
  }

  const wrapper = /** @type {HTMLElement} */ (tableWrapper);
  const currentPage = parseInt(wrapper.dataset.currentPage || "1");
  const totalRows = parseInt(wrapper.dataset.totalRows || "0");
  const pageSize = parseInt(wrapper.dataset.pageSize || "100");
  const totalPages = Math.ceil(totalRows / pageSize);

  let newPage = currentPage;

  switch (action) {
    case "first":
      newPage = 1;
      break;
    case "prev":
      newPage = Math.max(1, currentPage - 1);
      break;
    case "next":
      newPage = Math.min(totalPages, currentPage + 1);
      break;
    case "last":
      newPage = totalPages;
      break;
    case "goto":
      const targetPage = parseInt(String(value));
      newPage = Math.max(1, Math.min(totalPages, targetPage));
      break;
    default:
      if (typeof value === "string") {
        newPage = parseInt(value);
      } else if (typeof value === "number") {
        newPage = value;
      }
      break;
  }

  // Only update if page actually changed
  if (newPage !== currentPage) {
    updateTablePage(tableWrapper, newPage);
  }
}

/**
 * Handle page size change
 * @param {Element} tableWrapper - Table wrapper element
 * @param {number} newPageSize - New page size
 */
function handlePageSizeChange(tableWrapper, newPageSize) {
  if (!tableWrapper) {
    return;
  }

  const wrapper = /** @type {HTMLElement} */ (tableWrapper);
  const currentPage = parseInt(wrapper.dataset.currentPage || "1");
  const totalRows = parseInt(wrapper.dataset.totalRows || "0");

  // Calculate what the new current page should be to show similar data
  const currentStartRow =
    (currentPage - 1) * parseInt(wrapper.dataset.pageSize || "100");
  const newCurrentPage = Math.max(
    1,
    Math.ceil((currentStartRow + 1) / newPageSize)
  );

  // Update page size
  wrapper.dataset.pageSize = newPageSize.toString();

  // Update global pagination state
  /** @type {any} */
  const win = window;
  if (typeof win.updateState === "function") {
    win.updateState({ currentPage: newCurrentPage, pageSize: newPageSize });
  }

  // Update to new page
  updateTablePage(tableWrapper, newCurrentPage);
}

/**
 * Update table to show specified page
 * @param {Element} tableWrapper - Table wrapper element
 * @param {number} pageNumber - Page number to show
 */
function updateTablePage(tableWrapper, pageNumber) {
  if (!tableWrapper) {
    return;
  }

  const wrapper = /** @type {HTMLElement} */ (tableWrapper);
  const tableId = wrapper.dataset.tableId;
  const totalRows = parseInt(wrapper.dataset.totalRows || "0");
  const pageSize = parseInt(wrapper.dataset.pageSize || "100");
  const totalPages = Math.ceil(totalRows / pageSize);

  // Validate page number
  const validPage = Math.max(1, Math.min(totalPages, pageNumber));

  // Update current page
  wrapper.dataset.currentPage = validPage.toString();

  // Update global pagination state
  /** @type {any} */
  const win = window;
  if (typeof win.updateState === "function") {
    win.updateState({ currentPage: validPage, pageSize });
  }

  // We need to get the full data and re-render the table
  // For now, we'll trigger a data reload from the extension
  /** @type {any} */
  const win2 = window;
  const currentState =
    typeof win2.getCurrentState === "function" ? win2.getCurrentState() : {};
  if (
    currentState.selectedTable &&
    typeof win2.vscode !== "undefined" &&
    Array.isArray(currentState.openTables)
  ) {
    const tabObj = currentState.openTables.find(
      (t) => t.key === currentState.selectedTable
    );
    if (!tabObj || !tabObj.isResultTab) {
      win2.vscode.postMessage({
        type: "getTableData",
        tableName: currentState.selectedTable,
        page: validPage,
        pageSize: pageSize,
      });
    }
  }
}

/**
 * Update pagination controls after data change
 * @param {Element} tableWrapper - Table wrapper element
 * @param {Array} data - New data array
 * @param {number} currentPage - Current page number
 * @param {number} pageSize - Page size
 */
function updatePaginationControls(tableWrapper, data, currentPage, pageSize) {
  if (!tableWrapper) {
    return;
  }

  const wrapper = /** @type {HTMLElement} */ (tableWrapper);
  const totalRows = data.length;
  const totalPages = Math.ceil(totalRows / pageSize);

  // Update data attributes
  wrapper.dataset.totalRows = totalRows.toString();
  wrapper.dataset.currentPage = currentPage.toString();
  wrapper.dataset.pageSize = pageSize.toString();

  // Update visible rows info
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);

  const visibleRowsSpan = tableWrapper.querySelector(".visible-rows");
  if (visibleRowsSpan) {
    visibleRowsSpan.textContent = `Showing ${
      startIndex + 1
    }-${endIndex} of ${totalRows.toLocaleString()} rows`;
  }

  // Update records info
  const recordsValue = tableWrapper.querySelector(".records-info .stat-value");
  if (recordsValue) {
    recordsValue.textContent = totalRows.toLocaleString();
  }

  // Update pagination controls
  const paginationContainer = tableWrapper.querySelector(".table-pagination");
  if (paginationContainer && totalPages > 1) {
    const tableId = wrapper.dataset.tableId || "unknown";
    paginationContainer.innerHTML = createPaginationControls(
      currentPage,
      totalPages,
      tableId
    );

    // Re-initialize pagination events for new controls
    if (typeof initializeTableEvents !== "undefined") {
      const paginationControls = tableWrapper.querySelector(
        ".pagination-controls"
      );
      if (paginationControls) {
        paginationControls.addEventListener("click", (e) => {
          const target = /** @type {HTMLElement} */ (e.target);
          if (target && target.classList.contains("pagination-btn")) {
            const action = target.dataset.action;
            const page = target.dataset.page;

            if (action || page) {
              handlePagination(tableWrapper, action || "goto", page || "1");
            }
          }
        });
      }
    }
  }

  // Update page size selector
  const pageSizeSelect = tableWrapper.querySelector(".page-size-select");
  if (pageSizeSelect) {
    /** @type {HTMLSelectElement} */ (pageSizeSelect).value =
      pageSize.toString();
  }

  // Update page input
  const pageInput = tableWrapper.querySelector(".page-input");
  if (pageInput) {
    /** @type {HTMLInputElement} */ (pageInput).value = currentPage.toString();
    /** @type {HTMLInputElement} */ (pageInput).max = totalPages.toString();
    // Add event listener for Enter key and blur
    pageInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        const val = parseInt(pageInput.value, 10);
        if (!isNaN(val)) {
          updateTablePage(tableWrapper, val);
        }
      }
    });
    pageInput.addEventListener("blur", function () {
      const val = parseInt(pageInput.value, 10);
      if (!isNaN(val)) {
        updateTablePage(tableWrapper, val);
      }
    });
  }
}

// Make functions available globally for cross-module access
if (typeof window !== "undefined") {
  /** @type {any} */ (window).createDataTable = createDataTable;
  /** @type {any} */ (window).filterTable = filterTable;
  /** @type {any} */ (window).sortTableByColumn = sortTableByColumn;
  /** @type {any} */ (window).toggleColumnPin = toggleColumnPin;
  /** @type {any} */ (window).updatePinnedColumnPositions =
    updatePinnedColumnPositions;
  /** @type {any} */ (window).handlePagination = handlePagination;
  /** @type {any} */ (window).handlePageSizeChange = handlePageSizeChange;
  /** @type {any} */ (window).updateTablePage = updateTablePage;
  /** @type {any} */ (window).updatePaginationControls =
    updatePaginationControls;
  /** @type {any} */ (window).createPaginationControls =
    createPaginationControls;
  /** @type {any} */ (window).renderTableRows = renderTableRows;
}
