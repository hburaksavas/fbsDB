// The whole path with nothing faked: interface, WebView2 bridge, native handlers and real Oracle. A second tab, with its own Oracle session,
// reads what was really stored. The connection runs through a local relay so that failures reach the real handlers the way a network failure does.
import assert from 'node:assert/strict';
import net from 'node:net';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {connectNativePage} from './nativeCdp.mjs';

const [endpoint,root,relayPort,oraclePort]=process.argv.slice(2);
const PROFILE='FBSDB_LOCAL',suffix=Math.random().toString(16).slice(2,12).toUpperCase(),TABLE=`FBSQA_E2E_${suffix}`,PARENT=`FBSQA_E2E_P${suffix}`,CHILD=`FBSQA_E2E_C${suffix}`;
const editor=`window.monaco?.editor.getEditors().find(e=>document.contains(e.getDomNode()))`;

// Loses the connection at a chosen moment. `before` drops the next request; `after` delivers it and drops the reply. `holdMs` delays requests so a test can arm a cut at an exact stage.
function createRelay(listenPort,targetPort){
  const connections=[];let cut=null,observer=new Set(),holdMs=0;
  const server=net.createServer(client=>{
    const upstream=net.connect(Number(targetPort),'127.0.0.1'),connection={client,upstream,dropReplies:false,queue:Promise.resolve()};
    connections.push(connection);
    const destroy=()=>{client.destroy();upstream.destroy()};
    client.on('data',data=>{connection.queue=connection.queue.then(async()=>{
      if(holdMs&&!observer.has(connection))await new Promise(resolve=>setTimeout(resolve,holdMs));
      if(client.destroyed)return;
      if(cut&&!observer.has(connection)){if(cut==='before'){cut=null;destroy();return}connection.dropReplies=true;cut=null}
      upstream.write(data);
    })});
    upstream.on('data',data=>{if(connection.dropReplies){destroy();return}client.write(data)});
    for(const socket of [client,upstream]){socket.on('error',destroy);socket.on('close',destroy)}
  });
  return {
    listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(listenPort),'127.0.0.1',resolve)}),
    get count(){return connections.length},
    since:start=>new Set(connections.slice(start)),
    // The observing tab's connection is never cut. A reconnect may be given a pooled connection, so the edited tab's own cannot be named in advance.
    observe(set){observer=set},
    arm(mode){cut=mode},
    hold(ms){holdMs=ms},
    reset(){cut=null;holdMs=0},
    close(){for(const item of connections){item.client.destroy();item.upstream.destroy()}server.close()},
  };
}

const relay=createRelay(relayPort,oraclePort),checks=[];
await relay.listen();
const cdp=await connectNativePage(endpoint);
let failure;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name)}
const set=(selector,value,prototype='HTMLInputElement')=>cdp.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${prototype}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
const activeTab=()=>cdp.evaluate(`document.querySelector('.file-tab.active').dataset.editorTab`);
const showTab=async tab=>{await cdp.click(`[data-editor-tab="${tab}"] [role="tab"]`);await cdp.until(`document.querySelector('.file-tab.active')?.dataset.editorTab===${JSON.stringify(tab)}&&${editor}`,'Tab shown')};
const idle=(label='Session idle',timeout=30000)=>cdp.until(`!document.querySelector('.connection-control')?.dataset.working`,label,timeout);
const control=()=>cdp.evaluate(`document.querySelector('.connection-control').getAttribute('aria-label')`);

