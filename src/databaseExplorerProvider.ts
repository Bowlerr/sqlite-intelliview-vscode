import * as vscode from 'vscode';
import { DatabaseService, TableInfo } from './databaseService';

export class DatabaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'database' | 'table' | 'column',
        public readonly tableName?: string,
        public readonly columnInfo?: any
    ) {
        super(label, collapsibleState);
        
        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.iconPath = this.getIcon();
        this.contextValue = type;
    }

    private getTooltip(): string {
        switch (this.type) {
            case 'database':
                return 'SQLite Database';
            case 'table':
                return `Table: ${this.label}`;
            case 'column':
                return this.columnInfo ? 
                    `${this.columnInfo.type}${this.columnInfo.pk ? ' (Primary Key)' : ''}${this.columnInfo.notnull ? ' NOT NULL' : ''}` :
                    'Column';
            default:
                return this.label;
        }
    }

    private getDescription(): string | undefined {
        if (this.type === 'column' && this.columnInfo) {
            let desc = this.columnInfo.type;
            if (this.columnInfo.pk) {
                desc += ' PK';
            }
            if (this.columnInfo.notnull) {
                desc += ' NOT NULL';
            }
            return desc;
        }
        return undefined;
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.type) {
            case 'database':
                return new vscode.ThemeIcon('database');
            case 'table':
                return new vscode.ThemeIcon('table');
            case 'column':
                return this.columnInfo?.pk ? 
                    new vscode.ThemeIcon('key') : 
                    new vscode.ThemeIcon('symbol-field');
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }
}

export class DatabaseExplorerProvider implements vscode.TreeDataProvider<DatabaseTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseTreeItem | undefined | null | void> = new vscode.EventEmitter<DatabaseTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private databaseService: DatabaseService;
    private currentDatabase: string | undefined;
    private currentTables: TableInfo[] = [];

    constructor() {
        this.databaseService = new DatabaseService();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async setDatabase(databasePath: string, encryptionKey?: string): Promise<void> {
        try {
            await this.databaseService.openDatabase(databasePath, encryptionKey);
            this.currentDatabase = databasePath;
            this.currentTables = await this.databaseService.getTables();
            
            // Set context to show the tree view
            vscode.commands.executeCommand('setContext', 'sqlite-viewer.hasOpenDatabase', true);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open database: ${error}`);
            throw error;
        }
    }

    closeDatabase(): void {
        this.databaseService.closeDatabase();
        this.currentDatabase = undefined;
        this.currentTables = [];
        vscode.commands.executeCommand('setContext', 'sqlite-viewer.hasOpenDatabase', false);
        this.refresh();
    }

    getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
        if (!this.currentDatabase) {
            return [];
        }

        if (!element) {
            // Root level - show database
            return [new DatabaseTreeItem(
                `Database: ${this.currentDatabase.split('/').pop()}`,
                vscode.TreeItemCollapsibleState.Expanded,
                'database'
            )];
        }

        if (element.type === 'database') {
            // Show tables
            return this.currentTables.map(table => 
                new DatabaseTreeItem(
                    table.name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'table',
                    table.name
                )
            );
        }

        if (element.type === 'table' && element.tableName) {
            // Show columns
            try {
                const columns = await this.databaseService.getTableInfo(element.tableName);
                return columns.map(column =>
                    new DatabaseTreeItem(
                        column.name,
                        vscode.TreeItemCollapsibleState.None,
                        'column',
                        element.tableName,
                        column
                    )
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to get table info: ${error}`);
                return [];
            }
        }

        return [];
    }

    getDatabaseService(): DatabaseService {
        return this.databaseService;
    }

    getCurrentTables(): TableInfo[] {
        return this.currentTables;
    }
}
