# SQLite IntelliView

A production-ready VS Code extension for viewing SQLite databases with SQLCipher support and advanced table pagination.

## Features

- 📁 **Custom Editor for SQLite Files**: Automatically opens .db, .sqlite, and .sqlite3 files
- 🔍 **Database Explorer**: Tree view showing tables and their types with smart selection
- ⚡ **Query Editor (Now Monaco-powered!)**: Execute custom SQL queries with full Monaco Editor integration
  - Syntax highlighting, autocompletion, and SQL snippets
  - Dynamic table/column name completions
  - Floating action buttons and keyboard shortcuts (Ctrl+Enter to execute, Ctrl+K to clear, Ctrl+Shift+R to refresh editor)
  - Results now appear in a modern modal dialog
- 📊 **Data Visualization**: View table data in a clean, sortable grid with statistics
- ✏️ **Cell Editing**: Edit database cells directly in the table view with real-time updates
- 📋 **Context Menu**: Right-click cells for copy operations and foreign key navigation
- 🔗 **Foreign Key Navigation**: Click to navigate directly to referenced rows in related tables
- 📄 **Advanced Pagination**: Handle large datasets with configurable page sizes (50-1000 records)
- 🔒 **SQLCipher Support**: Connect to encrypted databases with password protection
- 🎨 **VS Code Theme Integration**: Matches your current VS Code theme perfectly
- ⌨️ **Keyboard Shortcuts**: Ctrl/Cmd+Enter to execute, Ctrl/Cmd+K to clear queries, Ctrl+Shift+R to refresh editor
- 🔄 **Real-time Feedback**: Connection status indicators and query execution feedback
- 📑 **Smart Schema Display**: Automatic table info display when selecting tables
- 🔗 **Foreign Key Visualization**: Visual indicators for foreign key relationships with distinctive styling

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "SQLite IntelliView"
4. Install the extension

## Usage

### Opening a Database

1. **Right-click** on any `.db`, `.sqlite`, or `.sqlite3` file in the Explorer
2. Select **"Open SQLite Database"** from the context menu
3. The database will open in a custom editor with full functionality

### Query Editor (Monaco)

- Write and execute custom SQL queries in a full Monaco Editor instance
- Autocompletion for SQL keywords, table names, and column names
- Use provided SQL snippets for common operations
- Results are displayed in a modern modal dialog with statistics
- Keyboard shortcuts:
  - **Ctrl/Cmd + Enter**: Execute query
  - **Ctrl/Cmd + K**: Clear editor
  - **Ctrl+Shift+R**: Refresh editor if unresponsive
  - **Ctrl+Alt+R**: Emergency fix for editor

### Features Overview

#### Database Explorer

- View all tables and views in your database
- Click on any table to view its data and schema
- Tables are highlighted when selected

#### Table Pagination

- **Page Size Selection**: Choose from 50, 100, 200, 500, or 1000 records per page
- **Navigation Controls**: First, Previous, Next, Last buttons for easy navigation
- **Direct Navigation**: Enter a specific page number and jump directly to it
- **Total Count Display**: See total rows and current page range
- **Responsive Design**: Pagination controls adapt to smaller screens
- **Performance Optimized**: Only loads the current page from the database

#### Query Editor

- Write and execute custom SQL queries
- Pre-filled with useful starter queries
- Results are displayed in a clean table format
- Query history automatically saved

#### Data Viewer

- Browse table data with automatic loading
- **Edit Cells**: Double-click any cell in the Data tab to edit its value inline
- **Cell Editing Controls**: Use Enter to save, Escape to cancel, or click the save/cancel buttons
- **Real-time Updates**: Changes are immediately saved to the database
- **Data Type Handling**: Automatic conversion for numbers, strings, and NULL values
- **Read-only Protection**: Schema and query result tables are protected from editing
- **Context Menu**: Right-click any cell to access copy operations (Copy Cell, Copy Row, Copy Row JSON, Copy Column, Copy Table JSON)
- View table schema information
- Row and column count statistics
- Clean, responsive table display

