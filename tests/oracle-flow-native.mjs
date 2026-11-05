// The whole path with nothing faked: interface, WebView2 bridge, native handlers and real Oracle. A second tab, with its own Oracle session,
// reads what was really stored. The connection runs through a local relay so that failures reach the real handlers the way a network failure does.
import assert from 'node:assert/strict';
import net from 'node:net';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {connectNativePage} from './nativeCdp.mjs';

const [endpoint,root,relayPort,oraclePort]=process.argv.slice(2);
const PROFILE='FBSDB_LOCAL',suffix=Math.random().toString(16).slice(2,12).toUpperCase(),TABLE=`FBSQA_E2E_${suffix}`;
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
async function connect(){
  await cdp.click('.connection-control');
  await cdp.until(`document.querySelector('[aria-label="Change connection"]')`,'Connection picker');
  await set('[aria-label="Change connection"] .picker-search input',PROFILE);
  await cdp.frame();
  await cdp.evaluate(`document.querySelector('[aria-label="Change connection"] .picker-search input').focus()`);
  await cdp.key('Enter');
  await cdp.until(`document.querySelector('.connection-control').getAttribute('aria-label')==='Change connection: ${PROFILE}'&&!document.querySelector('.connection-control').dataset.working`,'Connected',40000);
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
    for(const [leftover] of await read(`SELECT table_name FROM user_tables WHERE table_name LIKE 'FBSQA\\_E2E\\_%' ESCAPE '\\'`))await run(`DROP TABLE ${leftover}`,{ddl:true});
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
    await run(`CREATE TABLE ${TABLE} (ID NUMBER(10) PRIMARY KEY, NAME VARCHAR2(40), TS TIMESTAMP(9) WITH TIME ZONE)`,{ddl:true});
    assert.ok(!/ORA-\d+/.test(await failureText()),await failureText());
    for(const id of [1,2,3,4,5])await run(`INSERT INTO ${TABLE} (ID,NAME) VALUES (${id},'n${id}')`);
    assert.equal(await cdp.evaluate(`document.querySelector('.connection-control').dataset.pending`),'true','The inserts opened a transaction.');
    await toolbar('Commit');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Committed');
  });

  await check('grid: an edit stays private after Apply, becomes visible after Commit and shows what Oracle stored',async()=>{
    await appliedEdit(1,0,'Çağrı İĞÜŞÖ');
    assert.equal(await nameIn(tabB,1),'n1','Another session saw uncommitted work.');
    await showTab(tabA);
    await toolbar('Commit');
    await cdp.until(`!document.querySelector('.connection-control').dataset.pending`,'Committed');
    assert.equal(await nameIn(tabB,1),'Çağrı İĞÜŞÖ','The edit was not stored exactly.');
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
    if(tabB){await showTab(tabB);await run(`DROP TABLE ${TABLE}`,{ddl:true});assert.ok(!/ORA-\d+/.test(await failureText()),await failureText());console.log('PASS fixture table removed')}
  }catch(error){failure??=error;console.error(`Could not remove ${TABLE}: ${error.message}`)}
  await writeFile(path.join(root,'oracle-flow-report.json'),JSON.stringify({status:failure?'failed':'passed',checks,error:failure?.message,table:TABLE},null,2));
  if(failure)console.error(failure.message);
  cdp.close();relay.close();
}
process.exit(failure?1:0);
