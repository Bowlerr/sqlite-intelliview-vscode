import * as vscode from 'vscode';
import * as path from 'path';

/**
 * DatabaseWatcher manages FileSystemWatchers for database files.
 * It notifies via callback when a watched file changes.
 */
export class DatabaseWatcher {
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();

    /**
     * Add a watcher for a database file.
     * @param filePath Absolute path to the database file
     * @param onChange Callback to invoke on file change
     */
    addWatcher(filePath: string, onChange: () => void) {
        if (this.watchers.has(filePath)) {
            return;
        }
        // Use a glob pattern for the file in its directory
        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        const pattern = new vscode.RelativePattern(dir, base);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        // Debounce map to prevent rapid duplicate triggers
        const debounceMap: Map<string, NodeJS.Timeout> = (this as any)._debounceMap || new Map();
        (this as any)._debounceMap = debounceMap;
        const DEBOUNCE_MS = 150;
        const filterEvent = (uri: vscode.Uri) => {
            if (uri.fsPath === filePath) {
                if (isInternalUpdate(filePath)) {
                    // Suppress this event, it was triggered by our own write
                    return;
                }
                if (debounceMap.has(filePath)) {
                    clearTimeout(debounceMap.get(filePath));
                }
                debounceMap.set(filePath, setTimeout(() => {
                    onChange();
                    debounceMap.delete(filePath);
                }, DEBOUNCE_MS));
            }
        };
        watcher.onDidChange(filterEvent);
        watcher.onDidCreate(filterEvent);
        watcher.onDidDelete(filterEvent);
        this.watchers.set(filePath, watcher);
    }

    /**
     * Remove and dispose the watcher for a file.
     * @param filePath Absolute path to the database file
     */
    removeWatcher(filePath: string) {
        const watcher = this.watchers.get(filePath);
        if (watcher) {
            watcher.dispose();
            this.watchers.delete(filePath);
        }
    }

    /**
     * Dispose all watchers.
     */
    disposeAll() {
        for (const watcher of this.watchers.values()) {
            watcher.dispose();
        }
        this.watchers.clear();
    }
}

// Internal update suppression
const internalUpdateTimestamps = new Map<string, number>(); // Map<dbPath, number>
const INTERNAL_UPDATE_WINDOW_MS = 1500; // 1.5 seconds debounce

// When the extension writes to the database (e.g., after a cell edit, insert, or delete), call:
export function markInternalUpdate(dbPath: string): void {
  internalUpdateTimestamps.set(dbPath, Date.now());
}

// In the file watcher or change handler:
export function isInternalUpdate(dbPath: string): boolean {
  const last = internalUpdateTimestamps.get(dbPath);
  if (!last) {
    return false;
  }
  const now = Date.now();
  if (now - last < INTERNAL_UPDATE_WINDOW_MS) {
    // Clear the flag so only one event is suppressed
    internalUpdateTimestamps.delete(dbPath);
    return true;
  }
  return false;
}

// Example integration in a watcher callback:
// fs.watch(dbPath, (eventType, filename) => {
//   if (isInternalUpdate(dbPath)) {
//     // Ignore this event, it was triggered by our own write
//     return;
//   }
//   // ...existing code for handling external changes...
// });
