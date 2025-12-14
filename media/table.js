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

// Rendering limits to keep the UI responsive on wide/large-text tables.
const CELL_RENDER_LIMIT = 200; // visible characters
const CELL_ORIGINAL_LIMIT = 2000; // stored in DOM attributes (for editing)

// BLOB rendering: keep thumbnails small to avoid UI jank.
const BLOB_THUMB_MAX_BYTES = 64 * 1024; // 64KB

// Simple row virtualization (keeps DOM small for large pages).
const VIRTUALIZATION_CONFIG = {
  // Auto-enable when the current page is large enough to cause noticeable jank.
  // Keep this conservative; 100-row pages should be fine without virtualization.
  minRows: 300,
  minCells: 12000, // rows * columns
  overscan: 8, // rows above/below viewport
};

function escapeHtmlFast(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

function getVirtualizationStash() {
  /** @type {any} */ const win = typeof window !== "undefined" ? window : {};
  if (!win.__virtualTableStash) {
    win.__virtualTableStash = new Map();
  }
  return /** @type {Map<string, any>} */ (win.__virtualTableStash);
}

function getTableDataStash() {
  /** @type {any} */ const win = typeof window !== "undefined" ? window : {};
  if (!win.__tableDataStash) {
    win.__tableDataStash = new Map();
  }
  return /** @type {Map<string, any>} */ (win.__tableDataStash);
}

function stashTableData(tableId, payload) {
  try {
    const stash = getTableDataStash();
    stash.set(tableId, payload);
    // Prevent unbounded growth since table IDs are time-based.
    const maxEntries = 25;
    while (stash.size > maxEntries) {
      const firstKey = stash.keys().next().value;
      if (firstKey === undefined) {
        break;
      }
      stash.delete(firstKey);
    }
  } catch (_) {
    // best-effort only
  }
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
    value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
    return Uint8Array.from(value);
  }
  // Node Buffer serialized form (rare, but can happen depending on transport)
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
  // SVG (best-effort; treat as UTF-8 text)
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

function uint8ToBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, /** @type {any} */ (chunk));
  }
  return btoa(binary);
}

function normalizeEnhancedTableWrapper(el) {
  if (!el || !(el instanceof Element)) {
    return null;
  }
  if (el.classList.contains("enhanced-table-wrapper")) {
    return el;
  }
  const inner = el.querySelector(".enhanced-table-wrapper");
  if (inner) {
    return inner;
  }
  const parent = el.closest(".enhanced-table-wrapper");
  return parent || null;
}

