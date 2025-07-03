# SQLite Viewer

A production-ready VS Code extension for viewing SQLite databases with SQLCipher support.

## Features

- 📁 **Custom Editor for SQLite Files**: Automatically opens .db, .sqlite, and .sqlite3 files
- 🔍 **Database Explorer**: Tree view showing tables, columns, and data types
- ⚡ **Query Editor**: Execute custom SQL queries with syntax highlighting
- 📊 **Data Visualization**: View table data in a clean, sortable grid
- 🔐 **SQLCipher Support**: Connect to encrypted databases with keys (coming soon)
- 🎨 **VS Code Theme Integration**: Matches your current VS Code theme perfectly
- 📤 **Export Functionality**: Export table data (coming soon)

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
- Expand tables to see column information
- Primary keys and data types are clearly indicated
- Click on any table to view its data

#### Query Editor
- Write and execute custom SQL queries
- Pre-filled with useful starter queries
- Results are displayed in a clean table format
- Query history and error handling

#### Data Viewer
- Browse table data with pagination
- Sort and filter capabilities
- Row and column count statistics
- Export functionality (coming soon)

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
