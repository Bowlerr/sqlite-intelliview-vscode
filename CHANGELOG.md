# Change Log


## [Unreleased]

### Added

- 🔄 **WAL (Write-Ahead Logging) Mode Support**: Full support for databases using WAL journaling mode
  - Automatic detection of `.db-wal` and `.db-shm` files
  - Automatic checkpoint of WAL files before opening databases to ensure up-to-date data
  - Real-time monitoring of WAL file changes with automatic refresh
  - Retry logic with exponential backoff for handling locked databases
  - Support for encrypted databases (SQLCipher) with WAL mode
  - Configurable WAL behavior via settings:
    - `sqliteIntelliView.walAutoCheckpoint`: Enable/disable automatic checkpointing (default: true)
    - `sqliteIntelliView.walMonitoring`: Enable/disable WAL file monitoring (default: true)
  - New command: `Checkpoint WAL and Refresh` for manual checkpoint operations
  - Comprehensive error handling for locked databases, permission issues, and corrupted WAL files
  - Cross-platform support (Windows, macOS, Linux)
  - CLI-based checkpoint using `sqlite3` and `sqlcipher` commands for better reliability

- 🔄 **New to Automatic UI Updates for External Changes**: Complete live refresh system
  - **Smart Notifications**: Context-aware messages for different change scenarios
    - "X rows added (on other pages)" when data added beyond current page
    - "X rows removed (from other pages)" when data deleted from other pages
    - Row-level change notifications for visible page updates
    - Total row count shown in all notifications
  - **Automatic Pagination Updates**: Dynamic pagination control regeneration
    - Page count automatically updates when data grows/shrinks
    - New page buttons appear automatically (e.g., page 3, 4, 5, 6)
    - Pagination controls fully functional after dynamic updates
    - Event listeners properly reattached to new pagination elements
  - **Real-time Count Updates**: Total record count updates automatically
    - Header "X RECORDS" display updates immediately
    - Footer "Showing X-Y of Z rows" updates automatically
    - Data attributes synchronized across all UI elements

### Changed

- Database loading now checks for WAL files and checkpoints them before loading
- File watcher now monitors `.db-wal` and `.db-shm` files in addition to main database file
- WAL file changes use 500ms debounce (vs 150ms for main DB) to handle frequent updates
- **Pagination Event Handling**: Enhanced to support dynamic page number buttons
  - Fixed page number buttons (1, 2, 3, 4, etc.) not responding to clicks
  - Added support for `data-page` attribute in pagination button handlers
  - Event listeners now handle both navigation buttons and page number buttons
- **Notification System**: Improved to capture state before updates
  - Notifications now detect total count changes even when no visible rows change
  - Old total count captured before any DOM updates for accurate diff calculation
  - Smart message generation based on visible changes vs total count changes
- **WAL Checkpoint Method**: Switched from native Node.js modules to CLI approach
  - Removed dependency on `better-sqlite3` and `sqlite3` Node.js modules
  - Eliminated ABI version conflicts between VS Code and native modules
  - More reliable cross-platform operation using system SQLite installations
  - Better compatibility with VS Code's Electron environment

### Fixed

- Databases with WAL mode now show up-to-date data instead of stale snapshots
- Extension properly handles databases with active WAL connections from other applications
- Improved handling of read-only databases with WAL mode
- **Pagination Controls**: Fixed pagination buttons becoming unresponsive after updates
  - Page number buttons (1, 2, 3, 4) now properly navigate to selected page
  - Navigation buttons (⏮️ ⏪ ⏩ ⏭️) remain functional after updates
  - Event listeners properly reattached when pagination HTML is regenerated
  - "Go to page" input field maintains functionality after updates
- **Notification Accuracy**: Fixed "no changes detected" when changes occurred on other pages
  - Notifications now correctly detect and report off-page changes
  - Total count changes properly tracked and reported
  - Proper distinction between visible changes and total count changes


## [0.2.15] - 2025-10-08

### 🚀 Major Performance & Stability Improvements

### Added

- 🛠️ **Advanced Debug System**: Complete debugging infrastructure for development and troubleshooting
  - Centralized logging system with 6 configurable levels (OFF, ERROR, WARN, INFO, DEBUG, TRACE)
  - Interactive debug UI panel accessible via <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>
  - Real-time debug level adjustment with persistent settings
  - Debug log export functionality for troubleshooting support
  - Environment detection (automatically reduces logging in production)
  - Log history management with configurable retention (1000 entries)
  - Professional debug output formatting with timestamps and component identification

