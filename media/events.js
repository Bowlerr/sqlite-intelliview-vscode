// @ts-check

/**
 * Event handling for the SQLite IntelliView
 */

/**
 * Initialize all event listeners
 */
/**
 * Handle error message
 * @param {Object} message - Error message
 */
function handleError(message) {
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
 * Used to guard against duplicate global event listener registration.
 * @type {boolean|undefined}
 */
window._eventListenersInitialized;

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
  // Enhanced diagnostic: log each call, guard state, and stack trace
  console.log(
    "[events.js] initializeEventListeners called. Guard:",
    window["_eventListenersInitialized"],
    "Stack:",
    new Error().stack
  );
  /** @type {any} */
  if (window["_eventListenersInitialized"]) {
    console.log(
      "[events.js] initializeEventListeners: Guard true, skipping registration."
    );
    return;
  }
  // Register global event listeners only once per webview lifecycle
  window.addEventListener("message", handleExtensionMessage);
  document.addEventListener("keydown", handleGlobalKeyboard);

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
      if (
        /** @type {any} */ (window).queryEditor &&
        /** @type {any} */ (window).queryEditor.clearEditor
      ) {
        /** @type {any} */ (window).queryEditor.clearEditor();
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

  window["_eventListenersInitialized"] = true;
  console.log("[events.js] Event listeners registered. Guard set to true.");
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
    // Clear query through the Monaco editor if available
    if (window.queryEditor && window.queryEditor.clearEditor) {
      window.queryEditor.clearEditor();
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
    case "tableData":
      handleTableData(message);
      break;
    case "tableDataDelta":
      handleTableDataDelta(message);
      break;
    case "queryResult":
      handleQueryResult(message);
      break;
    case "tableSchema":
      handleTableSchema(message);
      break;
    case "erDiagram":
      handleERDiagram(message);
      break;
    case "erDiagramProgress":
      handleERDiagramProgress(message);
      break;
    case "error":
      handleError(message);
      break;
    case "cellUpdateSuccess":
      handleCellUpdateSuccess(message);
      break;
    case "cellUpdateError":
      handleCellUpdateError(message);
      break;
    case "deleteRowSuccess":
      handleDeleteRowSuccess(message);
      break;
    case "deleteRowError":
      handleDeleteRowError(message);
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

  // Get query from enhanced editor if available, otherwise use fallback
  let query = "";

  if (
    /** @type {any} */ (window).queryEditor &&
    /** @type {any} */ (window).queryEditor.getValue
  ) {
    query = /** @type {any} */ (window).queryEditor.getValue().trim();
  }

  if (!query) {
    if (typeof showError !== "undefined") {
      showError("Please enter a SQL query");
    }
    return;
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
  if (message.success) {
    // Replace displayQueryResults to use modal
    function displayQueryResults(data, columns) {
      let html = "";
      if (!data || data.length === 0) {
        html = `<div class="no-results"><h3>No Results</h3><p>Query executed successfully but returned no data.</p></div>`;
        window.showResultsModal(html);
        return;
      }
      let table = "";
      if (typeof createDataTable === "function") {
        table = createDataTable(data, columns, "query-result");
      } else {
        table = "<div>Table rendering unavailable</div>";
      }
      html = `<div class="table-container">${table}</div>`;
      window.showResultsModal(html);
    }

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

  // Dispatch event to notify query completion (for editor focus restoration)
  const event = new CustomEvent("queryExecutionComplete", {
    detail: {
      success: message.success,
      rowCount: message.success ? message.data.length : 0,
    },
  });
  document.dispatchEvent(event);

  // Additional direct focus restoration for Monaco editor
  setTimeout(() => {
    if (window.queryEditor && window.queryEditor.editor) {
      const editor = window.queryEditor.editor;

      // Force the editor to regain focus and responsiveness
      try {
        console.log("handleQueryResult: Restoring Monaco editor focus");

        // Check if editor is still responsive
        const model = editor.getModel();
        if (model) {
          // Force layout recalculation
          editor.layout();

          // Ensure editor has focus
          if (!editor.hasTextFocus()) {
            editor.focus();
          }

          // Make sure the editor's DOM is interactive
          const editorDom = editor.getDomNode();
          if (editorDom) {
            const textarea = editorDom.querySelector("textarea");
            if (textarea) {
              // Briefly focus the internal textarea to ensure it's active
              textarea.focus();
              textarea.blur();
              editor.focus();
            }
          }
        }
      } catch (error) {
        console.error(
          "handleQueryResult: Error restoring editor focus:",
          error
        );
        // If restoration fails, trigger a refresh
        if (window.queryEditor.refreshEditor) {
          window.queryEditor.refreshEditor();
        }
        handleTableData(message);
        return;
      }
    }
  }, 100);
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
    displayTableSchema(message.data, message.columns, message.foreignKeys);
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
    // Store full column info (with fk metadata) for robust FK patching
    if (
      message.columnInfo &&
      Array.isArray(message.columnInfo) &&
      message.tableName
    ) {
      if (!window.currentTableSchema) {
        window.currentTableSchema = {};
      }
      window.currentTableSchema[message.tableName] = message.columnInfo;
    }
    displayTableData(message.data, message.columns, message.tableName, {
      page: message.page,
      pageSize: message.pageSize,
      totalRows: message.totalRows,
      foreignKeys: message.foreignKeys,
    });
  } else {
    if (typeof showError !== "undefined") {
      showError(`Failed to load data for table: ${message.tableName}`);
    }
  }
}

/**
 * Handle ER diagram message
 * @param {Object} message - ER diagram message
 */
function handleERDiagram(message) {
  console.log("Received ER diagram message:", message);

  if (message.success) {
    // Add debug information about the received data
    if (typeof addDebugMessage !== "undefined") {
      addDebugMessage("Received ER diagram data from extension");
      addDebugMessage(
        `Found ${message.tables ? message.tables.length : 0} tables`
      );
      addDebugMessage(
        `Found ${
          message.relationships ? message.relationships.length : 0
        } relationships`
      );
    }

    if (typeof updateDiagramProgress !== "undefined") {
      updateDiagramProgress("Processing database schema information");
    }

    if (typeof handleERDiagramData !== "undefined") {
      handleERDiagramData(message);
    }
  } else {
    console.error("ER diagram generation failed:", message);

    if (typeof addDebugMessage !== "undefined") {
      addDebugMessage("ERROR: ER diagram generation failed");
      addDebugMessage(`Error details: ${message.error || "Unknown error"}`);
    }

    // Update connection state if it's a connection error
    if (
      message.error &&
      (message.error.includes("database is locked") ||
        message.error.includes("file is not a database") ||
        message.error.includes("file is encrypted") ||
        message.error.includes("decrypt"))
    ) {
      if (typeof updateState !== "undefined") {
        updateState({
          isConnected: false,
          connectionError: message.error,
        });
      }
    }

    // Show error instead of loading
    if (typeof showDiagramError !== "undefined") {
      showDiagramError(message.error || "Unknown error");
    } else if (typeof showError !== "undefined") {
      showError(
        "Failed to generate ER diagram: " + (message.error || "Unknown error")
      );
    }
  }
}

/**
 * Handle ER diagram progress updates
 * @param {Object} message - Progress message
 */
function handleERDiagramProgress(message) {
  console.log("Received ER diagram progress:", message);

  if (typeof updateDiagramProgress !== "undefined") {
    updateDiagramProgress(message.message);
  }

  if (typeof addDebugMessage !== "undefined") {
    addDebugMessage(`Progress: ${message.message}`);
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

        // Update minimized sidebar with selected table
        if (window.updateSelectedTableSafe) {
          window.updateSelectedTableSafe(tableName);
        } else if (window.resizableSidebar) {
          window.resizableSidebar.updateSelectedTable(tableName);
        }

        // Request table schema by default when clicking on table name
        if (typeof vscode !== "undefined") {
          vscode.postMessage({
            type: "getTableSchema",
            tableName: tableName,
          });
          // Also request table data to refresh the Data tab
          let pageSize = 100;
          if (
            typeof window !== "undefined" &&
            typeof window.getCurrentState === "function"
          ) {
            const state = window.getCurrentState();
            if (state && state.pageSize) {
              pageSize = state.pageSize;
            }
          }
          vscode.postMessage({
            type: "getTableData",
            tableName: tableName,
            page: 1,
            pageSize: pageSize, // Use persisted pageSize from state
          });
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
// Replace displayQueryResults to use modal
function displayQueryResults(data, columns) {
  let html = "";
  if (!data || data.length === 0) {
    html = `<div class="no-results"><h3>No Results</h3><p>Query executed successfully but returned no data.</p></div>`;
    window.showResultsModal(html);
    return;
  }
  let table = "";
  if (typeof createDataTable === "function") {
    table = createDataTable(data, columns, "query-result");
  } else {
    table = "<div>Table rendering unavailable</div>";
  }
  html = `<div class="table-container">${table}</div>`;
  window.showResultsModal(html);
}

/**
 * Restore Monaco editor state after DOM manipulation
 * @param {Object} editorState - Stored editor state
 */
function restoreEditorState(editorState) {
  if (!window.queryEditor || !window.queryEditor.editor) {
    return;
  }

  try {
    const editor = window.queryEditor.editor;
    console.log("restoreEditorState: Restoring editor state", editorState);

    // Force layout recalculation
    editor.layout();

    // Restore position and selection
    if (editorState.position) {
      editor.setPosition(editorState.position);
    }
    if (editorState.selection) {
      editor.setSelection(editorState.selection);
    }

    // Restore scroll position
    if (editorState.scrollTop !== undefined) {
      editor.setScrollTop(editorState.scrollTop);
    }
    if (editorState.scrollLeft !== undefined) {
      editor.setScrollLeft(editorState.scrollLeft);
    }

    // Restore focus if it was focused before
    if (editorState.hasFocus) {
      editor.focus();

      // Ensure the editor's internal textarea is properly focused
      const editorDom = editor.getDomNode();
      if (editorDom) {
        const textarea = editorDom.querySelector("textarea");
        if (textarea) {
          textarea.focus();
          textarea.blur();
          editor.focus();
        }
      }
    }

    console.log("restoreEditorState: Editor state restored successfully");
  } catch (error) {
    console.error("restoreEditorState: Error restoring editor state:", error);
  }
}

/**
 * Display table schema
 * @param {Array} data - Schema data
 * @param {Array} columns - Column names
 * @param {Array} foreignKeys - Foreign key information
 */
function displayTableSchema(data, columns, foreignKeys = []) {
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

  const table = createDataTable
    ? createDataTable(data, columns, "schema", { foreignKeys })
    : "";
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

  elements.dataContent.innerHTML = table;

  // Initialize table features for the new table
  const tableWrapper = elements.dataContent.querySelector(
    ".enhanced-table-wrapper"
  );
  if (tableWrapper && typeof initializeTableEvents !== "undefined") {
    initializeTableEvents(tableWrapper);
  }

  // Check for pending foreign key highlight
  if (tableWrapper && typeof highlightForeignKeyTarget !== "undefined") {
    // Use setTimeout to ensure DOM is fully rendered and table is ready
    setTimeout(() => {
      highlightForeignKeyTarget(tableWrapper);
    }, 250);
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

  // Guard only static elements (search, pagination, etc)
  if (tableWrapper.getAttribute("data-table-events-initialized") === "true") {
    console.log(
      "[events.js] Table static events already initialized for this wrapper, skipping static attach.",
      tableWrapper
    );
  } else {
    // Mark as initialized
    tableWrapper.setAttribute("data-table-events-initialized", "true");
    console.log(
      "[events.js] Initializing static table events for wrapper:",
      tableWrapper
    );

    // Initialize resizing functionality
    if (typeof initializeResizing === "function") {
      initializeResizing(tableWrapper);
    }
    if (typeof initializeTableLayout === "function") {
      initializeTableLayout(tableWrapper);
    }
    if (typeof addResizeObserver === "function") {
      addResizeObserver(tableWrapper);
    }
    const searchInput = tableWrapper.querySelector(".search-input");
    const clearBtn = tableWrapper.querySelector(".search-clear");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value;
        if (typeof filterTable !== "undefined") {
          filterTable(tableWrapper, searchTerm);
        }
      });
    }
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
        e.stopPropagation();
        const action = btn.dataset.action;
        const column = btn.dataset.column;
        const table = btn.closest(".data-table");
        if (action === "pin" && typeof toggleColumnPin !== "undefined") {
          toggleColumnPin(table, parseInt(column));
        }
      });
    });
    // Pagination controls
    const paginationBtns = tableWrapper.querySelectorAll(".pagination-btn");
    paginationBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tableWrapper = btn.closest(".enhanced-table-wrapper");
        const action = btn.dataset.action;
        if (typeof handlePagination !== "undefined") {
          handlePagination(tableWrapper, action);
        }
      });
    });
    // Page size selector
    const pageSizeSelect = tableWrapper.querySelector(".page-size-select");
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener("change", (e) => {
        const tableWrapper = e.target.closest(".enhanced-table-wrapper");
        if (typeof handlePageSizeChange !== "undefined") {
          handlePageSizeChange(tableWrapper, parseInt(e.target.value));
        }
      });
    }
    // Export button
    const exportBtn = tableWrapper.querySelector('[data-action="export"]');
    if (exportBtn) {
      exportBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const tableWrapper = e.target.closest(".enhanced-table-wrapper");
        if (typeof exportTableData !== "undefined") {
          exportTableData(tableWrapper);
        }
      });
    }
  }

  // Always (re-)attach row/cell listeners to new/uninitialized rows
  const dataRows = tableWrapper.querySelectorAll("tr[data-row-index]");
  dataRows.forEach((row) => {
    if (row.getAttribute("data-row-events-initialized") === "true") {
      return;
    }
    row.setAttribute("data-row-events-initialized", "true");
    // Cell editing functionality - only for editable cells
    const dataCells = row.querySelectorAll(".data-cell[data-editable='true']");
    dataCells.forEach((cell) => {
      cell.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startCellEditing(cell);
      });
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          startCellEditing(cell);
        }
      });
    });
    // Cell editing controls
    const saveButtons = row.querySelectorAll(".cell-save-btn");
    const cancelButtons = row.querySelectorAll(".cell-cancel-btn");
    const cellInputs = row.querySelectorAll(".cell-input");
    saveButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cell = btn.closest(".data-cell");
        saveCellEdit(cell);
      });
    });
    cancelButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cell = btn.closest(".data-cell");
        cancelCellEdit(cell);
      });
    });
    cellInputs.forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const cell = input.closest(".data-cell");
          saveCellEdit(cell);
        } else if (e.key === "Escape") {
          e.preventDefault();
          const cell = input.closest(".data-cell");
          cancelCellEdit(cell);
        }
      });
      input.addEventListener("blur", (e) => {
        setTimeout(() => {
          const cell = input.closest(".data-cell");
          if (cell && cell.classList.contains("editing")) {
            saveCellEdit(cell);
          }
        }, 150);
      });
    });
    console.log("[events.js] Row/cell events initialized for row:", row);
  });

  // After initializing row/cell events for new rows, ensure resizing is re-initialized
  if (typeof initializeResizing === "function" && tableWrapper) {
    console.log(
      "[events.js] Re-initializing resizing after row/cell event attachment"
    );
    initializeResizing(tableWrapper);
  }
}

