// @ts-check

/**
 * State management for the SQLite IntelliView
 */

// Reference to the current state
let currentState = {
  databasePath: "",
  encryptionKey: "",
  // Multi-table tabs state
  openTables: [], // Array of open table names
  activeTable: null, // Currently active table in tabs
  // Legacy single-table selection (for backward compatibility)
  selectedTable: null,
  activeTab: "schema",
  isConnected: false,
  connectionError: null,
  queryHistory: [],
  tableCache: new Map(),
  currentPage: 1, // Track current page for pagination
  pageSize: 100, // Track current page size for pagination
  allTables: [], // List of all table names in the database
};

/**
 * Get the current state
 * @returns {object} Current state object
 */
function getCurrentState() {
  return currentState;
}

/**
 * Update the current state
 * @param {object} newState - New state values to merge
 */
function updateState(newState) {
  currentState = { ...currentState, ...newState };

  // Debug logging for encryption key changes
  if (newState.encryptionKey !== undefined) {
    console.log(
      "Encryption key updated in state:",
      newState.encryptionKey ? "[PROVIDED]" : "[EMPTY]"
    );
  }

  // Save state to VS Code
  if (typeof vscode !== "undefined") {
    vscode.setState(currentState);
  }
}

/**
 * Initialize state from VS Code saved state
 */
function initializeState() {
  if (typeof vscode !== "undefined") {
    const savedState = vscode.getState();
    if (savedState) {
      currentState = { ...currentState, ...savedState };
    }
  }
}

/**
 * Reset state to initial values
 */

function resetState() {
  currentState = {
    databasePath: "",
    encryptionKey: "",
    openTables: [],
    activeTable: null,
    selectedTable: null,
    activeTab: "schema",
    isConnected: false,
    connectionError: null,
    queryHistory: [],
    tableCache: new Map(),
    currentPage: 1,
    pageSize: 100,
    allTables: [],
  };

  if (typeof vscode !== "undefined") {
    vscode.setState(currentState);
  }
}

// Ensure vscode is available globally for state.js
// @ts-ignore
var vscode =
  typeof window !== "undefined" && window.vscode ? window.vscode : undefined;

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getCurrentState,
    updateState,
    initializeState,
    resetState,
  };
}

// Make functions available globally
if (typeof window !== "undefined") {
  /** @type {any} */ (window).getCurrentState = getCurrentState;
  /** @type {any} */ (window).updateState = updateState;
  /** @type {any} */ (window).initializeState = initializeState;
  /** @type {any} */ (window).resetState = resetState;
}
