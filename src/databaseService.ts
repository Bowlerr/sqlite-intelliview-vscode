import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
    private tempDecryptedPath: string | null = null;

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
            // Check if file exists
            if (!fs.existsSync(databasePath)) {
                throw new Error(`Database file not found: ${databasePath}`);
            }

            let dataToLoad: Buffer;
            let pathToRead = databasePath;

            // If encryption key is provided, try to decrypt the database
            if (encryptionKey) {
                pathToRead = await this.decryptDatabase(databasePath, encryptionKey);
                dataToLoad = fs.readFileSync(pathToRead);
            } else {
                dataToLoad = fs.readFileSync(databasePath);
                
                // Check if it's a valid SQLite file
                if (dataToLoad.length < 16) {
                    throw new Error('File is too small to be a valid SQLite database');
                }
                
                // Check for SQLite header
                const header = dataToLoad.subarray(0, 16).toString('utf8');
                if (!header.includes('SQLite format 3')) {
                    // Check if it might be encrypted (random-looking bytes)
                    const firstBytes = dataToLoad.subarray(0, 16);
                    const isRandomLooking = firstBytes.every(byte => byte > 32 && byte < 127) === false;
                    
                    if (isRandomLooking) {
                        throw new Error('Database appears to be encrypted. Please provide the SQLCipher key.');
                    } else {
                        throw new Error('File does not appear to be a valid SQLite database');
                    }
                }
            }
            
            this.db = new this.SQL.Database(dataToLoad);
            
            // Test the database by running a simple query
            try {
                this.db.exec("SELECT name FROM sqlite_master LIMIT 1");
            } catch (error) {
                throw new Error('Database file appears to be corrupted or invalid');
            }
            
        } catch (error) {
            this.closeDatabase();
            throw error;
        }
    }

    private async decryptDatabase(databasePath: string, encryptionKey: string): Promise<string> {
        try {
            // Check if sqlcipher is available
            try {
                await execAsync('which sqlcipher');
            } catch {
                throw new Error('SQLCipher not found. Please install SQLCipher to decrypt encrypted databases.');
            }

            // Create a temporary file for the decrypted database
            const tempDir = require('os').tmpdir();
            const tempFileName = `decrypted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.db`;
            this.tempDecryptedPath = path.join(tempDir, tempFileName);

            // Escape the encryption key to handle special characters
            const escapedKey = encryptionKey.replace(/'/g, "''");

            // Use sqlcipher to decrypt the database to a temporary file
            // SQLCipher proper decryption using the standard approach
            const decryptCommand = `echo "PRAGMA key = '${escapedKey}'; ATTACH DATABASE '${this.tempDecryptedPath}' AS plaintext KEY ''; SELECT sqlcipher_export('plaintext'); DETACH DATABASE plaintext;" | sqlcipher "${databasePath}"`;

            console.log('Attempting to decrypt database with SQLCipher...');
            const result = await execAsync(decryptCommand);
            console.log('SQLCipher command result:', result);

            // Verify the decrypted file exists and is valid
            if (!fs.existsSync(this.tempDecryptedPath)) {
                throw new Error('Failed to decrypt database. The decrypted file was not created. Please check your encryption key.');
            }

            const decryptedData = fs.readFileSync(this.tempDecryptedPath);
            if (decryptedData.length === 0) {
                throw new Error('Decrypted database is empty. Please check your encryption key.');
            }

            // Verify it's a valid SQLite file
            const header = decryptedData.subarray(0, 16).toString();
            if (!header.includes('SQLite format 3')) {
                throw new Error('Decryption failed - output is not a valid SQLite database. Please check your encryption key.');
            }

            console.log('Database successfully decrypted');
            return this.tempDecryptedPath;

        } catch (error) {
            // Clean up temp file if it was created
            if (this.tempDecryptedPath && fs.existsSync(this.tempDecryptedPath)) {
                try {
                    fs.unlinkSync(this.tempDecryptedPath);
                } catch {}
                this.tempDecryptedPath = null;
            }
            
            console.error('Decryption error:', error);
            
            if (error instanceof Error) {
                // Provide more helpful error messages
                if (error.message.includes('file is not a database') || 
                    error.message.includes('database disk image is malformed')) {
                    throw new Error('Invalid encryption key provided. The key does not match this database.');
                }
                throw error;
            } else {
                throw new Error('Failed to decrypt database. Please check your encryption key.');
            }
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

        // Sanitize and validate query
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            throw new Error('Empty query provided');
        }

        // Check for potentially dangerous queries in a basic way
        const dangerousPatterns = [
            /^\s*PRAGMA\s+key\s*=/i,
            /^\s*ATTACH\s+DATABASE/i,
            /^\s*DETACH\s+DATABASE/i
        ];

        if (dangerousPatterns.some(pattern => pattern.test(trimmedQuery))) {
            throw new Error('This type of query is not allowed for security reasons');
        }

        try {
            const stmt = this.db.prepare(trimmedQuery);
            const result: QueryResult = {
                columns: stmt.getColumnNames(),
                values: []
            };

            // Limit results to prevent memory issues
            const maxRows = 10000;
            let rowCount = 0;

            while (stmt.step() && rowCount < maxRows) {
                result.values.push(stmt.get());
                rowCount++;
            }

            stmt.free();

            if (rowCount >= maxRows) {
                console.warn(`Query result truncated to ${maxRows} rows`);
            }

            return result;
        } catch (error) {
            throw new Error(`Query execution failed: ${error}`);
        }
    }

    async getTableData(tableName: string, limit: number = 1000, offset: number = 0): Promise<QueryResult> {
        const query = `SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`;
        return this.executeQuery(query);
    }

    async getTableDataPaginated(tableName: string, page: number = 1, pageSize: number = 100): Promise<QueryResult> {
        const offset = (page - 1) * pageSize;
        const query = `SELECT * FROM "${tableName}" LIMIT ${pageSize} OFFSET ${offset}`;
        return this.executeQuery(query);
    }

    async getRowCount(tableName: string): Promise<number> {
        const result = await this.executeQuery(`SELECT COUNT(*) as count FROM "${tableName}"`);
        return result.values[0][0] as number;
    }

    async getTableSchema(tableName: string): Promise<QueryResult> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        console.log(`Getting schema for table: ${tableName}`);
        
        // Use executeQuery instead of direct prepared statements to ensure
        // compatibility with SQLCipher encrypted databases
        const query = `PRAGMA table_info(${tableName})`;
        const result = await this.executeQuery(query);
        
        console.log(`Schema for ${tableName}: ${result.columns.length} columns, ${result.values.length} rows`);
        return result;
    }

    closeDatabase(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        
        // Clean up temporary decrypted file
        if (this.tempDecryptedPath && fs.existsSync(this.tempDecryptedPath)) {
            try {
                fs.unlinkSync(this.tempDecryptedPath);
            } catch (error) {
                console.warn('Failed to clean up temporary file:', error);
            }
            this.tempDecryptedPath = null;
        }
    }
}