/**
 * Start editing a cell
 * @param {Element} cell - The cell element to edit
 */
function startCellEditing(cell) {
  if (!cell || cell.classList.contains("editing")) {
    return;
  }

  // Only allow editing for cells marked as editable
  if (!cell.hasAttribute("data-editable")) {
    console.log("Cell is not editable (schema or query result)");
    return;
  }

  // Cancel any other editing cells
  const table = cell.closest(".data-table");
  const otherEditingCells = table.querySelectorAll(".data-cell.editing");
  otherEditingCells.forEach((otherCell) => {
    if (otherCell !== cell) {
      cancelCellEdit(otherCell);
    }
  });

  // Get current value
  const cellContent = cell.querySelector(".cell-content");
  const originalValue = cellContent.getAttribute("data-original-value") || "";
  const isNull =
    cellContent.querySelector("em") &&
    cellContent.textContent.trim() === "NULL";
  const currentValue = isNull ? "" : originalValue;

  // Set up editing state
  cell.classList.add("editing");
  const input = cell.querySelector(".cell-input");
  if (input) {
    /** @type {HTMLInputElement} */ (input).value = currentValue;
    // Use setTimeout to ensure the input is visible and focusable
    setTimeout(() => {
      /** @type {HTMLInputElement} */ (input).focus();
      /** @type {HTMLInputElement} */ (input).select();
    }, 10);
  } else {
    console.error("Cell input not found!", cell);
  }
}

