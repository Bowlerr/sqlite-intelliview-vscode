// Utility: Attach sidebar table item click handlers to call window.selectTable
function attachSidebarTableHandlers() {
  const items = document.querySelectorAll(".table-item[data-table]");
  items.forEach((item) => {
    item.onclick = (e) => {
      const tableName = item.dataset.table;
      if (tableName && typeof window.selectTable === "function") {
        window.selectTable(tableName);
      }
    };
  });
}
// Observe state changes to update table tabs UI
function updateTableTabsUI() {
  if (
    typeof window.getCurrentState === "function" &&
    typeof window.renderTableTabs === "function"
  ) {
    const state = window.getCurrentState();
    window.renderTableTabs(state.openTables || [], state.activeTable || null);
  }
}

// Patch updateState to also update tabs UI
if (typeof window.updateState === "function") {
  const origUpdateState = window.updateState;
  window.updateState = function (newState) {
    origUpdateState(newState);
    updateTableTabsUI();
  };
}

// Initial render on load
document.addEventListener("DOMContentLoaded", updateTableTabsUI);
// Polyfill state functions for compatibility
if (
  typeof window.getCurrentState !== "function" &&
  typeof getCurrentState === "function"
) {
  window.getCurrentState = getCurrentState;
}
if (
  typeof window.updateState !== "function" &&
  typeof updateState === "function"
) {
  window.updateState = updateState;
}

