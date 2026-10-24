const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = ['utils.js', 'state.js', 'table.js', 'events.js']
  .map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n');
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="data-content"></div><button id="outside">Outside</button></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const win = dom.window;
  win.tables = [];
  win.getCurrentTableName = () => 'items';
  const messages = [], persisted = [];
  win.debug = { debug() {}, warn() {}, error() {} };
  win.vscode = { postMessage: message => messages.push(plain(message)), setState: state => persisted.push(plain(state)) };
  win.showSuccess = win.showError = () => {};
  win.getAllDOMElements = () => ({ dataContent: win.document.getElementById('data-content') });
  win.eval(source + '\nwindow.testApi = { PAGINATION_CONFIG, positivePageInteger, effectiveTablePageSize, normalizeTablePageLimit, handleUpdate, handleTableData, handleTableRowCount, handleQueryResult, displayQueryResults };');
  const pageSize = options.pageSize ?? 100;
  const page = options.page ?? 1;
  win.updateState({ selectedTable: 'items', activeTable: 'items', pageSize, currentPage: page,
    openTables: [{ key: 'items', label: 'items', viewState: { page, pageSize } }] });
  win.testApi.handleTableData({ type: 'tableData', success: true, tableName: 'items', data: [[1, 'one'], [2, 'two']], columns: ['id', 'name'],
    totalRows: 10000, totalRowsKnown: true, editable: options.editable === true,
    rowIdentities: [1, 2].map(value => ({ kind: 'primaryKey', parts: [{ column: 'id', value }] })),
    page, pageSize, maxTablePageSize: options.maximum ?? 100000 });
  const wrapper = () => win.document.querySelector('.enhanced-table-wrapper');
  const custom = () => {
    const select = wrapper().querySelector('.page-size-select');
    select.focus();
    select.value = 'custom';
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
    return wrapper().querySelector('.page-size-custom-input');
  };
  const key = (element, name) => element.dispatchEvent(new win.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  return { win, wrapper, custom, key, messages, persisted, api: win.testApi };
}

test('row limit validation accepts only positive safe sizes and only zero means unlimited', t => {
  const { api } = fixture(t);
  for (const value of ['', ' ', 0, -1, 1.5, NaN, Infinity, 'Infinity', '1x', Number.MAX_SAFE_INTEGER + 1, null, true]) {
    assert.equal(api.positivePageInteger(value), null, String(value));
  }
  assert.equal(api.positivePageInteger('1e3'), 1000);
  assert.equal(api.effectiveTablePageSize(200000, 0), 200000);
  assert.equal(api.effectiveTablePageSize(200000, 150000), 150000);
  assert.equal(api.effectiveTablePageSize(undefined, 5), 5);
  for (const value of [-1, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(api.normalizeTablePageLimit(value), 100000);
  }
});

test('custom input has a name, instructions, an active custom option, and persistent validation', t => {
  const { win, wrapper, custom, key, messages } = fixture(t, { pageSize: 75 });
  const select = wrapper().querySelector('.page-size-select');
  assert.equal(select.value, '75');
  assert.equal(select.selectedOptions[0].textContent, 'Custom (75)');
  const input = custom();
  assert.equal(input.getAttribute('aria-label'), 'Rows per page');
  assert.match(win.document.getElementById(input.getAttribute('aria-describedby')).textContent, /Enter to apply; Escape to cancel/);
  assert.equal(win.document.activeElement, input);
  for (const value of ['', '0', '-2', '2.5', 'Infinity', '9007199254740992']) {
    input.value = value;
    key(input, 'Enter');
    assert.equal(input.isConnected, true);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(messages.length, 0);
  }
  input.value = '125';
  input.dispatchEvent(new win.Event('input'));
  assert.equal(input.hasAttribute('aria-invalid'), false);
});

test('Escape restores the selector and permits reopening; blur preserves the next focus target', t => {
  const { win, wrapper, custom, key, messages } = fixture(t, { pageSize: 75 });
  key(custom(), 'Escape');
  const select = wrapper().querySelector('.page-size-select');
  assert.equal(win.document.activeElement, select);
  assert.equal(select.value, '75');
  assert.equal(select.hidden, false);
  assert.ok(custom());
  win.document.getElementById('outside').focus();
  assert.equal(wrapper().querySelector('.page-size-custom-input'), null);
  assert.equal(win.document.activeElement.id, 'outside');
  assert.equal(messages.length, 0);
});

test('Enter accepts scientific notation once and restores focus after the accepted snapshot', t => {
  const { win, wrapper, custom, key, messages, api } = fixture(t, { maximum: 0 });
  const input = custom();
  input.value = '1e3';
  key(input, 'Enter');
  key(input, 'Enter');
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], { type: 'getTableData', tableName: 'items', page: 1, pageSize: 1000, key: '' });
  api.handleTableData({ success: true, tableName: 'items', data: [[1]], columns: ['id'], page: 1, pageSize: 1000, maxTablePageSize: 0, totalRows: 10000 });
  assert.equal(win.document.activeElement, wrapper().querySelector('.page-size-select'));
  assert.equal(win.document.activeElement.value, '1000');
  assert.equal(win.getTabViewState('items').pageSize, 1000);
});

