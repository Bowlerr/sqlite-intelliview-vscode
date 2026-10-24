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
    executeRowDeletion, getRowIdentifier,
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
  win.handleExtensionMessage({ data: { ...messages[0], type: 'deleteRowsSuccess', changes: 2, totalRows: 4 } });
  assert.equal(messages.length, 2);
  assert.equal(messages[1].type, 'getTableData');
  assert.equal(messages[1].page, 2, 'empty final page clamps to its predecessor');
  assert.equal(win.getSelectionStore(wrapper).size, 0);
  win.handleRowsDeletionResult({ ...messages[0], changes: 2 }, true);
  assert.equal(messages.length, 2, 'duplicate response is ignored');
});

test('deletion refresh uses authoritative remaining rows, including trigger deletes', t => {
  for (const totalRows of [1, 0, undefined]) {
    const { win, wrapper, messages } = fixture(t, [[5, 'five'], [6, 'six']], { page: 3, pageSize: 2, totalRows: 6 });
    win.toggleRowSelection(wrapper, 4);
    win.deleteSelectedRows(wrapper);confirm(win);
    win.handleRowsDeletionResult({ ...messages[0], changes: 1, totalRows }, true);
    assert.equal(messages[1].page, totalRows === undefined ? 3 : 1,
      'without a fresh count, keep the current page until its count arrives');
    assert.equal(wrapper.dataset.paginationPending, 'true');
  }
});

test('single-row context deletion uses stable identity rather than displayed column names', t => {
  const { win, wrapper, api, messages } = fixture(t);
  api.setCurrentRow(wrapper.querySelector('tr.resizable-row'));
  win.deleteRowWithConfirmation();
  confirm(win);
  assert.equal(messages[0].type, 'deleteRows');
  assert.deepEqual(messages[0].rowIdentities, [identity(2)]);
});

test('virtual spacer and placeholder cells cannot open a row menu or delete row zero', t => {
  const { win, wrapper, api, messages } = fixture(t, Array.from({ length: 400 }, (_, index) => [index, 'row']), { virtualize: true });
  win.initializeContextMenu();
  const spacer = wrapper.querySelector('.virtual-spacer td');
  assert.ok(spacer);
  spacer.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const menu = win.document.querySelector('.context-menu');
  assert.equal(menu.style.display, 'none');
  menu.querySelector('[data-action="delete-row"]').click();
  assert.equal(win.document.querySelector('.confirm-dialog-overlay'), null);
  api.executeRowDeletion(null, spacer.closest('tr'));
  assert.equal(api.getRowIdentifier(spacer.closest('tr')), null);
  for (const index of ['', ' ', '-1', '1.5']) {
    const row = wrapper.querySelector('tr.resizable-row');
    row.setAttribute('data-row-index', index);
    api.executeRowDeletion(null, row);
  }
  assert.equal(win.document.querySelector('.confirm-dialog-overlay'), null);
  assert.equal(messages.length, 0);
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

for (const virtualize of [false, true]) {
  test(`editing-only tables retain selection/export/cell editing but reject every deletion path (virtual=${virtualize})`, t => {
    const reason = 'Row deletion is unavailable for this "virtual" table.';
    const { win, wrapper, api, messages, exports } = fixture(t, [[1, 'one'], [2, 'two']], {
      virtualize, allowEditing: true, allowDeletion: false, deleteError: reason,
    });
    assert.equal(wrapper.dataset.editable, 'true');
    assert.equal(wrapper.dataset.deletable, 'false');
    assert.equal(wrapper.querySelector('[data-action="delete-selected"]'), null);
    assert.equal(wrapper.querySelector('.table-readonly-indicator').title, reason);
    wrapper.querySelector('.select-all-checkbox').click();
    assert.equal(win.getSelectionStore(wrapper).size, 2);
    api.exportTableData(wrapper, { onlySelected: true });assert.equal(exports.length, 1);
    win.deleteSelectedRows(wrapper);win.confirmRowDeletion(wrapper, [0]);
    assert.equal(win.document.querySelector('.confirm-dialog-overlay'), null);
    win.initializeContextMenu();
    const cell = wrapper.querySelector('td[data-column="1"]');
    cell.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const deleteItem = win.document.querySelector('.context-menu [data-action="delete-row"]');
    assert.equal(deleteItem.style.display, 'none');
    deleteItem.click();
    assert.equal(win.document.querySelector('.confirm-dialog-overlay'), null);
    assert.equal(messages.length, 0);
    win.startCellEditing(cell);assert.equal(cell.classList.contains('editing'), true);
  });
}

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

for (const filterKind of ['search', 'column']) {
  test(`select-all recovers after a ${filterKind} filter hides every row`, t => {
    const { win, wrapper, api } = fixture(t);
    const selectAll = wrapper.querySelector('.select-all-checkbox');
    const filter = value => filterKind === 'search'
      ? api.filterTable(wrapper, value)
      : api.filterTableByColumn(wrapper.querySelector('table'), 1, value);
    filter('no such person');
    assert.equal(selectAll.disabled, true);
    filter('');
    assert.equal(selectAll.disabled, false);
    selectAll.click();
    assert.equal(win.getSelectionStore(wrapper).size, 2);
    assert.equal(selectAll.checked, true);
    filter('Alice');
    assert.equal(selectAll.disabled, false);
    assert.equal(selectAll.checked, false);
    selectAll.click();
    assert.equal(win.getSelectionStore(wrapper).size, 1);
  });
}

function clipboardEvent(win, target, type, values) {
  const event = new win.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: {
    setData: (format, value) => values.set(format, value),
    getData: format => values.get(format) || '',
  } });
  target.dispatchEvent(event);
  return event;
}

