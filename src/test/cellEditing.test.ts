import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import initSqlJs = require('sql.js');
import { DatabaseService, EditableTableData, RowIdentity } from '../databaseService';
import { isWebviewToExtensionMessage } from '../webviewMessages';

suite('Stable cell editing', () => {
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
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-intelliview-cell-edit-'));
        databasePath = path.join(tempDir, 'test.sqlite');
        service = new DatabaseService();
    });

    teardown(() => {
        service.closeDatabase();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function createDatabase(sql: string): void {
        const db = new SQL.Database();
        db.exec(sql);
        fs.writeFileSync(databasePath, Buffer.from(db.export()));
        db.close();
    }

    function readRows<T = Record<string, unknown>>(sql: string): T[] {
        const db = new SQL.Database(fs.readFileSync(databasePath));
        const statement = db.prepare(sql);
        const rows: T[] = [];
        try {
            while (statement.step()) {
                rows.push(statement.getAsObject() as unknown as T);
            }
            return rows;
        } finally {
            statement.free();
            db.close();
        }
    }

    function identityFor(data: EditableTableData, column: string, value: unknown): RowIdentity {
        const columnIndex = data.columns.indexOf(column);
        const rowIndex = data.values.findIndex(row => row[columnIndex] === value);
        assert.ok(rowIndex >= 0, `Expected a row whose ${column} is ${String(value)}`);
        const identity = data.rowIdentities[rowIndex];
        assert.ok(identity, 'Expected the row to have a stable identity');
        return identity;
    }

    test('persists edited control characters and literal escapes without changing their bytes', async () => {
        const original = 'A newline:\nthen some slashes\\and a carriage return\r.\t\b\f\0';
        const database = new SQL.Database();
        database.run('CREATE TABLE notes(body TEXT)');
        database.run('INSERT INTO notes VALUES (?)', [original]);
        fs.writeFileSync(databasePath, database.export());
        database.close();
        await service.openDatabase(databasePath);
        const data = await service.getTableData('notes');
        assert.ok(data.rowIdentities[0]);
        assert.strictEqual(data.values[0][0], original);
        assert.strictEqual((await service.executeQuery('SELECT body FROM notes')).values[0][0], original);
        const edited = data.values[0][0] + ' changed';
        await service.updateCellData('notes', data.rowIdentities[0], 'body', edited);
        assert.deepStrictEqual(readRows('SELECT hex(body) AS bytes FROM notes'), [
            { bytes: Buffer.from(edited, 'utf8').toString('hex').toUpperCase() }
        ]);
        assert.strictEqual((await service.getTableDataPaginated('notes', 1, 100)).values[0][0], edited);
    });

    test('preserves controls and spaces around numeric-looking text, including a NUL primary key', async () => {
        const database = new SQL.Database();
        database.run('CREATE TABLE notes(code TEXT PRIMARY KEY NOT NULL, body TEXT) WITHOUT ROWID');
        database.run('INSERT INTO notes VALUES (?, ?)', ['key\0suffix', '\t123\r\n']);
        fs.writeFileSync(databasePath, database.export());
        database.close();
        await service.openDatabase(databasePath);
        const data = await service.getTableData('notes');
        assert.strictEqual(data.rowIdentities[0]?.parts[0].value, 'key\0suffix');
        for (const text of ['\t456\r\n', ' 789 ', '123\t', '\n0\n']) {
            await service.updateCellData('notes', data.rowIdentities[0]!, 'body', text);
            assert.strictEqual((await service.getTableData('notes')).values[0][1], text);
            assert.deepStrictEqual(readRows('SELECT hex(body) AS bytes FROM notes'), [
                { bytes: Buffer.from(text).toString('hex').toUpperCase() }
            ]);
        }
    });

    test('reproduces the reported Id 1 to 5 and Id 5 to 40 OFFSET mismatch', async () => {
        createDatabase(`
            CREATE TABLE records (
                record_key TEXT PRIMARY KEY,
                Id INTEGER,
                display_order INTEGER,
                value TEXT
            );
            INSERT INTO records VALUES
                ('a', 99, 0, 'ninety-nine'),
                ('b', 5, 5, 'five'),
                ('c', 2, 2, 'two'),
                ('d', 3, 3, 'three'),
                ('e', 4, 4, 'four'),
                ('f', 40, 6, 'forty'),
                ('g', 1, 1, 'one');
        `);

        const disk = new SQL.Database(fs.readFileSync(databasePath));
        const rowidStatement = disk.prepare('SELECT rowid FROM records ORDER BY rowid LIMIT 1 OFFSET ?');
        const idStatement = disk.prepare('SELECT Id FROM records WHERE rowid = ?');
        const oldOffsetTargets = [1, 5].map(offset => {
            const rowid = rowidStatement.get([offset])[0];
            rowidStatement.reset();
            const id = idStatement.get([rowid])[0];
            idStatement.reset();
            return id;
        });
        rowidStatement.free();
        idStatement.free();
        disk.close();
        assert.deepStrictEqual(oldOffsetTargets, [5, 40]);

        await service.openDatabase(databasePath);
        const data = await service.getTableData('records');
        const displayOrderIndex = data.columns.indexOf('display_order');
        const idIndex = data.columns.indexOf('Id');
        const visible = data.values
            .map((row, sourceIndex) => ({ row, identity: data.rowIdentities[sourceIndex] }))
            .sort((a, b) => Number(a.row[displayOrderIndex]) - Number(b.row[displayOrderIndex]));
        assert.strictEqual(visible[1].row[idIndex], 1);
        assert.strictEqual(visible[5].row[idIndex], 5);

        await service.updateCellData('records', visible[1].identity!, 'value', 'selected-one');
        await service.updateCellData('records', visible[5].identity!, 'value', 'selected-five');

        service.closeDatabase();
        assert.deepStrictEqual(readRows('SELECT Id, value FROM records WHERE Id IN (1, 5, 40) ORDER BY Id'), [
            { Id: 1, value: 'selected-one' },
            { Id: 5, value: 'selected-five' },
            { Id: 40, value: 'forty' }
        ]);
    });

    test('keeps identity attached through first/middle row sorting, filtering, and virtual source ordering', async () => {
        createDatabase(`
            CREATE TABLE records (Id INTEGER PRIMARY KEY, value TEXT);
            INSERT INTO records VALUES (1, 'one'), (5, 'five'), (40, 'forty'), (75, 'seventy-five');
        `);
        await service.openDatabase(databasePath);
        const data = await service.getTableDataPaginated('records', 1, 100);

        const pairedRows = data.values.map((row, index) => ({ row, identity: data.rowIdentities[index] }));
        const sorted = [...pairedRows].sort((a, b) => Number(b.row[0]) - Number(a.row[0]));
        const firstVisibleId1 = sorted.find(item => item.row[0] === 1);
        assert.ok(firstVisibleId1?.identity);
        await service.updateCellData('records', firstVisibleId1.identity, 'value', 'sorted-one');

        const filtered = pairedRows.filter(item => String(item.row[0]).includes('5'));
        const middleId5 = filtered.find(item => item.row[0] === 5);
        assert.ok(middleId5?.identity);
        await service.updateCellData('records', middleId5.identity, 'value', 'filtered-five');

        const virtualOrder = [3, 0, 2, 1];
        const virtualRows = virtualOrder.map(sourceIndex => pairedRows[sourceIndex]);
        const virtualVisibleRow = virtualRows[2];
        assert.strictEqual(virtualVisibleRow.row[0], 40);
        assert.ok(virtualVisibleRow.identity);
        await service.updateCellData('records', virtualVisibleRow.identity, 'value', 'virtual-forty');

        service.closeDatabase();
        assert.deepStrictEqual(readRows('SELECT Id, value FROM records ORDER BY Id'), [
            { Id: 1, value: 'sorted-one' },
            { Id: 5, value: 'filtered-five' },
            { Id: 40, value: 'virtual-forty' },
            { Id: 75, value: 'seventy-five' }
        ]);
    });

    test('uses implicit rowid on a later pagination page and leaves neighbouring rows unchanged', async () => {
        createDatabase(`
            CREATE TABLE notes (value TEXT);
            INSERT INTO notes(value) VALUES ('one'), ('two'), ('three'), ('four'), ('five'), ('six');
        `);
        await service.openDatabase(databasePath);
        const secondPage = await service.getTableDataPaginated('notes', 2, 2);

        assert.strictEqual(secondPage.rowIdentities[0]?.kind, 'rowid');
        assert.strictEqual(secondPage.rowIdentities[0]?.parts[0].value, 3);
        assert.deepStrictEqual(secondPage.values.map(row => row[0]), ['three', 'four']);
        await service.updateCellData('notes', secondPage.rowIdentities[0]!, 'value', 'page-two-first');

        service.closeDatabase();
        assert.deepStrictEqual(readRows('SELECT rowid, value FROM notes ORDER BY rowid'), [
            { rowid: 1, value: 'one' },
            { rowid: 2, value: 'two' },
            { rowid: 3, value: 'page-two-first' },
            { rowid: 4, value: 'four' },
            { rowid: 5, value: 'five' },
            { rowid: 6, value: 'six' }
        ]);
    });

    test('paginates deterministically by the stable row identity', async () => {
        createDatabase(`
            CREATE TABLE ordered_records (code TEXT PRIMARY KEY NOT NULL, value TEXT);
            INSERT INTO ordered_records VALUES ('charlie', 'C'), ('alpha', 'A'), ('bravo', 'B');
        `);
        await service.openDatabase(databasePath);

        const firstPage = await service.getTableDataPaginated('ordered_records', 1, 2);
        const secondPage = await service.getTableDataPaginated('ordered_records', 2, 2);

        assert.deepStrictEqual(firstPage.values.map(row => row[0]), ['alpha', 'bravo']);
        assert.deepStrictEqual(secondPage.values.map(row => row[0]), ['charlie']);
        assert.deepStrictEqual(
            firstPage.rowIdentities.map(identity => identity?.parts[0].value),
            ['alpha', 'bravo']
        );
    });

    test('caps read limits and falls back for unsafe integer limits', async () => {
        createDatabase(`
            CREATE TABLE many_rows (id INTEGER PRIMARY KEY);
            WITH RECURSIVE sequence(id) AS (
                SELECT 1
                UNION ALL
                SELECT id + 1 FROM sequence WHERE id < 100001
            )
            INSERT INTO many_rows SELECT id FROM sequence;
        `);
        await service.openDatabase(databasePath);

        const capped = await service.getTableData('many_rows', 100001);
        const unsafe = await service.getTableData('many_rows', Number.MAX_SAFE_INTEGER + 1);
        const secondCappedPage = await service.getTableDataPaginated('many_rows', 2, 200000);

        assert.strictEqual(capped.values.length, 100000);
        assert.strictEqual(unsafe.values.length, 1000);
        assert.deepStrictEqual(secondCappedPage.values, [[100001]]);
    });

    test('supports text and composite primary keys, WITHOUT ROWID, and primary-key edits', async () => {
        createDatabase(`
            CREATE TABLE text_keys (code TEXT PRIMARY KEY NOT NULL, value TEXT);
            INSERT INTO text_keys VALUES ('alpha', 'A'), ('beta', 'B');
            CREATE TABLE memberships (
                account TEXT,
                region TEXT,
                value TEXT,
                PRIMARY KEY (account, region)
            ) WITHOUT ROWID;
            INSERT INTO memberships VALUES ('acct', 'eu', 'old'), ('acct', 'us', 'untouched');
        `);
        await service.openDatabase(databasePath);

        const textRows = await service.getTableData('text_keys');
        const originalTextIdentity = identityFor(textRows, 'code', 'alpha');
        const keyEdit = await service.updateCellData('text_keys', originalTextIdentity, 'code', 'alpha-renamed');
        await service.updateCellData('text_keys', keyEdit.identity, 'value', 'renamed-value');

        const compositeRows = await service.getTableData('memberships');
        assert.strictEqual(compositeRows.rowIdentities[0]?.parts.length, 2);
        const euIdentity = identityFor(compositeRows, 'region', 'eu');
        await service.updateCellData('memberships', euIdentity, 'value', 'composite-updated');

        service.closeDatabase();
        assert.deepStrictEqual(readRows('SELECT code, value FROM text_keys ORDER BY code'), [
            { code: 'alpha-renamed', value: 'renamed-value' },
            { code: 'beta', value: 'B' }
        ]);
        assert.deepStrictEqual(readRows('SELECT account, region, value FROM memberships ORDER BY region'), [
            { account: 'acct', region: 'eu', value: 'composite-updated' },
            { account: 'acct', region: 'us', value: 'untouched' }
        ]);
    });

    test('uses rowid when a declared primary key permits null values', async () => {
        createDatabase(`
            CREATE TABLE nullable_keys (code TEXT PRIMARY KEY, value TEXT);
            INSERT INTO nullable_keys VALUES (NULL, 'first'), (NULL, 'second');
        `);
        await service.openDatabase(databasePath);

        const data = await service.getTableData('nullable_keys');
        assert.deepStrictEqual(data.rowIdentities.map(identity => identity?.kind), ['rowid', 'rowid']);
        await service.updateCellData('nullable_keys', data.rowIdentities[1]!, 'value', 'updated-second');

        service.closeDatabase();
        assert.deepStrictEqual(readRows('SELECT rowid, code, value FROM nullable_keys ORDER BY rowid'), [
            { rowid: 1, code: null, value: 'first' },
            { rowid: 2, code: null, value: 'updated-second' }
        ]);
    });

    test('binds quotes, Unicode, and null values without changing the selected identity', async () => {
        createDatabase(`
            CREATE TABLE content (id INTEGER PRIMARY KEY, value TEXT);
            INSERT INTO content VALUES (1, 'first'), (5, 'second'), (6, 'nonempty'), (40, 'third');
            CREATE TABLE "odd""table" ("key""part" TEXT PRIMARY KEY, "value""text" TEXT);
            INSERT INTO "odd""table" VALUES ('quoted-key', 'old');
        `);
        await service.openDatabase(databasePath);
        const data = await service.getTableData('content');

        await service.updateCellData('content', identityFor(data, 'id', 1), 'value', "O'Reilly — 雪");
        await service.updateCellData('content', identityFor(data, 'id', 5), 'value', null);
        const emptyStringEdit = await service.updateCellData('content', identityFor(data, 'id', 6), 'value', '');
        assert.strictEqual(emptyStringEdit.value, '');
        const quoted = await service.getTableData('odd"table');
        await service.updateCellData(
            'odd"table',
            identityFor(quoted, 'key"part', 'quoted-key'),
            'value"text',
            'safe " identifier'
        );

        service.closeDatabase();
        assert.deepStrictEqual(readRows('SELECT id, value FROM content ORDER BY id'), [
            { id: 1, value: "O'Reilly — 雪" },
            { id: 5, value: null },
            { id: 6, value: '' },
            { id: 40, value: 'third' }
        ]);
        assert.deepStrictEqual(readRows('SELECT "value""text" AS value FROM "odd""table"'), [
            { value: 'safe " identifier' }
        ]);
    });

    test('preserves exact 64-bit rowid and INTEGER PRIMARY KEY identities', async () => {
        createDatabase(`
            CREATE TABLE integer_keys (id INTEGER PRIMARY KEY, value TEXT);
            INSERT INTO integer_keys VALUES (9223372036854775806, 'integer-key');
            CREATE TABLE rowid_keys (value TEXT);
            INSERT INTO rowid_keys(rowid, value) VALUES (9223372036854775805, 'rowid-key');
        `);
        await service.openDatabase(databasePath);

        const integerRows = await service.getTableData('integer_keys');
        assert.strictEqual(integerRows.values[0][0], '9223372036854775806');
        assert.strictEqual(integerRows.rowIdentities[0]?.parts[0].value, '9223372036854775806');
        await service.updateCellData('integer_keys', integerRows.rowIdentities[0]!, 'value', 'updated-integer-key');

        const rowidRows = await service.getTableData('rowid_keys');
        assert.strictEqual(rowidRows.values[0][0], 'rowid-key');
        assert.strictEqual(rowidRows.rowIdentities[0]?.parts[0].value, '9223372036854775805');
        await service.updateCellData('rowid_keys', rowidRows.rowIdentities[0]!, 'value', 'updated-rowid-key');

        service.closeDatabase();
        assert.deepStrictEqual(
            readRows('SELECT CAST(id AS TEXT) AS id, value FROM integer_keys'),
            [{ id: '9223372036854775806', value: 'updated-integer-key' }]
        );
        assert.deepStrictEqual(
            readRows('SELECT CAST(rowid AS TEXT) AS rowid, value FROM rowid_keys'),
            [{ rowid: '9223372036854775805', value: 'updated-rowid-key' }]
        );
    });

    test('round-trips BLOB primary-key identities through webview messages', async () => {
        createDatabase(`
            CREATE TABLE blob_keys (id BLOB PRIMARY KEY NOT NULL, value TEXT);
            INSERT INTO blob_keys VALUES (X'0001FF', 'first'), (X'0002FF', 'second');
        `);
        await service.openDatabase(databasePath);
        const data = await service.getTableData('blob_keys');
        const message = JSON.parse(JSON.stringify({
            type: 'updateCellData',
            tableName: 'blob_keys',
            requestId: 'blob-update',
            rowIdentity: data.rowIdentities[0],
            columnName: 'value',
            newValue: 'updated-first'
        }));

        assert.deepStrictEqual(message.rowIdentity.parts[0].value, { type: 'blob', base64: 'AAH/' });
        assert.ok(isWebviewToExtensionMessage(message));
        assert.strictEqual(message.type, 'updateCellData');
        await service.updateCellData(message.tableName, message.rowIdentity, message.columnName, message.newValue);

        const invalidMessage = {
            ...message,
            rowIdentity: {
                ...message.rowIdentity,
                parts: [{ column: 'id', value: { type: 'blob', base64: 'not-base64' } }]
            }
        };
        assert.strictEqual(isWebviewToExtensionMessage(invalidMessage), false);

        service.closeDatabase();
        assert.deepStrictEqual(readRows('SELECT hex(id) AS id, value FROM blob_keys ORDER BY id'), [
            { id: '0001FF', value: 'updated-first' },
            { id: '0002FF', value: 'second' }
        ]);
    });

    test('restores committed in-memory state when persistence fails', async () => {
        createDatabase(`
            CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT);
            INSERT INTO records VALUES (1, 'original');
        `);
        await service.openDatabase(databasePath);
        const data = await service.getTableData('records');
        (service as any).saveChangesToFile = async () => {
            throw new Error('forced persistence failure');
        };

        await assert.rejects(
            service.updateCellData('records', data.rowIdentities[0]!, 'value', 'must-not-stick'),
            /forced persistence failure/
        );

        const afterFailure = await service.getTableData('records');
        assert.strictEqual(afterFailure.values[0][1], 'original');
        assert.deepStrictEqual(readRows('SELECT id, value FROM records'), [{ id: 1, value: 'original' }]);
    });

    test('restores deleted rows in memory and on disk when persistence fails', async () => {
        createDatabase(`
            CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT);
            INSERT INTO records VALUES (1, 'original');
        `);
        await service.openDatabase(databasePath);
        const saveChangesToFile = (service as any).saveChangesToFile.bind(service);
        (service as any).saveChangesToFile = async (databaseState?: Uint8Array) => {
            assert.ok(databaseState instanceof Uint8Array);
            await saveChangesToFile(databaseState);
            throw new Error('forced delete persistence failure');
        };

        await assert.rejects(
            service.deleteRow('records', { column: 'id', value: 1 }),
            /forced delete persistence failure/
        );

        const afterFailure = await service.getTableData('records');
        assert.deepStrictEqual(afterFailure.values, [[1, 'original']]);
        assert.deepStrictEqual(readRows('SELECT id, value FROM records'), [{ id: 1, value: 'original' }]);
    });

    test('preserves earlier in-memory query changes when later persistence fails', async () => {
        createDatabase(`
            CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT);
            INSERT INTO records VALUES (1, 'disk-one'), (2, 'disk-two'), (3, 'disk-three');
        `);
        await service.openDatabase(databasePath);
        await service.executeQuery("UPDATE records SET value = 'query-change' WHERE id = 1");
        const data = await service.getTableData('records');
        (service as any).saveChangesToFile = async () => {
            throw new Error('forced persistence failure');
        };

        await assert.rejects(
            service.updateCellData('records', identityFor(data, 'id', 2), 'value', 'must-not-stick'),
            /forced persistence failure/
        );
        await assert.rejects(
            service.deleteRow('records', { column: 'id', value: 3 }),
            /forced persistence failure/
        );

        const afterFailures = await service.getTableData('records');
        assert.deepStrictEqual(afterFailures.values, [
            [1, 'query-change'],
            [2, 'disk-two'],
            [3, 'disk-three']
        ]);
        assert.deepStrictEqual(readRows('SELECT id, value FROM records ORDER BY id'), [
            { id: 1, value: 'disk-one' },
            { id: 2, value: 'disk-two' },
            { id: 3, value: 'disk-three' }
        ]);
    });

    test('rolls back deletes unless exactly one row matches', async () => {
        createDatabase(`
            CREATE TABLE records (id INTEGER PRIMARY KEY, category TEXT, value TEXT);
            INSERT INTO records VALUES (1, 'duplicate', 'one'), (2, 'duplicate', 'two'), (3, 'unique', 'three');
        `);
        await service.openDatabase(databasePath);
        const saveChangesToFile = (service as any).saveChangesToFile.bind(service);
        let persistenceAttempts = 0;
        (service as any).saveChangesToFile = async (databaseState?: Uint8Array) => {
            persistenceAttempts++;
            await saveChangesToFile(databaseState);
        };

        await assert.rejects(
            service.deleteRow('records', { column: 'category', value: 'duplicate' }),
            /expected one changed row but SQLite reported 2/
        );
        await assert.rejects(
            service.deleteRow('records', { column: 'id', value: 99 }),
            /No row was deleted/
        );

        assert.strictEqual(persistenceAttempts, 0);
        assert.deepStrictEqual((await service.getTableData('records')).values, [
            [1, 'duplicate', 'one'],
            [2, 'duplicate', 'two'],
            [3, 'unique', 'three']
        ]);
        assert.deepStrictEqual(readRows('SELECT id, category, value FROM records ORDER BY id'), [
            { id: 1, category: 'duplicate', value: 'one' },
            { id: 2, category: 'duplicate', value: 'two' },
            { id: 3, category: 'unique', value: 'three' }
        ]);
    });

    test('serializes persistence for concurrent updates and deletes', async () => {
        createDatabase(`
            CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT);
            INSERT INTO records VALUES (1, 'one'), (2, 'two'), (3, 'three');
        `);
        await service.openDatabase(databasePath);
        const data = await service.getTableData('records');
        const saveChangesToFile = (service as any).saveChangesToFile.bind(service);
        let activeSaves = 0;
        let maxActiveSaves = 0;
        (service as any).saveChangesToFile = async (databaseState?: Uint8Array) => {
            activeSaves++;
            maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
            await new Promise(resolve => setTimeout(resolve, 10));
            try {
                await saveChangesToFile(databaseState);
            } finally {
                activeSaves--;
            }
        };

        await Promise.all([
            service.updateCellData('records', identityFor(data, 'id', 1), 'value', 'updated-one'),
            service.updateCellData('records', identityFor(data, 'id', 2), 'value', 'updated-two'),
            service.deleteRow('records', { column: 'id', value: 3 })
        ]);

        assert.strictEqual(maxActiveSaves, 1);
        assert.deepStrictEqual(readRows('SELECT id, value FROM records ORDER BY id'), [
            { id: 1, value: 'updated-one' },
            { id: 2, value: 'updated-two' }
        ]);
    });

    test('rejects stale and unavailable row identities without persisting changes', async () => {
        createDatabase(`
            CREATE TABLE stable (a TEXT NOT NULL, b TEXT NOT NULL, value TEXT, PRIMARY KEY (a, b));
            INSERT INTO stable VALUES ('one', 'same', 'first'), ('two', 'same', 'second');
            CREATE TABLE shadowed (rowid TEXT, _rowid_ TEXT, oid TEXT, value TEXT);
            INSERT INTO shadowed VALUES ('r', 'u', 'o', 'unchanged');
            CREATE VIEW stable_view AS SELECT * FROM stable;
        `);
        await service.openDatabase(databasePath);

        const staleIdentity: RowIdentity = {
            kind: 'primaryKey',
            parts: [{ column: 'a', value: 'missing' }, { column: 'b', value: 'missing' }]
        };
        await assert.rejects(
            service.updateCellData('stable', staleIdentity, 'value', 'must-not-write'),
            /No row was updated/
        );

        const shadowed = await service.getTableData('shadowed');
        assert.strictEqual(shadowed.editable, false);
        assert.ok(shadowed.rowIdentities.every(identity => identity === null));
        assert.match(shadowed.editError || '', /rowid aliases are shadowed/);
        const forgedShadowedIdentity: RowIdentity = {
            kind: 'rowid',
            parts: [{ column: 'rowid', value: 'r' }]
        };
        await assert.rejects(
            service.updateCellData('shadowed', forgedShadowedIdentity, 'value', 'must-not-write'),
            /rowid aliases are shadowed/
        );
        const shadowedAfterUpdate = await service.getTableData('shadowed');
        assert.strictEqual(shadowedAfterUpdate.values[0][3], 'unchanged');

        const view = await service.getTableData('stable_view');
        assert.strictEqual(view.editable, false);
        assert.match(view.editError || '', /Views cannot be edited safely/);

        service.closeDatabase();
        assert.deepStrictEqual(readRows('SELECT value FROM stable ORDER BY rowid'), [
            { value: 'first' },
            { value: 'second' }
        ]);
        assert.deepStrictEqual(readRows('SELECT value FROM shadowed'), [{ value: 'unchanged' }]);
    });
});
