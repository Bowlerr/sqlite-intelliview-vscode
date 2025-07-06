# Foreign Key Visual Enhancements Guide

## Overview

The SQLite Viewer now provides enhanced visual indicators for foreign key columns, making it easier to understand database relationships at a glance. This feature automatically detects foreign key constraints and applies distinctive styling to help you identify related data.

## Visual Indicators

### Column Headers

- **🔗 Icon**: Foreign key columns display a link icon next to the column name
- **Blue Border**: Left border with a blue gradient to highlight the column
- **Enhanced Tooltip**: Hover to see the referenced table and column information
- **Gradient Background**: Subtle blue gradient background for foreign key headers

### Data Cells

- **Background Tint**: Foreign key cells have a light blue background tint
- **Border Accent**: Left border with blue coloring to maintain visual connection
- **Hover Effects**: Enhanced highlighting when hovering over foreign key cells
- **Tooltip Information**: Cell tooltips show the foreign key relationship details

### Pinned Foreign Key Columns

- **Enhanced Shadows**: Pinned foreign key columns get additional visual emphasis
- **Stronger Borders**: More prominent blue borders for pinned FK columns
- **Consistent Styling**: Maintains foreign key styling even when pinned

## Supported Features

### Automatic Detection

- **PRAGMA Analysis**: Uses SQLite's `PRAGMA foreign_key_list()` to detect relationships
- **Real-time Updates**: Foreign key information is loaded when viewing table data
- **Schema Integration**: Foreign key info is included in table schema displays

### Foreign Key Navigation

- **Right-Click Context Menu**: Right-click any foreign key cell to see navigation options
- **Direct Navigation**: Click "Go to Referenced Row" to navigate to the related table
- **Row Highlighting**: Target rows are highlighted with blue animation after navigation
- **Cross-Table Navigation**: Navigate between related tables seamlessly
- **Value-Based Navigation**: Automatically finds the row with the matching foreign key value

### Accessibility Features

- **High Contrast Support**: Adjusts colors for high contrast mode
- **Reduced Motion**: Respects user's motion preferences
- **Screen Reader Support**: Enhanced ARIA labels for foreign key columns
- **Keyboard Navigation**: Proper focus indicators for foreign key elements

### Cross-Tab Consistency

- **Data Tab**: Full foreign key styling in data tables
- **Schema Tab**: Foreign key information in schema display
- **Query Results**: Foreign key detection in query result tables

## Usage Examples

### Viewing Foreign Keys

1. **Open a database** with foreign key relationships
2. **Select a table** that has foreign key columns
3. **Switch to Data tab** to see the enhanced visual indicators
4. **Hover over FK columns** to see relationship details

### Navigating Foreign Key Relationships

1. **Right-click on a foreign key cell** (cells with blue background and chain icon)
2. **Select "Go to Referenced Row"** from the context menu
3. **The viewer will navigate** to the referenced table
4. **The target row will be highlighted** with blue animation
5. **The highlight will fade** after a few seconds

### Example Navigation Flow

```
books table: author_id = 5
   ↓ (right-click → "Go to authors (ID: 5)")
authors table: id = 5 (highlighted row)
```

### Self-Referencing Foreign Keys

For tables with self-referencing foreign keys (like categories with parent_id):

1. **Right-click on the parent_id cell**
2. **Select "Go to Referenced Row"**
3. **Navigate to the parent category** in the same table
4. **The parent row will be highlighted**

### Schema Information

- Foreign key relationships are shown in the schema tab
- Additional "Foreign Key" column shows referenced table.column
- Visual indicators help identify relationship patterns

## Technical Details

### Database Support

- **SQLite Foreign Keys**: Full support for SQLite foreign key constraints
- **Multiple References**: Handles tables with multiple foreign key columns
- **Self-References**: Supports self-referencing foreign keys
- **Complex Relationships**: Works with multi-table relationship chains

### Performance

- **Lazy Loading**: Foreign key information is loaded only when needed
- **Caching**: Results are cached for improved performance
- **Minimal Overhead**: Efficient detection with minimal performance impact

## Troubleshooting

### Foreign Keys Not Detected

1. **Check Constraints**: Ensure foreign key constraints are properly defined
2. **PRAGMA Check**: Verify `PRAGMA foreign_keys = ON` if using constraints
3. **Table Structure**: Foreign keys must be defined in CREATE TABLE statements

### Visual Issues

1. **Theme Compatibility**: Foreign key styling adapts to VS Code themes
2. **High Contrast**: Special styling for high contrast mode
3. **Color Accessibility**: Uses accessible color combinations

### Common Patterns

#### One-to-Many Relationships

```sql
-- Orders table references customers
CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    FOREIGN KEY (customer_id) REFERENCES customers (id)
);
```

#### Many-to-Many Relationships

```sql
-- Junction table with multiple foreign keys
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER,
    product_id INTEGER,
    FOREIGN KEY (order_id) REFERENCES orders (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
);
```

#### Self-Referencing Relationships

```sql
-- Employees can reference other employees as managers
CREATE TABLE employees (
    id INTEGER PRIMARY KEY,
    manager_id INTEGER,
    FOREIGN KEY (manager_id) REFERENCES employees (id)
);
```

## Best Practices

### Database Design

1. **Clear Naming**: Use descriptive names for foreign key columns (e.g., `customer_id`, `product_id`)
2. **Consistent Patterns**: Follow consistent naming conventions across tables
3. **Proper Indexing**: Create indexes on foreign key columns for performance

### Using the Viewer

1. **Explore Relationships**: Use foreign key visual cues to understand data relationships
2. **Navigate Efficiently**: Follow foreign key references to related tables
3. **Verify Data Integrity**: Use visual indicators to spot potential data issues

## Future Enhancements

- **Click Navigation**: Navigate to referenced tables by clicking foreign key values
- **Relationship Visualization**: Enhanced ER diagram integration
- **Data Validation**: Visual indicators for foreign key constraint violations
- **Bulk Operations**: Foreign key-aware data editing and deletion

---

The foreign key visual enhancements make it easier to understand and work with relational data in your SQLite databases. The distinctive styling helps you quickly identify relationships and navigate complex database structures.