function shouldVirtualizeTable(pageRowCount, columnCount, tableName, options) {
  if (
    !Array.isArray(options?.virtualizeAllowList) &&
    options?.virtualizeAllowList
  ) {
    // ignore invalid allow list
  }
  if (tableName === "schema") {
    return false;
  }
  if (options && options.virtualize === false) {
    return false;
  }
  if (options && options.virtualize === true) {
    return true;
  }
  const cells = Math.max(0, (pageRowCount || 0) * (columnCount || 0));
  return (
    (pageRowCount || 0) >= VIRTUALIZATION_CONFIG.minRows ||
    cells >= VIRTUALIZATION_CONFIG.minCells
  );
}

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
    totalRows = undefined,
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
  const backendPaginated =
    options.backendPaginated === true ||
    options.totalRowsKnown === false ||
    options.totalRows !== undefined;

  // Check if this is a schema table (not editable)
  // Note: Query results should have most table features enabled
  const isSchemaTable = tableName === "schema";

  // Schema tables are small + local; we don't need async counting UI for them.
  const totalRowsKnown =
    isSchemaTable || (typeof totalRows === "number" && totalRows >= 0);
  const effectiveTotalRows = totalRowsKnown
    ? isSchemaTable
      ? Array.isArray(data)
        ? data.length
        : 0
      : /** @type {number} */ (totalRows)
    : 0;
  const totalPages = totalRowsKnown
    ? Math.ceil(effectiveTotalRows / pageSize)
    : 1;
  const showSchemaStats = !isSchemaTable;

  // Determine if editing should be allowed
  const isEditable =
    allowEditing !== null ? allowEditing : !isSchemaTable && !isQueryResult; // Query results default to read-only for data integrity

  // When data is backend-paginated, `data` already contains the current page.
  // When not, we paginate locally.
  let pageData = data;
  let startIndex = 0;
  let endIndex = data.length;

  if (backendPaginated) {
    // Backend pagination - data is already for the current page
    startIndex = (currentPage - 1) * pageSize;
    endIndex = startIndex + data.length;
    pageData = data;
  } else {
    // Local pagination - need to slice the data
    startIndex = (currentPage - 1) * pageSize;
    const localTotalRows = Array.isArray(data) ? data.length : 0;
    endIndex = Math.min(startIndex + pageSize, localTotalRows);
    pageData = data.slice(startIndex, endIndex);
  }

  const recordsLabel = totalRowsKnown
    ? effectiveTotalRows.toLocaleString()
    : "…";
  const visibleRowsLabel = totalRowsKnown
    ? `Showing ${
        startIndex + 1
      }-${endIndex} of ${effectiveTotalRows.toLocaleString()} rows`
    : `Showing ${startIndex + 1}-${endIndex} (counting…)`;

  const virtualize = shouldVirtualizeTable(
    Array.isArray(pageData) ? pageData.length : 0,
    Array.isArray(columns) ? columns.length : 0,
    tableName,
    options
  );

  // Keep the current page rows in-memory for context menu actions (e.g., BLOB viewing/copy).
  stashTableData(tableId, {
    pageData,
    columns,
    startIndex,
    tableName,
  });

  if (virtualize) {
    // Stash the current page rows in-memory so the virtualizer can hydrate after insertion.
    // This avoids serializing row data into the DOM or VS Code persisted state.
    try {
      const stash = getVirtualizationStash();
      stash.set(tableId, {
        pageData,
        columns,
        startIndex,
        isSchemaTable,
        isEditable,
        foreignKeyMap,
        options,
        tableName,
      });
    } catch (_) {
      // ignore stashing errors (best-effort)
    }
  }

  return `
    <div class="enhanced-table-wrapper" data-table="${tableName}" data-table-id="${tableId}" data-total-rows="${effectiveTotalRows}" data-page-size="${pageSize}" data-current-page="${currentPage}" data-start-index="${startIndex}" data-page-rows="${
    Array.isArray(pageData) ? pageData.length : 0
  }" data-backend-paginated="${
    backendPaginated ? "true" : "false"
  }" data-virtualized="${
    virtualize ? "true" : "false"
  }" data-total-rows-known="${totalRowsKnown ? "true" : "false"}">
      <div class="table-controls">
        <div class="table-search">
          <input type="text" class="search-input" placeholder="Search table page..." />
          <button class="search-clear" title="Clear search">×</button>
        </div>
        ${
          showSchemaStats
            ? `<div class="table-pagination-info">
          <span class="records-info">
            <span class="stat-item">
              <span class="stat-value">${recordsLabel}</span>
              <span class="stat-label">Records</span>
            </span>
            <span class="stat-separator">•</span>
            <span class="stat-item">
              <span class="stat-value">${columns.length}</span>
              <span class="stat-label">Columns</span>
            </span>
          </span>
        </div>`
            : ""
        }
        <div class="table-actions">
          ${
            isQueryResult
              ? `<span class="table-readonly-indicator" title="Query results are read-only">🧮 Query Result</span>`
              : !isEditable
              ? `<span class="table-readonly-indicator" title="Table is read-only">🔒 Read-only</span>`
              : ``
          }
          ${
            showSchemaStats
              ? `<div class="page-size-selector">
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
          <button class="table-action-btn" title="Export visible data" data-action="export">💾 Export</button>`
              : ""
          }
        </div>
      </div>
      <div class="table-scroll-container">
        <table class="data-table resizable-table" id="${tableId}" role="table" aria-label="Database table data">
          <colgroup>
            ${columns
              .map(
                (col, index) =>
                  `<col data-column="${index}" data-column-name="${escapeHtmlFast(
                    col
                  )}" />`
              )
              .join("")}
          </colgroup>
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
            ${
              virtualize
                ? `<tr class="virtual-loading" role="row"><td class="virtual-loading-cell" role="cell" colspan="${columns.length}">Rendering…</td></tr>`
                : renderTableRows(
                    pageData,
                    startIndex,
                    columns,
                    isSchemaTable,
                    isEditable,
                    foreignKeyMap,
                    options
                  )
            }
          </tbody>
        </table>
      </div>
      ${
        showSchemaStats
          ? `<div class="table-footer">
        <div class="table-info">
          <span class="visible-rows">${visibleRowsLabel}</span>
          <span class="selected-info"></span>
        </div>
        <div class="table-pagination">
          ${
            totalRowsKnown
              ? createPaginationControls(currentPage, totalPages, tableId)
              : ""
          }
        </div>
      </div>`
          : ""
      }
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
  if (!Array.isArray(data) || data.length === 0) {
    return "";
  }

  return data
    .map((row, localIndex) => {
      const globalIndex = startIndex + localIndex;
      return renderTableRowHtml(
        row,
        globalIndex,
        localIndex,
        columns,
        isSchemaTable,
        isEditable,
        foreignKeyMap,
        options
      );
    })
    .join("");
}

