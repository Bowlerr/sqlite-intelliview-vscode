// Table tabs UI is now in media/table-tabs.js
// @ts-check

/**
 * DOM utilities and element references
 */

/**
 * @typedef {Object} DomElements
 * @property {HTMLElement|null} connectBtn
 * @property {HTMLElement|null} encryptionKeyInput
 * @property {HTMLElement|null} tablesListElement
 * @property {HTMLElement|null} executeQueryBtn
 * @property {HTMLElement|null} clearQueryBtn
 * @property {NodeListOf<Element>|null} tabs
 * @property {NodeListOf<Element>|null} tabPanels
 * @property {HTMLElement|null} schemaContent
 * @property {HTMLElement|null} queryResults
 * @property {HTMLElement|null} dataContent
 * @property {HTMLElement|null} connectionSection
 * @property {HTMLElement|null} connectionStatus
 * @property {HTMLElement|null} diagramContent
 * @property {HTMLElement|null} generateDiagramBtn
 * @property {HTMLElement|null} exportDiagramBtn
 * @property {HTMLElement|null} diagramContainer
 * @property {HTMLElement|null} testConnectionBtn
 */

/** @type {DomElements} */
const domElements = {
  connectBtn: null,
  encryptionKeyInput: null,
  tablesListElement: null,
  executeQueryBtn: null,
  clearQueryBtn: null,
  tabs: null,
  tabPanels: null,
  schemaContent: null,
  queryResults: null,
  dataContent: null,
  connectionSection: null,
  connectionStatus: null,
  diagramContent: null,
  generateDiagramBtn: null,
  exportDiagramBtn: null,
  diagramContainer: null,
  testConnectionBtn: null,
};

/**
 * Initialize DOM element references
 */
function initializeDOMElements() {
  domElements.connectBtn = document.getElementById("connect-btn");
  domElements.encryptionKeyInput = document.getElementById("encryption-key");
  domElements.tablesListElement = document.getElementById("tables-list");
  domElements.executeQueryBtn = document.getElementById("execute-query");
  domElements.clearQueryBtn = document.getElementById("clear-query");
  // NodeList assignments (can be empty NodeList if not found)
  domElements.tabs = document.querySelectorAll(".tab");
  domElements.tabPanels = document.querySelectorAll(".tab-panel");
  domElements.schemaContent = document.getElementById("schema-content");
  domElements.queryResults = document.getElementById("query-results");
  domElements.dataContent = document.getElementById("data-content");
  domElements.connectionSection = document.getElementById("connection-section");
  domElements.connectionStatus = document.getElementById("connection-status");
  domElements.diagramContent = document.getElementById("diagram-content");
  domElements.generateDiagramBtn = document.getElementById("generate-diagram");
  domElements.exportDiagramBtn = document.getElementById("export-diagram");
  domElements.diagramContainer = document.getElementById("diagram-container");
  domElements.testConnectionBtn = document.getElementById("test-connection");

  // Connection section starts visible by default and will be hidden after successful connection
  if (window.debug) {
    window.debug.debug("DOM elements initialized");
  }
}

/**
 * Get DOM element by key
 * @param {string} key - Element key
 * @returns {Element|null} DOM element or null
 */
function getDOMElement(key) {
  return domElements[key] || null;
}

/**
 * Get all DOM elements
 * @returns {object} All DOM elements
 */
function getAllDOMElements() {
  return domElements;
}

/**
 * Auto-resize textarea based on content
 */
function autoResizeTextarea() {
  const textarea = getDOMElement("sqlQueryTextarea");
  if (!textarea) {
    return;
  }

  if (textarea instanceof HTMLElement) {
    textarea.style.height = "auto";
    // @ts-ignore
    textarea.style.height = textarea.scrollHeight + "px";
  }
}

/**
 * Update connection status indicator
 * @param {boolean} isConnected - Connection status
 * @param {string} errorMessage - Error message if any
 */
function updateConnectionStatus(isConnected, errorMessage) {
  let statusElement = document.getElementById("connection-status");

  if (!statusElement) {
    // Create the status element if it doesn't exist
    statusElement = document.createElement("div");
    statusElement.id = "connection-status";
    statusElement.className = "connection-status";

    // Add to header-right
    const headerRight = document.querySelector(
      ".header-right .connection-status-container"
    );
    if (headerRight) {
      headerRight.appendChild(statusElement);
    }
  }

  if (isConnected) {
    statusElement.className = "connection-status connected";
    statusElement.textContent = "Connected";
  } else {
    statusElement.className = "connection-status disconnected";
    statusElement.textContent = errorMessage || "Disconnected";
  }
}

/**
 * Create connection status element
 * @returns {Element} Status element
 */
function createConnectionStatus() {
  const statusElement = document.createElement("div");
  statusElement.className = "connection-status";

  // Add to the database connection section
  const connectionSection = document.querySelector(".connection-controls");
  if (connectionSection) {
    connectionSection.appendChild(statusElement);
  }

  return statusElement;
}

