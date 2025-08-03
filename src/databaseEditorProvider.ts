import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseService } from './databaseService';
import { DatabaseWatcher } from './databaseWatcher';

export class DatabaseEditorProvider implements vscode.CustomReadonlyEditorProvider {
    private static readonly viewType = 'sqlite-intelliview-vscode.databaseEditor';
    private activeConnections: Map<string, DatabaseService> = new Map();
    /** Track last sync state per database for delta updates */
    private lastSync: Map<string, { table: string; since: string; page: number; pageSize: number; lastPageData?: any[][] }> = new Map();
    private databaseWatcher: DatabaseWatcher = new DatabaseWatcher();
    private webviewPanels: Map<string, vscode.WebviewPanel> = new Map();
    /** cache full pages keyed by `${db}:${table}:${page}:${pageSize}` → QueryResult.values */
    private lastPageCache = new Map<string, any[][]>();

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new DatabaseEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            DatabaseEditorProvider.viewType, 
            provider,
            {
                // This tells VS Code we can handle binary files
                supportsMultipleEditorsPerDocument: false,
                webviewOptions: {
                    retainContextWhenHidden: true,
                }
            }
        );
        return providerRegistration;
    }

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    public async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        // Add file watcher for this database file using DatabaseWatcher
        this.databaseWatcher.addWatcher(uri.fsPath, () => {
            // On external change, close all in-memory connections for this file
            this.handleExternalDatabaseChange(uri.fsPath);
            // Notify the webview for this file if open
            const panel = this.webviewPanels.get(uri.fsPath);
            if (panel) {
                panel.webview.postMessage({
                    type: 'externalDatabaseChanged',
                    databasePath: uri.fsPath
                });
            }
        });
        return {
            uri,
            dispose: () => {
                this.closeConnection(uri.fsPath);
                this.databaseWatcher.removeWatcher(uri.fsPath);
                this.webviewPanels.delete(uri.fsPath);
            }
        };
    }

    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

        // Handle database file loading
        function updateWebview() {
            webviewPanel.webview.postMessage({
                type: 'update',
                databasePath: document.uri.fsPath
            });
        }

        // Set the initial content
        try {
            updateWebview();
        } catch (error) {
            // Post error to webview so it can react (e.g., maximize sidebar)
            webviewPanel.webview.postMessage({
                type: 'databaseLoadError',
                error: (error && typeof error === 'object' && 'message' in error) ? (error as any).message : String(error)
            });
        }

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(e => {
            console.log(`[onDidReceiveMessage] Received message type: ${e.type}`, e);
            
            switch (e.type) {
                case 'requestDatabaseInfo':
                    this.handleDatabaseInfoRequest(webviewPanel, document.uri.fsPath, e.key);
                    return;
                case 'executeQuery':
                    this.handleQueryExecution(webviewPanel, document.uri.fsPath, e.query, e.key);
                    return;
                case 'getTableSchema':
                    this.handleTableSchemaRequest(webviewPanel, document.uri.fsPath, e.tableName, e.key);
                    return;
                case 'getTableData':
                    this.handleTableDataRequest(webviewPanel, document.uri.fsPath, e.tableName, e.key, e.page, e.pageSize, true);
                    return;
                case 'updateCellData':
                    this.handleCellUpdateRequest(webviewPanel, document.uri.fsPath, e.tableName, e.rowIndex, e.columnName, e.newValue, e.key);
                    return;
                case 'deleteRow':
                    console.log(`[onDidReceiveMessage] Processing deleteRow message`);
                    this.handleDeleteRowRequest(webviewPanel, document.uri.fsPath, e.tableName, e.rowId, e.key);
                    return;
                case 'generateERDiagram':
                    this.handleERDiagramRequest(webviewPanel, document.uri.fsPath, e.key);
                    return;
            }
        });

        // Track the webview panel for this document
        this.webviewPanels.set(document.uri.fsPath, webviewPanel);

        // Handle webview disposal
        webviewPanel.onDidDispose(() => {
            this.closeConnection(document.uri.fsPath);
            this.webviewPanels.delete(document.uri.fsPath);
        });
    }

    private getHtmlForWebview(webview: vscode.Webview, uri: vscode.Uri): string {
        // Local path to main script run in the webview
        const scriptPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
        const cssFiles = [
        'css/reset.css',
        'css/00-variables.css',
        'css/10-base.css',
        'css/20-layout.css',
        // core components
        'css/30-components/buttons.css',
        'css/30-components/confirm-dialog.css',
        'css/30-components/connection.css',
        'css/30-components/content-area.css',
        'css/30-components/context-menu.css',
        'css/30-components/diagram.css',
        'css/30-components/empty-state.css',
        'css/30-components/form-inputs.css',
        'css/30-components/header.css',
        'css/30-components/loading.css',
        'css/30-components/modals.css',
        'css/30-components/notifications.css',
        'css/30-components/query-editor.css',
        'css/30-components/section.css',
        'css/30-components/sidebar.css',
        'css/30-components/tables-list.css',
        'css/30-components/tables.css',
        'css/30-components/tabs.css',
        'css/30-components/table-picker-dropdown.css',
        ];

        const cssLinks = cssFiles.map(relPath => {
        const uri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', relPath)
        );
        return `<link href="${uri}" rel="stylesheet">`;
        }).join('');
            
        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        // Patch: Add table-tabs.js before main.js and add table-tabs-bar above data-content in data-panel
        const tableTabsScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'table-tabs.js'));
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; img-src ${webview.cspSource} data:; worker-src blob:; child-src blob:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                ${cssLinks}
                <title>SQLite IntelliView</title>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="header-left">
                            <div class="title-row">
                                <h1>SQLite IntelliView</h1>
                                <div class="header-controls">
                                    <div class="connection-status-container">
                                        <div id="connection-status" class="connection-status disconnected">Disconnected</div>
                                    </div>
                                    <button id="connection-help-btn" class="help-button" title="Connection Help">🔑</button>
                                    <button id="main-help-btn" class="help-button" title="Keyboard Shortcuts">?</button>
                                </div>
                            </div>
                            <div class="database-path">${uri.fsPath}</div>
                        </div>
                    </div>
                    
                    <div class="main-content">
                        <div class="sidebar" id="sidebar">
                            <div class="sidebar-header">
                                <h3 class="sidebar-title">Database</h3>
                                <div class="sidebar-controls">
                                    <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle Sidebar">⟨</button>
                                </div>
                            </div>
                            
                            <!-- Minimized sidebar content -->
                            <div class="minimized-content">
                                <div class="selected-table-indicator empty" id="selected-table-indicator">
                                    No Table Selected
                                </div>
                            </div>
                            
                            <div class="sidebar-resize-handle" id="sidebar-resize-handle"></div>
                            
                            <div class="section connection-section visible" id="connection-section">
                             <div class="minimized-content">🔒</div>
                                <div class="connection-controls">
                                    <input type="password" id="encryption-key" placeholder="SQLCipher Key" />
                                    <button id="connect-btn" class="primary-button">Connect with Key</button>
                                </div>
                            </div>
                            
                            <div class="section">
                                <h3>Tables</h3>
                                <div id="tables-list" class="tables-list">
                                    <div class="loading">Disconnected from database...</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="main-panel">
                            <div class="tabs">
                                <button class="tab active" data-tab="schema">Schema</button>
                                <button class="tab" data-tab="query">Query</button>
                                <button class="tab" data-tab="data">Data</button>
                                <button class="tab" data-tab="diagram">ER Diagram</button>
                            </div>
                            
                            <div class="tab-content">
                                <div id="schema-panel" class="tab-panel active">
                                    <div id="schema-content">
                                        <div class="empty-state">
                                            <div class="empty-state-icon">📋</div>
                                            <div class="empty-state-title">Select a table to view its schema</div>
                                            <div class="empty-state-description">Choose a table from the sidebar to explore its structure, columns, and data types.</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div id="query-panel" class="tab-panel">
                                    <div class="query-editor">
                                        <div class="query-controls">
                                            <div class="editor-wrapper">
                                                <div id="query-editor-container" class="query-editor-container"></div>
                                                <div class="floating-query-buttons">
                                                    <button id="execute-query" class="primary-button">
                                                        <span class="button-icon">▶</span>
                                                        Execute Query
                                                        <span class="keyboard-shortcut">Ctrl+Enter</span>
                                                    </button>
                                                    <button id="clear-query" class="secondary-button">
                                                        <span class="button-icon">🗑</span>
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div id="query-results"></div>
                                </div>
                                
                                <div id="data-panel" class="tab-panel">
                                    <!-- Table Tabs Bar for Data Tab -->
                                    <div id="table-tabs-bar"></div>
                                    <div id="data-content">
                                        <div class="empty-state">
                                            <div class="empty-state-icon">📊</div>
                                            <div class="empty-state-title">Select a table to view its data</div>
                                            <div class="empty-state-description">Choose a table from the sidebar to browse its records and content.</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div id="diagram-panel" class="tab-panel">
                                    <div id="diagram-content">
                                        <div id="diagram-container">
                                            <div class="empty-state">
                                                <div class="empty-state-icon">📈</div>
                                                <div class="empty-state-title">Generate ER Diagram</div>
                                                <div class="empty-state-description">Click "Generate ER Diagram" to visualize the database relationships and structure with D3.js interactive diagrams.</div>
                                                <button id="generate-diagram" class="primary-button" onclick="window.requestERDiagram && window.requestERDiagram()">Generate ER Diagram</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Load D3.js for enhanced diagrams -->
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'd3.min.js'))}"></script>
                
                <!-- Load SortableJS for drag-and-drop functionality -->
                <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"></script>
                
                <!-- Load Monaco Editor -->
                <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js"></script>
                
                <!-- Load modular JavaScript files in dependency order -->
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'state.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dom.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'notifications.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'utils.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'resizable-sidebar.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'resizing.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'table.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'context-menu.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'diagram.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'enhanced-diagram.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'query-editor-enhanced.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'events.js'))}"></script>
                <!-- Table Tabs UI must be loaded before main.js -->
                <script nonce="${nonce}" src="${tableTabsScriptUri}"></script>
                <!-- Main application script - loads last and uses functions from modules above -->
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private async handleDatabaseInfoRequest(webviewPanel: vscode.WebviewPanel, databasePath: string, key?: string) {
        try {
            const dbService = await this.getOrCreateConnection(databasePath, key);
            const tables = await dbService.getTables();

            // Fetch columns for all tables
            const tableColumns: Record<string, string[]> = {};
            for (const table of tables) {
                try {
                    const schema = await dbService.getTableSchema(table.name);
                    // schema.values is an array of rows, each row is an array of column values
                    // schema.columns is ["cid", "name", "type", ...]
                    // We want the 'name' property from each row
                    const nameIndex = schema.columns.indexOf("name");
                    if (nameIndex !== -1) {
                        tableColumns[table.name] = schema.values.map(row => row[nameIndex]);
                    } else {
                        tableColumns[table.name] = [];
                    }
                } catch (err) {
                    tableColumns[table.name] = [];
                }
            }

            webviewPanel.webview.postMessage({
                type: 'databaseInfo',
                success: true,
                tables: tables,
                tableColumns: tableColumns
            });
        } catch (error) {
            // Close the connection if it failed
            this.closeConnection(databasePath, key);
            webviewPanel.webview.postMessage({
                type: 'error',
                message: `Failed to load database: ${error}`
            });
        }
    }

    private async handleQueryExecution(webviewPanel: vscode.WebviewPanel, databasePath: string, query: string, key?: string) {
        try {
            const dbService = await this.getOrCreateConnection(databasePath, key);
            const result = await dbService.executeQuery(query);

            // Check if this is a schema query
            const isSchemaQuery = query.toLowerCase().includes('pragma table_info');
            
            webviewPanel.webview.postMessage({
                type: isSchemaQuery ? 'tableSchema' : 'queryResult',
                success: true,
                data: result.values,
                columns: result.columns,
                query: query
            });
        } catch (error) {
            webviewPanel.webview.postMessage({
                type: 'error',
                message: `Query execution failed: ${error}`
            });
        }
    }

    private async handleTableDataRequest(webviewPanel: vscode.WebviewPanel, databasePath: string, tableName: string, key?: string, page?: number, pageSize?: number, setSync: boolean = true) {
        try {
            const dbService = await this.getOrCreateConnection(databasePath, key);
            
            // Use pagination if provided, otherwise use default behavior
            let result;
            let totalRowCount = 0;
            
            if (page !== undefined && pageSize !== undefined) {
                // Get paginated data
                result = await dbService.getTableDataPaginated(tableName, page, pageSize);
                // Get total row count for pagination controls
                totalRowCount = await dbService.getRowCount(tableName);
            } else {
                result = await dbService.getTableData(tableName);
                totalRowCount = result.values.length;
            }

            // Get foreign key information for the table
            const foreignKeys = await dbService.getForeignKeys(tableName);
            // Get full column info (with fk metadata)
            const columnInfo = await dbService.getTableInfo(tableName);

            // Fix column headers: alias rowid as _rowid and remove duplicate id columns
            let columns = result.columns;
            let data = result.values;
            // If first column is rowid and second is id, remove the second if they are identical for all rows
            if (columns.length > 1 && columns[0].toLowerCase() === 'rowid' && columns[1].toLowerCase() === 'id') {
                const allMatch = data.every(row => row[0] === row[1]);
                if (allMatch) {
                    // Remove the second column (id)
                    columns = [columns[0], ...columns.slice(2)];
                    data = data.map(row => [row[0], ...row.slice(2)]);
                }
            }
            // Always alias rowid as _rowid for clarity
            if (columns[0].toLowerCase() === 'rowid') {
                columns = ['_rowid', ...columns.slice(1)];
            }

            webviewPanel.webview.postMessage({
                type: 'tableData',
                success: true,
                tableName,
                data: data,
                columns: columns,
                foreignKeys: foreignKeys,
                columnInfo: columnInfo,
                page: page,
                pageSize: pageSize,
                totalRows: totalRowCount
            });
            // cache this page for future diffs ONLY if this is a user-initiated load
            if (setSync) {
                this.lastSync.set(databasePath, {
                    table: tableName!,
                    since: '',
                    page: page!,
                    pageSize: pageSize!,
                    lastPageData: data // <--- store the actual rows
                });
                console.log('[getTableDataPaginated] lastSync set for', databasePath, { table: tableName, page, pageSize, lastPageData: data });
            }
        } catch (error) {
            webviewPanel.webview.postMessage({
                type: 'error',
                message: `Failed to load table data: ${error}`
            });
        }
    }

    private async handleCellUpdateRequest(webviewPanel: vscode.WebviewPanel, databasePath: string, tableName: string, rowIndex: number, columnName: string, newValue: any, key?: string) {
        console.log(`[handleCellUpdateRequest] Processing cell update request:`, {
            databasePath,
            tableName,
            rowIndex,
            columnName,
            newValue,
            hasKey: !!key
        });

        try {
            const dbService = await this.getOrCreateConnection(databasePath, key);
            // First, get the rowid for the row we want to update
            console.log(`[handleCellUpdateRequest] Getting rowid for row index ${rowIndex}`);
            const rowId = await dbService.getCellRowId(tableName, rowIndex);
            // Update the cell data
            console.log(`[handleCellUpdateRequest] Updating cell data with rowid ${rowId}`);
            await dbService.updateCellData(tableName, rowId, columnName, newValue);
            // Send success response
            webviewPanel.webview.postMessage({
                type: 'cellUpdateSuccess',
                success: true,
                tableName: tableName,
                rowIndex: rowIndex,
                columnName: columnName,
                newValue: newValue
            });
            
            console.log(`[handleCellUpdateRequest] Cell update completed successfully`);
        } catch (error) {
            console.error(`[handleCellUpdateRequest] Cell update failed:`, error);
            webviewPanel.webview.postMessage({
                type: 'cellUpdateError',
                success: false,
                message: `Failed to update cell: ${error}`,
                tableName: tableName,
                rowIndex: rowIndex,
                columnName: columnName
            });
        }
    }

    private async handleTableSchemaRequest(webviewPanel: vscode.WebviewPanel, databasePath: string, tableName: string, key?: string) {
        try {
            console.log(`Handling schema request for table: ${tableName}, key provided: ${key ? '[PROVIDED]' : '[EMPTY]'}`);
            const dbService = await this.getOrCreateConnection(databasePath, key);
            const result = await dbService.getTableSchema(tableName);
            
            // Also get foreign key information for the table
            const foreignKeys = await dbService.getForeignKeys(tableName);

            console.log(`Schema result for ${tableName}: ${result.columns.length} columns, ${result.values.length} rows`);
            console.log(`Foreign keys for ${tableName}:`, foreignKeys);
            
            webviewPanel.webview.postMessage({
                type: 'tableSchema',
                success: true,
                tableName: tableName,
                data: result.values,
                columns: result.columns,
                foreignKeys: foreignKeys
            });
        } catch (error) {
            console.error(`Schema request failed for ${tableName}:`, error);
            webviewPanel.webview.postMessage({
                type: 'error',
                message: `Failed to load table schema: ${error}`
            });
        }
    }

    private async handleERDiagramRequest(webviewPanel: vscode.WebviewPanel, databasePath: string, key?: string) {
        try {
            console.log(`=== ER DIAGRAM REQUEST START ===`);
            console.log(`Database path: ${databasePath}`);
            console.log(`Key provided: ${key ? 'YES' : 'NO'}`);
            
            // Send progress update - step 1
            webviewPanel.webview.postMessage({
                type: 'erDiagramProgress',
                step: 1,
                message: 'Connecting to database...'
            });
            
            console.log(`Attempting to get database connection...`);
            const dbService = await this.getOrCreateConnection(databasePath, key);
            console.log(`Database connection successful`);
            
            // Send progress update - step 2
            webviewPanel.webview.postMessage({
                type: 'erDiagramProgress',
                step: 2,
                message: 'Analyzing database tables...'
            });
            
            console.log(`Getting tables list...`);
            // Get all tables
            const tables = await dbService.getTables();
            console.log(`Found ${tables.length} tables:`, tables.map(t => t.name));
            
            // Send progress update with table count
            webviewPanel.webview.postMessage({
                type: 'erDiagramProgress',
                step: 2,
                message: `Found ${tables.length} tables, analyzing schemas...`
            });
            
            console.log(`Starting schema analysis for ${tables.length} tables...`);
            
            // Get schema for each table
            const tablesWithSchemas = await Promise.all(
                tables.map(async (table, index) => {
                    console.log(`Processing table ${index + 1}/${tables.length}: ${table.name}`);
                    
                    // Send progress update for each table
                    webviewPanel.webview.postMessage({
                        type: 'erDiagramProgress',
                        step: 2,
                        message: `Analyzing table ${index + 1}/${tables.length}: ${table.name}`
                    });
                    
                    try {
                        const schema = await dbService.getTableSchema(table.name);
                        console.log(`Schema for ${table.name}:`, schema);
                        
                        const columns = schema.values.map((row: any) => ({
                            name: row[1], // column name
                            type: row[2], // data type
                            notNull: row[3] === 1, // not null constraint
                            defaultValue: row[4], // default value
                            primaryKey: row[5] === 1 // primary key
                        }));
                        
                        console.log(`Table ${table.name} processed: ${columns.length} columns`);
                        
                        return {
                            name: table.name,
                            columns: columns
                        };
                    } catch (error) {
                        console.error(`Error processing table ${table.name}:`, error);
                        throw error;
                    }
                })
            );

            console.log(`Schema analysis complete. Starting foreign key detection...`);
            
            // Send progress update - step 3
            webviewPanel.webview.postMessage({
                type: 'erDiagramProgress',
                step: 3,
                message: 'Detecting foreign key relationships...'
            });

            // Get foreign key relationships
            const relationships = await Promise.all(
                tables.map(async (table, index) => {
                    try {
                        console.log(`Checking foreign keys for table ${index + 1}/${tables.length}: ${table.name}`);
                        
                        const foreignKeys = await dbService.executeQuery(`PRAGMA foreign_key_list(${table.name})`);
                        console.log(`Foreign keys result for ${table.name}:`, foreignKeys);
                        
                        const fkList = foreignKeys.values.map((fk: any) => ({
                            column: fk[3], // from column
                            referencedTable: fk[2], // to table
                            referencedColumn: fk[4] // to column
                        }));
                        
                        if (fkList.length > 0) {
                            console.log(`Found ${fkList.length} foreign keys in ${table.name}:`, fkList);
                        }
                        
                        return {
                            table: table.name,
                            foreignKeys: fkList
                        };
                    } catch (error) {
                        console.warn(`Failed to get foreign keys for ${table.name}:`, error);
                        return {
                            table: table.name,
                            foreignKeys: []
                        };
                    }
                })
            );

            const filteredRelationships = relationships.filter(rel => rel.foreignKeys.length > 0);
            console.log(`Found ${filteredRelationships.length} tables with foreign key relationships`);
            console.log(`Relationships:`, filteredRelationships);

            console.log(`Sending final ER diagram data...`);
            
            // Send final success message
            webviewPanel.webview.postMessage({
                type: 'erDiagram',
                success: true,
                tables: tablesWithSchemas,
                relationships: filteredRelationships
            });
            
            console.log(`=== ER DIAGRAM REQUEST COMPLETE ===`);
            
        } catch (error) {
            console.error(`=== ER DIAGRAM REQUEST FAILED ===`);
            console.error(`Error details:`, error);
            console.error(`Stack trace:`, error instanceof Error ? error.stack : 'No stack trace');
            
            webviewPanel.webview.postMessage({
                type: 'erDiagram',
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async handleDeleteRowRequest(webviewPanel: vscode.WebviewPanel, databasePath: string, tableName: string, rowId: any, key?: string) {
        console.log(`[handleDeleteRowRequest] Starting delete row request:`, {
            databasePath,
            tableName,
            rowId,
            hasKey: !!key
        });

        try {
            const dbService = await this.getOrCreateConnection(databasePath, key);
            
            // Delete the row
            console.log(`[handleDeleteRowRequest] Deleting row with identifier:`, rowId);
            await dbService.deleteRow(tableName, rowId);
            
            // Send success response
            webviewPanel.webview.postMessage({
                type: 'deleteRowSuccess',
                success: true,
                tableName: tableName,
                rowId: rowId
            });
            
            console.log(`[handleDeleteRowRequest] Row deletion completed successfully`);
        } catch (error) {
            console.error(`[handleDeleteRowRequest] Row deletion failed:`, error);
            webviewPanel.webview.postMessage({
                type: 'deleteRowError',
                success: false,
                message: `Failed to delete row: ${error}`,
                tableName: tableName,
                rowId: rowId
            });
        }
    }

    // Connection management methods
    private async getOrCreateConnection(databasePath: string, key?: string): Promise<DatabaseService> {
        // Normalize the key to handle undefined, null, and empty string consistently
        const normalizedKey = key || '';
        const connectionKey = `${databasePath}:${normalizedKey}`;
        
        console.log(`Getting connection for: ${databasePath}, key: ${normalizedKey ? '[PROVIDED]' : '[EMPTY]'}`);
        this.debugLogConnections();
        
        if (this.activeConnections.has(connectionKey)) {
            console.log('Reusing existing connection');
            return this.activeConnections.get(connectionKey)!;
        }
        
        // If no exact match, try to find an existing connection for this database path
        // This handles cases where the key might be passed inconsistently
        for (const [existingKey, connection] of this.activeConnections) {
            if (existingKey.startsWith(`${databasePath}:`)) {
                console.log(`Found existing connection for database path: ${databasePath}`);
                return connection;
            }
        }
        
        console.log('Creating new connection');
        const dbService = new DatabaseService();
        await dbService.openDatabase(databasePath, normalizedKey || undefined);
        this.activeConnections.set(connectionKey, dbService);
        
        return dbService;
    }
    
    private async ensureConnection(databasePath: string, key?: string): Promise<DatabaseService> {
        const normalizedKey = key || '';
        const connectionKey = `${databasePath}:${normalizedKey}`;
        let connection = this.activeConnections.get(connectionKey);
        
        if (!connection) {
            // Create new connection
            connection = new DatabaseService();
            await connection.openDatabase(databasePath, normalizedKey || undefined);
            this.activeConnections.set(connectionKey, connection);
        }
        
        return connection;
    }

    private closeConnection(databasePath: string, key?: string): void {
        if (key !== undefined) {
            // Close specific connection with key
            const normalizedKey = key || '';
            const connectionKey = `${databasePath}:${normalizedKey}`;
            const connection = this.activeConnections.get(connectionKey);
            
            if (connection) {
                console.log(`Closing connection for: ${databasePath}, key: ${normalizedKey ? '[PROVIDED]' : '[EMPTY]'}`);
                connection.closeDatabase();
                this.activeConnections.delete(connectionKey);
            }
        } else {
            // Close all connections for this database path
            const keysToDelete = [];
            for (const [connectionKey, connection] of this.activeConnections) {
                if (connectionKey.startsWith(`${databasePath}:`)) {
                    console.log(`Closing connection for database path: ${databasePath}`);
                    connection.closeDatabase();
                    keysToDelete.push(connectionKey);
                }
            }
            keysToDelete.forEach(key => this.activeConnections.delete(key));
            // Only clear sync state if the panel is closed
            if (!this.webviewPanels.has(databasePath)) {
                this.lastSync.delete(databasePath);
            } else {
                console.log(`[closeConnection] Panel still open for ${databasePath}, retaining lastSync`);
            }
        }
    }
    
    private closeAllConnections(): void {
        for (const [key, connection] of this.activeConnections) {
            connection.closeDatabase();
        }
        this.activeConnections.clear();
        this.lastSync.clear();
    }

    private debugLogConnections(): void {
        console.log(`Active connections (${this.activeConnections.size}):`);
        for (const [key, connection] of this.activeConnections) {
            console.log(`  - ${key}`);
        }
    }

    // Add a global cleanup method for extension deactivation
    public dispose(): void {
        this.databaseWatcher.disposeAll();
        this.webviewPanels.clear();
        this.closeAllConnections();
    }

    public async handleExternalDatabaseChange(databasePath: string) {
        // Close and reopen the connection to ensure SQLite sees external changes
        this.closeConnection(databasePath);
        const panel = this.webviewPanels.get(databasePath);
        const sync = this.lastSync.get(databasePath);
        console.log('[handleExternalDatabaseChange] Triggered for', databasePath, { hasPanel: !!panel, hasSync: !!sync });
        if (!panel || !sync) {
            console.warn('[handleExternalDatabaseChange] No panel or sync found for', databasePath, { panel, sync });
            return;
        }
        // fetch old & new page
        const { table, page, pageSize, lastPageData } = sync;
        console.log('[handleExternalDatabaseChange] Using sync state', { table, page, pageSize, lastPageData });
        // Reopen the connection
        const db = await this.getOrCreateConnection(databasePath);
        // Fetch new page data WITHOUT updating lastSync
        const newResult = await db.getTableDataPaginated(table, page, pageSize);
        console.log('[handleExternalDatabaseChange] New page data fetched', { newResult });
        const oldRows = lastPageData || [];
        const newRows = newResult.values;
        console.log('[handleExternalDatabaseChange] oldRows:', JSON.stringify(oldRows));
        console.log('[handleExternalDatabaseChange] newRows:', JSON.stringify(newRows));
        const baseIndex = (page - 1) * pageSize;
        // Build maps of rowid → localIndex
        const oldMap = new Map();
        oldRows.forEach((r, i) => oldMap.set(r[0], JSON.stringify(r)));
        const newMap = new Map();
        newRows.forEach((r, i) => newMap.set(r[0], JSON.stringify(r)));
        // DELETES
        const deletes: number[] = [];
        for (const [rowid, _] of oldMap) {
            if (!newMap.has(rowid)) {
                const localIdx = oldRows.findIndex(r => r[0] === rowid);
                deletes.push(baseIndex + localIdx);
            }
        }
        // INSERTS
        const inserts: { rowIndex: number; rowData: any[] }[] = [];
        newRows.forEach((r, i) => {
            if (!oldMap.has(r[0])) {
                inserts.push({ rowIndex: baseIndex + i, rowData: r });
            }
        });
        // UPDATES
        const updates: { rowIndex: number; rowData: any[] }[] = [];
        newRows.forEach((r, i) => {
            const rowid = r[0], payload = JSON.stringify(r);
            if (oldMap.has(rowid) && oldMap.get(rowid) !== payload) {
                updates.push({ rowIndex: baseIndex + i, rowData: r });
            }
        });
        console.log('[handleExternalDatabaseChange] Delta computed', { inserts, updates, deletes });
        // send them back to the webview
        panel.webview.postMessage({
            type: 'tableDataDelta',
            tableName: table,
            inserts,
            updates,
            deletes
        });
        console.log('[handleExternalDatabaseChange] tableDataDelta sent to webview', { table, inserts, updates, deletes });
        // update our lastPageData snapshot
        sync.lastPageData = newRows;
        this.lastSync.set(databasePath, sync);
        console.log('[handleExternalDatabaseChange] lastPageData updated in lastSync', { databasePath, lastPageData: sync.lastPageData });
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
