const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const scripts = ['utils.js', 'table.js', 'context-menu.js', 'events.js'];
const source = scripts.map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n');
const plain = value => JSON.parse(JSON.stringify(value));
const identity = value => ({ kind: 'primaryKey', parts: [{ column: 'id', value }] });

function fixture(t, rows = [[2, 'Bob'], [1, 'Alice']], options = {}) {
  const { tableName = 'people', columnNames = ['id', 'name'], ...tableOptions } = options;
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const win = dom.window;
  win.TextEncoder = TextEncoder;
  const messages = [], errors = [], copies = [], exports = [];
  win.vscode = { postMessage: message => messages.push(plain(message)) };
  win.getCurrentState = () => ({ selectedTable: tableName });
  win.showError = message => errors.push(message);
  win.showSuccess = () => {};
  win.eval(source + `\nwindow.testApi = {
    setCurrentRow: row => { currentRow = row; currentCell = row.querySelector('.data-cell'); },
    setCurrentCell: cell => { currentCell = cell; currentRow = cell.closest('tr'); },
    getForeignKeyInfoForCell, navigateToForeignKeyReference,
    handleTableDataDelta, sortTableByColumn, toggleColumnPin,
    exportTableData, filterTable, filterTableByColumn, getTableSnapshot,
    renderVirtual: wrapper => virtualRender(wrapper.__virtualTableState, {force: true})
  };`);
  win.copyToClipboard = text => copies.push(text);
  win.downloadFile = text => exports.push(text);
  const defaultIdentities = rows.map(row => identity(row[0]));
  win.document.body.innerHTML = win.createDataTable(rows, columnNames, tableName, {
    pageSize: rows.length, totalRows: rows.length, backendPaginated: true,
    rowIdentities: defaultIdentities, allowEditing: true, virtualize: false, ...tableOptions,
  });
  const wrapper = win.document.querySelector('.enhanced-table-wrapper');
  win.initializeTableEvents(wrapper);
  if (wrapper.__virtualTableState) win.testApi.renderVirtual(wrapper);
  return { win, wrapper, messages, errors, copies, exports, api: win.testApi };
}

function confirm(win) {
  const button = win.document.querySelector('.confirm-dialog-btn-confirm');
  assert.ok(button, 'deletion requires a confirmation dialog');
  button.click();
}

test('checkbox, row click, and keyboard checkbox activation each select once', t => {
  const { win, wrapper } = fixture(t);
  const checkbox = wrapper.querySelector('.row-select-checkbox');
  checkbox.click();
  assert.equal(win.getSelectionStore(wrapper).size, 1);
  assert.equal(checkbox.checked, true);
  checkbox.click();
  assert.equal(win.getSelectionStore(wrapper).size, 0);
  wrapper.querySelector('.cell-content').click();
  assert.equal(win.getSelectionStore(wrapper).size, 1);
  checkbox.checked = false;
  checkbox.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(win.getSelectionStore(wrapper).size, 0);
  wrapper.querySelector('.cell-input').click();
  assert.equal(win.getSelectionStore(wrapper).size, 0, 'editing inputs do not select rows');
});

test('sorting and pinning address data columns after checkbox insertion', t => {
  const { wrapper, api } = fixture(t);
  const table = wrapper.querySelector('table');
  api.sortTableByColumn(table, 0);
  assert.equal(table.querySelector('tbody tr').dataset.rowIndex, '1');
  api.toggleColumnPin(table, 0);
  assert.equal(table.querySelector('th[data-column="0"]').classList.contains('pinned'), true);
  assert.equal(table.querySelector('.checkbox-th').classList.contains('pinned'), false);
  assert.equal(table.querySelector('td[data-column="0"]').classList.contains('pinned'), true);
});

test('select-all covers the logical filtered virtual page and survives viewport replacement', t => {
  const rows = Array.from({ length: 400 }, (_, index) => [index, index % 2 ? 'odd' : 'even']);
  const { win, wrapper, api } = fixture(t, rows, { virtualize: true });
  api.filterTable(wrapper, 'even');
  assert.ok(wrapper.querySelectorAll('tr.resizable-row').length < 200);
  wrapper.querySelector('.select-all-checkbox').click();
  assert.equal(win.getSelectionStore(wrapper).size, 200);
  const vs = wrapper.__virtualTableState;
  vs.scrollContainer.scrollTop = 8000;
  api.renderVirtual(wrapper);
  assert.equal(wrapper.querySelector('.select-all-checkbox').checked, true);
  assert.ok(Array.from(wrapper.querySelectorAll('.row-select-checkbox')).every(cb => cb.checked));
  wrapper.querySelector('.select-all-checkbox').click();
  assert.equal(win.getSelectionStore(wrapper).size, 0);
});

