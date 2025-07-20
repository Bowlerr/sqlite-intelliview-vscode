// @ts-check
/**
 * Table Tabs UI for multi-table support in Data tab
 * Handles rendering, switching, adding, and closing table tabs
 */

/**
 * Render the table tabs bar above the data table area
 * @param {Array<string>} openTables - Array of open table names
 * @param {string} activeTable - Currently active table
 */
function renderTableTabs(openTables, activeTable) {
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
  // Build tabs HTML
  let html = openTables
    .map(
      (table) => `
        <div class=\"table-tab${
          table === activeTable ? " active" : ""
        }\" data-table=\"${escapeHtml(
        table
      )}\">\n          <span class=\"tab-label\">${escapeHtml(
        table
      )}</span>\n          <button class=\"close-tab-btn\" title=\"Close\">&times;</button>\n        </div>\n      `
    )
    .join("");
  // Determine if there are more tables to open
  let allTables = [];
  if (typeof window.getAllTableNames === "function") {
    allTables = window.getAllTableNames();
    allTables = Array.isArray(allTables)
      ? allTables.map((t) => (typeof t === "string" ? t : t.name)).filter(Boolean)
      : [];
  }
  const available = allTables.filter((t) => !openTables.includes(t));
  const addTabDisabled = available.length === 0;
  // Add "+" button, disabled if no more tables
  html += `<div class="table-tab add-tab${addTabDisabled ? ' disabled' : ''}" id="add-table-tab" title="Add table"${addTabDisabled ? ' tabindex="-1" aria-disabled="true"' : ''}>+</div>`;
  // Add a hidden dropdown for table picker
  html += `<select id="table-picker-dropdown" style="display:none; position:absolute;"></select>`;
  tabsBar.innerHTML = html;

  // Add event listeners
  tabsBar.querySelectorAll(".table-tab").forEach((tabEl) => {
    const table = tabEl.getAttribute("data-table");
    if (tabEl.classList.contains("add-tab")) {
      if (tabEl.classList.contains("disabled")) {
        tabEl.onclick = (e) => { e.preventDefault(); e.stopPropagation(); };
        tabEl.setAttribute("aria-disabled", "true");
        tabEl.setAttribute("tabindex", "-1");
      } else {
        tabEl.onclick = (e) => {
          // Show a dropdown of tables not already open, or open directly if only one
          if (typeof window.getAllTableNames === "function") {
            let allTables = window.getAllTableNames();
            allTables = Array.isArray(allTables)
              ? allTables.map((t) => (typeof t === "string" ? t : t.name)).filter(Boolean)
              : [];
            const available = allTables.filter((t) => !openTables.includes(t));
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
    } else {
      // Tab click: switch
      // @ts-ignore
      tabEl.onclick = (e) => {
        if (e.target.classList.contains("close-tab-btn")) {
          return;
        }
        // @ts-ignore
        if (typeof window.switchTableTab === "function") {
          // @ts-ignore
          window.switchTableTab(table);
        }
      };
      // Close button
      const closeBtn = tabEl.querySelector(".close-tab-btn");
      if (closeBtn) {
        // @ts-ignore
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          // @ts-ignore
          if (typeof window.closeTableTab === "function") {
            // @ts-ignore
            window.closeTableTab(table);
          }
        };
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
