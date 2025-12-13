// @ts-check

/**
 * Event handling for the SQLite IntelliView
 */

/**
 * Initialize all event listeners
 */
/**
 * Handle error message
 * @param {Object} message - Error message
 */
function handleError(message) {
  // Reset connect button state on error
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  if (elements.connectBtn) {
    elements.connectBtn.disabled = false;
    elements.connectBtn.classList.remove("connecting", "connected");
    elements.connectBtn.innerHTML = "Connect with Key";
  }

  if (typeof showError !== "undefined") {
    showError(message.message);
  }
}

/**
 * Used to guard against duplicate global event listener registration.
 * @type {boolean|undefined}
 */
window._eventListenersInitialized;

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
  // Enhanced diagnostic: log each call, guard state, and stack trace
  if (window.debug) {
    window.debug.debug(
      `[events.js] initializeEventListeners called. Guard: ${
        window["_eventListenersInitialized"]
      }, Stack: ${new Error().stack}`
    );
  }
  /** @type {any} */
  if (window["_eventListenersInitialized"]) {
    return;
  }
  // Register global event listeners only once per webview lifecycle
  window.addEventListener("message", handleExtensionMessage);
  // Use capture so shortcuts still work when focused components (e.g. Monaco) stop bubbling.
  document.removeEventListener("keydown", handleGlobalKeyboard);
  document.addEventListener("keydown", handleGlobalKeyboard, true);

  // If we previously hard-reloaded (non-VS Code fallback), restore any snapshot
  // before we start wiring up UI behaviors.
  restoreFallbackReloadSnapshotOnce();

  const elements = getAllDOMElements ? getAllDOMElements() : {};

  // Connect button
  if (elements.connectBtn) {
    elements.connectBtn.addEventListener("click", handleConnect);
  }

  // Execute query button
  if (elements.executeQueryBtn) {
    elements.executeQueryBtn.addEventListener("click", handleExecuteQuery);
  }

  // Clear query button
  if (elements.clearQueryBtn) {
    elements.clearQueryBtn.addEventListener("click", () => {
      if (
        /** @type {any} */ (window).queryEditor &&
        /** @type {any} */ (window).queryEditor.clearEditor
      ) {
        /** @type {any} */ (window).queryEditor.clearEditor();
      }
    });
  }

  // Tab switching
  if (elements.tabs) {
    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        if (typeof switchTab !== "undefined") {
          switchTab(tab.dataset.tab);
        }
        if (typeof updateState !== "undefined") {
          updateState({ activeTab: tab.dataset.tab });
        }

        // Lazy-load schema only when the Schema tab is opened.
        if (tab.dataset.tab === "schema") {
          const state =
            typeof getCurrentState === "function" ? getCurrentState() : {};
          const selected = state.selectedTable || state.activeTable || null;
          if (
            selected &&
            typeof selected === "string" &&
            !selected.startsWith("Results (") &&
            window.vscode &&
            typeof window.vscode.postMessage === "function"
          ) {
            window.vscode.postMessage({
              type: "getTableSchema",
              tableName: selected,
              key: state.encryptionKey,
            });
          }
        }
      });
    });
  }

  // Connection help button
  const connectionHelpBtn = document.getElementById("connection-help-btn");
  if (connectionHelpBtn) {
    connectionHelpBtn.addEventListener("click", () => {
      if (typeof showConnectionHelp !== "undefined") {
        showConnectionHelp();
      }
    });
  }

  // Main help button
  const mainHelpBtn = document.getElementById("main-help-btn");
  if (mainHelpBtn) {
    mainHelpBtn.addEventListener("click", () => {
      if (typeof showKeyboardShortcuts !== "undefined") {
        showKeyboardShortcuts();
      }
    });
  }

  window["_eventListenersInitialized"] = true;
  if (window.debug) {
    window.debug.debug(
      "[events.js] Event listeners registered. Guard set to true."
    );
  }
}

/**
 * Handle global keyboard shortcuts
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleGlobalKeyboard(e) {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  const keyLower = typeof e.key === "string" ? e.key.toLowerCase() : "";
  const isKeyR = e.code === "KeyR" || keyLower === "r";

  // Ctrl/Cmd + Enter to execute query
  const isEnter =
    e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
  if (isCtrlOrCmd && isEnter) {
    e.preventDefault();
    handleExecuteQuery();
  }

  // Ctrl/Cmd + K to clear query
  const isKeyK = e.code === "KeyK" || keyLower === "k";
  if (isCtrlOrCmd && isKeyK) {
    e.preventDefault();
    // Clear query through the Monaco editor if available
    if (window.queryEditor && window.queryEditor.clearEditor) {
      window.queryEditor.clearEditor();
    }
  }

  // Ctrl/Cmd + F to focus search in active table
  const isKeyF = e.code === "KeyF" || keyLower === "f";
  if (isCtrlOrCmd && isKeyF) {
    // VS Code may also bind Cmd/Ctrl+F; best-effort capture inside the webview.
    e.preventDefault();
    e.stopPropagation();

    const findSearchInput = () => {
      const activePanel = document.querySelector(".tab-panel.active");
      if (activePanel) {
        const input = activePanel.querySelector(".search-input");
        if (input) {
          return input;
        }
      }
      const dataPanel = document.getElementById("data-panel");
      if (dataPanel) {
        const input = dataPanel.querySelector(".search-input");
        if (input) {
          return input;
        }
      }
      return document.querySelector(".search-input");
    };

    const searchInput = findSearchInput();
    if (searchInput && searchInput instanceof HTMLInputElement) {
      searchInput.focus();
      searchInput.select();
    }
  }

  // "/" to focus table search (works even when Cmd/Ctrl+F is intercepted by VS Code).
  if (!isCtrlOrCmd && !e.altKey && keyLower === "/") {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target && target.matches("input, textarea, [contenteditable='true']")) {
      return;
    }
    const dataPanel = document.getElementById("data-panel");
    if (dataPanel && dataPanel.classList.contains("active")) {
      const searchInput = dataPanel.querySelector(".search-input");
      if (searchInput && searchInput instanceof HTMLInputElement) {
        e.preventDefault();
        e.stopPropagation();
        searchInput.focus();
        searchInput.select();
      }
    }
  }

  // Ctrl/Cmd + Shift + R to refresh database view
  if (isCtrlOrCmd && e.shiftKey && !e.altKey && isKeyR) {
    e.preventDefault();
    refreshDatabaseView();
  }

  // Ctrl/Cmd + Alt/Option + R to hard reload database connection
  if (isCtrlOrCmd && e.altKey && !e.shiftKey && isKeyR) {
    e.preventDefault();
    reloadDatabaseConnection();
  }

  // Escape to close notifications
  if (e.key === "Escape" || e.code === "Escape") {
    document.querySelectorAll(".notification").forEach((n) => n.remove());
  }
}

function refreshDatabaseView(options = {}) {
  const includeDatabaseInfo = options.includeDatabaseInfo !== false;
  const state = typeof getCurrentState === "function" ? getCurrentState() : {};
  const key = typeof state.encryptionKey === "string" ? state.encryptionKey : "";

  if (
    includeDatabaseInfo &&
    window.vscode &&
    typeof window.vscode.postMessage === "function"
  ) {
    window.vscode.postMessage({ type: "requestDatabaseInfo", key });
  }

  // Best-effort: refresh the currently active/selected table contents too.
  const tableName = state.selectedTable || state.activeTable || null;
  if (
    typeof tableName === "string" &&
    tableName &&
    !tableName.startsWith("Results (") &&
    typeof window.selectTable === "function"
  ) {
    const page =
      typeof state.currentPage === "number" && state.currentPage > 0
        ? state.currentPage
        : 1;
    const pageSize =
      typeof state.pageSize === "number" && state.pageSize > 0
        ? state.pageSize
        : 100;
    window.selectTable(tableName, page, pageSize);
  }
}

function reloadDatabaseConnection() {
  const state = typeof getCurrentState === "function" ? getCurrentState() : {};
  const key = typeof state.encryptionKey === "string" ? state.encryptionKey : "";

  if (window.vscode && typeof window.vscode.postMessage === "function") {
    window.vscode.postMessage({ type: "reloadDatabase", key });
    return;
  }

  // Fallback: reload the webview UI if the VS Code API isn't available.
  const doReload = () => {
    try {
      window.location.reload();
    } catch (_) {
      // ignore
    }
  };

  const persistThenReload = () => {
    const saved = persistFallbackReloadSnapshot();
    if (saved) {
      doReload();
      return;
    }

    // If we couldn't persist, require an explicit second confirmation.
    showConfirmDialog({
      message:
        "Could not save your current state before reloading.\n\nReload anyway? Unsaved query/editor content may be lost.",
      confirmText: "Reload Anyway",
      cancelText: "Cancel",
      onConfirm: doReload,
      onCancel: clearFallbackReloadSnapshot,
    });
  };

  showConfirmDialog({
    message:
      "Hard reload will refresh the UI.\n\nContinue? Non-sensitive UI state will be saved and restored when possible. For safety, encryption keys and query text are not persisted.",
    confirmText: "Reload",
    cancelText: "Cancel",
    onConfirm: persistThenReload,
    onCancel: clearFallbackReloadSnapshot,
  });
}

const FALLBACK_RELOAD_SNAPSHOT_KEY = "sqlite-intelliview:reloadSnapshot:v1";

function showConfirmDialog({
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}) {
  try {
    const overlay = document.createElement("div");
    overlay.className = "confirm-dialog-overlay";

    const dialog = document.createElement("div");
    dialog.className = "confirm-dialog";

    const messageEl = document.createElement("div");
    messageEl.className = "confirm-dialog-message";
    messageEl.textContent = String(message || "");

    const buttonsEl = document.createElement("div");
    buttonsEl.className = "confirm-dialog-buttons";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "confirm-dialog-btn confirm-dialog-btn-cancel";
    cancelBtn.textContent = cancelText || "Cancel";

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "confirm-dialog-btn confirm-dialog-btn-confirm";
    confirmBtn.textContent = confirmText || "OK";

    buttonsEl.appendChild(cancelBtn);
    buttonsEl.appendChild(confirmBtn);
    dialog.appendChild(messageEl);
    dialog.appendChild(buttonsEl);
    overlay.appendChild(dialog);

    const closeDialog = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown, true);
    };

    const cancel = () => {
      closeDialog();
      if (typeof onCancel === "function") {
        onCancel();
      }
    };

    const confirm = () => {
      closeDialog();
      if (typeof onConfirm === "function") {
        onConfirm();
      }
    };

    cancelBtn.addEventListener("click", cancel);
    confirmBtn.addEventListener("click", confirm);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cancel();
      }
    });

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    document.body.appendChild(overlay);
    confirmBtn.focus();
  } catch (_) {
    // Last resort: native confirm.
    if (typeof window.confirm === "function") {
      const ok = window.confirm(String(message || ""));
      if (ok) {
        if (typeof onConfirm === "function") {
          onConfirm();
        }
      } else if (typeof onCancel === "function") {
        onCancel();
      }
    } else if (typeof onConfirm === "function") {
      onConfirm();
    }
  }
}

function clearFallbackReloadSnapshot() {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(FALLBACK_RELOAD_SNAPSHOT_KEY);
    }
  } catch (_) {
    // ignore
  }
}

function buildFallbackReloadSnapshot() {
  const state = typeof getCurrentState === "function" ? getCurrentState() : {};

  // `getCurrentState()` contains non-serializable caches (e.g. Maps). Persist only a safe subset.
  const safeState = {};
  [
    "databasePath",
    "openTables",
    "activeTable",
    "selectedTable",
    "activeTab",
    "isConnected",
    "connectionError",
    "queryHistory",
    "currentPage",
    "pageSize",
    "allTables",
    "tabOrder",
    "tabGroups",
  ].forEach((k) => {
    if (state && Object.prototype.hasOwnProperty.call(state, k)) {
      safeState[k] = state[k];
    }
  });

  // Capture query editor view state (cursor/selection/scroll) only.
  // Avoid persisting query text (may contain secrets).
  /** @type {any} */
  let queryEditorSnapshot = null;
  try {
    const qe = /** @type {any} */ (window).queryEditor;
    const editor = qe && qe.editor ? qe.editor : null;
    if (editor && typeof editor.getValue === "function") {
      queryEditorSnapshot = {
        viewState:
          typeof editor.saveViewState === "function"
            ? editor.saveViewState()
            : null,
      };
    } else if (qe && typeof qe.getValue === "function") {
      queryEditorSnapshot = { viewState: null };
    }
  } catch (_) {
    // ignore
  }

  // Normalize via JSON round-trip (drops unsupported types).
  let normalizedState = safeState;
  try {
    normalizedState = JSON.parse(JSON.stringify(safeState));
  } catch (_) {
    // ignore
  }

  // Ensure we never persist encryptionKey, even if it was added by future changes.
  try {
    if (normalizedState && typeof normalizedState === "object") {
      delete normalizedState.encryptionKey;
    }
  } catch (_) {
    // ignore
  }

  let normalizedQuery = queryEditorSnapshot;
  try {
    normalizedQuery = queryEditorSnapshot
      ? JSON.parse(JSON.stringify(queryEditorSnapshot))
      : null;
  } catch (_) {
    normalizedQuery = null;
  }

  return {
    version: 1,
    savedAt: Date.now(),
    state: normalizedState,
    queryEditor: normalizedQuery,
  };
}

