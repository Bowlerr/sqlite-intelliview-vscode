/**
 * Debug UI Controls for SQLite IntelliView
 * Provides a simple interface to control debug logging levels
 */

function createDebugControls() {
  // Only show debug controls if explicitly in development mode or debug level is DEBUG/TRACE
  if (
    !window.debug ||
    (!window.debug.isDevEnvironment() &&
      !window.debug.isEnabled(window.DEBUG_LEVELS.DEBUG))
  ) {
    return;
  }

  // Check if debug controls already exist
  if (document.getElementById("debug-controls")) {
    return;
  }

  const debugPanel = document.createElement("div");
  debugPanel.id = "debug-controls";
  debugPanel.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      right: 10px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      font-size: 11px;
      font-family: var(--vscode-font-family);
      z-index: 10000;
      min-width: 180px;
    ">
      <div style="font-weight: bold; margin-bottom: 4px; color: var(--vscode-editor-foreground);">
        🐛 Debug Controls
      </div>
      <div style="margin-bottom: 4px;">
        <label style="color: var(--vscode-editor-foreground);">
          Level: 
          <select id="debug-level-select" style="
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            padding: 2px 4px;
            margin-left: 4px;
          ">
            <option value="0">OFF</option>
            <option value="1">ERROR</option>
            <option value="2">WARN</option>
            <option value="3">INFO</option>
            <option value="4">DEBUG</option>
            <option value="5">TRACE</option>
          </select>
        </label>
      </div>
      <div style="font-size: 10px; color: var(--vscode-descriptionForeground);">
        Current: <span id="debug-current-level">${window.debug.getCurrentLevelName()}</span>
      </div>
      <div style="margin-top: 4px; display: flex; gap: 4px;">
        <button id="debug-export-btn" style="
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: none;
          border-radius: 2px;
          padding: 2px 6px;
          font-size: 10px;
          cursor: pointer;
        ">Export</button>
        <button id="debug-clear-btn" style="
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: none;
          border-radius: 2px;
          padding: 2px 6px;
          font-size: 10px;
          cursor: pointer;
        ">Clear</button>
        <button id="debug-close-btn" style="
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 2px;
          padding: 2px 6px;
          font-size: 10px;
          cursor: pointer;
        ">×</button>
      </div>
    </div>
  `;

  document.body.appendChild(debugPanel);

  // Set current value
  const select = document.getElementById("debug-level-select");
  select.value = window.debug.level.toString();

  // Handle level changes
  select.addEventListener("change", (e) => {
    const newLevel = parseInt(e.target.value);
    window.debug.setDebugLevel(newLevel);
    document.getElementById("debug-current-level").textContent =
      window.debug.getCurrentLevelName();
    window.debug.info(
      "DebugUI",
      `Debug level changed to ${window.debug.getCurrentLevelName()}`
    );
  });

  // Handle export button
  document.getElementById("debug-export-btn").addEventListener("click", () => {
    const logs = window.debug.exportLogs();
    const blob = new Blob([logs], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sqlite-intelliview-debug-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    window.debug.info("DebugUI", "Debug logs exported");
  });

  // Handle clear button
  document.getElementById("debug-clear-btn").addEventListener("click", () => {
    if (confirm("Clear debug log history?")) {
      window.debug.clearHistory();
    }
  });

  // Handle close button
  document.getElementById("debug-close-btn").addEventListener("click", () => {
    debugPanel.remove();
  });
}

// Auto-create debug controls if debug level is high enough
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    // Small delay to ensure debug system is loaded
    setTimeout(createDebugControls, 100);
  });

  // Also try immediately in case DOM is already loaded
  if (document.readyState === "loading") {
    // DOM is still loading
  } else {
    setTimeout(createDebugControls, 100);
  }
}

// Add keyboard shortcut to toggle debug controls (Ctrl/Cmd + Shift + D)
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "D") {
      e.preventDefault();
      const existing = document.getElementById("debug-controls");
      if (existing) {
        existing.remove();
        if (window.debug) {
          window.debug.info("DebugUI", "Debug controls hidden");
        }
      } else {
        createDebugControls();
        if (window.debug) {
          window.debug.info(
            "DebugUI",
            "Debug controls shown (Ctrl/Cmd+Shift+D to toggle)"
          );
        }
      }
    }
  });
}

// Expose function globally
if (typeof window !== "undefined") {
  window.createDebugControls = createDebugControls;
}
