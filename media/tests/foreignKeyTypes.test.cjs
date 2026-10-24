const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const initSqlJs = require('sql.js');
const source = ['utils.js', 'table.js', 'context-menu.js', 'events.js']
  .map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n');
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(t, rows, options = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="data-content"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const win = dom.window, messages = [], errors = [];
  win.TextEncoder = TextEncoder;
  win.vscode = { postMessage: m => messages.push(plain(m)) };
  const state={ selectedTable: 'child' };
  win.getCurrentState = () => state;
  win.updateState = update => Object.assign(state,update);
  win.getAllDOMElements = () => ({dataContent:win.document.querySelector('#data-content')});
  win.tables=[];
  win.showError = m => errors.push(m);win.showSuccess = () => {};
  win.eval(source + '\nwindow.fkTest = {setCell: cell => { currentCell = cell; },navigateToForeignKeyReference,getForeignKeyInfoForCell,getTableSnapshot,sortTableByColumn,virtualRender,displayQueryResults};');
  win.document.querySelector('#data-content').innerHTML = win.createDataTable(rows, ['id', 'parent_id'], 'child', {
    pageSize: rows.length, totalRows: rows.length, backendPaginated: true,
    rowIdentities: rows.map(row => ({kind:'primaryKey',parts:[{column:'id',value:row[0]}]})),allowEditing:true,
    foreignKeys:[{column:'parent_id',referencedTable:'parent',referencedColumn:'id'}],...options,
  });
  const wrapper=win.document.querySelector('.enhanced-table-wrapper');win.initializeTableEvents(wrapper);
  if(wrapper.__virtualTableState)win.fkTest.virtualRender(wrapper.__virtualTableState,{force:true});
  return {win,wrapper,messages,errors};
}

for(const virtualize of [false,true]) {
  test(`foreign-key navigation distinguishes exact large INTEGER and same-looking TEXT (virtual=${virtualize})`, async t=>{
    const SQL=await initSqlJs();const db=new SQL.Database();t.after(()=>db.close());
    db.exec(`CREATE TABLE parent(id PRIMARY KEY NOT NULL, label TEXT) WITHOUT ROWID;
      INSERT INTO parent VALUES (9007199254740993,'integer'),('9007199254740993','text'),
      (-9223372036854775808,'min'),(9223372036854775807,'max');`);
    const values=['9007199254740993','9007199254740993','-9223372036854775808','9223372036854775807'];
    const {win,wrapper,messages}=fixture(t,values.map((v,i)=>[i,v]),{virtualize,largeIntegerColumns:{0:[1],2:[1],3:[1]}});
    win.fkTest.sortTableByColumn(wrapper.querySelector('table'),0);
    win.fkTest.sortTableByColumn(wrapper.querySelector('table'),0);
    assert.equal(wrapper.querySelector('tr.resizable-row').dataset.localIndex,'3','sort changes display order without moving type metadata to another source row');
    for(const [index,expected] of ['integer','text','min','max'].entries()) {
      const cell=wrapper.querySelector(`tr[data-local-index="${index}"] td[data-column="1"]`);
      win.fkTest.setCell(cell);win.fkTest.navigateToForeignKeyReference();
      const query=messages.at(-1).query;
      assert.equal(db.exec(query)[0].values[0][1],expected,query);
      assert.equal(query.includes("= '9007199254740993'"),index===1,'only genuine TEXT is quoted');
    }
  });
}

test('local pagination remaps sparse integer metadata to the rendered row', async t=>{
  const {win,wrapper,messages}=fixture(t,[[1,'text'],[2,'9007199254740993']],{
    backendPaginated:false,page:2,pageSize:1,largeIntegerColumns:{1:[1]},
  });
  win.fkTest.setCell(wrapper.querySelector('td[data-column="1"]'));win.fkTest.navigateToForeignKeyReference();
  assert.match(messages[0].query,/= 9007199254740993 LIMIT/);
});

test('invalid integer metadata fails closed instead of forming SQL', t=>{
  for(const value of ['+1','01','9223372036854775808',"1; DROP TABLE parent; --"]) {
    const {win,wrapper,messages,errors}=fixture(t,[[1,value]],{largeIntegerColumns:{0:[1]}});
    win.fkTest.setCell(wrapper.querySelector('td[data-column="1"]'));win.fkTest.navigateToForeignKeyReference();
    assert.equal(messages.length,0,value);assert.equal(errors.length,1,value);
  }
});

for(const virtualize of [false,true]) {
  test(`edit acknowledgement replaces prior FK storage class before refresh (virtual=${virtualize})`, t=>{
    const {win,wrapper,messages}=fixture(t,[[0,'other'],[1,'9007199254740993']],{
      backendPaginated:false,page:2,pageSize:1,largeIntegerColumns:{1:[1]},virtualize,
    });
    for(const [value,isInteger] of [['9007199254740994',false],['9007199254740995',true]]) {
      const cell=wrapper.querySelector('td[data-column="1"]');
      win.startCellEditing(cell);cell.querySelector('.cell-input').value=value;win.saveCellEdit(cell);
      const request=messages.at(-1);assert.equal(request.type,'updateCellData');
      win.handleCellUpdateSuccess({...request,newValueIsLargeInteger:isInteger});
      const snapshot=win.fkTest.getTableSnapshot(wrapper);
      assert.deepEqual(plain(snapshot.largeIntegerColumns),isInteger?{0:[1]}:{});
      assert.deepEqual(plain(snapshot.options.largeIntegerColumns),isInteger?{1:[1]}:{});
      win.fkTest.setCell(wrapper.querySelector('td[data-column="1"]'));win.fkTest.navigateToForeignKeyReference();
      assert.ok(messages.at(-1).query.includes(`= ${isInteger?value:`'${value}'`} LIMIT`));
    }
  });
}

test('query-result cache restores type metadata on a later local page', t=>{
  const {win,messages}=fixture(t,[[0,'initial']]);
  win.fkTest.displayQueryResults([[0,'text'],[1,'9007199254740993']],['id','parent_id'],'SELECT parent_id FROM child',{
    largeIntegerColumns:{1:[1]},
  });
  const [tabKey,cached]=[...win._resultCache.entries()][0];
  assert.deepEqual(plain(cached.largeIntegerColumns),{1:[1]});
  win.document.querySelector('#data-content').innerHTML=win.createDataTable(cached.data,cached.columns,tabKey,{
    isQueryResult:true,currentPage:2,pageSize:1,allowEditing:false,
    foreignKeys:[{column:'parent_id',referencedTable:'parent',referencedColumn:'id'}],
  });
  const wrapper=win.document.querySelector('.enhanced-table-wrapper');
  win.fkTest.setCell(wrapper.querySelector('td[data-column="1"]'));win.fkTest.navigateToForeignKeyReference();
  assert.match(messages.at(-1).query,/= 9007199254740993 LIMIT/);
});
