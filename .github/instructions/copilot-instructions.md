# AI Coding Agent Operational Guide for SQLITE_VIEWER

## applyTo: "\*\*"

## Prime Directives

- Always search the entire codebase (all files and symbols) for context before answering or editing.
- Avoid editing more than one file at a time to prevent corruption.
- For large files (>300 lines) or complex changes, start with a detailed edit plan listing all affected functions/sections, order, dependencies, and estimated edit count.
- For major refactors, break work into logical, independently functional chunks and maintain working intermediate states.
- You’re empowered to take initiative: make reasonable assumptions, propose next steps, and proceed without waiting for detailed instructions.

## Project Overview

This is a VS Code extension for viewing and editing SQLite databases (including SQLCipher encryption) with a modern, theme-aware UI, advanced table pagination, cell editing, and ER diagram visualization. The extension uses a hybrid architecture: SQL.js in the webview for browser-based DB ops, and better-sqlite3 in the extension host for native performance and encryption.

## Key Features

- **Database File Support**: `.db`, `.sqlite`, `.sqlite3` with auto-detection and context menu integration.
- **Explorer & Editor**: Tree view, smart selection, real-time updates, inline cell editing, keyboard navigation.
- **Query Editor**: Monaco-based, SQL formatting, autocomplete, keyboard shortcuts, result display.
- **Visualization**: D3.js-powered ER diagrams, pagination, column management, export, and responsive design.

## Architecture & Data Flow

- **src/**: Extension entry (`extension.ts`), custom editor/webview (`databaseEditorProvider.ts`), explorer (`databaseExplorerProvider.ts`), DB ops (`databaseService.ts`).
- **media/**: Webview app entry (`main.js`), state/events/table/diagram/notifications, modular CSS in `css/`.
- **Message Passing**: Uses VS Code's webview messaging. Extension → Webview: `databaseData`, `queryResult`, `cellUpdateSuccess/Error`, `connectionStatus`. Webview → Extension: `executeQuery`, `updateCellData`, `requestTableData`, `getDatabaseSchema`.
- **Testing**: Integration tests (`test/*.js`), extension tests (`src/test/extension.test.ts`), manual with sample DBs (`sample.db`, `example_large.db`, `test_with_relationships.db`, etc).

## Build, Test, and Release

- **Build**: `npm run watch:esbuild` (webview), `npm run watch:tsc` (TypeScript). Both should run in parallel for dev.
- **Test**: `npm test` for extension tests; `node test_*.js` for integration tests.
- **Package**: `npm run package` or `vsce package` for .vsix.
- **Release**: Update `CHANGELOG.md`, follow semantic versioning, and test on all major OSes.

## Styling & UI Patterns

- Modular CSS in `media/css/` (see `30-components/` for UI elements). Always add new styles to the correct file and preserve import order.
- Use VS Code theme variables (`--vscode-*`) for all colors and backgrounds.
- Test all UI in light/dark/high-contrast themes.

## Implementation Patterns

- For new DB ops: add method to `databaseService.ts`, handle in `databaseEditorProvider.ts`, wire to webview via message passing, and handle in `media/main.js`.
- For new UI: add JS module in `media/`, styles in `css/30-components/`, and initialize in `main.js`.

## Security & Privacy

- SQLCipher keys are memory-only; no key persistence/logging.
- All DB ops are local; no network or telemetry.
- Use parameterized queries and input validation to prevent SQL injection.

## Performance

- Use LIMIT/OFFSET for pagination, virtual scrolling for large tables, and clean up event listeners/resources.

## Example: Adding a Database Operation

1. Add async method to `src/databaseService.ts`.
2. Handle new message type in `src/databaseEditorProvider.ts`.
3. Send/receive message in `media/main.js`.

---
