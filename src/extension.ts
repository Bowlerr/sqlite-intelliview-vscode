// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DatabaseEditorProvider } from './databaseEditorProvider';
import { DatabaseExplorerProvider } from './databaseExplorerProvider';

let databaseExplorerProvider: DatabaseExplorerProvider;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('SQLite Viewer extension is now active!');

	// Initialize the database explorer provider
	databaseExplorerProvider = new DatabaseExplorerProvider();

	// Register the custom editor provider
	context.subscriptions.push(DatabaseEditorProvider.register(context));

	// Register the tree view
	const treeView = vscode.window.createTreeView('sqlite-viewer.databaseExplorer', {
		treeDataProvider: databaseExplorerProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(treeView);

	// Register commands
	const openDatabaseCommand = vscode.commands.registerCommand('sqlite-viewer.openDatabase', async (uri?: vscode.Uri) => {
		let databasePath: string;

		if (uri) {
			databasePath = uri.fsPath;
		} else {
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

			databasePath = result[0].fsPath;
		}

		// Open the database file with our custom editor
		const doc = await vscode.workspace.openTextDocument(databasePath);
		await vscode.window.showTextDocument(doc, {
			preview: false,
			viewColumn: vscode.ViewColumn.One
		});
	});

	const connectWithKeyCommand = vscode.commands.registerCommand('sqlite-viewer.connectWithKey', async () => {
		const encryptionKey = await vscode.window.showInputBox({
			prompt: 'Enter SQLCipher encryption key',
			password: true,
			placeHolder: 'Encryption key for SQLCipher database'
		});

		if (encryptionKey) {
			// Get the currently active editor
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				try {
					await databaseExplorerProvider.setDatabase(activeEditor.document.uri.fsPath, encryptionKey);
					vscode.window.showInformationMessage('Connected to encrypted database successfully!');
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to connect: ${error}`);
				}
			} else {
				vscode.window.showErrorMessage('No database file is currently open');
			}
		}
	});

	const refreshDatabaseCommand = vscode.commands.registerCommand('sqlite-viewer.refreshDatabase', () => {
		databaseExplorerProvider.refresh();
		vscode.window.showInformationMessage('Database explorer refreshed');
	});

	const exportDataCommand = vscode.commands.registerCommand('sqlite-viewer.exportData', async () => {
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

	// Register all commands
	context.subscriptions.push(
		openDatabaseCommand,
		connectWithKeyCommand,
		refreshDatabaseCommand,
		exportDataCommand
	);

	// Show welcome message
	vscode.window.showInformationMessage('SQLite Viewer is ready! Right-click on .db files to open them.');
}

// This method is called when your extension is deactivated
export function deactivate() {}
