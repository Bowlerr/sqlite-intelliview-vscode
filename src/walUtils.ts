import * as fs from 'fs';
import * as path from 'path';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { Buffer } from 'buffer';

declare const process: {
    env: Record<string, string | undefined>;
    platform: string;
    arch: string;
};

declare const __dirname: string;

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * WAL (Write-Ahead Logging) utility functions for SQLite databases.
 * Provides detection, checkpoint, and monitoring capabilities for WAL files.
 */

const isDevelopment = process.env.NODE_ENV === 'development' || (typeof process !== 'undefined' && process.env.VSCODE_PID !== undefined);

function debugLog(message: string, ...args: any[]): void {
    if (isDevelopment) {
        console.log(`[WAL Utils] ${message}`, ...args);
    }
}

function debugWarn(message: string, ...args: any[]): void {
    if (isDevelopment) {
        console.warn(`[WAL Utils] ${message}`, ...args);
    }
}

function debugError(message: string, ...args: any[]): void {
    if (isDevelopment) {
        console.error(`[WAL Utils] ${message}`, ...args);
    }
}

export type Sqlite3CliSource = 'bundled' | 'system';

export interface Sqlite3CliInfo {
    command: string;
    source: Sqlite3CliSource;
}

export interface WalFilePaths {
    walPath: string;
    shmPath: string;
}

export interface WalStatus {
    hasWal: boolean;
    walSize: number;
    shmSize: number;
    walPath: string;
    shmPath: string;
}

export type WalCheckpointMode = 'full' | 'passive' | 'off';

function toSqliteWalCheckpointMode(mode: Exclude<WalCheckpointMode, 'off'>): 'FULL' | 'PASSIVE' {
    return mode === 'passive' ? 'PASSIVE' : 'FULL';
}

function getSqlite3ExecutableName(): string {
    return process.platform === 'win32' ? 'sqlite3.exe' : 'sqlite3';
}

function getBundledSqlite3Candidates(): string[] {
    const extensionRoot = path.resolve(__dirname, '..');
    const exe = getSqlite3ExecutableName();
    const platformArch = `${process.platform}-${process.arch}`;
    const binRoot = path.join(extensionRoot, 'bin');

    // Support a few layouts so packaging can evolve without code churn.
    const candidates = [
        path.join(extensionRoot, 'bin', platformArch, exe),
        path.join(extensionRoot, 'bin', process.platform, process.arch, exe),
        path.join(extensionRoot, 'bin', exe)
    ];

    // Also support official sqlite.org extracted archive folders like:
    //   bin/sqlite-tools-linux-x64-3510200/sqlite3
    //   bin/sqlite-tools-win-x64-3510200/sqlite3.exe
    //   bin/sqlite-tools-osx-arm64-3510200/sqlite3
    try {
        const sqliteToolPlatform =
            process.platform === 'win32' ? 'win' :
            process.platform === 'darwin' ? 'osx' :
            process.platform === 'linux' ? 'linux' :
            process.platform;

        const prefix = `sqlite-tools-${sqliteToolPlatform}-${process.arch}-`;
        for (const entry of fs.readdirSync(binRoot, { withFileTypes: true })) {
            if (!entry.isDirectory() || !entry.name.startsWith(prefix)) {
                continue;
            }
            candidates.push(path.join(binRoot, entry.name, exe));
        }
    } catch {
        // Ignore missing/unreadable bin directory here; higher-level checks handle absence.
    }

    return candidates;
}

function isExecutableFile(filePath: string): boolean {
    try {
        const mode = process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK;
        fs.accessSync(filePath, mode);
        return true;
    } catch {
        return false;
    }
}

function getBundledSqlite3Path(): string | null {
    for (const candidate of getBundledSqlite3Candidates()) {
        if (isExecutableFile(candidate)) {
            return candidate;
        }
    }
    return null;
}

