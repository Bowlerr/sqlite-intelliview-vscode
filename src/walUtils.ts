import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

/**
 * Get the file paths for WAL and SHM files associated with a database.
 * @param dbPath Path to the database file
 * @returns Object containing walPath and shmPath
 */
export function getWalFilePaths(dbPath: string): { walPath: string; shmPath: string } {
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
 * This uses SQLite's PRAGMA wal_checkpoint(FULL) command.
 * 
 * @param dbPath Path to the database file
 * @param encryptionKey Optional SQLCipher encryption key
 * @returns Promise<void>
 * @throws Error if checkpoint fails
 */
export async function checkpointWal(dbPath: string, encryptionKey?: string): Promise<void> {
    debugLog(`Starting WAL checkpoint for: ${dbPath}`);
    
    // First check if WAL file exists and has data
    const { walPath } = getWalFilePaths(dbPath);
    if (!await walHasData(walPath)) {
        debugLog('WAL file is empty or does not exist, skipping checkpoint');
        return;
    }
    
    try {
        if (encryptionKey) {
            await checkpointEncryptedWal(dbPath, encryptionKey);
        } else {
            await checkpointUnencryptedWal(dbPath);
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
async function checkpointUnencryptedWal(dbPath: string): Promise<void> {
    debugLog('Attempting checkpoint with sqlite3 CLI');
    
    try {
        // Use sqlite3 CLI which is reliable in VS Code extension context
        const { stdout, stderr } = await execAsync(`sqlite3 "${dbPath}" "PRAGMA wal_checkpoint(FULL);"`);
        
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
 * @param dbPath Path to the database file
 * @param encryptionKey SQLCipher encryption key
 */
async function checkpointEncryptedWal(dbPath: string, encryptionKey: string): Promise<void> {
    debugLog('Attempting checkpoint with SQLCipher CLI');
    
    try {
        // Check if sqlcipher is available using cross-platform detection
        const sqlCipherAvailable = await isSqlCipherAvailable();
        if (!sqlCipherAvailable) {
            throw new Error('SQLCipher not found. Please install SQLCipher to checkpoint encrypted databases with WAL mode.');
        }
        
        // Escape the encryption key to handle special characters
        const escapedKey = encryptionKey.replace(/'/g, "''");
        
        // Use sqlcipher to checkpoint the WAL
        // We open the database, set the key, and run the checkpoint command
        const checkpointCommand = `echo "PRAGMA key = '${escapedKey}'; PRAGMA busy_timeout = 5000; PRAGMA wal_checkpoint(FULL);" | sqlcipher "${dbPath}"`;
        
        debugLog('Running SQLCipher checkpoint command');
        const result = await execAsync(checkpointCommand);
        
        if (result.stderr && result.stderr.trim()) {
            debugWarn('SQLCipher checkpoint stderr:', result.stderr);
            // Check for errors in stderr
            if (result.stderr.includes('database is locked')) {
                throw new Error('database is locked');
            } else if (result.stderr.includes('file is not a database') || result.stderr.includes('wrong key')) {
                throw new Error('Invalid encryption key provided');
            }
        }
        
        debugLog('SQLCipher checkpoint completed');
    } catch (error: any) {
        debugError('SQLCipher checkpoint error:', error);
        throw error;
    }
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
    maxRetries: number = 3
): Promise<boolean> {
    let attempt = 0;
    let lastError: Error | null = null;
    
    while (attempt < maxRetries) {
        try {
            await checkpointWal(dbPath, encryptionKey);
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
export async function getWalStatus(dbPath: string): Promise<{
    hasWal: boolean;
    walSize: number;
    shmSize: number;
    walPath: string;
    shmPath: string;
}> {
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