function renderTableRowHtml(
  row,
  globalIndex,
  localIndex,
  columns,
  isSchemaTable,
  isEditable,
  foreignKeyMap,
  options
) {
  return `
        <tr data-row-index="${globalIndex}" data-local-index="${localIndex}" class="resizable-row" role="row">
          ${
            Array.isArray(row)
              ? row
                  .map((cell, cellIndex) =>
                    renderTableCellHtml(
                      cell,
                      cellIndex,
                      globalIndex,
                      columns,
                      isSchemaTable,
                      isEditable,
                      foreignKeyMap,
                      options
                    )
                  )
                  .join("")
              : ""
          }
        </tr>
      `;
}

function renderTableCellHtml(
  cell,
  cellIndex,
  globalIndex,
  columns,
  isSchemaTable,
  isEditable,
  foreignKeyMap,
  options
) {
  const columnName = columns[cellIndex];
  let isForeignKey = foreignKeyMap.has(columnName);
  let fkClass = isForeignKey ? " fk-cell" : "";
  let fkInfo = foreignKeyMap.get(columnName);
  let fkTable = null;
  let fkColumn = null;
  const blobBytes = normalizeBlobValue(cell);
  const isBlob = !!blobBytes;

  // Fallback: try to extract FK info from column metadata if not present
  if (!isForeignKey && Array.isArray(columns) && options && options.columns) {
    const colMeta = options.columns.find((c) => c.name === columnName);
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

  let cellContentHtml = "";
  if (cell === null || cell === undefined) {
    cellContentHtml =
      '<div class="cell-content" data-original-value=""><em>NULL</em></div>';
  } else if (isBlob && blobBytes) {
    const sizeText = formatBytes(blobBytes.length);
    const mime = detectImageMime(blobBytes);
    const isImage = !!mime;
    const canThumb = isImage && blobBytes.length <= BLOB_THUMB_MAX_BYTES;
    const thumbHtml = canThumb
      ? `<img class="blob-thumb" alt="Image blob preview" src="data:${mime};base64,${uint8ToBase64(
          blobBytes
        )}" />`
      : `<span class="blob-icon" aria-hidden="true">${
          isImage ? "🖼️" : "🧩"
        }</span>`;
    const label = `${isImage ? "Image" : "BLOB"} ${sizeText}`;
    cellContentHtml = `<div class="cell-content cell-content-blob" data-original-value="" data-blob="true" data-blob-size="${
      blobBytes.length
    }"${
      mime ? ` data-blob-mime="${escapeHtmlFast(mime)}"` : ""
    }>${thumbHtml}<span class="blob-label">${escapeHtmlFast(
      label
    )}</span></div>`;
  } else {
    const raw = String(cell);
    const original =
      raw.length > CELL_ORIGINAL_LIMIT
        ? raw.slice(0, CELL_ORIGINAL_LIMIT)
        : raw;
    const display =
      raw.length > CELL_RENDER_LIMIT
        ? raw.slice(0, CELL_RENDER_LIMIT) + "…"
        : raw;
    const truncatedAttr =
      raw.length > CELL_ORIGINAL_LIMIT ? ' data-original-truncated="true"' : "";
    cellContentHtml = `<div class="cell-content" data-original-value="${escapeHtmlFast(
      original
    )}"${truncatedAttr}>${escapeHtmlFast(display)}</div>`;
  }

  const cellEditable = isEditable && !isBlob;
  const ariaValue =
    isBlob && blobBytes
      ? `BLOB (${formatBytes(blobBytes.length)})`
      : cell !== null
      ? String(cell).substring(0, 50)
      : "null";

  return `
            <td data-column="${cellIndex}" 
                class="data-cell${fkClass}" 
                role="gridcell"
                tabindex="0"
                ${cellEditable ? `data-editable="true"` : ""}
                ${cellEditable ? `data-row-index="${globalIndex}"` : ""}
                data-column-name="${
                  columns ? columns[cellIndex] : `col_${cellIndex}`
                }"
                ${
                  isForeignKey && fkTable && fkColumn
                    ? `data-fk-table="${fkTable}" data-fk-column="${fkColumn}"`
                    : ""
                }
                aria-label="Row ${globalIndex + 1}, Column ${
    cellIndex + 1
  }: ${ariaValue}${isForeignKey ? " (Foreign Key)" : ""}">
              ${cellContentHtml}
              ${
                cellEditable
                  ? `<div class="cell-editing-controls" style="display: none;">
                <input type="text" class="cell-input" />
                <button class="cell-save-btn" title="Save changes">✓</button>
                <button class="cell-cancel-btn" title="Cancel changes">✗</button>
              </div>`
                  : ""
              }
            </td>
          `;
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
 * Hydrate a virtualized table body (renders only visible rows + spacers).
 * @param {Element} tableWrapperOrContainer
 */
function initializeVirtualTable(tableWrapperOrContainer) {
  const wrapper = normalizeEnhancedTableWrapper(tableWrapperOrContainer);
  if (!wrapper) {
    return;
  }
  if (wrapper.getAttribute("data-virtualized") !== "true") {
    return;
  }
  if (wrapper.getAttribute("data-virtual-initialized") === "true") {
    return;
  }

  const tableId =
    wrapper.getAttribute("data-table-id") || wrapper.dataset.tableId || "";
  if (!tableId) {
    return;
  }

  const stash = getVirtualizationStash();
  const payload = stash.get(tableId);
  if (!payload) {
    return;
  }
  stash.delete(tableId);

  const scrollContainer = wrapper.querySelector(".table-scroll-container");
  const table = wrapper.querySelector(".data-table");
  const tbody =
    (table && table.querySelector("tbody.table-body")) ||
    (table && table.querySelector("tbody"));
  if (!scrollContainer || !table || !tbody) {
    return;
  }

  const tabKey =
    wrapper.getAttribute("data-table") || wrapper.dataset.table || "";
  const viewState =
    tabKey && typeof window.getTabViewState === "function"
      ? window.getTabViewState(tabKey)
      : null;

  const vs = {
    enabled: true,
    wrapper,
    table,
    tbody,
    scrollContainer,
    tableId,
    tabKey,
    pageData: payload.pageData || [],
    columns: payload.columns || [],
    startIndex: typeof payload.startIndex === "number" ? payload.startIndex : 0,
    isSchemaTable: !!payload.isSchemaTable,
    isEditable: !!payload.isEditable,
    foreignKeyMap: payload.foreignKeyMap || new Map(),
    options: payload.options || {},
    overscan: VIRTUALIZATION_CONFIG.overscan,
    searchTerm:
      (viewState && typeof viewState.searchTerm === "string"
        ? viewState.searchTerm
        : "") || "",
    columnFilter: /** @type {null | { columnIndex: number, value: string }} */ (
      null
    ),
    sort: /** @type {{ columnName?: string|null, columnIndex: number|null, dir: 'none'|'asc'|'desc' }} */ ({
      columnName: null,
      columnIndex: null,
      dir: "none",
    }),
    baseRowHeight: 28,
    rowHeights:
      viewState &&
      viewState.rowHeights &&
      typeof viewState.rowHeights === "object"
        ? viewState.rowHeights
        : {},
    order: /** @type {number[]} */ ([]),
    heights: /** @type {number[]} */ ([]),
    prefix: /** @type {number[]} */ ([0]),
    totalHeight: 0,
    lastStart: -1,
    lastEnd: -1,
    raf: 0,
    originalVisibleLabelText: "",
  };

  // Snapshot the initial "Showing …" text so we can restore it when filters clear.
  const visibleLabelEl = wrapper.querySelector(".visible-rows");
  if (visibleLabelEl) {
    vs.originalVisibleLabelText = visibleLabelEl.textContent || "";
  }

  // Store state on the wrapper (in-memory only).
  /** @type {any} */ (wrapper).__virtualTableState = vs;
  wrapper.setAttribute("data-virtual-initialized", "true");

  // Restore persisted sort for virtualized tables (by column name).
  if (viewState && viewState.sort && typeof viewState.sort === "object") {
    const dir =
      viewState.sort.dir === "asc" || viewState.sort.dir === "desc"
        ? viewState.sort.dir
        : "none";
    const colName =
      typeof viewState.sort.columnName === "string"
        ? viewState.sort.columnName
        : null;
    if (colName && dir !== "none") {
      const idx = Array.isArray(vs.columns) ? vs.columns.indexOf(colName) : -1;
      if (idx >= 0) {
        vs.sort = { columnName: colName, columnIndex: idx, dir };
      }
    }
  }

  // Attach a throttled scroll listener for re-rendering.
  if (scrollContainer.getAttribute("data-virtual-scroll") !== "true") {
    scrollContainer.setAttribute("data-virtual-scroll", "true");
    scrollContainer.addEventListener("scroll", () => {
      scheduleVirtualRender(vs);
    });
  }

  // Initial render.
  recomputeVirtualMetrics(vs);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      virtualRender(vs, { force: true });
    });
  });

  // Measure row height once we have real rows and re-render if needed.
  requestAnimationFrame(() => {
    const firstRow = tbody.querySelector("tr.resizable-row");
    const measured =
      firstRow && firstRow instanceof HTMLElement ? firstRow.offsetHeight : 0;
    if (measured && Math.abs(measured - vs.baseRowHeight) > 2) {
      vs.baseRowHeight = measured;
      recomputeVirtualMetrics(vs);
      virtualRender(vs, { force: true });
    }
  });
}

