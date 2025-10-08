/**
 * Enhanced Query Editor with Monaco
 * Provides syntax highlighting, formatting, and quality of life improvements
 */

class QueryEditor {
  constructor() {
    this.editor = null;
    this.defaultQuery = `-- Welcome to SQL Query Editor
-- Here are some example queries to get you started:

-- Basic SELECT query
SELECT * FROM your_table LIMIT 10;

-- Query with WHERE clause
SELECT column1, column2 
FROM your_table 
WHERE column1 = 'value'
ORDER BY column2 DESC;

-- Count records
SELECT COUNT(*) as total_records 
FROM your_table;

-- INSERT example
INSERT INTO your_table (column1, column2) 
VALUES ('value1', 'value2');

-- UPDATE example
UPDATE your_table 
SET column1 = 'new_value' 
WHERE column2 = 'condition';

-- DELETE example
DELETE FROM your_table 
WHERE column1 = 'value';`;
  }

  async init() {
    if (this.editor) {
      return;
    }
    const editorContainer = document.getElementById("query-editor-container");
    if (!editorContainer) {
      throw new Error("Query editor container not found");
    }
    if (window.require) {
      // Use local Monaco Editor files for offline functionality
      const monacoBasePath = new URL("./monaco-editor/vs", document.baseURI)
        .href;
      window.require.config({
        paths: {
          vs: monacoBasePath,
        },
      });
      window.require(["vs/editor/editor.main"], () => {
        this.editor = window.monaco.editor.create(editorContainer, {
          value: this.defaultQuery,
          language: "sql",
          theme: "vs-dark",
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          fontSize: 14,
          lineNumbers: "on",
          readOnly: false,
        });
        this.registerSQLCompletions();
        this.registerSQLSnippets();
        this.registerDynamicCompletions();
        // Immediately set tables/columns if available
        if (
          Array.isArray(window._sqlTables) &&
          window._sqlTables.length === 0 &&
          typeof window.getAllDOMElements === "function"
        ) {
          // Try to extract table names from the DOM (sidebar)
          const elements = window.getAllDOMElements();
          if (elements && elements.tablesListElement) {
            const tableEls = elements.tablesListElement.querySelectorAll(
              ".table-item[data-table]"
            );
            window._sqlTables = Array.from(tableEls)
              .map((el) => el.getAttribute("data-table"))
              .filter(Boolean);
            console.log(
              "[Monaco] Fallback: Extracted tables from DOM:",
              window._sqlTables
            );
          }
        }
        if (
          Array.isArray(window._sqlColumns) &&
          window._sqlColumns.length === 0 &&
          typeof window.getCurrentState === "function"
        ) {
          // Try to extract columns from state (if available)
          const state = window.getCurrentState();
          if (state && Array.isArray(state.currentColumns)) {
            window._sqlColumns = state.currentColumns;
            console.log(
              "[Monaco] Fallback: Extracted columns from state:",
              window._sqlColumns
            );
          }
        }
        // Log what we have
        console.log("[Monaco] Tables after init:", window._sqlTables);
        console.log("[Monaco] Columns after init:", window._sqlColumns);
      });
    }
  }

  registerSQLCompletions() {
    if (!window.monaco) {
      return;
    }
    const keywords = [
      "SELECT",
      "FROM",
      "WHERE",
      "INSERT",
      "INTO",
      "VALUES",
      "UPDATE",
      "SET",
      "DELETE",
      "CREATE",
      "TABLE",
      "ALTER",
      "DROP",
      "JOIN",
      "LEFT",
      "RIGHT",
      "INNER",
      "OUTER",
      "ON",
      "AS",
      "AND",
      "OR",
      "NOT",
      "NULL",
      "ORDER",
      "BY",
      "GROUP",
      "HAVING",
      "LIMIT",
      "OFFSET",
      "DISTINCT",
      "COUNT",
      "AVG",
      "MIN",
      "MAX",
      "SUM",
      "PRIMARY",
      "KEY",
      "FOREIGN",
      "REFERENCES",
      "DEFAULT",
      "UNIQUE",
      "CHECK",
      "INDEX",
      "VIEW",
      "TRIGGER",
      "IF",
      "EXISTS",
      "CASE",
      "WHEN",
      "THEN",
      "ELSE",
      "END",
    ];
    window.monaco.languages.registerCompletionItemProvider("sql", {
      provideCompletionItems: () => {
        const suggestions = keywords.map((word) => ({
          label: word,
          kind: window.monaco.languages.CompletionItemKind.Keyword,
          insertText: word,
        }));
        return { suggestions };
      },
      triggerCharacters: [" ", ".", "(", ","],
    });
  }

