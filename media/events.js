// @ts-check

/**
 * Event handling for the SQLite Viewer
 */

/**
 * Initialize all event listeners
 */
/**
 * Handle error message
 * @param {Object} message - Error message
 */
function handleError(message) {
  if (typeof hideLoading !== "undefined") {
    hideLoading();
  }

  // Reset connect button state on error
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  if (elements.connectBtn) {
    elements.connectBtn.disabled = false;
    elements.connectBtn.classList.remove("connecting", "connected");
    elements.connectBtn.innerHTML = "Connect with Key";
  }

  if (typeof showError !== "undefined") {
    showError(message.message);
  }
}

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
  const elements = getAllDOMElements ? getAllDOMElements() : {};

  // Connect button
  if (elements.connectBtn) {
    elements.connectBtn.addEventListener("click", handleConnect);
  }

  // Execute query button
  if (elements.executeQueryBtn) {
    elements.executeQueryBtn.addEventListener("click", handleExecuteQuery);
  }

  // Clear query button
  if (elements.clearQueryBtn) {
    elements.clearQueryBtn.addEventListener("click", () => {
      if (elements.sqlQueryTextarea) {
        elements.sqlQueryTextarea.value = "";
        if (typeof autoResizeTextarea !== "undefined") {
          autoResizeTextarea();
        }
      }
    });
  }

  // Tab switching
  if (elements.tabs) {
    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        if (typeof switchTab !== "undefined") {
          switchTab(tab.dataset.tab);
        }
        if (typeof updateState !== "undefined") {
          updateState({ activeTab: tab.dataset.tab });
        }
      });
    });
  }

  // Global keyboard shortcuts
  document.addEventListener("keydown", handleGlobalKeyboard);

  // Enter key in query textarea
  if (elements.sqlQueryTextarea) {
    elements.sqlQueryTextarea.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleExecuteQuery();
      }
    });

    // Auto-resize query textarea
    elements.sqlQueryTextarea.addEventListener("input", () => {
      if (typeof autoResizeTextarea !== "undefined") {
        autoResizeTextarea();
      }
    });
  }

  // Handle messages from the extension
  window.addEventListener("message", handleExtensionMessage);

  // Connection help button
  const connectionHelpBtn = document.getElementById("connection-help-btn");
  if (connectionHelpBtn) {
    connectionHelpBtn.addEventListener("click", () => {
      if (typeof showConnectionHelp !== "undefined") {
        showConnectionHelp();
      }
    });
  }

  // Main help button
  const mainHelpBtn = document.getElementById("main-help-btn");
  if (mainHelpBtn) {
    mainHelpBtn.addEventListener("click", () => {
      if (typeof showKeyboardShortcuts !== "undefined") {
        showKeyboardShortcuts();
      }
    });
  }
}

/**
 * Handle global keyboard shortcuts
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleGlobalKeyboard(e) {
  // Ctrl/Cmd + Enter to execute query
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    handleExecuteQuery();
  }

  // Ctrl/Cmd + K to clear query
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    const elements = getAllDOMElements ? getAllDOMElements() : {};
    if (elements.sqlQueryTextarea) {
      elements.sqlQueryTextarea.value = "";
      elements.sqlQueryTextarea.focus();
    }
  }

  // Ctrl/Cmd + F to focus search in active table
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    const activeTable = document.querySelector(".enhanced-table-wrapper");
    if (activeTable) {
      e.preventDefault();
      const searchInput = activeTable.querySelector(".search-input");
      if (searchInput && searchInput.focus) {
        searchInput.focus();
      }
    }
  }

  // Escape to close notifications
  if (e.key === "Escape") {
    document.querySelectorAll(".notification").forEach((n) => n.remove());
  }
}

/**
 * Handle messages from the VS Code extension
 * @param {MessageEvent} event - Message event
 */
