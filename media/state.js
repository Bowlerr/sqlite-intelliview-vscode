// @ts-check

/**
 * State management for the SQLite IntelliView
 */

// Reference to the current state
let currentState = {
  databasePath: "",
  encryptionKey: "",
  // Multi-table tabs state
  /** @type {Array<any>} */
  openTables: [], // Array of {key, label, isResultTab} objects
  activeTable: null, // Currently active table in tabs (key)
  // SortableJS integration state
  tabOrder: [], // Array of tab keys in display order
  dragState: {
    isDragging: false,
    draggedTabKey: null,
    originalIndex: -1,
    preventRerender: false,
  },
  tabGroups: {
    tables: [], // Regular table tabs
    results: [], // Query result tabs
  },
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
 * @param {object} options - Update options { renderTabs: boolean, renderSidebar: boolean }
 */
function updateState(newState, options = {}) {
  const { renderTabs = true, renderSidebar = true } = options;

  // Store previous state for comparison
  const prevOpenTables = currentState.openTables;
  const prevActiveTable =
    currentState.activeTable || currentState.selectedTable;
  const prevAllTables = currentState.allTables;

  currentState = { ...currentState, ...newState };

  // Debug logging for encryption key changes
  if (newState.encryptionKey !== undefined) {
    window.debug.debug(
      "State",
      "Encryption key updated in state:",
      newState.encryptionKey ? "[PROVIDED]" : "[EMPTY]"
    );
  }

  // Save state to VS Code
  if (typeof vscode !== "undefined") {
    vscode.setState(currentState);
  }

  // Optimized rendering logic - only render when necessary
  if (typeof window !== "undefined") {
    // Check if we should skip all rendering
    const shouldSkipRendering =
      currentState.dragState.isDragging ||
      currentState.dragState.preventRerender ||
      newState.skipTabRerender;

    if (shouldSkipRendering) {
      if (newState.skipTabRerender) {
        window.debug.debug(
          "State",
          "Skipping render due to skipTabRerender flag"
        );
      } else if (currentState.dragState.preventRerender) {
        window.debug.debug(
          "State",
          "Skipping render due to drag preventRerender flag"
        );
      } else if (currentState.dragState.isDragging) {
        window.debug.debug("State", "Skipping render due to active drag");
      }
      return; // Exit early, no rendering
    }

    // Smart tab rendering - only when structure actually changed
    if (renderTabs && typeof window.renderTableTabs === "function") {
      const tabsChanged = hasTabsChanged(
        prevOpenTables,
        currentState.openTables
      );
      const activeChanged =
        prevActiveTable !==
        (currentState.activeTable || currentState.selectedTable);

      if (tabsChanged) {
        window.debug.debug("State", "Re-rendering tabs (structure changed)");
        window.renderTableTabs(
          currentState.openTables,
          currentState.activeTable || currentState.selectedTable || ""
        );
      } else if (
        activeChanged &&
        typeof window.updateActiveTab === "function"
      ) {
        window.debug.debug(
          "State",
          "Updating active tab only (no structure change)"
        );
        window.updateActiveTab(
          currentState.activeTable || currentState.selectedTable || ""
        );
      }
    }

    // Smart sidebar rendering - only when table list changed
    if (renderSidebar && typeof window.displayTablesList === "function") {
      const sidebarChanged = hasArrayChanged(
        prevAllTables,
        currentState.allTables
      );

      if (sidebarChanged) {
        window.debug.debug("State", "Re-rendering sidebar (tables changed)");
        window.displayTablesList(currentState.allTables);
      }
    }
  }
}

/**
 * Check if tabs array has structurally changed (keys, labels, order)
 * @param {Array} prevTabs - Previous tabs array
 * @param {Array} currentTabs - Current tabs array
 * @returns {boolean} - True if tabs changed
 */
function hasTabsChanged(prevTabs, currentTabs) {
  if (!Array.isArray(prevTabs) || !Array.isArray(currentTabs)) {
    return true;
  }

  if (prevTabs.length !== currentTabs.length) {
    return true;
  }

  for (let i = 0; i < prevTabs.length; i++) {
    const prev = prevTabs[i];
    const current = currentTabs[i];

    if (!prev || !current) {
      return true;
    }
    if (prev.key !== current.key) {
      return true;
    }
    if (prev.label !== current.label) {
      return true;
    }
    if (prev.isResultTab !== current.isResultTab) {
      return true;
    }
  }

  return false;
}

/**
 * Check if array has changed (shallow comparison)
 * @param {Array} prevArray - Previous array
 * @param {Array} currentArray - Current array
 * @returns {boolean} - True if array changed
 */
function hasArrayChanged(prevArray, currentArray) {
  if (!Array.isArray(prevArray) || !Array.isArray(currentArray)) {
    return true;
  }

  if (prevArray.length !== currentArray.length) {
    return true;
  }

  for (let i = 0; i < prevArray.length; i++) {
    if (prevArray[i] !== currentArray[i]) {
      return true;
    }
  }

  return false;
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
    // If openTables is empty and allTables has tables, initialize openTables with the first table
    if (
      Array.isArray(currentState.openTables) &&
      currentState.openTables.length === 0 &&
      Array.isArray(currentState.allTables) &&
      currentState.allTables.length > 0
    ) {
      const firstTable = currentState.allTables[0];
      if (firstTable) {
        currentState.openTables = [{ key: firstTable, label: firstTable }];
        currentState.activeTable = firstTable;
        currentState.selectedTable = firstTable;
        // Immediately update tabs and sidebar
        if (typeof window !== "undefined") {
          if (typeof window.renderTableTabs === "function") {
            window.renderTableTabs(
              currentState.openTables,
              currentState.activeTable || ""
            );
          }
          if (typeof window.displayTablesList === "function") {
            window.displayTablesList(currentState.allTables);
          }
        }
      }
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
    openTables: [], // Array of {key, label, isResultTab}
    activeTable: null,
    // SortableJS integration state
    tabOrder: [], // Array of tab keys in display order
    dragState: {
      isDragging: false,
      draggedTabKey: null,
      originalIndex: -1,
      preventRerender: false,
    },
    tabGroups: {
      tables: [], // Regular table tabs
      results: [], // Query result tabs
    },
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

/**
 * SortableJS Integration Functions
 */

/**
 * Reorder tabs based on SortableJS drag operation
 * @param {number} fromIndex - Original index of the dragged tab
 * @param {number} toIndex - Target index for the dragged tab
 */
function reorderTabs(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    window.debug.debug(
      "State",
      "No reorder needed - same position or invalid indices"
    );
    return; // No change needed
  }

  // Filter out any undefined/null values first
  const cleanTabs = currentState.openTables.filter(
    (tab) => tab && tab.key && tab.label
  );

  if (fromIndex >= cleanTabs.length || toIndex >= cleanTabs.length) {
    window.debug.warn("State", "Invalid indices - out of bounds");
    return; // Invalid indices
  }

  window.debug.debug("State", "Reordering tabs from", fromIndex, "to", toIndex);
  window.debug.debug(
    "State",
    "Before reorder:",
    cleanTabs.map((tab) => tab.label)
  );

  const [movedTab] = cleanTabs.splice(fromIndex, 1);
  cleanTabs.splice(toIndex, 0, movedTab);

  window.debug.debug(
    "State",
    "After reorder:",
    cleanTabs.map((tab) => tab.label)
  );

  // Update state without re-rendering during drag operations
  updateState(
    {
      openTables: cleanTabs,
      tabOrder: cleanTabs.map((tab) => tab.key),
    },
    { renderTabs: false, renderSidebar: false }
  );

  window.debug.info("State", "Tab reorder completed successfully");
}

// Ensure vscode is available globally for state.js
// @ts-ignore
var vscode =
  typeof window !== "undefined" && window["vscode"]
    ? window["vscode"]
    : undefined;

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getCurrentState,
    updateState,
    initializeState,
    resetState,
    // SortableJS integration functions
    reorderTabs,
  };
}

// Make functions available globally
if (typeof window !== "undefined") {
  /** @type {any} */ (window).getCurrentState = getCurrentState;
  /** @type {any} */ (window).updateState = updateState;
  /** @type {any} */ (window).initializeState = initializeState;
  /** @type {any} */ (window).resetState = resetState;
  // SortableJS integration functions
  /** @type {any} */ (window).reorderTabs = reorderTabs;
}