/**
 * Save cell edit
 * @param {Element} cell - The cell element being edited
 */
function saveCellEdit(cell) {
  if (!cell || !cell.classList.contains("editing")) {
    return;
  }

  const input = cell.querySelector(".cell-input");
  if (!input) {
    return;
  }

  const newValue = /** @type {HTMLInputElement} */ (input).value;
  const originalValue =
    cell.querySelector(".cell-content")?.getAttribute("data-original-value") ||
    "";

  // Check if value actually changed
  if (newValue === originalValue) {
    cancelCellEdit(cell);
    return;
  }

  // Get cell metadata
  const tableName = getCurrentTableName();
  const rowIndex = parseInt(cell.getAttribute("data-row-index"));
  const columnName = cell.getAttribute("data-column-name");

  if (!tableName || isNaN(rowIndex) || !columnName) {
    console.error("Missing cell metadata for update");
    cancelCellEdit(cell);
    return;
  }

  // Show saving state
  cell.classList.add("saving");
  cell.classList.remove("error");

  // Send update request to backend
  if (typeof vscode !== "undefined") {
    const currentState = getCurrentState ? getCurrentState() : {};
    vscode.postMessage({
      type: "updateCellData",
      tableName: tableName,
      rowIndex: rowIndex,
      columnName: columnName,
      newValue: newValue,
      key: currentState.encryptionKey,
    });
  } else {
    console.error("vscode API not available");
    cancelCellEdit(cell);
  }
}

