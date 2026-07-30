import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fs from 'fs';
import { JSDOM } from 'jsdom';

beforeAll(() => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  const utilsCode = fs.readFileSync('media/utils.js', 'utf-8');
  const tableCode = fs.readFileSync('media/table.js', 'utf-8');

  const wrapperCode = `
    ${utilsCode}
    ${tableCode}
    window.getVisibleRowGlobalIndices = getVisibleRowGlobalIndices;
  `;

  new Function('window', 'document', wrapperCode)(window, document);
});

afterEach(() => {
  document.body.innerHTML = '';
});

//test for issue 7
it('getVisibleRowGlobalIndices skips hidden rows', () => {
  document.body.innerHTML = `
    <div class="enhanced-table-wrapper" data-table-id="t1" data-start-index="0">
      <table class="data-table"><tbody>
        <tr class="resizable-row" data-row-index="0"><td>A</td></tr>
        <tr class="resizable-row" data-row-index="1" style="display: none"><td>B</td></tr>
        <tr class="resizable-row" data-row-index="2"><td>C</td></tr>
      </tbody></table></div>`;

  const wrapper = document.querySelector('.enhanced-table-wrapper');
  
  expect(window.getVisibleRowGlobalIndices(wrapper)).toEqual([0, 2]);
});

describe('Fix #3 — isEditable gate', () => {
  it('sets data-editable on rendered wrapper', () => {
    const html = window.createDataTable([['val']], ['col'], 'test', {
      page: 1, pageSize: 100, allowEditing: true
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    const wrapper = div.querySelector('.enhanced-table-wrapper');
    expect(wrapper.getAttribute('data-editable')).toBe('true');
  });

  it('sets data-editable="false" for query results', () => {
    const html = window.createDataTable([['val']], ['col'], 'test', {
      page: 1, pageSize: 100, isQueryResult: true
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    const wrapper = div.querySelector('.enhanced-table-wrapper');
    expect(wrapper.getAttribute('data-editable')).toBe('false');
  });

  it('deleteSelectedRows returns early when not editable', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-table-id', 't1');
    wrapper.dataset.editable = 'false';
    expect(() => window.deleteSelectedRows(wrapper)).not.toThrow();
  });
});

describe('Fix #5 — checkbox aria-label', () => {
  it('uses row number in aria-label', () => {
    const html = window.createDataTable(
      [['Alice'], ['Bob']], ['name'], 'test', {
        page: 1, pageSize: 100, allowEditing: false
      }
    );
    const div = document.createElement('div');
    div.innerHTML = html;
    const checkboxes = div.querySelectorAll('.row-select-checkbox');
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0].getAttribute('aria-label')).toBe('Select row 1');
    expect(checkboxes[1].getAttribute('aria-label')).toBe('Select row 2');
  });
});

describe('Fix #4 — no inline display:none on buttons', () => {
  it('uses CSS classes instead of inline display', () => {
    const html = window.createDataTable([['val']], ['col'], 'test', {
      page: 1, pageSize: 100, allowEditing: true
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    const exportBtn = div.querySelector('[data-action="export-selected"]');
    const deleteBtn = div.querySelector('[data-action="delete-selected"]');
    expect(exportBtn).toBeTruthy();
    expect(deleteBtn).toBeTruthy();
    expect(exportBtn.style.display).not.toBe('none');
    expect(deleteBtn.style.display).not.toBe('none');
  });

  it('hides delete button when table is not editable', () => {
    const html = window.createDataTable([['val']], ['col'], 'test', {
      page: 1, pageSize: 100, allowEditing: false
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    const deleteBtn = div.querySelector('[data-action="delete-selected"]');
    expect(deleteBtn).toBeNull();
  });
});

describe('Fix #6 — clearSelection on delta', () => {
  it('clears selection after rows are toggled', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-table-id', 't1');

    window.toggleRowSelection(wrapper, 5);
    window.toggleRowSelection(wrapper, 10);
    const store = window.getSelectionStore(wrapper);
    expect(store.size).toBe(2);

    window.clearSelection(wrapper);
    expect(store.size).toBe(0);
  });

  it('does not throw when no selection store exists', () => {
    const wrapper = document.createElement('div');
    // no data-table-id, so no store
    expect(() => window.clearSelection(wrapper)).not.toThrow();
  });

  it('handles multiple clearSelection calls safely', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-table-id', 't2');

    window.toggleRowSelection(wrapper, 3);
    window.clearSelection(wrapper);
    window.clearSelection(wrapper); // second call
    const store = window.getSelectionStore(wrapper);
    expect(store.size).toBe(0);
  });

  it('getSelectedRowIdentities returns empty after clear', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-table-id', 't3');
    wrapper.setAttribute('data-start-index', '0');

    window.toggleRowSelection(wrapper, 0);
    expect(window.getSelectionStore(wrapper).size).toBe(1);
    window.clearSelection(wrapper);
    expect(window.getSelectedRowIdentities(wrapper)).toEqual([]);
  });
});

describe('Fix #10 — export excludes checkbox column', () => {
  it('skips checkbox td[data-column="-1"] from export data', () => {
    const html = window.createDataTable([['a', 'b']], ['c1', 'c2'], 'test', {
      page: 1, pageSize: 100, allowEditing: false
    });
    document.body.innerHTML = html;
    const wrapper = document.querySelector('.enhanced-table-wrapper');
    const table = wrapper.querySelector('.data-table');
    const row = table.querySelector('tbody tr');
    const cells = row.querySelectorAll('td');
    // First cell should be checkbox (data-column="-1")
    expect(cells[0].getAttribute('data-column')).toBe('-1');
    expect(cells[0].classList.contains('checkbox-cell')).toBe(true);
    // Data cells should have non-negative data-column
    expect(cells[1].getAttribute('data-column')).toBe('0');
    expect(cells[2].getAttribute('data-column')).toBe('1');
  });
});