function handleExtensionMessage(event) {
  const message = event.data;
  console.log("Received message:", message.type, message);

  switch (message.type) {
    case "update":
      handleUpdate(message);
      break;
    case "databaseInfo":
      handleDatabaseInfo(message);
      break;
    case "queryResult":
      handleQueryResult(message);
      break;
    case "tableSchema":
      handleTableSchema(message);
      break;
    case "tableData":
      handleTableData(message);
      break;
    case "error":
      handleError(message);
      break;
    default:
      console.log("Unknown message type:", message.type);
  }
}

/**
 * Handle database connection
 */
function handleConnect() {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  const currentState = getCurrentState ? getCurrentState() : {};

  // Update button to show connecting state
  if (elements.connectBtn) {
    elements.connectBtn.disabled = true;
    elements.connectBtn.innerHTML = `
      <div class="button-spinner"></div>
      Connecting...
    `;
    elements.connectBtn.classList.add("connecting");
  }

  // Update connection status in header
  if (typeof updateConnectionStatus !== "undefined") {
    updateConnectionStatus(false, "Connecting...");
  }

  // Get the encryption key and store it in state
  const encryptionKey = elements.encryptionKeyInput
    ? elements.encryptionKeyInput.value
    : "";

  // Update state with the encryption key
  if (typeof updateState === "function") {
    updateState({ encryptionKey: encryptionKey });
  }

  // Send connect message to extension
  if (typeof vscode !== "undefined") {
    vscode.postMessage({
      type: "requestDatabaseInfo",
      key: encryptionKey,
    });
  }
}

/**
 * Handle query execution
 */
function handleExecuteQuery() {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  const query = elements.sqlQueryTextarea
    ? elements.sqlQueryTextarea.value.trim()
    : "";

  if (!query) {
    if (typeof showError !== "undefined") {
      showError("Please enter a SQL query");
    }
    return;
  }

  if (typeof showLoading !== "undefined") {
    showLoading("Executing query...");
  }

  // Send query to extension
  if (typeof vscode !== "undefined") {
    vscode.postMessage({
      type: "executeQuery",
      query: query,
    });
  }
}

/**
 * Handle update message from extension
 * @param {Object} message - Update message
 */
function handleUpdate(message) {
  if (typeof hideLoading !== "undefined") {
    hideLoading();
  }

  // Reset connect button state
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  if (elements.connectBtn) {
    elements.connectBtn.disabled = false;
    elements.connectBtn.classList.remove("connecting");
    if (message.isConnected) {
      elements.connectBtn.innerHTML = "Connected";
      elements.connectBtn.classList.add("connected");
    } else {
      elements.connectBtn.innerHTML = "Connect with Key";
      elements.connectBtn.classList.remove("connected");
    }
  }

  // Get current state to preserve encryption key
  const currentState =
    typeof getCurrentState === "function" ? getCurrentState() : {};

  if (typeof updateState !== "undefined") {
    updateState({
      databasePath: message.databasePath,
      isConnected: message.isConnected,
      connectionError: message.connectionError,
      // Preserve the encryption key from current state
      encryptionKey: currentState.encryptionKey || "",
    });
  }

  if (typeof updateConnectionStatus !== "undefined") {
    updateConnectionStatus(message.isConnected, message.connectionError);
  }

  if (message.tables) {
    displayTablesList(message.tables);
  }

  if (message.isConnected && typeof showSuccess !== "undefined") {
    showSuccess("Connected to database successfully!");
  } else if (
    !message.isConnected &&
    message.connectionError &&
    typeof showError !== "undefined"
  ) {
    showError(`Connection failed: ${message.connectionError}`);
  }
}

/**
 * Handle database info message
 * @param {object} message - Message object
 */
