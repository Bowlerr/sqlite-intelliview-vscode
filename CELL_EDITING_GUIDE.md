# Cell Editing User Guide

## Overview

The SQLite Viewer now supports direct cell editing, allowing you to modify database values inline without writing SQL commands. This feature provides a spreadsheet-like experience for quick data edits.

**Important**: Cell editing is only available in the **Data tab** when viewing actual table data. Schema information and query results are read-only for data integrity.

## Which Tables Are Editable?

- ✅ **Data Tab**: Tables showing actual database records are fully editable
- ❌ **Schema Tab**: Schema information is read-only (shows table structure)
- ❌ **Query Results**: Query execution results are read-only
- 🔍 **Visual Indicators**: Each table shows "✏️ Editable" or "🔒 Read-only" status

## How to Edit Cells

### Starting Cell Editing

1. **Navigate to Data Tab**: Ensure you're viewing the Data tab (not Schema or Query results)
2. **Double-click Method**: Double-click any cell in the data table to start editing
3. **Keyboard Method**: Select a cell and press `Enter` or `F2` to start editing
4. **Accessibility**: Navigate with Tab/Shift+Tab, then press Enter or F2

### Editing Controls

When editing a cell, you'll see:

- **Text Input**: The current value appears in an editable input field
- **Save Button (✓)**: Click to save your changes
- **Cancel Button (✗)**: Click to discard your changes

### Saving Changes

- **Keyboard**: Press `Enter` to save, `Escape` to cancel
- **Mouse**: Click the save (✓) or cancel (✗) buttons
- **Auto-save**: Click elsewhere to automatically save changes

### Visual Feedback

- **Editing State**: Cell background changes to indicate editing mode
- **Saving State**: Cell briefly shows a saving indicator
- **Success**: Cell briefly highlights green when saved successfully
- **Error**: Cell highlights red if the save fails

## Data Types Supported

- **Text**: Any string value
- **Numbers**: Integers and decimals (automatically detected)
- **NULL**: Empty field or explicit NULL value
- **Dates**: Text format dates (as stored in SQLite)

## Tips and Best Practices

1. **Data Validation**: The extension performs basic type checking
2. **Rollback**: Failed updates keep the original value
3. **Concurrent Edits**: Only one cell can be edited at a time
4. **Large Values**: Long text values are supported
5. **Special Characters**: All Unicode characters are supported

## Keyboard Shortcuts

| Action         | Shortcut            |
| -------------- | ------------------- |
| Start editing  | `Enter` or `F2`     |
| Save changes   | `Enter`             |
| Cancel editing | `Escape`            |
| Navigate cells | `Tab` / `Shift+Tab` |

## Troubleshooting

### Common Issues

1. **Cell won't edit**:
   - Check if you're in the Data tab (not Schema or Query results)
   - Verify the database is not read-only
2. **Save fails**: Verify the table has a rowid or primary key
3. **Type errors**: Ensure the value matches the column type
4. **Permission errors**: Check file permissions on the database

### Error Messages

- **"Failed to update cell"**: Database operation failed
- **"Row not found"**: The row was deleted by another process
- **"Invalid value"**: The value doesn't match the column constraints

## Technical Notes

- Changes are committed immediately to the database
- The extension uses SQLite's `rowid` for row identification
- Updates are performed using prepared statements for security
- All changes are logged to the developer console

## Limitations

- Read-only databases cannot be edited
- Some complex data types may not display correctly
- Very large text values may be truncated in display
- Concurrent edits from multiple instances are not synchronized

## Future Enhancements

- Bulk editing capabilities
- Undo/redo functionality
- Data validation rules
- Custom cell formatters
- Multi-cell selection editing

---

Enjoy the new cell editing feature! For issues or suggestions, please file an issue on the GitHub repository.
