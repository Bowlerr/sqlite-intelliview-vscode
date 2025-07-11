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
        const filterEvent = (uri: vscode.Uri) => {
            if (uri.fsPath === filePath) {
                onChange();
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