- 🔒 **Complete Offline Support**: Self-contained extension with no external dependencies
  - Local Monaco Editor bundling (~13MB) for complete offline functionality
  - Local SortableJS vendoring replacing CDN dependencies  
  - Automated library vendoring system with `npm run vendor` command
  - Build process integration ensuring libraries are bundled before packaging
  - Corporate and air-gapped environment compatibility

- 🏗️ **Build System Enhancements**:
  - `vendor-libs.js` script for automated external library management
  - `prepackage` npm script ensuring proper library vendoring
  - Smart file copying with timestamp-based updates
  - Comprehensive library verification and reporting

### Changed

- ⚡ **Smart Rendering System**: Revolutionary performance improvements in UI responsiveness
  - Implemented diff-based rendering with `hasTabsChanged()` and `hasArrayChanged()` functions
  - New `updateState(newState, options)` API with selective rendering control (`renderTabs`, `renderSidebar`)
  - 90% reduction in unnecessary DOM updates during tab operations
  - Intelligent active-tab-only updates vs full structural re-renders
  - Drag operations now use `{ renderTabs: false }` to prevent DOM conflicts

- 🎯 **SortableJS Lifecycle Management**: Eliminated initialization conflicts and race conditions
  - Smart initialization with `initializeSortableJSIfNeeded()` function
  - Debounced initialization (10ms delay) to handle rapid DOM changes
  - Instance validation checking DOM attachment and element matching
  - Proper cleanup with enhanced `destroySortableJS()` error handling
  - Prevention of double-initialization with state flags and timeout management

- 🔐 **Hardened Security**: Enhanced Content Security Policy and external resource management
  - Removed all external CDN references from CSP policy
  - Eliminated network dependencies for core functionality
  - Local-first approach for all critical libraries
  - Enhanced extension security posture for enterprise environments

### Fixed

- 🏷️ **Tab Rename System**: Eliminated stuck edit mode and race conditions
  - Fixed race conditions in `finishRename()` and `cancelRename()` functions
  - Proper state clearing order preventing stuck edit modes
  - Enhanced `shouldRerenderTabs()` logic for rename state consistency  
  - Synchronized rename trigger timing with `setTimeout` for proper state management
  - Eliminated need for manual DOM manipulation to exit rename mode

- 🎛️ **Drag-and-Drop Stability**: Smooth, conflict-free drag operations
  - Fixed SortableJS double-initialization during rapid DOM updates
  - Eliminated render conflicts during drag operations
  - Proper state synchronization between drag events and UI updates
  - Enhanced drag state management with `isDragging` and `preventRerender` flags

- 📦 **Production Optimization**: Clean, efficient production builds
  - Eliminated verbose console output in packaged extension
  - Conditional logging based on environment detection
  - Proper debug control availability in development vs production
  - Optimized package size while maintaining full functionality

### Technical Improvements

- 🏗️ **Architecture**: Enhanced modular design with improved separation of concerns
  - New `media/debug.js` - Centralized logging infrastructure
  - New `media/debug-ui.js` - Interactive debug controls and UI
  - Updated `media/monaco-editor/` - Complete local Monaco Editor runtime
  - Enhanced `vendor-libs.js` - Automated dependency management system

- 📊 **Performance Metrics**:
  - Package size: 7.8 MB (optimized with 184 files)
  - Rendering performance: 90% reduction in unnecessary updates
  - Memory usage: Improved cleanup preventing memory leaks
  - Initialization time: Faster startup with smart library loading

- 🔧 **Developer Experience**:
  - Enhanced build automation with pre-packaging checks
  - Comprehensive debug tooling for development and support
  - Better error reporting and troubleshooting capabilities
  - Improved documentation with `PACKAGING.md` and updated README

### Migration Notes

- **Breaking Changes**: None - all changes are backwards compatible
- **New Features**: Debug controls available via <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>
- **Performance**: Existing functionality significantly faster and more responsive
- **Security**: Enhanced security with no functional impact to users
- **Dependencies**: All external dependencies now bundled locally (no internet required)

This release represents a major maturity milestone for the extension, with significant improvements in stability, performance, security, and developer experience while maintaining full backwards compatibility.

