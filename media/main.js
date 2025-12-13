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

  // Export tab functions globally for table-tabs.js and other modules

  // Defer global assignments to after all scripts are loaded
  setTimeout(() => {
    if (typeof window !== "undefined") {
      window.openTableTab = openTableTab;
      window.switchTableTab = switchTableTab;
      window.closeTableTab = closeTableTab;
      window.selectTable = selectTable;
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

        // Render table tabs from persisted state (if any)
        if (
          typeof window.getCurrentState === "function" &&
          typeof window.renderTableTabs === "function"
        ) {
          const state = window.getCurrentState();
          window.renderTableTabs(
            state.openTables || [],
            state.activeTable || state.selectedTable || ""
          );
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

        // Sidebar table click handlers are attached by displayTablesList in events.js
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
      if (typeof window.captureCurrentDataViewState === "function") {
        window.captureCurrentDataViewState();
      }
      const hasExplicitPaging = arguments.length >= 2;
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
        tabObj = {
          key,
          label,
          isResultTab,
          viewState: {
            page,
            pageSize,
            searchTerm: "",
            scrollTop: 0,
            scrollLeft: 0,
          },
        };
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
        const vs =
          typeof window.getTabViewState === "function"
            ? window.getTabViewState(tabObj.key)
            : tabObj.viewState || {};
        const desiredPage = hasExplicitPaging ? page : vs.page || 1;
        const desiredPageSize = hasExplicitPaging
          ? pageSize
          : vs.pageSize || 100;

        if (hasExplicitPaging) {
          tabObj.viewState = {
            ...(tabObj.viewState || {}),
            page: desiredPage,
            pageSize: desiredPageSize,
            scrollTop: 0,
          };
        }
        // If already open, just activate and select
        if (typeof window.updateState === "function") {
          window.updateState({
            openTables,
            activeTable: tabObj.key,
            selectedTable: tabObj.key,
          });
        }
        selectTableInternal(tabObj.key, desiredPage, desiredPageSize);
      }
    }

    /**
     * Remove a table from open tabs
     */
    function closeTableTab(tableKey) {
      if (typeof window.captureCurrentDataViewState === "function") {
        window.captureCurrentDataViewState();
      }
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
        if (window._resultCache instanceof Map) {
          window._resultCache.delete(tableKey);
        }
      }
      if (typeof window.updateState === "function") {
        window.updateState({
          openTables,
          activeTable: newActive,
          selectedTable: newActive,
        });
      }

      // Only re-render sidebar list when result tabs list changes.
      if (tableKey && tableKey.startsWith("Results (")) {
        if (
          typeof window.displayTablesList === "function" &&
          Array.isArray(state.allTables)
        ) {
          window.displayTablesList(state.allTables);
        }
      } else if (typeof window.updateSidebarSelection === "function" && newActive) {
        window.updateSidebarSelection(newActive);
      }
      if (newActive) {
        const vs =
          typeof window.getTabViewState === "function"
            ? window.getTabViewState(newActive)
            : {};
        selectTableInternal(newActive, vs.page || 1, vs.pageSize || 100);
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
      if (typeof window.captureCurrentDataViewState === "function") {
        window.captureCurrentDataViewState();
      }
      const vs =
        typeof window.getTabViewState === "function"
          ? window.getTabViewState(tableKey)
          : {};
      const desiredPage = vs.page || 1;
      const desiredPageSize = vs.pageSize || 100;

      if (typeof window.updateState === "function") {
        window.updateState({
          activeTable: tableKey,
          selectedTable: tableKey,
        });
      }
      if (typeof window.updateSidebarSelection === "function") {
        window.updateSidebarSelection(tableKey);
      }

      selectTableInternal(tableKey, desiredPage, desiredPageSize);
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
      if (typeof window.updateSidebarSelection === "function") {
        window.updateSidebarSelection(tableKey);
      }

      // If this is a query result tab, render from cache
      if (tableKey && tableKey.startsWith("Results (")) {
        let result = null;
        if (window._resultCache instanceof Map && window._resultCache.has(tableKey)) {
          result = window._resultCache.get(tableKey);
        } else if (typeof window.getCurrentState === "function") {
          const state = window.getCurrentState();
          if (state.tableCache instanceof Map && state.tableCache.has(tableKey)) {
            result = state.tableCache.get(tableKey);
          } else if (typeof state.tableCache === "object" && state.tableCache[tableKey]) {
            result = state.tableCache[tableKey];
          }
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

              const wrapperEl =
                dataContent.querySelector(".enhanced-table-wrapper");
              if (
                wrapperEl &&
                typeof window.applyTabViewStateToWrapper === "function"
              ) {
                window.applyTabViewStateToWrapper(wrapperEl, tableKey);
              }
            }
            return;
        }
      }

      // Otherwise, request table schema and data from backend
      if (typeof window.setTabViewState === "function") {
        window.setTabViewState(
          tableKey,
          { page, pageSize },
          { renderTabs: false, renderSidebar: false }
        );
      }
      // Schema fetch can be expensive; only fetch it when Schema tab is active.
      const stateForSchema =
        typeof window.getCurrentState === "function" ? window.getCurrentState() : {};
      if (stateForSchema.activeTab === "schema") {
        requestTableSchema(tableKey);
      }
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
