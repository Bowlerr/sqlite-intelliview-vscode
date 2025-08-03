// @ts-check
/**
 * Table Tabs UI for multi-table support in Data tab
 * Handles rendering, switching, adding, and closing table tabs
 */

// Track which tab is being renamed and its value
let renamingTabKey = null;
let renamingValue = "";
let currentRenameValue = null;

/**
 * Render the table tabs bar above the data table area
 * @param {Array<{key: string, label: string}>} openTables - Array of open table objects
 * @param {string} activeTableKey - Currently active table key
 */
function renderTableTabs(openTables, activeTableKey) {
  let tabsBar = document.getElementById("table-tabs-bar");
  if (!tabsBar) {
    tabsBar = document.createElement("div");
    tabsBar.id = "table-tabs-bar";
    tabsBar.className = "table-tabs-bar";
    // Insert above data-content
    const dataContent = document.getElementById("data-content");
    if (dataContent && dataContent.parentNode) {
      dataContent.parentNode.insertBefore(tabsBar, dataContent);
    }
  }
  // Filter out invalid tab objects (missing key or label)
  const validTabs = Array.isArray(openTables)
    ? openTables.filter((tab) => tab && tab.key && tab.label)
    : [];
  // Build tabs HTML
  let html = validTabs
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
  // Add "+" button, disabled if no more tables
  html += `<div class="table-tab add-tab${
    addTabDisabled ? " disabled" : ""
  }" id="add-table-tab" title="Add table"${
    addTabDisabled ? ' tabindex="-1" aria-disabled="true"' : ""
  }>+</div>`;
  // Add a hidden dropdown for table picker
  html += `<select id="table-picker-dropdown" style="display:none; position:absolute;"></select>`;
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
          window["updateState"]({
            openTables,
            activeTable: key,
            selectedTable: key,
            tableCache: state.tableCache,
          });
          // Also update the sidebar immediately if available
          if (
            typeof window.displayTablesList === "function" &&
            Array.isArray(state.allTables)
          ) {
            window.displayTablesList(state.allTables);
          }
          renamingTabKey = null;
          renamingValue = "";
          currentRenameValue = null;
          // Force tab bar re-render to exit edit mode
          if (typeof renderTableTabs === "function") {
            renderTableTabs(openTables, key || "");
          }
        }
      }
      function cancelRename() {
        renamingTabKey = null;
        renamingValue = "";
        renderTableTabs(openTables, activeTableKey);
      }
    } else if (labelEl && labelEl.getAttribute("data-rename") === "true") {
      // Cast to HTMLElement for style/title
      const labelHtmlEl = /** @type {HTMLElement} */ (labelEl);
      labelHtmlEl.style.cursor = "context-menu";
      labelHtmlEl.title = "Right-click to rename";

      // Add right-click event for rename
      labelEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only trigger rename if not already renaming this tab
        if (renamingTabKey !== key) {
          renamingTabKey = key;
          renamingValue = label;
          currentRenameValue = null; // Reset the current rename value
          renderTableTabs(openTables, activeTableKey);
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
          // Only trigger rename if not already renaming this tab
          if (renamingTabKey !== key) {
            renamingTabKey = key;
            renamingValue = label;
            currentRenameValue = null; // Reset the current rename value
            renderTableTabs(openTables, activeTableKey);
          }
        });
      }
    }
  });
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