## [0.2.15] - 2025-07-20

### Added

- Foreign key navigation and accessibility improvements:
  - Table cells with foreign key references now use `data-fk-table` and `data-fk-column` attributes instead of parsing the `title` attribute, improving reliability and accessibility for assistive technologies.
  - Foreign key navigation now shows a clear error if information is missing, instead of silently failing.
- Table row highlighting and focus improvements:
  - Foreign key target rows now have improved outline and box-shadow for accessibility and high-contrast themes.
  - Foreign key cells now support keyboard focus with visible outline and background for accessibility.
- Table pagination and data refresh:
  - Table data is now refreshed in-place after query execution, ensuring the latest data is always shown without a full reload.
- Table rendering:
  - Foreign key detection and rendering is more robust, supporting both explicit foreign key metadata and fallback detection from column definitions.

### Changed

- Table and cell rendering now use `data-fk-table` and `data-fk-column` for foreign key info, not the `title` attribute.
- Improved accessibility and keyboard navigation for foreign key cells and target rows.
- Table data refresh logic is now triggered after query execution for more accurate results.

### Fixed

- Fixed duplicate box-shadow on foreign key target row cells.
- Fixed foreign key navigation error handling for missing info.
- Fixed high-contrast mode styles for foreign key cells and target rows.

## [0.2.14] - 2025-07-14

### Added

- Sidebar now automatically maximizes to show the encryption key input when an encrypted database fails to open and a key is required. This improves the user experience for SQLCipher-protected databases and makes key entry more discoverable.
- **Live Refresh:** The viewer now automatically refreshes table data and schema when the underlying database file changes externally. This includes:
  - Real-time detection of changes to the database file (using a file watcher in the extension backend).
  - Automatic refresh of the current table, schema, and tables list in the webview when a change is detected.
  - User notification when a refresh occurs due to an external change.
  - Pagination state is preserved across refreshes, and the UI updates without requiring a manual reload.
  - Improved global state management for pagination and table selection.
- Table view now supports live delta updates when the database file changes externally. The UI will show inserted, updated, and deleted rows in-place without a full reload.
- Table pinning/unpinning now visually resets all sticky styles for unpinned columns, improving accessibility and layout consistency.
- Table rowid is now always shown as '_rowid' in the data grid for clarity.
- Foreign key columns are more clearly indicated in the table header and cell rendering.

### Changed

- Table pagination and state are now managed globally, ensuring consistent navigation and data display after refreshes or table switches.
- Utility functions (such as `formatCellValue` and `showNotification`) are now available globally in the browser context for improved modularity and debugging.
- Improved event handling in the webview: event listeners are now guarded to prevent duplicate registration, and table event listeners are attached only once per table instance.
- Table pagination and search controls are more robust and accessible.
- Table data diffing is now performed in the extension backend, sending only the changed rows to the webview for efficient updates.
- Internal database writes (cell edits, deletes) are now ignored by the file watcher to prevent unnecessary reloads.

### Fixed

- Fixed issues with pagination controls not updating state correctly when changing page size or navigating pages.
- Fixed webview not always updating after an external database change.
- Fixed a bug where pinning/unpinning columns could leave stale sticky styles on headers or cells.
- Fixed a bug where the table would reload completely on every file change, instead of applying only the changed rows.
- Fixed duplicate 'id' column when both 'rowid' and 'id' are present and identical.
- Fixed table event listeners being attached multiple times to the same DOM elements.

## [0.2.13] - 2025-07-09

### ✨ UI/UX Improvements

- Sidebar minimized mode now displays a lock icon (🔒) for encrypted/locked state, styled for visual consistency.
- The connection section and controls have been visually unified with the rest of the sidebar, including button and input alignment.
- Improved sidebar minimized content layout and removed unused sidebar label.
- Updated placeholder and loading messages for disconnected state.

### 🛠️ Refactor: Modular CSS Architecture

- Migrated from a single monolithic CSS file (`media/vscode.css`) to a modular CSS architecture under `media/css/`.
  - Added new CSS files: `reset.css`, `00-variables.css`, `10-base.css`, `20-layout.css`, and all component-specific styles under `media/css/30-components/` (e.g., `buttons.css`, `modals.css`, `sidebar.css`, etc.).
  - Each UI component or area now has its own dedicated CSS file for improved maintainability and scalability.
  - **Removed:** The old `media/vscode.css` file has been deleted.
