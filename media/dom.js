// @ts-check

/**
 * DOM utilities and element references
 */

// DOM elements cache
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
  console.log("DOM elements initialized");
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

  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
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
  if (tabs) {
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    });
  }

  // Update active panel
  if (tabPanels) {
    tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === `${tabName}-panel`);
    });
  }

  // Load data for the data tab if a table is selected
  if (tabName === "data") {
    const currentState =
      typeof getCurrentState === "function" ? getCurrentState() : {};
    if (currentState.selectedTable && typeof vscode !== "undefined") {
      // Use persisted pageSize from state if available
      const pageSize =
        typeof currentState.pageSize === "number" &&
        !isNaN(currentState.pageSize)
          ? currentState.pageSize
          : typeof PAGINATION_CONFIG !== "undefined" &&
            PAGINATION_CONFIG.defaultPageSize
          ? PAGINATION_CONFIG.defaultPageSize
          : 100;
      vscode.postMessage({
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
    console.log("Connection section forcibly hidden");
  } else {
    console.log("Connection section not found");
  }
}

/**
 * Check connection section visibility (for debugging)
 */
function checkConnectionSectionVisibility() {
  const connectionSection = document.getElementById("connection-section");
  if (connectionSection) {
    const isVisible = connectionSection.style.display !== "none";
    console.log(
      "Connection section visibility:",
      isVisible,
      "display:",
      connectionSection.style.display
    );
    return isVisible;
  } else {
    console.log("Connection section not found");
    return false;
  }
}

// Add modal container to DOM on load
function addResultsModalToDOM() {
  if (document.getElementById("results-modal-overlay")) {
    return;
  }
  const overlay = document.createElement("div");
  overlay.id = "results-modal-overlay";
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal" id="results-modal">
      <div class="modal-header">
        <span class="modal-title">Query Results</span>
        <button class="modal-close" id="close-results-modal" title="Close">&times;</button>
      </div>
      <div class="modal-body" id="results-modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Close on click outside modal or on close button
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      hideResultsModal();
    }
  });
  document.getElementById("close-results-modal").onclick = hideResultsModal;
}

function showResultsModal(html) {
  addResultsModalToDOM();
  const overlay = document.getElementById("results-modal-overlay");
  const body = document.getElementById("results-modal-body");
  if (body) {
    body.innerHTML = html;
  }
  if (overlay) {
    overlay.classList.remove("hidden");
  }
}

function hideResultsModal() {
  const overlay = document.getElementById("results-modal-overlay");
  if (overlay) {
    overlay.classList.add("hidden");
  }
}

// Make this function available globally
if (typeof window !== "undefined") {
  /** @type {any} */ (window).forceHideConnectionSection =
    forceHideConnectionSection;
  /** @type {any} */ (window).checkConnectionSectionVisibility =
    checkConnectionSectionVisibility;
  window.showResultsModal = showResultsModal;
  window.hideResultsModal = hideResultsModal;
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
