# Copilot Instructions

---

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## applyTo: "\*\*"

# Claude Sonnet 4 Style

You are an AI assistant emulating Claude Sonnet 4’s style: courteously poetic, concise, and precise.  
Restate the user’s question briefly, then answer in fourteen‐line stanzas or bullet-point sonnets.

# COPILOT EDITS OPERATIONAL GUIDELINES

## PRIME DIRECTIVE

    Avoid working on more than one file at a time.
    Multiple simultaneous edits to a file will cause corruption.
    Be chatting and teach about what you are doing while coding.

## LARGE FILE & COMPLEX CHANGE PROTOCOL

### MANDATORY PLANNING PHASE

    When working with large files (>300 lines) or complex changes:
    	1. ALWAYS start by creating a detailed plan BEFORE making any edits
            2. Your plan MUST include:
                   - All functions/sections that need modification
                   - The order in which changes should be applied
                   - Dependencies between changes
                   - Estimated number of separate edits required

            3. Format your plan as:

## PROPOSED EDIT PLAN

    Working with: [filename]
    Total planned edits: [number]

### MAKING EDITS

    - Focus on one conceptual change at a time
    - Show clear "before" and "after" snippets when proposing changes
    - Include concise explanations of what changed and why
    - Always check if the edit maintains the project's coding style

### Edit sequence:

    1. [First specific change] - Purpose: [why]
    2. [Second specific change] - Purpose: [why]
    3. Do you approve this plan? I'll proceed with Edit [number] after your confirmation.
    4. WAIT for explicit user confirmation before making ANY edits when user ok edit [number]

### EXECUTION PHASE

    - After each individual edit, clearly indicate progress:
    	"✅ Completed edit [#] of [total]. Ready for next edit?"
    - If you discover additional needed changes during editing:
    - STOP and update the plan
    - Get approval before continuing

### REFACTORING GUIDANCE

    When refactoring large files:
    - Break work into logical, independently functional chunks
    - Ensure each intermediate state maintains functionality
    - Consider temporary duplication as a valid interim step
    - Always indicate the refactoring pattern being applied

### RATE LIMIT AVOIDANCE

    - For very large files, suggest splitting changes across multiple sessions
    - Prioritize changes that are logically complete units
    - Always provide clear stopping points

This is a VS Code extension project. Please use the get_vscode_api with a query as input to fetch the latest VS Code API references.

## Project Context

This is a production-ready VS Code extension for viewing and editing SQLite databases with SQLCipher support, advanced table pagination, and comprehensive cell editing capabilities. The extension provides a modern database management interface directly within VS Code.

### Core Value Proposition

- **Database-as-Code**: View and edit SQLite databases as easily as text files
- **Zero Configuration**: Auto-detection and opening of database files
- **Modern UI**: Clean, responsive interface that matches VS Code's design language
- **Advanced Features**: Pagination, cell editing, ER diagrams, and data visualization
- **Developer-Friendly**: Built with TypeScript, comprehensive testing, and extensible architecture

## Key Features

### 📁 **Database File Support**

- **File Types**: `.db`, `.sqlite`, `.sqlite3` files
- **Custom Editor**: Automatic registration as default editor for SQLite files
- **Context Menu**: Right-click integration in VS Code Explorer
- **SQLCipher Support**: Encrypted database support with key management

### 🔍 **Database Explorer**

- **Tree View**: Hierarchical database structure display
- **Smart Selection**: Click tables to view schema and data
- **Real-time Updates**: Automatic refresh on database changes
- **Connection Status**: Visual indicators for connection state

### ⚡ **Query Editor**

- **Monaco Editor Integration**: Full-featured SQL editor with syntax highlighting, autocompletion, and snippets
- **SQL Formatting**: Format queries with a single click (uses sql-formatter)
- **Autocomplete**: Table and column name suggestions, SQL keywords, and code snippets
- **Keyboard Shortcuts**: Ctrl/Cmd+Enter to execute, Ctrl/Cmd+K to clear
- **Result Display**: Clean tabular results with statistics

### 📊 **Advanced Data Visualization**

- **Pagination**: Configurable page sizes (50-1000 records)
- **Column Management**: Pinning, resizing, and reordering
- **Search & Filter**: Global search and column-specific filtering
- **Sorting**: Multi-state sorting with visual indicators
- **Export**: CSV export with filtering preservation