/**
 * Cancel cell edit
 * @param {Element} cell - The cell element being edited
 */
function cancelCellEdit(cell) {
  if (!cell) {
    return;
  }

  cell.classList.remove("editing", "saving", "error");
  const input = cell.querySelector(".cell-input");
  if (input) {
    /** @type {HTMLInputElement} */ (input).value = "";
  }
}

/**
 * Handle successful cell update
 * @param {Object} message - Success message from backend
 */
function handleCellUpdateSuccess(message) {
  const { tableName, rowIndex, columnName, newValue } = message;

  // Find the cell that was updated
  const cell = document.querySelector(
    `.data-cell[data-row-index="${rowIndex}"][data-column-name="${columnName}"]`
  );

  if (cell) {
    // Update the cell content
    const cellContent = cell.querySelector(".cell-content");
    if (cellContent) {
      cellContent.setAttribute("data-original-value", newValue || "");

      if (newValue === null || newValue === "") {
        cellContent.innerHTML = "<em>NULL</em>";
      } else {
        cellContent.textContent = newValue;
      }
    }

    // Remove editing state
    cell.classList.remove("editing", "saving", "error");

    // Show success feedback
    cell.style.backgroundColor = "var(--vscode-list-activeSelectionBackground)";
    setTimeout(() => {
      cell.style.backgroundColor = "";
    }, 1000);
  }

  if (typeof showSuccess !== "undefined") {
    showSuccess(`Cell updated successfully`);
  }
}