- Updated the webview HTML generation in `src/databaseEditorProvider.ts` to dynamically include all modular CSS files instead of referencing the old monolithic CSS file.
- This refactor improves code organization, makes it easier to update or extend styles, and reduces the risk of CSS conflicts.

## [0.2.12] - 2025-07-07

### 🐛 Bug Fixes

- Fixed issue where the data tab would open with 1000 results instead of the intended 100.
- Removed duplicate inline table statistics from the Data tab (cleaned up both JavaScript logic and CSS styling).
- Fixed issue where the active tab would automatically switch to the schema tab when selecting a table in the sidebar. Now, the tab remains unchanged and only the data/schema refreshes.

## [0.2.11] - 2025-07-07

### ⚠️ Beta Warning

- Added a prominent beta warning to the top of the README for the VS Code Marketplace.

## [0.2.10] - 2025-07-07

### 🐛 Bug Fixes

- Fixed D3.js loading in webview: D3 is now loaded from the extension's media directory instead of node_modules for reliable packaging and offline support.
- Updated webview HTML and packaging to ensure D3-based diagrams work in all environments.

## [0.2.9] - 2025-07-07

### 🛠️ Packaging Fix

- Added the following to `.vscodeignore` to ensure required sql.js WASM and JS files are included in the extension package:
  - `# Un-ignore sql.js WASM and JS files for packaging`
  - `!node_modules/sql.js/dist/sql-wasm.wasm`
  - `!node_modules/sql.js/dist/sql-wasm.js`
  - `!node_modules/sql.js/dist/sql-asm.js`
  - `!node_modules/sql.js/dist/sql-asm-debug.js`
  - `!node_modules/sql.js/dist/sql-wasm-debug.wasm`
  - `!node_modules/sql.js/dist/sql-wasm-debug.js`

## [0.2.8] - 2025-06-07

### ✨ New Features

- 📝 **Monaco-powered Query Editor**: The SQL query editor now uses Monaco Editor for a modern, full-featured experience
  - Syntax highlighting, autocompletion, and SQL snippets
  - Dynamic table/column name completions (auto-populated from your database)
  - Floating action buttons and keyboard shortcuts (Ctrl+Enter to execute, Ctrl+K to clear, Ctrl+Shift+R to refresh, Ctrl+Alt+R for emergency fix)
  - Results now appear in a modern modal dialog with advanced styling and animations
  - Improved accessibility and keyboard navigation
- 🖼️ **Query Results Modal**: Query results are now displayed in a modal dialog, not inline, for a cleaner and more focused workflow
- 🧑‍💻 **UI/UX Improvements**:
  - Query panel and editor layout updated for better usability
  - CSS updated for modal, query editor, and floating buttons
  - Query panel only visible when active; improved flex layout
- 🛠️ **Backend/Extension Updates**:
  - Extension loads Monaco Editor from CDN and injects the new enhanced query editor
  - Secure CSP updated for Monaco and blob workers
  - Backend now sends all table columns for completions
- 📦 **Dependency Updates**:
  - Added `monaco-editor` to dependencies
- 🧹 **Documentation Cleanup**:
  - Removed legacy guides: `CELL_EDITING_GUIDE.md`, `CONTEXT_MENU_GUIDE.md`, `FOREIGN_KEY_GUIDE.md`

## [0.2.8] - 2025-06-07

### ✨ New Features

- 🔗 **Foreign Key Visualization**: Enhanced visual indicators for foreign key relationships
  - Distinctive blue styling for foreign key columns and cells
  - Link icons (🔗) next to foreign key column names
  - Enhanced tooltips showing referenced table.column information
  - Automatic detection using SQLite PRAGMA foreign_key_list
  - Support for multiple foreign keys per table
  - Visual consistency across Data and Schema tabs
  - Accessibility features with high contrast support
  - Integration with existing table features (sorting, pinning, filtering)

### 🎨 Visual Enhancements

- **Foreign Key Styling**: Blue gradient backgrounds and borders for FK columns
- **Cell Highlighting**: Subtle background tinting for foreign key cells
- **Hover Effects**: Enhanced visual feedback when interacting with FK elements
- **Pinned Column Support**: Foreign key styling maintained when columns are pinned

### 🔧 Technical Improvements