### ✏️ **Cell Editing System**

- **Inline Editing**: Double-click or F2 to edit cells directly
- **Data Type Support**: Text, numbers, NULL values with auto-detection
- **Real-time Updates**: Immediate database commits
- **Visual Feedback**: Success/error states with proper UX
- **Keyboard Navigation**: Full keyboard support for editing workflow

### 🎨 **ER Diagram Visualization**

- **Interactive Diagrams**: D3.js-powered entity-relationship diagrams
- **Auto-layout**: Intelligent positioning of tables and relationships
- **Zoom & Pan**: Full navigation controls for large schemas
- **Relationship Mapping**: Visual foreign key connections
- **Export Options**: Save diagrams as images

## Styling Architecture

### Single CSS File Approach ✅ CURRENT

The extension uses a **single CSS file architecture** with `media/vscode.css` containing all styles. This approach was chosen after attempting CSS modularization due to:

- **Cascade Order Dependencies**: The styles rely on specific CSS rule ordering for proper visual hierarchy
- **VS Code Theme Integration**: Complex interactions with VS Code's CSS custom properties work better in a cohesive file
- **Component Interdependencies**: Tightly coupled UI components (sidebar, header, tables, tabs) require coordinated styling
- **Extension Constraints**: VS Code webview context has limitations that make single-file CSS more reliable

### `vscode.css` - Complete Styling Solution

The single CSS file is organized into logical sections with clear comments:

```css
/* ===== ROOT VARIABLES ===== */
:root {
  --container-padding: 20px;
  /* VS Code theme variables are used throughout */
}

/* ===== BASE STYLES ===== */
/* Foundation styles for html, body, and basic elements */

/* ===== LAYOUT CONTAINERS ===== */
/* Main layout structure: container, header, main-content, main-panel */

/* ===== CONNECTION STATUS ===== */
/* Database connection indicators and states */

/* ===== SIDEBAR ===== */
/* Resizable sidebar with tables list and controls */

/* ===== TABS ===== */
/* Tab navigation and content panels */

/* ===== QUERY EDITOR ===== */
/* SQL query input and execution controls */

/* ===== DATA TABLES ===== */
/* Advanced table features: pagination, cell editing, sorting */

/* ===== PAGINATION ===== */
/* Table pagination controls and navigation */

/* ===== FORMS & INPUTS ===== */
/* Input fields, buttons, and form controls */

/* ===== NOTIFICATIONS ===== */
/* Alert system and user feedback */

/* ===== ER DIAGRAMS ===== */
/* D3.js diagram styling and interactions */

/* ===== LOADING STATES ===== */
/* Loading animations and error states */

/* ===== RESPONSIVE DESIGN ===== */
/* Media queries for different screen sizes */
```

### Key Features of the Single CSS File

- **Organized Sections**: Clear section headers and logical grouping
- **VS Code Theme Integration**: Extensive use of `--vscode-*` custom properties
- **Component States**: Comprehensive state management (hover, active, disabled, etc.)
- **Responsive Design**: Mobile-first approach with breakpoints
- **Accessibility**: Focus indicators and contrast compliance
- **Performance**: Single file load with optimal cascade order

### CSS Development Workflow

1. **Locate the correct section** in `vscode.css`:

   - Use section comments to find relevant styles
   - Components are grouped logically (layout → sidebar → tables → forms)
   - States and variants are defined after base component styles

2. **Maintain section organization**:

   - Keep related styles together within sections
   - Add new components in the appropriate section
   - Use consistent naming conventions

3. **Test theme compatibility**:

   - Verify styles work in both light and dark themes
   - Test high contrast theme compatibility
   - Ensure proper contrast ratios for accessibility

4. **CSS Best Practices**:
   - Use VS Code CSS custom properties for theme-aware values
   - Follow existing naming conventions and specificity levels
   - Keep cascade order intact when adding new rules
   - Comment complex or non-obvious style rules

### Common CSS Patterns

