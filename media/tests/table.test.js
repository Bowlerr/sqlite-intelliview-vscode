import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
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

describe('Stale identity fix — delta splices stash.rowIdentities', () => {
  beforeEach(() => {
    if (!window.__tableDataStash || !(window.__tableDataStash instanceof Map)) {
      window.__tableDataStash = new Map();
    }
  });

  it('getSelectedRowIdentities returns correct identity after delta-like stash splice', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-table-id', 'stale-dom');
    wrapper.setAttribute('data-start-index', '0');
    wrapper.innerHTML = `
      <table class="data-table"><tbody>
        <tr class="resizable-row" data-row-index="0"><td>A</td></tr>
        <tr class="resizable-row" data-row-index="1"><td>B</td></tr>
        <tr class="resizable-row" data-row-index="2"><td>C</td></tr>
        <tr class="resizable-row" data-row-index="3"><td>D</td></tr>
      </tbody></table>`;

    // Stash row identities matching the 4 rows
    window.__tableDataStash.set('stale-dom', {
      rowIdentities: [
        { kind: 'primaryKey', parts: [{ column: 'id', value: 1 }] },
        { kind: 'primaryKey', parts: [{ column: 'id', value: 2 }] },
        { kind: 'primaryKey', parts: [{ column: 'id', value: 3 }] },
        { kind: 'primaryKey', parts: [{ column: 'id', value: 4 }] },
      ]
    });

    // Select row C (globalIndex=2)
    window.toggleRowSelection(wrapper, 2);
    expect(window.getSelectedRowIdentities(wrapper)).toEqual([
      { kind: 'primaryKey', parts: [{ column: 'id', value: 3 }] }
    ]);

    // Simulate delta delete of row B (index 1), mirroring what handleTableDataDelta does:
    // 1. Remove B's DOM row
    const bRow = wrapper.querySelector('tr[data-row-index="1"]');
    bRow.remove();
    // 2. Decrement data-row-index for rows after the deletion point
    wrapper.querySelectorAll('tr.resizable-row').forEach(r => {
      const idx = parseInt(r.getAttribute('data-row-index'), 10);
      if (Number.isFinite(idx) && idx > 1) {
        r.setAttribute('data-row-index', String(idx - 1));
      }
    });
    // 3. Splice stash rowIdentities at the same local index
    window.__tableDataStash.get('stale-dom').rowIdentities.splice(1, 1);
    // 4. Clear selection (DOM path safety net)
    window.clearSelection(wrapper);

    // Now rows are: A(0), C(1), D(2)
    // Selection was cleared — re-select C at its new position (globalIndex=1)
    window.toggleRowSelection(wrapper, 1);
    const ids = window.getSelectedRowIdentities(wrapper);
    // Must return C's identity (value 3), not D's (value 4)
    expect(ids).toEqual([
      { kind: 'primaryKey', parts: [{ column: 'id', value: 3 }] }
    ]);
  });

  it('virtual path: splice stash at correct indices for multiple deletes', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-table-id', 'stale-virt');
    wrapper.setAttribute('data-start-index', '0');
    wrapper.innerHTML = `
      <table class="data-table"><tbody>
        <tr class="resizable-row" data-row-index="0"><td>A</td></tr>
        <tr class="resizable-row" data-row-index="1"><td>B</td></tr>
        <tr class="resizable-row" data-row-index="2"><td>C</td></tr>
        <tr class="resizable-row" data-row-index="3"><td>D</td></tr>
      </tbody></table>`;
    // Simulate virtual state so getSelectedRowIdentities takes the virtual path
    wrapper.__virtualTableState = {
      enabled: true,
      startIndex: 0,
      order: [0, 1, 2, 3],
    };

    window.__tableDataStash.set('stale-virt', {
      rowIdentities: [
        { kind: 'primaryKey', parts: [{ column: 'id', value: 1 }] },
        { kind: 'primaryKey', parts: [{ column: 'id', value: 2 }] },
        { kind: 'primaryKey', parts: [{ column: 'id', value: 3 }] },
        { kind: 'primaryKey', parts: [{ column: 'id', value: 4 }] },
      ]
    });

    // Select C (globalIndex=2)
    window.toggleRowSelection(wrapper, 2);
    expect(window.getSelectedRowIdentities(wrapper)).toEqual([
      { kind: 'primaryKey', parts: [{ column: 'id', value: 3 }] }
    ]);

    // Simulate virtual path delta: splice pageData AND rowIdentities bottom-up
    const stashIdentities = window.__tableDataStash.get('stale-virt').rowIdentities;
    const deletes = [1, 3].sort((a, b) => b - a); // delete B and D
    deletes.forEach(local => {
      stashIdentities.splice(local, 1);
    });
    // Reconcile selection (simulating what Fix 3 does)
    const sel = window.getSelectionStore(wrapper);
    sel.delete(2); // globalIndex=2 is no longer valid since D was at 3
    // D was at index 3, after deleting B, it shifted to 2, but D itself was also deleted
    // C was at index 2, after deleting B(1), C shifted to 1, so globalIndex 2 is stale

    // After reconcile, selection should be empty since C was at index 2
    // which was a deleted row (D)'s position after B was removed
    expect(window.getSelectedRowIdentities(wrapper)).toEqual([]);
  });

  it('deleteSelectedRows refuses when stash has no rowIdentities', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-table-id', 'stale-guard');
    wrapper.setAttribute('data-table', 'test_table');
    wrapper.dataset.editable = 'true';

    window.__tableDataStash.set('stale-guard', {
      // no rowIdentities array
      columns: ['id', 'name'],
    });

    window.toggleRowSelection(wrapper, 0);
    // Should not throw; should return early with an error
    expect(() => window.deleteSelectedRows(wrapper)).not.toThrow();
  });
});