function persistFallbackReloadSnapshot() {
  try {
    if (typeof sessionStorage === "undefined") {
      return false;
    }
    const snapshot = buildFallbackReloadSnapshot();
    sessionStorage.setItem(
      FALLBACK_RELOAD_SNAPSHOT_KEY,
      JSON.stringify(snapshot)
    );
    return true;
  } catch (_) {
    return false;
  }
}

function restoreFallbackReloadSnapshotOnce() {
  /** @type {any} */ const win = window;
  if (win.__fallbackReloadSnapshotRestored === true) {
    return;
  }
  win.__fallbackReloadSnapshotRestored = true;

  if (typeof sessionStorage === "undefined") {
    return;
  }

  let raw = "";
  try {
    raw = sessionStorage.getItem(FALLBACK_RELOAD_SNAPSHOT_KEY) || "";
  } catch (_) {
    raw = "";
  }
  if (!raw) {
    return;
  }

  /** @type {any} */
  let snapshot = null;
  try {
    snapshot = JSON.parse(raw);
  } catch (_) {
    clearFallbackReloadSnapshot();
    return;
  }

  const maxAgeMs = 10 * 60 * 1000;
  const savedAt = snapshot && typeof snapshot.savedAt === "number" ? snapshot.savedAt : 0;
  if (!snapshot || snapshot.version !== 1 || (savedAt && Date.now() - savedAt > maxAgeMs)) {
    clearFallbackReloadSnapshot();
    return;
  }

  // Sanitize older snapshots defensively (never restore secrets).
  try {
    if (snapshot && snapshot.state && typeof snapshot.state === "object") {
      delete snapshot.state.encryptionKey;
    }
    if (snapshot && snapshot.queryEditor && typeof snapshot.queryEditor === "object") {
      delete snapshot.queryEditor.value;
    }
  } catch (_) {
    // ignore
  }

  // Remove immediately to avoid repeat restores; keep it in-memory for delayed editor init.
  clearFallbackReloadSnapshot();
  win.__pendingFallbackReloadSnapshot = snapshot;

  // Restore basic state early (query editor restores later once Monaco is ready).
  try {
    if (snapshot.state && typeof window.updateState === "function") {
      window.updateState(snapshot.state, {
        renderTabs: true,
        renderSidebar: true,
        persistState: "none",
      });
    }
  } catch (_) {
    // ignore
  }

  restorePendingQueryEditorSnapshot();
}

function restorePendingQueryEditorSnapshot() {
  /** @type {any} */ const win = window;
  const snapshot = win.__pendingFallbackReloadSnapshot;
  if (!snapshot || !snapshot.queryEditor) {
    return;
  }

  const attemptRestore = (attempt) => {
    const qe = /** @type {any} */ (window).queryEditor;
    const editor = qe && qe.editor ? qe.editor : null;
    if (!editor || typeof editor.getValue !== "function") {
      if (attempt < 120) {
        setTimeout(() => attemptRestore(attempt + 1), 100);
      }
      return;
    }

    try {
      if (
        snapshot.queryEditor.viewState &&
        typeof editor.restoreViewState === "function"
      ) {
        editor.restoreViewState(snapshot.queryEditor.viewState);
      }

      if (typeof editor.focus === "function") {
        editor.focus();
      }
    } catch (_) {
      // ignore
    } finally {
      win.__pendingFallbackReloadSnapshot = null;
    }
  };

  attemptRestore(0);
}

/**
 * Handle messages from the VS Code extension
 * @param {MessageEvent} event - Message event
 */
function handleExtensionMessage(event) {
  const message = event.data;
  if (window.debug) {
    window.debug.debug(
      `[Events] Received message: ${message.type}, ${JSON.stringify(message)}`
    );
  }

  // Some errors should force the sidebar open so the user can enter a key, etc.
  if (
    message &&
    (message.type === "maximizeSidebar" ||
      message.type === "databaseLoadError" ||
      (message.type === "error" &&
        typeof message.message === "string" &&
        message.message.includes("Database appears to be encrypted")))
  ) {
    if (
      window.resizableSidebar &&
      typeof window.resizableSidebar.setMinimized === "function"
    ) {
      window.resizableSidebar.setMinimized(false);
    }
  }

  switch (message.type) {
    case "update":
      handleUpdate(message);
      break;
    case "databaseReloaded":
      // Refresh the active table without re-requesting databaseInfo (it was just reloaded).
      refreshDatabaseView({ includeDatabaseInfo: false });
      break;
    case "databaseInfo":
      handleDatabaseInfo(message);
      break;
    case "tableData":
      handleTableData(message);
      break;
    case "tableRowCount":
      handleTableRowCount(message);
      break;
    case "tableColumnInfo":
      handleTableColumnInfo(message);
      break;
    case "tableDataDelta":
      handleTableDataDelta(message);
      break;
    case "queryResult":
      handleQueryResult(message);
      break;
    case "tableSchema":
      handleTableSchema(message);
      break;
    case "erDiagram":
      handleERDiagram(message);
      break;
    case "erDiagramProgress":
      handleERDiagramProgress(message);
      break;
    case "error":
      handleError(message);
      break;
    case "cellUpdateSuccess":
      handleCellUpdateSuccess(message);
      break;
    case "cellUpdateError":
      handleCellUpdateError(message);
      break;
    case "deleteRowSuccess":
      handleDeleteRowSuccess(message);
      break;
    case "deleteRowError":
      handleDeleteRowError(message);
      break;
    case "databaseLoadError":
      if (typeof showError !== "undefined") {
        showError(message.error || "Failed to load database");
      }
      break;
    case "downloadBlobResult":
      if (typeof hideLoading === "function") {
        hideLoading();
      }
      if (message && message.canceled) {
        // no-op (user canceled save dialog)
        break;
      }
      if (message && message.success) {
        if (typeof showSuccess !== "undefined") {
          const bytes =
            typeof message.bytes === "number" ? message.bytes : undefined;
          showSuccess(
            bytes ? `Blob saved (${bytes.toLocaleString()} bytes)` : "Blob saved"
          );
        }
      } else {
        if (typeof showError !== "undefined") {
          showError(message.message || "Failed to save blob");
        }
      }
      break;
    default:
      if (window.debug) {
        window.debug.debug(`[Events] Unknown message type: ${message.type}`);
      }
  }
}

/**
 * Handle database connection
 */
function handleConnect() {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  const currentState = getCurrentState ? getCurrentState() : {};

  // Update button to show connecting state
  if (elements.connectBtn) {
    elements.connectBtn.disabled = true;
    elements.connectBtn.innerHTML = `
      <div class="button-spinner"></div>
      Connecting...
    `;
    elements.connectBtn.classList.add("connecting");
  }

  // Update connection status in header
  if (typeof updateConnectionStatus !== "undefined") {
    updateConnectionStatus(false, "Connecting...");
  }

  // Get the encryption key and store it in state
  const encryptionKey = elements.encryptionKeyInput
    ? elements.encryptionKeyInput.value
    : "";

  // Update state with the encryption key
  if (typeof updateState === "function") {
    updateState({ encryptionKey: encryptionKey });
  }

  // Send connect message to extension
  if (window.vscode && typeof window.vscode.postMessage === "function") {
    window.vscode.postMessage({
      type: "requestDatabaseInfo",
      key: encryptionKey,
    });
  }
}

/**
 * Handle query execution
 */
function handleExecuteQuery() {
  const elements = getAllDOMElements ? getAllDOMElements() : {};

  // Get query from enhanced editor if available, otherwise use fallback
  let query = "";

  if (
    /** @type {any} */ (window).queryEditor &&
    /** @type {any} */ (window).queryEditor.getValue
  ) {
    query = /** @type {any} */ (window).queryEditor.getValue().trim();
  }

  if (!query) {
    if (typeof showError !== "undefined") {
      showError("Please enter a SQL query");
    }
    return;
  }

  // Send query to extension
  if (window.vscode && typeof window.vscode.postMessage === "function") {
    window.vscode.postMessage({
      type: "executeQuery",
      query: query,
    });
  }
}

/**
 * Handle update message from extension
 * @param {Object} message - Update message
 */
function handleUpdate(message) {
  // Reset connect button state
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  if (elements.connectBtn) {
    elements.connectBtn.disabled = false;
    elements.connectBtn.classList.remove("connecting");
    if (message.isConnected) {
      elements.connectBtn.innerHTML = "Connected";
      elements.connectBtn.classList.add("connected");
    } else {
      elements.connectBtn.innerHTML = "Connect with Key";
      elements.connectBtn.classList.remove("connected");
    }
  }

  // Get current state to preserve encryption key
  const currentState =
    typeof getCurrentState === "function" ? getCurrentState() : {};

  if (typeof updateState !== "undefined") {
    updateState({
      databasePath: message.databasePath,
      isConnected: message.isConnected,
      connectionError: message.connectionError,
      // Preserve the encryption key from current state
      encryptionKey: currentState.encryptionKey || "",
    });
  }

  if (typeof updateConnectionStatus !== "undefined") {
    updateConnectionStatus(message.isConnected, message.connectionError);
  }

  if (message.tables) {
    if (typeof window.updateState === "function") {
      window.updateState(
        { allTables: message.tables },
        { renderTabs: false, renderSidebar: false }
      );
    }
    displayTablesList(message.tables);
  }

  if (message.isConnected && typeof showSuccess !== "undefined") {
    showSuccess("Connected to database successfully!");
  } else if (
    !message.isConnected &&
    message.connectionError &&
    typeof showError !== "undefined"
  ) {
    showError(`Connection failed: ${message.connectionError}`);
  }
}

/**
 * Handle database info message
 * @param {object} message - Message object
 */