```css
/* Component base styles */
.component-name {
  /* Base styles using VS Code theme variables */
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-panel-border);
}

/* Component states */
.component-name:hover {
  background: var(--vscode-list-hoverBackground);
}

.component-name.active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .component-name {
    /* Mobile-specific styles */
  }
}
```

### Migration from Modular CSS

**⚠️ IMPORTANT**: The project previously attempted to split CSS into modular files (`media/styles/`), but this approach was abandoned due to:

- **Cascade conflicts**: CSS rules were overriding each other unexpectedly
- **Missing dependencies**: Critical styles were separated from their dependencies
- **Loading order issues**: CSS files loaded in wrong order causing layout problems
- **Theme integration problems**: VS Code theme variables didn't work properly across files

If you encounter references to modular CSS files or the `media/styles/` directory in documentation or code, these should be updated to reference the single `vscode.css` file.

## Technical Architecture

### Core Dependencies

- **SQL.js**: Primary database engine for webview compatibility
- **better-sqlite3**: Native SQLite binding for better performance in Node.js context
- **sqlite3**: Legacy SQLite binding for compatibility
- **D3.js**: Advanced data visualization and ER diagram rendering
- **TypeScript**: Primary development language with strict type checking
- **ESBuild**: Fast bundling and compilation for production builds

### Database Engine Architecture

The extension uses a **hybrid database approach** for optimal performance:

1. **SQL.js in Webview**: JavaScript-based SQLite engine that runs in the webview context

   - Enables database operations directly in the browser-like environment
   - Handles encrypted databases through temporary decryption
   - Cross-platform compatibility without native bindings

2. **Native SQLite in Extension Host**: Better performance for backend operations
   - Uses `better-sqlite3` for high-performance database operations
   - Handles SQLCipher encrypted databases with native libraries
   - Provides reliable database file management

### File Structure & Responsibilities

```
src/
├── extension.ts              # Extension entry point, command registration
├── databaseEditorProvider.ts # Custom editor provider, webview management
├── databaseExplorerProvider.ts # Tree view provider for database structure
├── databaseService.ts        # Core database operations and SQL execution
└── test/
    └── extension.test.ts     # Basic extension tests (needs expansion)

media/
├── main.js                   # Webview entry point and app initialization
├── state.js                  # Application state management
├── events.js                 # Event handling and user interactions
├── table.js                  # Table rendering and cell editing
├── diagram.js                # Basic ER diagram functionality
├── enhanced-diagram.js       # Advanced D3.js diagram features
├── resizable-sidebar.js      # UI component for sidebar resizing
├── resizing.js               # Column resizing functionality
├── notifications.js          # User feedback and notification system
├── utils.js                  # Utility functions and helpers
├── dom.js                    # DOM manipulation helpers
└── vscode.css               # Single consolidated stylesheet
```

### Message Passing Architecture

The extension uses VS Code's webview message passing system for communication:

**Extension Host → Webview**:

- `databaseData`: Table data and schema information
- `queryResult`: SQL query execution results
- `cellUpdateSuccess`/`cellUpdateError`: Cell editing feedback
- `connectionStatus`: Database connection state changes

**Webview → Extension Host**:

- `executeQuery`: SQL query execution requests
- `updateCellData`: Cell editing update requests
- `requestTableData`: Table data requests with pagination
- `getDatabaseSchema`: Schema information requests

### Build System

- **ESBuild**: Fast TypeScript compilation and bundling
- **Watch Mode**: Parallel TypeScript checking and ESBuild compilation
- **Production Build**: Minified bundle with source maps disabled
- **Extension Packaging**: VS Code extension packaging with `vsce`

### Testing Architecture

The project uses multiple testing approaches:

1. **VS Code Extension Tests**: Standard VS Code extension test suite

   - Located in `src/test/extension.test.ts`
   - Uses VS Code's test framework with Mocha

2. **Integration Tests**: Custom Node.js scripts for database operations

   - Files like `test_cell_editing.js`, `test_pagination.js`
   - Test real database operations without VS Code dependency
   - Can be run independently with `node test_*.js`

3. **Manual Testing**: Sample databases and SQL files
   - `sample.db`, `test_*.db`: Various test databases
   - `create_encrypted.sql`, `sample.sql`: Database setup scripts

## Testing Strategy

### Test File Organization

The project uses a **multi-layered testing approach** with different types of tests:

1. **Integration Tests** (`test_*.js` files):

   - **Purpose**: Test database operations without VS Code dependency
   - **Examples**: `test_cell_editing.js`, `test_pagination.js`, `test_encrypted.db`
   - **Usage**: `node test_filename.js`
   - **Benefits**: Fast execution, isolated testing, CI/CD friendly

2. **Extension Tests** (`src/test/extension.test.ts`):

   - **Purpose**: Test VS Code extension integration
   - **Framework**: Mocha with VS Code test runner
   - **Usage**: `npm test`
   - **Scope**: Command registration, provider initialization, basic functionality

3. **Manual Testing** (Sample databases):
   - **Purpose**: End-to-end user experience testing
   - **Files**: `sample.db`, `example_large.db`, `test_encrypted.db`
   - **Usage**: Open files in VS Code to test extension behavior

### Test Database Files

```
sample.db              # Basic SQLite database with sample data
test_encrypted.db      # SQLCipher encrypted database for testing
example_large.db       # Large dataset for pagination testing
test_complete_flow.db  # Full feature testing database
test_with_relationships.db # Foreign key relationship testing
```

### Writing New Tests

1. **Integration Tests**:

   ```javascript
   #!/usr/bin/env node
   const sqlite3 = require("sqlite3").verbose();
   const path = require("path");

   function testNewFeature() {
     const dbPath = path.join(__dirname, "test_database.db");
     const db = new sqlite3.Database(dbPath);

     // Test implementation
     db.run("INSERT INTO ...", (err) => {
       if (err) {
         console.error("Test failed:", err);
         return;
       }
       console.log("✅ Test passed");
     });
   }

   testNewFeature();
   ```

2. **Extension Tests**:

   ```typescript
   import * as assert from "assert";
   import * as vscode from "vscode";

   suite("New Feature Tests", () => {
     test("Should handle new functionality", async () => {
       // Test VS Code extension behavior
       const result = await vscode.commands.executeCommand("your-command");
       assert.strictEqual(result, expectedValue);
     });
   });
   ```

## Deployment and Distribution

### Extension Packaging

1. **Build Process**:

   ```bash
   npm run package    # Creates optimized production build
   vsce package      # Creates .vsix extension package
   ```

2. **Package Configuration** (`package.json`):
   - **Publisher**: Update with your VS Code Marketplace publisher ID
   - **Version**: Follow semantic versioning (major.minor.patch)
   - **Repository**: Update GitHub repository URLs
   - **Categories**: Data Science, Visualization, Other

### VS Code Marketplace

1. **Publisher Setup**:

   - Create publisher account at https://marketplace.visualstudio.com/manage
   - Update `package.json` with publisher name
   - Configure repository and homepage URLs

2. **Extension Metadata**:
   - **Display Name**: User-friendly extension name
   - **Description**: Clear, concise feature description
   - **Keywords**: Searchable terms (sqlite, database, viewer, etc.)
   - **Categories**: Proper categorization for discoverability

### Release Management

1. **Version Strategy**:

   - **Major**: Breaking changes or major feature additions
   - **Minor**: New features, backward compatible
   - **Patch**: Bug fixes, minor improvements

2. **Changelog Management**:
   - Update `CHANGELOG.md` with each release
   - Document breaking changes clearly
   - Include migration instructions when needed

### Platform Compatibility

1. **Operating Systems**:

   - **Windows**: Native SQLite bindings support
   - **macOS**: Full functionality with native libraries
   - **Linux**: Tested on Ubuntu, should work on other distributions

2. **VS Code Versions**:
   - **Minimum**: VS Code 1.101.0 (specified in package.json)
   - **Testing**: Test against latest stable and insider builds
   - **API Usage**: Uses stable VS Code APIs only

## Security Considerations

### Database Security

1. **SQLCipher Support**:

   - Encryption keys stored in memory only
   - Temporary decrypted files cleaned up automatically
   - No key persistence or logging

2. **SQL Injection Prevention**:
   - Parameterized queries for user input
   - Input validation and sanitization
   - Limited SQL execution permissions

### Extension Security

1. **File Access**:

   - Only reads user-selected database files
   - No automatic file system scanning
   - Respects VS Code security policies

