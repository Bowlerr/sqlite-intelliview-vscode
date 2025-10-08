// @ts-nocheck
/**
 * Table Tabs UI for multi-table support in Data tab
 * Handles rendering, switching, adding, closing, and reordering table tabs
 * Includes SortableJS integration for drag-and-drop functionality
 */

// Track which tab is being renamed and its value
let renamingTabKey = null;
let renamingValue = "";
let currentRenameValue = null;

// SortableJS instance and state
let sortableInstance = null;
let sortableInitializationTimeout = null;
let isInitializingSortable = false;
let sortableJS = null; // Will hold the SortableJS class once loaded

// Track the last rendered state to avoid unnecessary re-renders
let lastRenderedState = {
  openTables: [],
  activeTable: "",
};

/**
 * Check if tabs need to be re-rendered by comparing with last state
 * @param {Array<{key: string, label: string}>} openTables
 * @param {string} activeTableKey
 * @returns {boolean}
 */
function shouldRerenderTabs(openTables, activeTableKey) {
  // Always re-render if there's an active rename operation to ensure UI state consistency
  if (renamingTabKey !== null) {
    return true;
  }

  // Check if tab structure changed
  if (!openTables || !Array.isArray(openTables)) {
    return true;
  }

  if (lastRenderedState.openTables.length !== openTables.length) {
    return true;
  }

  // Check if any tab keys or labels changed
  for (let i = 0; i < openTables.length; i++) {
    const current = openTables[i];
    const last = lastRenderedState.openTables[i];
    if (!last || current.key !== last.key || current.label !== last.label) {
      return true;
    }
  }

  // If only active tab changed, no need to re-render DOM
  return false;
}

/**
 * Render the table tabs bar above the data table area
 * @param {Array<{key: string, label: string}>} openTables - Array of open table objects
 * @param {string} activeTableKey - Currently active table key
 */