- Enhanced DatabaseService with getForeignKeys() method
- Updated table schema requests to include foreign key information
- Improved table rendering to support foreign key metadata
- Added comprehensive CSS styling for foreign key visual indicators

## [0.2.7] - 2025-06-07

### Added

- 🗑️ **Delete Row Functionality**: Enhanced context menu with row deletion capability
  - **Delete Row**: Right-click any cell to delete the entire row with confirmation dialog
  - **Enhanced Confirmation Dialog**: Clean, structured dialog with table name, warning message, and JSON row data
  - **Syntax Highlighted JSON**: Row data displayed with color-coded JSON syntax highlighting
  - **Custom Dialog Implementation**: VS Code-compatible confirmation dialog replaces native confirm()
  - **Smart Row Identification**: Automatically identifies rows using primary key or all column values
  - **Real-time Database Updates**: Changes are immediately committed to the SQLite database
  - **Visual Feedback**: Success notifications and error handling for deletion operations
  - **Table UI Updates**: Deleted rows are immediately removed from table display
  - **Table Statistics Update**: Row counts and pagination automatically updated after deletion

### Fixed

- 🔧 **Confirmation Dialog Issue**: Fixed delete row confirmation not appearing

  - **Custom Dialog Implementation**: Replaced native confirm() with custom VS Code-themed dialog
  - **Webview Compatibility**: Native confirm() may not work in VS Code webviews
  - **Enhanced UX**: Modal overlay with proper focus management and keyboard support
  - **Themed Styling**: Danger button styling with VS Code color variables
  - **Multiple Close Methods**: Dialog can be closed via Cancel, ESC key, or clicking outside

- 🔧 **Delete Row Backend Communication**: Fixed delete row not executing
  - **Missing Encryption Key**: Added missing encryption key parameter to delete row messages
  - **State Management**: Made getCurrentState function globally available for context menu
  - **Proper Message Format**: Delete row messages now include all required parameters
  - **Backend Compatibility**: Ensures compatibility with encrypted database connections
  - **SQL.js API Usage**: Fixed proper usage of SQL.js prepare/run API for delete operations
  - **Database Persistence**: Ensures deleted rows are properly saved to database file

### Technical Implementation

- 🔧 **Backend Database Operations**: Enhanced database service with deletion capability

  - Added `deleteRow()` method to DatabaseService for row deletion
  - Smart row identification using primary key columns (id, rowid, \_id, pk)
  - Fallback to complete row matching when no primary key is found
  - Proper SQL sanitization and parameterized queries for security
  - Transaction handling and file persistence for reliable operations

- 🎨 **Enhanced Context Menu**: Extended context menu with delete functionality

  - Added "Delete Row" option with danger styling (red color)
  - Custom confirmation dialog with VS Code theme integration
  - Modal overlay with proper focus management and accessibility
  - Multiple dialog close methods (Cancel, ESC, click outside)
  - Confirmation dialog with row details for user verification
  - Proper error handling and user feedback system
  - Integration with existing notification system
  - Smart table name extraction from DOM elements

- 📡 **Message System Extension**: Added delete row communication protocol

  - New `deleteRow` message type for webview-to-extension communication
  - `deleteRowSuccess` and `deleteRowError` response message types
  - Proper error propagation and user feedback
  - Integration with existing message handling architecture
  - Fixed encryption key parameter passing for database connections

- 🔧 **State Management Enhancement**: Improved global function availability
  - Made `getCurrentState` function globally accessible for context menu
  - Added proper window object assignments in state.js
  - Enhanced cross-module communication for encrypted databases
  - Ensures consistent state access across all webview modules

### Enhanced User Experience

- 🎯 **Safe Row Deletion**: Intuitive and secure row deletion workflow
  - Clear confirmation dialog showing table name and first cell value
  - Visual distinction for delete action (red coloring)
  - Immediate visual feedback with row removal from table
  - Error handling for failed deletions with retry capability
  - Automatic table statistics updates for accurate row counts

## [0.2.6] - 2025-06-07

### Added

- 📋 **JSON Copy Operations**: Enhanced context menu with JSON data export
  - **Copy Row JSON**: Right-click any cell to copy the entire row as a formatted JSON object
  - **Copy Table JSON**: Copy the entire table as a JSON array of objects
  - **Structured Data Format**: Column names become JSON keys, maintaining data relationships
  - **Proper Null Handling**: Empty cells are represented as null values in JSON
  - **Formatted Output**: JSON is formatted with proper indentation for readability
  - **Data Type Preservation**: Numbers, strings, and null values are properly typed in JSON

