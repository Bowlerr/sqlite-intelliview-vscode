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
        assert.strictEqual((await service.getTableData('records')).deletable, true);
        const rows = await identities();
        const save = (service as any).saveChangesToFile.bind(service);
        let writes = 0;
        (service as any).saveChangesToFile = async (bytes: Uint8Array) => { writes++; await save(bytes); };
        assert.strictEqual(await service.deleteRows('records', [rows[0], rows[2]]), 2);
        assert.strictEqual(writes, 1);
        assert.deepStrictEqual(diskRows(), [[2, 'b']]);
    });

    test('keeps FTS3 cell editing available while rejecting virtual-table deletion before snapshots', async () => {
        await open(`CREATE/* comment */VIRTUAL/* comment */TABLE "docs quoted" USING fts3(body);
            INSERT INTO "docs quoted"(rowid,body) VALUES(1,'first'),(2,'second');`);
        const data = await service.getTableData('docs quoted');
        assert.strictEqual(data.editable, true);
        assert.strictEqual(data.deletable, false);
        assert.match(data.deleteError || '', /virtual tables/i);
        assert.ok(data.rowIdentities[0]);
        await service.updateCellData('docs quoted', data.rowIdentities[0], 'body', 'updated searchable');
        assert.deepStrictEqual((await service.executeQuery(`SELECT rowid,body FROM "docs quoted" WHERE "docs quoted" MATCH 'updated'`)).values,
            [[1, 'updated searchable']]);
        assert.deepStrictEqual(diskRows('docs quoted'), [['updated searchable'], ['second']]);

        const before = fs.readFileSync(databasePath);
        let snapshots = 0;
        let writes = 0;
        const exportState = (service as any).exportDatabaseState.bind(service);
        (service as any).exportDatabaseState = () => { snapshots++; return exportState(); };
        (service as any).saveChangesToFile = async () => { writes++; };
        await assert.rejects(service.deleteRows('docs quoted', [data.rowIdentities[0]]), /Row deletion is not supported for virtual tables/);
        assert.strictEqual(snapshots, 0);
        assert.strictEqual(writes, 0);
        assert.deepStrictEqual(fs.readFileSync(databasePath), before);
        assert.deepStrictEqual((await service.getTableData('docs quoted')).values, [['updated searchable'], ['second']]);
        assert.deepStrictEqual((await service.executeQuery('SELECT name FROM temp.sqlite_schema')).values, []);
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

    test('accepts selected rows already deleted by a trigger and counts only the selection', async () => {
        await open(`CREATE TABLE records(id INTEGER PRIMARY KEY, parent_id INTEGER);
            INSERT INTO records VALUES (1,NULL),(2,1),(3,1),(4,NULL);
            CREATE TRIGGER delete_children AFTER DELETE ON records BEGIN DELETE FROM records WHERE parent_id=OLD.id; END;`);
        const rows = await identities();
        const save = (service as any).saveChangesToFile.bind(service);
        let writes = 0;
        (service as any).saveChangesToFile = async (bytes: Uint8Array) => { writes++; await save(bytes); };
        assert.strictEqual(await service.deleteRows('records', [rows[0], rows[1]]), 2, 'extra unselected trigger deletions do not increase the reported selection count');
        assert.strictEqual(writes, 1);
        assert.deepStrictEqual((await service.getTableData('records')).values, [[4, null]]);
        assert.deepStrictEqual(diskRows(), [[4, null]]);
    });

    test('rejects an initially stale identity even when an earlier trigger would create it', async () => {
        await open(`CREATE TABLE records(id INTEGER PRIMARY KEY); INSERT INTO records VALUES (1),(3);
            CREATE TRIGGER replace_deleted AFTER DELETE ON records WHEN OLD.id=1 BEGIN INSERT INTO records VALUES (2); END;`);
        const before = fs.readFileSync(databasePath);
        const rows = await identities();
        const stale: RowIdentity = { kind: 'primaryKey', parts: [{ column: 'id', value: 2 }] };
        await assert.rejects(service.deleteRows('records', [rows[0], stale]), /rolled back/);
        assert.deepStrictEqual((await service.getTableData('records')).values, [[1], [3]]);
        assert.deepStrictEqual(fs.readFileSync(databasePath), before);
    });

    test('rolls back when a trigger ignores a selected delete or recreates an earlier selected row', async () => {
        for (const trigger of [
            "CREATE TRIGGER protect BEFORE DELETE ON records WHEN OLD.id=2 BEGIN SELECT RAISE(IGNORE); END;",
            "CREATE TRIGGER recreate AFTER DELETE ON records WHEN OLD.id=2 BEGIN INSERT INTO records VALUES (1); END;"
        ]) {
            service.closeDatabase();
            await open(`CREATE TABLE records(id INTEGER PRIMARY KEY); INSERT INTO records VALUES (1),(2),(3);
                CREATE TABLE audit(id INTEGER);
                CREATE TRIGGER log_delete AFTER DELETE ON records BEGIN INSERT INTO audit VALUES (OLD.id); END;
                ${trigger}`);
            const before = fs.readFileSync(databasePath);
            const rows = await identities();
            await assert.rejects(service.deleteRows('records', [rows[0], rows[1]]), /rolled back/);
            assert.deepStrictEqual((await service.getTableData('records')).values, [[1], [2], [3]]);
            assert.deepStrictEqual((await service.executeQuery('SELECT * FROM audit')).values, []);
            assert.deepStrictEqual(fs.readFileSync(databasePath), before);
        }
    });

    test('rejects different serialized identities that alias the same stored row', async () => {
        await open(`CREATE TABLE records(id INTEGER PRIMARY KEY); INSERT INTO records VALUES (1),(2);
            CREATE TABLE labels(id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL); INSERT INTO labels VALUES ('A'),('B');`);
        for (const [table, first, alias] of [['records', 1, '1'], ['labels', 'A', 'a']] as const) {
            const before = fs.readFileSync(databasePath);
            const selected: RowIdentity[] = [first, alias].map(value => ({ kind: 'primaryKey', parts: [{ column: 'id', value }] }));
            await assert.rejects(service.deleteRows(table, selected), /duplicate|rolled back/);
            assert.deepStrictEqual(fs.readFileSync(databasePath), before);
            assert.strictEqual((await service.getTableData(table)).values.length, 2);
        }
    });

    test('rolls back trigger replacements and moves of selected identities, even with identical contents', async () => {
        for (const recursive of [0, 1]) {
            for (const action of [
                "DELETE FROM records WHERE id=2; INSERT INTO records VALUES(2,'replacement');",
                "DELETE FROM records WHERE id=2; INSERT INTO records VALUES(2,'second');",
                'UPDATE records SET id=20 WHERE id=2;',
                "INSERT OR REPLACE INTO records VALUES(2,'replacement');",
                'DELETE FROM records WHERE id=2; UPDATE records SET id=2 WHERE id=3;',
                'UPDATE OR REPLACE records SET id=2 WHERE id=3;'
            ]) {
                service.closeDatabase();
                await open(`CREATE TABLE records(id INTEGER PRIMARY KEY, body TEXT);
                    INSERT INTO records VALUES(1,'first'),(2,'second'),(3,'untouched');
                    CREATE TRIGGER mutate_selected AFTER DELETE ON records WHEN OLD.id=1 BEGIN ${action} END;`);
                await service.executeQuery(`PRAGMA recursive_triggers=${recursive}`);
                const before = fs.readFileSync(databasePath);
                const rows = await identities();
                await assert.rejects(service.deleteRows('records', [rows[0], rows[1]]), /rolled back/, action);
                assert.deepStrictEqual((await service.getTableData('records')).values, [[1, 'first'], [2, 'second'], [3, 'untouched']]);
                assert.deepStrictEqual(fs.readFileSync(databasePath), before);
                assert.deepStrictEqual((await service.executeQuery('SELECT name FROM temp.sqlite_schema')).values, [], 'rollback removes all temporary guards');
            }
        }
    });

    test('rejects automatic reuse of selected INTEGER primary keys and hidden rowids', async () => {
        for (const recursive of [0, 1]) {
            for (const explicitKey of [false, true]) {
                service.closeDatabase();
                const key = explicitKey ? 'id' : 'rowid';
                await open(`CREATE TABLE records(${explicitKey ? 'id INTEGER PRIMARY KEY,' : ''} body TEXT);
                    INSERT INTO records(${key},body) VALUES(0,'first'),(1,'untouched'),(2,'second');
                    CREATE TRIGGER reuse_selected AFTER DELETE ON records WHEN OLD.${key}=0 BEGIN
                        DELETE FROM records WHERE ${key}=2; INSERT INTO records(body) VALUES('second'); END;`);
                await service.executeQuery(`PRAGMA recursive_triggers=${recursive}`);
                const before = fs.readFileSync(databasePath);
                const rows = await identities();
                await assert.rejects(service.deleteRows('records', [rows[0], rows[2]]), /rolled back/);
                assert.deepStrictEqual((await service.executeQuery(`SELECT ${key},body FROM records ORDER BY ${key}`)).values,
                    [[0, 'first'], [1, 'untouched'], [2, 'second']]);
                assert.deepStrictEqual(fs.readFileSync(databasePath), before);
            }
        }
    });

    test('guards composite BLOB, NOCASE and large INTEGER keys without confusing a TEXT twin', async () => {
        await open(`CREATE TABLE records(code BLOB, locale TEXT COLLATE NOCASE, id, body TEXT, PRIMARY KEY(code,locale,id)) WITHOUT ROWID;
            INSERT INTO records VALUES(X'00','en',0,'first'),(X'FF','en',9007199254740993,'second'),(X'FF','en','9007199254740993','text');
            CREATE TRIGGER replace_selected AFTER DELETE ON records WHEN OLD.id=0 BEGIN
                DELETE FROM records WHERE typeof(id)='integer' AND id=9007199254740993;
                INSERT INTO records VALUES(X'FF','EN',9007199254740993,'second'); END;`);
        const before = fs.readFileSync(databasePath);
        const rows = await identities();
        await assert.rejects(service.deleteRows('records', [rows[0], rows[1]]), /rolled back/);
        assert.deepStrictEqual(fs.readFileSync(databasePath), before);
        await service.executeQuery('DROP TRIGGER replace_selected');
        await service.executeQuery(`CREATE TRIGGER replace_text AFTER DELETE ON records WHEN OLD.id=0 BEGIN
            INSERT OR REPLACE INTO records VALUES(X'FF','EN','9007199254740993','unselected replacement'); END`);
        assert.strictEqual(await service.deleteRows('records', [rows[0], rows[1]]), 2);
        assert.deepStrictEqual((await service.executeQuery('SELECT typeof(id),body FROM records')).values, [['text', 'unselected replacement']]);
        assert.deepStrictEqual((await service.executeQuery('SELECT name FROM temp.sqlite_schema')).values, [], 'success removes all temporary guards');
    });

    test('allows stable-key cascade updates and unrelated automatic inserts', async () => {
        await open(`CREATE TABLE records(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES records(id) ON DELETE SET NULL);
            INSERT INTO records VALUES(-1,NULL),(0,NULL),(2,-1);
            CREATE TRIGGER add_unselected AFTER DELETE ON records WHEN OLD.id=-1 BEGIN INSERT INTO records(parent_id) VALUES(NULL); END;`);
        await service.executeQuery('PRAGMA foreign_keys=ON');
        const rows = await identities();
        assert.strictEqual(await service.deleteRows('records', [rows[0], rows[2]]), 2);
        assert.deepStrictEqual(diskRows(), [[0, null], [3, null]]);
        assert.deepStrictEqual((await service.executeQuery('SELECT name FROM temp.sqlite_schema')).values, []);
        const database = new SQL.Database(fs.readFileSync(databasePath));
        try {
            assert.deepStrictEqual(database.exec("SELECT name FROM sqlite_schema WHERE name LIKE '__intelliview_delete_%'"), [], 'guards never enter the persisted schema');
        } finally { database.close(); }
    });

    test('preserves enabled foreign-key cascades and recursive triggers through snapshots and saves', async () => {
        await open(`CREATE TABLE records(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES records(id) ON DELETE CASCADE);
            INSERT INTO records VALUES (1,NULL),(2,1),(3,2),(4,NULL);
            CREATE TABLE tree(id INTEGER PRIMARY KEY, parent_id INTEGER);
            INSERT INTO tree VALUES (1,NULL),(2,1),(3,2),(4,NULL);
            CREATE TRIGGER delete_descendants AFTER DELETE ON tree BEGIN DELETE FROM tree WHERE parent_id=OLD.id; END;`);
        await service.executeQuery('PRAGMA foreign_keys=ON');
        await service.executeQuery('PRAGMA recursive_triggers=ON');
        for (const table of ['records', 'tree']) {
            const rows = await identities(table);
            assert.strictEqual(await service.deleteRows(table, [rows[0], rows[1]]), 2);
            assert.deepStrictEqual((await service.getTableData(table)).values, [[4, null]], table);
            assert.deepStrictEqual(diskRows(table), [[4, null]], table);
            assert.deepStrictEqual((await service.executeQuery('PRAGMA foreign_keys')).values, [[1]]);
            assert.deepStrictEqual((await service.executeQuery('PRAGMA recursive_triggers')).values, [[1]]);
        }
    });

    test('preserves read-only and check-constraint settings while editing or deleting', async () => {
        await open('CREATE TABLE records(id INTEGER PRIMARY KEY, value INTEGER CHECK(value > 0)); INSERT INTO records VALUES (1,1),(2,2);');
        const rows = await identities();
        const before = fs.readFileSync(databasePath);
        await service.executeQuery('PRAGMA query_only=ON');
        await assert.rejects(service.deleteRows('records', [rows[0]]), /readonly/);
        await assert.rejects(service.updateCellData('records', rows[0], 'value', 3), /readonly/);
        await assert.rejects(service.deleteRow('records', { id: 1 }), /readonly/);
        assert.deepStrictEqual((await service.executeQuery('PRAGMA query_only')).values, [[1]]);
        assert.deepStrictEqual(fs.readFileSync(databasePath), before);

        await service.executeQuery('PRAGMA query_only=OFF');
        await service.executeQuery('PRAGMA ignore_check_constraints=ON');
        await service.updateCellData('records', rows[0], 'value', -1);
        assert.deepStrictEqual((await service.executeQuery('PRAGMA ignore_check_constraints')).values, [[1]]);
        assert.deepStrictEqual(diskRows(), [[1, -1], [2, 2]]);
        await service.executeQuery('PRAGMA ignore_check_constraints=OFF');
        await assert.rejects(service.updateCellData('records', rows[0], 'value', -2), /CHECK constraint failed/);
        assert.deepStrictEqual((await service.executeQuery('PRAGMA ignore_check_constraints')).values, [[0]]);
    });

    test('restores connection settings after persistence fails and applies cascades on the next delete', async () => {
        await open(`CREATE TABLE records(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES records(id) ON DELETE CASCADE);
            INSERT INTO records VALUES (1,NULL),(2,1),(3,2),(4,NULL);`);
        for (const pragma of ['foreign_keys', 'recursive_triggers', 'ignore_check_constraints']) {
            await service.executeQuery(`PRAGMA ${pragma}=ON`);
        }
        const rows = await identities();
        const before = fs.readFileSync(databasePath);
        const save = (service as any).saveChangesToFile.bind(service);
        (service as any).saveChangesToFile = async (bytes: Uint8Array) => { await save(bytes); throw new Error('forced persistence failure'); };
        await assert.rejects(service.deleteRows('records', [rows[0]]), /forced persistence failure/);
        assert.deepStrictEqual((await service.getTableData('records')).values, [[1, null], [2, 1], [3, 2], [4, null]]);
        assert.deepStrictEqual(fs.readFileSync(databasePath), before);
        for (const pragma of ['foreign_keys', 'recursive_triggers', 'ignore_check_constraints']) {
            assert.deepStrictEqual((await service.executeQuery(`PRAGMA ${pragma}`)).values, [[1]], pragma);
        }
        (service as any).saveChangesToFile = save;
        assert.strictEqual(await service.deleteRows('records', [rows[0]]), 1);
        assert.deepStrictEqual(diskRows(), [[4, null]]);
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
