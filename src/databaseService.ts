import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { markInternalUpdate } from './databaseWatcher';
import { hasWalFiles, checkpointWalWithRetry, getWalStatus, getSqlite3CliInfo, WalCheckpointMode } from './walUtils';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

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
    // Add foreign key information
    fk?: {
        referencedTable: string;
        referencedColumn: string;
    };
}

export interface ForeignKeyInfo {
    column: string;
    referencedTable: string;
    referencedColumn: string;
}

export interface QueryResult {
    columns: string[];
    values: any[][];
}

export type SQLiteValue = number | string | Uint8Array | null;

export interface SerializedBlobIdentityValue {
    type: 'blob';
    base64: string;
}

export type RowIdentityValue = SQLiteValue | SerializedBlobIdentityValue;

export interface RowIdentityPart {
    column: string;
    value: RowIdentityValue;
}

export interface RowIdentity {
    kind: 'primaryKey' | 'rowid';
    parts: RowIdentityPart[];
}

export interface EditableTableData extends QueryResult {
    rowIdentities: Array<RowIdentity | null>;
    editable: boolean;
    editError?: string;
}

export interface CellUpdateResult {
    changes: number;
    identity: RowIdentity;
    value: SQLiteValue;
}

interface TableIdentityDefinition {
    kind: 'primaryKey' | 'rowid';
    columns: string[];
}

interface TableEditability {
    definition: TableIdentityDefinition | null;
    reason?: string;
}

/** 
 * A single change in a table since our last sync.
 */
export interface Change {
  rowid: any;
  changeType: 'INSERT' | 'UPDATE' | 'DELETE';
  /** these two will be filled in by the editor‐provider */
  rowIndex?: number;
  rowData?: any[];
}

export class DatabaseService {
    private db: any = null;
    private SQL: any = null;
    private tempDecryptedPath: string | null = null;
    private currentDatabasePath: string | null = null;
    private currentEncryptionKey: string | null = null;
    private editQueue: Promise<void> = Promise.resolve();
    private isDevelopment = process.env.NODE_ENV === 'development' || (typeof process !== 'undefined' && process.env.VSCODE_PID !== undefined);

    private debugLog(component: string, message: string, ...args: any[]): void {
        if (this.isDevelopment) {
            console.log(`[${component}] ${message}`, ...args);
        }
    }

    private debugError(component: string, message: string, ...args: any[]): void {
        if (this.isDevelopment) {
            console.error(`[${component}] ${message}`, ...args);
        }
    }

    private debugWarn(component: string, message: string, ...args: any[]): void {
        if (this.isDevelopment) {
            console.warn(`[${component}] ${message}`, ...args);
        }
    }