test('the cap applies before preserving the first row and is announced after rendering', t => {
  const { win, wrapper, custom, key, messages, api } = fixture(t, { page: 4, pageSize: 100, maximum: 150 });
  const input = custom();
  input.value = '1000';
  key(input, 'Enter');
  assert.equal(messages[0].page, 3, 'row offset 300 becomes page 3 at effective size 150');
  assert.equal(messages[0].pageSize, 150);
  assert.match(wrapper().querySelector('.page-size-status').textContent, /limited to 150/);
  api.handleTableData({ success: true, tableName: 'items', data: [[301]], columns: ['id'], page: 3, pageSize: 150, maxTablePageSize: 150, totalRows: 10000 });
  assert.match(wrapper().querySelector('.page-size-status').textContent, /limited to 150/);
  assert.equal(win.getCurrentState().pageSize, 150);
  assert.equal(win.getTabViewState('items').page, 3);
});

test('accepted pagination corrects stored state and ignores stale or pending background counts', t => {
  const { win, wrapper, messages, api } = fixture(t, { page: 3, pageSize: 10, maximum: 10 });
  win.handlePageSizeChange(wrapper(), 6);
  assert.equal(messages[0].page, 4);
  api.handleTableRowCount({ tableName: 'items', totalRows: 88, page: 3, pageSize: 10, maxTablePageSize: 10 });
  assert.equal(wrapper().dataset.totalRows, '10000');
  api.handleTableData({ success: true, tableName: 'items', data: [[16]], columns: ['id'], page: 4, pageSize: 5, maxTablePageSize: 5, totalRows: null, totalRowsKnown: false });
  assert.equal(wrapper().dataset.pageSize, '5');
  assert.equal(wrapper().dataset.maxTablePageSize, '5');
  assert.equal(win.getCurrentState().pageSize, 5);
  assert.equal(win.getTabViewState('items').pageSize, 5);
  api.handleTableRowCount({ tableName: 'items', totalRows: 88, page: 3, pageSize: 10, maxTablePageSize: 10 });
  assert.equal(wrapper().dataset.totalRowsKnown, 'false');
  api.handleTableRowCount({ tableName: 'items', totalRows: 123, page: 4, pageSize: 5, maxTablePageSize: 5 });
  assert.equal(wrapper().dataset.totalRows, '123');
  assert.equal(wrapper().dataset.currentPage, '4');
  assert.equal(win.getCurrentState().pageSize, 5);
  assert.equal(wrapper().querySelector('.page-size-select').value, '5');
});

test('an inactive table response cannot alter active pagination state', t => {
  const { win, wrapper, api } = fixture(t);
  api.handleTableData({ success: true, tableName: 'other', data: [[1]], columns: ['id'], page: 9, pageSize: 5, maxTablePageSize: 5 });
  assert.equal(win.getCurrentState().pageSize, 100);
  assert.equal(wrapper().dataset.table, 'items');
});

