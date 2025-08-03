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
  // Core State-Change Trigger: always refresh tabs and sidebar
  // Skip rendering during drag operations to prevent SortableJS conflicts
  if (typeof window !== "undefined" && !currentState.dragState.isDragging) {
    if (typeof window.renderTableTabs === "function") {
      window.renderTableTabs(
        currentState.openTables,
        currentState.activeTable || currentState.selectedTable || ""
      );
    }
    if (typeof window.displayTablesList === "function") {
      window.displayTablesList(currentState.allTables);
    }
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
    console.log("State: No reorder needed - same position or invalid indices");
    return; // No change needed
  }

  // Filter out any undefined/null values first
  const cleanTabs = currentState.openTables.filter(
    (tab) => tab && tab.key && tab.label
  );

  if (fromIndex >= cleanTabs.length || toIndex >= cleanTabs.length) {
    console.log("State: Invalid indices - out of bounds");
    return; // Invalid indices
  }

  console.log("State: Reordering tabs from", fromIndex, "to", toIndex);
  console.log(
    "State: Before reorder:",
    cleanTabs.map((tab) => tab.label)
  );

  const [movedTab] = cleanTabs.splice(fromIndex, 1);
  cleanTabs.splice(toIndex, 0, movedTab);

  console.log(
    "State: After reorder:",
    cleanTabs.map((tab) => tab.label)
  );

  // Update state properly using updateState to trigger UI updates
  updateState({
    openTables: cleanTabs,
    tabOrder: cleanTabs.map((tab) => tab.key),
  });

  console.log("State: Tab reorder completed successfully");
}
/**
 * Move a specific tab to a target position
 * @param {string} tabKey - Key of the tab to move
 * @param {number} targetIndex - Target position index
 */
function moveTabToPosition(tabKey, targetIndex) {
  const currentIndex = currentState.openTables.findIndex(
    (tab) => tab.key === tabKey
  );
  if (currentIndex !== -1 && currentIndex !== targetIndex) {
    reorderTabs(currentIndex, targetIndex);
  }
}

/**
 * Get the ordered list of tab keys
 * @returns {Array<string>} Array of tab keys in display order
 */
function getTabOrderedList() {
  return currentState.tabOrder.length > 0
    ? currentState.tabOrder
    : currentState.openTables.map((tab) => tab.key);
}

/**
 * Update the tab order array
 * @param {Array<string>} newOrder - New array of tab keys in order
 */
function updateTabOrder(newOrder) {
  updateState({ tabOrder: newOrder });
}

/**
 * Update drag state for SortableJS operations
 * @param {boolean} isDragging - Whether a drag operation is active
 * @param {string|null} draggedTabKey - Key of the tab being dragged
 * @param {number} originalIndex - Original index of the dragged tab
 */
function updateDragState(isDragging, draggedTabKey, originalIndex) {
  updateState({
    dragState: {
      isDragging,
      draggedTabKey,
      originalIndex,
    },
  });
}

/**
 * Validate that the tab order is consistent with open tables
 * @param {Array<string>} order - Tab order to validate
 * @returns {boolean} Whether the order is valid
 */
function validateTabOrder(order) {
  if (!Array.isArray(order)) {
    return false;
  }

  const openTabKeys = currentState.openTables.map((tab) => tab.key);
  if (order.length !== openTabKeys.length) {
    return false;
  }

  return (
    order.every((key) => openTabKeys.includes(key)) &&
    openTabKeys.every((key) => order.includes(key))
  );
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
    moveTabToPosition,
    getTabOrderedList,
    updateTabOrder,
    updateDragState,
    validateTabOrder,
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
  /** @type {any} */ (window).moveTabToPosition = moveTabToPosition;
  /** @type {any} */ (window).getTabOrderedList = getTabOrderedList;
  /** @type {any} */ (window).updateTabOrder = updateTabOrder;
  /** @type {any} */ (window).updateDragState = updateDragState;
  /** @type {any} */ (window).validateTabOrder = validateTabOrder;
}
