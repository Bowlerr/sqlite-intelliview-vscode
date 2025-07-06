# Context Menu Feature

This document describes the new context menu functionality that allows users to right-click on table cells to access copy operations.

## Features

### Copy Operations

- **Copy Cell**: Copies the value of the selected cell to the clipboard
- **Copy Row**: Copies the entire row as tab-separated values
- **Copy Column**: Copies the entire column including the header

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

```css
.context-menu              /* Main menu container */
.context-menu-item         /* Individual menu items */
.context-menu-item:hover   /* Hover state for menu items */
.context-menu-target       /* Highlighted cell */
.context-menu-separator    /* Menu separator line */
.context-menu.show         /* Menu animation class */
```

### JavaScript Functions

```javascript
initializeContextMenu(); // Initialize context menu functionality
showContextMenu(x, y); // Show menu at coordinates
hideContextMenu(); // Hide the menu
copyCellValue(); // Copy selected cell value
copyRowData(); // Copy entire row
copyColumnData(); // Copy entire column
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