export async function getSqlite3CliInfo(): Promise<Sqlite3CliInfo | null> {
    const bundledPath = getBundledSqlite3Path();
    if (bundledPath) {
        try {
            await execFileAsync(bundledPath, ['-version']);
            return { command: bundledPath, source: 'bundled' };
        } catch (error: any) {
            debugWarn('Bundled sqlite3 found but could not be executed, falling back to PATH lookup:', error?.message || error);
        }
    }

    try {
        await execFileAsync('sqlite3', ['-version']);
        return { command: 'sqlite3', source: 'system' };
    } catch (error: any) {
        debugLog('System sqlite3 unavailable:', error?.message || error);
        return null;
    }
}

/**
 * Get the file paths for WAL and SHM files associated with a database.
 * @param dbPath Path to the database file
 * @returns Object containing walPath and shmPath
 */
export function getWalFilePaths(dbPath: string): WalFilePaths {
    return {
        walPath: `${dbPath}-wal`,
        shmPath: `${dbPath}-shm`
    };
}

/**
 * Check if a database has associated WAL files.
 * @param dbPath Path to the database file
 * @returns Promise<boolean> indicating if WAL files exist
 */
export async function hasWalFiles(dbPath: string): Promise<boolean> {
    const { walPath, shmPath } = getWalFilePaths(dbPath);
    
    try {
        // Check if at least the WAL file exists
        const walExists = fs.existsSync(walPath);
        if (walExists) {
            debugLog(`WAL file found: ${walPath}`);
        }
        
        // SHM file is optional - WAL can exist without it
        const shmExists = fs.existsSync(shmPath);
        if (shmExists) {
            debugLog(`SHM file found: ${shmPath}`);
        }
        
        return walExists;
    } catch (error) {
        debugError('Error checking for WAL files:', error);
        return false;
    }
}

/**
 * Check if the WAL file contains uncommitted data.
 * @param walPath Path to the WAL file
 * @returns Promise<boolean> indicating if WAL has data
 */
export async function walHasData(walPath: string): Promise<boolean> {
    try {
        if (!fs.existsSync(walPath)) {
            return false;
        }
        
        const stats = fs.statSync(walPath);
        const hasData = stats.size > 0;
        
        if (hasData) {
            debugLog(`WAL file has ${stats.size} bytes of data`);
        } else {
            debugLog('WAL file is empty');
        }
        
        return hasData;
    } catch (error) {
        debugError('Error checking WAL file size:', error);
        return false;
    }
}

/**
 * Checkpoint a WAL file, merging its contents into the main database.
 * This uses SQLite's PRAGMA wal_checkpoint(<MODE>) command.
 * 
 * @param dbPath Path to the database file
 * @param encryptionKey Optional SQLCipher encryption key
 * @param mode WAL checkpoint mode ('full' | 'passive' | 'off')
 * @returns Promise<void>
 * @throws Error if checkpoint fails
 */
export async function checkpointWal(dbPath: string, encryptionKey?: string, mode: WalCheckpointMode = 'full'): Promise<void> {
    if (mode === 'off') {
        debugLog(`WAL checkpoint skipped (mode=off) for: ${dbPath}`);
        return;
    }

    debugLog(`Starting WAL checkpoint for: ${dbPath} (mode=${mode})`);
    
    // First check if WAL file exists and has data
    const { walPath } = getWalFilePaths(dbPath);
    if (!await walHasData(walPath)) {
        debugLog('WAL file is empty or does not exist, skipping checkpoint');
        return;
    }
    
    try {
        if (encryptionKey) {
            await checkpointEncryptedWal(dbPath, encryptionKey, mode);
        } else {
            await checkpointUnencryptedWal(dbPath, mode);
        }
        
        debugLog('WAL checkpoint completed successfully');
    } catch (error: any) {
        // Parse error message for specific error types
        const errorMessage = error.message || String(error);
        
        if (errorMessage.includes('database is locked') || errorMessage.includes('SQLITE_BUSY')) {
            debugWarn('Database is locked by another process, cannot checkpoint');
            throw new Error('DATABASE_LOCKED: The database is currently in use by another process. Data may be stale.');
        } else if (errorMessage.includes('EACCES') || errorMessage.includes('EPERM') || errorMessage.includes('readonly')) {
            debugWarn('Insufficient permissions to checkpoint WAL file');
            throw new Error('PERMISSION_DENIED: Cannot checkpoint WAL due to read-only access. Data may be stale.');
        } else if (errorMessage.includes('database disk image is malformed') || errorMessage.includes('corrupt')) {
            debugError('WAL file appears to be corrupted');
            throw new Error('CORRUPTED_WAL: The WAL file appears to be corrupted. Database may be in an inconsistent state.');
        } else {
            debugError('Unexpected error during checkpoint:', error);
            throw new Error(`Failed to checkpoint WAL: ${errorMessage}`);
        }
    }
}