test('copying escaped editor text exposes raw plain text and pastes without double encoding', t => {
  const raw = 'line\ncarriage\r\ttab\0 literal\\n slash\\end';
  const { win, wrapper, messages } = fixture(t, [[1, raw], [2, '']]);
  const cells = wrapper.querySelectorAll('td[data-column="1"]');
  win.startCellEditing(cells[0]);
  const source = cells[0].querySelector('.cell-input');
  source.select();
  const clipboard = new Map();
  assert.equal(clipboardEvent(win, source, 'copy', clipboard).defaultPrevented, true);
  assert.equal(clipboard.get('text/plain'), raw, 'other apps receive actual controls and backslashes');
  win.cancelCellEdit(cells[0]);
  win.startCellEditing(cells[1]);
  const target = cells[1].querySelector('.cell-input');
  clipboardEvent(win, target, 'paste', clipboard);
  assert.equal(target.value, win.encodeCellText(raw));
  win.saveCellEdit(cells[1]);
  assert.equal(messages[0].newValue, raw);
});

test('cut and paste preserve exact escaped fragments and update dirty state only for mutations', t => {
  const { win, wrapper, messages } = fixture(t, [[1, 'start\0end']]);
  const cell = wrapper.querySelector('td[data-column="1"]');
  win.startCellEditing(cell);
  const input = cell.querySelector('.cell-input');
  const original = input.value;
  // An incomplete escape must be copied as an editor fragment, not encoded again.
  input.setSelectionRange(5, 8);
  const clipboard = new Map();
  clipboardEvent(win, input, 'copy', clipboard);
  assert.equal(cell.dataset.editDirty, 'false');
  clipboardEvent(win, input, 'cut', clipboard);
  assert.equal(input.value, original.slice(0, 5) + original.slice(8));
  assert.equal(cell.dataset.editDirty, 'true');
  clipboardEvent(win, input, 'paste', clipboard);
  assert.equal(input.value, original);
  win.saveCellEdit(cell);
  assert.equal(messages.length, 0, 'cut/paste round trip is a no-op save');
});

test('external text and changed clipboard plain text remain raw paste inputs', t => {
  const { win, wrapper, messages } = fixture(t, [[1, 'line\n']]);
  const cell = wrapper.querySelector('td[data-column="1"]');
  win.startCellEditing(cell);
  const input = cell.querySelector('.cell-input');
  input.select();
  const clipboard = new Map();
  clipboardEvent(win, input, 'copy', clipboard);
  clipboard.set('text/plain', 'literal\\n and raw\n');
  clipboardEvent(win, input, 'paste', clipboard);
  win.saveCellEdit(cell);
  assert.equal(messages[0].newValue, 'literal\\n and raw\n');
});