function handleDatabaseInfo(message) {
  console.log("handleDatabaseInfo called with message:", message);

  if (typeof hideLoading !== "undefined") {
    hideLoading();
  }

  // Reset connect button state regardless of success/failure
  const elements = getAllDOMElements ? getAllDOMElements() : {};

  if (message.success) {
    console.log("Database connection successful");

    if (typeof updateState !== "undefined") {
      updateState({ isConnected: true, connectionError: null });
    }

    // Update connect button to show connected state
    if (elements.connectBtn) {
      elements.connectBtn.disabled = false;
      elements.connectBtn.classList.remove("connecting");
      elements.connectBtn.classList.add("connected");
      elements.connectBtn.innerHTML = "Connected";
    }

    // Update connection status in header
    if (typeof updateConnectionStatus !== "undefined") {
      updateConnectionStatus(true, null);
    }

    // Hide connection section since we're connected
    console.log("Calling hideConnectionSection...");
    hideConnectionSection();

    if (typeof displayTablesList !== "undefined") {
      displayTablesList(message.tables);
    }

    if (typeof showSuccess !== "undefined") {
      showSuccess("Database connected successfully!");
    }
  } else {
    console.log("Database connection failed:", message.error);

    if (typeof updateState !== "undefined") {
      updateState({ isConnected: false, connectionError: message.error });
    }

    // Reset connect button to allow retry
    if (elements.connectBtn) {
      elements.connectBtn.disabled = false;
      elements.connectBtn.classList.remove("connecting", "connected");
      elements.connectBtn.innerHTML = "Connect with Key";
    }

    // Update connection status in header
    if (typeof updateConnectionStatus !== "undefined") {
      updateConnectionStatus(false, message.error);
    }

    // Show connection section for retry when database is disconnected
    console.log("Database connection failed, showing connection section");
    showConnectionSection();

    if (typeof showError !== "undefined") {
      showError(`Connection failed: ${message.error}`);
    }
  }
}

/**
 * Handle query result message
 * @param {Object} message - Query result message
 */
function handleQueryResult(message) {
  if (typeof hideLoading !== "undefined") {
    hideLoading();
  }

  if (message.success) {
    displayQueryResults(message.data, message.columns);

    const rowCount = message.data.length;
    const rowText = rowCount === 1 ? "row" : "rows";
    if (typeof showSuccess !== "undefined") {
      showSuccess(
        `Query executed successfully. ${rowCount} ${rowText} returned.`
      );
    }
  } else {
    if (typeof showError !== "undefined") {
      showError("Query execution failed");
    }
  }
}

/**
 * Handle error message
 * @param {object} message - Message object
 */
/**
 * Handle table schema message
 * @param {Object} message - Table schema message
 */
function handleTableSchema(message) {
  if (message.success) {
    displayTableSchema(message.data, message.columns);
  } else {
    if (typeof showError !== "undefined") {
      showError(`Failed to load table schema: ${message.tableName}`);
    }
  }
}

/**
 * Handle table data message
 * @param {Object} message - Table data message
 */
function handleTableData(message) {
  if (message.success) {
    displayTableData(message.data, message.columns, message.tableName, {
      page: message.page,
      pageSize: message.pageSize,
      totalRows: message.totalRows
    });
  } else {
    if (typeof showError !== "undefined") {
      showError(`Failed to load data for table: ${message.tableName}`);
    }
  }
}

/**
 * Display list of tables
 * @param {Array} tables - Array of table names
 */
function displayTablesList(tables) {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  console.log("displayTablesList called with:", tables);
  console.log("tablesListElement:", elements.tablesListElement);

  if (!elements.tablesListElement) {
    console.error("tablesListElement not found!");
    return;
  }

  if (!tables || tables.length === 0) {
    elements.tablesListElement.innerHTML =
      '<div class="info">No tables found</div>';
    return;
  }

  elements.tablesListElement.innerHTML = tables
    .map(
      (table) => `
        <div class="table-item" data-table="${table.name}">
          <span class="table-name">${table.name}</span>
        </div>
      `
    )
    .join("");

  console.log("Tables HTML generated, adding event listeners...");

  // Add click handlers for table items
  elements.tablesListElement.querySelectorAll(".table-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      console.log("Table item clicked:", item.dataset.table);
      const tableName = item.dataset.table;
      if (tableName) {
        // Highlight selected table
        elements.tablesListElement
          .querySelectorAll(".table-item")
          .forEach((el) => {
            el.classList.remove("selected");
          });
        item.classList.add("selected");

        if (typeof updateState !== "undefined") {
          updateState({ selectedTable: tableName });
        }

        // Request table schema by default when clicking on table name
        if (typeof vscode !== "undefined") {
          vscode.postMessage({
            type: "getTableSchema",
            tableName: tableName,
          });
        }

        if (typeof switchTab !== "undefined") {
          switchTab("schema");
        }
      }
    });
  });

  console.log("Event listeners added to", tables.length, "tables");
}

