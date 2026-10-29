import assert from 'node:assert/strict';
const {chromium}=await import(process.argv[2] || 'playwright');
const browser=await chromium.launch({channel:'msedge',headless:false});try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{if(e.message !== 'Canceled')errors.push(e.message);});await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.monaco?.editor.getEditors().length>0);await page.waitForTimeout(800);
for(const text of ['s','SELECT','SELECT ']){await page.evaluate(text=>{const e=window.monaco.editor.getEditors()[0];e.setValue('');e.focus();e.trigger('test','type',{text});},text);await page.waitForTimeout(1200);assert.ok((await page.locator('[class*=ghost-text]').allTextContents()).join('').trim().length>0,text);await page.keyboard.press('Tab');const value=await page.evaluate(()=>window.monaco.editor.getEditors()[0].getValue());assert.equal(value,text==='s'?'select':'SELECT * FROM ');console.log('PASS inline visible and Tab accepted',text);}
assert.deepEqual(errors,[]);
}finally{await browser.close();}