for (const virtualize of [false, true]) {
  for (const filterKind of ['search', 'column']) {
    test(`${filterKind} filters raw stored paths and controls (virtual=${virtualize})`, t => {
      const values = ['C:\\temp', 'line\nbreak', 'line\\nbreak', ' padded ', null, 'NULL', [65, 255]];
      const { win, wrapper, api } = fixture(t, values.map((value, index) => [index, value]), { virtualize });
      const expected = [['C:\\temp', [0]], ['line\nbreak', [1]], ['line\\nbreak', [2]], [' padded ', [3]], ['NULL', [5]], ['65,255', [6]]];
      for (const [search, indices] of expected) {
        if (filterKind === 'search') api.filterTable(wrapper, search);
        else api.filterTableByColumn(wrapper.querySelector('table'), 1, search);
        assert.deepEqual(Array.from(win.getVisibleRowGlobalIndices(wrapper)), indices, search);
      }
    });
  }
}

test('cached local pagination preserves an active editor until it is cancelled', t => {
  const { win, wrapper, messages, api } = fixture(t, [[1, 'first'], [2, 'second']], {
    pageSize: 1, totalRows: undefined, backendPaginated: false,
  });
  const cell = wrapper.querySelector('td[data-column="1"]');
  win.startCellEditing(cell);
  cell.querySelector('.cell-input').value = 'unsaved';
  const snapshot = api.getTableSnapshot(wrapper);
  win.updateTablePage(wrapper, 2);
  assert.equal(wrapper.isConnected, true);
  assert.equal(wrapper.dataset.currentPage, '1');
  assert.equal(snapshot.identitiesInvalid, undefined);
  assert.equal(cell.querySelector('.cell-input').value, 'unsaved');
  assert.equal(messages.length, 0);
  win.cancelCellEdit(cell);
  win.updateTablePage(wrapper, 2);
  assert.equal(wrapper.isConnected, false);
  const replacement = win.document.querySelector('.enhanced-table-wrapper');
  assert.equal(replacement.dataset.currentPage, '2');
  assert.equal(replacement.querySelector('td[data-column="1"] .cell-content').textContent, 'second');
  assert.equal(messages.length, 0);
});

for (const virtualize of [false, true]) {
  for (const restored of [false, true]) {
    test(`${restored ? 'restored' : 'clicked'} sort uses raw keys (virtual=${virtualize})`, t => {
      const { win, wrapper, api } = fixture(t, [[0, '10'], [1, '\t20']], { virtualize });
      if (restored) {
        win.getTabViewState = () => ({ sort: { columnName: 'name', dir: 'asc' } });
        win.applyTabViewStateToWrapper(wrapper, 'people');
      } else {
        api.sortTableByColumn(wrapper.querySelector('table'), 1);
      }
      assert.deepEqual(Array.from(win.getVisibleRowGlobalIndices(wrapper)), [0, 1]);
      if (restored) {
        win.getTabViewState = () => ({ sort: { columnName: 'name', dir: 'desc' } });
        win.applyTabViewStateToWrapper(wrapper, 'people');
      } else {
        api.sortTableByColumn(wrapper.querySelector('table'), 1);
      }
      assert.deepEqual(Array.from(win.getVisibleRowGlobalIndices(wrapper)), [1, 0]);
    });
  }
}

test('regular and virtual sorting share raw keys for numbers, controls, NULL and blobs', t => {
  const rows = [null, 'NULL', 10, '\t20', 'C:\\temp', 'line\nbreak', 'line\\nbreak', [65, 255]]
    .map((value, index) => [index, value]);
  const regular = fixture(t, rows);
  const virtual = fixture(t, rows, { virtualize: true });
  for (let click = 0; click < 3; click++) {
    for (const table of [regular, virtual]) table.api.sortTableByColumn(table.wrapper.querySelector('table'), 1);
    assert.deepEqual(Array.from(regular.win.getVisibleRowGlobalIndices(regular.wrapper)),
      Array.from(virtual.win.getVisibleRowGlobalIndices(virtual.wrapper)));
  }
});