test('result limits survive local pagination and tab restoration without fetching database rows', t => {
  const { win, wrapper, messages, api } = fixture(t);
  const rows = Array.from({ length: 125 }, (_, index) => [index + 1]);
  api.displayQueryResults(rows, ['id'], 'SELECT id FROM items', { truncated: true, maxRows: 125 });
  const name = win.getCurrentState().selectedTable;
  assert.equal(wrapper().dataset.backendPaginated, 'false');
  assert.equal(wrapper().querySelectorAll('tbody tr.resizable-row').length, 100);
  assert.match(wrapper().querySelector('.query-limit-notice').textContent, /first 125 query rows/);
  win.updateTablePage(wrapper(), 2);
  assert.equal(wrapper().querySelectorAll('tbody tr.resizable-row').length, 25);
  assert.equal(wrapper().querySelector('td[data-column="0"] .cell-content').textContent, '101');
  win.handlePageSizeChange(wrapper(), 50);
  assert.equal(wrapper().dataset.currentPage, '3');
  assert.equal(messages.length, 0);
  const cached = win._resultCache.get(name);
  // main.js recreates tabs with legacy defaults; the cached tab's saved view is authoritative.
  win.document.getElementById('data-content').innerHTML = win.createDataTable(cached.data, cached.columns, name,
    { isQueryResult: true, pageSize: 100, currentPage: 1, totalRows: cached.data.length });
  assert.equal(wrapper().dataset.pageSize, '50');
  assert.equal(wrapper().dataset.currentPage, '3');
  assert.match(wrapper().querySelector('.query-limit-notice').textContent, /first 125 query rows/);
  assert.equal(wrapper().querySelector('td[data-column="0"] .cell-content').textContent, '101');
});

test('settings normalize invalid defaults and apply a small finite cap on initial bind', t => {
  const { win, api } = fixture(t);
  api.handleUpdate({ databasePath: '/tmp/example.sqlite', isConnected: true, settings: { defaultPageSize: Infinity, maxTablePageSize: 5 } });
  assert.equal(api.PAGINATION_CONFIG.defaultPageSize, 5);
  assert.equal(win.getCurrentState().pageSize, 5);
});

test('schema metadata is never paginated or truncated by a table row cap', t => {
  const { win, api } = fixture(t);
  api.PAGINATION_CONFIG.maxTablePageSize = 1;
  const holder = win.document.createElement('div');
  holder.innerHTML = win.createDataTable([['id'], ['name'], ['email']], ['name'], 'schema', { pageSize: 1, page: 2 });
  assert.equal(holder.querySelectorAll('tbody tr.resizable-row').length, 3);
  assert.equal(holder.querySelector('.page-size-select'), null);
  assert.equal(holder.querySelector('.enhanced-table-wrapper').dataset.currentPage, '1');
});

test('same-second executions get separate result tabs and local restores clamp stale pages', t => {
  const { win, wrapper, api } = fixture(t);
  const RealDate = win.Date;
  win.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-24T12:00:00Z'])); } };
  api.displayQueryResults(Array.from({ length: 125 }, (_, index) => [index]), ['id'], 'first');
  const first = win.getCurrentState().selectedTable;
  win.updateTablePage(wrapper(), 2);
  api.displayQueryResults([[10], [20], [30]], ['id'], 'second');
  const second = win.getCurrentState().selectedTable;
  assert.notEqual(second, first);
  assert.equal(wrapper().dataset.currentPage, '1');
  assert.equal(wrapper().querySelectorAll('tbody tr.resizable-row').length, 3);
  win.setTabViewState(second, { page: 900, pageSize: 2 });
  const cached = win._resultCache.get(second);
  win.document.getElementById('data-content').innerHTML = win.createDataTable(cached.data, cached.columns, second,
    { isQueryResult: true, totalRows: 3, allowEditing: false });
  assert.equal(wrapper().dataset.currentPage, '2');
  assert.equal(wrapper().querySelectorAll('tbody tr.resizable-row').length, 1);
});

test('Next preserves dirty edits until the blur save succeeds, without invalidating their snapshot', async t => {
  const { win, wrapper, messages } = fixture(t, { editable: true });
  const table = wrapper();
  const cell = table.querySelector('td[data-column="1"]');
  const snapshot = win.__tableDataStash.get(table.dataset.tableId);
  win.toggleRowSelection(table, 0);
  win.startCellEditing(cell);
  const input = cell.querySelector('.cell-input');
  input.value = 'unsaved\\nvalue';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  input.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true }));
  table.querySelector('.pagination-btn[data-action="next"]').click();
  assert.equal(table.dataset.currentPage, '1');
  assert.equal(snapshot.identitiesInvalid, undefined);
  assert.equal(win.getSelectionStore(table).size, 1);
  assert.equal(win.getCurrentState().currentPage, 1);
  assert.equal(win.getTabViewState('items').page, 1);
  assert.equal(messages.length, 0);
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'updateCellData');
  assert.equal(messages[0].newValue, 'unsaved\nvalue');
  table.querySelector('.pagination-btn[data-action="next"]').click();
  assert.equal(messages.length, 1, 'navigation also waits for an in-flight save');
  win.handleCellUpdateSuccess({ ...messages[0], rowIdentity: messages[0].rowIdentity });
  table.querySelector('.pagination-btn[data-action="next"]').click();
  assert.equal(messages[1].type, 'getTableData');
  assert.equal(messages[1].page, 2);
});