(function () {
  // @ts-check

  /**
   * Main entry point for SQLite IntelliView webview
   * Uses functions from modular files loaded before this script
   */

  if (window.debug) {
    window.debug.info(
      "main",
      "SQLite IntelliView: Starting main initialization..."
    );
  }

  // --- Sidebar maximize logic ---
  function maximizeSidebar() {
    if (
      window.resizableSidebar &&
      typeof window.resizableSidebar.setMinimized === "function"
    ) {
      window.resizableSidebar.setMinimized(false);
    }
  }
  // Listen for messages from extension/backend
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message) {
      return;
    }
    if (
      message.type === "maximizeSidebar" ||
      message.type === "databaseLoadError" ||
      (message.type === "error" &&
        typeof message.message === "string" &&
        message.message.includes("Database appears to be encrypted"))
    ) {
      maximizeSidebar();
    }

    // --- Handle database info (list of tables) ---
    if (message.type === "databaseInfo" && Array.isArray(message.tables)) {
      if (typeof window.updateState === "function") {
        window.updateState({ allTables: message.tables });
        if (message.tables.length > 0) {
          const firstTableName = message.tables[0];
          const state =
            typeof window.getCurrentState === "function"
              ? window.getCurrentState()
              : {};
          const openTables = Array.isArray(state.openTables)
            ? state.openTables
            : [];
          if (
            !openTables.find((t) => t.key === firstTableName) &&
            typeof window.openTableTab === "function"
          ) {
            window.openTableTab(firstTableName);
          }
          // Always refresh tabs and sidebar using allTables
          if (typeof window.renderTableTabs === "function") {
            window.renderTableTabs(
              window.getCurrentState().openTables,
              window.getCurrentState().activeTable ||
                window.getCurrentState().selectedTable ||
                ""
            );
          }
          if (
            typeof window.displayTablesList === "function" &&
            Array.isArray(window.getCurrentState().allTables)
          ) {
            window.displayTablesList(window.getCurrentState().allTables);
          }
        }
      }
    }

    // --- Handle table data response ---
    if (message.type === "tableData") {
      // Update pagination state immediately on data receipt
      /** @type {any} */
      const win = window;
      if (typeof win.updateState === "function") {
        win.updateState({
          currentPage: message.page,
          pageSize: message.pageSize,
        });
      }
      // Use backend-provided page, pageSize, totalRows, and columns for rendering
      displayTableData(
        message.data,
        message.tableName,
        message.page || 1,
        message.pageSize || 100,
        message.totalRows || (message.data ? message.data.length : 0),
        message.columns // pass columns from backend
      );
      return;
    }
  });

  // Export tab functions globally for table-tabs.js and other modules

  // Defer global assignments and sidebar handler attachment to after all scripts are loaded
  setTimeout(() => {
    if (typeof window !== "undefined") {
      window.openTableTab = openTableTab;
      window.switchTableTab = switchTableTab;
      window.closeTableTab = closeTableTab;
      window.selectTable = selectTable;
      attachSidebarTableHandlers();
    }
  }, 0);

  try {
    // @ts-ignore - acquireVsCodeApi is provided by VS Code webview runtime
    const vscode = acquireVsCodeApi();

    // Make vscode available globally for other modules
    /** @type {any} */ (window).vscode = vscode;
    // ============================================================================
    // MAIN APPLICATION LOGIC
    // ============================================================================

    /**
     * Initialize the SQLite IntelliView application
     */
    function initializeApp() {
      window.debug.info(
        "main",
        "Initializing SQLite IntelliView application..."
      );

      try {
        // Initialize modules (functions from loaded JS files)
        if (typeof window.initializeState === "function") {
          window.initializeState();
        }

        if (typeof initializeDOMElements === "function") {
          initializeDOMElements();
        }

        if (typeof initializeEventListeners === "function") {
          initializeEventListeners();
        }

        if (typeof addHelpButton === "function") {
          addHelpButton();
        }

        // Initialize enhanced query editor
        if (typeof (/** @type {any} */ (window).QueryEditor) !== "undefined") {
          if (window.debug) {
            window.debug.info("main", "Initializing enhanced query editor...");
          }
          /** @type {any} */ (window).queryEditor = new /** @type {any} */ (
            window
          ).QueryEditor();
          /** @type {any} */ (window).queryEditor
            .init()
            .then(() => {
              if (window.debug) {
                window.debug.info(
                  "main",
                  "Enhanced query editor initialized successfully"
                );
              }
              // Connect to existing buttons
              connectQueryButtons();
            })
            .catch((error) => {
              if (window.debug) {
                window.debug.error(
                  "main",
                  "Failed to initialize enhanced query editor:",
                  error
                );
              } else {
                if (window.debug) {
                  window.debug.error(
                    "Failed to initialize enhanced query editor:",
                    error
                  );
                }
              }
            });
        } else {
          window.debug.warn(
            "main",
            "QueryEditor class not found, using fallback"
          );
        }

        // Initialize diagram functionality
        if (typeof initializeDiagram === "function") {
          initializeDiagram();
        }

        // Initialize context menu functionality
        if (typeof initializeContextMenu === "function") {
          initializeContextMenu();
        }

        // Initialize SortableJS for table tabs
        if (typeof window.initializeSortableJS === "function") {
          window.debug.info(
            "main",
            "Initializing SortableJS for table tabs..."
          );
          // Delay initialization to ensure DOM is ready
          setTimeout(() => {
            window.debug.info("main", "Delayed SortableJS initialization");
            window.initializeSortableJS();
          }, 500);
        }

        // Show connection section initially - will be hidden after successful connection
        if (typeof showConnectionSection !== "undefined") {
          showConnectionSection();
        }

        // Initialize query editor visibility enforcement
        if (typeof initializeQueryEditorVisibility === "function") {
          initializeQueryEditorVisibility();
        }

        window.debug.info(
          "main",
          "SQLite IntelliView initialized successfully"
        );

        // Load initial data
        loadInitialData();

        // Attach sidebar table handlers after all scripts loaded
        setTimeout(attachSidebarTableHandlers, 300);
      } catch (error) {
        window.debug.error("main", "Error during initialization:", error);
        if (typeof showError === "function") {
          showError("Failed to initialize: " + error.message);
        }
      }
    }

    /**
     * Select a table and load its data
     * @param {string} tableName - Name of the table to select
     */
    // --- Multi-table tabs logic ---
    /**
     * Add a table to open tabs (if not already open) and make it active
     */
    function openTableTab(tableName, page = 1, pageSize = 100) {
      window.debug.debug("main", "[openTableTab] called with:", tableName, {
        page,
        pageSize,
      });
      const state =
        typeof window.getCurrentState === "function"
          ? window.getCurrentState()
          : {};
      let openTables = Array.isArray(state.openTables)
        ? state.openTables.map((t) => ({ ...t }))
        : [];
      // If already open, just activate
      let key =
        typeof tableName === "object" && tableName !== null && tableName.name
          ? tableName.name
          : tableName;
      let tabObj = openTables.find((t) => t.key === key);
      if (!tabObj) {
        let label = key;
        let isResultTab = false;
        if (/^results \(\d{4}-\d{2}-\d{2}/i.test(label)) {
          isResultTab = true;
        }
        tabObj = { key, label, isResultTab };
        openTables.push(tabObj);
        if (typeof window.updateState === "function") {
          window.updateState({
            openTables,
            activeTable: tabObj.key,
            selectedTable: tabObj.key,
          });
        }
        selectTableInternal(tabObj.key, page, pageSize);
      } else {
        // If already open, just activate and select
        if (typeof window.updateState === "function") {
          window.updateState({
            openTables,
            activeTable: tabObj.key,
            selectedTable: tabObj.key,
          });
        }
        selectTableInternal(tabObj.key, page, pageSize);
      }
    }

    /**
     * Remove a table from open tabs
     */
    function closeTableTab(tableKey) {
      const state =
        typeof window.getCurrentState === "function"
          ? window.getCurrentState()
          : {};
      let openTables = Array.isArray(state.openTables)
        ? state.openTables.map((t) => ({ ...t }))
        : [];
      openTables = openTables.filter((t) => t.key !== tableKey);
      let newActive = state.activeTable;
      if (state.activeTable === tableKey) {
        newActive =
          openTables.length > 0 ? openTables[openTables.length - 1].key : null;
      }
      // Remove query result data from cache if this is a result tab
      if (tableKey && tableKey.startsWith("Results (")) {
        if (state.tableCache instanceof Map && state.tableCache.has(tableKey)) {
          state.tableCache.delete(tableKey);
        } else if (
          typeof state.tableCache === "object" &&
          state.tableCache[tableKey]
        ) {
          delete state.tableCache[tableKey];
        }
      }
      if (typeof window.updateState === "function") {
        window.updateState({
          openTables,
          activeTable: newActive,
          selectedTable: newActive,
          tableCache: state.tableCache,
        });
      }
      // Core trigger: re-render tabs and sidebar
      if (typeof window.renderTableTabs === "function") {
        window.renderTableTabs(openTables, newActive || "");
      }
      if (
        typeof window.displayTablesList === "function" &&
        Array.isArray(state.allTables)
      ) {
        window.displayTablesList(state.allTables);
      }
      if (newActive) {
        selectTableInternal(newActive);
      } else {
        // Optionally clear data view if no tabs open
        const dataContent = document.getElementById("data-content");
        if (dataContent) {
          dataContent.innerHTML = "";
        }
      }
    }

    /**
     * Switch to an already open table tab
     */
    function switchTableTab(tableKey) {
      if (typeof window.updateState === "function") {
        window.updateState({
          activeTable: tableKey,
          selectedTable: tableKey,
        });
      }

      // Core trigger: explicitly refresh tabs and sidebar after switching
      if (typeof window.renderTableTabs === "function") {
        const state =
          typeof window.getCurrentState === "function"
            ? window.getCurrentState()
            : {};
        window.renderTableTabs(state.openTables || [], tableKey);
      }
      if (typeof window.displayTablesList === "function") {
        const state =
          typeof window.getCurrentState === "function"
            ? window.getCurrentState()
            : {};
        window.displayTablesList(state.allTables || []);
      }

      selectTableInternal(tableKey);
    }

    /**
     * Internal: select table and load data (does not update tab state)
     */
    function selectTableInternal(tableKey, page = 1, pageSize = 100) {
      window.debug.debug(
        "main",
        "[selectTableInternal] called with:",
        tableKey,
        {
          page,
          pageSize,
        }
      );
      window.debug.debug("main", `Selecting table: ${tableKey}`);

      // Update minimized sidebar with selected table
      if (window.updateSelectedTableSafe) {
        window.updateSelectedTableSafe(tableKey);
      } else if (window.resizableSidebar) {
        window.resizableSidebar.updateSelectedTable(tableKey);
      }

      // Highlight selected table - improved logic for both normal tables and result tabs
      const tableElements = document.querySelectorAll(".table-item");
      tableElements.forEach((el) => {
        el.classList.remove("selected");
        // Check both data-table attribute and textContent for exact matches
        const dataTable = el.getAttribute("data-table");
        if (
          dataTable === tableKey ||
          (el.textContent && el.textContent.trim() === tableKey)
        ) {
          el.classList.add("selected");
        }
      });

      // If this is a query result tab, render from cache
      if (tableKey && tableKey.startsWith("Results (")) {
        if (typeof window.getCurrentState === "function") {
          const state = window.getCurrentState();
          let result = null;
          if (
            state.tableCache instanceof Map &&
            state.tableCache.has(tableKey)
          ) {
            result = state.tableCache.get(tableKey);
          } else if (
            typeof state.tableCache === "object" &&
            state.tableCache[tableKey]
          ) {
            result = state.tableCache[tableKey];
          }
          if (result && result.data && result.columns) {
            // Use createDataTable if available
            const createDataTableFn =
              typeof window.createDataTable === "function"
                ? window.createDataTable
                : null;
            const dataContent = document.getElementById("data-content");
            if (dataContent) {
              const tableHtml =
                result.data.length > 0 && createDataTableFn
                  ? createDataTableFn(result.data, result.columns, tableKey, {
                      isQueryResult: true,
                      query: result.query,
                      currentPage: 1,
                      totalRows: result.data.length,
                      pageSize: Math.min(result.data.length, 100),
                      foreignKeys: result.foreignKeys || [],
                      allowEditing: false,
                    })
                  : `<div class=\"no-results\"><h3>No Results</h3><p>Query executed successfully but returned no data.</p></div>`;
              dataContent.innerHTML = `<div class=\"table-container\">${tableHtml}</div>`;

              // Initialize table interactive features after restoring content
              const tableWrapper =
                dataContent.querySelector(".table-container");
              if (tableWrapper && typeof initializeTableEvents === "function") {
                initializeTableEvents(tableWrapper);
              }
            }
            return;
          }
        }
      }

      // Otherwise, request table schema and data from backend
      requestTableSchema(tableKey);
      requestTableData(tableKey, page, pageSize);
      // Do not switch main tab; stay on the user's current tab
    }

    // For compatibility: selectTable now opens a tab
    function selectTable(tableName, page = 1, pageSize = 100) {
      // Always add to openTables and set as active
      if (typeof window.openTableTab === "function") {
        window.openTableTab(tableName, page, pageSize);
      } else {
        // fallback: update state directly
        const state =
          typeof window.getCurrentState === "function"
            ? window.getCurrentState()
            : {};
        let openTables = Array.isArray(state.openTables)
          ? state.openTables.map((t) => ({ ...t }))
          : [];
        let tabObj = openTables.find((t) => t.key === tableName);
        if (!tabObj) {
          let label = tableName;
          let isResultTab = false;
          if (/^results \(\d{4}-\d{2}-\d{2}/i.test(tableName)) {
            label = tableName;
            isResultTab = true;
          }
          tabObj = { key: tableName, label, isResultTab };
          openTables.push(tabObj);
        }
        if (typeof window.updateState === "function") {
          window.updateState({
            openTables,
            activeTable: tabObj.key,
            selectedTable: tabObj.key,
          });
        }
        // Core trigger: re-render tabs and sidebar
        if (typeof window.renderTableTabs === "function") {
          window.renderTableTabs(openTables, tabObj.key);
        }
        if (
          typeof window.displayTablesList === "function" &&
          Array.isArray(state.allTables)
        ) {
          window.displayTablesList(state.allTables);
        }
        selectTableInternal(tabObj.key, page, pageSize);
      }
    }

    /**
     * Request table schema from extension
     * @param {string} tableName - Table name
     */
    function requestTableSchema(tableName) {
      const state =
        typeof getCurrentState === "function" ? getCurrentState() : {};
      window.debug.debug(
        "main",
        "Requesting table schema with encryption key:",
        state.encryptionKey ? "[PROVIDED]" : "[EMPTY]"
      );
      vscode.postMessage({
        type: "getTableSchema",
        tableName: tableName,
        key: state.encryptionKey,
      });
    }

    /**
     * Request table data from extension
     * @param {string} tableName - Table name
     */
    function requestTableData(tableName, page = 1, pageSize = 100) {
      const state =
        typeof getCurrentState === "function" ? getCurrentState() : {};
      window.debug.debug(
        "main",
        "Requesting table data with encryption key:",
        state.encryptionKey ? "[PROVIDED]" : "[EMPTY]"
      );
      window.vscode.postMessage({
        type: "getTableData",
        tableName: tableName,
        key: state.encryptionKey,
        page: page,
        pageSize: pageSize,
      });
    }

    /**
     * Request database info from extension
     */
    function requestDatabaseInfo() {
      const state =
        typeof getCurrentState === "function" ? getCurrentState() : {};
      vscode.postMessage({
        type: "requestDatabaseInfo",
        key: state.encryptionKey,
      });
    }

    /**
     * Display query result
     * @param {object} result - Query result object
     */
    function displayQueryResult(result) {
      let html = "";
      // Modal logic removed: query results are now shown as tabs in the data area.
    }

    /**
     * Display table schema
     * @param {Array} schema - Table schema array
     * @param {string} tableName - Table name
     */
    function displayTableSchema(schema, tableName) {
      const schemaContent = document.getElementById("schema-content");
      if (!schemaContent) {
        return;
      }

      schemaContent.innerHTML = `
        <div class="schema-table">
          <table class="schema-info-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Not Null</th>
                <th>Default</th>
                <th>Primary Key</th>
                <th>Foreign Key</th>
              </tr>
            </thead>
            <tbody>
              ${schema
                .map(
                  (col) => `
                <tr>
                  <td class="column-name">${col.name}</td>
                  <td class="column-type">${col.type}</td>
                  <td class="column-not-null">${col.notnull ? "Yes" : "No"}</td>
                  <td class="column-default">${col.dflt_value || "—"}</td>
                  <td class="column-pk">${col.pk ? "Yes" : "No"}</td>
                  <td class="column-fk">${
                    col.fk
                      ? `${col.fk.referencedTable}.${col.fk.referencedColumn}`
                      : "—"
                  }</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    /**
     * Display table data
     * @param {Array} data - Table data array
     * @param {string} tableName - Table name
     */
    function displayTableData(
      data,
      tableName,
      page = 1,
      pageSize = 100,
      totalRows = 0,
      columns = null
    ) {
      const dataContent = document.getElementById("data-content");
      if (!dataContent) {
        return;
      }

      // Only render if this table is the active tab
      let activeTable = null;
      if (typeof window.getCurrentState === "function") {
        const state = window.getCurrentState();
        activeTable = state.activeTable || state.selectedTable;
      }
      if (activeTable && tableName !== activeTable) {
        // Not the active tab, clear content
        dataContent.innerHTML = "";
        return;
      }

      if (!data || data.length === 0) {
        dataContent.innerHTML = `
          <div class="no-data">
            <h3>No Data</h3>
            <p>Table "${tableName}" is empty.</p>
          </div>
        `;
        return;
      }

      // Use columns from backend if provided, else fallback
      columns = columns || Object.keys(data[0] || {});
      let table = "";

      if (typeof createDataTable === "function") {
        table = createDataTable(data, columns, tableName, {
          page,
          pageSize,
          totalRows,
        });
        // Update pagination state globally
        /** @type {any} */
        const win = window;
        if (typeof win.updateState === "function") {
          win.updateState({ currentPage: page, pageSize });
        }
      } else {
        // Fallback basic table
        table = createBasicTable(data, columns);
      }

      dataContent.innerHTML = `
        <div class="table-info">
          <div class="table-stats">
            <div class="stat-item">
              <div class="stat-label">Rows</div>
              <div class="stat-value">${data.length}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Columns</div>
              <div class="stat-value">${columns.length}</div>
            </div>
          </div>
        </div>
        <div class="table-container">
          ${table}
        </div>
      `;

      // Initialize table features if available
      const tableWrapper = dataContent.querySelector(".enhanced-table-wrapper");
      if (tableWrapper && typeof initializeTableEvents === "function") {
        initializeTableEvents(tableWrapper);
      }

      // Check for pending foreign key highlight
      if (tableWrapper && typeof highlightForeignKeyTarget === "function") {
        highlightForeignKeyTarget(tableWrapper);
      }
    }

    /**
     * Create a basic table (fallback when table.js functions aren't available)
     * @param {Array} data - Table data
     * @param {Array} columns - Column names
     * @returns {string} HTML table string
     */
    function createBasicTable(data, columns) {
      return `
        <table class="data-table basic-table">
          <thead>
            <tr>
              ${columns.map((col) => `<th>${col}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
              <tr>
                ${columns
                  .map((col) => `<td>${formatValue(row[col])}</td>`)
                  .join("")}
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    /**
     * Format a value for display (fallback)
     * @param {any} value - Value to format
     * @returns {string} Formatted value
     */
    function formatValue(value) {
      if (value === null || value === undefined) {
        return '<span class="null-value">NULL</span>';
      }
      if (typeof window.formatCellValue === "function") {
        return window.formatCellValue(value);
      }
      return String(value);
    }

    /**
     * Load initial data
     */
    function loadInitialData() {
      // Try initial connection without key first
      setTimeout(() => {
        if (typeof tryInitialConnection !== "undefined") {
          tryInitialConnection();
        }
      }, 100);
    }

    // Initialize when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializeApp);
    } else {
      initializeApp();
    }

    // Import utility and state functions from other modules
    // @ts-ignore
    if (typeof window !== "undefined") {
      // Attach formatCellValue and initializeState to window if available
      // @ts-ignore
      if (typeof formatCellValue !== "undefined") {
        window.formatCellValue = formatCellValue;
      }
      // @ts-ignore
      if (typeof initializeState !== "undefined") {
        window.initializeState = initializeState;
      }
    }

    // Export functions for debugging/testing
    if (typeof window !== "undefined") {
      /** @type {any} */ (window).sqliteViewer = {
        selectTable,
        requestDatabaseInfo,
        vscode,
      };
    }
  } catch (error) {
    window.debug.error(
      "main",
      "SQLite IntelliView: Fatal error during initialization:",
      error
    );
    // Show error in the UI
    document.body.innerHTML = `
      <div style="padding: 20px; color: #f48771; background: #2d1b1b; border-radius: 4px; margin: 20px;">
        <h3>SQLite IntelliView Error</h3>
        <p>Failed to initialize the extension: ${error.message}</p>
        <p>Please check the webview console for more details.</p>
      </div>
    `;
  }
})();