    private quoteIdentifier(identifier: string): string {
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    private serializeIdentityValue(value: unknown): RowIdentityValue {
        if (typeof value === 'bigint') {
            const numericValue = Number(value);
            return Number.isSafeInteger(numericValue) ? numericValue : value.toString();
        }
        if (value instanceof Uint8Array) {
            return { type: 'blob', base64: Buffer.from(value).toString('base64') };
        }
        if (value === null || typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        throw new Error('Row identity contains an unsupported SQLite value.');
    }

    private deserializeIdentityValue(value: RowIdentityValue): SQLiteValue {
        if (typeof value === 'object' && value !== null && !(value instanceof Uint8Array)) {
            if (value.type !== 'blob' || typeof value.base64 !== 'string') {
                throw new Error('Row identity contains an invalid serialized BLOB value.');
            }
            const decoded = Buffer.from(value.base64, 'base64');
            if (decoded.toString('base64') !== value.base64) {
                throw new Error('Row identity contains an invalid base64 BLOB value.');
            }
            return new Uint8Array(decoded);
        }
        return value;
    }

    private enqueueEdit<T>(operation: () => Promise<T>): Promise<T> {
        const queued = this.editQueue.then(operation, operation);
        this.editQueue = queued.then(() => undefined, () => undefined);
        return queued;
    }

    private getSettings() {
        const config = vscode.workspace.getConfiguration('sqliteIntelliView');
        const configuredWalCheckpointMode = config.get<string>('walCheckpointMode', 'full');
        const walCheckpointMode: WalCheckpointMode =
            configuredWalCheckpointMode === 'passive' || configuredWalCheckpointMode === 'off'
                ? configuredWalCheckpointMode
                : 'full';
        return {
            walAutoCheckpoint: config.get<boolean>('walAutoCheckpoint', true),
            walCheckpointMode,
        };
    }

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
        
        // Store the database path and encryption key for later use
        this.currentDatabasePath = databasePath;
        this.currentEncryptionKey = encryptionKey || null;
        
        try {
            const settings = this.getSettings();

            // Check if file exists
            if (!fs.existsSync(databasePath)) {
                throw new Error(`Database file not found: ${databasePath}`);
            }

            // Check for WAL mode and checkpoint if needed
            const walFilesPresent = await hasWalFiles(databasePath);
            const effectiveWalCheckpointMode: WalCheckpointMode =
                settings.walAutoCheckpoint ? settings.walCheckpointMode : 'off';

            if (walFilesPresent && effectiveWalCheckpointMode !== 'off') {
                this.debugLog('WAL', `WAL files detected, performing ${effectiveWalCheckpointMode} checkpoint...`);
                const walStatus = await getWalStatus(databasePath);
                this.debugLog('WAL', `WAL file size: ${walStatus.walSize} bytes, SHM file size: ${walStatus.shmSize} bytes`);
                
                try {
                    if (!encryptionKey) {
                        const sqlite3Cli = await getSqlite3CliInfo();
                        const sqlite3Available = !!sqlite3Cli;

                        if (!sqlite3Available) {
                            vscode.window.showWarningMessage(
                                'SQLite IntelliView: WAL files detected, but no sqlite3 CLI is available (bundled binary or PATH). WAL features are disabled for this session, but the database will still open using the main database file contents (data may be stale until WAL is checkpointed).'
                            );
                            this.debugWarn('WAL', 'No sqlite3 CLI available (bundled or PATH); skipping WAL checkpoint');
                        } else {
                            this.debugLog('WAL', `Using sqlite3 CLI source: ${sqlite3Cli.source}`);
                            const checkpointSuccess = await checkpointWalWithRetry(databasePath, encryptionKey, effectiveWalCheckpointMode);
                            if (checkpointSuccess) {
                                this.debugLog('WAL', 'WAL checkpoint completed successfully');
                            } else {
                                this.debugWarn('WAL', 'Could not checkpoint WAL after retries. Continuing with potentially stale data.');
                            }
                        }
                    } else {
                        const checkpointSuccess = await checkpointWalWithRetry(databasePath, encryptionKey, effectiveWalCheckpointMode);
                        if (checkpointSuccess) {
                            this.debugLog('WAL', 'WAL checkpoint completed successfully');
                        } else {
                            this.debugWarn('WAL', 'Could not checkpoint WAL after retries. Continuing with potentially stale data.');
                        }
                    }
                } catch (error) {
                    this.debugWarn('WAL', 'Could not checkpoint WAL:', error);
                    // Continue anyway - we'll load what we can from the main database file
                }
            } else if (walFilesPresent && effectiveWalCheckpointMode === 'off') {
                this.debugWarn('WAL', 'WAL files detected, but auto-checkpoint is disabled by settings (walCheckpointMode=off or walAutoCheckpoint=false). Continuing with main database file contents.');
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
            this.currentDatabasePath = databasePath;
            this.currentEncryptionKey = encryptionKey || null;
            
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
            await this.ensureSqlCipherAvailable();

            // Create a temporary file for the decrypted database
            const tempDir = require('os').tmpdir();
            const tempFileName = `decrypted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.db`;
            this.tempDecryptedPath = path.join(tempDir, tempFileName);

            // Escape the encryption key to handle special characters
            const escapedKey = encryptionKey.replace(/'/g, "''");

            const escapedTempPath = this.tempDecryptedPath.replace(/'/g, "''");
            const sqlCommands = [
                `PRAGMA key = '${escapedKey}';`,
                `ATTACH DATABASE '${escapedTempPath}' AS plaintext KEY '';`,
                `SELECT sqlcipher_export('plaintext');`,
                `DETACH DATABASE plaintext;`,
                `.quit`
            ].join('\n') + '\n';

            this.debugLog('Decrypt', 'Attempting to decrypt database with SQLCipher...');
            await this.runSqlCipher(databasePath, sqlCommands);

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

            this.debugLog('Decrypt', 'Database successfully decrypted');
            return this.tempDecryptedPath;

        } catch (error) {
            // Clean up temp file if it was created
            if (this.tempDecryptedPath && fs.existsSync(this.tempDecryptedPath)) {
                try {
                    fs.unlinkSync(this.tempDecryptedPath);
                } catch {}
                this.tempDecryptedPath = null;
            }
            
            this.debugError('Decrypt', 'Decryption error:', error);
            
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

    private async ensureSqlCipherAvailable(): Promise<void> {
        try {
            await execFileAsync('sqlcipher', ['-version']);
        } catch {
            throw new Error('SQLCipher not found. Please install SQLCipher to decrypt encrypted databases.');
        }
    }

    private async runSqlCipher(dbPath: string, sqlCommands: string, timeoutMs: number = 30000): Promise<void> {
        return new Promise((resolve, reject) => {
            const sqlcipher = spawn('sqlcipher', [dbPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';
            let finished = false;

            const timeout = setTimeout(() => {
                if (finished) {
                    return;
                }
                finished = true;
                sqlcipher.kill();
                reject(new Error(`SQLCipher command timed out after ${timeoutMs / 1000} seconds`));
            }, timeoutMs);

            sqlcipher.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            sqlcipher.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            sqlcipher.on('error', (err) => {
                if (finished) {
                    return;
                }
                finished = true;
                clearTimeout(timeout);
                reject(new Error(`Failed to spawn sqlcipher: ${err.message}`));
            });

            sqlcipher.on('close', (code) => {
                if (finished) {
                    return;
                }
                finished = true;
                clearTimeout(timeout);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`SQLCipher exited with code ${code}: ${stderr || stdout}`));
                }
            });

            sqlcipher.stdin.write(sqlCommands, (err) => {
                if (err) {
                    if (finished) {
                        return;
                    }
                    finished = true;
                    clearTimeout(timeout);
                    sqlcipher.kill();
                    reject(new Error(`Failed to write to sqlcipher stdin: ${err.message}`));
                } else {
                    sqlcipher.stdin.end();
                }
            });
        });
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

        const stmt = this.db.prepare(`PRAGMA table_info(${this.quoteIdentifier(tableName)})`);
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

        // Get foreign key information and merge with column info
        const foreignKeys = await this.getForeignKeys(tableName);
        
        // Add foreign key information to columns
        columns.forEach(column => {
            const fkInfo = foreignKeys.find(fk => fk.column === column.name);
            if (fkInfo) {
                column.fk = {
                    referencedTable: fkInfo.referencedTable,
                    referencedColumn: fkInfo.referencedColumn
                };
            }
        });

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

            // Limit results to prevent memory issues. Configurable via
            // `sqliteIntelliView.queryMaxRows`; 0 or negative means unlimited.
            const maxRows = this.getConfiguredRowLimit('queryMaxRows', 10000);
            let rowCount = 0;

            while (stmt.step() && rowCount < maxRows) {
                result.values.push(stmt.get());
                rowCount++;
            }

            stmt.free();

            if (rowCount >= maxRows) {
                this.debugWarn('Query', `Query result truncated to ${maxRows} rows`);
            }

            return result;
        } catch (error) {
            throw new Error(`Query execution failed: ${error}`);
        }
    }

    async getTableData(tableName: string, limit: number = 1000, offset: number = 0): Promise<EditableTableData> {
        return this.getTableDataWithIdentities(tableName, limit, offset);
    }

    /**
     * Reads a row-limit setting. Values <= 0 mean "no limit" and resolve to
     * Number.MAX_SAFE_INTEGER; non-integer values fall back to the default.
     */
    private getConfiguredRowLimit(setting: 'queryMaxRows' | 'maxTablePageSize', defaultValue: number): number {
        const configured = vscode.workspace.getConfiguration('sqliteIntelliView').get<number>(setting, defaultValue);
        if (!Number.isSafeInteger(configured)) {
            return defaultValue;
        }
        return configured > 0 ? configured : Number.MAX_SAFE_INTEGER;
    }

    /**
     * Normalizes a requested table page size against the configured
     * `sqliteIntelliView.maxTablePageSize` cap (0 or negative = unlimited).
     * Use this everywhere a page size crosses the extension/webview boundary
     * so the UI pagination math matches what was actually read.
     */
    public getEffectiveTablePageSize(pageSize: number): number {
        const requested = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 100;
        return Math.min(requested, this.getConfiguredRowLimit('maxTablePageSize', 100000));
    }

    public async getTableDataPaginated(tableName: string, page: number = 1, pageSize: number = 100): Promise<EditableTableData> {
        const safePage = Number.isInteger(page) && page > 0 ? page : 1;
        const safePageSize = this.getEffectiveTablePageSize(pageSize);
        const offset = (safePage - 1) * safePageSize;
        return this.getTableDataWithIdentities(tableName, safePageSize, offset);
    }

    async getRowCount(tableName: string): Promise<number> {
        const result = await this.executeQuery(`SELECT COUNT(*) as count FROM ${this.quoteIdentifier(tableName)}`);
        return result.values[0][0] as number;
    }

    private async getTableEditability(tableName: string): Promise<TableEditability> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        const tableStmt = this.db.prepare(`
            SELECT type, sql
            FROM sqlite_master
            WHERE name = ? AND type IN ('table', 'view')
            LIMIT 1
        `);
        tableStmt.bind([tableName]);
        const found = tableStmt.step();
        const table = found ? tableStmt.getAsObject() : null;
        tableStmt.free();

        if (!table) {
            return { definition: null, reason: `Table ${tableName} no longer exists.` };
        }
        if (table.type !== 'table') {
            return { definition: null, reason: 'Views cannot be edited safely because they do not expose stable row identity.' };
        }

        const infoStmt = this.db.prepare(`PRAGMA table_info(${this.quoteIdentifier(tableName)})`);
        const columns: Array<{ name: string; notNull: boolean; pkOrder: number }> = [];
        while (infoStmt.step()) {
            const row = infoStmt.getAsObject();
            columns.push({
                name: row.name as string,
                notNull: Boolean(row.notnull),
                pkOrder: Number(row.pk) || 0
            });
        }
        infoStmt.free();

        const createSql = typeof table.sql === 'string' ? table.sql : '';
        const withoutRowid = /\bWITHOUT\s+ROWID\b/i.test(createSql);
        const primaryKeyColumns = columns
            .filter(column => column.pkOrder > 0)
            .sort((a, b) => a.pkOrder - b.pkOrder);
        const indexStmt = this.db.prepare(`PRAGMA index_list(${this.quoteIdentifier(tableName)})`);
        let hasPrimaryKeyIndex = false;
        while (indexStmt.step()) {
            if (indexStmt.getAsObject().origin === 'pk') {
                hasPrimaryKeyIndex = true;
                break;
            }
        }
        indexStmt.free();
        const primaryKeyIsRowidAlias = primaryKeyColumns.length === 1 && !hasPrimaryKeyIndex;
        const primaryKeyIsNonNull = withoutRowid || primaryKeyIsRowidAlias || primaryKeyColumns.every(column => column.notNull);
        if (primaryKeyColumns.length > 0 && primaryKeyIsNonNull) {
            return {
                definition: {
                    kind: 'primaryKey',
                    columns: primaryKeyColumns.map(column => column.name)
                }
            };
        }

        if (withoutRowid) {
            return {
                definition: null,
                reason: 'This WITHOUT ROWID table has no declared primary key and cannot be edited safely.'
            };
        }

        const declaredNames = new Set(columns.map(column => column.name.toLowerCase()));
        const rowidAlias = ['rowid', '_rowid_', 'oid'].find(alias => !declaredNames.has(alias));
        if (!rowidAlias) {
            return {
                definition: null,
                reason: 'This table has no declared primary key and all SQLite rowid aliases are shadowed.'
            };
        }

        return {
            definition: {
                kind: 'rowid',
                columns: [rowidAlias]
            }
        };
    }

    private async getTableDataWithIdentities(tableName: string, limit: number, offset: number): Promise<EditableTableData> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, this.getConfiguredRowLimit('maxTablePageSize', 100000)) : 1000;
        const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
        const editability = await this.getTableEditability(tableName);
        const definition = editability.definition;
        const hiddenIdentity = definition?.kind === 'rowid';
        const identitySelection = hiddenIdentity
            ? `${this.quoteIdentifier(definition.columns[0])} AS ${this.quoteIdentifier('__intelliview_row_identity__')}, `
            : '';
        const identityOrder = definition
            ? ` ORDER BY ${definition.columns.map(column => this.quoteIdentifier(column)).join(', ')}`
            : '';
        const query = `SELECT ${identitySelection}* FROM ${this.quoteIdentifier(tableName)}${identityOrder} LIMIT ? OFFSET ?`;
        const stmt = this.db.prepare(query);
        stmt.bind([safeLimit, safeOffset]);

        let columns = stmt.getColumnNames();
        const rawRows: any[][] = [];
        const identityRows: Array<Array<SQLiteValue | bigint>> = [];
        while (stmt.step()) {
            const identityRow = stmt.get(null, { useBigInt: true }) as Array<SQLiteValue | bigint>;
            identityRows.push(identityRow);
            rawRows.push(identityRow.map(value => {
                if (typeof value !== 'bigint') {
                    return value;
                }
                const numericValue = Number(value);
                return Number.isSafeInteger(numericValue) ? numericValue : value.toString();
            }));
        }
        stmt.free();

        if (hiddenIdentity) {
            columns = columns.slice(1);
        }

        const values = hiddenIdentity ? rawRows.map(row => row.slice(1)) : rawRows;
        const rowIdentities: Array<RowIdentity | null> = identityRows.map(row => {
            if (!definition) {
                return null;
            }
            if (definition.kind === 'rowid') {
                return {
                    kind: 'rowid',
                    parts: [{ column: definition.columns[0], value: this.serializeIdentityValue(row[0]) }]
                };
            }

            return {
                kind: 'primaryKey',
                parts: definition.columns.map(column => {
                    const columnIndex = columns.indexOf(column);
                    if (columnIndex < 0) {
                        throw new Error(`Primary-key column ${column} is missing from the table result.`);
                    }
                    return { column, value: this.serializeIdentityValue(row[columnIndex]) };
                })
            };
        });

        return {
            columns,
            values,
            rowIdentities,
            editable: definition !== null,
            editError: editability.reason
        };
    }

    private processEditedValue(newValue: unknown): SQLiteValue {
        if (newValue === null) {
            return null;
        }
        if (typeof newValue === 'string') {
            const numValue = Number(newValue);
            if (Number.isFinite(numValue) && newValue.trim() !== '' && newValue.trim() === String(numValue)) {
                if (Number.isInteger(numValue) && !Number.isSafeInteger(numValue)) {
                    return newValue;
                }
                return numValue;
            }
            return newValue;
        }
        if (typeof newValue === 'number' && Number.isFinite(newValue)) {
            return newValue;
        }
        if (newValue instanceof Uint8Array) {
            return newValue;
        }
        throw new Error('The edited value is not a supported SQLite value.');
    }

    async updateCellData(tableName: string, identity: RowIdentity, columnName: string, newValue: unknown): Promise<CellUpdateResult> {
        return this.enqueueEdit(() => this.updateCellDataSerialized(tableName, identity, columnName, newValue));
    }

    private async updateCellDataSerialized(tableName: string, identity: RowIdentity, columnName: string, newValue: unknown): Promise<CellUpdateResult> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        const editability = await this.getTableEditability(tableName);
        const definition = editability.definition;
        if (!definition) {
            throw new Error(editability.reason || 'This row cannot be identified safely and uniquely.');
        }

        const tableInfo = await this.getTableInfo(tableName);
        if (!tableInfo.some(column => column.name === columnName)) {
            throw new Error(`Column ${columnName} does not exist in table ${tableName}.`);
        }
        if (!identity || identity.kind !== definition.kind || !Array.isArray(identity.parts)) {
            throw new Error('The selected row identity is missing or no longer matches the table schema. Refresh the table and try again.');
        }
        const suppliedColumns = identity.parts.map(part => part?.column);
        if (
            suppliedColumns.length !== definition.columns.length ||
            suppliedColumns.some((column, index) => column !== definition.columns[index]) ||
            identity.parts.some(part => !part || part.value === undefined)
        ) {
            throw new Error('The selected row identity is incomplete or no longer matches the table schema. Refresh the table and try again.');
        }

        const processedValue = this.processEditedValue(newValue);
        const whereClause = definition.columns
            .map(column => `${this.quoteIdentifier(column)} IS ?`)
            .join(' AND ');
        const updateQuery = `UPDATE ${this.quoteIdentifier(tableName)} SET ${this.quoteIdentifier(columnName)} = ? WHERE ${whereClause}`;
        const parameters = [processedValue, ...identity.parts.map(part => this.deserializeIdentityValue(part.value))];
        let stmt: any = null;
        let transactionOpen = false;
        let committed = false;
        let persistenceComplete = false;
        let databaseStateBeforeUpdate: Uint8Array | undefined;
        let fileStateBeforeUpdate: Buffer | undefined;

        try {
            databaseStateBeforeUpdate = this.db.export();
            this.db.run('BEGIN IMMEDIATE TRANSACTION');
            transactionOpen = true;
            stmt = this.db.prepare(updateQuery);
            stmt.run(parameters);
            stmt.free();
            stmt = null;

            const changes = Number(this.db.getRowsModified());
            if (changes === 0) {
                throw new Error('No row was updated. The record may have changed or been deleted; refresh the table and try again.');
            }
            if (changes !== 1) {
                throw new Error(`Critical update failure: expected one changed row but SQLite reported ${changes}. The update was rolled back.`);
            }

            fileStateBeforeUpdate = this.captureFileState();
            this.db.run('COMMIT');
            transactionOpen = false;
            committed = true;

            const nextIdentity: RowIdentity = {
                kind: identity.kind,
                parts: identity.parts.map(part => ({
                    column: part.column,
                    value: part.column === columnName ? this.serializeIdentityValue(processedValue) : part.value
                }))
            };

            const databaseStateAfterUpdate = this.db.export();
            await this.saveChangesToFile(databaseStateAfterUpdate);
            persistenceComplete = true;
            if (this.currentDatabasePath) {
                markInternalUpdate(this.currentDatabasePath);
            }

            return {
                changes,
                identity: nextIdentity,
                value: processedValue
            };
        } catch (error) {
            if (stmt) {
                stmt.free();
            }
            let restoreSnapshot = committed && !persistenceComplete;
            if (transactionOpen) {
                try {
                    this.db.run('ROLLBACK');
                } catch {
                    restoreSnapshot = true;
                } finally {
                    transactionOpen = false;
                }
            }
            if (restoreSnapshot && databaseStateBeforeUpdate) {
                try {
                    this.restoreDatabaseState(databaseStateBeforeUpdate, fileStateBeforeUpdate);
                } catch (restoreError) {
                    throw new Error(`Failed to update cell: ${error}. Failed to restore the previous database state: ${restoreError}`);
                }
            }
            throw new Error(`Failed to update cell: ${error}`);
        }
    }