test('column filtering and clearing search discard hidden selections', t => {
  const { win, wrapper, api } = fixture(t);
  win.toggleRowSelection(wrapper, 0);
  api.filterTableByColumn(wrapper.querySelector('table'), 1, 'Alice');
  assert.equal(win.getSelectionStore(wrapper).size, 0);
  wrapper.querySelector('.select-all-checkbox').click();
  assert.deepEqual(Array.from(win.getSelectionStore(wrapper)), [1]);
  wrapper.querySelector('.search-clear').click();
  assert.equal(win.getSelectionStore(wrapper).size, 0);
});

for (const virtualize of [false, true]) {
  test(`CSV and JSON retain raw controls, literal NULL, and real null (virtual=${virtualize})`, t => {
    const rows = [[1, 'a\nline\twith\\n and "quotes"'], [2, 'NULL'], [3, null], [4, '']];
    const { win, wrapper, api, copies, exports } = fixture(t, rows, { virtualize });
    api.exportTableData(wrapper, { onlySelected: true });
    assert.equal(exports.length, 0, 'empty selected export does not export all rows');
    win.toggleRowSelection(wrapper, 1);
    api.exportTableData(wrapper, { onlySelected: true });
    assert.equal(exports[0], 'id,name\n2,NULL\n');
    api.exportTableData(wrapper);
    assert.ok(exports[1].includes('"a\nline\twith\\n and ""quotes"""'));
    api.setCurrentRow(wrapper.querySelector('tr.resizable-row'));
    win.copyTableDataAsJSON();
    assert.deepEqual(JSON.parse(copies[0]), rows.map(([id, name]) => ({ id, name })));
    win.copyRowData();
    assert.equal(copies[1], '1\ta\nline\twith\\n and "quotes"');
  });
}

test('batch deletion sends complete typed identities once and refreshes the originating page', t => {
  const ids = [identity({ type: 'blob', base64: 'AQI=' }), identity('9223372036854775806')];
  const { win, wrapper, messages } = fixture(t, [[1, 'one'], [2, 'two']], {
    rowIdentities: ids, page: 3, pageSize: 2, totalRows: 6,
  });
  win.toggleRowSelection(wrapper, 4);
  win.toggleRowSelection(wrapper, 5);
  win.deleteSelectedRows(wrapper);
  confirm(win);
  win.deleteSelectedRows(wrapper);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].rowIdentities, ids);
  assert.equal(messages[0].type, 'deleteRows');
  assert.equal(wrapper.querySelector('.row-select-checkbox').disabled, true);
  win.startCellEditing(wrapper.querySelector('.data-cell'));
  assert.equal(wrapper.querySelectorAll('.editing').length, 0);
  win.handleRowsDeletionResult({ requestId: 'unrelated', tableName: 'people', changes: 2 }, true);
  assert.equal(messages.length, 1);
  win.handleExtensionMessage({ data: { ...messages[0], type: 'deleteRowsSuccess', changes: 2 } });
  assert.equal(messages.length, 2);
  assert.equal(messages[1].type, 'getTableData');
  assert.equal(messages[1].page, 2, 'empty final page clamps to its predecessor');
  assert.equal(win.getSelectionStore(wrapper).size, 0);
  win.handleRowsDeletionResult({ ...messages[0], changes: 2 }, true);
  assert.equal(messages.length, 2, 'duplicate response is ignored');
});

test('single-row context deletion uses stable identity rather than displayed column names', t => {
  const { win, wrapper, api, messages } = fixture(t);
  api.setCurrentRow(wrapper.querySelector('tr.resizable-row'));
  win.deleteRowWithConfirmation();
  confirm(win);
  assert.equal(messages[0].type, 'deleteRows');
  assert.deepEqual(messages[0].rowIdentities, [identity(2)]);
});

test('missing identity fails the entire selection without deleting a subset', t => {
  const { win, wrapper, messages, errors } = fixture(t, [[1, 'one'], [2, 'two']], { rowIdentities: [identity(1), null] });
  wrapper.querySelector('.select-all-checkbox').click();
  win.deleteSelectedRows(wrapper);
  assert.equal(messages.length, 0);
  assert.ok(errors[0].includes('identities'));
  assert.equal(win.document.querySelector('.confirm-dialog-overlay'), null);
});

test('cancel, stale confirmations, and detached snapshots do not submit deletions', t => {
  const { win, wrapper, api, messages } = fixture(t);
  win.toggleRowSelection(wrapper, 0);
  win.deleteSelectedRows(wrapper);
  win.document.querySelector('.confirm-dialog-btn-cancel').click();
  assert.equal(messages.length, 0);
  win.deleteSelectedRows(wrapper);
  api.getTableSnapshot(wrapper).rowIdentities[0] = identity(99);
  confirm(win);
  assert.equal(messages.length, 0);
  win.deleteSelectedRows(wrapper);
  wrapper.remove();
  confirm(win);
  assert.equal(messages.length, 0);
});