test('mixed numeric and text sorts stay consistent through repeated clicks and restores', t => {
  const rows = [10, '\t20', null, 'NULL', '\\n'].map((value, index) => [index, value]);
  for (const virtualize of [false, true]) for (const restored of [false, true]) {
    const table = fixture(t, rows, { virtualize });
    for (const dir of ['asc', 'desc', 'asc', 'desc']) {
      if (restored) {
        table.win.getTabViewState = () => ({ sort: { columnName: 'name', dir } });
        table.win.applyTabViewStateToWrapper(table.wrapper, 'people');
      } else table.api.sortTableByColumn(table.wrapper.querySelector('table'), 1);
      assert.deepEqual(Array.from(table.win.getVisibleRowGlobalIndices(table.wrapper)),
        dir === 'asc' ? [0, 1, 2, 4, 3] : [3, 4, 2, 1, 0], `${virtualize}/${restored}/${dir}`);
    }
  }
});

test('numeric/text comparison is antisymmetric and transitive, including non-finite values', t => {
  const { win } = fixture(t);
  const keys = ['10', '\t20', '\\n', '', 'NULL', '-3', '1e3', 'Infinity', '-Infinity', 'NaN', '65,255'];
  for (const direction of ['asc', 'desc']) for (const a of keys) for (const b of keys) {
    const ab = win.compareValues(a, b, direction);
    const ba = win.compareValues(b, a, direction);
    assert.ok(!Number.isNaN(ab), `non-finite comparison ${a}/${b}`);
    assert.ok(Math.sign(ab) === -Math.sign(ba), `antisymmetry ${a}/${b}`);
    for (const c of keys) {
      if (ab <= 0 && win.compareValues(b, c, direction) <= 0) {
        assert.ok(win.compareValues(a, c, direction) <= 0, `transitivity ${a}/${b}/${c}/${direction}`);
      }
    }
  }
});

test('equal sort keys retain source order after sorting a different column', t => {
  for (const virtualize of [false, true]) {
    const { win, wrapper, api } = fixture(t, [[1, '10'], [0, '10.0'], [2, ' 10']], { virtualize });
    api.sortTableByColumn(wrapper.querySelector('table'), 0);
    for (const dir of ['asc', 'desc']) {
      win.getTabViewState = () => ({ sort: { columnName: 'name', dir } });
      win.applyTabViewStateToWrapper(wrapper, 'people');
      assert.deepEqual(Array.from(win.getVisibleRowGlobalIndices(wrapper)), [0, 1, 2]);
    }
  }
});

test('virtual viewport selection work is bounded by rendered rows, with empty and full selections', t => {
  const rows = Array.from({ length: 10000 }, (_, index) => [index, index % 2 ? 'odd' : 'even']);
  const { win, wrapper, api } = fixture(t, rows, { virtualize: true });
  const selection = win.getSelectionStore(wrapper);
  const has = selection.has.bind(selection);
  let lookups = 0;
  selection.has = value => { lookups++; return has(value); };
  const scroll = offset => {
    wrapper.__virtualTableState.scrollContainer.scrollTop = offset;
    lookups = 0;
    api.renderVirtual(wrapper);
    const rendered = wrapper.querySelectorAll('tr.resizable-row').length;
    assert.ok(rendered < 100, 'the fixture renders a small viewport');
    assert.ok(lookups <= rendered, `${lookups} selection lookups for ${rendered} rendered rows`);
  };
  scroll(100000);
  const selectAll = wrapper.querySelector('.select-all-checkbox');
  selectAll.click();
  assert.equal(selection.size, 10000);
  scroll(200000);
  assert.equal(selectAll.checked, true);
  assert.equal(selectAll.indeterminate, false);
  assert.ok(Array.from(wrapper.querySelectorAll('.row-select-checkbox')).every(box => box.checked));
  api.filterTable(wrapper, 'not found');
  assert.equal(selectAll.checked, false);
  assert.equal(selectAll.disabled, true);
  api.filterTable(wrapper, 'even');
  assert.equal(selectAll.disabled, false);
  selectAll.click();
  assert.equal(selection.size, 5000);
  scroll(300000);
  assert.equal(selectAll.checked, true);
});