function refreshVirtualTable(tableWrapperOrContainer) {
  const wrapper = normalizeEnhancedTableWrapper(tableWrapperOrContainer);
  if (!wrapper) {
    return;
  }
  /** @type {any} */ const vs = wrapper.__virtualTableState;
  if (!vs || vs.enabled !== true) {
    return;
  }

  // Pull the latest rowHeights map once (row resize persistence updates it).
  if (vs.tabKey && typeof window.getTabViewState === "function") {
    const next = window.getTabViewState(vs.tabKey);
    if (next && next.rowHeights && typeof next.rowHeights === "object") {
      vs.rowHeights = next.rowHeights;
    }
  }

  recomputeVirtualMetrics(vs);
  virtualRender(vs, { force: true });
}

function scheduleVirtualRender(vs) {
  if (!vs || !vs.enabled) {
    return;
  }
  if (vs.raf) {
    return;
  }
  vs.raf = requestAnimationFrame(() => {
    vs.raf = 0;
    virtualRender(vs, { force: false });
  });
}

function recomputeVirtualMetrics(vs) {
  const total = Array.isArray(vs.pageData) ? vs.pageData.length : 0;
  const term = (vs.searchTerm || "").toLowerCase();
  const hasSearch = term.length > 0;
  const hasColFilter = !!(vs.columnFilter && vs.columnFilter.value);

  // Build the visible order (filter + sort) as an array of source row indices.
  /** @type {number[]} */
  let order = Array.from({ length: total }, (_, i) => i);

  if (hasSearch) {
    order = order.filter((idx) => rowMatchesSearchTerm(vs.pageData[idx], term));
  }
  if (hasColFilter) {
    const colIdx = vs.columnFilter.columnIndex;
    const value = (vs.columnFilter.value || "").toLowerCase();
    order = order.filter((idx) => {
      const row = vs.pageData[idx];
      const cell = Array.isArray(row) ? row[colIdx] : null;
      return String(cell ?? "")
        .toLowerCase()
        .includes(value);
    });
  }

  if (
    vs.sort &&
    vs.sort.dir !== "none"
  ) {
    // Best-effort: derive index from columnName if needed
    if (typeof vs.sort.columnIndex !== "number") {
      if (vs.sort.columnName && Array.isArray(vs.columns)) {
        const nextIdx = vs.columns.indexOf(vs.sort.columnName);
        if (nextIdx >= 0) {
          vs.sort.columnIndex = nextIdx;
        }
      }
    }
    if (typeof vs.sort.columnIndex === "number") {
      const colIdx = vs.sort.columnIndex;
      const dir = vs.sort.dir;
      const cmp =
        typeof window.compareValues === "function"
          ? window.compareValues
          : (a, b, direction) =>
              direction === "asc"
                ? String(a).localeCompare(String(b))
                : String(b).localeCompare(String(a));

      order.sort((aIdx, bIdx) => {
        const aRow = vs.pageData[aIdx];
        const bRow = vs.pageData[bIdx];
        const aVal = Array.isArray(aRow) ? aRow[colIdx] : "";
        const bVal = Array.isArray(bRow) ? bRow[colIdx] : "";
        return cmp(aVal ?? "", bVal ?? "", dir);
      });
    }
  }

  vs.order = order;

  // Row heights + prefix sums (supports per-row resizing without breaking scroll restore).
  const n = order.length;
  const base =
    typeof vs.baseRowHeight === "number" && vs.baseRowHeight > 10
      ? vs.baseRowHeight
      : 42;
  const heights = new Array(n);
  const prefix = new Array(n + 1);
  prefix[0] = 0;
  for (let i = 0; i < n; i++) {
    const sourceIndex = order[i];
    const globalIndex = vs.startIndex + sourceIndex;
    const key = String(globalIndex);
    const h =
      vs.rowHeights && typeof vs.rowHeights[key] === "number"
        ? Math.max(25, Math.floor(vs.rowHeights[key]))
        : base;
    heights[i] = h;
    prefix[i + 1] = prefix[i] + h;
  }
  vs.heights = heights;
  vs.prefix = prefix;
  vs.totalHeight = prefix[n] || 0;

  // Update "Showing …" when filtered, otherwise restore the original label.
  const visibleLabelEl = vs.wrapper.querySelector(".visible-rows");
  if (visibleLabelEl) {
    if (hasSearch || hasColFilter) {
      visibleLabelEl.textContent = `Showing ${n} of ${total} ${
        pluralize ? pluralize(total, "row") : "rows"
      } (filtered)`;
    } else if (vs.originalVisibleLabelText) {
      visibleLabelEl.textContent = vs.originalVisibleLabelText;
    }
  }
}

