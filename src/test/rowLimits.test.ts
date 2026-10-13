import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import initSqlJs = require('sql.js');
import { DatabaseService } from '../databaseService';

suite('Configurable row limits', () => {
    let tempDir: string;
    let databasePath: string;
    let service: DatabaseService;
    let SQL: initSqlJs.SqlJsStatic;

    suiteSetup(async () => {
        SQL = await initSqlJs({
            locateFile: file => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file)
        });
    });

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-intelliview-row-limits-'));
        databasePath = path.join(tempDir, 'test.sqlite');
        service = new DatabaseService();
    });

    teardown(async () => {
        service.closeDatabase();
        fs.rmSync(tempDir, { recursive: true, force: true });
        // Restore defaults so other suites are unaffected.
        const config = vscode.workspace.getConfiguration('sqliteIntelliView');
        await config.update('queryMaxRows', undefined, vscode.ConfigurationTarget.Global);
        await config.update('maxTablePageSize', undefined, vscode.ConfigurationTarget.Global);
    });

    function createDatabase(sql: string): void {
        const db = new SQL.Database();
        db.exec(sql);
        fs.writeFileSync(databasePath, Buffer.from(db.export()));
        db.close();
    }

    function createWideDatabase(rowCount: number): void {
        createDatabase(`
            CREATE TABLE many_rows (id INTEGER PRIMARY KEY);
            WITH RECURSIVE sequence(id) AS (
                SELECT 1
                UNION ALL
                SELECT id + 1 FROM sequence WHERE id < ${rowCount}
            )
            INSERT INTO many_rows SELECT id FROM sequence;
        `);
    }

    test('query results are capped at 10000 rows by default', async () => {
        createWideDatabase(12000);
        await service.openDatabase(databasePath);

        const result = await service.executeQuery('SELECT id FROM many_rows');
        assert.strictEqual(result.values.length, 10000);
    });

    test('queryMaxRows = 0 disables the query row cap', async () => {
        createWideDatabase(12000);
        await vscode.workspace.getConfiguration('sqliteIntelliView')
            .update('queryMaxRows', 0, vscode.ConfigurationTarget.Global);
        await service.openDatabase(databasePath);

        const result = await service.executeQuery('SELECT id FROM many_rows');
        assert.strictEqual(result.values.length, 12000);
    });

    test('queryMaxRows accepts a custom cap', async () => {
        createWideDatabase(12000);
        await vscode.workspace.getConfiguration('sqliteIntelliView')
            .update('queryMaxRows', 10500, vscode.ConfigurationTarget.Global);
        await service.openDatabase(databasePath);

        const result = await service.executeQuery('SELECT id FROM many_rows');
        assert.strictEqual(result.values.length, 10500);
    });

    test('maxTablePageSize = 0 disables the table read cap', async () => {
        createWideDatabase(100001);
        await vscode.workspace.getConfiguration('sqliteIntelliView')
            .update('maxTablePageSize', 0, vscode.ConfigurationTarget.Global);
        await service.openDatabase(databasePath);

        const allRows = await service.getTableData('many_rows', 150000);
        assert.strictEqual(allRows.values.length, 100001);
    });
});
