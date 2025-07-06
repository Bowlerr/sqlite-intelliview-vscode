// resizable-sidebar.js - Resizable sidebar functionality

/**
 * Resizable Sidebar Manager
 * Handles sidebar resizing and minimize/maximize functionality
 */
class ResizableSidebar {
  constructor() {
    this.sidebar = null;
    this.resizeHandle = null;
    this.toggleButton = null;
    this.isResizing = false;
    this.isMinimized = false;
    this.originalWidth = 300;
    this.minWidth = 200;
    this.maxWidth = 600;

    this.init();
  }

  init() {
    this.sidebar = document.getElementById("sidebar");
    this.resizeHandle = document.getElementById("sidebar-resize-handle");
    this.toggleButton = document.getElementById("sidebar-toggle");

    if (!this.sidebar || !this.resizeHandle || !this.toggleButton) {
      console.warn(
        "Sidebar elements not found, skipping resizable sidebar initialization"
      );
      return;
    }

    this.setupEventListeners();
    this.loadSavedState();
    this.initializeMinimizedContent();
  }

  setupEventListeners() {
    // Toggle minimize/maximize
    this.toggleButton.addEventListener("click", () => {
      this.toggleMinimize();
    });

    // Resize functionality
    this.resizeHandle.addEventListener("mousedown", (e) => {
      this.startResize(e);
    });

    // Global mouse events for resizing
    document.addEventListener("mousemove", (e) => {
      if (this.isResizing) {
        this.resize(e);
      }
    });

    document.addEventListener("mouseup", () => {
      if (this.isResizing) {
        this.stopResize();
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      // Ctrl/Cmd + B to toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        this.toggleMinimize();
      }
    });

    // Prevent text selection during resize
    document.addEventListener("selectstart", (e) => {
      if (this.isResizing) {
        e.preventDefault();
      }
    });
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;

    if (this.isMinimized) {
      this.minimize();
    } else {
      this.maximize();
    }

    this.saveState();
  }

  minimize() {
    this.sidebar.classList.add("minimized");
    this.toggleButton.textContent = "⟩";
    this.toggleButton.title = "Expand Sidebar";

    // Trigger a custom event for other components to react
    this.dispatchSidebarEvent("sidebar-minimized");
  }

  maximize() {
    this.sidebar.classList.remove("minimized");
    this.toggleButton.textContent = "⟨";
    this.toggleButton.title = "Minimize Sidebar";

    // Trigger a custom event for other components to react
    this.dispatchSidebarEvent("sidebar-maximized");
  }

  startResize(e) {
    if (this.isMinimized) {
      return;
    }

    this.isResizing = true;
    this.sidebar.classList.add("resizing");
    document.body.classList.add("sidebar-resizing");

    e.preventDefault();
  }

  resize(e) {
    if (!this.isResizing || this.isMinimized) {
      return;
    }

    const containerRect = this.sidebar.parentElement.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;

    // Constrain width within min/max bounds
    const constrainedWidth = Math.max(
      this.minWidth,
      Math.min(this.maxWidth, newWidth)
    );

    // Update CSS custom property for width
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${constrainedWidth}px`
    );
    this.originalWidth = constrainedWidth;
  }

  stopResize() {
    if (!this.isResizing) {
      return;
    }

    this.isResizing = false;
    this.sidebar.classList.remove("resizing");
    document.body.classList.remove("sidebar-resizing");

    this.saveState();
    this.dispatchSidebarEvent("sidebar-resized");
  }

  setSidebarWidth(width) {
    const constrainedWidth = Math.max(
      this.minWidth,
      Math.min(this.maxWidth, width)
    );
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${constrainedWidth}px`
    );
    this.originalWidth = constrainedWidth;
    this.saveState();
  }

  /**
   * Update the selected table display in minimized sidebar
   * @param {string} tableName - Name of the selected table
   */
  updateSelectedTable(tableName) {
    const indicator = document.getElementById("selected-table-indicator");
    if (!indicator) {
      return;
    }

    if (tableName) {
      indicator.textContent = tableName;
      indicator.classList.remove("empty");
      indicator.title = `Selected Table: ${tableName}`;
    } else {
      indicator.textContent = "No Table";
      indicator.classList.add("empty");
      indicator.title = "No table selected";
    }
  }

  /**
   * Get the current minimized state
   * @returns {boolean} Whether sidebar is minimized
   */
  getIsMinimized() {
    return this.isMinimized;
  }

  dispatchSidebarEvent(eventName) {
    const event = new CustomEvent(eventName, {
      detail: {
        width: this.originalWidth,
        isMinimized: this.isMinimized,
      },
    });
    document.dispatchEvent(event);
  }

  saveState() {
    try {
      const state = {
        width: this.originalWidth,
        isMinimized: this.isMinimized,
      };
      localStorage.setItem(
        "sqlite-intelliview-vscode-sidebar-state",
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn("Failed to save sidebar state:", error);
    }
  }

  loadSavedState() {
    try {
      const savedState = localStorage.getItem("sqlite-intelliview-vscode-sidebar-state");
      if (savedState) {
        const state = JSON.parse(savedState);

        if (state.width) {
          this.setSidebarWidth(state.width);
        }

        if (state.isMinimized) {
          this.isMinimized = false; // Reset to call toggleMinimize
          this.toggleMinimize();
        }
      }
    } catch (error) {
      console.warn("Failed to load sidebar state:", error);
    }
  }

  /**
   * Initialize minimized sidebar content with current state
   */
  initializeMinimizedContent() {
    // Initialize with current state if available
    if (typeof getCurrentState === "function") {
      const currentState = getCurrentState();
      this.updateSelectedTable(currentState.selectedTable);
    }
  }

  // Public API methods
  getWidth() {
    return this.originalWidth;
  }

  getIsMinimized() {
    return this.isMinimized;
  }

  setMinimized(minimized) {
    if (this.isMinimized !== minimized) {
      this.toggleMinimize();
    }
  }
}

// Initialize resizable sidebar when DOM is ready
let resizableSidebar;

// Safety function to update selected table even if sidebar isn't ready yet
function updateSelectedTableSafe(tableName) {
  if (window.resizableSidebar && window.resizableSidebar.updateSelectedTable) {
    window.resizableSidebar.updateSelectedTable(tableName);
  } else {
    console.log("ResizableSidebar not ready, will update when initialized");
    // Store the table name for when the sidebar is ready
    window.pendingTableSelection = tableName;
  }
}

// Make the safe function globally available
window.updateSelectedTableSafe = updateSelectedTableSafe;

function initializeResizableSidebar() {
  if (typeof ResizableSidebar !== "undefined") {
    resizableSidebar = new ResizableSidebar();

    // Make it globally accessible
    window.resizableSidebar = resizableSidebar;

    // Check if there was a pending table selection
    if (window.pendingTableSelection) {
      console.log(
        "Applying pending table selection:",
        window.pendingTableSelection
      );
      resizableSidebar.updateSelectedTable(window.pendingTableSelection);
      window.pendingTableSelection = null;
    }

    console.log("Resizable sidebar initialized");
  }
}

// Initialize when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeResizableSidebar);
} else {
  initializeResizableSidebar();
}

// Export for potential module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = ResizableSidebar;
}