/**
 * Switch between tabs
 * @param {string} tabName - Name of the tab to switch to
 */
function switchTab(tabName) {
  if (!tabName) {
    return;
  }

  const tabs = getDOMElement("tabs");
  const tabPanels = getDOMElement("tabPanels");

  // Update active tab
  // Only use forEach if tabs is a NodeList (not a single Element)
  if (tabs && NodeList.prototype.isPrototypeOf(tabs)) {
    tabs.forEach((tab) => {
      if (tab instanceof HTMLElement) {
        tab.classList.toggle("active", tab.dataset.tab === tabName);
      }
    });
  }

  // Update active panel
  if (tabPanels && NodeList.prototype.isPrototypeOf(tabPanels)) {
    tabPanels.forEach((panel) => {
      if (panel instanceof HTMLElement) {
        panel.classList.toggle("active", panel.id === `${tabName}-panel`);
      }
    });
  }

  // Load data for the data tab if a table is selected
  if (tabName === "data") {
    const currentState =
      typeof getCurrentState === "function" ? getCurrentState() : {};
    let isResultTab = false;
    let selectedTabObj = null;
    if (currentState.selectedTable && Array.isArray(currentState.openTables)) {
      selectedTabObj = currentState.openTables.find(
        (t) => t.key === currentState.selectedTable
      );
      if (selectedTabObj && selectedTabObj.isResultTab) {
        isResultTab = true;
      }
    }
    if (currentState.selectedTable && isResultTab) {
      // Render cached results immediately
      if (typeof window.getCurrentState === "function") {
        const state = window.getCurrentState();
        let result = null;
        if (
          state.tableCache instanceof Map &&
          state.tableCache.has(currentState.selectedTable)
        ) {
          result = state.tableCache.get(currentState.selectedTable);
        } else if (
          typeof state.tableCache === "object" &&
          state.tableCache[currentState.selectedTable]
        ) {
          result = state.tableCache[currentState.selectedTable];
        }
        if (result && result.data && result.columns) {
          const createDataTableFn =
            typeof window.createDataTable === "function"
              ? window.createDataTable
              : null;
          const dataContent = document.getElementById("data-content");
          if (dataContent) {
            const tableHtml =
              result.data.length > 0 && createDataTableFn
                ? createDataTableFn(result.data, result.columns, "query-result")
                : `<div class=\"no-results\"><h3>No Results</h3><p>Query executed successfully but returned no data.</p></div>`;
            dataContent.innerHTML = `<div class=\"table-container\">${tableHtml}</div>`;
          }
        }
      }
    } else if (
      currentState.selectedTable &&
      window.vscode &&
      typeof window.vscode.postMessage === "function"
    ) {
      // Use persisted pageSize from state if available
      const pageSize =
        typeof currentState.pageSize === "number" &&
        !isNaN(currentState.pageSize)
          ? currentState.pageSize
          : typeof PAGINATION_CONFIG !== "undefined" &&
            PAGINATION_CONFIG.defaultPageSize
          ? PAGINATION_CONFIG.defaultPageSize
          : 100;
      window.vscode.postMessage({
        type: "getTableData",
        tableName: currentState.selectedTable,
        key: currentState.encryptionKey || "",
        page: 1,
        pageSize: pageSize,
      });
    }
  }
}

/**
 * Helper function to escape HTML
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Force hide connection section (for debugging)
 */
function forceHideConnectionSection() {
  const connectionSection = document.getElementById("connection-section");
  if (connectionSection) {
    connectionSection.classList.add("hidden");
    connectionSection.classList.remove("visible");
    if (window.debug) {
      window.debug.debug("Connection section forcibly hidden");
    }
  } else {
    if (window.debug) {
      window.debug.debug("Connection section not found");
    }
  }
}

/**
 * Check connection section visibility (for debugging)
 */
function checkConnectionSectionVisibility() {
  const connectionSection = document.getElementById("connection-section");
  if (connectionSection) {
    const isVisible = connectionSection.style.display !== "none";
    if (window.debug) {
      window.debug.debug(
        `Connection section visibility: ${isVisible}, display: ${connectionSection.style.display}`
      );
    }
    return isVisible;
  } else {
    if (window.debug) {
      window.debug.debug("Connection section not found");
    }
    return false;
  }
}

// Make this function available globally
if (typeof window !== "undefined") {
  /** @type {any} */ (window).forceHideConnectionSection =
    forceHideConnectionSection;
  /** @type {any} */ (window).checkConnectionSectionVisibility =
    checkConnectionSectionVisibility;
}

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    initializeDOMElements,
    getDOMElement,
    getAllDOMElements,
    autoResizeTextarea,
    updateConnectionStatus,
    createConnectionStatus,
    switchTab,
    escapeHtml,
  };
}