test('failed request unlocks the table and retains selection for an explicit retry', t => {
  const { win, wrapper, messages, errors } = fixture(t);
  win.toggleRowSelection(wrapper, 0);
  win.deleteSelectedRows(wrapper);
  confirm(win);
  win.handleRowsDeletionResult({ ...messages[0], message: 'Trigger rejected this batch.' }, false);
  assert.equal(wrapper.dataset.deletePending, undefined);
  assert.equal(win.getSelectionStore(wrapper).size, 1);
  assert.equal(errors.at(-1), 'Trigger rejected this batch.');
  assert.equal(messages.length, 1, 'failed atomic batch needs no success refresh');
});

test('read-only tables cannot delete and real delta messages invalidate destructive selection', t => {
  const { win, wrapper, api, messages } = fixture(t);
  win.toggleRowSelection(wrapper, 0);
  api.handleTableDataDelta({ tableName: 'people', deletes: [0] });
  assert.equal(messages[0].type, 'getTableData');
  assert.equal(win.getSelectionStore(wrapper).size, 0);
  win.toggleRowSelection(wrapper, 1);
  win.deleteSelectedRows(wrapper);
  assert.equal(messages.length, 1);
  wrapper.dataset.editable = 'false';
  win.deleteSelectedRows(wrapper);
  assert.equal(messages.length, 1);
});

test('late response to a detached table cannot refresh or mutate a different table', t => {
  const { win, wrapper, messages } = fixture(t);
  win.toggleRowSelection(wrapper, 0);
  win.deleteSelectedRows(wrapper);
  confirm(win);
  const other = win.document.createElement('div');
  other.dataset.table = 'other';
  wrapper.replaceWith(other);
  win.handleRowsDeletionResult({ ...messages[0], changes: 1 }, true);
  assert.equal(messages.length, 1);
  assert.equal(other.dataset.table, 'other');
});

test('quoted and markup-like names remain text and round-trip through confirmation and response', t => {
  const tableName = 'a"table<&>[name]';
  const columnNames = ['key"[<&>]', 'name"><img src=x>'];
  const rowIdentities = [{ kind: 'primaryKey', parts: [{ column: columnNames[0], value: 1 }] }];
  const { win, wrapper, messages, copies, api } = fixture(t, [[1, 'value']], {
    tableName, columnNames, rowIdentities,
  });
  assert.equal(wrapper.dataset.table, tableName);
  assert.equal(wrapper.querySelector('th[data-column="0"]').dataset.columnName, columnNames[0]);
  assert.equal(wrapper.querySelector('th[data-column="1"] .column-name').textContent, columnNames[1]);
  assert.equal(wrapper.querySelector('img'), null);
  win.toggleRowSelection(wrapper, 0);
  win.deleteSelectedRows(wrapper);
  assert.equal(win.document.querySelector('.confirm-dialog-table-info').textContent, `Table: ${tableName}`);
  confirm(win);
  assert.deepEqual(messages[0].rowIdentities, rowIdentities);
  assert.equal(messages[0].tableName, tableName);
  win.handleExtensionMessage({ data: { ...messages[0], type: 'deleteRowsError', message: 'failed' } });
  assert.equal(wrapper.dataset.deletePending, undefined);
  api.setCurrentRow(wrapper.querySelector('tr.resizable-row'));
  win.copyRowDataAsJSON();
  assert.deepEqual(JSON.parse(copies[0]), { [columnNames[0]]: 1, [columnNames[1]]: 'value' });
});

test('local page two selects identities aligned with the sliced data', t => {
  const { win, wrapper } = fixture(t, [[1, 'a'], [2, 'b'], [3, 'c'], [4, 'd']], {
    page: 2, pageSize: 2, totalRows: undefined, backendPaginated: false,
  });
  win.toggleRowSelection(wrapper, 2);
  assert.deepEqual(plain(win.getSelectedRowIdentities(wrapper)), [identity(3)]);
});

test('read-only query results support selected export without rendering destructive controls', t => {
  const { win, wrapper, exports, messages } = fixture(t, [[1, 'one']], { isQueryResult: true, allowEditing: false });
  assert.equal(wrapper.querySelector('[data-action="delete-selected"]'), null);
  win.toggleRowSelection(wrapper, 0);
  wrapper.querySelector('[data-action="export-selected"]').click();
  assert.equal(exports[0], 'id,name\n1,one\n');
  win.deleteSelectedRows(wrapper);
  assert.equal(messages.length, 0);
});

