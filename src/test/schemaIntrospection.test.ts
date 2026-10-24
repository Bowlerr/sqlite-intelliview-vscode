import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import initSqlJs = require('sql.js');
import { DatabaseService } from '../databaseService';
import { getSqlite3CliInfo } from '../walUtils';

suite('Schema introspection with unavailable virtual table modules', () => {
    let SQL: initSqlJs.SqlJsStatic;
    let tempDir: string;
    let databasePath: string;
    let service: DatabaseService;

    suiteSetup(async () => {
        SQL = await initSqlJs({
            locateFile: file => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file)
        });
    });

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-intelliview-schema-'));
        databasePath = path.join(tempDir, 'test.sqlite');
        service = new DatabaseService();
    });

    teardown(() => {
        service.closeDatabase();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function createDatabase(virtualTables: Array<{ name: string; sql: string }>, additionalSql = ''): void {
        const db = new SQL.Database();
        try {
            db.exec(`
                CREATE TABLE parents (id INTEGER PRIMARY KEY);
                CREATE TABLE records (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents(id), body TEXT NOT NULL DEFAULT 'body');
                ${additionalSql}
            `);
            // Supply virtual schema entries without requiring a native module in
            // the test runner. Reopening reproduces an unavailable module exactly.
            db.exec('PRAGMA writable_schema = ON');
            for (const table of virtualTables) {
                db.run(
                    'INSERT INTO sqlite_master(type, name, tbl_name, rootpage, sql) VALUES (?, ?, ?, 0, ?)',
                    ['table', table.name, table.name, table.sql]
                );
            }
            db.exec('PRAGMA writable_schema = OFF');
            fs.writeFileSync(databasePath, Buffer.from(db.export()));
        } finally {
            db.close();
        }
    }

    test('recovers FTS5 columns while preserving ordinary schema and relationships', async () => {
        createDatabase([{ name: 'docs', sql: 'CREATE VIRTUAL TABLE docs USING fts5(content, title UNINDEXED)' }]);
        const originalBytes = fs.readFileSync(databasePath);
        await service.openDatabase(databasePath);

        // This is the old diagram failure path and remains a real SQL error:
        // metadata recovery does not pretend to provide FTS5 query support.
        await assert.rejects(service.executeQuery('PRAGMA table_info(docs)'), /no such module: fts5/);
        assert.deepStrictEqual(await service.getTableSchema('docs'), {
            columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'],
            values: [[0, 'content', '', 0, null, 0], [1, 'title', '', 0, null, 0]]
        });
        assert.deepStrictEqual(await service.getTableInfo('docs'), [
            { name: 'content', type: '', notnull: false, dflt_value: null, pk: false },
            { name: 'title', type: '', notnull: false, dflt_value: null, pk: false }
        ]);
        assert.deepStrictEqual(await service.getForeignKeys('docs'), []);
        assert.deepStrictEqual(await service.getTableSchema('records'), {
            columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'],
            values: [
                [0, 'id', 'INTEGER', 0, null, 1],
                [1, 'parent_id', 'INTEGER', 0, null, 0],
                [2, 'body', 'TEXT', 1, "'body'", 0]
            ]
        });
        assert.deepStrictEqual(await service.getForeignKeys('records'), [
            { column: 'parent_id', referencedTable: 'parents', referencedColumn: 'id' }
        ]);
        assert.deepStrictEqual((await service.getTableInfo('records'))[1].fk, {
            referencedTable: 'parents', referencedColumn: 'id'
        });
        assert.deepStrictEqual(fs.readFileSync(databasePath), originalBytes);
    });

    test('handles quoted names, escaped delimiters, comments, and interleaved FTS5 options', async () => {
        const tableName = 'docs" USING fts5(fake), table';
        createDatabase([{
            name: tableName,
            sql: `CREATE VIRTUAL TABLE "docs"" USING fts5(fake), table" USING/* module */"fts5" (
                "comma,name", prefix='2 3', 'quote''name' UNINDEXED,
                \`tick\`\`name\`, [bracket name], /* ignore , ) */ "equal=name",
                tokenize='unicode61 tokenchars '',()''',
                "--literal/*name*/", -- ignore , )
                "double""quote"/* column comment */, content=''
            )`
        }]);
        await service.openDatabase(databasePath);
        assert.deepStrictEqual((await service.getTableSchema(tableName)).values.map(row => row[1]), [
            'comma,name', "quote'name", 'tick`name', 'bracket name', 'equal=name', '--literal/*name*/', 'double"quote'
        ]);
        assert.strictEqual((await service.getTableInfo(tableName)).length, 7);
        assert.deepStrictEqual(await service.getForeignKeys(tableName), []);
        assert.deepStrictEqual(await service.getTableSchema(tableName.toUpperCase()), await service.getTableSchema(tableName));
    });

    test('supports external-content and contentless FTS5 tables without inventing option columns', async () => {
        createDatabase([
            { name: 'external_docs', sql: "CREATE VIRTUAL TABLE external_docs USING fts5(body, content='records', content_rowid='id')" },
            { name: 'contentless_docs', sql: "CREATE VIRTUAL TABLE contentless_docs USING fts5(title, columnsize=0, body, content='')" }
        ]);
        await service.openDatabase(databasePath);
        const schemas = await Promise.all((await service.getTables()).map(table => service.getTableSchema(table.name)));
        assert.strictEqual(schemas.length, 4);
        assert.deepStrictEqual((await service.getTableSchema('external_docs')).values.map(row => row[1]), ['body']);
        assert.deepStrictEqual((await service.getTableSchema('contentless_docs')).values.map(row => row[1]), ['title', 'body']);
    });

    test('does not hide unsupported modules or errors from views referencing FTS5', async () => {
        createDatabase([
            { name: 'docs', sql: 'CREATE VIRTUAL TABLE docs USING fts5(content)' },
            { name: 'other', sql: 'CREATE VIRTUAL TABLE other USING unavailable_module(content)' }
        ], 'CREATE VIEW docs_view AS SELECT * FROM docs; CREATE VIEW broken_view AS SELECT * FROM missing_table;');
        await service.openDatabase(databasePath);
        await assert.rejects(service.getTableSchema('other'), /no such module: unavailable_module/);
        await assert.rejects(service.getTableSchema('docs_view'), /no such module: fts5/);
        await assert.rejects(service.getTableSchema('broken_view'), /no such table: main.missing_table/);
        await assert.rejects(service.executeQuery('SELECT * FROM docs'), /no such module: fts5/);
    });

    test('enumerates a real native FTS5 database including its shadow tables without changing the file', async function () {
        const sqlite3Cli = await getSqlite3CliInfo();
        if (!sqlite3Cli) {
            this.skip();
            return;
        }
        execFileSync(sqlite3Cli.command, [databasePath, `
            CREATE TABLE records (id INTEGER PRIMARY KEY, body TEXT);
            CREATE VIRTUAL TABLE docs USING fts5(title, body);
            INSERT INTO docs VALUES ('Title', 'Some searchable text');
            CREATE VIRTUAL TABLE external_docs USING fts5(body, content='records', content_rowid='id');
            CREATE VIRTUAL TABLE contentless_docs USING fts5(body, content='');
        `]);
        const originalBytes = fs.readFileSync(databasePath);
        await service.openDatabase(databasePath);
        const tables = await service.getTables();
        assert.ok(tables.some(table => table.name === 'docs_content'));
        const schemas = await Promise.all(tables.map(table => service.getTableSchema(table.name)));
        assert.ok(schemas.every(schema => schema.values.length > 0));
        await Promise.all(tables.map(table => service.getForeignKeys(table.name)));
        assert.deepStrictEqual((await service.getTableSchema('docs')).values.map(row => row[1]), ['title', 'body']);
        assert.deepStrictEqual(fs.readFileSync(databasePath), originalBytes);
        assert.strictEqual(execFileSync(sqlite3Cli.command, [databasePath, "SELECT title FROM docs WHERE docs MATCH 'searchable'"], { encoding: 'utf8' }).trim(), 'Title');
    });
});
