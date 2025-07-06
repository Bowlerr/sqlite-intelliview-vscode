# Context Menu Feature

This document describes the new context menu functionality that allows users to right-click on table cells to access copy operations.

## Features

### Copy Operations

- **Copy Cell**: Copies the value of the selected cell to the clipboard
- **Copy Row**: Copies the entire row as tab-separated values
- **Copy Row JSON**: Copies the entire row as a formatted JSON object with column names as keys
- **Copy Column**: Copies the entire column including the header
- **Copy Table JSON**: Copies the entire table as a JSON array of objects

### Data Operations

- **Delete Row**: Permanently removes the selected row from the database with confirmation dialog

#### Delete Row Confirmation

The delete row feature includes a custom confirmation dialog that:

- Shows a clear title "Confirm Row Deletion"
- Displays the table name in a highlighted info box
- Shows a prominent warning message about the permanent nature of the action
- Presents the complete row data as syntax-highlighted JSON for easy readability
- Uses VS Code-themed styling with danger colors for the delete button
- Can be cancelled by clicking Cancel, pressing ESC, or clicking outside the dialog
- Only proceeds with deletion when the Delete button is explicitly clicked
- Features color-coded JSON syntax highlighting for better data visualization

**Visual Structure:**
- **Title**: "Confirm Row Deletion"
- **Table Info**: Blue-highlighted table name
- **Warning**: Yellow warning box with ⚠️ icon
- **Row Data**: Syntax-highlighted JSON in a code block
- **Actions**: Cancel (gray) and Delete Row (red) buttons

**Note**: The custom confirmation dialog replaces the native `confirm()` function which may not be available in VS Code webviews.

#### Technical Implementation Notes

- **Encryption Key Support**: Delete operations automatically include the current encryption key for encrypted databases
- **State Management**: The context menu has access to the global application state through `getCurrentState()`
- **Message Protocol**: Uses the same message system as other database operations
- **Error Handling**: Includes comprehensive error handling with user-friendly messages

### Data Formats

#### Tab-Separated Values (TSV)

- Row data is copied with tab characters separating values
- Perfect for pasting into spreadsheets or text editors
- Preserves data structure for easy parsing

#### JSON Format

- Row JSON: Single object with column names as keys
- Table JSON: Array of objects representing all rows
- Proper null handling for empty cells
- Formatted with 2-space indentation for readability
- Ideal for API development and data analysis

### JSON Format Examples

#### Copy Row JSON

For a row with employee data:

```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "age": 30,
  "salary": 75000.5,
  "department": "Engineering",
  "hire_date": "2023-01-15",
  "active": 1
}
```

#### Copy Table JSON

For multiple rows:

```json
[
  {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30,
    "salary": 75000.5,
    "department": "Engineering",
    "hire_date": "2023-01-15",
    "active": 1
  },
  {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "age": 28,
    "salary": 82000.75,
    "department": "Marketing",
    "hire_date": "2023-02-20",
    "active": 1
  }
]
```

### User Experience

- Right-click on any table cell to open the context menu
- Context menu appears with smooth animation
- Selected cell is highlighted while context menu is open
- Context menu automatically positions itself to stay within the viewport
- Menu can be closed by clicking elsewhere, pressing Escape, or selecting an item

## Technical Implementation

### Files Added/Modified

1. **`media/context-menu.js`** - New file containing all context menu logic
2. **`media/vscode.css`** - Added context menu styles
3. **`src/databaseEditorProvider.ts`** - Added context-menu.js to script loading
4. **`media/main.js`** - Added context menu initialization

### CSS Classes

#### Context Menu

```css
.context-menu              /* Main menu container */
.context-menu-item         /* Individual menu items */
.context-menu-item:hover   /* Hover state for menu items */
.context-menu-item-danger  /* Delete row item with danger styling */
.context-menu-target       /* Highlighted cell */
.context-menu-separator    /* Menu separator line */
.context-menu.show         /* Menu animation class */
```

#### Confirmation Dialog

```css
.confirm-dialog-overlay     /* Modal overlay backdrop */
/* Modal overlay backdrop */
/* Modal overlay backdrop */
/* Modal overlay backdrop */
.confirm-dialog            /* Dialog container */
.confirm-dialog-message    /* Dialog message text */
.confirm-dialog-buttons    /* Button container */
.confirm-dialog-btn        /* Base button styling */
.confirm-dialog-btn-cancel /* Cancel button */
.confirm-dialog-btn-confirm; /* Delete button with danger styling */
```

### JavaScript Functions

#### Context Menu Functions

```javascript
initializeContextMenu(); // Initialize context menu functionality
showContextMenu(x, y); // Show menu at coordinates
hideContextMenu(); // Hide the menu
copyCellValue(); // Copy selected cell value
copyRowData(); // Copy entire row
copyRowDataAsJSON(); // Copy entire row as JSON
copyColumnData(); // Copy entire column
copyTableDataAsJSON(); // Copy entire table as JSON
```

#### Delete Row Functions

```javascript
deleteRowWithConfirmation(); // Delete row with confirmation dialog
showCustomConfirmDialog(message, onConfirm); // Show custom confirmation dialog
executeRowDeletion(tableName, row); // Execute the actual deletion
handleDeleteSuccess(); // Handle successful deletion
handleDeleteError(); // Handle deletion errors
```

## Usage

### For Users

1. Open a SQLite database in VS Code
2. Navigate to the Data tab
3. Right-click on any cell in a data table
4. Select the desired copy option from the context menu
5. The data will be copied to your clipboard

### For Developers

The context menu is automatically initialized when the extension loads. No additional setup is required.

## Browser Compatibility

The context menu uses modern JavaScript features:

- **Clipboard API**: For copying to clipboard (with fallback for older browsers)
- **CSS Custom Properties**: For VS Code theme integration
- **Event Delegation**: For efficient event handling

## Theme Integration

The context menu is fully integrated with VS Code's theme system:

- Light theme support
- Dark theme support
- High contrast theme support
- Uses VS Code's CSS custom properties for consistent styling

## Accessibility

- Keyboard navigation support (Escape to close)
- Proper ARIA attributes
- Focus management
- High contrast theme compatibility

## Security

- No external dependencies
- All operations are performed locally
- No data is sent to external servers
- Uses VS Code's secure clipboard API

## Testing

Use the test database created by `test_context_menu.js` to verify functionality:

```bash
node test_context_menu.js
```

This creates a test database with sample data to test all context menu features.

## Limitations

- Context menu only appears on data tables, not schema tables
- Copy operations depend on clipboard API availability
- Large datasets may take longer to copy to clipboard

## Future Enhancements

Potential future improvements:

- Export selected data to CSV
- Custom formatting options
- Bulk operations on multiple cells
- Keyboard shortcuts for copy operations
- Integration with VS Code's native context menu system