    private captureFileState(): Buffer {
        if (!this.currentDatabasePath) {
            throw new Error('No database path available for saving');
        }

        return fs.readFileSync(this.currentDatabasePath);
    }

    private restoreDatabaseState(databaseState: Uint8Array, fileState?: Buffer): void {
        const modifiedDatabase = this.db;
        this.db = new this.SQL.Database(databaseState);
        modifiedDatabase?.close();

        if (this.currentDatabasePath && fileState) {
            fs.writeFileSync(this.currentDatabasePath, fileState);
        }
        if (this.tempDecryptedPath) {
            fs.writeFileSync(this.tempDecryptedPath, Buffer.from(databaseState));
        }
    }

    async deleteRow(tableName: string, rowIdentifier: any): Promise<void> {
        return this.enqueueEdit(() => this.deleteRowSerialized(tableName, rowIdentifier));
    }

    private async deleteRowSerialized(tableName: string, rowIdentifier: any): Promise<void> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        this.debugLog('DeleteRow', 'Starting row deletion:', {
            tableName,
            rowIdentifier
        });

        // Sanitize table name
        const sanitizedTableName = tableName.replace(/"/g, '""');
        let stmt: any = null;
        let countStmt: any = null;
        let transactionOpen = false;
        let committed = false;
        let persistenceComplete = false;
        let databaseStateBeforeDelete: Uint8Array | undefined;
        let fileStateBeforeDelete: Buffer | undefined;
        
        try {
            let deleteQuery: string;
            let parameters: any[];

            // Handle different types of row identifiers
            if (typeof rowIdentifier === 'object' && rowIdentifier !== null) {
                if (rowIdentifier.column && rowIdentifier.value !== undefined) {
                    // Simple column-value identifier (e.g., {column: "id", value: 1})
                    const sanitizedColumnName = rowIdentifier.column.replace(/"/g, '""');
                    deleteQuery = `DELETE FROM "${sanitizedTableName}" WHERE "${sanitizedColumnName}" = ?`;
                    parameters = [rowIdentifier.value];
                } else {
                    // Multiple column identifier (e.g., {name: "John", email: "john@example.com"})
                    const whereConditions: string[] = [];
                    parameters = [];
                    
                    for (const [columnName, value] of Object.entries(rowIdentifier)) {
                        const sanitizedColumnName = columnName.replace(/"/g, '""');
                        if (value === null) {
                            whereConditions.push(`"${sanitizedColumnName}" IS NULL`);
                        } else {
                            whereConditions.push(`"${sanitizedColumnName}" = ?`);
                            parameters.push(value);
                        }
                    }
                    
                    if (whereConditions.length === 0) {
                        throw new Error('No valid identifier columns provided');
                    }
                    
                    deleteQuery = `DELETE FROM "${sanitizedTableName}" WHERE ${whereConditions.join(' AND ')}`;
                }
            } else {
                throw new Error('Invalid row identifier format');
            }
            
            this.debugLog('DeleteRow', 'Executing query:', deleteQuery);
            this.debugLog('DeleteRow', 'Parameters:', parameters);

            databaseStateBeforeDelete = this.db.export();
            this.db.run('BEGIN IMMEDIATE TRANSACTION');
            transactionOpen = true;
            stmt = this.db.prepare(deleteQuery);
            stmt.run(parameters);
            stmt.free();
            stmt = null;

            const changes = Number(this.db.getRowsModified());
            if (changes === 0) {
                throw new Error('No row was deleted. The record may have changed or already been deleted; refresh the table and try again.');
            }
            if (changes !== 1) {
                throw new Error(`Critical delete failure: expected one changed row but SQLite reported ${changes}. The deletion was rolled back.`);
            }
            
            this.debugLog('DeleteRow', 'Delete query executed successfully');
            
            // Verify the deletion by checking row count
            const countQuery = `SELECT COUNT(*) as count FROM "${sanitizedTableName}"`;
            countStmt = this.db.prepare(countQuery);
            const countResult = countStmt.step();
            const rowCount = countResult ? countStmt.get()[0] : 0;
            countStmt.free();
            countStmt = null;
            
            this.debugLog('DeleteRow', `Rows remaining in table: ${rowCount}`);
            
            fileStateBeforeDelete = this.captureFileState();
            this.db.run('COMMIT');
            transactionOpen = false;
            committed = true;

            const databaseStateAfterDelete = this.db.export();
            await this.saveChangesToFile(databaseStateAfterDelete);
            persistenceComplete = true;
            // Mark as internal update so watcher ignores this event
            if (this.currentDatabasePath) {
                markInternalUpdate(this.currentDatabasePath);
            }
            
            this.debugLog('DeleteRow', 'Row deletion completed successfully');
            
        } catch (error) {
            stmt?.free();
            countStmt?.free();
            let restoreSnapshot = committed && !persistenceComplete;
            if (transactionOpen) {
                try {
                    this.db.run('ROLLBACK');
                } catch {
                    restoreSnapshot = true;
                } finally {
                    transactionOpen = false;
                }
            }
            if (restoreSnapshot && databaseStateBeforeDelete) {
                try {
                    this.restoreDatabaseState(databaseStateBeforeDelete, fileStateBeforeDelete);
                } catch (restoreError) {
                    throw new Error(`Failed to delete row: ${error}. Failed to restore the previous database state: ${restoreError}`);
                }
            }
            this.debugError('DeleteRow', 'Failed to delete row:', error);
            throw new Error(`Failed to delete row: ${error}`);
        }
    }

    /**
     * Save changes from the in-memory database back to the file
     */
    private async saveChangesToFile(databaseState?: Uint8Array): Promise<void> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        this.debugLog('SaveFile', 'Starting save operation');
        this.debugLog('SaveFile', `Current database path: ${this.currentDatabasePath}`);
        this.debugLog('SaveFile', `Temp decrypted path: ${this.tempDecryptedPath}`);

        try {
            // Reuse the caller's committed export when available.
            const data = databaseState ?? this.db.export();
            const buffer = Buffer.from(data);
            
            this.debugLog('SaveFile', `Exported ${buffer.length} bytes`);
            
            // Write back to the original file (not the temp decrypted file if using encryption)
            const targetPath = this.currentDatabasePath;
            if (!targetPath) {
                throw new Error('No database path available for saving');
            }

            // If we're working with an encrypted database, we need to re-encrypt
            if (this.tempDecryptedPath) {
                this.debugLog('SaveFile', 'Saving to encrypted database');
                // Write to temp file first, then re-encrypt
                fs.writeFileSync(this.tempDecryptedPath, buffer);
                await this.reEncryptDatabase(targetPath);
            } else {
                this.debugLog('SaveFile', `Saving to unencrypted database: ${targetPath}`);
                // Direct write to unencrypted database
                fs.writeFileSync(targetPath, buffer);
            }
            
            this.debugLog('SaveFile', 'Changes saved to database file successfully');
            
        } catch (error) {
            this.debugError('SaveFile', 'Failed to save changes to file:', error);
            throw new Error(`Failed to save changes: ${error}`);
        }
    }

    /**
     * Re-encrypt the database file after making changes
     */
    private async reEncryptDatabase(originalPath: string): Promise<void> {
        if (!this.tempDecryptedPath || !this.currentEncryptionKey) {
            throw new Error('Cannot re-encrypt: missing decrypted file or encryption key');
        }

        try {
            await this.ensureSqlCipherAvailable();
            // Create a new temporary encrypted file
            const tempDir = require('os').tmpdir();
            const tempEncryptedFile = path.join(tempDir, `encrypted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.db`);
            
            // Escape the encryption key
            const escapedKey = this.currentEncryptionKey.replace(/'/g, "''");
            const escapedTempEncryptedPath = tempEncryptedFile.replace(/'/g, "''");
            
            const sqlCommands = [
                `ATTACH DATABASE '${escapedTempEncryptedPath}' AS encrypted KEY '${escapedKey}';`,
                `SELECT sqlcipher_export('encrypted');`,
                `DETACH DATABASE encrypted;`,
                `.quit`
            ].join('\n') + '\n';
            
            this.debugLog('ReEncrypt', 'Re-encrypting database with SQLCipher...');
            await this.runSqlCipher(this.tempDecryptedPath, sqlCommands);
            
            // Verify the encrypted file was created
            if (!fs.existsSync(tempEncryptedFile)) {
                throw new Error('Failed to create re-encrypted database file');
            }
            
            // Replace the original file with the new encrypted version
            fs.copyFileSync(tempEncryptedFile, originalPath);
            
            // Cleanup failure does not invalidate the successfully replaced database.
            try {
                fs.unlinkSync(tempEncryptedFile);
            } catch (error) {
                this.debugWarn('ReEncrypt', `Failed to remove temporary encrypted file ${tempEncryptedFile}:`, error);
            }
            
            this.debugLog('ReEncrypt', 'Database re-encrypted successfully');
            
        } catch (error) {
            this.debugError('ReEncrypt', 'Re-encryption error:', error);
            throw new Error(`Failed to re-encrypt database: ${error}`);
        }
    }

    async getTableSchema(tableName: string): Promise<QueryResult> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        // Use executeQuery instead of direct prepared statements to ensure
        // compatibility with SQLCipher encrypted databases
        const query = `PRAGMA table_info(${this.quoteIdentifier(tableName)})`;
        const result = await this.executeQuery(query);
        
        return result;
    }

    async getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        const stmt = this.db.prepare(`PRAGMA foreign_key_list(${this.quoteIdentifier(tableName)})`);
        const foreignKeys: ForeignKeyInfo[] = [];
        
        while (stmt.step()) {
            const row = stmt.getAsObject();
            foreignKeys.push({
                column: row.from as string,
                referencedTable: row.table as string,
                referencedColumn: row.to as string
            });
        }
        stmt.free();

        return foreignKeys;
    }

    /**
     * Return all rowids that have been inserted/updated/deleted since `sinceIso`.
     * (we only emit INSERT for now; UPDATE/DELETE detection requires WAL or
     * triggers or a real diffing engine)
     */
    public async getTableChangesSince(tableName: string, sinceIso: string): Promise<Change[]> {
        // simple implementation: just re-emit every current row as "INSERT"
        const all = await this.executeQuery(`SELECT rowid FROM "${tableName}"`);
        return all.values.map(r => ({ rowid: r[0], changeType: 'INSERT' as const }));
    }

    /**
     * Given a rowid, find its zero-based position in the current table scan
     */
    public async getRowIndex(tableName: string, rowid: any): Promise<number> {
        const r = await this.executeQuery(
            `SELECT COUNT(*) FROM "${tableName}" WHERE rowid <= ${rowid}`
        );
        // subtract one because COUNT<= gives a 1-based rank
        return (r.values[0][0] as number) - 1;
    }

    /**
     * Fetch the full row data for a set of rowids, keeping the same order.
     */
    public async getRowsByRowid(tableName: string, rowids: any[]): Promise<any[][]> {
        if (!rowids.length) { return []; }
        const cases = rowids.map((id, i) => `WHEN rowid=${id} THEN ${i}`).join(' ');
        const sql = `
            SELECT * 
              FROM "${tableName}"
             WHERE rowid IN (${rowids.join(',')})
          ORDER BY CASE ${cases} END
        `;
        const r = await this.executeQuery(sql);
        return r.values;
    }

    closeDatabase(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        
        // Clear stored paths and keys
        this.currentDatabasePath = null;
        this.currentEncryptionKey = null;
        
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