for (const phase of ['editing', 'saving']) {
  test(`preset and custom page-size changes do not mutate state while a cell is ${phase}`, t => {
    const { win, wrapper, messages } = fixture(t, { editable: true });
    const table = wrapper();
    const cell = table.querySelector('td[data-column="1"]');
    const snapshot = win.__tableDataStash.get(table.dataset.tableId);
    const select = table.querySelector('.page-size-select');
    win.startCellEditing(cell);
    cell.querySelector('.cell-input').value = 'changed';
    if (phase === 'saving') win.saveCellEdit(cell);
    const beforeMessages = messages.length;
    win.handlePageSizeChange(table, 500);
    assert.equal(table.dataset.pageSize, '100');
    select.value = '500';
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
    assert.equal(select.value, '100');
    select.value = 'custom';
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
    assert.equal(select.value, '100');
    assert.equal(table.querySelector('.page-size-custom-input'), null);
    assert.equal(win.getCurrentState().pageSize, 100);
    assert.equal(win.getTabViewState('items').pageSize, 100);
    assert.equal(snapshot.identitiesInvalid, undefined);
    assert.equal(messages.length, beforeMessages);
    assert.equal(cell.querySelector('.cell-input').value, 'changed');
    if (phase === 'saving') {
      cell.remove();
      win.updateTablePage(table, 2);
      assert.equal(messages.length, beforeMessages, 'pending save remains guarded after virtualized cell detaches');
    }
  });
}

test('an empty page keeps its wrapper until an authoritative count clamps and refetches it', t => {
  const { win, wrapper, messages, api } = fixture(t, { page: 4, pageSize: 2 });
  const empty = { success: true, tableName: 'items', data: [], columns: ['id'], page: 4, pageSize: 2, totalRows: null, totalRowsKnown: false };
  api.handleTableData(empty);
  assert.ok(wrapper(), 'the count callback must have a matching rendered wrapper');
  assert.ok(wrapper().querySelector('.table-pagination'));
  assert.ok(wrapper().querySelector('[data-action="first"]'), 'a failed count must still allow returning to the first page');
  const count = { tableName: 'items', totalRows: 3, page: 4, pageSize: 2 };
  api.handleTableRowCount(count);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].page, 2);
  assert.equal(wrapper().dataset.paginationPending, 'true');
  api.handleTableRowCount(count);
  assert.equal(messages.length, 1, 'a repeated count cannot refetch the stale page');
  api.handleTableData({ ...empty, data: [[3]], page: 2, totalRows: 3, totalRowsKnown: true });
  api.handleTableRowCount(count);
  assert.equal(messages.length, 1, 'the old page count cannot affect the replacement');
  assert.equal(wrapper().dataset.currentPage, '2');
  assert.match(wrapper().querySelector('.visible-rows').textContent, /Showing 3-3 of 3 rows/);
});

test('known empty pages clamp immediately and a fully emptied table settles on page one', t => {
  const { wrapper, messages, api } = fixture(t, { page: 4, pageSize: 2 });
  const empty = { success: true, tableName: 'items', data: [], columns: ['id'], page: 4, pageSize: 2, totalRows: 3, totalRowsKnown: true };
  api.handleTableData(empty);
  assert.equal(messages[0]?.page, 2);
  api.handleTableData({ ...empty, page: 2, totalRows: 0 });
  assert.equal(messages[1]?.page, 1);
  api.handleTableData({ ...empty, page: 1, totalRows: 0 });
  api.handleTableRowCount({ tableName: 'items', totalRows: 0, page: 1, pageSize: 2 });
  assert.equal(messages.length, 2, 'page one with zero rows cannot loop');
  assert.equal(wrapper().dataset.currentPage, '1');
  assert.match(wrapper().querySelector('.visible-rows').textContent, /Showing 0 of 0 rows/);
  assert.equal(wrapper().querySelector('.select-all-checkbox').disabled, true);
});

test('an empty page can return to the first page when its count never arrives', t => {
  const { wrapper, messages, api } = fixture(t, { page: 4, pageSize: 2 });
  api.handleTableData({ success: true, tableName: 'items', data: [], columns: ['id'], page: 4, pageSize: 2, totalRows: null, totalRowsKnown: false });
  wrapper().querySelector('[data-action="first"]').click();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].page, 1);
});