/**
 * Checkpoint an unencrypted database using sqlite3 CLI.
 * Uses the system sqlite3 command which is reliable across all platforms.
 * @param dbPath Path to the database file
 */
async function checkpointUnencryptedWal(dbPath: string, mode: Exclude<WalCheckpointMode, 'off'>): Promise<void> {
    const sqlite3Cli = await getSqlite3CliInfo();
    if (!sqlite3Cli) {
        throw new Error('sqlite3 CLI not available (bundled or on PATH)');
    }

    debugLog(`Attempting checkpoint with sqlite3 CLI (${sqlite3Cli.source}, mode=${mode})`);
    
    try {
        // Use execFile to safely pass arguments without shell interpolation
        // This prevents shell injection and handles paths with spaces/special chars
        const pragmaMode = toSqliteWalCheckpointMode(mode);
        const { stdout, stderr } = await execFileAsync(sqlite3Cli.command, [dbPath, `PRAGMA wal_checkpoint(${pragmaMode});`]);
        
        if (stderr && stderr.trim()) {
            debugWarn('sqlite3 CLI stderr:', stderr);
        }
        
        debugLog('sqlite3 CLI checkpoint successful');
    } catch (error: any) {
        throw new Error(`sqlite3 CLI checkpoint failed: ${error.message}`);
    }
}

/**
 * Check if SQLCipher is available on the system.
 * Uses cross-platform command detection.
 * @returns Promise<boolean> indicating if SQLCipher is available
 */
async function isSqlCipherAvailable(): Promise<boolean> {
    try {
        // Try to execute sqlcipher -version
        // This is cross-platform and works on Windows, macOS, and Linux
        await execAsync('sqlcipher -version');
        return true;
    } catch (error: any) {
        // ENOENT means command not found
        // Non-zero exit code also indicates absence or error
        debugLog('SQLCipher not available:', error.message);
        return false;
    }
}

/**
 * Checkpoint an encrypted database using SQLCipher CLI.
 * Uses stdin to pass the encryption key securely without exposing it on the command line.
 * @param dbPath Path to the database file
 * @param encryptionKey SQLCipher encryption key
 */