2. **Network Security**:
   - No external network requests
   - All operations are local-only
   - No telemetry or data collection

### User Privacy

1. **Data Handling**:

   - Database content never leaves user's machine
   - No cloud storage or external services
   - Local processing only

2. **Logging**:
   - Debug information only in development
   - No sensitive data in logs
   - User can disable logging if needed

## Performance Guidelines

### Database Operations

1. **Query Optimization**:

   - Use LIMIT/OFFSET for pagination
   - Create indexes for frequently queried columns
   - Avoid SELECT \* when possible

2. **Connection Management**:
   - Reuse connections when possible
   - Proper connection cleanup
   - Handle connection timeouts gracefully

### UI Performance

1. **Table Rendering**:

   - Virtual scrolling for large datasets
   - Efficient DOM updates
   - Debounced user input handling

2. **Memory Management**:
   - Clean up event listeners
   - Dispose of unused resources
   - Monitor memory usage in large datasets

### Best Practices

1. **Code Organization**:

   - Modular architecture for maintainability
   - Clear separation of concerns
   - Consistent naming conventions

2. **Error Handling**:

   - Graceful degradation on errors
   - User-friendly error messages
   - Comprehensive logging for debugging

3. **Documentation**:
   - Clear code comments
   - API documentation
   - User guides and examples

## Common CSS Patterns

```css
/* Component base styles */
.component-name {
  /* Base styles using VS Code theme variables */
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-panel-border);
}

/* Component states */
.component-name:hover {
  background: var(--vscode-list-hoverBackground);
}

.component-name.active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .component-name {
    /* Mobile-specific styles */
  }
}
```

### Migration from Modular CSS

**⚠️ IMPORTANT**: The project previously attempted to split CSS into modular files (`media/styles/`), but this approach was abandoned due to:

- **Cascade conflicts**: CSS rules were overriding each other unexpectedly
- **Missing dependencies**: Critical styles were separated from their dependencies
- **Loading order issues**: CSS files loaded in wrong order causing layout problems
- **Theme integration problems**: VS Code theme variables didn't work properly across files

If you encounter references to modular CSS files or the `media/styles/` directory in documentation or code, these should be updated to reference the single `vscode.css` file.

## Technical Architecture

### Core Dependencies

- **SQL.js**: Primary database engine for webview compatibility
- **better-sqlite3**: Native SQLite binding for better performance in Node.js context
- **sqlite3**: Legacy SQLite binding for compatibility
- **D3.js**: Advanced data visualization and ER diagram rendering
- **TypeScript**: Primary development language with strict type checking
- **ESBuild**: Fast bundling and compilation for production builds

### Database Engine Architecture

The extension uses a **hybrid database approach** for optimal performance:

1. **SQL.js in Webview**: JavaScript-based SQLite engine that runs in the webview context

   - Enables database operations directly in the browser-like environment
   - Handles encrypted databases through temporary decryption
   - Cross-platform compatibility without native bindings

2. **Native SQLite in Extension Host**: Better performance for backend operations
   - Uses `better-sqlite3` for high-performance database operations
   - Handles SQLCipher encrypted databases with native libraries
   - Provides reliable database file management

### File Structure & Responsibilities

```
src/
├── extension.ts              # Extension entry point, command registration
├── databaseEditorProvider.ts # Custom editor provider, webview management
├── databaseExplorerProvider.ts # Tree view provider for database structure
├── databaseService.ts        # Core database operations and SQL execution
└── test/
    └── extension.test.ts     # Basic extension tests (needs expansion)

media/
├── main.js                   # Webview entry point and app initialization
├── state.js                  # Application state management
├── events.js                 # Event handling and user interactions
├── table.js                  # Table rendering and cell editing
├── diagram.js                # Basic ER diagram functionality
├── enhanced-diagram.js       # Advanced D3.js diagram features
├── resizable-sidebar.js      # UI component for sidebar resizing
├── resizing.js               # Column resizing functionality
├── notifications.js          # User feedback and notification system
├── utils.js                  # Utility functions and helpers
├── dom.js                    # DOM manipulation helpers
└── vscode.css               # Single consolidated stylesheet
```

### Message Passing Architecture

The extension uses VS Code's webview message passing system for communication:

**Extension Host → Webview**:

- `databaseData`: Table data and schema information
- `queryResult`: SQL query execution results
- `cellUpdateSuccess`/`cellUpdateError`: Cell editing feedback
- `connectionStatus`: Database connection state changes

**Webview → Extension Host**:

- `executeQuery`: SQL query execution requests
- `updateCellData`: Cell editing update requests
- `requestTableData`: Table data requests with pagination
- `getDatabaseSchema`: Schema information requests

### Build System

- **ESBuild**: Fast TypeScript compilation and bundling
- **Watch Mode**: Parallel TypeScript checking and ESBuild compilation
- **Production Build**: Minified bundle with source maps disabled
- **Extension Packaging**: VS Code extension packaging with `vsce`

### Testing Architecture

The project uses multiple testing approaches:

1. **VS Code Extension Tests**: Standard VS Code extension test suite

   - Located in `src/test/extension.test.ts`
   - Uses VS Code's test framework with Mocha

2. **Integration Tests**: Custom Node.js scripts for database operations

   - Files like `test_cell_editing.js`, `test_pagination.js`
   - Test real database operations without VS Code dependency
   - Can be run independently with `node test_*.js`

3. **Manual Testing**: Sample databases and SQL files
   - `sample.db`, `test_*.db`: Various test databases
   - `create_encrypted.sql`, `sample.sql`: Database setup scripts

## Testing Strategy

### Test File Organization

The project uses a **multi-layered testing approach** with different types of tests:

1. **Integration Tests** (`test_*.js` files):

   - **Purpose**: Test database operations without VS Code dependency
   - **Examples**: `test_cell_editing.js`, `test_pagination.js`, `test_encrypted.db`
   - **Usage**: `node test_filename.js`
   - **Benefits**: Fast execution, isolated testing, CI/CD friendly

2. **Extension Tests** (`src/test/extension.test.ts`):

   - **Purpose**: Test VS Code extension integration
   - **Framework**: Mocha with VS Code test runner
   - **Usage**: `npm test`
   - **Scope**: Command registration, provider initialization, basic functionality

3. **Manual Testing** (Sample databases):
   - **Purpose**: End-to-end user experience testing
   - **Files**: `sample.db`, `example_large.db`, `test_encrypted.db`
   - **Usage**: Open files in VS Code to test extension behavior

### Test Database Files

```
sample.db              # Basic SQLite database with sample data
test_encrypted.db      # SQLCipher encrypted database for testing
example_large.db       # Large dataset for pagination testing
test_complete_flow.db  # Full feature testing database
test_with_relationships.db # Foreign key relationship testing
```

### Writing New Tests

1. **Integration Tests**:

   ```javascript
   #!/usr/bin/env node
   const sqlite3 = require("sqlite3").verbose();
   const path = require("path");

   function testNewFeature() {
     const dbPath = path.join(__dirname, "test_database.db");
     const db = new sqlite3.Database(dbPath);

     // Test implementation
     db.run("INSERT INTO ...", (err) => {
       if (err) {
         console.error("Test failed:", err);
         return;
       }
       console.log("✅ Test passed");
     });
   }

   testNewFeature();
   ```

2. **Extension Tests**:

   ```typescript
   import * as assert from "assert";
   import * as vscode from "vscode";

   suite("New Feature Tests", () => {
     test("Should handle new functionality", async () => {
       // Test VS Code extension behavior
       const result = await vscode.commands.executeCommand("your-command");
       assert.strictEqual(result, expectedValue);
     });
   });
   ```

## Deployment and Distribution

### Extension Packaging

1. **Build Process**:

   ```bash
   npm run package    # Creates optimized production build
   vsce package      # Creates .vsix extension package
   ```

2. **Package Configuration** (`package.json`):
   - **Publisher**: Update with your VS Code Marketplace publisher ID
   - **Version**: Follow semantic versioning (major.minor.patch)
   - **Repository**: Update GitHub repository URLs
   - **Categories**: Data Science, Visualization, Other

### VS Code Marketplace

1. **Publisher Setup**:

   - Create publisher account at https://marketplace.visualstudio.com/manage
   - Update `package.json` with publisher name
   - Configure repository and homepage URLs

