# Change Log

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

## [Unreleased] - yyyy-mm-dd