async function checkpointEncryptedWal(
    dbPath: string,
    encryptionKey: string,
    mode: Exclude<WalCheckpointMode, 'off'>
): Promise<void> {
    debugLog(`Attempting checkpoint with SQLCipher CLI (mode=${mode})`);
    
    // Check if sqlcipher is available using cross-platform detection
    const sqlCipherAvailable = await isSqlCipherAvailable();
    if (!sqlCipherAvailable) {
        throw new Error('SQLCipher not found. Please install SQLCipher to checkpoint encrypted databases with WAL mode.');
    }
    
    return new Promise((resolve, reject) => {
        // Spawn sqlcipher with database path as argument (no shell interpolation)
        const sqlcipher = spawn('sqlcipher', [dbPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        let errorOccurred = false;
        
        // Set timeout to prevent hanging
        const timeout = setTimeout(() => {
            errorOccurred = true;
            sqlcipher.kill();
            reject(new Error('SQLCipher checkpoint timed out after 30 seconds'));
        }, 30000);
        
        // Collect stdout
        sqlcipher.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });
        
        // Collect stderr
        sqlcipher.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });
        
        // Handle process exit
        sqlcipher.on('close', (code: number | null) => {
            clearTimeout(timeout);
            
            if (errorOccurred) {
                return; // Already rejected by timeout or error handler
            }
            
            if (stderr && stderr.trim()) {
                debugWarn('SQLCipher checkpoint stderr:', stderr);
                
                // Check for specific errors
                if (stderr.includes('database is locked')) {
                    return reject(new Error('database is locked'));
                } else if (stderr.includes('file is not a database') || stderr.includes('wrong key')) {
                    return reject(new Error('Invalid encryption key provided'));
                }
            }
            
            if (code === 0) {
                debugLog('SQLCipher checkpoint completed');
                resolve();
            } else {
                reject(new Error(`SQLCipher exited with code ${code}: ${stderr || stdout}`));
            }
        });
        
        // Handle spawn errors (e.g., command not found)
        sqlcipher.on('error', (err: Error) => {
            clearTimeout(timeout);
            errorOccurred = true;
            reject(new Error(`Failed to spawn sqlcipher: ${err.message}`));
        });
        
        // Escape the encryption key for SQL
        const escapedKey = encryptionKey.replace(/'/g, "''");
        
        // Write SQL commands to stdin securely (key never appears in process list)
        const pragmaMode = toSqliteWalCheckpointMode(mode);
        const sqlCommands = `PRAGMA key = '${escapedKey}';\nPRAGMA busy_timeout = 5000;\nPRAGMA wal_checkpoint(${pragmaMode});\n.quit\n`;
        
        sqlcipher.stdin.write(sqlCommands, (err?: Error | null) => {
            if (err) {
                errorOccurred = true;
                sqlcipher.kill();
                clearTimeout(timeout);
                reject(new Error(`Failed to write to sqlcipher stdin: ${err.message}`));
            } else {
                // Close stdin to signal end of input
                sqlcipher.stdin.end();
            }
        });
    });
}

/**
 * Checkpoint a WAL file with retry logic for handling locked databases.
 * @param dbPath Path to the database file
 * @param encryptionKey Optional SQLCipher encryption key
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @returns Promise<boolean> indicating if checkpoint was successful
 */
export async function checkpointWalWithRetry(
    dbPath: string, 
    encryptionKey?: string,
    mode: WalCheckpointMode = 'full',
    maxRetries: number = 3
): Promise<boolean> {
    if (mode === 'off') {
        debugLog(`Skipping WAL checkpoint retry loop (mode=off) for: ${dbPath}`);
        return true;
    }

    let attempt = 0;
    let lastError: Error | null = null;
    
    while (attempt < maxRetries) {
        try {
            await checkpointWal(dbPath, encryptionKey, mode);
            return true;
        } catch (error: any) {
            lastError = error;
            const errorMessage = error.message || String(error);
            
            // Only retry for locked database errors
            if (errorMessage.includes('DATABASE_LOCKED')) {
                attempt++;
                if (attempt < maxRetries) {
                    // Exponential backoff: 500ms, 1000ms, 2000ms
                    const delay = 500 * Math.pow(2, attempt - 1);
                    debugLog(`Database locked, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    debugWarn(`Failed to checkpoint after ${maxRetries} attempts`);
                    return false;
                }
            } else {
                // For non-lock errors, don't retry
                debugError('Non-recoverable checkpoint error:', errorMessage);
                return false;
            }
        }
    }
    
    return false;
}

/**
 * Get information about a database's WAL status.
 * @param dbPath Path to the database file
 * @returns Object with WAL status information
 */
export async function getWalStatus(dbPath: string): Promise<WalStatus> {
    const { walPath, shmPath } = getWalFilePaths(dbPath);
    
    let walSize = 0;
    let shmSize = 0;
    
    try {
        if (fs.existsSync(walPath)) {
            walSize = fs.statSync(walPath).size;
        }
    } catch (error) {
        debugWarn('Could not get WAL file size:', error);
    }
    
    try {
        if (fs.existsSync(shmPath)) {
            shmSize = fs.statSync(shmPath).size;
        }
    } catch (error) {
        debugWarn('Could not get SHM file size:', error);
    }
    
    return {
        hasWal: walSize > 0,
        walSize,
        shmSize,
        walPath,
        shmPath
    };
}