function rowMatchesSearchTerm(row, termLower) {
  if (!termLower) {
    return true;
  }
  if (!Array.isArray(row)) {
    return false;
  }
  for (let i = 0; i < row.length; i++) {
    const cell = row[i];
    if (cell === null || cell === undefined) {
      continue;
    }
    if (String(cell).toLowerCase().includes(termLower)) {
      return true;
    }
  }
  return false;
}

function virtualRender(vs, { force }) {
  if (!vs || !vs.enabled) {
    return;
  }

  const tbody = vs.tbody;
  const colCount = Array.isArray(vs.columns) ? vs.columns.length : 0;
  const totalRows = Array.isArray(vs.order) ? vs.order.length : 0;

  if (!tbody || colCount <= 0) {
    return;
  }

  if (totalRows === 0) {
    tbody.innerHTML = `<tr class="virtual-empty" role="row"><td colspan="${colCount}">No matching rows.</td></tr>`;
    vs.lastStart = -1;
    vs.lastEnd = -1;
    return;
  }

  const scrollTop = vs.scrollContainer.scrollTop || 0;
  const viewportHeight = vs.scrollContainer.clientHeight || 0;
  const prefix = vs.prefix;
  const n = totalRows;
  const startAt = Math.max(0, findRowAtOffset(prefix, scrollTop) - vs.overscan);
  const endAt = Math.min(
    n,
    findRowAtOffset(prefix, scrollTop + viewportHeight) + 1 + vs.overscan
  );
  let effectiveEndAt = endAt;
  if (viewportHeight > 0) {
    // Render enough rows to fill the viewport even if our height estimate is off.
    // This prevents “~N rows then blank space” at the top of the table.
    const estimate = Math.max(18, Math.min(vs.baseRowHeight || 28, 28));
    const minRowsToRender =
      Math.ceil(viewportHeight / estimate) + vs.overscan * 2 + 1;
    effectiveEndAt = Math.min(n, Math.max(endAt, startAt + minRowsToRender));
  }

  if (!force && startAt === vs.lastStart && effectiveEndAt === vs.lastEnd) {
    return;
  }
  vs.lastStart = startAt;
  vs.lastEnd = effectiveEndAt;

  const topH = Math.max(0, Math.floor(prefix[startAt] || 0));
  const bottomH = Math.max(
    0,
    Math.floor(vs.totalHeight - (prefix[effectiveEndAt] || 0))
  );

  const topSpacer =
    topH > 0
      ? `<tr class="virtual-spacer virtual-spacer-top" aria-hidden="true"><td colspan="${colCount}" style="height:${topH}px"></td></tr>`
      : "";
  const bottomSpacer =
    bottomH > 0
      ? `<tr class="virtual-spacer virtual-spacer-bottom" aria-hidden="true"><td colspan="${colCount}" style="height:${bottomH}px"></td></tr>`
      : "";

  let rowsHtml = "";
  for (let i = startAt; i < effectiveEndAt; i++) {
    const sourceIndex = vs.order[i];
    const row = vs.pageData[sourceIndex];
    const globalIndex = vs.startIndex + sourceIndex;
    rowsHtml += renderTableRowHtml(
      row,
      globalIndex,
      sourceIndex,
      vs.columns,
      vs.isSchemaTable,
      vs.isEditable,
      vs.foreignKeyMap,
      vs.options
    );
  }

  tbody.innerHTML = `${topSpacer}${rowsHtml}${bottomSpacer}`;

  // Sync pinned classes + resized widths + resized row heights for newly-rendered rows.
  syncPinnedColumnsForVirtual(vs);
  syncColumnWidthsForVirtual(vs);
  syncRowHeightsForVirtual(vs);
}

