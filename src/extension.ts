// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DatabaseEditorProvider } from './databaseEditorProvider';
import { DatabaseExplorerProvider } from './databaseExplorerProvider';

let databaseExplorerProvider: DatabaseExplorerProvider;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the debug system to output diagnostic information in development
	// This line of code will only be executed once when your extension is activated
	
	// Debug logging (only in development mode)
	const isDevelopment = process.env.NODE_ENV === 'development' || vscode.env.appName.includes('Dev');
	if (isDevelopment) {
		console.log('[Extension] SQLite IntelliView extension is now active!');
	}

	// Initialize the database explorer provider
	databaseExplorerProvider = new DatabaseExplorerProvider();

	// Register the custom editor provider
	context.subscriptions.push(DatabaseEditorProvider.register(context));

	// Register the tree view
	const treeView = vscode.window.createTreeView('sqlite-intelliview-vscode.databaseExplorer', {
		treeDataProvider: databaseExplorerProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(treeView);

	// Register commands
	const openDatabaseCommand = vscode.commands.registerCommand('sqlite-intelliview-vscode.openDatabase', async (uri?: vscode.Uri) => {
		const isDatabaseFile = (target: vscode.Uri) => {
			return ['.db', '.sqlite', '.sqlite3'].some(ext => target.fsPath.toLowerCase().endsWith(ext));
		};

		let dbUri: vscode.Uri | undefined = uri;

		if (!dbUri) {
			const result = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: {
					'SQLite Database': ['db', 'sqlite', 'sqlite3'],
					'All Files': ['*']
				}
			});

			if (!result || result.length === 0) {
				return;
			}

			dbUri = result[0];
		}

		if (!isDatabaseFile(dbUri)) {
			vscode.window.showWarningMessage('Selected file is not a recognized database file');
			return;
		}

		// Open with our custom editor (opening as text will often succeed but won't use the SQLite UI).
		await vscode.commands.executeCommand('vscode.openWith', dbUri, DatabaseEditorProvider.viewType);

		// Populate the Database Explorer (best-effort; encrypted DBs will require a key).
		try {
			await databaseExplorerProvider.setDatabase(dbUri.fsPath);
		} catch {
			// DatabaseExplorerProvider already shows a useful error message.
		}
	});

	const connectWithKeyCommand = vscode.commands.registerCommand('sqlite-intelliview-vscode.connectWithKey', async () => {
		const encryptionKey = await vscode.window.showInputBox({
			prompt: 'Enter SQLCipher encryption key',
			password: true,
			placeHolder: 'Encryption key for SQLCipher database'
		});

		if (encryptionKey) {
			const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
			const isDatabaseFile = (target: vscode.Uri) => {
				return ['.db', '.sqlite', '.sqlite3'].some(ext => target.fsPath.toLowerCase().endsWith(ext));
			};
			const getActiveDatabaseUri = (): vscode.Uri | undefined => {
				const editorUri = vscode.window.activeTextEditor?.document.uri;
				if (editorUri && isDatabaseFile(editorUri)) {
					return editorUri;
				}
				const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
				const input: any = activeTab?.input;
				const inputUri: vscode.Uri | undefined = input && input.uri && typeof input.uri.fsPath === 'string' ? input.uri : undefined;
				if (inputUri && isDatabaseFile(inputUri)) {
					return inputUri;
				}
				return undefined;
			};

			let dbUri = getActiveDatabaseUri();
			if (!dbUri) {
				const picked = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectFolders: false,
					canSelectMany: false,
					filters: {
						'SQLite Database': ['db', 'sqlite', 'sqlite3'],
						'All Files': ['*']
					}
				});
				if (!picked || picked.length === 0) {
					return;
				}
				dbUri = picked[0];
			}

			if (!isDatabaseFile(dbUri)) {
				vscode.window.showWarningMessage('Selected file is not a recognized database file');
				return;
			}

			// Ensure the database is open in the custom editor.
			await vscode.commands.executeCommand('vscode.openWith', dbUri, DatabaseEditorProvider.viewType);

			// Update the Database Explorer using the provided key.
			try {
				await databaseExplorerProvider.setDatabase(dbUri.fsPath, encryptionKey);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to connect: ${error}`);
				return;
			}

			// Also connect the open webview (best-effort, with a short retry for panel initialization).
			const provider = DatabaseEditorProvider.getActiveProvider();
			if (provider) {
				for (let attempt = 0; attempt < 10; attempt++) {
					try {
						const connected = await provider.connectOpenEditor(dbUri.fsPath, encryptionKey);
						if (connected) {
							break;
						}
					} catch {
						// ignore; will retry
					}
					await delay(100);
				}
			}

			vscode.window.showInformationMessage('Connected to encrypted database successfully!');
		}
	});

	const refreshDatabaseCommand = vscode.commands.registerCommand('sqlite-intelliview-vscode.refreshDatabase', () => {
		databaseExplorerProvider.refresh();
		vscode.window.showInformationMessage('Database explorer refreshed');
	});

	const exportDataCommand = vscode.commands.registerCommand('sqlite-intelliview-vscode.exportData', async () => {
		const tables = databaseExplorerProvider.getCurrentTables();
		if (tables.length === 0) {
			vscode.window.showWarningMessage('No database is currently open');
			return;
		}

		const selectedTable = await vscode.window.showQuickPick(
			tables.map(table => table.name),
			{
				placeHolder: 'Select a table to export'
			}
		);

		if (selectedTable) {
			// For now, just show a placeholder message
			// In a full implementation, this would export the table data
			vscode.window.showInformationMessage(`Export functionality for table "${selectedTable}" will be implemented soon`);
		}
	});

	const checkpointWalCommand = vscode.commands.registerCommand('sqlite-intelliview-vscode.checkpointWal', async () => {
		const isDatabasePath = (p: string) => ['.db', '.sqlite', '.sqlite3'].some(ext => p.toLowerCase().endsWith(ext));
		const getActiveDatabasePath = (): string | undefined => {
			const editorPath = vscode.window.activeTextEditor?.document.uri.fsPath;
			if (editorPath && isDatabasePath(editorPath)) {
				return editorPath;
			}
			const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
			const input: any = activeTab?.input;
			const inputUri: vscode.Uri | undefined = input && input.uri && typeof input.uri.fsPath === 'string' ? input.uri : undefined;
			const inputPath = inputUri?.fsPath;
			if (inputPath && isDatabasePath(inputPath)) {
				return inputPath;
			}
			return undefined;
		};

		const dbPath = getActiveDatabasePath();
		if (!dbPath) {
			vscode.window.showWarningMessage('No database file is currently open');
			return;
		}

		vscode.window.showInformationMessage('Checkpointing WAL and refreshing database...');
		
		try {
			// Import WAL utilities dynamically to avoid circular dependencies
			const { checkpointWalWithRetry, hasWalFiles } = require('./walUtils');
			
			// Check if database has WAL files
			if (!(await hasWalFiles(dbPath))) {
				vscode.window.showInformationMessage('This database does not have WAL mode enabled');
				return;
			}
			
			// Attempt checkpoint
			const success = await checkpointWalWithRetry(dbPath);
			
			if (success) {
				// Refresh the database explorer
				databaseExplorerProvider.refresh();
				vscode.window.showInformationMessage('WAL checkpoint completed successfully!');
			} else {
				vscode.window.showWarningMessage('Could not checkpoint WAL. Database may be locked by another process.');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to checkpoint WAL: ${error}`);
		}
	});

	// Register all commands
	context.subscriptions.push(
		openDatabaseCommand,
		connectWithKeyCommand,
		refreshDatabaseCommand,
		exportDataCommand,
		checkpointWalCommand
	);

	// Show welcome message
	vscode.window.showInformationMessage('SQLite IntelliView is ready! Click on .db files to open them.');
}

// This method is called when your extension is deactivated
export function deactivate() {}
