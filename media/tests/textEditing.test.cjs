const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { encodeCellText, decodeCellText, createCSVContent } = require('../utils.js');

function setupCell(value) {
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
  const win = dom.window;
  const messages = [];
  const errors = [];
  win.tables = [];
  win.getCurrentState = () => ({ selectedTable: 'notes', encryptionKey: '' });
  win.vscode = { postMessage: (message) => messages.push(message) };
  win.showError = (message) => errors.push(message);
  win.showSuccess = () => {};
  for (const name of ['utils.js', 'table.js', 'events.js']) {
    win.eval(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
  }
  win.getCurrentTableName = () => 'notes';
  const html = win.renderTableCellHtml(value, 0, 0, ['body'], false, true, new Map(), {});
  win.document.body.innerHTML = `<div class="enhanced-table-wrapper" data-table-id="notes"><table class="data-table"><tbody><tr data-local-index="0">${html}</tr></tbody></table></div>`;
  win.__tableDataStash = new win.Map([['notes', {
    pageData: [[value]], rowIdentities: [{ kind: 'rowid', parts: [{ column: 'rowid', value: 1 }] }]
  }]]);
  return { dom, win, messages, errors, cell: win.document.querySelector('td') };
}

test('escapes round trip all controls, literal escape sequences, quotes and Unicode', () => {
  const value = Array.from({ length: 160 }, (_, index) => String.fromCharCode(index)).join('') + '\\n\\u0000 "<& 😀\u2028\u2029';
  assert.equal(decodeCellText(encodeCellText(value)), value);
  assert.equal(encodeCellText('Hello\nWorld'), 'Hello\\nWorld');
  assert.equal(encodeCellText('literal\\n'), 'literal\\\\n');
  for (const invalid of ['\\', '\\x20', '\\u00', '\\uZZZZ', '\\z']) {
    assert.throws(() => decodeCellText(invalid), /Invalid escape/);
  }
});

test('the reported newline, carriage return and backslashes survive rendering and editing', () => {
  const original = 'A newline:\nthen some slashes\\and a carriage return\r.\0';
  const { dom, win, cell, messages } = setupCell(original);
  try {
    assert.equal(cell.querySelector('.cell-content').textContent, encodeCellText(original));
    assert.equal(win.getCellOriginalText(cell.querySelector('.cell-content')), original);
    win.startCellEditing(cell);
    const input = cell.querySelector('.cell-input');
    assert.equal(input.value, encodeCellText(original));
    input.value += ' changed';
    cell.setAttribute('data-edit-dirty', 'true');
    win.saveCellEdit(cell);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].newValue, original + ' changed');
    win.handleCellUpdateSuccess({ requestId: messages[0].requestId, newValue: messages[0].newValue, rowIdentity: messages[0].rowIdentity });
    assert.equal(cell.querySelector('.cell-content').textContent, encodeCellText(original + ' changed'));
    assert.equal(win.getCellOriginalText(cell.querySelector('.cell-content')), original + ' changed');
  } finally { dom.window.close(); }
});

test('no-op save preserves controls and NULL; invalid escapes remain editable without sending', () => {
  for (const value of ['one\ntwo\r', null, '', 'NULL', '  padded  ']) {
    const { dom, win, cell, messages, errors } = setupCell(value);
    try {
      win.startCellEditing(cell);
      win.saveCellEdit(cell);
      assert.equal(messages.length, 0);
      assert.equal(cell.classList.contains('editing'), false);
      win.startCellEditing(cell);
      cell.querySelector('.cell-input').value = '\\invalid';
      win.saveCellEdit(cell);
      assert.equal(messages.length, 0);
      assert.equal(cell.classList.contains('editing'), true);
      assert.equal(errors.length, 1);
    } finally { dom.window.close(); }
  }
});

test('CSV preserves raw newlines, carriage returns, spaces and literal NULL text', () => {
  assert.equal(createCSVContent(['a,b', 'quoted"header'], [['line\nbreak', 'return\r'], ['NULL', null], [' padded ', '\\n']]),
    '"a,b","quoted""header"\n"line\nbreak","return\r"\nNULL,\n padded ,\\n\n');
});