### Technical Implementation

- 🔧 **Enhanced Context Menu**: Extended `media/context-menu.js` with JSON functionality

  - Added `copyRowDataAsJSON()` function for single row JSON export
  - Added `copyTableDataAsJSON()` function for complete table JSON export
  - Proper column header mapping to JSON object keys
  - Null value handling for empty cells
  - JSON formatting with 2-space indentation

- 🎨 **Updated Menu Interface**: Added new menu items with appropriate icons
  - Copy Row JSON option with clipboard icon
  - Copy Table JSON option with chart icon
  - Proper menu item ordering and grouping
  - Updated action handling for new copy operations

### Enhanced User Experience

- 🎯 **Developer-Friendly Data Export**: Perfect for API development and data analysis
  - JSON format ideal for importing into other applications
  - Properly structured data with column names as keys
  - Single row export for focused data analysis
  - Complete table export for comprehensive data dumps
  - Formatted JSON for easy reading and debugging

## [0.2.5] - 2025-06-07

### Added

- 📋 **Context Menu for Table Cells**: Right-click functionality for copy operations
  - **Copy Cell**: Right-click any cell to copy its value to the clipboard
  - **Copy Row**: Copy entire row as tab-separated values (TSV format)
  - **Copy Column**: Copy entire column including header as line-separated values
  - **Smart Positioning**: Context menu automatically adjusts to stay within viewport
  - **Theme Integration**: Fully integrated with VS Code's light, dark, and high contrast themes
  - **Keyboard Support**: Press Escape to close the context menu
  - **Visual Feedback**: Selected cell is highlighted while context menu is open
  - **Smooth Animation**: Context menu appears with fade-in animation

### Technical Implementation

- 🔧 **New Context Menu Module**: `media/context-menu.js`

  - Complete context menu system with event handling
  - Clipboard integration using modern Clipboard API with fallback
  - Cell highlighting and visual feedback system
  - Smart positioning algorithm to prevent menu overflow
  - Keyboard navigation and accessibility support

- 🎨 **Enhanced CSS Styling**: Added context menu styles to `media/vscode.css`

  - Context menu container with proper z-index and positioning
  - Menu items with hover, active, and disabled states
  - Theme-aware styling using VS Code CSS custom properties
  - Smooth animations and transitions
  - High contrast theme compatibility

- 📡 **Integration with Existing System**: Seamless integration with table functionality
  - Context menu only appears on editable data tables
  - Disabled on read-only schema and query result tables
  - Proper cleanup and event management
  - Integration with existing notification system

### Enhanced User Experience

- 🎯 **Intuitive Copy Operations**: Familiar right-click context menu experience

  - Native-feeling context menu with proper OS conventions
  - Clear visual feedback for copy operations
  - Success notifications for completed copy operations
  - Proper error handling for clipboard failures

- 🔄 **Multi-format Support**: Flexible data copying options
  - Cell values copied as plain text
  - Row data copied as TSV for spreadsheet compatibility
  - Column data copied with headers for data analysis
  - Automatic handling of NULL values and special characters

## [0.2.4] - 2025-05-07

### Added

- ✏️ **Cell Editing Functionality**: Complete inline editing system for table data
  - **Interactive Cell Editing**: Double-click any cell to edit its value directly in the table
  - **Multiple Input Methods**: Double-click, Enter key, or F2 key to start editing
  - **Save/Cancel Controls**: Visual save (✓) and cancel (✗) buttons with keyboard shortcuts
  - **Real-time Database Updates**: Changes are immediately committed to the SQLite database
  - **Data Type Handling**: Automatic conversion for strings, numbers, and NULL values
  - **Error Handling**: Visual feedback for failed updates with retry capability
  - **Keyboard Shortcuts**: Enter to save, Escape to cancel editing

### Technical Implementation

- 🔧 **Backend Database Operations**: New database service methods for cell updates

  - Added `updateCellData()` method to DatabaseService for individual cell updates
  - Added `getCellRowId()` method to retrieve row identifiers for updates
  - Implemented message handling for `updateCellData` requests in DatabaseEditorProvider
  - Added success/error response handling for cell update operations