function findRowAtOffset(prefix, offset) {
  // prefix length is n+1, monotonically increasing.
  const n = Math.max(0, prefix.length - 1);
  if (n === 0) {
    return 0;
  }
  const target = Math.max(0, Math.min(offset, prefix[n]));
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid + 1] <= target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return Math.max(0, Math.min(n - 1, lo));
}

function syncPinnedColumnsForVirtual(vs) {
  const pinnedHeaders = vs.table.querySelectorAll("th.pinned");
  const pinnedIndices = Array.from(pinnedHeaders)
    .map((th) => parseInt(th.getAttribute("data-column") || "-1", 10))
    .filter((n) => Number.isFinite(n) && n >= 0);

  // Clear existing pinned classes from rendered cells, then apply for pinned columns.
  vs.tbody
    .querySelectorAll("td.pinned")
    .forEach((td) => td.classList.remove("pinned"));

  pinnedIndices.forEach((colIdx) => {
    vs.tbody.querySelectorAll(`td[data-column="${colIdx}"]`).forEach((td) => {
      td.classList.add("pinned");
      td.classList.remove("unpinned");
    });
  });

  if (
    typeof window.updatePinnedColumnPositions === "function" &&
    pinnedIndices.length > 0
  ) {
    window.updatePinnedColumnPositions(vs.table);
  }
}