function handleDatabaseInfo(message) {
  if (window.debug) {
    window.debug.debug(
      `[Events] handleDatabaseInfo called with message: ${JSON.stringify(
        message
      )}`
    );
  }

  // Reset connect button state regardless of success/failure
  const elements = getAllDOMElements ? getAllDOMElements() : {};

  if (message.success) {
    if (window.debug) {
      window.debug.debug("[Events] Database connection successful");
    }

    if (typeof updateState !== "undefined") {
      updateState({ isConnected: true, connectionError: null });
    }

    // Update connect button to show connected state
    if (elements.connectBtn) {
      elements.connectBtn.disabled = false;
      elements.connectBtn.classList.remove("connecting");
      elements.connectBtn.classList.add("connected");
      elements.connectBtn.innerHTML = "Connected";
    }

    // Update connection status in header
    if (typeof updateConnectionStatus !== "undefined") {
      updateConnectionStatus(true, null);
    }

    // Hide connection section since we're connected
    if (window.debug) {
      window.debug.debug("[Events] Calling hideConnectionSection...");
    }
    hideConnectionSection();

    if (typeof window.updateState === "function") {
      window.updateState(
        { allTables: message.tables || [] },
        { renderTabs: false, renderSidebar: false }
      );
    }
    if (typeof displayTablesList !== "undefined") {
      displayTablesList(message.tables);
    }

    // Determine the active main panel tab from the DOM (source of truth on startup),
    // then sync state so table-selection logic loads the correct data/schema.
    let activeMainTab = "schema";
    try {
      const activeEl = document.querySelector(".tab.active");
      const domTab = activeEl && activeEl instanceof HTMLElement ? activeEl.dataset.tab : null;
      if (domTab) {
        activeMainTab = domTab;
      } else if (typeof window.getCurrentState === "function") {
        const s = window.getCurrentState();
        if (s && typeof s.activeTab === "string") {
          activeMainTab = s.activeTab;
        }
      }
    } catch (_) {
      // ignore
    }

    if (typeof window.getCurrentState === "function" && typeof window.updateState === "function") {
      const s = window.getCurrentState();
      if (s && s.activeTab !== activeMainTab) {
        window.updateState(
          { activeTab: activeMainTab },
          { renderTabs: false, renderSidebar: false, persistState: "debounced" }
        );
      }
    }

    // Ensure the first table is opened on initial connect.
    let didOpenFirstTable = false;
    if (
      Array.isArray(message.tables) &&
      message.tables.length > 0 &&
      typeof window.getCurrentState === "function" &&
      typeof window.openTableTab === "function"
    ) {
      const state = window.getCurrentState();
      const openTables = Array.isArray(state.openTables) ? state.openTables : [];
      if (openTables.length === 0) {
        const first =
          typeof message.tables[0] === "string"
            ? message.tables[0]
            : message.tables[0].name;
        if (first) {
          window.openTableTab(first);
          didOpenFirstTable = true;
        }
      }
    }

    // If we already had persisted open tabs, nothing triggers an initial schema/data request.
    // Load what the user is currently looking at (schema/data) for the selected table.
    if (!didOpenFirstTable && typeof window.getCurrentState === "function") {
      const state = window.getCurrentState();
      const selected =
        state.selectedTable ||
        state.activeTable ||
        (Array.isArray(state.openTables) ? state.openTables[0]?.key : null) ||
        (Array.isArray(message.tables) && message.tables.length > 0
          ? typeof message.tables[0] === "string"
            ? message.tables[0]
            : message.tables[0].name
          : null);

      if (selected && typeof window.updateState === "function") {
        if (!state.selectedTable || !state.activeTable) {
          window.updateState(
            { selectedTable: selected, activeTable: selected },
            { renderTabs: false, renderSidebar: false }
          );
        }
      }

      // Only real tables have schema.
      const isResultTab = typeof selected === "string" && selected.startsWith("Results (");
      if (!isResultTab && selected && window.vscode && typeof window.vscode.postMessage === "function") {
        if (activeMainTab === "schema") {
          window.vscode.postMessage({
            type: "getTableSchema",
            tableName: selected,
            key: state.encryptionKey || "",
          });
        } else if (activeMainTab === "data") {
          const vs =
            typeof window.getTabViewState === "function"
              ? window.getTabViewState(selected)
              : null;
          const page = vs && typeof vs.page === "number" ? vs.page : 1;
          const pageSize =
            vs && typeof vs.pageSize === "number"
              ? vs.pageSize
              : typeof state.pageSize === "number"
              ? state.pageSize
              : 100;
          window.vscode.postMessage({
            type: "getTableData",
            tableName: selected,
            key: state.encryptionKey || "",
            page,
            pageSize,
          });
        }
      }
    }

    if (typeof showSuccess !== "undefined") {
      showSuccess("Database connected successfully!");
    }
  } else {
    if (window.debug) {
      window.debug.debug(
        `[Events] Database connection failed: ${message.error}`
      );
    }

    if (typeof updateState !== "undefined") {
      updateState({ isConnected: false, connectionError: message.error });
    }

    // Reset connect button to allow retry
    if (elements.connectBtn) {
      elements.connectBtn.disabled = false;
      elements.connectBtn.classList.remove("connecting", "connected");
      elements.connectBtn.innerHTML = "Connect with Key";
    }

    // Update connection status in header
    if (typeof updateConnectionStatus !== "undefined") {
      updateConnectionStatus(false, message.error);
    }

    // Show connection section for retry when database is disconnected
    if (window.debug) {
      window.debug.debug(
        "Database connection failed, showing connection section"
      );
    }
    showConnectionSection();

    if (typeof showError !== "undefined") {
      showError(`Connection failed: ${message.error}`);
    }
  }
}

/**
 * Handle query result message
 * @param {Object} message - Query result message
 */
function handleQueryResult(message) {
  if (message.success) {
    // Show query results as a new Results tab in the data area
    // Pass the query to displayQueryResults if available
    displayQueryResults(message.data, message.columns, message.query);
    const rowCount = message.data.length;
    const rowText = rowCount === 1 ? "row" : "rows";
    if (typeof showSuccess !== "undefined") {
      showSuccess(
        `Query executed successfully. ${rowCount} ${rowText} returned. Results are available in the Data tab.`
      );
    }
  } else {
    if (typeof showError !== "undefined") {
      showError("Query execution failed");
    }
  }

  // Dispatch event to notify query completion (for editor focus restoration)
  const event = new CustomEvent("queryExecutionComplete", {
    detail: {
      success: message.success,
      rowCount: message.success ? message.data.length : 0,
    },
  });
  document.dispatchEvent(event);

  // Improved focus restoration for Monaco editor - since we're not switching tabs,
  // the editor should remain interactive, but let's ensure it stays responsive
  setTimeout(() => {
    if (window.queryEditor && window.queryEditor.editor) {
      const editor = window.queryEditor.editor;

      try {
        if (window.debug) {
          window.debug.debug(
            "handleQueryResult: Ensuring Monaco editor responsiveness"
          );
        }

        // Check if editor is still responsive
        const model = editor.getModel();
        if (model) {
          // Force layout recalculation to ensure proper sizing
          editor.layout();

          // Only focus if the query tab is currently active
          const queryTab = document.querySelector('[data-tab="query"]');
          const queryPanel = document.getElementById("query-panel");

          if (
            queryTab &&
            queryTab.classList.contains("active") &&
            queryPanel &&
            queryPanel.classList.contains("active")
          ) {
            // Restore focus to editor if needed
            if (!editor.hasTextFocus()) {
              editor.focus();
            }
          }
        }
      } catch (error) {
        if (window.debug) {
          window.debug.error(
            "handleQueryResult: Error ensuring editor responsiveness:",
            error
          );
        }
        // If there's an issue, try refreshing the editor
        if (window.queryEditor.refreshEditor) {
          window.queryEditor.refreshEditor();
        }
      }
    }
  }, 50); // Reduced timeout since we're not switching tabs
}

/**
 * Handle error message
 * @param {object} message - Message object
 */
/**
 * Handle table schema message
 * @param {Object} message - Table schema message
 */
function handleTableSchema(message) {
  if (message.success) {
    if (!window._tableMetaCache) {
      window._tableMetaCache = new Map();
    }
    if (message.tableName) {
      window._tableMetaCache.set(message.tableName, {
        foreignKeys: message.foreignKeys || [],
        columns: message.columns || [],
      });
    }
    displayTableSchema(message.data, message.columns, message.foreignKeys);
  } else {
    if (typeof showError !== "undefined") {
      showError(`Failed to load table schema: ${message.tableName}`);
    }
  }
}

/**
 * Handle table data message
 * @param {Object} message - Table data message
 */
function handleTableData(message) {
  if (message.success) {
    // Store full column info (with fk metadata) for robust FK patching
    if (
      message.columnInfo &&
      Array.isArray(message.columnInfo) &&
      message.tableName
    ) {
      if (!window.currentTableSchema) {
        window.currentTableSchema = {};
      }
      window.currentTableSchema[message.tableName] = message.columnInfo;
    }

    if (!window._tableMetaCache) {
      window._tableMetaCache = new Map();
    }
    if (message.tableName) {
      window._tableMetaCache.set(message.tableName, {
        foreignKeys: message.foreignKeys || [],
        columnInfo: message.columnInfo || null,
        columns: message.columns || [],
      });
    }

    // Only render if this table is currently active; otherwise ignore the UI update.
    const state =
      typeof window.getCurrentState === "function" ? window.getCurrentState() : {};
    const active = state.activeTable || state.selectedTable || null;
    if (active && message.tableName && message.tableName !== active) {
      return;
    }

    displayTableData(message.data, message.columns, message.tableName, {
      page: message.page,
      pageSize: message.pageSize,
      totalRows: message.totalRows,
      totalRowsKnown: message.totalRowsKnown !== false && message.totalRows !== null && message.totalRows !== undefined,
      backendPaginated: true,
      foreignKeys: message.foreignKeys,
    });
  } else {
    if (typeof showError !== "undefined") {
      showError(`Failed to load data for table: ${message.tableName}`);
    }
  }
}

