# Copilot Instructions

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a VS Code extension project. Please use the get_vscode_api with a query as input to fetch the latest VS Code API references.

## Project Context

This is a production-ready VS Code extension for viewing SQLite databases with SQLCipher support. The extension should:

- Provide a modern UI that matches VS Code's design language
- Support SQLite database file viewing (.db files)
- Support SQLCipher encrypted databases with key input
- Offer table browsing, query execution, and data visualization
- Follow VS Code extension best practices and patterns
- Use TypeScript for type safety and better development experience
- Bundle with esbuild for optimal performance

## Key Features

- Custom editor for .db files
- Tree view for database schema exploration
- Query editor with syntax highlighting
- Results grid with sorting/filtering
- SQLCipher key management
- Export functionality
- Modern webview-based UI

## Architecture

- Main extension in TypeScript
- Webview for UI components with modular JavaScript structure
- SQLite/SQLCipher integration via native modules
- Command palette integration
- File system watcher for database changes

## Media Structure

The webview UI is organized into modular JavaScript files:

- `main.js` - Main entry point that includes all module code inline for webview bundling
- `state.js` - State management module (application state, persistence)
- `dom.js` - DOM utilities and element management
- `notifications.js` - Notification system and help features
- `utils.js` - Utility functions (formatting, validation, etc.)
- `resizing.js` - UI resizing and layout management
- `table.js` - Advanced table features (search, sort, export, pin, resize columns)
- `events.js` - Event handling and message passing
- `reset.css` - CSS reset styles
- `vscode.css` - VS Code theme-compatible styles

## Development Notes

- All JavaScript modules are designed to be included inline in `main.js` for webview compatibility
- The extension uses a single bundled JavaScript file approach for the webview
- Modules are organized by functionality for maintainability
- State management is centralized in the state module
- Table features include advanced functionality like column pinning, search, sorting, and data export
- Event handling is separated for better organization and debugging

## Working with the Modular Structure

When making changes to the webview functionality:

1. **Edit individual module files** (state.js, dom.js, etc.) for specific functionality
2. **Update main.js** to include any new module code inline
3. **Maintain module boundaries** - keep related functionality grouped together
4. **Use proper error handling** - wrap operations in try/catch blocks
5. **Add debug logging** - use console.log for debugging webview issues

## Module Responsibilities

- **state.js**: Manages application state, persistence, and state updates
- **dom.js**: DOM element references, tab switching, and UI utilities
- **notifications.js**: User notifications, help system, and UI messages
- **utils.js**: Pure utility functions for formatting, validation, and data processing
- **resizing.js**: Window resizing, panel management, and layout adjustments
- **table.js**: Advanced table features - search, sort, export, column management
- **events.js**: Event listeners, message handling, and user interactions

## Common Patterns

- Use TypeScript-style JSDoc comments for better IntelliSense
- Null-check DOM elements before use
- Use the global `vscode` API for extension communication
- Cache DOM elements in the domElements object
- Use the state management functions for persistent data
- Handle errors gracefully with user-friendly messages

## Extension Details

- **Name**: SQLite Viewer
- **Version**: 0.0.1
- **Publisher**: Production-ready VS Code extension
- **VS Code Engine**: ^1.101.0
- **License**: MIT
- **Categories**: Data Science, Visualization, Other

## File Support

The extension supports the following SQLite file extensions:

- `.db` - Standard SQLite database files
- `.sqlite` - SQLite database files
- `.sqlite3` - SQLite3 database files

## Commands

- `sqlite-viewer.openDatabase` - Open SQLite Database
- `sqlite-viewer.connectWithKey` - Connect with SQLCipher Key
- `sqlite-viewer.refreshDatabase` - Refresh Database
- `sqlite-viewer.exportData` - Export Data

## Dependencies

**Runtime Dependencies:**

- `sql.js` (^1.13.0) - SQLite compiled to JavaScript
- `sqlite3` (^5.1.7) - Node.js SQLite3 bindings

**Development Dependencies:**

- `esbuild` (^0.25.3) - Fast JavaScript bundler
- `typescript` (^5.8.3) - TypeScript compiler
- `eslint` (^9.25.1) - JavaScript/TypeScript linter
- `npm-run-all` (^4.1.5) - Run multiple npm scripts
- Various VS Code testing and type definition packages

## Build System

