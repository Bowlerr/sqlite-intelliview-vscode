# Change Log

All notable changes to the "SQLite Viewer" extension will be documented in this file.

## [0.2.1] - 2025-07-05

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

## [0.2.0] - 2025-07-05

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

## [0.0.1] - 2025-07-03

### Added

- 🎉 Initial release of SQLite Viewer extension
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

This is the initial release of the SQLite Viewer extension. The extension provides a complete solution for viewing and querying SQLite databases directly within VS Code.

**Key Features:**

- Seamless integration with VS Code's file explorer
- Production-ready UI that matches VS Code's design language
- Full SQLite database support with modern web technologies
- Extensible architecture for future enhancements

**Getting Started:**

1. Install the extension
2. Right-click on any .db file in VS Code
3. Select "Open SQLite Database"
4. Explore your database with the built-in tools

For more information, see the [README](README.md).