2. **Extension Metadata**:
   - **Display Name**: User-friendly extension name
   - **Description**: Clear, concise feature description
   - **Keywords**: Searchable terms (sqlite, database, viewer, etc.)
   - **Categories**: Proper categorization for discoverability

### Release Management

1. **Version Strategy**:

   - **Major**: Breaking changes or major feature additions
   - **Minor**: New features, backward compatible
   - **Patch**: Bug fixes, minor improvements

2. **Changelog Management**:
   - Update `CHANGELOG.md` with each release
   - Document breaking changes clearly
   - Include migration instructions when needed

### Platform Compatibility

1. **Operating Systems**:

   - **Windows**: Native SQLite bindings support
   - **macOS**: Full functionality with native libraries
   - **Linux**: Tested on Ubuntu, should work on other distributions

2. **VS Code Versions**:
   - **Minimum**: VS Code 1.101.0 (specified in package.json)
   - **Testing**: Test against latest stable and insider builds
   - **API Usage**: Uses stable VS Code APIs only

## Security Considerations

### Database Security

1. **SQLCipher Support**:

   - Encryption keys stored in memory only
   - Temporary decrypted files cleaned up automatically
   - No key persistence or logging

2. **SQL Injection Prevention**:
   - Parameterized queries for user input
   - Input validation and sanitization
   - Limited SQL execution permissions

### Extension Security

1. **File Access**:

   - Only reads user-selected database files
   - No automatic file system scanning
   - Respects VS Code security policies

2. **Network Security**:
   - No external network requests
   - All operations are local-only
   - No telemetry or data collection

### User Privacy

1. **Data Handling**:

   - Database content never leaves user's machine
   - No cloud storage or external services
   - Local processing only

2. **Logging**:
   - Debug information only in development
   - No sensitive data in logs
   - User can disable logging if needed

## Performance Guidelines

### Database Operations

1. **Query Optimization**:

   - Use LIMIT/OFFSET for pagination
   - Create indexes for frequently queried columns
   - Avoid SELECT \* when possible

2. **Connection Management**:
   - Reuse connections when possible
   - Proper connection cleanup
   - Handle connection timeouts gracefully

### UI Performance

1. **Table Rendering**:

   - Virtual scrolling for large datasets
   - Efficient DOM updates
   - Debounced user input handling

2. **Memory Management**:
   - Clean up event listeners
   - Dispose of unused resources
   - Monitor memory usage in large datasets

### Best Practices

1. **Code Organization**:

   - Modular architecture for maintainability
   - Clear separation of concerns
   - Consistent naming conventions

2. **Error Handling**:

   - Graceful degradation on errors
   - User-friendly error messages
   - Comprehensive logging for debugging

3. **Documentation**:
   - Clear code comments
   - API documentation
   - User guides and examples

## Common Implementation Patterns

### Adding New Database Operations

1. **Backend** (`src/databaseService.ts`):

   ```typescript
   async newOperation(params: any): Promise<any> {
     // Implement database operation
     return result;
   }
   ```

2. **Message Handling** (`src/databaseEditorProvider.ts`):

   ```typescript
   case 'newOperation':
     const result = await this.databaseService.newOperation(data);
     webviewPanel.webview.postMessage({ type: 'newOperationResult', data: result });
     break;
   ```

3. **Frontend** (`media/main.js` or relevant module):

   ```javascript
   // Send message to backend
   vscode.postMessage({ type: "newOperation", data: params });

   // Handle response
   window.addEventListener("message", (event) => {
     if (event.data.type === "newOperationResult") {
       // Handle the result
     }
   });
   ```

### Adding New UI Components

1. **Styles** (`media/vscode.css`):

   ```css
   /* Add to appropriate section */
   .new-component {
     background: var(--vscode-editor-background);
     /* ... styles using VS Code theme variables */
   }
   ```

2. **JavaScript** (create new file or add to existing):

   ```javascript
   function renderNewComponent(data) {
     // Component rendering logic
   }

   function initializeNewComponent() {
     // Component initialization
   }
   ```

3. **Integration** (`media/main.js`):
   ```javascript
   // Call initialization function
   if (typeof initializeNewComponent === "function") {
     initializeNewComponent();
   }
   ```
