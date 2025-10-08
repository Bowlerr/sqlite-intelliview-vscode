# ⚠️ **BETA WARNING**

> **SQLite IntelliView is currently in BETA on the VS Code Marketplace. Features and stability are evolving. Please report issues and feedback via GitHub.**

# SQLite IntelliView

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/bowlerr.sqlite-intelliview-vscode.svg?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=bowlerr.sqlite-intelliview-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/bowlerr.sqlite-intelliview-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=bowlerr.sqlite-intelliview-vscode)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/bowlerr.sqlite-intelliview-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=bowlerr.sqlite-intelliview-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Modern SQLite/SQLCipher database viewer and editor for VS Code: Monaco-powered queries, ER diagrams, cell editing, encryption, and more.

---


## What’s New in 0.2.16

- Major speed and stability improvements for a smoother experience
- Full offline support: All features work without an internet connection
- New tabbed interface for tables and query results: Open, switch, rename, and drag tabs for multiple tables and query results at once
- Faster, more responsive tabs and table navigation
- Improved drag-and-drop for tabs—no more glitches or stuck states
- Enhanced security: No external network requests or CDN dependencies
- Smaller, more efficient extension package
- Smarter rendering: Fewer unnecessary updates for better performance
- Better error reporting and troubleshooting tools
- Build and packaging process improvements for reliability
- All core libraries (Monaco Editor, SortableJS) now bundled locally
- No breaking changes—fully backwards compatible

---

## Features

- **Custom Editor for SQLite Files**: Open `.db`, `.sqlite`, and `.sqlite3` files in a rich, Monaco-powered editor.
- **Database Explorer**: Tree view of tables and columns, with icons and tooltips.
- **Monaco Query Editor**: Syntax highlighting, autocompletion, and SQL snippets.
- **Cell Editing**: Edit table data directly with real-time updates.
- **Context Menus**: Right-click for copy, navigation, and export actions.
- **Foreign Key Navigation**: Visual indicators and direct navigation for relationships.
- **Advanced Pagination**: Configurable page size for large tables.
- **SQLCipher Support**: Open encrypted databases with a password.
- **Theme Integration**: UI matches your VS Code theme.
- **Keyboard Shortcuts**: Fast access to all major features.

---

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bowlerr.sqlite-intelliview-vscode):

```sh
code --install-extension bowlerr.sqlite-intelliview-vscode
```

Or search for **"SQLite IntelliView"** in the Extensions sidebar.

---

## Usage

### Opening a Database

- **Right-click** any `.db`, `.sqlite`, or `.sqlite3` file in the Explorer and select **"Open SQLite Database"**.
- Or run the command:  
  <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> or search for `Open SQLite Database` in the Command Palette.

### Connecting to Encrypted Databases

- Run **"Connect with SQLCipher Key"** from the Command Palette or use <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>.

### Database Explorer

- View all tables and columns in the **Database Explorer** side panel.
- Click tables to view data and schema.

### Query Editor

- Write and execute SQL queries in the Monaco-powered editor.
- Use <kbd>Ctrl</kbd>/<kbd>Enter</kbd> (or <kbd>Cmd</kbd>/<kbd>Enter</kbd> on Mac) to run queries.

### Export Data

- Run **"Export Data"** from the Command Palette or use <kbd>Ctrl</kbd>/<kbd>Shift</kbd>+<kbd>E</kbd>.

### Context Menus

- Right-click table cells for copy and navigation options.

---

## Commands

| Command ID                                | Title                      | Description                               |
| ----------------------------------------- | -------------------------- | ----------------------------------------- |
| sqlite-intelliview-vscode.openDatabase    | Open SQLite Database       | Open a SQLite/SQLCipher database file     |
| sqlite-intelliview-vscode.connectWithKey  | Connect with SQLCipher Key | Open encrypted database with a password   |
| sqlite-intelliview-vscode.refreshDatabase | Refresh Database           | Refresh the database explorer/tree view   |
| sqlite-intelliview-vscode.exportData      | Export Data                | Export table data (CSV/JSON, coming soon) |

---

## Configuration

| Setting                            | Type    | Default | Description                                              |
| ---------------------------------- | ------- | ------- | -------------------------------------------------------- |
| sqliteIntelliView.defaultPageSize  | number  | 100     | Default number of rows per page in data tables (10–1000) |
| sqliteIntelliView.enableEncryption | boolean | true    | Enable SQLCipher encryption support                      |
| sqliteIntelliView.themeIntegration | boolean | true    | Enable automatic theme integration for the editor UI     |

---

## Keybindings

| Command                    | Windows/Linux | macOS       | When                   |
| -------------------------- | ------------- | ----------- | ---------------------- |
| Open SQLite Database       | Ctrl+Shift+O  | Cmd+Shift+O | explorerViewletVisible |
| Connect with SQLCipher Key | Ctrl+Shift+K  | Cmd+Shift+K |                        |
| Refresh Database           | Ctrl+Shift+R  | Cmd+Shift+R |                        |
| Export Data                | Ctrl+Shift+E  | Cmd+Shift+E |                        |

---

## Example: Command Palette Usage

- **Open SQLite Database**:  
  <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> or search for `Open SQLite Database`.

- **Connect with SQLCipher Key**:  
  <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> or search for `Connect with SQLCipher Key`.

- **Refresh Database**:  
  <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> or search for `Refresh Database`.

- **Export Data**:  
  <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> or search for `Export Data`.

---

## Development

### Prerequisites

- Node.js 20.x or higher
- VS Code 1.101.0 or higher

### Build & Run

```sh
git clone https://github.com/Bowlerr/sqlite-intelliview-vscode.git
cd sqlite-intelliview-vscode
npm install
npm run vendor   # Vendor external libraries (Monaco Editor, etc.)
npm run compile
# For development mode:
npm run watch
```

### Packaging

```sh
npm run package  # Automatically runs vendor + compile + vsce package
```

### Debug Controls

In development, press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> to open debug controls for:
- Adjusting log levels (OFF, ERROR, WARN, INFO, DEBUG, TRACE) 
- Exporting debug logs for troubleshooting
- Real-time debugging feedback

### Test

```sh
npm test
```

### Lint

```sh
npm run lint
```

---

## Troubleshooting

### Debug Mode
If you encounter issues, enable debug logging:
1. Press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> to open debug controls
2. Set debug level to **DEBUG** or **TRACE**
3. Reproduce the issue
4. Click **Export** to save debug logs
5. Share the exported JSON file when reporting issues

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes and version history.

---

## License

MIT License – see [LICENSE](LICENSE) for details.

---

## Credits / Architecture & Dependencies

### Core Libraries
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - High-performance SQLite binding
- [sql.js](https://github.com/sql-js/sql.js) - SQLite compiled to WebAssembly
- [monaco-editor](https://github.com/microsoft/monaco-editor) - Code editor (bundled locally)
- [sortablejs](https://sortablejs.github.io/Sortable/) - Drag-and-drop functionality (bundled locally)  
- [d3](https://d3js.org/) - Data visualization for ER diagrams
- [VS Code API](https://code.visualstudio.com/api) - Extension host integration

---

**Enjoy browsing your SQLite databases with style!** ✨