- **Primary Build**: esbuild for fast bundling and minification
- **Type Checking**: TypeScript compiler with strict mode enabled
- **Linting**: ESLint with TypeScript parser
- **Watch Mode**: Parallel watching of TypeScript and esbuild
- **Production**: Minified bundle with no source maps
- **Development**: Source maps enabled for debugging

## Scripts

- `npm run compile` - Full build with type checking and linting
- `npm run watch` - Development mode with file watching
- `npm run package` - Production build
- `npm run lint` - Run ESLint
- `npm run test` - Run extension tests

## Source Structure

- `src/extension.ts` - Main extension entry point
- `src/databaseEditorProvider.ts` - Custom editor provider for .db files
- `src/databaseExplorerProvider.ts` - Tree view provider for database schema
- `src/databaseService.ts` - SQLite database operations and queries
- `src/test/` - Extension test suite
- `media/` - Webview assets (HTML, CSS, JavaScript modules)
- `dist/` - Compiled output directory

## Configuration

- **TypeScript**: ES2022 target, Node16 modules, strict type checking
- **ESBuild**: CommonJS format, Node.js platform, VS Code external
- **ESLint**: TypeScript parser with recommended rules

## VS Code Integration

The extension integrates deeply with VS Code through:

- **Custom Editor**: Registers as default editor for SQLite files
- **Explorer Context Menu**: Right-click options for database files
- **Database Explorer View**: Tree view in the Explorer panel
- **Command Palette**: All commands available via Ctrl+Shift+P
- **Theme Integration**: Automatically matches VS Code's active theme
- **Keyboard Shortcuts**:
  - Ctrl/Cmd+Enter: Execute query
  - Ctrl/Cmd+K: Clear query
  - Ctrl/Cmd+F: Search in table results
  - Escape: Close notifications
  - ?: Show help (help button in header)

## Error Handling

The extension implements comprehensive error handling:

- **Database Connection**: Graceful handling of connection failures
- **SQLCipher Decryption**: User-friendly error messages for wrong keys
- **Query Execution**: Syntax error reporting with helpful suggestions
- **File Operations**: Proper error handling for file access issues
- **WebView Communication**: Robust message passing between extension and UI

## Performance Considerations

- **Lazy Loading**: Database schema and data loaded on demand
- **Caching**: Table schemas cached to reduce database queries
- **Pagination**: Large result sets handled with pagination
- **Debouncing**: Search and filter operations debounced for performance
- **Memory Management**: Proper cleanup of database connections

## Testing

The extension includes:

- **Unit Tests**: Core functionality testing
- **Integration Tests**: Extension activation and command testing
- **WebView Tests**: UI component testing
- **Database Tests**: SQLite operations testing
- **VS Code Test Runner**: Integrated with VS Code test framework

## Debugging

For development and debugging:

- **Console Logging**: Extensive logging in both extension and webview
- **Source Maps**: Available in development builds
- **VS Code DevTools**: WebView debugging support
- **Error Reporting**: Detailed error messages with stack traces
- **State Inspection**: Global objects available for debugging

## Advanced Table Features

The extension includes comprehensive table functionality:

### 🔍 **Advanced Search & Filtering**

- **Global Search**: Search across all table data with highlighted results
- **Column Filtering**: Filter individual columns by specific values
- **Real-time Results**: See filtered row counts instantly
- **Keyboard Shortcut**: `Ctrl+F` / `Cmd+F` to focus search

### 📌 **Column Management**

- **Column Pinning**: Keep key columns visible while scrolling with 📌 button
- **Column Resizing**: Drag resize handles to adjust column widths
- **Visual Indicators**: Pinned columns have distinctive styling
- **Sticky Positioning**: Pinned columns stay in place during horizontal scroll

### 🔄 **Advanced Sorting**

- **Click to Sort**: Click any column header to sort data
- **Multiple Sort States**: None → Ascending → Descending → None
- **Smart Sorting**: Handles text, numbers, and NULL values correctly
- **Visual Indicators**: Sort direction arrows (↑/↓) in headers

### 💾 **Data Export**

- **CSV Export**: Export visible/filtered data to CSV format
- **Automatic Download**: Files download directly to Downloads folder
- **Preserves Filtering**: Only exports currently visible rows
- **Proper Escaping**: Handles commas, quotes, and special characters

### 📊 **Enhanced Display**

- **Row Statistics**: Show visible vs total rows
- **Column Information**: Display column counts
- **Hover Highlighting**: Better row/column highlighting
- **NULL Value Styling**: Distinctive styling for NULL values
- **Scrollable Containers**: Better handling of large datasets