- 🎨 **Frontend User Interface**: Enhanced table rendering with editing controls

  - Modified table cell rendering to include editing controls and data attributes
  - Added CSS styles for editing states, input controls, and visual feedback
  - Implemented cell editing event handlers with proper state management
  - Added visual indicators for editing, saving, and error states

- 📡 **Message System**: Bi-directional communication for cell updates
  - Extended webview message handling to support cell update requests
  - Added `cellUpdateSuccess` and `cellUpdateError` message types
  - Implemented proper error handling and user feedback for failed updates
  - Added state management for tracking editing operations

### Enhanced User Experience

- 🎯 **Intuitive Editing**: Familiar spreadsheet-like editing experience

  - Click-to-edit functionality with immediate visual feedback
  - Automatic focus and text selection when editing starts
  - Blur-to-save behavior with proper conflict resolution
  - Visual highlighting of edited cells with success/error states

- 🔄 **Real-time Updates**: Seamless database synchronization
  - Immediate database commits without page refreshes
  - Optimistic UI updates with rollback on errors
  - Proper handling of concurrent edits and data conflicts
  - Maintains table state and pagination during edits

## [0.2.3] - 2025-05-07

### Added

- 🎯 **Minimized Sidebar Enhancements**: Enhanced sidebar functionality with selected table indicator
  - Added `selected-table-indicator` element to show currently selected table when sidebar is minimized
  - Implemented `updateSelectedTable()` method in ResizableSidebar class to update indicator
  - Added `updateSelectedTableSafe()` global function for safe cross-module communication
  - Visual indicator shows table name vertically in minimized sidebar with hover effects
  - Empty state styling for when no table is selected

### Changed

- 🔧 **Improved Cross-Module Communication**: Better integration between sidebar and table selection
  - Updated `selectTable()` function in main.js to communicate with sidebar
  - Added fallback handling for when sidebar isn't ready yet
  - Enhanced event handling in events.js for table selection updates
  - Better state management for selected table across all modules

### Technical Improvements

- 🏗️ **Sidebar Architecture**: Enhanced minimized sidebar content structure
  - Added `minimized-content` div to HTML template in databaseEditorProvider.ts
  - Improved CSS styling for minimized sidebar with proper visibility controls
  - Better tooltip positioning and styling for selected table indicator
  - Consistent visual feedback and hover states

## [0.2.2] - 2025-05-07

### Refactored

- 🧹 **Diagram System Cleanup**: Removed legacy diagram implementations
  - Removed all Mermaid.js references and unused code
  - Removed Vis.js network diagram implementation
  - Removed Panzoom library dependencies
  - Consolidated to D3.js-only implementation for better performance
  - Simplified diagram manager initialization and function exports
  - Reduced codebase size by ~60 lines of unused code
  - Cleaner API with single diagram system focus

### Technical Improvements

- 📦 **Code Organization**: Streamlined diagram modules
  - Unified `initializeDiagram()` function (removed legacy wrapper)
  - Removed unused functions: `prepareVisData()`, `createTableLabel()`, `createTableTooltip()`, `sanitizeTableName()`, `addMermaidInteractivity()`, `addVisControls()`
  - Updated comments to reflect D3-only implementation
  - Improved maintainability with single diagram system

## [0.2.1] - 2025-05-07

### Added

- 🎨 **Enhanced Loading Animation**: New modern animated dots spinner
  - Replaced old spinning wheel with smooth wave-like pulse animation
  - Three dots with staggered timing for professional appearance
  - Smaller footprint (80px x 16px) for better visual balance
  - Improved spacing between animation and loading text (2.5rem gap)

### Changed

- 🚨 **Smart Error Handling**: Improved error state management

  - Loading animation no longer shows for connection errors or encrypted databases
  - Connection state checking before showing loading spinner
  - Specific error messages for different failure scenarios
  - Professional error state styling with animations and proper positioning

- 🎯 **UI Layout Improvements**: Enhanced empty and error states

  - Higher positioning using `justify-content: flex-start` with top padding
  - Larger icons (4em) and text (1.4em titles, 1em descriptions) for better visibility
  - Increased content width and improved spacing throughout
  - Consistent positioning across all states (empty, loading, error)
  - Responsive design for different screen sizes