// Connects through the real picker, using the credentials already saved for this profile.
async function connect(name=PROFILE){
  await cdp.click('.connection-control');
  await cdp.until(`document.querySelector('[aria-label="Change connection"]')`,'Connection picker');
  await set('[aria-label="Change connection"] .picker-search input',name);
  await cdp.frame();
  await cdp.evaluate(`document.querySelector('[aria-label="Change connection"] .picker-search input').focus()`);
  await cdp.key('Enter');
  await cdp.until(`document.querySelector('.connection-control').getAttribute('aria-label')==='Change connection: ${name}'&&!document.querySelector('.connection-control').dataset.working`,'Connected',40000);
}
async function submit(sql){
  await cdp.evaluate(`(()=>{const e=${editor};e.setValue(${JSON.stringify(sql)});e.setPosition({lineNumber:1,column:1})})()`);
  await new Promise(resolve=>setTimeout(resolve,300));
  await cdp.evaluate(`${editor}.focus()`);
  await cdp.key('Enter',2);
}
// Runs a statement from the editor; a DDL statement goes through its real confirmation.
async function run(sql,{ddl=false}={}){
  await submit(sql);
  if(ddl){await cdp.until(`[...document.querySelectorAll('button.danger')].some(b=>b.textContent==='Run DDL')`,'DDL confirmation');await cdp.textClick('button.danger','Run DDL')}
  await new Promise(resolve=>setTimeout(resolve,200));
  await idle(`Statement finished: ${sql}`);
}
const failureText=()=>cdp.evaluate(`document.querySelector('.result-notice')?.textContent||''`);
// The rows the grid shows for the query, as Oracle returned them.
async function read(sql){
  await run(sql);
  const notice=await failureText();
  assert.ok(!/ORA-\d+/.test(notice),`The read failed: ${notice}`);
  return cdp.evaluate(`(()=>{const rows=new Map();for(const cell of document.querySelectorAll('[data-cell]')){const [r,c]=cell.dataset.cell.split(':').map(Number);if(!rows.has(r))rows.set(r,[]);rows.get(r)[c]=cell.textContent.trim()}return [...rows.values()]})()`);
}
const nameIn=async(tab,id)=>{await showTab(tab);const rows=await read(`SELECT NAME FROM ${TABLE} WHERE ID=${id}`);return rows[0]?.[0]};
async function beginEditing(sql){
  await read(sql);
  await cdp.until(`document.querySelector('.results-toolbar [aria-label="Edit rows of this result"]')`,'Edit switch');
  if(await cdp.evaluate(`document.querySelector('.results-toolbar [aria-label="Edit rows of this result"]').getAttribute('aria-pressed')==='false'`))await cdp.click('.results-toolbar [aria-label="Edit rows of this result"]');
  await cdp.until(`[...document.querySelectorAll('.grid-edit-bar button')].some(b=>b.textContent==='New row'&&!b.disabled)`,'Editing available from the real primary key',20000);
}
// Editing queries select ID, NAME, TS in this order.
const NAME=1,TS=2;
async function stage(row,col,text){
  await cdp.evaluate(`(()=>{document.querySelector('[data-cell="${row}:${col}"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));window.dispatchEvent(new PointerEvent('pointerup'));document.querySelector('.grid-wrap').focus()})()`);
  await cdp.frame();
  await cdp.evaluate(`document.querySelector('.grid-wrap').dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true,cancelable:true}))`);
  await cdp.until(`document.querySelector('.cell-editor')`,'Cell editor');
  await set('.cell-editor',text);
  await cdp.evaluate(`document.querySelector('.cell-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
  await cdp.frame();
}
const openPending=()=>cdp.evaluate(`void(document.querySelector('.pending-drawer')||[...document.querySelectorAll('.grid-edit-bar button')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Pending changes')).click())`);
async function apply(){
  await openPending();
  await cdp.until(`[...document.querySelectorAll('.pending-drawer button')].some(b=>b.textContent.startsWith('Apply to Oracle')&&!b.disabled)`,'Apply offered');
  await cdp.evaluate(`[...document.querySelectorAll('.pending-drawer button')].find(b=>b.textContent.startsWith('Apply to Oracle')).click()`);
  await cdp.until(`[...document.querySelectorAll('.pending-drawer .pending-confirm button.button-primary')].some(b=>b.textContent.startsWith('Apply '))`,'Apply confirmation');
  await cdp.evaluate(`[...document.querySelectorAll('.pending-drawer .pending-confirm button.button-primary')].find(b=>b.textContent.startsWith('Apply ')).click()`);
  await cdp.until(`document.querySelector('.grid-edit-tx')?.textContent.includes('applied, not committed')`,'Applied in the open transaction',20000);
}
const toolbar=label=>cdp.click(`.transaction-button[aria-label="${label}"]`);
// Applies an edit that is ready to be committed, for the failure scenarios.
async function appliedEdit(id,row,text){
  await beginEditing(`SELECT ID, NAME, TS FROM ${TABLE} ORDER BY ID`);
  await stage(row,NAME,text);
  await apply();
}

let tabA,tabB;
try{
  await cdp.until(`location.hostname==='fbsdb.local'&&document.readyState!=='loading'`,'Initial native navigation',45000);
  await cdp.evaluate(`localStorage.setItem('fbsdb.onboardingSeen','true')`);
  await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:`window.__stages=[];chrome.webview.addEventListener('message',event=>{const m=event.data;if(m?.type==='sql.stage')window.__stages.push(m.stage)});`});
  await cdp.call('Page.reload');
  await cdp.until(editor,'Monaco startup',60000);
  await cdp.until(`document.querySelector('.connection-control')`,'Connection control');

  await check('connect: two tabs reach Oracle through the picker, each with its own session, using saved credentials',async()=>{
    tabA=await activeTab();
    await connect();
    assert.ok(relay.count>0,'The connection did not go through the relay.');
    // A run that was killed cannot clean up after itself; only this test's own prefix is touched.
    for(const [leftover] of await read(`SELECT table_name FROM user_tables WHERE table_name LIKE 'FBSQA\\_E2E\\_%' ESCAPE '\\'`))await run(`DROP TABLE ${leftover} CASCADE CONSTRAINTS`,{ddl:true});
    assert.deepEqual(await read(`SELECT table_name FROM user_tables WHERE table_name LIKE 'FBSQA\\_E2E\\_%' ESCAPE '\\'`),[],'Tables from an earlier run were left behind.');
    await cdp.click('[aria-label="New SQL file"]');
    await cdp.until(`document.querySelector('.file-tab.active')?.dataset.editorTab!==${JSON.stringify(tabA)}`,'Second tab');
    tabB=await activeTab();
    const beforeB=relay.count;
    await connect();
    relay.observe(relay.since(beforeB));
    const sidB=await read(`SELECT SYS_CONTEXT('USERENV','SID') FROM dual`);
    await showTab(tabA);
    const sidA=await read(`SELECT SYS_CONTEXT('USERENV','SID') FROM dual`);
    assert.notDeepEqual(sidA,sidB,'Both tabs share one Oracle session.');
  });

  await check('DDL: the confirmation runs the statement and a real table appears',async()=>{
    await run(`CREATE TABLE ${TABLE} (ID NUMBER(10) PRIMARY KEY, NAME VARCHAR2(40), TS TIMESTAMP(9) WITH TIME ZONE, NOTE VARCHAR2(20) DEFAULT 'filled by default')`,{ddl:true});
    assert.ok(!/ORA-\d+/.test(await failureText()),await failureText());
    for(const id of [1,2,3,4,5])await run(`INSERT INTO ${TABLE} (ID,NAME) VALUES (${id},'n${id}')`);
    assert.equal(await cdp.evaluate(`document.querySelector('.connection-control').dataset.pending`),'true','The inserts opened a transaction.');
    await toolbar('Commit');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Committed');
  });

  await check('window move: a connected tab takes its uncommitted change and open cursor to a new window, which fetches, rolls back and hands it back',async()=>{
    await showTab(tabA);
    await run(`INSERT INTO ${TABLE} (ID,NAME) VALUES (90,'moved')`);
    await cdp.until(`document.querySelector('.connection-control').dataset.pending==='true'`,'The insert opened a transaction');
    await read(`SELECT LEVEL AS N FROM dual CONNECT BY LEVEL <= 3000`);
    await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`,'Search');
    await set('[aria-label="Search workbench"]','Window: Move to New Window');await cdp.frame();await cdp.key('Enter');
    await cdp.until(`!document.querySelector('[data-editor-tab=${JSON.stringify(tabA)}]')`,'Tab A left the main window');
    const second=await connectNativePage(endpoint,30000,url=>url.includes('window=w'));
    try{
      await second.until(`document.querySelector('.file-tab.active')?.dataset.editorTab===${JSON.stringify(tabA)}&&document.querySelectorAll('[data-cell]').length>0`,'The rows arrived in the new window',30000);
      assert.equal(await second.evaluate(`document.querySelector('.connection-control').getAttribute('aria-label')`),`Change connection: ${PROFILE}`);
      assert.equal(await second.evaluate(`document.querySelector('.connection-control').dataset.pending`),'true','The open transaction came along.');
      // The popover may close after a click; reopen it to read how many rows are loaded.
      const loaded=`(()=>{if(!document.querySelector('[role="region"][aria-label="Load result rows"]'))document.querySelector('.results-toolbar [aria-label="Load result rows"]')?.click();const text=document.querySelector('[role="region"][aria-label="Load result rows"] header span')?.textContent||'';return {rows:Number(text.split(' ')[0].replace(/\D/g,'')),more:/more available/.test(text)}})()`;
      await second.until(`${loaded}.more`,'More rows are available');
      const before=(await second.evaluate(loaded)).rows;
      await second.textClick('[aria-label="Load result rows"] button','Load next page');
      await second.until(`${loaded}.rows>${before}`,'The next page came from the moved cursor',30000);
      assert.equal(await nameIn(tabB,90),undefined,'Another session saw the uncommitted row.');
      await second.click('.transaction-button[aria-label="Rollback"]');
      await second.until(`!document.querySelector('.connection-control').dataset.pending`,'Rolled back in the new window',20000);
    }finally{
      // Also after a failure, so clean-up finds tab A in the main window.
      await second.key('p',10).then(()=>second.until(`document.querySelector('[aria-label="Search workbench"]')`,'Search')).then(()=>second.evaluate(`(()=>{const input=document.querySelector('[aria-label="Search workbench"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Window: Move to Main Window');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)).then(()=>second.frame()).then(()=>second.key('Enter')).catch(error=>{if(!/disconnected/.test(error.message))console.error('Moving tab A back failed: '+error.message)});
      second.close();
    }
    await cdp.until(`document.querySelector('.file-tab.active')?.dataset.editorTab===${JSON.stringify(tabA)}`,'Tab A came back',30000);
    assert.equal(await control(),`Change connection: ${PROFILE}`);
    assert.deepEqual((await read(`SELECT COUNT(*) FROM ${TABLE} WHERE ID=90`))[0],['0'],'The returned session lost the rollback.');
  });

  await check('privileges: a table this user was never granted explains why it cannot be edited',async()=>{
    await read(`SELECT DUMMY FROM SYS.DUAL`);
    await cdp.until(`document.querySelector('.results-toolbar [aria-label="Edit rows of this result"]')`,'Edit switch');
    if(await cdp.evaluate(`document.querySelector('.results-toolbar [aria-label="Edit rows of this result"]').getAttribute('aria-pressed')==='false'`))await cdp.click('.results-toolbar [aria-label="Edit rows of this result"]');
    await cdp.until(`document.querySelector('.grid-edit-reasons')?.textContent.includes('You have no UPDATE, INSERT or DELETE privilege on SYS.DUAL')`,'The missing privilege is named',20000);
    await cdp.click('.results-toolbar [aria-label="Edit rows of this result"]');
  });

  await check('grid: an edit stays private after Apply, becomes visible after Commit and shows what Oracle stored',async()=>{
    await appliedEdit(1,0,'Çağrı İĞÜŞÖ');
    assert.equal(await nameIn(tabB,1),'n1','Another session saw uncommitted work.');
    await showTab(tabA);
    await toolbar('Commit');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Committed');
    assert.equal(await nameIn(tabB,1),'Çağrı İĞÜŞÖ','The edit was not stored exactly.');
  });

  await check('read back: a new row shows what Oracle filled in, and the change stays uncommitted',async()=>{
    await showTab(tabA);
    await beginEditing(`SELECT ID, NAME, NOTE FROM ${TABLE} ORDER BY ID`);
    await cdp.textClick('.grid-edit-bar button','New row');
    await cdp.until(`document.querySelector('.new-row input[aria-label$=" ID"]')`,'New row form');
    await set('.new-row input[aria-label$=" ID"]','90');
    await set('.new-row input[aria-label$=" NAME"]','added');
    await cdp.frame();
    await apply();
    await cdp.until(`document.querySelector('[aria-label="Apply results"]')`,'Apply results');
    assert.match(await cdp.evaluate(`document.querySelector('[aria-label="Apply results"]').textContent`),/Oracle set NOTE = filled by default\./);
    assert.equal(await cdp.evaluate(`document.querySelector('.connection-control').dataset.pending`),'true','The change is still open.');
    await toolbar('Rollback');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Rolled back');
    assert.deepEqual(await (async()=>{await showTab(tabB);return read(`SELECT ID FROM ${TABLE} WHERE ID=90`)})(),[],'A rolled back row was stored.');
  });

  await check('related record: a foreign key value is searched in its parent table, chosen and saved',async()=>{
    await showTab(tabA);
    await run(`CREATE TABLE ${PARENT} (ID NUMBER(10) PRIMARY KEY, LABEL VARCHAR2(40))`,{ddl:true});
    await run(`CREATE TABLE ${CHILD} (ID NUMBER(10) PRIMARY KEY, PARENT_ID NUMBER(10) REFERENCES ${PARENT}(ID))`,{ddl:true});
    for(const [id,label] of [[1,'alpha'],[2,'beta'],[3,'Betamax']])await run(`INSERT INTO ${PARENT} VALUES (${id},'${label}')`);
    await run(`INSERT INTO ${CHILD} VALUES (1,1)`);
    await toolbar('Commit');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Committed');
    await beginEditing(`SELECT ID, PARENT_ID FROM ${CHILD} ORDER BY ID`);
    const pick=(row,col)=>cdp.evaluate(`(()=>{document.querySelector('[data-cell="${row}:${col}"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));window.dispatchEvent(new PointerEvent('pointerup'));document.querySelector('.grid-wrap').focus()})()`);
    const f4=()=>cdp.evaluate(`document.querySelector('.grid-wrap').dispatchEvent(new KeyboardEvent('keydown',{key:'F4',bubbles:true,cancelable:true}))`);
    await pick(0,0);await cdp.frame();await f4();
    await cdp.until(`document.body.textContent.includes('has no foreign key that can be edited here')&&!document.querySelector('[aria-label="Related record"]')`,'A column without a key is refused');
    await pick(0,1);await cdp.frame();await f4();
    await cdp.until(`document.querySelectorAll('[aria-label="Related record"] tbody tr').length===3`,'Parent rows are listed',20000);
    await set('[aria-label="Search related records"]','BETA');
    await cdp.textClick('[aria-label="Related record"] button','Search');
    await cdp.until(`document.querySelectorAll('[aria-label="Related record"] tbody tr').length===2`,'The search narrows the rows, ignoring case',20000);
    await set('[aria-label="Search related records"]','%');
    await cdp.textClick('[aria-label="Related record"] button','Search');
    await cdp.until(`document.querySelector('[aria-label="Related record"]').textContent.includes('No rows found')`,'A wildcard is searched as text',20000);
    await set('[aria-label="Search related records"]','max');
    await cdp.textClick('[aria-label="Related record"] button','Search');
    await cdp.until(`document.querySelectorAll('[aria-label="Related record"] tbody tr').length===1`,'One row found',20000);
    await cdp.click('[aria-label="Use row 1"]');
    await cdp.until(`!document.querySelector('[aria-label="Related record"]')&&document.querySelector('.grid-edit-pending')?.textContent.includes('Pending: 1')`,'The value is a draft');
    await apply();
    await toolbar('Commit');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Committed');
    await showTab(tabB);
    assert.deepEqual((await read(`SELECT PARENT_ID FROM ${CHILD} WHERE ID=1`))[0],['3'],'The chosen key was not stored.');
  });

  await check('grid: Rollback discards an applied edit',async()=>{
    await showTab(tabA);
    await appliedEdit(2,1,'never saved');
    await toolbar('Rollback');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Rolled back');
    assert.equal(await nameIn(tabB,2),'n2','A rolled back edit was stored.');
  });

  await check('time zone: Apply is blocked without an offset and a typed offset is stored exactly',async()=>{
    await showTab(tabA);
    await beginEditing(`SELECT ID, NAME, TS FROM ${TABLE} ORDER BY ID`);
        await stage(2,TS,'2026-03-04 05:06:07');
    await openPending();
    await cdp.until(`document.querySelector('.pending-drawer')?.textContent.includes('needs a date with its offset')`,'The missing offset is explained');
    assert.ok(await cdp.evaluate(`[...document.querySelectorAll('.pending-drawer button')].find(b=>b.textContent.startsWith('Apply to Oracle')).disabled`),'Apply was not blocked.');
    await stage(2,TS,'2026-03-04 05:06:07+03:00');
    await apply();
    await toolbar('Commit');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Committed');
    await showTab(tabB);
    const rows=await read(`SELECT TO_CHAR(TS,'YYYY-MM-DD HH24:MI:SS TZH:TZM') FROM ${TABLE} WHERE ID=3`);
    assert.ok(rows[0].includes('2026-03-04 05:06:07 +03:00'),`Stored ${JSON.stringify(rows[0])}.`);
  });

  for(const [mode,id,row,saved] of [['before',4,3,false],['after',5,4,true]])await check(`commit lost ${mode} Oracle: the real handler reports an unknown outcome and the tab reconnects (${saved?'saved':'not saved'})`,async()=>{
    await showTab(tabA);
    await appliedEdit(id,row,'lost commit');
    relay.arm(mode);
    await toolbar('Commit');
    await cdp.until(`document.querySelector('[aria-label="Commit not confirmed"]')`,'Unknown outcome reported',40000);
    relay.reset();
    const text=await cdp.evaluate(`document.querySelector('[aria-label="Commit not confirmed"]').textContent`);
    assert.match(text,/may or may not have saved/);assert.doesNotMatch(text,/was committed successfully/);
    assert.match(await control(),/Connect to Oracle/,'The tab still claims to be connected.');
    assert.ok(!await cdp.evaluate(`document.querySelector('.connection-control').dataset.pending`),'The lost transaction still shows as pending.');
    assert.equal(await cdp.evaluate(`document.querySelector('.grid-edit-tx')?.textContent.includes('not confirmed')`),true,'The grid does not say the outcome is unconfirmed.');
    await cdp.textClick('[aria-label="Commit not confirmed"] button','Close');
    assert.equal(await nameIn(tabB,id),saved?'lost commit':`n${id}`,'Oracle holds a different result than this failure produces.');
    await showTab(tabA);
    await connect();
    await cdp.textClick('.grid-edit-tx button','Check what Oracle stored');
    await cdp.until(`document.querySelector('.grid-edit-verification li')`,'Stored values were read',20000);
    assert.match(await cdp.evaluate(`document.querySelector('.grid-edit-verification').textContent`),saved?/saved, it holds the new values/:/not saved, it still holds the old values/);
    if(saved)assert.equal(await cdp.evaluate(`[...document.querySelectorAll('.grid-edit-verification button')].length`),0,'Nothing saved is offered for a retry.');
    else{
      await cdp.evaluate(`document.querySelector('.grid-edit-verification button').click()`);
      await cdp.until(`document.querySelector('.grid-edit-pending')?.textContent.includes('Pending: 1')`,'The edit is a draft again');
      await apply();
      await toolbar('Commit');
      await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Committed');
      assert.equal(await nameIn(tabB,id),'lost commit','The retried edit was not stored.');
      await showTab(tabA);
    }
    assert.equal(await read(`SELECT 46 FROM dual`).then(rows=>rows[0].includes('46')),true,'The reconnected tab cannot run queries.');
  });

  await check('rollback lost: the failure is reported, nothing is saved and the tab reconnects',async()=>{
    await showTab(tabA);
    await appliedEdit(2,1,'lost rollback');
    relay.arm('before');
    await toolbar('Rollback');
    await cdp.until(`/Connect to Oracle/.test(document.querySelector('.connection-control').getAttribute('aria-label'))`,'Disconnected state',40000);
    relay.reset();
    assert.ok(!await cdp.evaluate(`document.querySelector('.connection-control').dataset.pending`),'The lost transaction still shows as pending.');
    assert.equal(await nameIn(tabB,2),'n2','A row whose Rollback failed was stored.');
    await showTab(tabA);
    await connect();
  });

  await check('auto commit lost: the real handler says the outcome is unconfirmed',async()=>{
    await showTab(tabA);
    await toolbar('Auto commit');
    await cdp.until(`document.querySelector('.transaction-button.auto-commit.enabled')`,'Auto commit on');
    await cdp.evaluate(`window.__stages.length=0`);
    relay.hold(1500);
    await submit(`UPDATE ${TABLE} SET NAME='auto' WHERE ID=2`);
    await cdp.until(`window.__stages.includes('Committing statement')`,'Automatic Commit stage',20000);
    relay.arm('after');
    await cdp.until(`/Connect to Oracle/.test(document.querySelector('.connection-control').getAttribute('aria-label'))`,'Disconnected state',40000);
    relay.reset();
    await cdp.until(`document.querySelector('.result-notice')`,'Failure shown');
    const notice=await failureText();
    assert.match(notice,/Transaction outcome is unconfirmed/,notice);
    assert.match(notice,/may or may not have saved/,notice);
    assert.equal(await nameIn(tabB,2),'auto','The statement was expected to be saved, because the reply was what was lost.');
    await showTab(tabA);
    await connect();
  });

  await check('privileges: a table with column grants locks the other columns and applies the granted one',async()=>{
    await showTab(tabA);
    const present=await read(`SELECT COUNT(*) FROM all_tables WHERE owner='FBSQA_GRANTS' AND table_name='COLUMN_GRANTED'`);
    if(present[0][0]!=='1'){console.log('SKIP column grants: run scripts/setup-fbsqa-fixtures.ps1 first');return}
    await beginEditing(`SELECT ID, OPEN_COL, CLOSED_COL FROM FBSQA_GRANTS.COLUMN_GRANTED ORDER BY ID`);
    await cdp.until(`document.querySelector('[aria-label="What your privileges do not allow"]')`,'Limits are named');
    assert.match(await cdp.evaluate(`document.querySelector('[aria-label="What your privileges do not allow"]').textContent`),/You cannot delete rows: you have no DELETE privilege on FBSQA_GRANTS\.COLUMN_GRANTED/);
    const locks=await cdp.evaluate(`[...document.querySelectorAll('[data-edit-lock="locked"]')].map(h=>h.textContent+' '+(h.dataset.appTooltip||h.title)).join(' | ')`);
    assert.match(locks,/CLOSED_COL.*You have no UPDATE privilege on this column/,locks);
    assert.doesNotMatch(locks,/OPEN_COL/,'The granted column stays editable.');
    await stage(0,1,'through a column grant');
    await apply();
    await toolbar('Rollback');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Rolled back');
    await showTab(tabB);
    assert.deepEqual((await read(`SELECT OPEN_COL FROM FBSQA_GRANTS.COLUMN_GRANTED WHERE ID=1`))[0],['open'],'A rolled back edit was stored.');
  });

  await check('large value: a CLOB arrives as a preview, loads in parts on request and then replaces the preview in the grid',async()=>{
    await showTab(tabA);
    const rows=await read(`SELECT RPAD(TO_CLOB('start-'), 600000, 'x') || TO_CLOB('-end') AS DOC FROM dual`);
    assert.match(rows[0][0],/^start-x+… \(CLOB, 600,004 characters\)$/,rows[0][0]);
    await cdp.evaluate(`(()=>{document.querySelector('[data-cell="0:0"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));window.dispatchEvent(new PointerEvent('pointerup'));document.querySelector('.grid-wrap').focus();document.querySelector('.grid-wrap').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))})()`);
    const status=`document.querySelector('[aria-label="Cell value"] .lob-value-status [role="status"]')?.textContent`;
    await cdp.until(`${status}==='Showing the first 2,000 of 600,004 characters (0%)'`,'Preview viewer');
    await cdp.textClick('[aria-label="Cell value"] .lob-value-status button','Load next 524,288 characters');
    await cdp.until(`${status}==='Showing the first 526,288 of 600,004 characters (87%)'`,'One more part loaded',20000);
    await cdp.textClick('[aria-label="Cell value"] .lob-value-status button','Load all');
    // Loaded whole, the cell holds the value itself and the ordinary viewer takes over.
    await cdp.until(`!document.querySelector('.lob-value')&&document.querySelector('[aria-label="Cell value"] .result-value-content pre')?.textContent.length===600004`,'Whole value shown',20000);
    assert.ok(await cdp.evaluate(`document.querySelector('[aria-label="Cell value"] .result-value-content pre').textContent.endsWith('x-end')`),'The loaded value is not the stored one.');
    const cell=await cdp.evaluate(`document.querySelector('[data-cell="0:0"]').textContent`);
    assert.ok(cell.startsWith('start-x')&&!cell.includes('600,004 characters)'),cell.slice(0,120));
    await cdp.click('[aria-label="Close cell value"]');
  });

  await check('rename: a connection label changes in place, connected tabs follow and saved credentials still connect',async()=>{
    const RENAMED=`${PROFILE} renamed`,entry='.connection-tree-entry',field=`[aria-label="Rename ${PROFILE}"]`;
    await showTab(tabA);
    const f2=()=>cdp.evaluate(`(()=>{const row=document.querySelector('${entry}');row.focus();row.dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true,cancelable:true}))})()`);
    const press=key=>cdp.evaluate(`document.querySelector('.connection-rename input').dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true,cancelable:true}))`);
    await cdp.until(`document.querySelector('${entry}')`,'Connection list');
    await f2();
    await cdp.until(`document.querySelector('${field.replaceAll("'","\\'")}')`,'Rename field');
    await set('.connection-rename input','other');await press('Escape');
    await cdp.until(`!document.querySelector('.connection-rename')&&document.querySelector('${entry}').textContent.includes('${PROFILE}')`,'Escape cancels');
    await f2();
    await cdp.until(`document.querySelector('.connection-rename input')`,'Rename field');
    await set('.connection-rename input','   ');await press('Enter');
    await cdp.until(`document.querySelector('.connection-rename [role="alert"]')?.textContent.includes('Enter a connection name')`,'A failure stays in place');
    await set('.connection-rename input',RENAMED);await press('Enter');
    await cdp.until(`!document.querySelector('.connection-rename')&&document.querySelector('${entry}').textContent.includes('${RENAMED}')`,'The list shows the new label',15000);
    assert.equal(await control(),`Change connection: ${RENAMED}`,'The active tab follows.');
    assert.deepEqual((await read('SELECT 47 FROM dual'))[0],['47'],'The session was disturbed.');
    await showTab(tabB);
    await cdp.until(`document.querySelector('.connection-control').getAttribute('aria-label')==='Change connection: ${RENAMED}'`,'Another connected tab follows');
    assert.deepEqual((await read('SELECT 48 FROM dual'))[0],['48'],'The other session was disturbed.');
    await cdp.click('[aria-label="New SQL file"]');
    await new Promise(resolve=>setTimeout(resolve,300));
    await connect(RENAMED);
    assert.deepEqual((await read('SELECT 49 FROM dual'))[0],['49'],'Saved credentials no longer connect after the rename.');
    await showTab(tabB);
  });
}catch(error){
  failure=error;
  // Taken before cleanup, while the screen still shows the failure.
  try{
    const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(root,'oracle-flow-failure.png'),Buffer.from(shot.data,'base64'));
    failure.message+=`\nScreen: ${await cdp.evaluate(`[...document.querySelectorAll('.pending-drawer,.grid-edit-bar,.result-notice,[role="alertdialog"],[role="dialog"]')].map(e=>e.textContent).join(' | ').slice(0,1500)`)}`;
  }catch{}
}
finally{
  try{
    relay.reset();
    // A failed step can leave tab A's transaction open, and its locks would refuse the DROP. Discarding it through the app also ends the row locks.
    if(tabA&&tabB){await showTab(tabA);await run('ROLLBACK')}
    if(tabB){await showTab(tabB);for(const table of [CHILD,PARENT])await run(`DROP TABLE ${table} CASCADE CONSTRAINTS`,{ddl:true}).catch(()=>{});await run(`DROP TABLE ${TABLE}`,{ddl:true});assert.ok(!/ORA-\d+/.test(await failureText()),await failureText());console.log('PASS fixture table removed')}
  }catch(error){failure??=error;console.error(`Could not remove ${TABLE}: ${error.message}`)}
  await writeFile(path.join(root,'oracle-flow-report.json'),JSON.stringify({status:failure?'failed':'passed',checks,error:failure?.message,table:TABLE},null,2));
  if(failure)console.error(failure.message);
  cdp.close();relay.close();
}
process.exit(failure?1:0);