function renderTableTabs(openTables, activeTableKey) {
  const tabsBar = document.getElementById("table-tabs-bar");
  if (!tabsBar) {
    return;
  }

  // Check if we need to re-render the DOM or just update active tab
  if (!shouldRerenderTabs(openTables, activeTableKey)) {
    console.log(
      "Table tabs: Only active tab changed, updating without DOM re-render"
    );
    updateActiveTab(activeTableKey);
    return;
  }

  console.log("Table tabs: Structure changed, performing full re-render");

  // Update our tracking state
  lastRenderedState = {
    openTables: openTables
      ? openTables.map((t) => ({ key: t.key, label: t.label }))
      : [],
    activeTable: activeTableKey || "",
  };
  // Filter out invalid tab objects (missing key or label)
  const validTabs = Array.isArray(openTables)
    ? openTables.filter((tab) => tab && tab.key && tab.label)
    : [];

  // Determine if there are more tables to open
  let allTables = [];
  if (typeof window.getAllTableNames === "function") {
    allTables = window.getAllTableNames();
    allTables = Array.isArray(allTables)
      ? allTables
          .map((t) => (typeof t === "string" ? t : t.name))
          .filter(Boolean)
      : [];
  }
  // Only consider non-result tabs for add
  const openTableKeys = openTables.map((t) => t.key);
  const available = allTables.filter((t) => !openTableKeys.includes(t));
  const addTabDisabled = available.length === 0;

  // Build "+" button first, then tabs - add button at the start
  let html = `<div class="table-tab add-tab${
    addTabDisabled ? " disabled" : ""
  }" id="add-table-tab" title="Add table"${
    addTabDisabled ? ' tabindex="-1" aria-disabled="true"' : ""
  }>+</div>`;

  // Add the regular tabs after the plus button
  html += validTabs
    .map((tab) => {
      const { key, label, isResultTab } = tab;
      const isRenaming = renamingTabKey === key;
      let inputValue = renamingValue;
      if (isResultTab && isRenaming && currentRenameValue !== null) {
        inputValue = currentRenameValue;
      }
      return `
        <div class="table-tab${
          key === activeTableKey ? " active" : ""
        }" data-table-key="${key}"${
        isResultTab ? ' data-result-tab="true"' : ""
      }>
          ${
            isResultTab && isRenaming
              ? `<input type="text" class="tab-rename-input" value="${escapeHtml(
                  inputValue
                )}" autofocus style="min-width:100px;" />
                 <button class="tick-tab-btn" title="Confirm" tabindex="0">&#10003;</button>`
              : `<span class="tab-label"${
                  isResultTab ? ' data-rename="true"' : ""
                }>${
                  isResultTab
                    ? '<span class="tab-icon" title="Query Result">🧮</span> '
                    : ""
                }${escapeHtml(label)}</span>
                 <button class="close-tab-btn" title="Close">&times;</button>`
          }
        </div>
      `;
    })
    .join("");

  // Add a hidden dropdown for table picker
  html += `<select id="table-picker-dropdown" style="display:none; position:absolute;"></select>`;

  // Destroy existing SortableJS instance before replacing DOM
  destroySortableJS();

  // Replace DOM content
  tabsBar.innerHTML = html;

  // Add event listeners
  tabsBar.querySelectorAll(".table-tab").forEach((tabEl) => {
    if (tabEl.classList.contains("add-tab")) {
      if (tabEl.classList.contains("disabled")) {
        tabEl.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };
        tabEl.setAttribute("aria-disabled", "true");
        tabEl.setAttribute("tabindex", "-1");
      } else {
        tabEl.onclick = (e) => {
          // Show a dropdown of tables not already open, or open directly if only one
          if (typeof window.getAllTableNames === "function") {
            let allTables = window.getAllTableNames();
            allTables = Array.isArray(allTables)
              ? allTables
                  .map((t) => (typeof t === "string" ? t : t.name))
                  .filter(Boolean)
              : [];
            const openTableKeys = Array.isArray(openTables)
              ? openTables.map((t) => t.key)
              : [];
            const available = allTables.filter(
              (t) => !openTableKeys.includes(t)
            );
            if (available.length === 1) {
              if (typeof window.openTableTab === "function") {
                window.openTableTab(available[0], 1, 100);
              }
              return;
            }
            const dropdown = document.getElementById("table-picker-dropdown");
            if (dropdown) {
              const select = /** @type {HTMLSelectElement} */ (dropdown);
              select.innerHTML = "";
              select.setAttribute("aria-label", "Select table to open");
              select.setAttribute("aria-haspopup", "listbox");
              select.setAttribute("role", "listbox");
              select.removeAttribute("tabindex");
              if (available.length === 0) {
                const opt = document.createElement("option");
                opt.value = "";
                opt.textContent = "No more tables";
                select.appendChild(opt);
                select.disabled = true;
              } else {
                available.forEach((t) => {
                  const opt = document.createElement("option");
                  opt.value = t;
                  opt.textContent = t;
                  select.appendChild(opt);
                });
                select.disabled = false;
              }
              const rect = tabEl.getBoundingClientRect();
              select.style.display = "block";
              select.style.position = "absolute";
              select.style.left = rect.left + "px";
              let top = rect.bottom + window.scrollY;
              setTimeout(() => {
                const ddRect = select.getBoundingClientRect();
                if (ddRect.bottom > window.innerHeight) {
                  let overlap = ddRect.bottom - window.innerHeight + 8;
                  select.style.top = top - overlap + "px";
                }
              }, 0);
              select.style.top = top + "px";
              if (available.length > 1) {
                select.size = Math.min(available.length, 8);
                select.selectedIndex = -1;
              } else {
                select.removeAttribute("size");
              }
              select.focus();
              function triggerOpenSelected() {
                const val = select.value;
                // @ts-ignore
                if (val && typeof window.openTableTab === "function") {
                  // @ts-ignore
                  window.openTableTab(val, 1, 100);
                }
                select.style.display = "none";
                if (tabEl instanceof HTMLElement) {
                  tabEl.focus();
                }
              }
              function closeDropdown() {
                select.style.display = "none";
                if (tabEl instanceof HTMLElement) {
                  tabEl.focus();
                }
              }
              select.onkeydown = (e) => {
                if (e.key === "Enter") {
                  triggerOpenSelected();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  closeDropdown();
                }
              };
              select.onclick = (e) => {
                if (select.selectedIndex !== -1 && select.value) {
                  triggerOpenSelected();
                }
              };
              select.onblur = () => {
                setTimeout(() => {
                  select.style.display = "none";
                }, 120);
              };
            }
          } else {
            // fallback: tell user to select from sidebar
            console.log(
              "Table picker not available. Select a table from the sidebar."
            );
          }
        };
      }
      return;
    }
    // Real table tabs only below
    const key = tabEl.getAttribute("data-table-key");
    const tabObj = openTables.find((t) => t.key === key);
    if (!tabObj) {
      return;
    }
    const label = tabObj.label;
    // Tab click: switch
    tabEl.onclick = (e) => {
      if (e.target.classList.contains("close-tab-btn")) {
        return;
      }
      if (typeof window.switchTableTab === "function") {
        window.switchTableTab(key);
      }
    };
    // Close button
    const closeBtn = tabEl.querySelector(".close-tab-btn");
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof window.closeTableTab === "function") {
          window.closeTableTab(key);
        }
      };
    }
    // Inline rename for Results tabs
    const labelEl = tabEl.querySelector(".tab-label");
    const input = tabEl.querySelector(".tab-rename-input");
    if (input) {
      // Simple tab rename input logic
      const inputEl = input instanceof HTMLInputElement ? input : null;

      if (inputEl) {
        // Focus input when entering edit mode (only on initial render)
        if (currentRenameValue === null) {
          setTimeout(() => {
            inputEl.focus();
            // Select all text for easier editing
            inputEl.select();
          }, 0);
        }

        // Track live value on input
        inputEl.oninput = function () {
          currentRenameValue = inputEl.value;
        };

        // Handle mouse clicks to preserve cursor position
        inputEl.onclick = function (e) {
          e.stopPropagation();
          // Don't prevent default to allow normal cursor positioning
        };

        // Prevent input from losing focus due to tab clicks
        inputEl.onmousedown = function (e) {
          e.stopPropagation();
        };

        // Keydown: Enter to commit, Escape to cancel
        inputEl.onkeydown = function (ev) {
          if (ev.key === "Enter") {
            finishRename();
          } else if (ev.key === "Escape") {
            cancelRename();
          }
        };
      }
      // Tick button handler
      const tickBtn = tabEl.querySelector(".tick-tab-btn");
      if (tickBtn) {
        tickBtn.addEventListener("click", (e) => {
          e.preventDefault();
          finishRename();
        });
      }
      function finishRename() {
        let newLabel =
          currentRenameValue !== null
            ? currentRenameValue.trim()
            : inputEl
            ? inputEl.value.trim()
            : label;
        if (!newLabel) {
          newLabel = label;
        }

        // Clear rename state FIRST to avoid race conditions
        renamingTabKey = null;
        renamingValue = "";
        currentRenameValue = null;

        if (
          typeof window["getCurrentState"] === "function" &&
          typeof window["updateState"] === "function"
        ) {
          const state = window["getCurrentState"]();
          let openTables = Array.isArray(state.openTables)
            ? state.openTables.map((t) => ({ ...t }))
            : [];
          const idx = openTables.findIndex((t) => t.key === key);
          if (idx !== -1) {
            openTables[idx].label = newLabel;
          }

          // Update state without triggering immediate render
          window["updateState"](
            {
              openTables,
              activeTable: key,
              selectedTable: key,
              tableCache: state.tableCache,
            },
            { renderTabs: false, renderSidebar: false }
          );

          // Also update the sidebar immediately if available
          if (
            typeof window.displayTablesList === "function" &&
            Array.isArray(state.allTables)
          ) {
            window.displayTablesList(state.allTables);
          }

          // Force a clean re-render with updated state and cleared rename flags
          setTimeout(() => {
            if (typeof renderTableTabs === "function") {
              renderTableTabs(openTables, key || "");
            }
          }, 0);
        }
      }
      function cancelRename() {
        // Clear rename state FIRST
        renamingTabKey = null;
        renamingValue = "";
        currentRenameValue = null;

        // Force immediate re-render to exit edit mode
        if (
          typeof window["getCurrentState"] === "function" &&
          typeof renderTableTabs === "function"
        ) {
          const state = window["getCurrentState"]();
          renderTableTabs(state.openTables || openTables, activeTableKey);
        }
      }
    } else if (labelEl && labelEl.getAttribute("data-rename") === "true") {
      // Cast to HTMLElement for style/title
      const labelHtmlEl = /** @type {HTMLElement} */ (labelEl);
      labelHtmlEl.style.cursor = "context-menu";
      labelHtmlEl.title = "Right-click to rename";

      // Add right-click event for tab context menu
      labelEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mouseEvent = /** @type {MouseEvent} */ (e);
        if (key && label) {
          showTabContextMenu(mouseEvent, key, label);
        }
      });

      const icon = labelEl.querySelector(".tab-icon");
      if (icon) {
        const iconEl = /** @type {HTMLElement} */ (icon);
        iconEl.style.cursor = "context-menu";
        iconEl.title = "Right-click to rename";
        iconEl.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const mouseEvent = /** @type {MouseEvent} */ (e);
          if (key && label) {
            showTabContextMenu(mouseEvent, key, label);
          }
        });
      }
    }
  });

  // Initialize SortableJS ONLY if needed and DOM structure actually changed
  initializeSortableJSIfNeeded();
}

/**
 * SortableJS Integration Functions
 */

/**
 * Smart SortableJS lifecycle management with debouncing - only initialize when needed
 */
function initializeSortableJSIfNeeded() {
  // Clear any pending initialization to avoid rapid re-inits
  if (sortableInitializationTimeout) {
    clearTimeout(sortableInitializationTimeout);
    sortableInitializationTimeout = null;
  }

  // Debounce initialization to handle rapid DOM changes
  sortableInitializationTimeout = setTimeout(() => {
    performSortableInitialization();
  }, 10); // Small delay to batch DOM changes
}

function performSortableInitialization() {
  if (isInitializingSortable) {
    console.log("SortableJS: Already initializing, skipping duplicate request");
    return;
  }

  const tabsBar = document.getElementById("table-tabs-bar");
  if (!tabsBar) {
    console.log("SortableJS: No tabs-bar found, skipping initialization");
    return;
  }

  // Check if there are any draggable tabs
  const draggableTabs = tabsBar.querySelectorAll(".table-tab:not(.add-tab)");
  if (draggableTabs.length === 0) {
    console.log(
      "SortableJS: No draggable tabs found, destroying instance if exists"
    );
    destroySortableJS();
    return;
  }

  // Check if current instance is still valid and attached to correct element
  if (sortableInstance) {
    try {
      // Verify instance is still connected to the DOM and the right element
      if (sortableInstance.el === tabsBar && document.contains(tabsBar)) {
        console.log(
          "SortableJS: Instance still valid, skipping re-initialization"
        );
        return;
      } else {
        console.log(
          "SortableJS: Instance element mismatch, destroying and recreating"
        );
        sortableInstance.destroy();
        sortableInstance = null;
      }
    } catch (error) {
      console.log(
        "SortableJS: Error checking instance validity, recreating:",
        error
      );
      sortableInstance = null;
    }
  }

  // Initialize fresh instance
  console.log(
    "SortableJS: Creating new instance for",
    draggableTabs.length,
    "tabs"
  );
  initializeSortableJS();
}

/**
 * Initialize SortableJS for drag-and-drop functionality
 */
function initializeSortableJS() {
  const tabsBar = document.getElementById("table-tabs-bar");
  if (!tabsBar) {
    console.log("SortableJS: No tabs bar found, skipping initialization");
    return; // Exit if no tabs bar
  }

  // Check if there are any draggable tabs
  const draggableTabs = tabsBar.querySelectorAll(".table-tab:not(.add-tab)");
  if (draggableTabs.length === 0) {
    console.log("SortableJS: No draggable tabs found, skipping initialization");
    return;
  }

  // Double-check for existing instance (should not happen with smart lifecycle)
  if (sortableInstance) {
    console.log("SortableJS: Unexpected existing instance, destroying first");
    try {
      sortableInstance.destroy();
    } catch (error) {
      console.log("SortableJS: Error destroying existing instance:", error);
    }
    sortableInstance = null;
  }

  // Wait for SortableJS to be available globally
  if (typeof window.Sortable === "undefined") {
    console.log("SortableJS: Library not loaded yet, retrying in 100ms");
    // Clear flag and retry later
    isInitializingSortable = false;
    setTimeout(initializeSortableJS, 100);
    return;
  }

  // Set initialization flag to prevent concurrent initialization
  isInitializingSortable = true;

  console.log(
    "SortableJS: Initializing new instance with",
    draggableTabs.length,
    "draggable tabs"
  );
  sortableJS = window.Sortable;

  sortableInstance = sortableJS.create(tabsBar, {
    // Core configuration - keep it simple!
    animation: 150,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",

    // Visual feedback classes
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",

    // Drag constraints
    draggable: ".table-tab:not(.add-tab)",
    filter: ".close-tab-btn, .tick-tab-btn, .tab-rename-input",

    onStart: function (evt) {
      console.log("SortableJS: Drag started from index", evt.oldIndex);

      // Set a persistent flag to prevent any re-renders during and after drag
      if (typeof window.updateState === "function") {
        window.updateState({
          dragState: {
            isDragging: true,
            preventRerender: true, // Prevent all tab re-renders
          },
        });
      }

      // Add visual feedback
      tabsBar.classList.add("sortable-drag-active");
    },

    onEnd: function (evt) {
      console.log("SortableJS: Drag ended", evt.oldIndex, "->", evt.newIndex);

      // Remove visual feedback
      tabsBar.classList.remove("sortable-drag-active");

      // Only update state if position actually changed
      if (evt.oldIndex !== evt.newIndex) {
        console.log("SortableJS: Reordering tabs");

        // CRITICAL: Get the new order from the actual DOM elements after SortableJS moved them
        const tabElements = tabsBar.querySelectorAll(
          ".table-tab:not(.add-tab)"
        );
        const newOrderKeys = Array.from(tabElements)
          .map((el) => el.getAttribute("data-table-key"))
          .filter((key) => key);

        console.log("SortableJS: New DOM order:", newOrderKeys);

        // Update state to match the DOM order, not the theoretical reorder
        if (
          typeof window.getCurrentState === "function" &&
          typeof window.updateState === "function"
        ) {
          const currentState = window.getCurrentState();
          if (currentState && currentState.openTables) {
            // Reconstruct openTables array to match the new DOM order
            const newOpenTables = newOrderKeys
              .map((key) =>
                currentState.openTables.find((tab) => tab.key === key)
              )
              .filter((tab) => tab); // Remove any undefined entries

            console.log("SortableJS: Updating state to match DOM order");

            // Update state with DOM-based order and prevent re-render
            window.updateState(
              {
                openTables: newOpenTables,
                tabOrder: newOrderKeys,
              },
              { renderTabs: false, renderSidebar: false }
            );

            // Update our tracking to match
            lastRenderedState = {
              openTables: newOpenTables.map((t) => ({
                key: t.key,
                label: t.label,
              })),
              activeTable:
                currentState.activeTable || currentState.selectedTable || "",
            };
          }
        }

        // Clear drag state without causing re-render
        setTimeout(() => {
          if (typeof window.updateState === "function") {
            window.updateState(
              {
                dragState: {
                  isDragging: false,
                  preventRerender: false,
                },
              },
              { renderTabs: false, renderSidebar: false }
            );
          }
        }, 50);
      } else {
        console.log("SortableJS: No position change, skipping reorder");

        // Clear drag state immediately if no reorder
        if (typeof window.updateState === "function") {
          window.updateState({
            dragState: {
              isDragging: false,
              preventRerender: false,
            },
          });
        }
      }
    },

    onMove: function (evt) {
      // Only prevent dropping on add-tab button
      // Let SortableJS handle everything else naturally!
      if (evt.related.classList.contains("add-tab")) {
        console.log("SortableJS: Preventing drop on add-tab button");
        return false;
      }

      // Allow all other moves - trust SortableJS's UX patterns
      return true;
    },
  });

  // Clear initialization flag - instance successfully created
  isInitializingSortable = false;
  console.log("SortableJS: Instance created successfully");
}

/**
 * Destroy the current SortableJS instance
 */
function destroySortableJS() {
  // Clear any pending initialization
  if (sortableInitializationTimeout) {
    clearTimeout(sortableInitializationTimeout);
    sortableInitializationTimeout = null;
  }

  if (sortableInstance) {
    try {
      sortableInstance.destroy();
    } catch (error) {
      console.log("SortableJS: Error during destruction:", error);
    }
    sortableInstance = null;
  }

  // Clear initialization state
  isInitializingSortable = false;
  console.log("SortableJS: Instance destroyed and state cleared");
}

/**
 * Refresh the SortableJS instance with new configuration
 */
function refreshSortableInstance() {
  console.log("SortableJS: Refreshing instance");
  destroySortableJS();
  // Small delay to ensure DOM is settled
  setTimeout(initializeSortableJS, 10);
}

/**
 * Force reinitialize SortableJS after DOM changes
 */
function forceSortableReinit() {
  console.log("SortableJS: Force reinitializing");
  destroySortableJS();
  initializeSortableJS();
}

/**
 * Update SortableJS options
 * @param {object} options - Options to update
 */
function updateSortableOptions(options) {
  if (sortableInstance && typeof sortableInstance.option === "function") {
    Object.keys(options).forEach((key) => {
      sortableInstance.option(key, options[key]);
    });
  }
}

/**
 * Wrapper functions to safely call state management functions
 */
function reorderTabsWrapper(fromIndex, toIndex) {
  if (typeof window.reorderTabs === "function") {
    window.reorderTabs(fromIndex, toIndex);
  }
}

/**
 * Update the active tab without full re-render (preserves SortableJS)
 * @param {string} activeTableKey - The key of the tab to make active
 */
function updateActiveTab(activeTableKey) {
  const tabsBar = document.getElementById("table-tabs-bar");
  if (!tabsBar) {
    return;
  }

  // Remove active class from all tabs
  tabsBar.querySelectorAll(".table-tab").forEach((tab) => {
    tab.classList.remove("active");
  });

  // Add active class to the specified tab
  if (activeTableKey) {
    const activeTab = tabsBar.querySelector(
      `[data-table-key="${activeTableKey}"]`
    );
    if (activeTab) {
      activeTab.classList.add("active");
      console.log(
        "Table tabs: Updated active tab to",
        activeTableKey,
        "without re-render"
      );
    }
  }
}

/**
 * Debug function to check SortableJS status
 */
function debugSortableJS() {
  console.log("=== SortableJS Debug Info ===");
  console.log(
    "SortableJS library loaded:",
    typeof window.Sortable !== "undefined"
  );
  console.log("SortableJS instance exists:", !!sortableInstance);

  const tabsBar = document.getElementById("table-tabs-bar");
  console.log("Tabs bar element found:", !!tabsBar);

  if (tabsBar) {
    const draggableTabs = tabsBar.querySelectorAll(".table-tab:not(.add-tab)");
    console.log("Number of draggable tabs:", draggableTabs.length);
    draggableTabs.forEach((tab, index) => {
      console.log(`  Tab ${index}:`, tab.getAttribute("data-table-key"));
    });
  }

  if (sortableInstance) {
    console.log("SortableJS instance el:", sortableInstance.el);
    console.log("SortableJS options:", sortableInstance.option());
  }
  console.log("=== End Debug Info ===");
}

/**
 * Escape HTML for safe rendering
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Export globally for main.js
if (typeof window !== "undefined") {
  window.renderTableTabs = renderTableTabs;
  window.updateActiveTab = updateActiveTab;
  window.debugSortableJS = debugSortableJS;
  // SortableJS integration exports
  window.initializeSortableJS = initializeSortableJS;
  window.destroySortableJS = destroySortableJS;
  window.refreshSortableInstance = refreshSortableInstance;
  window.forceSortableReinit = forceSortableReinit;
  window.updateSortableOptions = updateSortableOptions;

  // Initialize tab context menu when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTabContextMenu);
  } else {
    initializeTabContextMenu();
  }
}

/**
 * Initialize tab context menu functionality
 */
function initializeTabContextMenu() {
  // Add global click listener to hide context menu
  document.addEventListener("click", hideTabContextMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideTabContextMenu();
    }
  });

  console.log("Tab context menu initialized");
}

// Helper: get all table names from state (for table picker)
if (
  typeof window !== "undefined" &&
  // @ts-ignore
  typeof window.getAllTableNames !== "function"
) {
  // @ts-ignore
  window.getAllTableNames = function () {
    // @ts-ignore
    if (typeof window.getCurrentState === "function") {
      // @ts-ignore
      const state = window.getCurrentState();
      if (state && Array.isArray(state.allTables)) {
        return state.allTables;
      }
      // fallback: try tablesListElement
      const list = document.getElementById("tables-list");
      if (list) {
        return Array.from(list.querySelectorAll(".table-item")).map((el) =>
          el.textContent.trim()
        );
      }
    }
    return [];
  };
}

// Tab context menu functionality
let tabContextMenu = null;
let currentTabKey = null;
let currentTabLabel = null;

/**
 * Create the tab context menu DOM element
 */
function createTabContextMenuElement() {
  if (tabContextMenu) {
    return;
  }

  tabContextMenu = document.createElement("div");
  tabContextMenu.className = "context-menu tab-context-menu";
  tabContextMenu.innerHTML = `
    <div class="context-menu-item" data-action="edit-query">
      <span class="icon">✏️</span>
      <span>Edit Query</span>
    </div>
    <div class="context-menu-item" data-action="refresh-query">
      <span class="icon">🔄</span>
      <span>Refresh Query</span>
    </div>
    <div class="context-menu-separator"></div>
    <div class="context-menu-item" data-action="rename-tab">
      <span class="icon">🏷️</span>
      <span>Rename Tab</span>
    </div>
    <div class="context-menu-separator"></div>
    <div class="context-menu-item context-menu-item-danger" data-action="close-tab">
      <span class="icon">❌</span>
      <span>Close Tab</span>
    </div>
  `;

  // Add click handlers for menu items
  tabContextMenu.addEventListener("click", handleTabContextMenuClick);

  // Prevent context menu from closing when clicking inside it
  tabContextMenu.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.appendChild(tabContextMenu);
}

/**
 * Show the tab context menu
 * @param {MouseEvent} e - Mouse event
 * @param {string} tabKey - The key of the tab
 * @param {string} tabLabel - The label of the tab
 */
function showTabContextMenu(e, tabKey, tabLabel) {
  currentTabKey = tabKey;
  currentTabLabel = tabLabel;

  if (!tabContextMenu) {
    createTabContextMenuElement();
  }

  // Position the context menu
  const menuWidth = 200;
  const menuHeight = 160;
  let x = e.clientX;
  let y = e.clientY;

  // Adjust position if menu would go off screen
  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 10;
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 10;
  }

  tabContextMenu.style.left = `${x}px`;
  tabContextMenu.style.top = `${y}px`;
  tabContextMenu.style.display = "block";

  // Add global click listener to hide menu
  setTimeout(() => {
    document.addEventListener("click", hideTabContextMenu);
    document.addEventListener("contextmenu", hideTabContextMenu);
  }, 0);
}

/**
 * Hide the tab context menu
 */
function hideTabContextMenu() {
  if (tabContextMenu) {
    tabContextMenu.style.display = "none";
  }
  currentTabKey = null;
  currentTabLabel = null;

  // Remove global listeners
  document.removeEventListener("click", hideTabContextMenu);
  document.removeEventListener("contextmenu", hideTabContextMenu);
}

/**
 * Handle tab context menu clicks
 * @param {Event} e - Click event
 */
function handleTabContextMenuClick(e) {
  e.preventDefault();
  e.stopPropagation();

  const target = /** @type {HTMLElement} */ (e.target);
  const menuItem = target.closest(".context-menu-item");
  if (!menuItem) {
    return;
  }

  const action = menuItem.getAttribute("data-action");
  if (!action || !currentTabKey) {
    return;
  }

  executeTabContextMenuAction(action, currentTabKey, currentTabLabel);
  hideTabContextMenu();
}

/**
 * Execute tab context menu actions
 * @param {string} action - The action to execute
 * @param {string} tabKey - The tab key
 * @param {string} tabLabel - The tab label
 */
function executeTabContextMenuAction(action, tabKey, tabLabel) {
  switch (action) {
    case "edit-query":
      // Switch to query editor and populate with the query for this tab
      if (typeof (/** @type {any} */ (window).switchTab) === "function") {
        /** @type {any} */ (window).switchTab("query");
        // Get the query for this tab and populate the editor
        if (
          typeof (/** @type {any} */ (window).getCurrentState) === "function"
        ) {
          const state = /** @type {any} */ (window).getCurrentState();
          const tabData =
            state.openTables &&
            state.openTables.find(
              /** @param {any} t */ (t) => t.key === tabKey
            );
          let queryToEdit = null;

          // First try to get query from the tab object
          if (tabData && tabData.query) {
            queryToEdit = tabData.query;
          }
          // If not found in tab, try to get it from the cache
          else if (state.tableCache) {
            let cachedData = null;
            if (
              state.tableCache instanceof Map &&
              state.tableCache.has(tabKey)
            ) {
              cachedData = state.tableCache.get(tabKey);
            } else if (
              typeof state.tableCache === "object" &&
              state.tableCache[tabKey]
            ) {
              cachedData = state.tableCache[tabKey];
            }
            if (cachedData && cachedData.query) {
              queryToEdit = cachedData.query;
            }
          }

          if (queryToEdit) {
            // Set the query in the enhanced Monaco editor
            if (
              typeof (/** @type {any} */ (window).queryEditor) !==
                "undefined" &&
              /** @type {any} */ (window).queryEditor.setValue
            ) {
              /** @type {any} */ (window).queryEditor.setValue(queryToEdit);
            }
            // Fallback: try to set in regular query editor element
            else {
              const queryEditor = document.getElementById("query-editor");
              if (queryEditor) {
                const editorEl = /** @type {any} */ (queryEditor);
                if (editorEl.setValue) {
                  editorEl.setValue(queryToEdit);
                } else if (editorEl.value !== undefined) {
                  editorEl.value = queryToEdit;
                }
              }
            }
          } else {
            console.warn("No query found for tab:", tabKey);
          }
        }
      }
      break;

    case "refresh-query":
      // Re-execute the query for this tab
      if (typeof (/** @type {any} */ (window).getCurrentState) === "function") {
        const state = /** @type {any} */ (window).getCurrentState();
        const tabData =
          state.openTables &&
          state.openTables.find(/** @param {any} t */ (t) => t.key === tabKey);
        if (tabData && tabData.query) {
          // Execute the query again - send query directly, not nested in data
          const vscode = /** @type {any} */ (window).vscode;
          if (vscode) {
            vscode.postMessage({
              type: "executeQuery",
              query: tabData.query,
            });
          }
        } else {
          console.warn("No query found for refresh on tab:", tabKey);
        }
      }
      break;

    case "rename-tab":
      // Trigger rename mode for this tab
      renamingTabKey = tabKey;
      renamingValue = tabLabel;
      currentRenameValue = null;

      // Force immediate re-render to enter edit mode
      if (
        typeof (/** @type {any} */ (window).getCurrentState) === "function" &&
        typeof renderTableTabs === "function"
      ) {
        const state = /** @type {any} */ (window).getCurrentState();
        // Use setTimeout to ensure the rename state is set before rendering
        setTimeout(() => {
          renderTableTabs(state.openTables, state.activeTable);
        }, 0);
      }
      break;

    case "close-tab":
      // Close this tab
      if (typeof (/** @type {any} */ (window).closeTableTab) === "function") {
        /** @type {any} */ (window).closeTableTab(tabKey);
      }
      break;

    default:
      console.warn("Unknown tab context menu action:", action);
  }
}