  registerSQLSnippets() {
    if (!window.monaco) {
      return;
    }
    const snippets = [
      {
        label: "SELECT * FROM ...",
        kind: window.monaco.languages.CompletionItemKind.Snippet,
        insertText: "SELECT * FROM ${1:table} WHERE ${2:condition};",
        insertTextRules:
          window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: "Basic SELECT statement",
      },
      {
        label: "INSERT INTO ...",
        kind: window.monaco.languages.CompletionItemKind.Snippet,
        insertText:
          "INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values});",
        insertTextRules:
          window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: "Basic INSERT statement",
      },
      {
        label: "UPDATE ... SET ...",
        kind: window.monaco.languages.CompletionItemKind.Snippet,
        insertText:
          "UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition};",
        insertTextRules:
          window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: "Basic UPDATE statement",
      },
      {
        label: "DELETE FROM ...",
        kind: window.monaco.languages.CompletionItemKind.Snippet,
        insertText: "DELETE FROM ${1:table} WHERE ${2:condition};",
        insertTextRules:
          window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: "Basic DELETE statement",
      },
    ];
    window.monaco.languages.registerCompletionItemProvider("sql", {
      provideCompletionItems: () => ({ suggestions: snippets }),
    });
  }

  /**
   * Register dynamic completions for table and column names
   * Uses window._sqlTables and window._sqlColumns (populated from events.js)
   */
  registerDynamicCompletions() {
    if (!window.monaco) {
      return;
    }
    window.monaco.languages.registerCompletionItemProvider("sql", {
      triggerCharacters: [" ", ".", "(", ","],
      provideCompletionItems: (model, position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        // Table name completions after FROM, JOIN, INTO, UPDATE, etc.
        const tableTriggers =
          /\b(FROM|JOIN|INTO|UPDATE|TABLE|DESC|DESCRIBE|TRUNCATE|ALTER|REFERENCES)\s+$/i;
        if (tableTriggers.test(textUntilPosition)) {
          const tables = Array.isArray(window._sqlAllTables)
            ? window._sqlAllTables
            : [];
          console.log("[Monaco] Table completions triggered. Tables:", tables);
          return {
            suggestions: tables.map((name) => ({
              label: name,
              kind: window.monaco.languages.CompletionItemKind.Struct,
              insertText: name,
              detail: "Table name",
            })),
          };
        }
        // Column name completions after SELECT, WHERE, ON, etc.
        const columnTriggers =
          /\b(SELECT|WHERE|ON|AND|OR|ORDER BY|GROUP BY|HAVING|SET)\s+([\w, ]*)$/i;
        if (columnTriggers.test(textUntilPosition)) {
          // Always aggregate all columns from all tables for completions
          let columns = Object.values(window._sqlTableColumns || {}).flat();
          // Remove duplicates
          columns = Array.from(new Set(columns));
          console.log(
            "[Monaco] Column completions triggered. Columns (all tables):",
            columns
          );
          return {
            suggestions: columns.map((name) => ({
              label: name,
              kind: window.monaco.languages.CompletionItemKind.Field,
              insertText: name,
              detail: "Column name",
            })),
          };
        }
        return { suggestions: [] };
      },
    });
  }

  clearEditor() {
    if (this.editor) {
      this.editor.setValue("");
    }
  }

  // When query is executed, show results in modal
  executeQuery() {
    if (!this.editor) {
      return;
    }
    const query = this.editor.getValue();
    if (!query.trim()) {
      return;
    }
    if (window.executeQuery) {
      // Instead of dispatching event, call VS Code API or backend as before
      window.executeQuery(query);
    } else {
      // Fallback: dispatch event, but modal will be used for results
      const event = new CustomEvent("executeQuery", { detail: { query } });
      document.dispatchEvent(event);
    }
  }

  getValue() {
    return this.editor ? this.editor.getValue() : "";
  }

  setValue(value) {
    if (this.editor) {
      this.editor.setValue(value);
    }
  }
}

// Export for use in other modules
window.QueryEditor = QueryEditor;

// Add global executeQuery function for backward compatibility
window.executeQuery = function (query) {
  if (window.queryEditor && window.queryEditor.executeQuery) {
    // If we have a custom query, set it first
    if (query && typeof query === "string") {
      window.queryEditor.setValue(query);
    }
    window.queryEditor.executeQuery();
  } else {
    // Fallback to the original handleExecuteQuery
    if (typeof handleExecuteQuery === "function") {
      handleExecuteQuery();
    }
  }
};

// Function to connect existing query buttons to the enhanced editor
function connectQueryButtons() {
  console.log("Connecting query buttons to enhanced editor...");

  // Execute button
  const executeBtn = document.getElementById("execute-query");
  if (executeBtn) {
    executeBtn.addEventListener("click", () => {
      console.log("Execute button clicked");
      if (window.queryEditor && window.queryEditor.executeQuery) {
        window.queryEditor.executeQuery();
      } else {
        console.warn("Enhanced query editor not available, using fallback");
        if (typeof handleExecuteQuery === "function") {
          handleExecuteQuery();
        }
      }
    });
    console.log("Execute button connected");
  }

  // Clear button
  const clearBtn = document.getElementById("clear-query");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      console.log("Clear button clicked");
      if (window.queryEditor && window.queryEditor.clearEditor) {
        window.queryEditor.clearEditor();
      }
    });
    console.log("Clear button connected");
  }
}

