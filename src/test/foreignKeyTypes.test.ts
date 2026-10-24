import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import initSqlJs = require('sql.js');
import { DatabaseService } from '../databaseService';
import { DatabaseEditorProvider } from '../databaseEditorProvider';

suite('Foreign-key storage classes', () => {
    let SQL: initSqlJs.SqlJsStatic;
    let directory: string;
    let databasePath: string;
    let service: DatabaseService;
    suiteSetup(async () => { SQL = await initSqlJs(); });
    setup(async () => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'intelliview-fk-types-'));
        databasePath = path.join(directory, 'foreign-keys.sqlite');
        const db = new SQL.Database();
        db.exec(`CREATE TABLE parent(id PRIMARY KEY NOT NULL, label TEXT) WITHOUT ROWID;
            INSERT INTO parent VALUES (9007199254740993,'integer'),('9007199254740993','text');
            CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id REFERENCES parent(id));
            INSERT INTO child VALUES (1,9007199254740993),(2,'9007199254740993');
            CREATE VIEW child_view AS SELECT parent_id FROM child;
            CREATE TABLE numeric_child(id INTEGER PRIMARY KEY, parent_id INTEGER);
            INSERT INTO numeric_child VALUES (1,1);`);
        fs.writeFileSync(databasePath, db.export());
        db.close();
        service = new DatabaseService();
        await service.openDatabase(databasePath);
    });
    teardown(() => {
        service.closeDatabase();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    test('preserves exact INTEGER metadata independently of same-looking TEXT and row identity', async () => {
        const result = await service.getTableData('child');
        assert.deepStrictEqual(result.values, [[1, '9007199254740993'], [2, '9007199254740993']]);
        assert.deepStrictEqual((result as any).largeIntegerColumns, { 0: [1] });
        const view = await service.getTableData('child_view');
        assert.strictEqual(view.editable, false);
        assert.deepStrictEqual((view as any).largeIntegerColumns, { 0: [0] });
        const secondPage = await service.getTableDataPaginated('child', 2, 1);
        assert.deepStrictEqual((secondPage as any).largeIntegerColumns || {}, {});
        const query = await service.executeUserQuery('SELECT parent_id FROM child ORDER BY id');
        assert.deepStrictEqual(query.values, [['9007199254740993'], ['9007199254740993']]);
        assert.deepStrictEqual((query as any).largeIntegerColumns, { 0: [0] });
    });

    test('provider carries type metadata through loads, query results, updates and refreshes', async () => {
        const messages: any[] = [];
        const panel = { webview: { postMessage: (message: unknown) => { messages.push(message); return Promise.resolve(true); } } };
        const provider = new DatabaseEditorProvider({} as vscode.ExtensionContext) as any;
        provider.getOrCreateConnection = async () => service;
        provider.webviewPanels.set(databasePath, panel);
        await provider.handleTableDataRequest(panel, databasePath, 'child', undefined, 1, 100);
        assert.deepStrictEqual(messages.find(m => m.type === 'tableData').largeIntegerColumns, { 0: [1] });
        messages.length = 0;
        await provider.handleQueryExecution(panel, databasePath, 'SELECT parent_id FROM child ORDER BY id');
        assert.deepStrictEqual(messages.find(m => m.type === 'queryResult').largeIntegerColumns, { 0: [0] });
        messages.length = 0;
        await provider.handleExternalDatabaseChange(databasePath);
        assert.deepStrictEqual(messages.find(m => m.type === 'tableData').largeIntegerColumns, { 0: [1] });

        const numeric = await service.getTableData('numeric_child');
        messages.length = 0;
        await provider.handleCellUpdateRequest(panel, databasePath, 'numeric_child', 'typed-update', numeric.rowIdentities[0], 'parent_id', '9007199254740993');
        const ack = messages.find(m => m.type === 'cellUpdateSuccess');
        assert.strictEqual(ack.newValue, '9007199254740993');
        assert.strictEqual(ack.newValueIsLargeInteger, true, 'SQLite INTEGER affinity converts the text input before acknowledgement');
        const child = await service.getTableData('child');
        messages.length = 0;
        await provider.handleCellUpdateRequest(panel, databasePath, 'child', 'text-update', child.rowIdentities[0], 'parent_id', '9007199254740993');
        assert.strictEqual(messages.find(m => m.type === 'cellUpdateSuccess').newValueIsLargeInteger, false, 'an untyped column stores this input as genuine TEXT');
    });

    test('edit acknowledgements reflect stored NULL, BLOB, REAL, TEXT and changed INTEGER keys', async () => {
        const data = await service.getTableData('numeric_child');
        const keyEdit = await service.updateCellData('numeric_child', data.rowIdentities[0]!, 'id', '9223372036854775807');
        assert.strictEqual(keyEdit.value, '9223372036854775807');
        assert.strictEqual(keyEdit.isLargeInteger, true);
        assert.deepStrictEqual(keyEdit.identity.parts[0].value, { type: 'integer', decimal: '9223372036854775807' });
        for (const value of [null, new Uint8Array([0, 255]), 1.25, 'literal text']) {
            const update = await service.updateCellData('numeric_child', keyEdit.identity, 'parent_id', value);
            assert.deepStrictEqual(update.value, value);
            assert.strictEqual(update.isLargeInteger, false);
            assert.deepStrictEqual(update.identity, keyEdit.identity);
        }
        await service.executeQuery('CREATE TABLE text_child(id TEXT PRIMARY KEY NOT NULL, value TEXT) WITHOUT ROWID');
        await service.executeQuery("INSERT INTO text_child VALUES ('old', 'original')");
        const text = await service.getTableData('text_child');
        const textEdit = await service.updateCellData('text_child', text.rowIdentities[0]!, 'id', '42');
        assert.strictEqual(textEdit.value, '42', 'TEXT affinity is reflected even when the edited input was parsed as a number');
        assert.strictEqual(textEdit.isLargeInteger, false);
        assert.deepStrictEqual(textEdit.identity.parts[0].value, '42');
        await service.updateCellData('text_child', textEdit.identity, 'value', 'next edit');
        assert.deepStrictEqual((await service.executeQuery('SELECT * FROM text_child')).values, [['42', 'next edit']]);
    });
});