/**
 * Display query results
 * @param {Array} data - Query result data
 * @param {Array} columns - Column names
 */
function displayQueryResults(data, columns) {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  if (!elements.queryResults) {
    return;
  }

  if (!data || data.length === 0) {
    elements.queryResults.innerHTML =
      '<div class="info">Query returned no results</div>';
    return;
  }

  const table = createDataTable ? createDataTable(data, columns, "query") : "";
  elements.queryResults.innerHTML = `
    <div class="table-stats">
      <div class="stat">
        <div class="stat-label">Rows</div>
        <div class="stat-value">${data.length}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Columns</div>
        <div class="stat-value">${columns.length}</div>
      </div>
    </div>
    ${table}
  `;

  // Initialize table features for the new table
  const tableWrapper = elements.queryResults.querySelector(
    ".enhanced-table-wrapper"
  );
  if (tableWrapper && typeof initializeTableEvents !== "undefined") {
    initializeTableEvents(tableWrapper);
  }
}

/**
 * Display table schema
 * @param {Array} data - Schema data
 * @param {Array} columns - Column names
 */
function displayTableSchema(data, columns) {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  const currentState = getCurrentState ? getCurrentState() : {};

  if (!elements.schemaContent) {
    return;
  }

  if (!data || data.length === 0) {
    elements.schemaContent.innerHTML =
      '<div class="info">No schema information available</div>';
    return;
  }

  const table = createDataTable ? createDataTable(data, columns, "schema") : "";
  elements.schemaContent.innerHTML = table;

  // Initialize table features for the new table
  const tableWrapper = elements.schemaContent.querySelector(
    ".enhanced-table-wrapper"
  );
  if (tableWrapper && typeof initializeTableEvents !== "undefined") {
    initializeTableEvents(tableWrapper);
  }
}

/**
 * Display table data
 * @param {Array} data - Table data
 * @param {Array} columns - Column names
 * @param {string} tableName - Table name
 * @param {Object} options - Display options including pagination
 */
function displayTableData(data, columns, tableName, options = {}) {
  const elements = getAllDOMElements ? getAllDOMElements() : {};

  if (!elements.dataContent) {
    return;
  }

  if (!data || data.length === 0) {
    elements.dataContent.innerHTML = `<div class="info">No data found in table: ${tableName}</div>`;
    return;
  }

  const table = createDataTable
    ? createDataTable(data, columns, tableName, options)
    : "";
  const rowText = data.length === 1 ? "row" : "rows";

  // Create inline statistics for the table controls
  const inlineStats = `
    <div class="table-inline-stats">
      <div class="stat-item">
        <span class="stat-label">Records</span>
        <span class="stat-value">${data.length} ${rowText}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Columns</span>
        <span class="stat-value">${columns.length}</span>
      </div>
    </div>
  `;

  elements.dataContent.innerHTML = table;

  // Add inline statistics to table controls after table is created
  const tableControls = elements.dataContent.querySelector(
    ".table-controls .table-actions"
  );
  if (tableControls) {
    tableControls.insertAdjacentHTML("beforebegin", inlineStats);
  }

  // Initialize table features for the new table
  const tableWrapper = elements.dataContent.querySelector(
    ".enhanced-table-wrapper"
  );
  if (tableWrapper && typeof initializeTableEvents !== "undefined") {
    initializeTableEvents(tableWrapper);
  }
}

/**
 * Initialize table-specific events
 * @param {Element} tableWrapper - Table wrapper element
 */
