// Run with a Playwright installation: node tests/suggestion-browser.mjs <playwright-module-path>
const { chromium } = await import(process.argv[2] || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:false}); const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>{ if (e.message !== 'Canceled') errors.push(e.message); });
try {
await page.goto('http://127.0.0.1:5173/'); await page.waitForFunction(()=>window.monaco?.editor.getEditors().length>0); await page.waitForTimeout(1500);
const set=async text=>{await page.evaluate(text=>{const e=window.monaco.editor.getEditors()[0];e.setValue(text);e.setPosition({lineNumber:1,column:text.length+1});e.focus();},text);};
const value=()=>page.evaluate(()=>window.monaco.editor.getEditors()[0].getValue().replace(/\r\n/g,'\n'));
await set('SEL'); await page.keyboard.press('Control+Space'); await page.waitForSelector('.suggest-widget.visible'); await page.keyboard.press('Enter'); assert.notEqual(await value(),'SEL');assert.ok(!(await value()).endsWith('SEL\n'));console.log('PASS initial highlighted suggestion accepted');
await set('SEL');await page.waitForTimeout(600);await page.keyboard.press('Control+Space'); await page.waitForSelector('.suggest-widget.visible'); await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.notEqual(await value(),'SEL\n');assert.notEqual(await value(),'SEL');console.log('PASS arrow Enter acceptance',await value());
await set('');await page.waitForTimeout(700);assert.equal(await page.locator('.suggest-widget.visible').count(),0);console.log('PASS empty automatic suppressed');
await page.keyboard.press('Control+Space');await page.waitForSelector('.suggest-widget.visible');console.log('PASS empty manual available');await page.keyboard.press('Escape');await page.keyboard.press('Enter');assert.equal(await value(),'\n');console.log('PASS closed popup Enter newline');
assert.deepEqual(errors,[]);console.log('PASS no browser errors');} finally { await browser.close(); }