/**
 * Handle failed cell update
 * @param {Object} message - Error message from backend
 */
function handleCellUpdateError(message) {
  const { tableName, rowIndex, columnName } = message;

  // Find the cell that failed to update
  const cell = document.querySelector(
    `.data-cell[data-row-index="${rowIndex}"][data-column-name="${columnName}"]`
  );

  if (cell) {
    cell.classList.remove("saving");
    cell.classList.add("error");

    // Keep editing mode active so user can retry
    setTimeout(() => {
      cell.classList.remove("error");
    }, 3000);
  }

  if (typeof showError !== "undefined") {
    showError(`Failed to update cell: ${message.message}`);
  }
}

/**
 * Handle successful row deletion
 * @param {Object} message - Success message from backend
 */
function handleDeleteRowSuccess(message) {
  const { tableName, rowId } = message;

  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).handleDeleteSuccess) === "function"
  ) {
    /** @type {any} */ (window).handleDeleteSuccess(message);
  }

  console.log(`Row deleted successfully from ${tableName}:`, rowId);
}

/**
 * Handle failed row deletion
 * @param {Object} message - Error message from backend
 */
function handleDeleteRowError(message) {
  const { tableName, rowId } = message;

  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).handleDeleteError) === "function"
  ) {
    /** @type {any} */ (window).handleDeleteError(message);
  }

  console.error(`Failed to delete row from ${tableName}:`, message.message);
}