function initializeTableEvents(tableWrapper) {
  if (!tableWrapper) {
    return;
  }

  const searchInput = tableWrapper.querySelector(".search-input");
  const clearBtn = tableWrapper.querySelector(".search-clear");

  // Search functionality
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const searchTerm = e.target.value;
      if (typeof filterTable !== "undefined") {
        filterTable(tableWrapper, searchTerm);
      }
    });
  }

  // Clear search
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        if (typeof filterTable !== "undefined") {
          filterTable(tableWrapper, "");
        }
      }
    });
  }

  // Column header clicks for sorting
  const headers = tableWrapper.querySelectorAll(".sortable-header");
  headers.forEach((header) => {
    header.addEventListener("click", (e) => {
      // Don't sort if clicking on action buttons or resize handles
      if (
        e.target.classList.contains("column-action-btn") ||
        e.target.classList.contains("pin-btn") ||
        e.target.classList.contains("column-resize-handle")
      ) {
        return;
      }

      const column = parseInt(header.dataset.column);
      const table = header.closest(".data-table");
      if (typeof sortTableByColumn !== "undefined") {
        sortTableByColumn(table, column);
      }
    });
  });

  // Column action buttons (including pin buttons)
  const actionBtns = tableWrapper.querySelectorAll(
    ".column-action-btn, .pin-btn"
  );
  actionBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent sorting when clicking action buttons

      const action = btn.dataset.action;
      const column = parseInt(btn.dataset.column);
      const table = btn.closest(".data-table");

      switch (action) {
        case "pin":
          if (typeof toggleColumnPin !== "undefined") {
            toggleColumnPin(table, column);
          }
          break;
        case "filter":
          if (typeof showColumnFilter !== "undefined") {
            showColumnFilter(table, column);
          }
          break;
      }
    });

    // Add keyboard support for pin buttons
    btn.addEventListener("keydown", (e) => {
      const keyEvent = /** @type {KeyboardEvent} */ (e);
      if (keyEvent.key === "Enter" || keyEvent.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        /** @type {HTMLButtonElement} */ (btn).click(); // Trigger the click event
      }
    });
  });

  // Table action buttons
  const tableActionBtns = tableWrapper.querySelectorAll(".table-action-btn");
  tableActionBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const action = btn.dataset.action;

      switch (action) {
        case "pin-first":
          const table = tableWrapper.querySelector(".data-table");
          if (typeof toggleColumnPin !== "undefined") {
            toggleColumnPin(table, 0);
          }
          break;
        case "export":
          if (typeof exportTableData !== "undefined") {
            exportTableData(tableWrapper);
          }
          break;
        case "refresh":
          if (typeof refreshTableData !== "undefined") {
            refreshTableData(tableWrapper);
          }
          break;
      }
    });
  });

  // Pagination controls
  const paginationControls = tableWrapper.querySelector(".pagination-controls");
  if (paginationControls) {
    paginationControls.addEventListener("click", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target && target.classList.contains("pagination-btn")) {
        const action = target.dataset.action;
        const page = target.dataset.page;
        
        if (typeof handlePagination !== "undefined") {
          handlePagination(tableWrapper, action, page);
        }
      }
    });
  }

  // Page size selector
  const pageSizeSelect = tableWrapper.querySelector(".page-size-select");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", (e) => {
      const target = /** @type {HTMLSelectElement} */ (e.target);
      const newPageSize = parseInt(target.value);
      if (typeof handlePageSizeChange !== "undefined") {
        handlePageSizeChange(tableWrapper, newPageSize);
      }
    });
  }

  // Page input with go button
  const pageInput = /** @type {HTMLInputElement} */ (tableWrapper.querySelector(".page-input"));
  const goButton = tableWrapper.querySelector('[data-action="go"]');
  
  if (pageInput && goButton) {
    const handleGoToPage = () => {
      const pageNumber = parseInt(pageInput.value);
      if (typeof handlePagination !== "undefined") {
        handlePagination(tableWrapper, "goto", pageNumber);
      }
    };
    
    goButton.addEventListener("click", handleGoToPage);
    pageInput.addEventListener("keypress", (e) => {
      const keyEvent = /** @type {KeyboardEvent} */ (e);
      if (keyEvent.key === "Enter") {
        e.preventDefault();
        handleGoToPage();
      }
    });
  }

  // Initialize resizing
  if (typeof initializeResizing !== "undefined") {
    initializeResizing(tableWrapper);
  }

  // Initialize table layout
  if (typeof initializeTableLayout !== "undefined") {
    initializeTableLayout(tableWrapper);
  }

  // Add resize observer for dynamic adjustments
  if (typeof addResizeObserver !== "undefined") {
    addResizeObserver(tableWrapper);
  }
}

