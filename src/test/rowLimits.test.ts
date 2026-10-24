import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import initSqlJs = require('sql.js');
import { DatabaseService } from '../databaseService';
import { DatabaseEditorProvider } from '../databaseEditorProvider';
import { normalizeRowLimit, normalizePageSize, normalizeTablePage, readRowLimitSettings, RowLimitReader, RowLimitSetting } from '../rowLimits';

suite('Row-limit normalization', () => {
    test('only zero and positive safe integers are accepted as caps', () => {
        for (const invalid of [undefined, null, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10']) {
            assert.strictEqual(normalizeRowLimit(invalid, 10000), 10000);
        }
        assert.strictEqual(normalizeRowLimit(0, 10000), 0);
        assert.strictEqual(normalizeRowLimit(5, 10000), 5);
        assert.strictEqual(normalizePageSize(NaN, 5), 5);
        assert.strictEqual(normalizePageSize(Number.MAX_SAFE_INTEGER + 1, 5, 1000), 5);
        assert.strictEqual(normalizePageSize(150000, 0), 150000);
    });

    test('default sizes and maximum settings share one fallback contract', () => {
        const settings = readRowLimitSettings((key, fallback) => key === 'maxTablePageSize' ? 1.5 : key === 'defaultPageSize' ? 200000 : fallback);
        assert.deepStrictEqual(settings, { queryMaxRows: 10000, maxTablePageSize: 100000, defaultPageSize: 100000 });
        assert.strictEqual(readRowLimitSettings((key, fallback) => key === 'maxTablePageSize' ? 5 : fallback).defaultPageSize, 5);
        assert.strictEqual(readRowLimitSettings((key, fallback) => key === 'defaultPageSize' ? 10.5 : fallback).defaultPageSize, 1000);
    });

    test('effective size drives offset and unsafe offsets are rejected', () => {
        assert.deepStrictEqual(normalizeTablePage(2, 200000, 5), { page: 2, pageSize: 5, offset: 5, maxTablePageSize: 5 });
        assert.deepStrictEqual(normalizeTablePage(NaN, NaN, 5), { page: 1, pageSize: 5, offset: 0, maxTablePageSize: 5 });
        assert.throws(() => normalizeTablePage(Number.MAX_SAFE_INTEGER, 100, 0), /integer range/);
    });
});

suite('Configurable row limits', () => {
    let SQL: initSqlJs.SqlJsStatic;
    let tempDir: string;
    let databasePath: string;
    let service: DatabaseService;
    let settings: Partial<Record<RowLimitSetting, unknown>>;
    let read: RowLimitReader;

    suiteSetup(async () => {
        SQL = await initSqlJs({ locateFile: file => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file) });
    });

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-intelliview-row-limits-'));
        databasePath = path.join(tempDir, 'test.sqlite');
        settings = {};
        read = (key, fallback) => Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback;
        service = new DatabaseService(read);
    });

    teardown(() => {
        service.closeDatabase();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    async function createRows(count: number): Promise<void> {
        const db = new SQL.Database();
        try {
            db.exec(`
                CREATE TABLE records (id INTEGER PRIMARY KEY, body TEXT, parent_id INTEGER);
                WITH RECURSIVE sequence(id) AS (
                    SELECT 1 UNION ALL SELECT id + 1 FROM sequence WHERE id < ${count}
                ) INSERT INTO records SELECT id, 'row-' || id, NULL FROM sequence;
            `);
            fs.writeFileSync(databasePath, Buffer.from(db.export()));
        } finally {
            db.close();
        }
        await service.openDatabase(databasePath);
    }

    function providerHarness() {
        const messages: any[] = [];
        const panel = { webview: { postMessage: (message: unknown) => { messages.push(message); return Promise.resolve(true); } } };
        const provider = new DatabaseEditorProvider({} as vscode.ExtensionContext, read) as any;
        provider.getOrCreateConnection = async () => service;
        provider.webviewPanels.set(databasePath, panel);
        return { provider, panel, messages };
    }

    test('query editor defaults, custom caps, unlimited mode, and exact-size results', async () => {
        await createRows(10001);
        const defaults = await service.executeUserQuery('SELECT * FROM records');
        assert.strictEqual(defaults.values.length, 10000);
        assert.strictEqual(defaults.truncated, true);
        assert.strictEqual(defaults.maxRows, 10000);
        settings.queryMaxRows = 3;
        assert.strictEqual((await service.executeUserQuery('SELECT * FROM records')).values.length, 3);
        const exact = await service.executeUserQuery('SELECT * FROM records LIMIT 3');
        assert.strictEqual(exact.truncated, false);
        settings.queryMaxRows = 0;
        const unlimited = await service.executeUserQuery('SELECT * FROM records');
        assert.strictEqual(unlimited.values.length, 10001);
        assert.strictEqual(unlimited.truncated, false);
        assert.strictEqual(unlimited.maxRows, 0);
    });

    test('small query caps do not truncate schema, ER metadata, counts or internal reads', async () => {
        await createRows(12);
        settings.queryMaxRows = 1;
        assert.strictEqual((await service.executeUserQuery('SELECT * FROM records')).values.length, 1);
        assert.deepStrictEqual((await service.getTableSchema('records')).values.map(row => row[1]), ['id', 'body', 'parent_id']);
        assert.strictEqual((await service.getTableInfo('records')).length, 3);
        assert.strictEqual(await service.getRowCount('records'), 12);
        assert.strictEqual((await service.executeQuery('SELECT * FROM records')).values.length, 12);
        const { provider, panel, messages } = providerHarness();
        await provider.handleERDiagramRequest(panel, databasePath);
        const diagram = messages.find(message => message.type === 'erDiagram');
        assert.strictEqual(diagram.success, true);
        assert.strictEqual(diagram.tables[0].columns.length, 3);
        await provider.handleQueryExecution(panel, databasePath, 'SELECT * FROM records');
        const result = messages.find(message => message.type === 'queryResult');
        assert.strictEqual(result.data.length, 1);
        assert.strictEqual(result.truncated, true);
        assert.strictEqual(result.maxRows, 1);
        messages.length = 0;
        await provider.handleQueryExecution(panel, databasePath, 'PRAGMA table_info(records)');
        assert.strictEqual(messages[0].type, 'queryResult');
        assert.strictEqual(messages[0].truncated, true);
        assert.ok(!messages.some(message => message.type === 'tableSchema'));
    });

    test('finite and unlimited table caps can exceed the former 100000-row limit', async () => {
        await createRows(100005);
        assert.strictEqual((await service.getTableData('records', 200000)).values.length, 100000);
        settings.maxTablePageSize = 100003;
        const first = await service.getTableDataPaginated('records', 1, 200000);
        assert.strictEqual(first.values.length, 100003);
        assert.strictEqual(first.pageSize, 100003);
        const second = await service.getTableDataPaginated('records', 2, 200000);
        assert.deepStrictEqual(second.values.map(row => row[0]), [100004, 100005]);
        assert.strictEqual(second.offset, 100003);
        settings.maxTablePageSize = 0;
        assert.strictEqual((await service.getTableData('records', 200000)).values.length, 100005);
    });

    test('capped pages cover all rows and invalid fallbacks also respect small caps', async () => {
        await createRows(12);
        settings.maxTablePageSize = 5;
        const pages = await Promise.all([1, 2, 3].map(page => service.getTableDataPaginated('records', page, 200000)));
        assert.deepStrictEqual(pages.map(page => page.values.map(row => row[0])), [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12]]);
        for (const invalid of [NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
            assert.strictEqual((await service.getTableData('records', invalid)).values.length, 5);
            const second = await service.getTableDataPaginated('records', 2, invalid);
            assert.strictEqual(second.values[0][0], 6);
            assert.strictEqual(second.pageSize, 5);
            assert.strictEqual(second.offset, 5);
        }
        await assert.rejects(service.getTableDataPaginated('records', Number.MAX_SAFE_INTEGER, 5), /integer range/);
    });

    test('provider stores and returns effective sizes for loads, counts, cell edits and external refreshes', async () => {
        await createRows(12);
        settings.maxTablePageSize = 5;
        const { provider, panel, messages } = providerHarness();
        await provider.handleTableDataRequest(panel, databasePath, 'records', undefined, 2, 200000);
        await new Promise<void>(resolve => setImmediate(resolve));
        const initial = messages.find(message => message.type === 'tableData');
        const count = messages.find(message => message.type === 'tableRowCount');
        assert.strictEqual(initial.pageSize, 5);
        assert.strictEqual(initial.page, 2);
        assert.strictEqual(initial.maxTablePageSize, 5);
        assert.strictEqual(count.pageSize, 5);
        assert.strictEqual(count.totalRows, 12);
        assert.ok(messages.indexOf(initial) < messages.indexOf(count));
        assert.strictEqual(provider.lastSync.get(databasePath).pageSize, 5);
        messages.length = 0;
        await provider.handleCellUpdateRequest(panel, databasePath, 'records', 'edit-1', initial.rowIdentities[0], 'body', 'changed');
        const afterEdit = messages.find(message => message.type === 'tableData');
        assert.strictEqual(afterEdit.pageSize, 5);
        assert.deepStrictEqual(afterEdit.data[0], [6, 'changed', null]);
        messages.length = 0;
        await provider.handleExternalDatabaseChange(databasePath);
        const afterRefresh = messages.find(message => message.type === 'tableData');
        assert.strictEqual(afterRefresh.pageSize, 5);
        assert.strictEqual(afterRefresh.page, 2);
        assert.strictEqual(afterRefresh.maxTablePageSize, 5);
        assert.strictEqual(provider.lastSync.get(databasePath).pageSize, 5);
        settings.maxTablePageSize = 3;
        messages.length = 0;
        await provider.handleExternalDatabaseChange(databasePath);
        const changedCap = messages.find(message => message.type === 'tableData');
        assert.strictEqual(changedCap.pageSize, 3);
        assert.strictEqual(changedCap.maxTablePageSize, 3);
        assert.strictEqual(provider.lastSync.get(databasePath).pageSize, 3);
    });

    test('provider ignores counts and data from replaced requests', async () => {
        await createRows(12);
        settings.maxTablePageSize = 5;
        const { provider, panel, messages } = providerHarness();
        const originalCount = service.getRowCount.bind(service);
        let finishOldCount!: (count: number) => void;
        service.getRowCount = () => new Promise(resolve => { finishOldCount = resolve; });
        await provider.handleTableDataRequest(panel, databasePath, 'records', undefined, 1, 1000);
        service.getRowCount = originalCount;
        await provider.handleTableDataRequest(panel, databasePath, 'records', undefined, 2, 1000);
        finishOldCount(999);
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.ok(!messages.some(message => message.type === 'tableRowCount' && message.totalRows === 999));
        assert.strictEqual(provider.rowCountCache.get(`${databasePath}:records`), 12);

        const originalRead = service.getTableDataPaginated.bind(service);
        const oldPage = await originalRead('records', 1, 1000);
        let finishOldRead!: (result: typeof oldPage) => void;
        service.getTableDataPaginated = () => new Promise(resolve => { finishOldRead = resolve; });
        const pending = provider.handleTableDataRequest(panel, databasePath, 'records', undefined, 1, 1000);
        await Promise.resolve();
        service.getTableDataPaginated = originalRead;
        await provider.handleTableDataRequest(panel, databasePath, 'records', undefined, 3, 1000);
        messages.length = 0;
        finishOldRead(oldPage);
        await pending;
        assert.deepStrictEqual(messages, []);
        assert.strictEqual(provider.lastSync.get(databasePath).page, 3);
    });

    test('an external refresh supersedes pending row counts from the previous load', async () => {
        await createRows(12);
        settings.maxTablePageSize = 5;
        const { provider, panel, messages } = providerHarness();
        const originalCount = service.getRowCount.bind(service);
        let finishOldCount!: (count: number) => void;
        service.getRowCount = () => new Promise(resolve => { finishOldCount = resolve; });
        await provider.handleTableDataRequest(panel, databasePath, 'records', undefined, 1, 1000);
        service.getRowCount = originalCount;
        await provider.handleExternalDatabaseChange(databasePath);
        finishOldCount(999);
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.ok(!messages.some(message => message.type === 'tableRowCount' && message.totalRows === 999));
        assert.strictEqual(provider.rowCountCache.get(`${databasePath}:records`), 12);
    });
});
