import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseService } from './databaseService';

export class DatabaseEditorProvider implements vscode.CustomReadonlyEditorProvider {
    
    private static readonly viewType = 'sqlite-viewer.databaseEditor';
    private activeConnections: Map<string, DatabaseService> = new Map();
    
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
        return {
            uri,
            dispose: () => {
                // Clean up resources for this document
                this.closeConnection(uri.fsPath);
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
        updateWebview();

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(e => {
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
                    this.handleTableDataRequest(webviewPanel, document.uri.fsPath, e.tableName, e.key, e.page, e.pageSize);
                    return;
                case 'updateCellData':
                    this.handleCellUpdateRequest(webviewPanel, document.uri.fsPath, e.tableName, e.rowIndex, e.columnName, e.newValue, e.key);
                    return;
                case 'generateERDiagram':
                    this.handleERDiagramRequest(webviewPanel, document.uri.fsPath, e.key);
                    return;
            }
        });

        // Handle webview disposal
        webviewPanel.onDidDispose(() => {
            this.closeConnection(document.uri.fsPath);
        });
    }

    private getHtmlForWebview(webview: vscode.Webview, uri: vscode.Uri): string {
        // Local path to main script run in the webview
        const scriptPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        // Local path to css styles
        const styleResetPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reset.css');
        const stylesPathMainPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vscode.css');
        const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);
        const styleResetUri = webview.asWebviewUri(styleResetPath);

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${stylesMainUri}" rel="stylesheet">
                <title>SQLite Database Viewer</title>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="header-left">
                            <div class="title-row">
                                <h1>SQLite Database Viewer</h1>
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
                                    No Table
                                </div>
                            </div>
                            
                            <div class="sidebar-resize-handle" id="sidebar-resize-handle"></div>
                            
                            <div class="section connection-section visible" id="connection-section">
                                <h3>Connection</h3>
                                <div class="connection-controls">
                                    <input type="password" id="encryption-key" placeholder="SQLCipher Key" />
                                    <button id="connect-btn" class="primary-button">Connect with Key</button>
                                </div>
                            </div>
                            
                            <div class="section">
                                <h3>Tables</h3>
                                <div id="tables-list" class="tables-list">
                                    <div class="loading">Connecting to database...</div>
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
                                            <textarea id="sql-query" placeholder="Enter your SQL query here...&#10;&#10;Examples:&#10;• SELECT * FROM sqlite_master WHERE type='table';&#10;• SELECT * FROM [table_name] LIMIT 10;&#10;• PRAGMA table_info([table_name]);&#10;• SELECT COUNT(*) FROM [table_name];&#10;&#10;💡 Tips:&#10;• Use Ctrl+Enter (Cmd+Enter) to execute&#10;• Use Ctrl+F (Cmd+F) to search in table results&#10;• Click column headers to sort data&#10;• Use 📌 to pin important columns&#10;• Click on table names in sidebar to view schema"></textarea>
                                            <div class="query-actions">
                                                <button id="execute-query" class="primary-button">Execute Query</button>
                                                <button id="clear-query" class="secondary-button">Clear</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div id="query-results"></div>
                                </div>
                                
                                <div id="data-panel" class="tab-panel">
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
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'd3', 'dist', 'd3.min.js'))}"></script>
                
                <!-- Load modular JavaScript files in dependency order -->
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'state.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dom.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'notifications.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'utils.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'resizable-sidebar.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'resizing.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'table.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'diagram.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'enhanced-diagram.js'))}"></script>
                <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'events.js'))}"></script>
                
                <!-- Main application script - loads last and uses functions from modules above -->
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private async handleDatabaseInfoRequest(webviewPanel: vscode.WebviewPanel, databasePath: string, key?: string) {
        try {
            const dbService = await this.getOrCreateConnection(databasePath, key);
            const tables = await dbService.getTables();

            webviewPanel.webview.postMessage({
                type: 'databaseInfo',
                success: true,
                tables: tables
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

    private async handleTableDataRequest(webviewPanel: vscode.WebviewPanel, databasePath: string, tableName: string, key?: string, page?: number, pageSize?: number) {
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

            webviewPanel.webview.postMessage({
                type: 'tableData',
                success: true,
                tableName: tableName,
                data: result.values,
                columns: result.columns,
                page: page,
                pageSize: pageSize,
                totalRows: totalRowCount
            });
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

            console.log(`Schema result for ${tableName}: ${result.columns.length} columns, ${result.values.length} rows`);
            webviewPanel.webview.postMessage({
                type: 'tableSchema',
                success: true,
                tableName: tableName,
                data: result.values,
                columns: result.columns
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
        }
    }
    
    private closeAllConnections(): void {
        for (const [key, connection] of this.activeConnections) {
            connection.closeDatabase();
        }
        this.activeConnections.clear();
    }

    private debugLogConnections(): void {
        console.log(`Active connections (${this.activeConnections.size}):`);
        for (const [key, connection] of this.activeConnections) {
            console.log(`  - ${key}`);
        }
    }

    // Add a global cleanup method for extension deactivation
    public dispose(): void {
        this.closeAllConnections();
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
