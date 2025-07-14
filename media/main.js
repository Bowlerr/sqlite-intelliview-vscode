// @ts-check

/**
 * Main entry point for SQLite IntelliView webview
 * Uses functions from modular files loaded before this script
 */

(function () {
  console.log("SQLite IntelliView: Starting main initialization...");

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
      console.log("Initializing SQLite IntelliView application...");

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
          console.log("Initializing enhanced query editor...");
          /** @type {any} */ (window).queryEditor = new /** @type {any} */ (
            window
          ).QueryEditor();
          /** @type {any} */ (window).queryEditor
            .init()
            .then(() => {
              console.log("Enhanced query editor initialized successfully");
              // Connect to existing buttons
              connectQueryButtons();
            })
            .catch((error) => {
              console.error(
                "Failed to initialize enhanced query editor:",
                error
              );
            });
        } else {
          console.warn("QueryEditor class not found, using fallback");
        }

        // Initialize diagram functionality
        if (typeof initializeDiagram === "function") {
          initializeDiagram();
        }

        // Initialize context menu functionality
        if (typeof initializeContextMenu === "function") {
          initializeContextMenu();
        }

        // Show connection section initially - will be hidden after successful connection
        if (typeof showConnectionSection !== "undefined") {
          showConnectionSection();
        }

        // Initialize query editor visibility enforcement
        if (typeof initializeQueryEditorVisibility === "function") {
          initializeQueryEditorVisibility();
        }

        console.log("SQLite IntelliView initialized successfully");

        // Load initial data
        loadInitialData();
      } catch (error) {
        console.error("Error during initialization:", error);
        if (typeof showError === "function") {
          showError("Failed to initialize: " + error.message);
        }
      }
    }

    /**
     * Select a table and load its data
     * @param {string} tableName - Name of the table to select
     */
    function selectTable(tableName, page = 1, pageSize = 100) {
      console.log(`Selecting table: ${tableName}`);

      if (typeof updateState === "function") {
        updateState({ selectedTable: tableName });
      }

      // Update minimized sidebar with selected table
      if (window.updateSelectedTableSafe) {
        window.updateSelectedTableSafe(tableName);
      } else if (window.resizableSidebar) {
        window.resizableSidebar.updateSelectedTable(tableName);
      }

      // Highlight selected table
      const tableElements = document.querySelectorAll(".table-item");
      tableElements.forEach((el) => {
        el.classList.remove("selected");
        if (el.textContent && el.textContent.includes(tableName)) {
          el.classList.add("selected");
        }
      });

      // Request table schema and data
      requestTableSchema(tableName);
      requestTableData(tableName, page, pageSize);

      // Switch to schema tab to show the table info
      if (typeof switchTab === "function") {
        switchTab("schema");
      }
    }

    /**
     * Request table schema from extension
     * @param {string} tableName - Table name
     */
    function requestTableSchema(tableName) {
      const state =
        typeof getCurrentState === "function" ? getCurrentState() : {};
      console.log(
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
      console.log(
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
      if (result.error) {
        html = `
          <div class="error-message">
            <h3>Query Error</h3>
            <p>${result.error}</p>
          </div>
        `;
        window.showResultsModal(html);
        return;
      }
      if (!result.data || result.data.length === 0) {
        html = `
          <div class="no-results">
            <h3>No Results</h3>
            <p>Query executed successfully but returned no data.</p>
          </div>
        `;
        window.showResultsModal(html);
        return;
      }
      const columns = result.columns || Object.keys(result.data[0] || {});
      let table = "";
      if (typeof createDataTable === "function") {
        table = createDataTable(result.data, columns, "query-result");
      } else {
        table = createBasicTable(result.data, columns);
      }
      html = `
        <div class="query-result-info">
          <div class="result-stats">
            <div class="stat-item">
              <div class="stat-label">Rows</div>
              <div class="stat-value">${result.data.length}</div>
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
      window.showResultsModal(html);
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
    console.error(
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