function handleTableRowCount(message) {
  const { tableName, totalRows } = message;
  if (!tableName || typeof totalRows !== "number") {
    return;
  }

  const wrapper = document.querySelector(
    `.enhanced-table-wrapper[data-table="${tableName}"]`
  );
  if (!wrapper) {
    return;
  }

  wrapper.setAttribute("data-total-rows", String(totalRows));
  wrapper.setAttribute("data-total-rows-known", "true");

  const pageSize = parseInt(wrapper.getAttribute("data-page-size") || "100", 10);
  const currentPage = parseInt(
    wrapper.getAttribute("data-current-page") || "1",
    10
  );
  const totalPages = Math.ceil(totalRows / pageSize);

  const statValue = wrapper.querySelector(".records-info .stat-value");
  if (statValue) {
    statValue.textContent = totalRows.toLocaleString();
  }

  const startIndex = (currentPage - 1) * pageSize;
  const pageRows = parseInt(wrapper.getAttribute("data-page-rows") || "0", 10);
  const renderedRows = wrapper.querySelectorAll("tbody tr.resizable-row").length;
  const endIndex = startIndex + (pageRows || renderedRows);
  const visibleRows = wrapper.querySelector(".visible-rows");
  if (visibleRows) {
    visibleRows.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalRows.toLocaleString()} rows`;
  }

  const paginationContainer = wrapper.querySelector(".table-pagination");
  if (paginationContainer) {
    const tableId = wrapper.getAttribute("data-table-id") || "unknown";
    if (totalPages > 1 && typeof window.createPaginationControls === "function") {
      paginationContainer.innerHTML = window.createPaginationControls(
        currentPage,
        totalPages,
        tableId
      );

      // Re-attach pagination listeners (similar to delta updates).
      paginationContainer.querySelectorAll(".pagination-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const action = btn.getAttribute("data-action");
          const page = btn.getAttribute("data-page");
          if (page && typeof window.handlePagination === "function") {
            window.handlePagination(wrapper, "goto", page);
          } else if (action && typeof window.handlePagination === "function") {
            window.handlePagination(wrapper, action);
          }
        });
      });

      const pageInput = paginationContainer.querySelector(".page-input");
      if (pageInput) {
        pageInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            const val = parseInt(pageInput.value, 10);
            if (!isNaN(val) && typeof window.updateTablePage === "function") {
              window.updateTablePage(wrapper, val);
            }
          }
        });
      }
    } else {
      paginationContainer.innerHTML = "";
    }
  }
}

function handleTableColumnInfo(message) {
  const { tableName, columnInfo } = message;
  if (!tableName || !Array.isArray(columnInfo)) {
    return;
  }
  if (!window.currentTableSchema) {
    window.currentTableSchema = {};
  }
  window.currentTableSchema[tableName] = columnInfo;
  if (!window._tableMetaCache) {
    window._tableMetaCache = new Map();
  }
  const existing = window._tableMetaCache.get(tableName) || {};
  window._tableMetaCache.set(tableName, { ...existing, columnInfo });
}

/**
 * Handle ER diagram message
 * @param {Object} message - ER diagram message
 */
function handleERDiagram(message) {
  if (window.debug) {
    window.debug.debug("Received ER diagram message:", message);
  }

  if (message.success) {
    // Add debug information about the received data
    if (typeof addDebugMessage !== "undefined") {
      addDebugMessage("Received ER diagram data from extension");
      addDebugMessage(
        `Found ${message.tables ? message.tables.length : 0} tables`
      );
      addDebugMessage(
        `Found ${
          message.relationships ? message.relationships.length : 0
        } relationships`
      );
    }

    if (typeof updateDiagramProgress !== "undefined") {
      updateDiagramProgress("Processing database schema information");
    }

    if (typeof handleERDiagramData !== "undefined") {
      handleERDiagramData(message);
    }
  } else {
    if (window.debug) {
      window.debug.error("ER diagram generation failed:", message);
    }

    if (typeof addDebugMessage !== "undefined") {
      addDebugMessage("ERROR: ER diagram generation failed");
      addDebugMessage(`Error details: ${message.error || "Unknown error"}`);
    }

    // Update connection state if it's a connection error
    if (
      message.error &&
      (message.error.includes("database is locked") ||
        message.error.includes("file is not a database") ||
        message.error.includes("file is encrypted") ||
        message.error.includes("decrypt"))
    ) {
      if (typeof updateState !== "undefined") {
        updateState({
          isConnected: false,
          connectionError: message.error,
        });
      }
    }

    // Show error instead of loading
    if (typeof showDiagramError !== "undefined") {
      showDiagramError(message.error || "Unknown error");
    } else if (typeof showError !== "undefined") {
      showError(
        "Failed to generate ER diagram: " + (message.error || "Unknown error")
      );
    }
  }
}

/**
 * Handle ER diagram progress updates
 * @param {Object} message - Progress message
 */
function handleERDiagramProgress(message) {
  if (window.debug) {
    window.debug.debug("Received ER diagram progress:", message);
  }

  if (typeof updateDiagramProgress !== "undefined") {
    updateDiagramProgress(message.message);
  }

  if (typeof addDebugMessage !== "undefined") {
    addDebugMessage(`Progress: ${message.message}`);
  }
}

function getRenderedDataTableWrapper() {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  if (!elements.dataContent) {
    return null;
  }
  return elements.dataContent.querySelector(".enhanced-table-wrapper");
}

function captureCurrentDataViewState() {
  const wrapper = getRenderedDataTableWrapper();
  if (!wrapper) {
    return;
  }

  const tableKey =
    wrapper.getAttribute("data-table") || wrapper.dataset.table || null;
  if (!tableKey || typeof window.setTabViewState !== "function") {
    return;
  }

  const currentPage = parseInt(wrapper.dataset.currentPage || "1", 10);
  const pageSize = parseInt(wrapper.dataset.pageSize || "100", 10);
  const searchInput = wrapper.querySelector(".search-input");
  const searchTerm =
    searchInput && "value" in searchInput ? searchInput.value : "";
  const scrollContainer = wrapper.querySelector(".table-scroll-container");
  const scrollTop =
    scrollContainer && "scrollTop" in scrollContainer
      ? scrollContainer.scrollTop
      : 0;
  const scrollLeft =
    scrollContainer && "scrollLeft" in scrollContainer
      ? scrollContainer.scrollLeft
      : 0;

  window.setTabViewState(
    tableKey,
    { page: currentPage, pageSize, searchTerm, scrollTop, scrollLeft },
    // Tab switches also update `activeTable/selectedTable`, so avoid extra persistence work here.
    { renderTabs: false, renderSidebar: false, persistState: "none" }
  );
}

function applyTabViewStateToWrapper(tableWrapper, tabKey) {
  if (!tableWrapper || typeof window.getTabViewState !== "function") {
    return;
  }

  const effectiveKey =
    tabKey ||
    tableWrapper.getAttribute("data-table") ||
    tableWrapper.dataset.table;
  if (!effectiveKey) {
    return;
  }

  const rawViewState = window.getTabViewState(effectiveKey);
  const viewState =
    rawViewState && typeof rawViewState === "object" ? rawViewState : {};

  // Restore pinned columns (before sizing/positioning).
  if (viewState && Array.isArray(viewState.pinnedColumns)) {
    const pinnedSet = new Set(viewState.pinnedColumns.filter(Boolean));
    const table = tableWrapper.querySelector(".data-table");
    if (table) {
      // Clear any existing pinned/unpinned state first.
      table.querySelectorAll("th").forEach((th) => {
        th.classList.remove("pinned", "unpinned");
        const pinBtn = th.querySelector('[data-action="pin"]');
        if (pinBtn) {
          pinBtn.setAttribute("aria-pressed", "false");
          pinBtn.textContent = "📌";
          pinBtn.style.opacity = "0.6";
          pinBtn.title = "Pin column";
        }
      });

      // Apply pinned state by column name.
      table.querySelectorAll("th[data-column-name]").forEach((th) => {
        const name = th.getAttribute("data-column-name") || "";
        const colIdx = th.getAttribute("data-column");
        const isPinned = name && pinnedSet.has(name);
        if (isPinned) {
          th.classList.add("pinned");
          const pinBtn = th.querySelector('[data-action="pin"]');
          if (pinBtn) {
            pinBtn.setAttribute("aria-pressed", "true");
            pinBtn.textContent = "📍";
            pinBtn.style.opacity = "1";
            pinBtn.title = "Unpin column";
          }
          if (colIdx) {
            table
              .querySelectorAll(`td[data-column="${colIdx}"]`)
              .forEach((cell) => {
                cell.classList.add("pinned");
                cell.classList.remove("unpinned");
              });
          }
        } else {
          th.classList.add("unpinned");
        }
      });

      if (typeof window.updatePinnedColumnPositions === "function") {
        window.updatePinnedColumnPositions(table);
      }
    }
  }

  // Restore column widths
  if (viewState && viewState.columnWidths && typeof viewState.columnWidths === "object") {
    const widths = viewState.columnWidths;
    const table = tableWrapper.querySelector(".data-table");
    const headers = tableWrapper.querySelectorAll("th[data-column-name]");
    headers.forEach((th) => {
      const colName = th.getAttribute("data-column-name");
      if (!colName) {
        return;
      }
      const width = widths[colName];
      if (!width || typeof width !== "number") {
        return;
      }
      const w = Math.max(50, Math.floor(width));
      th.style.width = `${w}px`;
      th.style.minWidth = `${w}px`;
      if (table) {
        const colIndex = th.getAttribute("data-column");
        if (colIndex) {
          const col = table.querySelector(`colgroup col[data-column="${colIndex}"]`);
          if (col && col instanceof HTMLElement) {
            col.style.width = `${w}px`;
          }
        }
      }
    });
    if (table && typeof window.updatePinnedColumnPositions === "function") {
      window.updatePinnedColumnPositions(table);
    }
  }

  // Restore row heights (only for rows that were explicitly resized)
  if (viewState && viewState.rowHeights && typeof viewState.rowHeights === "object") {
    const heights = viewState.rowHeights;
    // Iterate rendered rows (fast) instead of iterating possibly-huge persisted maps.
    tableWrapper.querySelectorAll("tr[data-row-index]").forEach((row) => {
      if (!(row instanceof HTMLElement)) {
        return;
      }
      const idx = row.getAttribute("data-row-index");
      if (!idx) {
        return;
      }
      const height = heights[idx];
      if (!height || typeof height !== "number") {
        return;
      }
      const h = Math.max(25, Math.floor(height));
      row.style.height = `${h}px`;
      row.style.minHeight = `${h}px`;
    });

    // If virtualized, spacer math depends on row heights; refresh once.
    if (typeof window.refreshVirtualTable === "function") {
      window.refreshVirtualTable(tableWrapper);
    }
  }

  // Restore search term (client-side filter)
  const searchInput = tableWrapper.querySelector(".search-input");
  if (searchInput && typeof viewState.searchTerm === "string") {
    searchInput.value = viewState.searchTerm;
    if (
      viewState.searchTerm &&
      typeof window.filterTable === "function"
    ) {
      window.filterTable(tableWrapper, viewState.searchTerm);
    }
  }

  // Restore scroll position after layout.
  const scrollContainer = tableWrapper.querySelector(".table-scroll-container");
  if (!scrollContainer) {
    return;
  }

  // If the table is virtualized, ensure pinned classes are applied to currently-rendered rows.
  if (typeof window.refreshVirtualTable === "function") {
    window.refreshVirtualTable(tableWrapper);
  }

  const targetTop =
    typeof viewState.scrollTop === "number" ? viewState.scrollTop : 0;
  const targetLeft =
    typeof viewState.scrollLeft === "number" ? viewState.scrollLeft : 0;

  // Avoid smooth scrolling during restore (it feels “stuck” and triggers extra work).
  if (scrollContainer instanceof HTMLElement) {
    const prev = scrollContainer.style.scrollBehavior || "";
    scrollContainer.setAttribute("data-viewstate-prev-scroll-behavior", prev);
    scrollContainer.style.scrollBehavior = "auto";
  }

  scrollContainer.setAttribute("data-viewstate-restoring-scroll", "true");

  const applyScroll = (attempt = 0) => {
    const maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const maxLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
    const desiredTop = Math.max(0, Math.min(maxTop, targetTop));
    const desiredLeft = Math.max(0, Math.min(maxLeft, targetLeft));
    scrollContainer.scrollTop = desiredTop;
    scrollContainer.scrollLeft = desiredLeft;
    const topDelta = Math.abs(scrollContainer.scrollTop - desiredTop);
    const leftDelta = Math.abs(scrollContainer.scrollLeft - desiredLeft);
    if ((topDelta > 2 || leftDelta > 2) && attempt < 6) {
      setTimeout(() => applyScroll(attempt + 1), 50);
    } else {
      scrollContainer.removeAttribute("data-viewstate-restoring-scroll");
      const prev = scrollContainer.getAttribute("data-viewstate-prev-scroll-behavior");
      if (prev !== null) {
        if (prev) {
          scrollContainer.style.scrollBehavior = prev;
        } else {
          scrollContainer.style.removeProperty("scroll-behavior");
        }
        scrollContainer.removeAttribute("data-viewstate-prev-scroll-behavior");
      }
    }
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => applyScroll(0), 0);
    });
  });
}

function updateSidebarSelection(tableKey) {
  if (!tableKey) {
    return;
  }
  const list = document.getElementById("tables-list");
  if (!list) {
    return;
  }

  // Remove previous selection without re-rendering the entire sidebar.
  list.querySelectorAll(".table-item.selected").forEach((el) => {
    el.classList.remove("selected");
  });

  const desiredKey = String(tableKey);
  const items = list.querySelectorAll(".table-item[data-table]");
  for (const item of items) {
    if (!(item instanceof HTMLElement)) {
      continue;
    }
    if (item.dataset && item.dataset.table === desiredKey) {
      item.classList.add("selected");
      break;
    }
  }
}

// Make view-state helpers available to other modules (e.g. main.js)
if (typeof window !== "undefined") {
  /** @type {any} */ (window).captureCurrentDataViewState =
    captureCurrentDataViewState;
  /** @type {any} */ (window).applyTabViewStateToWrapper =
    applyTabViewStateToWrapper;
  /** @type {any} */ (window).updateSidebarSelection = updateSidebarSelection;
}

/**
 * Display list of tables
 * @param {Array} tables - Array of table names
 */
function displayTablesList(tables) {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  if (window.debug) {
    window.debug.debug(
      `[Events] displayTablesList called with: ${JSON.stringify(tables)}`
    );
    window.debug.debug(
      `[Events] tablesListElement: ${elements.tablesListElement}`
    );
  }

  if (!elements.tablesListElement) {
    if (window.debug) {
      window.debug.debug("[Events] tablesListElement not found!");
    }
    return;
  }

  if (!tables || tables.length === 0) {
    elements.tablesListElement.innerHTML =
      '<div class="info">No tables found</div>';
    return;
  }

  if (typeof window.updateState === "function") {
    window.updateState(
      { allTables: tables },
      { renderTabs: false, renderSidebar: false }
    );
  }

  // Render normal tables
  let html = tables
    .map((table) => {
      const state =
        typeof window.getCurrentState === "function"
          ? window.getCurrentState()
          : {};
      const isSelected = state.selectedTable === table.name;
      return `
        <div class="table-item${isSelected ? " selected" : ""}" data-table="${
        table.name
      }">
          <span class="table-name">${table.name}</span>
        </div>
      `;
    })
    .join("");

  // Render query result tabs under a separator
  if (typeof window.getCurrentState === "function") {
    const state = window.getCurrentState();
    const resultTabs = Array.isArray(state.openTables)
      ? state.openTables.filter((t) => t.isResultTab)
      : [];
    if (resultTabs.length > 0) {
      html += '<div class="sidebar-separator">Query Results</div>';
      const selectedTable = state.selectedTable;
      html += resultTabs
        .map((tab) => {
          const isSelected = tab.key === selectedTable;
          return `
              <div class="table-item result-tab-item${
                isSelected ? " selected" : ""
              }" data-table="${tab.key}">
                <span class="table-name">${tab.label || tab.key}</span>
                <span class="tab-icon" title="Query Result">🧮</span>
              </div>
            `;
        })
        .join("");
    }
  }
  elements.tablesListElement.innerHTML = html;

  if (window.debug) {
    window.debug.debug(
      "[Events] Tables HTML generated, adding event listeners..."
    );
  }

  // Add click handlers for table items (normal tables and result tabs)
  elements.tablesListElement.querySelectorAll(".table-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      const tableName = item.dataset.table;
      if (tableName && typeof window.selectTable === "function") {
        window.selectTable(tableName);
        // If this is a result tab, also switch to the Data tab
        if (item.classList.contains("result-tab-item")) {
          const dataTab = document.querySelector('[data-tab="data"]');
          if (dataTab && !dataTab.classList.contains("active")) {
            const dataTabEl = /** @type {HTMLElement} */ (dataTab);
            dataTabEl.click();
          }
        }
      }
    });
  });

  // On first load, if there are tables and no openTables, initialize state
  if (
    Array.isArray(tables) &&
    tables.length > 0 &&
    typeof window.getCurrentState === "function" &&
    typeof window.updateState === "function"
  ) {
    const state = window.getCurrentState();
    let openTables = Array.isArray(state.openTables) ? state.openTables : [];
    if (openTables.length === 0) {
      // Map to string names if needed
      const tableNames = tables.map((t) =>
        typeof t === "string" ? t : t.name
      );
      if (typeof window.openTableTab === "function" && tableNames[0]) {
        window.openTableTab(tableNames[0]);
      } else {
        window.updateState({
          openTables: [{ key: tableNames[0], label: tableNames[0] }],
          activeTable: tableNames[0],
          selectedTable: tableNames[0],
        });
      }
    }
  }

  if (window.debug) {
    window.debug.debug(
      `[Events] Event listeners added to ${tables.length} tables`
    );
  }
}

/**
 * Detect foreign keys in query result columns by matching with known table schemas
 * @param {string[]} columns - Column names from query result
 * @param {Object} state - Current application state with table cache and schemas
 * @returns {Array} Array of foreign key information for detected columns
 */
function detectQueryResultForeignKeys(columns, state) {
  const foreignKeys = [];

  if (!columns || !Array.isArray(columns)) {
    return foreignKeys;
  }

  // Prefer metadata collected from table schema/data loads (fast + avoids state churn).
  const metaCache =
    window._tableMetaCache instanceof Map ? window._tableMetaCache : new Map();

  // Track already found foreign keys to avoid duplicates
  const foundForeignKeys = new Set();

  // For each query result column, check if it matches a foreign key column in any table
  columns.forEach((columnName, columnIndex) => {
    if (!columnName || typeof columnName !== "string") {
      return;
    }

    // Try different column name variations (original, without table prefix, etc.)
    const columnVariations = [
      columnName.trim(),
      columnName.split(".").pop()?.trim(), // Remove table prefix if present (e.g., "users.id" -> "id")
      columnName.toLowerCase().trim(),
      columnName.split(".").pop()?.toLowerCase().trim(),
    ]
      .filter(Boolean)
      .filter((v) => v && v.length > 0);

    // Check each known table's foreign keys for matching columns
    for (const [tableName, tableMeta] of metaCache) {
      if (!tableMeta || typeof tableMeta !== "object") {
        continue;
      }

      const tableForeignKeys = Array.isArray(tableMeta.foreignKeys)
        ? tableMeta.foreignKeys
        : [];

      for (const fk of tableForeignKeys) {
        if (!fk || !fk.column || !fk.referencedTable || !fk.referencedColumn) {
          continue;
        }

        // Check if any column variation matches this foreign key column
        for (const variation of columnVariations) {
          const fkColumnVariations = [
            fk.column,
            fk.column.toLowerCase(),
          ].filter(Boolean);

          if (fkColumnVariations.includes(variation)) {
            // Create a unique key to avoid duplicates
            const fkKey = `${columnName}:${fk.referencedTable}:${fk.referencedColumn}`;

            if (!foundForeignKeys.has(fkKey)) {
              foundForeignKeys.add(fkKey);
              foreignKeys.push({
                column: columnName, // Use original column name from query result
                referencedTable: fk.referencedTable,
                referencedColumn: fk.referencedColumn,
                sourceTable: tableName, // Track which table this FK came from
              });
            }
            break; // Found a match, no need to check other variations
          }
        }
      }
    }
  });

  return foreignKeys;
}

/**
 * Display query results
 * @param {Array} data - Query result data
 * @param {Array} columns - Column names
 * @param {string|null} query - The SQL query that generated these results
 */
// Replace displayQueryResults to use modal
function displayQueryResults(data, columns, query = null) {
  if (typeof window.captureCurrentDataViewState === "function") {
    window.captureCurrentDataViewState();
  }

  // Generate a unique tab key: Results (DATE TIME)
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  let tabKey = `Results (${dateStr})`;
  let tabLabel = tabKey;
  // Store the result data in state.tableCache under the tab key
  if (
    typeof window["getCurrentState"] === "function" &&
    typeof window["updateState"] === "function"
  ) {
    const state = window["getCurrentState"]();
    // Use window.createDataTable if available
    const createDataTableFn =
      typeof window["createDataTable"] === "function"
        ? window["createDataTable"]
        : null;

    // Try to detect foreign keys in query result columns
    const detectedForeignKeys = detectQueryResultForeignKeys(columns, state);

    // Store the result data WITH the original query and detected foreign keys
    const cacheData = {
      data,
      columns,
      isQueryResult: true,
      query: query, // Store the original query
      foreignKeys: detectedForeignKeys, // Store detected foreign keys for tab restoration
    };

    if (!window._resultCache) {
      window._resultCache = new Map();
    }
    window._resultCache.set(tabKey, cacheData);
    let openTables = Array.isArray(state.openTables)
      ? state.openTables.map((t) => ({ ...t }))
      : [];
    // Only add if not already present
    if (!openTables.find((t) => t.key === tabKey)) {
      const initialPageSize = Math.min(Array.isArray(data) ? data.length : 0, 100) || 100;
      // Also store the query in the tab object for easy access
      openTables.push({
        key: tabKey,
        label: tabLabel,
        isResultTab: true,
        query: query, // Store query here too for convenience
        viewState: {
          page: 1,
          pageSize: initialPageSize,
          searchTerm: "",
          scrollTop: 0,
          scrollLeft: 0,
        },
      });
    }
    window["updateState"]({
      openTables,
      activeTable: tabKey,
      selectedTable: tabKey,
    });
    // Core trigger: always refresh tabs and sidebar
    if (typeof window["renderTableTabs"] === "function") {
      window["renderTableTabs"](openTables, tabKey);
    }
    if (
      typeof window["displayTablesList"] === "function" &&
      Array.isArray(state.allTables)
    ) {
      window["displayTablesList"](state.allTables);
    }
    // Don't automatically switch tabs - let the user stay in the query editor
    // The results will be available in the data tab if they want to view them
    // This keeps the Monaco editor interactive and responsive
    // Render the data in the data-content area
    if (createDataTableFn) {
      const tableHtml =
        data && data.length > 0
          ? createDataTableFn(data, columns, tabKey, {
              isQueryResult: true,
              query: query,
              currentPage: 1,
              totalRows: data.length,
              pageSize: Math.min(data.length, 100),
              foreignKeys: detectedForeignKeys,
              allowEditing: false, // Query results are typically read-only for data integrity
            })
          : `<div class="no-results"><h3>No Results</h3><p>Query executed successfully but returned no data.</p></div>`;
      const dataContent = document.getElementById("data-content");
      if (dataContent) {
        dataContent.innerHTML = `<div class="table-container">${tableHtml}</div>`;

        // Initialize table interactive features
        const tableWrapper = dataContent.querySelector(".table-container");
        if (tableWrapper && typeof initializeTableEvents === "function") {
          initializeTableEvents(tableWrapper);
        }
      }
    }
  }
}

/**
 * Restore Monaco editor state after DOM manipulation
 * @param {Object} editorState - Stored editor state
 */
function restoreEditorState(editorState) {
  if (!window.queryEditor || !window.queryEditor.editor) {
    return;
  }

  try {
    const editor = window.queryEditor.editor;
    if (window.debug) {
      window.debug.debug(
        "restoreEditorState: Restoring editor state",
        editorState
      );
    }

    // Force layout recalculation
    editor.layout();

    // Restore position and selection
    if (editorState.position) {
      editor.setPosition(editorState.position);
    }
    if (editorState.selection) {
      editor.setSelection(editorState.selection);
    }

    // Restore scroll position
    if (editorState.scrollTop !== undefined) {
      editor.setScrollTop(editorState.scrollTop);
    }
    if (editorState.scrollLeft !== undefined) {
      editor.setScrollLeft(editorState.scrollLeft);
    }

    // Restore focus if it was focused before
    if (editorState.hasFocus) {
      editor.focus();

      // Ensure the editor's internal textarea is properly focused
      const editorDom = editor.getDomNode();
      if (editorDom) {
        const textarea = editorDom.querySelector("textarea");
        if (textarea) {
          textarea.focus();
          textarea.blur();
          editor.focus();
        }
      }
    }

    if (window.debug) {
      window.debug.debug(
        "restoreEditorState: Editor state restored successfully"
      );
    }
  } catch (error) {
    if (window.debug) {
      window.debug.debug(
        "restoreEditorState: Error restoring editor state:",
        error
      );
    }
  }
}

/**
 * Display table schema
 * @param {Array} data - Schema data
 * @param {Array} columns - Column names
 * @param {Array} foreignKeys - Foreign key information
 */
function displayTableSchema(data, columns, foreignKeys = []) {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  const currentState = getCurrentState ? getCurrentState() : {};

  if (!elements.schemaContent) {
    return;
  }

  if (!data || data.length === 0) {
    elements.schemaContent.innerHTML =
      '<div class="info">No schema information available</div>';
    return;
  }

  const table = createDataTable
    ? createDataTable(data, columns, "schema", { foreignKeys })
    : "";
  elements.schemaContent.innerHTML = table;

  // Initialize table features for the new table
  const tableWrapper = elements.schemaContent.querySelector(
    ".enhanced-table-wrapper"
  );
  if (tableWrapper && typeof initializeTableEvents !== "undefined") {
    initializeTableEvents(tableWrapper);
  }
}

/**
 * Display table data
 * @param {Array} data - Table data
 * @param {Array} columns - Column names
 * @param {string} tableName - Table name
 * @param {Object} options - Display options including pagination
 */
function displayTableData(data, columns, tableName, options = {}) {
  const elements = getAllDOMElements ? getAllDOMElements() : {};

  if (!elements.dataContent) {
    return;
  }

  if (!data || data.length === 0) {
    elements.dataContent.innerHTML = `<div class="info">No data found in table: ${tableName}</div>`;
    return;
  }

  const table = createDataTable
    ? createDataTable(data, columns, tableName, options)
    : "";
  const rowText = data.length === 1 ? "row" : "rows";

  elements.dataContent.innerHTML = table;

  // Initialize table features for the new table
  const tableWrapper = elements.dataContent.querySelector(
    ".enhanced-table-wrapper"
  );
  if (tableWrapper && typeof initializeTableEvents !== "undefined") {
    initializeTableEvents(tableWrapper);
  }

  if (tableWrapper && typeof window.applyTabViewStateToWrapper === "function") {
    window.applyTabViewStateToWrapper(tableWrapper, tableName);
  }

  // Check for pending foreign key highlight
  if (tableWrapper && typeof highlightForeignKeyTarget !== "undefined") {
    // Use setTimeout to ensure DOM is fully rendered and table is ready
    setTimeout(() => {
      highlightForeignKeyTarget(tableWrapper);
    }, 250);
  }
}

/**
 * Initialize table-specific events
 * @param {Element} tableWrapper - Table wrapper element
 */
function initializeTableEvents(tableWrapper) {
  if (!tableWrapper) {
    return;
  }

  // Some call sites pass a container element. Normalize to the actual wrapper.
  const normalizedWrapper =
    tableWrapper instanceof Element
      ? tableWrapper.classList.contains("enhanced-table-wrapper")
        ? tableWrapper
        : tableWrapper.querySelector(".enhanced-table-wrapper") ||
          tableWrapper.closest(".enhanced-table-wrapper")
      : null;
  if (normalizedWrapper) {
    tableWrapper = normalizedWrapper;
  }

  // Hydrate row virtualization early so view-state restore (search/scroll) works correctly.
  if (typeof window.initializeVirtualTable === "function") {
    window.initializeVirtualTable(tableWrapper);
  }

  // Guard only static elements (search, pagination, etc)
  if (tableWrapper.getAttribute("data-table-events-initialized") === "true") {
  } else {
    // Mark as initialized
    tableWrapper.setAttribute("data-table-events-initialized", "true");

    // Initialize resizing functionality
    if (typeof initializeResizing === "function") {
      initializeResizing(tableWrapper);
    }
    if (typeof addResizeObserver === "function") {
      addResizeObserver(tableWrapper);
    }
    const searchInput = tableWrapper.querySelector(".search-input");
    const clearBtn = tableWrapper.querySelector(".search-clear");
    const controlsBar = tableWrapper.querySelector(".table-controls");
    if (searchInput) {
      // Expand search and hide other controls while focused.
      if (controlsBar && controlsBar.getAttribute("data-search-focus") !== "true") {
        controlsBar.setAttribute("data-search-focus", "true");
        searchInput.addEventListener("focus", () => {
          controlsBar.classList.add("search-is-focused");
        });
        searchInput.addEventListener("blur", () => {
          // Delay to allow focus to move; only collapse if focus truly left the input.
          setTimeout(() => {
            const activeEl =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            if (activeEl === searchInput) {
              return;
            }
            controlsBar.classList.remove("search-is-focused");
          }, 0);
        });
      }

      searchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value;
        if (typeof filterTable !== "undefined") {
          filterTable(tableWrapper, searchTerm);
        }
        const tableKey = tableWrapper.getAttribute("data-table");
        if (tableKey && typeof window.setTabViewState === "function") {
          window.setTabViewState(
            tableKey,
            { searchTerm },
            { renderTabs: false, renderSidebar: false }
          );
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (searchInput) {
          searchInput.value = "";
          if (typeof filterTable !== "undefined") {
            filterTable(tableWrapper, "");
          }
          // Keep the expanded focused state while clearing.
          if (controlsBar && typeof searchInput.focus === "function") {
            searchInput.focus();
          }
        }
        const tableKey = tableWrapper.getAttribute("data-table");
        if (tableKey && typeof window.setTabViewState === "function") {
          window.setTabViewState(
            tableKey,
            { searchTerm: "" },
            { renderTabs: false, renderSidebar: false }
          );
        }
      });
    }

    // Scroll position persistence (throttled)
    const scrollContainer = tableWrapper.querySelector(".table-scroll-container");
    if (
      scrollContainer &&
      scrollContainer.getAttribute("data-viewstate-scroll") !== "true"
    ) {
      scrollContainer.setAttribute("data-viewstate-scroll", "true");
      let scrollTimer = null;
      scrollContainer.addEventListener("scroll", () => {
        if (
          scrollContainer.getAttribute("data-viewstate-restoring-scroll") ===
          "true"
        ) {
          return;
        }
        if (scrollTimer) {
          clearTimeout(scrollTimer);
        }
        scrollTimer = setTimeout(() => {
          const tableKey = tableWrapper.getAttribute("data-table");
          if (!tableKey || typeof window.setTabViewState !== "function") {
            return;
          }
          window.setTabViewState(
            tableKey,
            {
              scrollTop: scrollContainer.scrollTop,
              scrollLeft: scrollContainer.scrollLeft,
            },
            { renderTabs: false, renderSidebar: false, persistState: "debounced" }
          );
        }, 400);
      });
    }
    // Column header clicks for sorting
    const headers = tableWrapper.querySelectorAll(".sortable-header");
    headers.forEach((header) => {
      header.addEventListener("click", (e) => {
        if (
          e.target.classList.contains("column-action-btn") ||
          e.target.classList.contains("pin-btn") ||
          e.target.classList.contains("column-resize-handle")
        ) {
          return;
        }
        const column = parseInt(header.dataset.column);
        const table = header.closest(".data-table");
        if (typeof sortTableByColumn !== "undefined") {
          sortTableByColumn(table, column);
        }
      });
    });
    // Column action buttons (including pin buttons)
    const actionBtns = tableWrapper.querySelectorAll(
      ".column-action-btn, .pin-btn"
    );
    actionBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const column = btn.dataset.column;
        const table = btn.closest(".data-table");
        if (action === "pin" && typeof toggleColumnPin !== "undefined") {
          toggleColumnPin(table, parseInt(column));
        }
      });
    });
    // Pagination controls
    const paginationBtns = tableWrapper.querySelectorAll(".pagination-btn");
    paginationBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tableWrapper = btn.closest(".enhanced-table-wrapper");
        const action = btn.dataset.action;
        const page = btn.dataset.page;

        if (typeof handlePagination !== "undefined") {
          if (page) {
            // Page number button clicked
            handlePagination(tableWrapper, "goto", page);
          } else if (action) {
            // Navigation button clicked (first/prev/next/last)
            handlePagination(tableWrapper, action);
          }
        }
      });
    });
    // Page size selector
    const pageSizeSelect = tableWrapper.querySelector(".page-size-select");
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener("change", (e) => {
        const tableWrapper = e.target.closest(".enhanced-table-wrapper");
        if (typeof handlePageSizeChange !== "undefined") {
          handlePageSizeChange(tableWrapper, parseInt(e.target.value));
        }
      });
    }
    // Export button
    const exportBtn = tableWrapper.querySelector('[data-action="export"]');
    if (exportBtn) {
      exportBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const tableWrapper = e.target.closest(".enhanced-table-wrapper");
        if (typeof exportTableData !== "undefined") {
          exportTableData(tableWrapper);
        }
      });
    }
  }

  // Delegated cell editing listeners (avoid attaching listeners to every cell).
  if (tableWrapper.getAttribute("data-cell-events-delegated") !== "true") {
    tableWrapper.setAttribute("data-cell-events-delegated", "true");

    tableWrapper.addEventListener("dblclick", (e) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target) {
        return;
      }
      const cell = target.closest(".data-cell[data-editable='true']");
      if (!cell) {
        return;
      }
      e.stopPropagation();
      startCellEditing(cell);
    });

    tableWrapper.addEventListener("keydown", (e) => {
      const keyEvent = /** @type {KeyboardEvent} */ (e);
      const target = keyEvent.target instanceof HTMLElement ? keyEvent.target : null;
      if (!target) {
        return;
      }
      if (target.matches("input, textarea")) {
        return;
      }
      const cell = target.closest(".data-cell[data-editable='true']");
      if (!cell) {
        return;
      }
      if (keyEvent.key === "Enter" || keyEvent.key === "F2") {
        keyEvent.preventDefault();
        startCellEditing(cell);
      }
    });

    tableWrapper.addEventListener("click", (e) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target) {
        return;
      }
      const saveBtn = target.closest(".cell-save-btn");
      if (saveBtn) {
        e.stopPropagation();
        const cell = saveBtn.closest(".data-cell");
        saveCellEdit(cell);
        return;
      }
      const cancelBtn = target.closest(".cell-cancel-btn");
      if (cancelBtn) {
        e.stopPropagation();
        const cell = cancelBtn.closest(".data-cell");
        cancelCellEdit(cell);
      }
    });

    tableWrapper.addEventListener("keydown", (e) => {
      const keyEvent = /** @type {KeyboardEvent} */ (e);
      const target = keyEvent.target instanceof HTMLElement ? keyEvent.target : null;
      if (!target) {
        return;
      }
      if (!target.classList.contains("cell-input")) {
        return;
      }

      if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
        keyEvent.preventDefault();
        const cell = target.closest(".data-cell");
        saveCellEdit(cell);
      } else if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        const cell = target.closest(".data-cell");
        cancelCellEdit(cell);
      }
    });

    tableWrapper.addEventListener("focusout", (e) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target) {
        return;
      }
      if (!target.classList.contains("cell-input")) {
        return;
      }
      setTimeout(() => {
        const cell = target.closest(".data-cell");
        if (cell && cell.classList.contains("editing")) {
          saveCellEdit(cell);
        }
      }, 150);
    });
  }

  // After initializing row/cell events for new rows, ensure resizing is re-initialized
  if (typeof initializeResizing === "function" && tableWrapper) {
  }
}

/**
 * Start editing a cell
 * @param {Element} cell - The cell element to edit
 */
function startCellEditing(cell) {
  if (!cell || cell.classList.contains("editing")) {
    return;
  }

  // Only allow editing for cells marked as editable
  if (!cell.hasAttribute("data-editable")) {
    return;
  }

  // Cancel any other editing cells
  const table = cell.closest(".data-table");
  const otherEditingCells = table.querySelectorAll(".data-cell.editing");
  otherEditingCells.forEach((otherCell) => {
    if (otherCell !== cell) {
      cancelCellEdit(otherCell);
    }
  });

  // Get current value
  const cellContent = cell.querySelector(".cell-content");
  const originalValue = cellContent.getAttribute("data-original-value") || "";
  const isNull =
    cellContent.querySelector("em") &&
    cellContent.textContent.trim() === "NULL";
  const currentValue = isNull ? "" : originalValue;

  // Set up editing state
  cell.classList.add("editing");
  const input = cell.querySelector(".cell-input");
  if (input) {
    /** @type {HTMLInputElement} */ (input).value = currentValue;
    // Use setTimeout to ensure the input is visible and focusable
    setTimeout(() => {
      /** @type {HTMLInputElement} */ (input).focus();
      /** @type {HTMLInputElement} */ (input).select();
      if (
        Array.isArray(tables) &&
        tables.length > 0 &&
        typeof window.getCurrentState === "function" &&
        typeof window.updateState === "function"
      ) {
        const state = window.getCurrentState();
        let openTables = Array.isArray(state.openTables)
          ? state.openTables
          : [];
        if (openTables.length === 0) {
          // Map to {key, label} objects
          const tableObjs = tables.map((t) => {
            const name = typeof t === "string" ? t : t.name;
            return { key: name, label: name };
          });
          window.updateState({
            openTables: [tableObjs[0]],
            activeTable: tableObjs[0].key,
            selectedTable: tableObjs[0].key,
          });
        }
      }
    }, 10);
  } else {
    if (window.debug) {
      window.debug.error("Cell input not found!", cell);
    }
  }
}

/**
 * Save cell edit
 * @param {Element} cell - The cell element being edited
 */
function saveCellEdit(cell) {
  if (!cell || !cell.classList.contains("editing")) {
    return;
  }

  const input = cell.querySelector(".cell-input");
  if (!input) {
    return;
  }

  const newValue = /** @type {HTMLInputElement} */ (input).value;
  const originalValue =
    cell.querySelector(".cell-content")?.getAttribute("data-original-value") ||
    "";

  // Check if value actually changed
  if (newValue === originalValue) {
    cancelCellEdit(cell);
    return;
  }

  // Get cell metadata
  const tableName = getCurrentTableName();
  const rowIndex = parseInt(cell.getAttribute("data-row-index"));
  const columnName = cell.getAttribute("data-column-name");

  if (!tableName || isNaN(rowIndex) || !columnName) {
    if (window.debug) {
      window.debug.error("Missing cell metadata for update");
    }
    cancelCellEdit(cell);
    return;
  }

  // Show saving state
  cell.classList.add("saving");
  cell.classList.remove("error");

  // Send update request to backend
  if (window.vscode && typeof window.vscode.postMessage === "function") {
    const currentState = getCurrentState ? getCurrentState() : {};
    window.vscode.postMessage({
      type: "updateCellData",
      tableName: tableName,
      rowIndex: rowIndex,
      columnName: columnName,
      newValue: newValue,
      key: currentState.encryptionKey,
    });
  } else {
    if (window.debug) {
      window.debug.error("vscode API not available");
    }
    cancelCellEdit(cell);
  }
}

/**
 * Cancel cell edit
 * @param {Element} cell - The cell element being edited
 */
function cancelCellEdit(cell) {
  if (!cell) {
    return;
  }

  cell.classList.remove("editing", "saving", "error");
  const input = cell.querySelector(".cell-input");
  if (input) {
    /** @type {HTMLInputElement} */ (input).value = "";
  }
}

/**
 * Handle successful cell update
 * @param {Object} message - Success message from backend
 */
function handleCellUpdateSuccess(message) {
  const { tableName, rowIndex, columnName, newValue } = message;

  // Find the cell that was updated
  const cell = document.querySelector(
    `.data-cell[data-row-index="${rowIndex}"][data-column-name="${columnName}"]`
  );

  if (cell) {
    // Update the cell content
    const cellContent = cell.querySelector(".cell-content");
    if (cellContent) {
      cellContent.setAttribute("data-original-value", newValue || "");

      if (newValue === null || newValue === "") {
        cellContent.innerHTML = "<em>NULL</em>";
      } else {
        cellContent.textContent = newValue;
      }
    }

    // Remove editing state
    cell.classList.remove("editing", "saving", "error");

    // Show success feedback
    cell.style.backgroundColor = "var(--vscode-list-activeSelectionBackground)";
    setTimeout(() => {
      cell.style.backgroundColor = "";
    }, 1000);
  }

  if (typeof showSuccess !== "undefined") {
    showSuccess(`Cell updated successfully`);
  }
}

/**
 * Handle failed cell update
 * @param {Object} message - Error message from backend
 */
function handleCellUpdateError(message) {
  const { tableName, rowIndex, columnName } = message;

  // Find the cell that failed to update
  const cell = document.querySelector(
    `.data-cell[data-row-index="${rowIndex}"][data-column-name="${columnName}"]`
  );

  if (cell) {
    cell.classList.remove("saving");
    cell.classList.add("error");

    // Keep editing mode active so user can retry
    setTimeout(() => {
      cell.classList.remove("error");
    }, 3000);
  }

  if (typeof showError !== "undefined") {
    showError(`Failed to update cell: ${message.message}`);
  }
}

/**
 * Handle successful row deletion
 * @param {Object} message - Success message from backend
 */
function handleDeleteRowSuccess(message) {
  const { tableName, rowId } = message;

  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).handleDeleteSuccess) === "function"
  ) {
    /** @type {any} */ (window).handleDeleteSuccess(message);
  }

  if (window.debug) {
    window.debug.debug(
      `[Events] Row deleted successfully from ${tableName}: ${JSON.stringify(
        rowId
      )}`
    );
  }
}

/**
 * Handle failed row deletion
 * @param {Object} message - Error message from backend
 */
function handleDeleteRowError(message) {
  const { tableName, rowId } = message;

  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).handleDeleteError) === "function"
  ) {
    /** @type {any} */ (window).handleDeleteError(message);
  }

  if (window.debug) {
    window.debug.debug(
      `[Events] Failed to delete row from ${tableName}: ${message.message}`
    );
  }
}

/**
 * Get the current table name from the selected state
 * @returns {string|null} Current table name
 */
function getCurrentTableName() {
  const currentState = getCurrentState ? getCurrentState() : {};
  return currentState.selectedTable || null;
}

/**
 * Show connection section for key input
 */
function showConnectionSection() {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  if (elements.connectionSection) {
    elements.connectionSection.classList.remove("hidden");
    elements.connectionSection.classList.add("visible");
  } else {
    if (window.debug) {
      window.debug.debug("Connection section element not found");
    }
  }
}

/**
 * Hide connection section after successful connection
 */
function hideConnectionSection() {
  const elements = getAllDOMElements ? getAllDOMElements() : {};
  if (elements.connectionSection) {
    elements.connectionSection.classList.remove("visible");
    elements.connectionSection.classList.add("hidden");
  } else {
    if (window.debug) {
      window.debug.debug("Connection section element not found");
    }
  }
}

/**
 * Try initial connection without key
 */
function tryInitialConnection() {
  if (window.vscode && typeof window.vscode.postMessage === "function") {
    window.vscode.postMessage({
      type: "requestDatabaseInfo",
      key: "", // Try without key first
    });
  } else {
    if (window.debug) {
      window.debug.debug("vscode API not available");
    }
  }
}

/**
 * Force hide query editor in non-query tabs
 */
function enforceQueryEditorVisibility() {
  const queryEditor = document.querySelector(".query-editor");
  const schemaPanel = document.getElementById("schema-panel");
  const dataPanel = document.getElementById("data-panel");

  if (queryEditor && schemaPanel && dataPanel) {
    // If query editor is somehow in schema or data panel, hide it
    if (schemaPanel.contains(queryEditor) || dataPanel.contains(queryEditor)) {
      queryEditor.style.display = "none";
      queryEditor.style.visibility = "hidden";
    }

    // Double-check by looking for any textareas in wrong places
    const schemaTextareas = schemaPanel.querySelectorAll("textarea");
    const dataTextareas = dataPanel.querySelectorAll("textarea");

    schemaTextareas.forEach((textarea) => {
      textarea.style.display = "none";
      textarea.style.visibility = "hidden";
    });

    dataTextareas.forEach((textarea) => {
      textarea.style.display = "none";
      textarea.style.visibility = "hidden";
    });
  }
}

/**
 * Initialize query editor visibility enforcement
 */
function initializeQueryEditorVisibility() {
  enforceQueryEditorVisibility();

  // Also enforce on tab changes
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setTimeout(enforceQueryEditorVisibility, 10);
    });
  });

  // And on any DOM changes
  const observer = new MutationObserver(enforceQueryEditorVisibility);
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Apply inserts, updates and deletes directly to the visible <tbody>
 * without disturbing your existing pagination/sizing/pinning
 */
function handleTableDataDelta({
  tableName,
  inserts = [],
  updates = [],
  deletes = [],
  totalCount = null,
}) {
  if (window.debug) {
    window.debug.debug("[events.js] handleTableDataDelta called", {
      tableName,
      inserts,
      updates,
      deletes,
      totalCount,
    });
  }

  // Capture old total count BEFORE updating anything (for notification)
  let oldTotalCountForNotification = 0;
  const wrapperForOldCount = document.querySelector(
    `.enhanced-table-wrapper[data-table="${tableName}"]`
  );
  if (wrapperForOldCount) {
    oldTotalCountForNotification = parseInt(
      wrapperForOldCount.getAttribute("data-total-rows") || "0",
      10
    );
  }

  // Update the total count display if provided
  if (totalCount !== null) {
    const wrapper = document.querySelector(
      `.enhanced-table-wrapper[data-table="${tableName}"]`
    );
    if (wrapper) {
      // Update the header "125 RECORDS" count
      const statValue = wrapper.querySelector(".records-info .stat-value");
      if (statValue) {
        statValue.textContent = totalCount.toLocaleString();
        if (window.debug) {
          window.debug.debug("[events.js] Updated total count display", {
            tableName,
            totalCount,
          });
        }
      }

      // Update the footer "Showing 1-100 of 125 rows" count
      const visibleRows = wrapper.querySelector(".visible-rows");
      if (visibleRows) {
        const currentText = visibleRows.textContent || "";
        const match = currentText.match(/Showing (\d+)-(\d+) of/);
        if (match) {
          const start = match[1];
          const end = match[2];
          visibleRows.textContent = `Showing ${start}-${end} of ${totalCount.toLocaleString()} rows`;
        }
      }

      // Update the data-total-rows attribute
      wrapper.setAttribute("data-total-rows", totalCount.toString());

      // Update pagination controls to reflect new total count
      const currentPage = parseInt(
        wrapper.getAttribute("data-current-page") || "1",
        10
      );
      const pageSize = parseInt(
        wrapper.getAttribute("data-page-size") || "100",
        10
      );
      const totalPages = Math.ceil(totalCount / pageSize);

      // Update data attributes first
      wrapper.setAttribute("data-total-rows", totalCount.toString());
      wrapper.setAttribute("data-current-page", currentPage.toString());
      wrapper.setAttribute("data-page-size", pageSize.toString());

      // Regenerate pagination HTML
      const paginationContainer = wrapper.querySelector(".table-pagination");
      if (paginationContainer && totalPages > 1) {
        const tableId = wrapper.getAttribute("data-table-id") || "unknown";
        if (typeof window.createPaginationControls === "function") {
          paginationContainer.innerHTML = window.createPaginationControls(
            currentPage,
            totalPages,
            tableId
          );

          // Re-attach event listeners to the new pagination buttons
          const paginationBtns =
            paginationContainer.querySelectorAll(".pagination-btn");
          paginationBtns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              const action = btn.getAttribute("data-action");
              const page = btn.getAttribute("data-page");

              if (page && typeof window.handlePagination === "function") {
                window.handlePagination(wrapper, "goto", page);
              } else if (
                action &&
                typeof window.handlePagination === "function"
              ) {
                window.handlePagination(wrapper, action);
              }
            });
          });

          // Re-attach page input listeners
          const pageInput = paginationContainer.querySelector(".page-input");
          if (pageInput) {
            pageInput.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                const val = parseInt(pageInput.value, 10);
                if (
                  !isNaN(val) &&
                  typeof window.updateTablePage === "function"
                ) {
                  window.updateTablePage(wrapper, val);
                }
              }
            });
          }

          if (window.debug) {
            window.debug.debug("[events.js] Updated pagination controls", {
              tableName,
              totalCount,
              currentPage,
              pageSize,
              totalPages,
            });
          }
        }
      } else if (paginationContainer && totalPages <= 1) {
        // Clear pagination if only one page
        paginationContainer.innerHTML = "";
      }
    }
  }

  // Show notification about the update
  const ins = inserts.length;
  const upd = updates.length;
  const del = deletes.length;
  const visibleChanges = ins + upd + del;

  // Check if total count changed even if no visible changes (use captured old value)
  const totalCountChanged =
    totalCount !== null && totalCount !== oldTotalCountForNotification;

  let summary = `Table updated externally: `;

  if (visibleChanges === 0 && !totalCountChanged) {
    summary += `no changes detected in ${tableName} table.`;
  } else if (visibleChanges === 0 && totalCountChanged) {
    // Total count changed but no visible changes on current page
    const diff = totalCount - oldTotalCountForNotification;
    if (diff > 0) {
      summary += `${diff} row${
        Math.abs(diff) === 1 ? "" : "s"
      } added (on other pages). Total: ${totalCount.toLocaleString()} rows.`;
    } else {
      summary += `${Math.abs(diff)} row${
        Math.abs(diff) === 1 ? "" : "s"
      } removed (from other pages). Total: ${totalCount.toLocaleString()} rows.`;
    }
  } else {
    // Visible changes on current page
    summary +=
      (ins > 0 ? `${ins} row${ins === 1 ? "" : "s"} inserted. ` : "") +
      (upd > 0 ? `${upd} row${upd === 1 ? "" : "s"} updated. ` : "") +
      (del > 0 ? `${del} row${del === 1 ? "" : "s"} deleted. ` : "");

    if (totalCountChanged) {
      summary += `Total: ${totalCount.toLocaleString()} rows.`;
    }
  }

  if (typeof window.showNotification === "function") {
    window.showNotification(summary, "info", 6000);
  }

  const wrapper = document.querySelector(
    `.enhanced-table-wrapper[data-table="${tableName}"]`
  );
  if (!wrapper) {
    if (window.debug) {
      window.debug.debug("[events.js] No wrapper found for table", tableName);
    }
    return;
  }

  // Virtualized tables can't be patched reliably by mutating the DOM because most rows aren't rendered.
  // Instead update the in-memory pageData and trigger a virtual refresh.
  /** @type {any} */ const vs = /** @type {any} */ (wrapper).__virtualTableState;
  if (vs && vs.enabled === true && Array.isArray(vs.pageData)) {
    const pageStart =
      parseInt(wrapper.getAttribute("data-start-index") || "0", 10) ||
      (typeof vs.startIndex === "number" ? vs.startIndex : 0);
    const pageSize = parseInt(wrapper.getAttribute("data-page-size") || "100", 10) || 100;

    const toLocal = (globalRowIndex) => globalRowIndex - pageStart;

    // Deletes are indices in the OLD page; apply from bottom to top.
    const deleteLocals = deletes
      .map((rowIndex) => toLocal(rowIndex))
      .filter((local) => Number.isFinite(local) && local >= 0 && local < vs.pageData.length)
      .sort((a, b) => b - a);
    deleteLocals.forEach((local) => {
      vs.pageData.splice(local, 1);
    });

    // Inserts are indices in the NEW page; apply from top to bottom.
    const insertLocals = inserts
      .map((ins) => ({
        local: toLocal(ins.rowIndex),
        rowData: ins.rowData,
      }))
      .filter(
        (x) =>
          Number.isFinite(x.local) &&
          x.local >= 0 &&
          x.local <= pageSize &&
          Array.isArray(x.rowData)
      )
      .sort((a, b) => a.local - b.local);
    insertLocals.forEach(({ local, rowData }) => {
      const clamped = Math.max(0, Math.min(vs.pageData.length, local));
      vs.pageData.splice(clamped, 0, rowData);
    });

    // Updates are indices in the NEW page.
    updates.forEach(({ rowIndex, rowData }) => {
      const local = toLocal(rowIndex);
      if (!Number.isFinite(local) || local < 0 || local >= vs.pageData.length) {
        return;
      }
      if (!Array.isArray(rowData)) {
        return;
      }
      vs.pageData[local] = rowData;
    });

    // Keep wrapper metadata in sync (used by other UI updates).
    wrapper.setAttribute("data-start-index", String(pageStart));
    wrapper.setAttribute("data-page-rows", String(vs.pageData.length));
    if (typeof vs.startIndex === "number") {
      vs.startIndex = pageStart;
    }

    // Update the base "Showing …" label for the unfiltered state.
    const currentPage = parseInt(wrapper.getAttribute("data-current-page") || "1", 10) || 1;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + vs.pageData.length;
    const totalRowsText =
      totalCount !== null
        ? totalCount.toLocaleString()
        : (wrapper.getAttribute("data-total-rows") || "…");
    const visibleRows = wrapper.querySelector(".visible-rows");
    if (visibleRows) {
      const nextText = `Showing ${startIndex + 1}-${endIndex} of ${totalRowsText} rows`;
      visibleRows.textContent = nextText;
      vs.originalVisibleLabelText = nextText;
    }

    if (typeof window.refreshVirtualTable === "function") {
      window.refreshVirtualTable(wrapper);
    }
    return;
  }

  const tbody = wrapper.querySelector("tbody");
  if (!tbody) {
    if (window.debug) {
      window.debug.debug("[events.js] No tbody found for table", tableName);
    }
    return;
  }

  //–– 1) APPLY UPDATES ––
  updates.forEach(({ rowIndex, rowData }) => {
    const row = tbody.querySelector(`tr[data-row-index="${rowIndex}"]`);
    if (!row) {
      if (window.debug) {
        window.debug.debug("[events.js] No row found for update", rowIndex);
      }
      return;
    }
    rowData.forEach((val, colIdx) => {
      const cell = row.children[colIdx];
      if (cell) {
        const cc = cell.querySelector(".cell-content");
        if (cc) {
          cc.textContent = val === null ? "" : String(val);
        }
      }
    });
  });

  //–– 2) APPLY INSERTS –– (in reverse so indices stay valid)
  inserts
    .sort((a, b) => b.rowIndex - a.rowIndex)
    .forEach(({ rowIndex, rowData }) => {
      // bump all existing ≥ rowIndex
      Array.from(tbody.querySelectorAll("tr")).forEach((r) => {
        const idxAttr = r.getAttribute("data-row-index");
        if (idxAttr !== null && !isNaN(+idxAttr)) {
          const idx = +idxAttr;
          if (idx >= rowIndex) {
            r.setAttribute("data-row-index", String(idx + 1));
          }
        }
      });
      // Use renderTableRows to generate the new row HTML, but robustly patch FK cells after creation
      let columns = Array.from(wrapper.querySelectorAll("thead th")).map((th) =>
        th.getAttribute("data-column-name")
      );
      // Fallback: if any column name is missing, try to get from global schema (handle window typing)
      /** @type {any} */ const win =
        typeof window !== "undefined" ? window : {};
      if (columns.some((c) => !c)) {
        if (
          win.currentTableSchema &&
          win.currentTableSchema[tableName] &&
          Array.isArray(win.currentTableSchema[tableName])
        ) {
          columns = win.currentTableSchema[tableName].map((col) => col.name);
          if (!columns || columns.length === 0) {
            if (window.debug) {
              window.debug.debug(
                "[events.js] No columns found in global schema for table",
                tableName
              );
            }
          }
        } else {
          if (window.debug) {
            window.debug.debug(
              "[events.js] Some column names missing in <th> for table",
              tableName,
              columns
            );
          }
        }
      }
      // Final fallback: replace any null/undefined with placeholder
      columns = columns.map((c, i) => c || `col_${i}`);
      const rowHtml = win.renderTableRows
        ? win.renderTableRows([rowData], rowIndex, columns)
        : "";
      // Parse the HTML string into a DOM node
      const temp = document.createElement("tbody");
      temp.innerHTML = rowHtml.trim();
      const newRow = temp.firstElementChild;
      // --- PATCH: Add FK cell attributes if foreign key info is available ---
      // Robustly detect FK metadata from all available sources
      let fkMeta = {};
      // 1. Try currentTableSchema[tableName] (preferred)
      if (
        win.currentTableSchema &&
        win.currentTableSchema[tableName] &&
        Array.isArray(win.currentTableSchema[tableName])
      ) {
        win.currentTableSchema[tableName].forEach((col) => {
          if (col && col.name && col.fk) {
            fkMeta[col.name] = col.fk;
          }
        });
      }
      // 2. Try options.foreignKeys if available (from displayTableData)
      if (
        fkMeta &&
        Object.keys(fkMeta).length === 0 &&
        wrapper &&
        wrapper.dataset &&
        wrapper.dataset.foreignKeys
      ) {
        try {
          const parsed = JSON.parse(wrapper.dataset.foreignKeys);
          if (Array.isArray(parsed)) {
            parsed.forEach((fk) => {
              if (fk && fk.from && fk.to && fk.table) {
                fkMeta[fk.from] = {
                  referencedTable: fk.table,
                  referencedColumn: fk.to,
                };
              }
            });
          }
        } catch (e) {
          // ignore
        }
      }
      // 3. Try columns with _id suffix as a last resort (convention)
      if (Object.keys(fkMeta).length === 0) {
        columns.forEach((col) => {
          if (col && /(_id|Id|ID)$/.test(col)) {
            // Heuristic: treat as FK, but no referenced table/column
            fkMeta[col] = { referencedTable: "", referencedColumn: "id" };
          }
        });
      }
      // Patch each cell in the new row
      if (newRow) {
        Array.from(newRow.children).forEach((cell, idx) => {
          const colName = columns[idx];
          // Always set data-column-name for robust context menu detection
          if (colName) {
            cell.setAttribute("data-column-name", colName);
          }
          if (fkMeta[colName]) {
            cell.classList.add("fk-cell");
            // Always set both attributes, even if empty string (for debug)
            const fkTable = fkMeta[colName].referencedTable || "";
            const fkColumn = fkMeta[colName].referencedColumn || "";
            cell.setAttribute("data-fk-table", fkTable);
            cell.setAttribute("data-fk-column", fkColumn);
          }
          // --- PATCH: Attach context menu event to every cell ---
          if (typeof window.showContextMenu === "function") {
            cell.addEventListener("contextmenu", function (e) {
              e.preventDefault();
              // Ensure MouseEvent is passed (cast for linting)
              window.showContextMenu(/** @type {MouseEvent} */ (e), cell);
            });
          }
        });
      }
      if (newRow) {
        // insert at correct spot
        const ref = tbody.querySelector(`tr[data-row-index="${rowIndex + 1}"]`);
        if (ref) {
          tbody.insertBefore(newRow, ref);
        } else {
          tbody.appendChild(newRow);
        }
      } else {
        if (window.debug) {
          window.debug.debug(
            "[events.js] Failed to create new row for insert",
            rowIndex,
            rowData
          );
        }
      }
    });

  // After all inserts, re-initialize table events for the wrapper
  if (typeof initializeTableEvents === "function") {
    initializeTableEvents(wrapper);
  }

  //–– 3) APPLY DELETES –– (also in reverse)
  deletes
    .sort((a, b) => b - a)
    .forEach((rowIndex) => {
      const row = tbody.querySelector(`tr[data-row-index="${rowIndex}"]`);
      if (!row) {
        if (window.debug) {
          window.debug.debug("[events.js] No row found for delete", rowIndex);
        }
        return;
      }
      row.remove();
      // decrement all > rowIndex
      Array.from(tbody.querySelectorAll("tr")).forEach((r) => {
        const idxAttr = r.getAttribute("data-row-index");
        if (idxAttr !== null && !isNaN(+idxAttr)) {
          const idx = +idxAttr;
          if (idx > rowIndex) {
            r.setAttribute("data-row-index", String(idx - 1));
          }
        }
      });
    });

  // After all new rows are inserted via delta, re-initialize table events for the wrapper
  // Diagnostic: log new rows and wrapper state before and after initialization
  const newRows = wrapper.querySelectorAll(
    "tr[data-rowid]:not([data-initialized])"
  );
  if (window.debug) {
    window.debug.debug("[Delta Debug] New rows before init:", newRows);
    window.debug.debug("[Delta Debug] Wrapper before init:", wrapper);
    window.debug.debug(
      "[Delta Debug] Guard before table event init:",
      window["_eventListenersInitialized"],
      "Stack:",
      new Error().stack
    );
  }
  // Only initialize table events, never global events here
  initializeTableEvents(wrapper);
  // After initialization, mark new rows and log again
  newRows.forEach((row) => row.setAttribute("data-initialized", "true"));
  if (window.debug) {
    window.debug.debug("[Delta Debug] New rows after init:", newRows);
    window.debug.debug("[Delta Debug] Wrapper after init:", wrapper);
    window.debug.debug(
      "[Delta Debug] Guard after table event init:",
      window["_eventListenersInitialized"],
      "Stack:",
      new Error().stack
    );
  }
}

// Remove all export statements for browser compatibility
// Functions that need to be global can be attached to window if needed

// Example:
// window.initializeEventListeners = initializeEventListeners;

// Make functions available globally for cross-module access
if (typeof window !== "undefined") {
  /** @type {any} */ (window).displayTablesList = displayTablesList;
  /** @type {any} */ (window).displayQueryResults = displayQueryResults;
  /** @type {any} */ (window).displayTableSchema = displayTableSchema;
  /** @type {any} */ (window).displayTableData = displayTableData;
  /** @type {any} */ (window).initializeTableEvents = initializeTableEvents;
  /** @type {any} */ (window).startCellEditing = startCellEditing;
  /** @type {any} */ (window).saveCellEdit = saveCellEdit;
  /** @type {any} */ (window).cancelCellEdit = cancelCellEdit;
  /** @type {any} */ (window).handleCellUpdateSuccess = handleCellUpdateSuccess;
  /** @type {any} */ (window).handleCellUpdateError = handleCellUpdateError;
  /** @type {any} */ (window).getCurrentTableName = getCurrentTableName;
  /** @type {any} */ (window).showConnectionSection = showConnectionSection;
  /** @type {any} */ (window).hideConnectionSection = hideConnectionSection;
  /** @type {any} */ (window).tryInitialConnection = tryInitialConnection;
  /** @type {any} */ (window).handleExecuteQuery = handleExecuteQuery;
  /** @type {any} */ (window).handleExtensionMessage = handleExtensionMessage;
}
