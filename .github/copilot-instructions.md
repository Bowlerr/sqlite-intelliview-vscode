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
- Webview for UI components
- SQLite/SQLCipher integration via native modules
- Command palette integration
- File system watcher for database changes