function syncColumnWidthsForVirtual(vs) {
  // With a <colgroup>, column widths apply automatically to newly rendered rows.
  // Keep header + <col> widths aligned (no per-cell scanning).
  const headers = vs.table.querySelectorAll("th[data-column]");
  const hasCols = vs.table.querySelector("colgroup");
  if (!hasCols) {
    return;
  }

  headers.forEach((th) => {
    if (!(th instanceof HTMLElement)) {
      return;
    }
    const colIdx = th.getAttribute("data-column");
    if (!colIdx) {
      return;
    }
    const width = th.style && th.style.width ? parseInt(th.style.width, 10) : 0;
    if (!width || !Number.isFinite(width)) {
      return;
    }
    const colEl = vs.table.querySelector(
      `colgroup col[data-column="${colIdx}"]`
    );
    if (colEl && colEl instanceof HTMLElement) {
      colEl.style.width = `${width}px`;
    }
  });
}

function syncRowHeightsForVirtual(vs) {
  const heights = vs.rowHeights || {};
  if (!heights || typeof heights !== "object") {
    return;
  }
  vs.tbody.querySelectorAll("tr[data-row-index]").forEach((row) => {
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const idx = row.getAttribute("data-row-index");
    if (!idx) {
      return;
    }
    const height = heights[idx];
    if (!height || typeof height !== "number") {
      return;
    }
    const h = Math.max(25, Math.floor(height));
    row.style.height = `${h}px`;
    row.style.minHeight = `${h}px`;
  });
}

/**
 * Filter table rows based on search term
 * @param {Element} tableWrapper - Table wrapper element
 * @param {string} searchTerm - Search term
 */
