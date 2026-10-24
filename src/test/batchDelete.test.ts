import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import initSqlJs = require('sql.js');
import { DatabaseService, RowIdentity } from '../databaseService';
import { isWebviewToExtensionMessage } from '../webviewMessages';

suite('Atomic selection deletion', () => {
    let SQL: initSqlJs.SqlJsStatic;
    let directory: string;
    let databasePath: string;
    let service: DatabaseService;
    suiteSetup(async () => { SQL = await initSqlJs(); });
    setup(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'intelliview-delete-'));
        databasePath = path.join(directory, 'selection.sqlite');
        service = new DatabaseService();
    });
    teardown(() => {
        service.closeDatabase();
        fs.rmSync(directory, { recursive: true, force: true });
    });
    async function open(sql: string) {
        const database = new SQL.Database();
        database.exec(sql);
        fs.writeFileSync(databasePath, database.export());
        database.close();
        await service.openDatabase(databasePath);
    }
    function diskRows(table = 'records') {
        const database = new SQL.Database(fs.readFileSync(databasePath));
        try { return database.exec(`SELECT * FROM "${table}"`)[0]?.values || []; }
        finally { database.close(); }
    }
    async function identities(table = 'records'): Promise<RowIdentity[]> {
        return (await service.getTableData(table)).rowIdentities.map(identity => {
            assert.ok(identity);
            return identity;
        });
    }

    test('persists a selected subset once and keeps neighbours', async () => {
        await open("CREATE TABLE records(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO records VALUES (1,'a'),(2,'b'),(3,'c');");
        const rows = await identities();
        const save = (service as any).saveChangesToFile.bind(service);
        let writes = 0;
        (service as any).saveChangesToFile = async (bytes: Uint8Array) => { writes++; await save(bytes); };
        assert.strictEqual(await service.deleteRows('records', [rows[0], rows[2]]), 2);
        assert.strictEqual(writes, 1);
        assert.deepStrictEqual(diskRows(), [[2, 'b']]);
    });

    test('rolls back every selected delete and trigger side effect when a later row fails', async () => {
        await open(`CREATE TABLE records(id INTEGER PRIMARY KEY); INSERT INTO records VALUES (1),(2),(3);
            CREATE TABLE audit(id INTEGER);
            CREATE TRIGGER log_delete AFTER DELETE ON records BEGIN INSERT INTO audit VALUES (old.id); END;
            CREATE TRIGGER protect BEFORE DELETE ON records WHEN old.id=2 BEGIN SELECT RAISE(ABORT,'protected row'); END;`);
        const before = fs.readFileSync(databasePath);
        const rows = await identities();
        await assert.rejects(service.deleteRows('records', rows), /protected row/);
        assert.deepStrictEqual((await service.getTableData('records')).values, [[1], [2], [3]]);
        assert.deepStrictEqual((await service.executeQuery('SELECT * FROM audit')).values, []);
        assert.deepStrictEqual(fs.readFileSync(databasePath), before);
    });

    test('stale, duplicate and forged identities cannot partially delete a selection', async () => {
        await open('CREATE TABLE records(id INTEGER PRIMARY KEY); INSERT INTO records VALUES (1),(2);');
        const rows = await identities();
        const stale = { ...rows[1], parts: [{ column: rows[1].parts[0].column, value: 99 }] };
        await assert.rejects(service.deleteRows('records', [rows[0], stale]), /rolled back/);
        await assert.rejects(service.deleteRows('records', [rows[0], rows[0]]), /duplicate/);
        await assert.rejects(service.deleteRows('records', [{ kind: 'primaryKey', parts: [{ column: 'missing', value: 1 }] }]), /schema/);
        await assert.rejects(service.deleteRows('records', []), /at least one/);
        assert.deepStrictEqual((await service.getTableData('records')).values, [[1], [2]]);
        assert.deepStrictEqual(diskRows(), [[1], [2]]);
    });

    test('handles composite BLOB keys and rowids without conventional ID columns', async () => {
        await open(`CREATE TABLE records(code BLOB, locale TEXT, value TEXT, PRIMARY KEY(code,locale)) WITHOUT ROWID;
            INSERT INTO records VALUES (X'00FF','en','a'),(X'00FF','fr','b'),(X'0102','en','c');
            CREATE TABLE notes(body TEXT); INSERT INTO notes VALUES ('same'),('same');`);
        const rows = await identities();
        assert.strictEqual((rows[0].parts[0].value as any).type, 'blob');
        assert.strictEqual(await service.deleteRows('records', [rows[0], rows[2]]), 2);
        assert.strictEqual(diskRows().length, 1);
        assert.strictEqual(diskRows()[0][1], 'fr');
        const noteRows = await identities('notes');
        assert.strictEqual(await service.deleteRows('notes', [noteRows[1]]), 1);
        assert.deepStrictEqual(diskRows('notes'), [['same']]);
    });

    test('preserves large integer identity precision', async () => {
        await open('CREATE TABLE records(id INTEGER PRIMARY KEY); INSERT INTO records VALUES (9007199254740992),(9007199254740993),(9007199254740994);');
        const rows = await identities();
        assert.strictEqual(await service.deleteRows('records', [rows[1]]), 1);
        const remaining = await service.executeQuery('SELECT CAST(id AS TEXT) FROM records ORDER BY id');
        assert.deepStrictEqual(remaining.values, [['9007199254740992'], ['9007199254740994']]);
    });

    test('deletes the selected large INTEGER key and preserves the same-looking TEXT key', async () => {
        await open(`CREATE TABLE records(id PRIMARY KEY NOT NULL, body TEXT) WITHOUT ROWID;
            INSERT INTO records VALUES (9007199254740993, 'integer'), ('9007199254740993', 'text');`);
        const data = await service.getTableData('records');
        const selected = data.rowIdentities[data.values.findIndex(row => row[1] === 'integer')];
        assert.ok(selected);
        const transported = JSON.parse(JSON.stringify(selected));
        assert.strictEqual(isWebviewToExtensionMessage({ type: 'deleteRows', tableName: 'records', requestId: 'typed', rowIdentities: [transported] }), true);
        assert.strictEqual(await service.deleteRows('records', [transported]), 1);
        assert.deepStrictEqual((await service.executeQuery('SELECT typeof(id), CAST(id AS TEXT), body FROM records')).values,
            [['text', '9007199254740993', 'text']]);
        assert.deepStrictEqual(diskRows(), [['9007199254740993', 'text']]);
    });

    test('distinguishes mixed INTEGER and TEXT selections at signed 64-bit bounds', async () => {
        await open(`CREATE TABLE records(id PRIMARY KEY NOT NULL, body TEXT) WITHOUT ROWID;
            INSERT INTO records VALUES
                (-9223372036854775808, 'min-integer'), ('-9223372036854775808', 'min-text'),
                (9223372036854775807, 'max-integer'), ('9223372036854775807', 'max-text'),
                (9007199254740993, 'integer'), ('9007199254740993', 'text'),
                (1.25, 'real'), (1e20, 'large-real'), (42, 'safe-integer'), ('42', 'safe-text');`);
        const data = await service.getTableData('records');
        const selectedBodies = new Set(['min-integer', 'max-integer', 'integer', 'text', 'real', 'large-real', 'safe-integer']);
        const selected = data.rowIdentities.filter((_, index) => selectedBodies.has(data.values[index][1])) as RowIdentity[];
        const transported = JSON.parse(JSON.stringify(selected));
        assert.strictEqual(isWebviewToExtensionMessage({ type: 'deleteRows', tableName: 'records', requestId: 'mixed', rowIdentities: transported }), true);
        assert.strictEqual(await service.deleteRows('records', transported), selectedBodies.size);
        assert.deepStrictEqual((await service.executeQuery('SELECT typeof(id), CAST(id AS TEXT), body FROM records ORDER BY id')).values, [
            ['text', '-9223372036854775808', 'min-text'], ['text', '42', 'safe-text'], ['text', '9223372036854775807', 'max-text']
        ]);
        assert.strictEqual(diskRows().length, 3);
    });

    test('rejects malformed and out-of-range INTEGER identities before changing any row', async () => {
        await open('CREATE TABLE records(id INTEGER PRIMARY KEY); INSERT INTO records VALUES (1),(2);');
        const rows = await identities();
        const before = fs.readFileSync(databasePath);
        for (const decimal of ['', '+1', '01', '-0', '1.0', '1e2', ' 1', '1 ', '9223372036854775808', '-9223372036854775809', '1;DELETE FROM records', '9'.repeat(100)]) {
            const invalid: RowIdentity = { kind: 'primaryKey', parts: [{ column: 'id', value: { type: 'integer', decimal } }] };
            const message = { type: 'deleteRows', tableName: 'records', requestId: 'invalid', rowIdentities: [rows[0], invalid] };
            assert.strictEqual(isWebviewToExtensionMessage(message), false, decimal);
            assert.strictEqual(isWebviewToExtensionMessage({ type: 'updateCellData', tableName: 'records', requestId: 'invalid', rowIdentity: invalid, columnName: 'id', newValue: 3 }), false, decimal);
            await assert.rejects(service.deleteRows('records', [rows[0], invalid]), /invalid serialized INTEGER/);
            await assert.rejects(service.updateCellData('records', invalid, 'id', 3), /invalid serialized INTEGER/);
        }
        assert.deepStrictEqual((await service.getTableData('records')).values, [[1], [2]]);
        assert.deepStrictEqual(fs.readFileSync(databasePath), before);
    });

    test('restores in-memory and on-disk state after a failed persistence operation', async () => {
        await open('CREATE TABLE records(id INTEGER PRIMARY KEY); INSERT INTO records VALUES (1),(2),(3);');
        const before = fs.readFileSync(databasePath);
        const rows = await identities();
        await service.executeQuery('INSERT INTO records VALUES (4)');
        const save = (service as any).saveChangesToFile.bind(service);
        (service as any).saveChangesToFile = async (bytes: Uint8Array) => {
            await save(bytes);
            throw new Error('forced persistence failure');
        };
        await assert.rejects(service.deleteRows('records', rows), /forced persistence failure/);
        assert.deepStrictEqual((await service.getTableData('records')).values, [[1], [2], [3], [4]]);
        assert.deepStrictEqual(fs.readFileSync(databasePath), before);
    });

    test('serializes a batch with a concurrent cell update', async () => {
        await open("CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records VALUES (1,'a'),(2,'b'),(3,'c');");
        const rows = await identities();
        const save = (service as any).saveChangesToFile.bind(service);
        let active = 0;
        let maximum = 0;
        (service as any).saveChangesToFile = async (bytes: Uint8Array) => {
            maximum = Math.max(maximum, ++active);
            await new Promise(resolve => setTimeout(resolve, 10));
            try { await save(bytes); } finally { active--; }
        };
        await Promise.all([
            service.deleteRows('records', [rows[0], rows[1]]),
            service.updateCellData('records', rows[2], 'value', 'updated')
        ]);
        assert.strictEqual(maximum, 1);
        assert.deepStrictEqual(diskRows(), [[3, 'updated']]);
    });

    test('validates the complete deletion message at the webview boundary', () => {
        const message = { type: 'deleteRows', tableName: 'records', requestId: 'delete-1', rowIdentities: [{ kind: 'rowid', parts: [{ column: 'rowid', value: 1 }] }] };
        assert.strictEqual(isWebviewToExtensionMessage(message), true);
        for (const rowIdentities of [[], [null], [message.rowIdentities[0], {}], [{ kind: 'rowid', parts: [] }]]) {
            assert.strictEqual(isWebviewToExtensionMessage({ ...message, rowIdentities }), false);
        }
        assert.strictEqual(isWebviewToExtensionMessage({ ...message, requestId: '' }), false);
    });
});