- 🔧 **Code Cleanup**: Removed legacy features and improved maintainability
  - Removed old multi-engine diagram switching functionality
  - Simplified error states to show only "Try Again" button
  - Cleaned up duplicate CSS definitions and orphaned rules
  - Removed auto-generation of diagrams when switching to ER Diagram tab
  - Fixed "Try Again" button functionality with proper event handlers

### Fixed

- ✅ **Button Functionality**: Resolved "Try Again" button not working

  - Proper event listener attachment after HTML insertion
  - Added defensive programming with function existence checks
  - Better debugging and error reporting

- 🎨 **CSS Consistency**: Cleaned up styling conflicts
  - Removed duplicate loading spinner definitions
  - Unified error and empty state styling
  - Fixed CSS syntax errors and improved organization

### Technical Improvements

- Enhanced state management for connection errors
- Improved message handling between frontend and backend
- Better separation of concerns in diagram generation
- Responsive design improvements for mobile devices

## [0.2.0] - 2025-05-07

### Added

- 📄 **Table Pagination**: Complete pagination system for large datasets
  - Page size selection (50, 100, 200, 500, 1000 records)
  - Navigation controls (First, Previous, Next, Last)
  - Direct page number input with go button
  - Total row count display for accurate pagination
  - Professional VS Code-themed pagination styling
  - Responsive design for smaller screens
  - Backend SQL pagination with LIMIT/OFFSET queries

### Changed

- 🏗️ **Modular Architecture**: Refactored JavaScript codebase for better maintainability
  - Split main.js into focused modules:
    - `state.js`: Application state management
    - `dom.js`: DOM element access and manipulation
    - `notifications.js`: Notification system
    - `utils.js`: Utility functions
    - `resizing.js`: Table and UI resizing logic
    - `events.js`: Event handling and listeners
    - `table.js`: Table creation and management
  - Improved code organization and separation of concerns
  - Enhanced testability and debugging capabilities

### Dependencies

- Added `better-sqlite3` for testing and development
- Updated build configuration for new modular structure

### Technical Improvements

- Enhanced database service with pagination support
- Improved message handling between frontend and backend
- Better error handling and state management
- Optimized table rendering for large datasets

## [0.0.1] - 2025-05-07

### Added

- 🎉 Initial release of the SQLite IntelliView extension
- 📁 Custom editor for .db, .sqlite, and .sqlite3 files
- 🔍 Database Explorer tree view with tables
- ⚡ SQL Query editor with execution capabilities
- 📊 Data viewer for browsing table contents and schema
- 🎨 Full VS Code theme integration
- ⌨️ Keyboard shortcuts for common actions
- 🏗️ Modern TypeScript architecture with esbuild bundling
- 📦 sql.js integration for SQLite database support
- 🔧 Command palette integration
- 📝 Context menu integration for database files

### Features

- View database schema and table structure
- Execute custom SQL queries with results display
- Browse table data with clean grid interface
- Responsive UI that matches VS Code design language
- Support for multiple SQLite file extensions (.db, .sqlite, .sqlite3)
- Simple, focused interface for database exploration
- Connection status indicators and error handling
- Query history with automatic saving

### Design Philosophy

- **Simple and Clean**: Focused on core database viewing functionality
- **VS Code Native**: Seamlessly integrates with VS Code's design language
- **Performance First**: Fast loading and responsive interactions
- **Keyboard Friendly**: Full keyboard navigation support

### Technical

- Built with TypeScript for type safety
- Uses esbuild for fast compilation and bundling
- Webview-based UI with modern CSS styling
- VS Code API integration for native look and feel
- SQLite support via sql.js WebAssembly module

### Coming Soon

- 🔐 SQLCipher encryption support
- 📤 Data export functionality
- 🔍 Advanced query features
- 📊 Data visualization charts
- ⚡ Performance optimizations

---

## Release Notes

### Version 0.0.1

This is the initial release of the SQLite IntelliView extension. The extension provides a complete solution for viewing and querying SQLite databases directly within VS Code.

**Key Features:**

- Seamless integration with VS Code's file explorer
- UI that matches VS Code's design language
- Full SQLite database support with modern web technologies
- Extensible architecture for future enhancements

**Getting Started:**

1. Install the extension
2. Right-click on any .db file in VS Code
3. Select "Open SQLite Database"
4. Explore your database with the built-in tools

For more information, see the [README](README.md).