test('copy cell and foreign-key navigation use raw values including whitespace and literal NULL', t => {
  const values = ['line\nbreak\r\\n', ' 001 ', 'NULL', '', 'key\0tail', null];
  const { win, wrapper, api, copies, messages } = fixture(t, values.map((value, i) => [i, value]));
  const cells = wrapper.querySelectorAll('td[data-column="1"]');
  cells.forEach((cell, index) => {
    cell.classList.add('fk-cell');
    cell.dataset.fkTable = 'parent"table';
    cell.dataset.fkColumn = 'key"name';
    api.setCurrentCell(cell);
    win.copyCellValue();
    assert.equal(copies.at(-1), values[index] ?? '');
    const info = api.getForeignKeyInfoForCell(cell);
    if (values[index] === null) {
      assert.equal(info, null);
      return;
    }
    assert.equal(info.value, values[index]);
    api.navigateToForeignKeyReference();
    assert.ok(messages.at(-1).query.includes('"parent""table" WHERE "key""name"'));
    const expression = values[index].includes('\0')
      ? "CAST(X'6b6579007461696c' AS TEXT)"
      : `'${values[index].replace(/'/g, "''")}'`;
    assert.ok(messages.at(-1).query.includes(`= ${expression} LIMIT`));
  });
});

test('pasting raw LF, CR, tabs and backslashes is encoded and saved losslessly', t => {
  const { win, wrapper, messages } = fixture(t, [[1, 'prefix suffix']]);
  const cell = wrapper.querySelector('td[data-column="1"]');
  win.startCellEditing(cell);
  const input = cell.querySelector('.cell-input');
  input.setSelectionRange(7, 7);
  const pasted = 'line\nbreak\r\t\\n\\';
  const event = new win.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => pasted } });
  input.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(input.value, 'prefix ' + win.encodeCellText(pasted) + 'suffix');
  assert.equal(cell.dataset.editDirty, 'true');
  win.saveCellEdit(cell);
  assert.equal(messages[0].newValue, 'prefix ' + pasted + 'suffix');
});

test('delete confirmation names the dialog, contains keyboard focus, and restores its trigger', t => {
  const { win, wrapper, messages } = fixture(t);
  win.toggleRowSelection(wrapper, 0);
  const trigger = wrapper.querySelector('[data-action="delete-selected"]');
  trigger.focus();
  trigger.click();
  const dialog = win.document.querySelector('dialog.confirm-dialog-overlay');
  assert.ok(dialog);
  assert.equal(win.document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Confirm Row Deletion');
  assert.match(win.document.getElementById(dialog.getAttribute('aria-describedby')).textContent, /cannot be undone/);
  const cancel = dialog.querySelector('.confirm-dialog-btn-cancel');
  const confirmButton = dialog.querySelector('.confirm-dialog-btn-confirm');
  assert.equal(win.document.activeElement, cancel, 'initial focus is the non-destructive action');
  cancel.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(win.document.activeElement, confirmButton);
  confirmButton.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(win.document.activeElement, cancel);
  cancel.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(win.document.querySelector('dialog'), null);
  assert.equal(win.document.activeElement, trigger);
  assert.equal(wrapper.inert, undefined, 'fallback background state is restored');
  assert.equal(messages.length, 0);
});

test('the whole checkbox cell toggles once, including select-all, while pending cells stay locked', t => {
  const { win, wrapper } = fixture(t);
  const cell = wrapper.querySelector('.checkbox-cell');
  const checkbox = cell.querySelector('input');
  cell.click();
  assert.equal(checkbox.checked, true);
  assert.equal(win.getSelectionStore(wrapper).size, 1);
  assert.equal(win.document.activeElement, checkbox);
  cell.click();
  assert.equal(checkbox.checked, false);
  checkbox.click();
  assert.equal(win.getSelectionStore(wrapper).size, 1, 'the native input is not double-toggled');
  const header = wrapper.querySelector('.checkbox-th');
  header.click();
  assert.equal(win.getSelectionStore(wrapper).size, 2);
  header.click();
  assert.equal(win.getSelectionStore(wrapper).size, 0);
  wrapper.dataset.deletePending = 'pending';
  win.updateSelectedUI(wrapper);
  cell.click();
  header.click();
  checkbox.click();
  assert.equal(win.getSelectionStore(wrapper).size, 0);
  delete wrapper.dataset.deletePending;
  wrapper.dataset.editable = 'false';
  win.updateSelectedUI(wrapper);
  cell.click();
  assert.equal(win.getSelectionStore(wrapper).size, 1, 'read-only rows remain selectable for export');
});
