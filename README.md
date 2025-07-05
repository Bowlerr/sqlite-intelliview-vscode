# SQLite Viewer

A production-ready VS Code extension for viewing SQLite databases with SQLCipher support and advanced table pagination.

## Features

- 📁 **Custom Editor for SQLite Files**: Automatically opens .db, .sqlite, and .sqlite3 files
- 🔍 **Database Explorer**: Tree view showing tables and their types with smart selection
- ⚡ **Query Editor**: Execute custom SQL queries with helpful examples and shortcuts
- 📊 **Data Visualization**: View table data in a clean, sortable grid with statistics
- 📄 **Advanced Pagination**: Handle large datasets with configurable page sizes (50-1000 records)
- 🔐 **SQLCipher Support**: Connect to encrypted databases with password protection
- 🎨 **VS Code Theme Integration**: Matches your current VS Code theme perfectly
- ⌨️ **Keyboard Shortcuts**: Ctrl/Cmd+Enter to execute, Ctrl/Cmd+K to clear queries
- 🔄 **Real-time Feedback**: Connection status indicators and query execution feedback
- 📋 **Smart Schema Display**: Automatic table info display when selecting tables

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "SQLite Viewer"
4. Install the extension

## Usage

### Opening a Database

1. **Right-click** on any `.db`, `.sqlite`, or `.sqlite3` file in the Explorer
2. Select **"Open SQLite Database"** from the context menu
3. The database will open in a custom editor with full functionality

### Alternative Methods

- Use the Command Palette (Ctrl+Shift+P) and search for "SQLite Viewer: Open Database"
- Simply double-click on a database file to open it with the custom editor

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
- View table schema information
- Row and column count statistics
- Clean, responsive table display

### Keyboard Shortcuts

- **Ctrl/Cmd + Enter**: Execute the current query
- **Ctrl/Cmd + K**: Clear the query editor
- **Escape**: Close any open notifications

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
git clone https://github.com/your-username/sqlite-viewer.git
cd sqlite-viewer

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

- 🐛 [Report Issues](https://github.com/your-username/sqlite-viewer/issues)
- 💡 [Feature Requests](https://github.com/your-username/sqlite-viewer/issues)
- 📖 [Documentation](https://github.com/your-username/sqlite-viewer/wiki)

---

**Enjoy browsing your SQLite databases with style!** ✨