function filterTable(tableWrapper, searchTerm) {
  const wrapper = normalizeEnhancedTableWrapper(tableWrapper) || tableWrapper;
  /** @type {any} */ const vs = wrapper && wrapper.__virtualTableState;
  if (vs && vs.enabled === true) {
    vs.searchTerm = searchTerm || "";
    recomputeVirtualMetrics(vs);
    virtualRender(vs, { force: true });
    return;
  }

  const table = wrapper.querySelector(".data-table");
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
  const wrapper = table ? table.closest(".enhanced-table-wrapper") : null;
  /** @type {any} */ const vs = wrapper && wrapper.__virtualTableState;
  if (vs && vs.enabled === true) {
    const header = table.querySelector(`th[data-column="${columnIndex}"]`);
    if (!header) {
      return;
    }

    // Reset other indicators
    table.querySelectorAll("th").forEach((th) => {
      if (th !== header) {
        th.dataset.sort = "none";
        const indicator = th.querySelector(".sort-indicator");
        if (indicator) {
          indicator.textContent = "⇅";
        }
      }
    });

    const currentSort = header.dataset.sort || "none";
    let newSort = "asc";
    if (currentSort === "none") {
      newSort = "asc";
    } else if (currentSort === "asc") {
      newSort = "desc";
    } else {
      newSort = "asc";
    }

    header.dataset.sort = newSort;
    const indicator = header.querySelector(".sort-indicator");
    if (indicator) {
      indicator.textContent = newSort === "asc" ? "↑" : "↓";
    }

    const columnName = header.getAttribute("data-column-name") || null;
    vs.sort = {
      columnName,
      columnIndex,
      dir: /** @type {'asc'|'desc'} */ (newSort),
    };
    recomputeVirtualMetrics(vs);
    virtualRender(vs, { force: true });

    // Persist sort for this tab (by column name)
    try {
      const tabKey =
        wrapper && (wrapper.getAttribute("data-table") || wrapper.dataset.table);
      if (tabKey && typeof window.setTabViewState === "function" && columnName) {
        window.setTabViewState(
          tabKey,
          { sort: { columnName, dir: newSort } },
          { renderTabs: false, renderSidebar: false, persistState: "debounced" }
        );
      }
    } catch (_) {
      // ignore
    }

    if (typeof showSuccess !== "undefined") {
      showSuccess(
        `Table sorted by column ${columnIndex + 1} (${newSort}ending)`
      );
    }
    return;
  }

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

  // Persist sort for this tab (by column name)
  try {
    const wrapper = table.closest(".enhanced-table-wrapper");
    const tabKey =
      wrapper && (wrapper.getAttribute("data-table") || wrapper.dataset.table);
    const columnName = header.getAttribute("data-column-name") || null;
    if (tabKey && columnName && typeof window.setTabViewState === "function") {
      window.setTabViewState(
        tabKey,
        { sort: { columnName, dir: newSort } },
        { renderTabs: false, renderSidebar: false, persistState: "debounced" }
      );
    }
  } catch (_) {
    // ignore
  }

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
    if (window.debug) {
      window.debug.warn("Table not found for pinning");
    }
    return;
  }

  const headers = table.querySelectorAll("th");
  const header = headers[columnIndex];

  if (!header) {
    if (window.debug) {
      window.debug.warn(`Header ${columnIndex} not found`);
    }
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

  // Persist pinned columns for this tab (by column name) so we can restore on tab switch/reload.
  try {
    const wrapper = table.closest(".enhanced-table-wrapper");
    const tabKey =
      wrapper && (wrapper.getAttribute("data-table") || wrapper.dataset.table);
    if (tabKey && typeof window.setTabViewState === "function") {
      const pinnedNames = Array.from(table.querySelectorAll("th.pinned"))
        .map((th) => th.getAttribute("data-column-name") || "")
        .filter(Boolean);
      window.setTabViewState(
        tabKey,
        { pinnedColumns: pinnedNames },
        { renderTabs: false, renderSidebar: false }
      );
    }
  } catch (_) {
    // ignore persistence errors
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
  const wrapper = table ? table.closest(".enhanced-table-wrapper") : null;
  /** @type {any} */ const vs = wrapper && wrapper.__virtualTableState;
  if (vs && vs.enabled === true) {
    const normalized = typeof filterValue === "string" ? filterValue : "";
    vs.columnFilter = normalized ? { columnIndex, value: normalized } : null;
    recomputeVirtualMetrics(vs);
    virtualRender(vs, { force: true });

    const filterMsg = normalized
      ? `Column "${columnIndex + 1}" filtered by "${normalized}"`
      : "Column filter cleared";
    if (typeof showSuccess !== "undefined") {
      showSuccess(filterMsg);
    }
    return;
  }

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
  const wrapper = normalizeEnhancedTableWrapper(tableWrapper) || tableWrapper;
  /** @type {any} */ const vs = wrapper && wrapper.__virtualTableState;
  if (vs && vs.enabled === true) {
    const headers = Array.from(
      vs.table.querySelectorAll("th .column-name")
    ).map((th) => th.textContent);
    const rowData = (vs.order || []).map((sourceIndex) => {
      const row = vs.pageData[sourceIndex];
      return Array.isArray(row)
        ? row.map((val) =>
            val === null || val === undefined ? "" : String(val)
          )
        : [];
    });

    const csvContent = createCSVContent
      ? createCSVContent(headers, rowData)
      : "";
    if (typeof downloadFile !== "undefined") {
      const filename = sanitizeFilename
        ? sanitizeFilename("table_data.csv")
        : "table_data.csv";
      downloadFile(csvContent, filename);
    }
    if (typeof showSuccess !== "undefined") {
      showSuccess("Table data exported successfully!");
    }
    return;
  }

  const table = wrapper.querySelector(".data-table");
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

  const tabKey = wrapper.dataset.table || wrapper.getAttribute("data-table");
  if (tabKey && typeof window.setTabViewState === "function") {
    window.setTabViewState(
      tabKey,
      { page: newCurrentPage, pageSize: newPageSize, scrollTop: 0 },
      { renderTabs: false, renderSidebar: false }
    );
  }

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

  const tabKey = wrapper.dataset.table || wrapper.getAttribute("data-table");
  if (tabKey && typeof window.setTabViewState === "function") {
    const scrollContainer = wrapper.querySelector(".table-scroll-container");
    const scrollLeft =
      scrollContainer && "scrollLeft" in scrollContainer
        ? scrollContainer.scrollLeft
        : 0;
    window.setTabViewState(
      tabKey,
      { page: validPage, pageSize, scrollTop: 0, scrollLeft },
      { renderTabs: false, renderSidebar: false }
    );
  }

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
  /** @type {any} */ (window).initializeVirtualTable = initializeVirtualTable;
  /** @type {any} */ (window).refreshVirtualTable = refreshVirtualTable;
}
