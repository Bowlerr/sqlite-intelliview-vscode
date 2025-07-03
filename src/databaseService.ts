import * as fs from 'fs';
import * as path from 'path';

// For now, we'll use sql.js which works in both Node.js and browser environments
// Later we can add native sqlite3 support for better performance
const initSqlJs = require('sql.js');

export interface TableInfo {
    name: string;
    type: string;
    sql: string;
}

export interface ColumnInfo {
    name: string;
    type: string;
    notnull: boolean;
    dflt_value: any;
    pk: boolean;
}

export interface QueryResult {
    columns: string[];
    values: any[][];
}

export class DatabaseService {
    private db: any = null;
    private SQL: any = null;

    async initialize(): Promise<void> {
        if (!this.SQL) {
            this.SQL = await initSqlJs({
                // Specify the location of the SQL.js wasm file
                locateFile: (file: string) => {
                    if (file.endsWith('.wasm')) {
                        return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file);
                    }
                    return file;
                }
            });
        }
    }

    async openDatabase(databasePath: string, encryptionKey?: string): Promise<void> {
        await this.initialize();
        
        try {
            const data = fs.readFileSync(databasePath);
            
            if (encryptionKey) {
                // For SQLCipher support, we'll need to implement decryption
                // This is a placeholder for now
                throw new Error('SQLCipher support not yet implemented. Please use unencrypted SQLite databases.');
            }
            
            this.db = new this.SQL.Database(data);
        } catch (error) {
            throw new Error(`Failed to open database: ${error}`);
        }
    }

    async getTables(): Promise<TableInfo[]> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        const stmt = this.db.prepare(`
            SELECT name, type, sql 
            FROM sqlite_master 
            WHERE type IN ('table', 'view') 
            AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `);

        const tables: TableInfo[] = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            tables.push({
                name: row.name as string,
                type: row.type as string,
                sql: row.sql as string
            });
        }
        stmt.free();

        return tables;
    }

    async getTableInfo(tableName: string): Promise<ColumnInfo[]> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        const stmt = this.db.prepare(`PRAGMA table_info(${tableName})`);
        const columns: ColumnInfo[] = [];
        
        while (stmt.step()) {
            const row = stmt.getAsObject();
            columns.push({
                name: row.name as string,
                type: row.type as string,
                notnull: row.notnull === 1,
                dflt_value: row.dflt_value,
                pk: row.pk === 1
            });
        }
        stmt.free();

        return columns;
    }

    async executeQuery(query: string): Promise<QueryResult> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        try {
            const stmt = this.db.prepare(query);
            const result: QueryResult = {
                columns: stmt.getColumnNames(),
                values: []
            };

            while (stmt.step()) {
                result.values.push(stmt.get());
            }
            stmt.free();

            return result;
        } catch (error) {
            throw new Error(`Query execution failed: ${error}`);
        }
    }

    async getTableData(tableName: string, limit: number = 1000): Promise<QueryResult> {
        const query = `SELECT * FROM "${tableName}" LIMIT ${limit}`;
        return this.executeQuery(query);
    }

    async getRowCount(tableName: string): Promise<number> {
        const result = await this.executeQuery(`SELECT COUNT(*) as count FROM "${tableName}"`);
        return result.values[0][0] as number;
    }

    closeDatabase(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