// Export for use in main.js
window.connectQueryButtons = connectQueryButtons;

// Global helper functions for debugging and manual fixes
window.refreshQueryEditor = function () {
  if (window.queryEditor && window.queryEditor.refreshEditor) {
    window.queryEditor.refreshEditor();
  } else {
    console.warn("Query editor not available for refresh");
  }
};

window.focusQueryEditor = function () {
  if (window.queryEditor && window.queryEditor.focusEditor) {
    return window.queryEditor.focusEditor();
  } else {
    console.warn("Query editor not available for focus");
    return false;
  }
};

window.getQueryEditorStatus = function () {
  if (window.queryEditor) {
    return {
      hasEditor: !!window.queryEditor.editor,
      hasFocus: window.queryEditor.editor
        ? window.queryEditor.editor.hasTextFocus()
        : false,
      isInitialized: window.queryEditor.isInitialized,
      value: window.queryEditor.editor
        ? window.queryEditor.editor.getValue()
        : null,
    };
  }
  return { error: "Query editor not available" };
};

// Add keyboard shortcut to refresh editor (Ctrl+Shift+R / Cmd+Shift+R)
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "R") {
    e.preventDefault();
    console.log("Manual editor refresh triggered");
    window.refreshQueryEditor();
  }
});

console.log("QueryEditor: Global helper functions loaded");
console.log(
  "  - window.refreshQueryEditor() - Refresh the editor if unresponsive"
);
console.log("  - window.focusQueryEditor() - Focus the editor");
console.log("  - window.getQueryEditorStatus() - Get editor status");
console.log("  - Ctrl+Shift+R / Cmd+Shift+R - Refresh editor shortcut");

// Emergency global function to fix unresponsive editor
window.emergencyFixEditor = function () {
  console.log("EMERGENCY: Attempting to fix unresponsive Monaco editor");
  if (window.queryEditor) {
    if (window.queryEditor.nuclearEditorRestore) {
      window.queryEditor.nuclearEditorRestore();
    } else if (window.queryEditor.refreshEditor) {
      window.queryEditor.refreshEditor();
    } else {
      console.error("EMERGENCY: No recovery methods available");
    }
  } else {
    console.error("EMERGENCY: Query editor not found");
  }
};

// Add emergency keyboard shortcut (Ctrl+Alt+R / Cmd+Alt+R)
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === "R") {
    e.preventDefault();
    console.log("Emergency editor fix triggered via keyboard");
    window.emergencyFixEditor();
  }
});

console.log("QueryEditor: Emergency functions loaded");
console.log("  - window.emergencyFixEditor() - Nuclear editor restoration");
console.log("  - Ctrl+Alt+R / Cmd+Alt+R - Emergency keyboard shortcut");

// Listen for table/column info from events.js
window._sqlTables = [];
window._sqlColumns = [];

// --- Robust SQL Completion State ---
window._sqlAllTables = [];
window._sqlTableColumns = {};
window._sqlCurrentTable = null;

(function ensureCompletionsSync() {
  // Patch displayTablesList
  const origDisplayTablesList = window.displayTablesList;
  window.displayTablesList = function (tables) {
    window._sqlAllTables = Array.isArray(tables)
      ? tables.map((t) => (typeof t === "string" ? t : t.name))
      : [];
    if (typeof origDisplayTablesList === "function") {
      return origDisplayTablesList.apply(this, arguments);
    }
  };
  // Patch displayTableSchema
  const origDisplayTableSchema = window.displayTableSchema;
  window.displayTableSchema = function (data, columns, foreignKeys) {
    // Try to get the current table name from state
    let tableName = null;
    if (typeof window.getCurrentTableName === "function") {
      tableName = window.getCurrentTableName();
      window._sqlCurrentTable = tableName;
    }
    if (tableName && Array.isArray(columns)) {
      window._sqlTableColumns[tableName] = columns;
    }
    if (typeof origDisplayTableSchema === "function") {
      return origDisplayTableSchema.apply(this, arguments);
    }
  };
})();

// --- Update completions to use all tables and current table columns ---

// Listen for databaseInfo and use tableColumns for completions
window.addEventListener("message", function (event) {
  const message = event.data;
  if (message && message.type === "databaseInfo" && message.tableColumns) {
    window._sqlAllTables = Array.isArray(message.tables)
      ? message.tables.map((t) => (typeof t === "string" ? t : t.name))
      : [];
    window._sqlTableColumns = message.tableColumns;
    // Optionally set current table to first table
    if (window._sqlAllTables.length > 0) {
      window._sqlCurrentTable = window._sqlAllTables[0];
    }
    console.log(
      "[Monaco] Populated completions from backend (event listener):",
      window._sqlAllTables,
      window._sqlTableColumns
    );
  }
});