/**
 * Show connection section for key input
 */
function showConnectionSection() {
  console.log("showConnectionSection called");
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  console.log("connectionSection element:", elements.connectionSection);
  if (elements.connectionSection) {
    elements.connectionSection.classList.remove("hidden");
    elements.connectionSection.classList.add("visible");
    console.log("Connection section shown");
  } else {
    console.log("Connection section element not found");
  }
}

/**
 * Hide connection section after successful connection
 */
function hideConnectionSection() {
  console.log("hideConnectionSection called");
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  console.log("connectionSection element:", elements.connectionSection);
  if (elements.connectionSection) {
    elements.connectionSection.classList.remove("visible");
    elements.connectionSection.classList.add("hidden");
    console.log("Connection section hidden");
  } else {
    console.log("Connection section element not found");
  }
}

/**
 * Try initial connection without key
 */
function tryInitialConnection() {
  console.log("tryInitialConnection called");
  if (typeof vscode !== "undefined") {
    console.log("Sending requestDatabaseInfo message without key");
    vscode.postMessage({
      type: "requestDatabaseInfo",
      key: "", // Try without key first
    });
  } else {
    console.log("vscode API not available");
  }
}

/**
 * Force hide query editor in non-query tabs
 */
function enforceQueryEditorVisibility() {
  const queryEditor = document.querySelector(".query-editor");
  const schemaPanel = document.getElementById("schema-panel");
  const dataPanel = document.getElementById("data-panel");

  if (queryEditor && schemaPanel && dataPanel) {
    // If query editor is somehow in schema or data panel, hide it
    if (schemaPanel.contains(queryEditor) || dataPanel.contains(queryEditor)) {
      queryEditor.style.display = "none";
      queryEditor.style.visibility = "hidden";
    }

    // Double-check by looking for any textareas in wrong places
    const schemaTextareas = schemaPanel.querySelectorAll("textarea");
    const dataTextareas = dataPanel.querySelectorAll("textarea");

    schemaTextareas.forEach((textarea) => {
      textarea.style.display = "none";
      textarea.style.visibility = "hidden";
    });

    dataTextareas.forEach((textarea) => {
      textarea.style.display = "none";
      textarea.style.visibility = "hidden";
    });
  }
}

/**
 * Initialize query editor visibility enforcement
 */
function initializeQueryEditorVisibility() {
  enforceQueryEditorVisibility();

  // Also enforce on tab changes
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setTimeout(enforceQueryEditorVisibility, 10);
    });
  });

  // And on any DOM changes
  const observer = new MutationObserver(enforceQueryEditorVisibility);
  observer.observe(document.body, { childList: true, subtree: true });
}

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    initializeEventListeners,
    handleGlobalKeyboard,
    handleExtensionMessage,
    handleConnect,
    handleExecuteQuery,
    handleDatabaseInfo,
    handleError,
    displayTablesList,
    displayQueryResults,
    displayTableSchema,
    displayTableData,
    initializeTableEvents,
    initializeQueryEditorVisibility,
    enforceQueryEditorVisibility,
    showConnectionSection,
    hideConnectionSection,
    tryInitialConnection,
  };
}

// Make functions available globally for cross-module access
if (typeof window !== "undefined") {
  /** @type {any} */ (window).showConnectionSection = showConnectionSection;
  /** @type {any} */ (window).hideConnectionSection = hideConnectionSection;
  /** @type {any} */ (window).tryInitialConnection = tryInitialConnection;
}
