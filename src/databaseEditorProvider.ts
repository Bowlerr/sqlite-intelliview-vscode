import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseService } from './databaseService';

export class DatabaseEditorProvider implements vscode.CustomTextEditorProvider {
    
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new DatabaseEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            DatabaseEditorProvider.viewType, 
            provider
        );
        return providerRegistration;
    }

    private static readonly viewType = 'sqlite-viewer.databaseEditor';

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
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
                    this.handleDatabaseInfoRequest(webviewPanel, document.uri.fsPath);
                    return;
                case 'executeQuery':
                    this.handleQueryExecution(webviewPanel, document.uri.fsPath, e.query, e.key);
                    return;
                case 'requestTableData':
                    this.handleTableDataRequest(webviewPanel, document.uri.fsPath, e.tableName, e.key);
                    return;
            }
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
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${stylesMainUri}" rel="stylesheet">
                <title>SQLite Database Viewer</title>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>SQLite Database Viewer</h1>
                        <div class="database-path">${uri.fsPath}</div>
                    </div>
                    
                    <div class="main-content">
                        <div class="sidebar">
                            <div class="section">
                                <h3>Database Connection</h3>
                                <div class="connection-controls">
                                    <input type="password" id="encryption-key" placeholder="SQLCipher Key (optional)" />
                                    <button id="connect-btn" class="primary-button">Connect</button>
                                </div>
                            </div>
                            
                            <div class="section">
                                <h3>Tables</h3>
                                <div id="tables-list" class="tables-list">
                                    <div class="loading">Click Connect to load database</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="main-panel">
                            <div class="tabs">
                                <button class="tab active" data-tab="schema">Schema</button>
                                <button class="tab" data-tab="query">Query</button>
                                <button class="tab" data-tab="data">Data</button>
                            </div>
                            
                            <div class="tab-content">
                                <div id="schema-tab" class="tab-panel active">
                                    <div id="schema-content">Select a table to view its schema</div>
                                </div>
                                
                                <div id="query-tab" class="tab-panel">
                                    <div class="query-editor">
                                        <textarea id="sql-query" placeholder="Enter your SQL query here...">SELECT * FROM sqlite_master WHERE type='table';</textarea>
                                        <button id="execute-query" class="primary-button">Execute Query</button>
                                    </div>
                                    <div id="query-results"></div>
                                </div>
                                
                                <div id="data-tab" class="tab-panel">
                                    <div id="data-content">Select a table to view its data</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private async handleDatabaseInfoRequest(webviewPanel: vscode.WebviewPanel, databasePath: string) {
        try {
            const dbService = new DatabaseService();
            await dbService.openDatabase(databasePath);
            const tables = await dbService.getTables();
            dbService.closeDatabase();

            webviewPanel.webview.postMessage({
                type: 'databaseInfo',
                success: true,
                tables: tables
            });
        } catch (error) {
            webviewPanel.webview.postMessage({
                type: 'error',
                message: `Failed to load database: ${error}`
            });
        }
    }

    private async handleQueryExecution(webviewPanel: vscode.WebviewPanel, databasePath: string, query: string, key?: string) {
        try {
            const dbService = new DatabaseService();
            await dbService.openDatabase(databasePath, key);
            const result = await dbService.executeQuery(query);
            dbService.closeDatabase();

            webviewPanel.webview.postMessage({
                type: 'queryResult',
                success: true,
                data: result.values,
                columns: result.columns
            });
        } catch (error) {
            webviewPanel.webview.postMessage({
                type: 'error',
                message: `Query execution failed: ${error}`
            });
        }
    }

    private async handleTableDataRequest(webviewPanel: vscode.WebviewPanel, databasePath: string, tableName: string, key?: string) {
        try {
            const dbService = new DatabaseService();
            await dbService.openDatabase(databasePath, key);
            const result = await dbService.getTableData(tableName);
            dbService.closeDatabase();

            webviewPanel.webview.postMessage({
                type: 'tableData',
                success: true,
                tableName: tableName,
                data: result.values,
                columns: result.columns
            });
        } catch (error) {
            webviewPanel.webview.postMessage({
                type: 'error',
                message: `Failed to load table data: ${error}`
            });
        }
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