/**
 * Get the current table name from the selected state
 * @returns {string|null} Current table name
 */
function getCurrentTableName() {
  const currentState = getCurrentState ? getCurrentState() : {};
  return currentState.selectedTable || null;
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

/**
 * Apply inserts, updates and deletes directly to the visible <tbody>
 * without disturbing your existing pagination/sizing/pinning
 */
function handleTableDataDelta({
  tableName,
  inserts = [],
  updates = [],
  deletes = [],
}) {
  console.log("[events.js] handleTableDataDelta called", {
    tableName,
    inserts,
    updates,
    deletes,
  });
  // Show notification about the update
  const ins = inserts.length;
  const upd = updates.length;
  const del = deletes.length;
  const noChanges = ins === 0 && upd === 0 && del === 0;

  const summary =
    `Table updated externally: ` +
    (noChanges
      ? `no changes detected in ${tableName} Table.`
      : "" +
        (ins > 0 ? `${ins} row${ins === 1 ? "" : "s"} inserted. ` : "") +
        (upd > 0 ? `${upd} row${upd === 1 ? "" : "s"} updated. ` : "") +
        (del > 0 ? `${del} row${del === 1 ? "" : "s"} deleted.` : ""));

  if (typeof window.showNotification === "function") {
    window.showNotification(summary, "info", 6000);
  }

  const wrapper = document.querySelector(
    `.enhanced-table-wrapper[data-table="${tableName}"]`
  );
  if (!wrapper) {
    console.warn("[events.js] No wrapper found for table", tableName);
    return;
  }
  const tbody = wrapper.querySelector("tbody");
  if (!tbody) {
    console.warn("[events.js] No tbody found for table", tableName);
    return;
  }

  //–– 1) APPLY UPDATES ––
  updates.forEach(({ rowIndex, rowData }) => {
    const row = tbody.querySelector(`tr[data-row-index="${rowIndex}"]`);
    if (!row) {
      console.warn("[events.js] No row found for update", rowIndex);
      return;
    }
    rowData.forEach((val, colIdx) => {
      const cell = row.children[colIdx];
      if (cell) {
        const cc = cell.querySelector(".cell-content");
        if (cc) {
          cc.textContent = val === null ? "" : String(val);
        }
      }
    });
  });

  //–– 2) APPLY INSERTS –– (in reverse so indices stay valid)
  inserts
    .sort((a, b) => b.rowIndex - a.rowIndex)
    .forEach(({ rowIndex, rowData }) => {
      // bump all existing ≥ rowIndex
      Array.from(tbody.querySelectorAll("tr")).forEach((r) => {
        const idxAttr = r.getAttribute("data-row-index");
        if (idxAttr !== null && !isNaN(+idxAttr)) {
          const idx = +idxAttr;
          if (idx >= rowIndex) {
            r.setAttribute("data-row-index", String(idx + 1));
          }
        }
      });
      // Use renderTableRows to generate the new row HTML, but robustly patch FK cells after creation
      let columns = Array.from(wrapper.querySelectorAll("thead th")).map((th) =>
        th.getAttribute("data-column-name")
      );
      // Fallback: if any column name is missing, try to get from global schema (handle window typing)
      /** @type {any} */ const win =
        typeof window !== "undefined" ? window : {};
      if (columns.some((c) => !c)) {
        if (
          win.currentTableSchema &&
          win.currentTableSchema[tableName] &&
          Array.isArray(win.currentTableSchema[tableName])
        ) {
          columns = win.currentTableSchema[tableName].map((col) => col.name);
          if (!columns || columns.length === 0) {
            console.warn(
              "[events.js] No columns found in global schema for table",
              tableName
            );
          }
        } else {
          console.warn(
            "[events.js] Some column names missing in <th> for table",
            tableName,
            columns
          );
        }
      }
      // Final fallback: replace any null/undefined with placeholder
      columns = columns.map((c, i) => c || `col_${i}`);
      const rowHtml = win.renderTableRows
        ? win.renderTableRows([rowData], rowIndex, columns)
        : "";
      // Parse the HTML string into a DOM node
      const temp = document.createElement("tbody");
      temp.innerHTML = rowHtml.trim();
      const newRow = temp.firstElementChild;
      // --- PATCH: Add FK cell attributes if foreign key info is available ---
      // Robustly detect FK metadata from all available sources
      let fkMeta = {};
      // 1. Try currentTableSchema[tableName] (preferred)
      if (
        win.currentTableSchema &&
        win.currentTableSchema[tableName] &&
        Array.isArray(win.currentTableSchema[tableName])
      ) {
        win.currentTableSchema[tableName].forEach((col) => {
          if (col && col.name && col.fk) {
            fkMeta[col.name] = col.fk;
          }
        });
      }
      // 2. Try options.foreignKeys if available (from displayTableData)
      if (
        fkMeta &&
        Object.keys(fkMeta).length === 0 &&
        wrapper &&
        wrapper.dataset &&
        wrapper.dataset.foreignKeys
      ) {
        try {
          const parsed = JSON.parse(wrapper.dataset.foreignKeys);
          if (Array.isArray(parsed)) {
            parsed.forEach((fk) => {
              if (fk && fk.from && fk.to && fk.table) {
                fkMeta[fk.from] = {
                  referencedTable: fk.table,
                  referencedColumn: fk.to,
                };
              }
            });
          }
        } catch (e) {
          // ignore
        }
      }
      // 3. Try columns with _id suffix as a last resort (convention)
      if (Object.keys(fkMeta).length === 0) {
        columns.forEach((col) => {
          if (col && /(_id|Id|ID)$/.test(col)) {
            // Heuristic: treat as FK, but no referenced table/column
            fkMeta[col] = { referencedTable: "", referencedColumn: "id" };
          }
        });
      }
      // Patch each cell in the new row
      if (newRow) {
        Array.from(newRow.children).forEach((cell, idx) => {
          const colName = columns[idx];
          // Always set data-column-name for robust context menu detection
          if (colName) {
            cell.setAttribute("data-column-name", colName);
          }
          if (fkMeta[colName]) {
            cell.classList.add("fk-cell");
            // Always set both attributes, even if empty string (for debug)
            const fkTable = fkMeta[colName].referencedTable || "";
            const fkColumn = fkMeta[colName].referencedColumn || "";
            cell.setAttribute("data-fk-table", fkTable);
            cell.setAttribute("data-fk-column", fkColumn);
          }
          // --- PATCH: Attach context menu event to every cell ---
          if (typeof window.showContextMenu === "function") {
            cell.addEventListener("contextmenu", function (e) {
              e.preventDefault();
              // Ensure MouseEvent is passed (cast for linting)
              window.showContextMenu(/** @type {MouseEvent} */ (e), cell);
            });
          }
        });
      }
      if (newRow) {
        // insert at correct spot
        const ref = tbody.querySelector(`tr[data-row-index="${rowIndex + 1}"]`);
        if (ref) {
          tbody.insertBefore(newRow, ref);
        } else {
          tbody.appendChild(newRow);
        }
      } else {
        console.warn(
          "[events.js] Failed to create new row for insert",
          rowIndex,
          rowData
        );
      }
    });

  // After all inserts, re-initialize table events for the wrapper
  if (typeof initializeTableEvents === "function") {
    initializeTableEvents(wrapper);
  }

  //–– 3) APPLY DELETES –– (also in reverse)
  deletes
    .sort((a, b) => b - a)
    .forEach((rowIndex) => {
      const row = tbody.querySelector(`tr[data-row-index="${rowIndex}"]`);
      if (!row) {
        console.warn("[events.js] No row found for delete", rowIndex);
        return;
      }
      row.remove();
      // decrement all > rowIndex
      Array.from(tbody.querySelectorAll("tr")).forEach((r) => {
        const idxAttr = r.getAttribute("data-row-index");
        if (idxAttr !== null && !isNaN(+idxAttr)) {
          const idx = +idxAttr;
          if (idx > rowIndex) {
            r.setAttribute("data-row-index", String(idx - 1));
          }
        }
      });
    });

  // After all new rows are inserted via delta, re-initialize table events for the wrapper
  // Diagnostic: log new rows and wrapper state before and after initialization
  const newRows = wrapper.querySelectorAll(
    "tr[data-rowid]:not([data-initialized])"
  );
  console.log("[Delta Debug] New rows before init:", newRows);
  console.log("[Delta Debug] Wrapper before init:", wrapper);
  console.log(
    "[Delta Debug] Guard before table event init:",
    window["_eventListenersInitialized"],
    "Stack:",
    new Error().stack
  );
  // Only initialize table events, never global events here
  initializeTableEvents(wrapper);
  // After initialization, mark new rows and log again
  newRows.forEach((row) => row.setAttribute("data-initialized", "true"));
  console.log("[Delta Debug] New rows after init:", newRows);
  console.log("[Delta Debug] Wrapper after init:", wrapper);
  console.log(
    "[Delta Debug] Guard after table event init:",
    window["_eventListenersInitialized"],
    "Stack:",
    new Error().stack
  );
}

// Remove all export statements for browser compatibility
// Functions that need to be global can be attached to window if needed

// Example:
// window.initializeEventListeners = initializeEventListeners;

// Make functions available globally for cross-module access
if (typeof window !== "undefined") {
  /** @type {any} */ (window).displayTablesList = displayTablesList;
  /** @type {any} */ (window).displayQueryResults = displayQueryResults;
  /** @type {any} */ (window).displayTableSchema = displayTableSchema;
  /** @type {any} */ (window).displayTableData = displayTableData;
  /** @type {any} */ (window).initializeTableEvents = initializeTableEvents;
  /** @type {any} */ (window).startCellEditing = startCellEditing;
  /** @type {any} */ (window).saveCellEdit = saveCellEdit;
  /** @type {any} */ (window).cancelCellEdit = cancelCellEdit;
  /** @type {any} */ (window).handleCellUpdateSuccess = handleCellUpdateSuccess;
  /** @type {any} */ (window).handleCellUpdateError = handleCellUpdateError;
  /** @type {any} */ (window).getCurrentTableName = getCurrentTableName;
  /** @type {any} */ (window).showConnectionSection = showConnectionSection;
  /** @type {any} */ (window).hideConnectionSection = hideConnectionSection;
  /** @type {any} */ (window).tryInitialConnection = tryInitialConnection;
  /** @type {any} */ (window).handleExecuteQuery = handleExecuteQuery;
  /** @type {any} */ (window).handleExtensionMessage = handleExtensionMessage;
}
