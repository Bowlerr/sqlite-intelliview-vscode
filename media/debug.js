/**
 * Debug utility for SQLite IntelliView extension
 * Provides centralized logging with configurable debug levels
 */

// Debug levels
const DEBUG_LEVELS = {
  OFF: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5,
};

class DebugLogger {
  constructor() {
    // Get debug level from extension settings or default to INFO for development
    this.level = this.getDebugLevel();
    this.prefix = "[SQLiteIV]";
    this.logHistory = [];
    this.maxHistorySize = 1000; // Keep last 1000 log entries
  }

  getDebugLevel() {
    // Try to get from VS Code state if available
    if (
      typeof window !== "undefined" &&
      window.vscode &&
      window.vscode.getState
    ) {
      const state = window.vscode.getState();
      if (state && state.debugLevel !== undefined) {
        return state.debugLevel;
      }
    }

    // Check if this is a development environment
    const isDevelopment = this.isDevEnvironment();

    // Default to INFO for development, ERROR for production (to show errors but not spam)
    return isDevelopment ? DEBUG_LEVELS.INFO : DEBUG_LEVELS.ERROR;
  }

  isDevEnvironment() {
    // Multiple heuristics to detect development environment
    try {
      // Check if we're in VS Code development host
      if (typeof window !== "undefined" && window.location) {
        // Development webviews typically have specific URL patterns
        const url = window.location.href;
        if (url.includes("vscode-webview://") || url.includes("localhost")) {
          return true;
        }
      }

      // Check for debug-specific elements or global flags
      if (
        typeof window !== "undefined" &&
        (window.__DEV__ ||
          window.development ||
          document.body.hasAttribute("data-dev"))
      ) {
        return true;
      }

      // Default to false (production)
      return false;
    } catch (error) {
      // If detection fails, assume production for safety
      return false;
    }
  }

  setDebugLevel(level) {
    this.level = level;
    // Persist to VS Code state if available
    if (
      typeof window !== "undefined" &&
      window.vscode &&
      window.vscode.setState
    ) {
      const state = window.vscode.getState() || {};
      state.debugLevel = level;
      window.vscode.setState(state);
    }
  }

  formatMessage(level, component, message, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    const levelStr = Object.keys(DEBUG_LEVELS)[level] || "UNKNOWN";
    const formatted = [
      `${this.prefix}[${timestamp}][${levelStr}][${component}]`,
      message,
      ...args,
    ];

    // Store in history for export
    this.logHistory.push({
      timestamp: new Date().toISOString(),
      level: levelStr,
      component,
      message: typeof message === "string" ? message : JSON.stringify(message),
      args: args.map((arg) =>
        typeof arg === "string" ? arg : JSON.stringify(arg)
      ),
    });

    // Trim history if too long
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    return formatted;
  }

  error(component, message, ...args) {
    if (this.level >= DEBUG_LEVELS.ERROR) {
      console.error(
        ...this.formatMessage(DEBUG_LEVELS.ERROR, component, message, ...args)
      );
    }
  }

  warn(component, message, ...args) {
    if (this.level >= DEBUG_LEVELS.WARN) {
      console.warn(
        ...this.formatMessage(DEBUG_LEVELS.WARN, component, message, ...args)
      );
    }
  }

  info(component, message, ...args) {
    if (this.level >= DEBUG_LEVELS.INFO) {
      console.log(
        ...this.formatMessage(DEBUG_LEVELS.INFO, component, message, ...args)
      );
    }
  }

  debug(component, message, ...args) {
    if (this.level >= DEBUG_LEVELS.DEBUG) {
      console.log(
        ...this.formatMessage(DEBUG_LEVELS.DEBUG, component, message, ...args)
      );
    }
  }

  trace(component, message, ...args) {
    if (this.level >= DEBUG_LEVELS.TRACE) {
      console.log(
        ...this.formatMessage(DEBUG_LEVELS.TRACE, component, message, ...args)
      );
    }
  }

  // Legacy console.log replacement - maps to info level
  log(component, message, ...args) {
    this.info(component, message, ...args);
  }

  // Helper method to check if a level is enabled
  isEnabled(level) {
    return this.level >= level;
  }

  // Get current level as string
  getCurrentLevelName() {
    return Object.keys(DEBUG_LEVELS)[this.level] || "UNKNOWN";
  }

  // Export debug history for troubleshooting
  exportLogs() {
    const exportData = {
      timestamp: new Date().toISOString(),
      extensionVersion: "0.2.15", // TODO: Get from package.json
      debugLevel: this.getCurrentLevelName(),
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "Unknown",
      logs: this.logHistory,
    };

    return JSON.stringify(exportData, null, 2);
  }

  // Clear log history
  clearHistory() {
    this.logHistory = [];
    this.info("DebugLogger", "Log history cleared");
  }
}

// TypeScript declaration for the debug module
/**
 * @typedef {Object} DebugLogger
 * @property {function(string, string, ...any): void} error
 * @property {function(string, string, ...any): void} warn
 * @property {function(string, string, ...any): void} info
 * @property {function(string, string, ...any): void} debug
 * @property {function(string, string, ...any): void} trace
 */

/** @type {DebugLogger} */
const debug = new DebugLogger();

// Create global debug instance
debug.LEVELS = DEBUG_LEVELS;

// Make available globally in webview
if (typeof window !== "undefined") {
  window.debug = debug;
  window.DEBUG_LEVELS = DEBUG_LEVELS;
}

// Export for Node.js environments (extension host)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { debug, DEBUG_LEVELS };
}