#### Cell Editing

- **Data Tables Only**: Cell editing is only available in the Data tab, not Schema or Query results
- **Double-click** any cell in a data table to start editing
- **Keyboard Shortcuts**: Press Enter or F2 to start editing, Enter to save, Escape to cancel
- **Input Controls**: Type directly in the cell with save (✓) and cancel (✗) buttons
- **Auto-save**: Changes are automatically saved when you click elsewhere or press Enter
- **Data Types**: Supports text, numbers, and NULL values with automatic type detection
- **Error Handling**: Visual feedback for failed updates with retry capability
- **Real-time Updates**: Changes are immediately reflected in the database
- **Visual Indicators**: Tables show "✏️ Editable" or "🔒 Read-only" status

#### Context Menu

- **Right-click** any cell in a data table to open the context menu
- **Copy Cell**: Copies the selected cell value to clipboard
- **Copy Row**: Copies the entire row as tab-separated values
- **Copy Row JSON**: Copies the entire row as a formatted JSON object
- **Copy Column**: Copies the entire column including header
- **Copy Table JSON**: Copies the entire table as a JSON array of objects
- **Go to Referenced Row**: Navigate to the related table row (foreign key cells only)
- **Smart Positioning**: Menu automatically adjusts to stay within viewport
- **Theme Integration**: Matches VS Code's current theme
- **Keyboard Support**: Press Escape to close the menu

#### Foreign Key Navigation

- **Visual Indicators**: Foreign key columns have blue headers with chain icons (🔗)
- **Right-click Navigation**: Right-click any foreign key cell to see navigation options
- **Direct Navigation**: Click "Go to Referenced Row" to jump to the related table
- **Row Highlighting**: Target rows are highlighted with blue animation after navigation
- **Cross-table Support**: Works across all tables with foreign key relationships
- **Self-referencing**: Supports self-referencing foreign keys (e.g., parent-child relationships)

### Keyboard Shortcuts

- **Ctrl/Cmd + Enter**: Execute the current query
- **Ctrl/Cmd + K**: Clear the query editor
- **Ctrl+Shift+R**: Refresh the editor if unresponsive
- **Ctrl+Alt+R**: Emergency fix for the editor
- **Double-click**: Edit a data table cell (Data tab only)
- **Enter or F2**: Start editing a selected cell (Data tab only)
- **Enter**: Save cell changes
- **Escape**: Cancel cell editing, close notifications, or close context menu
- **Right-click**: Open context menu on table cells for copy operations and foreign key navigation

### SQLCipher Support

For encrypted databases, use the **"Connect with SQLCipher Key"** command to enter your encryption key.

## Sample Database

To test the extension, you can create a sample database:

1. Install SQLite command line tool
2. Run the provided `sample.sql` script:
   ```bash
   sqlite3 sample.db < sample.sql
   ```
3. Open the resulting `sample.db` file in VS Code

## Development

### Prerequisites

- Node.js 20.x or higher
- VS Code 1.101.0 or higher

### Building from Source

```bash
# Clone the repository
git clone https://github.com/Bowlerr/sqlite-intelliview-vscode.git
cd sqlite-intelliview-vscode

# Install dependencies
npm install

# Compile the extension
npm run compile

# Run in development mode
npm run watch
```

### Testing

```bash
# Run tests
npm test

# Package the extension
npm run package
```

## Architecture

- **TypeScript**: Full type safety and modern JavaScript features
- **esbuild**: Fast compilation and bundling
- **sql.js**: SQLite engine compiled to WebAssembly for browser compatibility
- **VS Code API**: Native integration with VS Code's theming and UI components

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes and version history.

## Support

- 🐛 [Report Issues](https://github.com/Bowlerr/sqlite-intelliview-vscode/issues)
- 💡 [Feature Requests](https://github.com/Bowlerr/sqlite-intelliview-vscode/issues)
- 📖 [Documentation](https://github.com/Bowlerr/sqlite-intelliview-vscode/wiki)

---

**Enjoy browsing your SQLite databases with style!** ✨
