// @ts-check

/**
 * Main entry point for SQLite Viewer webview
 * Uses functions from modular files loaded before this script
 */

(function () {
  console.log("SQLite Viewer: Starting main initialization...");

  try {
    // @ts-ignore - acquireVsCodeApi is provided by VS Code webview runtime
    const vscode = acquireVsCodeApi();

    // Make vscode available globally for other modules
    /** @type {any} */ (window).vscode = vscode;

    // ============================================================================
    // MAIN APPLICATION LOGIC
    // ============================================================================

    /**
     * Initialize the SQLite Viewer application
     */
    function initializeApp() {
      console.log("Initializing SQLite Viewer application...");

      try {
        // Initialize modules (functions from loaded JS files)
        if (typeof initializeState === "function") {
          initializeState();
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

        // Show connection section initially - will be hidden after successful connection
        if (typeof showConnectionSection !== "undefined") {
          showConnectionSection();
        }

        // Initialize query editor visibility enforcement
        if (typeof initializeQueryEditorVisibility === "function") {
          initializeQueryEditorVisibility();
        }

        // Set up message handling from extension (delegated to events.js)
        // The events.js module will handle window.addEventListener("message", handleExtensionMessage)

        console.log("SQLite Viewer initialized successfully");

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
    function selectTable(tableName) {
      console.log(`Selecting table: ${tableName}`);

      if (typeof updateState === "function") {
        updateState({ selectedTable: tableName });
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
      requestTableData(tableName);

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
    function requestTableData(tableName) {
      const state =
        typeof getCurrentState === "function" ? getCurrentState() : {};
      console.log(
        "Requesting table data with encryption key:",
        state.encryptionKey ? "[PROVIDED]" : "[EMPTY]"
      );
      vscode.postMessage({
        type: "getTableData",
        tableName: tableName,
        key: state.encryptionKey,
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
      const queryResults = document.getElementById("query-results");
      if (!queryResults) {
        return;
      }

      if (result.error) {
        queryResults.innerHTML = `
          <div class="error-message">
            <h3>Query Error</h3>
            <p>${result.error}</p>
          </div>
        `;
        return;
      }

      if (!result.data || result.data.length === 0) {
        queryResults.innerHTML = `
          <div class="no-results">
            <h3>No Results</h3>
            <p>Query executed successfully but returned no data.</p>
          </div>
        `;
        return;
      }

      // Create table with advanced features using table.js functions
      const columns = result.columns || Object.keys(result.data[0] || {});
      let table = "";

      if (typeof createDataTable === "function") {
        table = createDataTable(result.data, columns, "query-result");
      } else {
        // Fallback basic table
        table = createBasicTable(result.data, columns);
      }

      queryResults.innerHTML = `
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

      // Initialize table features if available
      const tableWrapper = queryResults.querySelector(
        ".enhanced-table-wrapper"
      );
      if (tableWrapper && typeof initializeTableEvents === "function") {
        initializeTableEvents(tableWrapper);
      }
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
    function displayTableData(data, tableName) {
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

      // Create table with advanced features using table.js functions
      const columns = Object.keys(data[0] || {});
      let table = "";

      if (typeof createDataTable === "function") {
        table = createDataTable(data, columns, tableName);
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
      if (typeof formatCellValue === "function") {
        return formatCellValue(value);
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

    // Export functions for debugging/testing
    if (typeof window !== "undefined") {
      /** @type {any} */ (window).sqliteViewer = {
        selectTable,
        requestDatabaseInfo,
        vscode,
      };
    }
  } catch (error) {
    console.error("SQLite Viewer: Fatal error during initialization:", error);
    // Show error in the UI
    document.body.innerHTML = `
      <div style="padding: 20px; color: #f48771; background: #2d1b1b; border-radius: 4px; margin: 20px;">
        <h3>SQLite Viewer Error</h3>
        <p>Failed to initialize the extension: ${error.message}</p>
        <p>Please check the webview console for more details.</p>
      </div>
    `;
  }
})();
