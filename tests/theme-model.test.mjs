import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import postcss from 'postcss';
import palettes from '../src/themePalettes.json' with {type:'json'};
import {themeNames,normalizeTheme,themePresets,monacoThemeColors,monacoTokenRules,resolveTokenColors,applyDocumentTheme} from '../src/themeModel.js';

const luminance=hex=>{const rgb=hex.slice(1).match(/../g).slice(0,3).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};

test('explorer icon palettes retain contrast on normal, raised and selected rows in every theme',()=>{
  for(const [name,{tokens}]of Object.entries(palettes)){
    const resolve=token=>tokens[token].startsWith('var(')?resolve(tokens[token].slice(4,-1)):tokens[token];
    for(const token of ['--icon-table','--icon-view','--icon-routine','--icon-package','--icon-type','--icon-key','--icon-link','--icon-folder','--icon-connection']){
      for(const background of ['--panel','--surface','--surface-raised','--selection-bg'])assert.ok(contrast(resolve(token),resolve(background))>=3,`${name}: ${token} on ${background}`);
    }
  }
});

test('all three palettes provide readable surfaces, semantic states, selections and button labels',()=>{
  assert.deepEqual(themeNames,['default','dark','light']);assert.equal(normalizeTheme('unknown'),'default');
  for(const [name,{tokens:t,editor:e}]of Object.entries(palettes)){
    for(const background of ['--bg','--surface','--surface-raised','--input','--chrome']){
      for(const text of ['--foreground','--muted','--danger','--warning','--success','--info'])assert.ok(contrast(t[text],t[background])>=4.5,`${name} ${text} on ${background}`);
    }
    assert.ok(contrast(t['--on-accent'],t['--accent'])>=4.5,name+' button');
    assert.ok(contrast(t['--on-accent'],t['--accent-strong'])>=4.5,name+' hover button');
    assert.ok(contrast(t['--selection-text'],t['--selection-bg'])>=4.5,name+' selection');
    assert.ok(contrast(t['--line-strong'],t['--input'])>=3,name+' input boundary');
    for(const token of ['keyword','string','comment','number','lineNumber','function']){
      for(const background of [t['--editor-bg'],e.lineHighlight])assert.ok(contrast(e[token],background)>=4.5,`${name} editor ${token} on ${background}`);
    }
    for(const token of ['keyword','string','comment','number'])assert.equal(t['--syntax-'+token],e[token]);
    assert.equal(monacoThemeColors(name)['editor.selectionForeground'],t['--selection-text']);
    assert.ok(contrast(monacoThemeColors(name)['editorLineNumber.activeForeground'],e.lineHighlight)>=4.5,name+' active line number');
    assert.ok(contrast(monacoThemeColors(name)['editorSuggestWidget.highlightForeground'],t['--surface'])>=4.5,name+' completion highlight');
    assert.ok(contrast(monacoThemeColors(name)['editorSuggestWidget.focusHighlightForeground'],t['--selection-bg'])>=4.5,name+' selected completion highlight');
    assert.equal(monacoThemeColors(name)['editorHoverWidget.background'],t['--surface']);
    assert.equal(themePresets[name].accent,t['--accent']);
  }
});
test('SQL theme rules cover token families and preserve custom colors across default upgrades',()=>{
  for(const [name,palette]of Object.entries(palettes)){
    for(const old of [palette.legacyEditor,...palette.previousEditors||[]]){
      const upgraded=resolveTokenColors({[name]:old})[name];
      for(const key of ['keyword','string','comment','number'])assert.equal(upgraded[key],palette.editor[key]);
      const customized={...old,keyword:'#abcdef'};
      assert.deepEqual(resolveTokenColors({[name]:customized})[name],customized);
    }
    const rules=Object.fromEntries(monacoTokenRules(name,{keyword:'#abcdef'}).map(r=>[r.token,r.foreground]));
    assert.equal(rules.keyword,'abcdef');assert.equal(rules.type,'abcdef');
    assert.equal(rules.predefined,palette.editor.function.slice(1));
    assert.equal(rules.identifier,palette.tokens['--foreground'].slice(1));
    assert.equal(rules.delimiter,rules.operator);
    for(const key of ['comment','keyword','type','predefined','operator','delimiter','string','number','identifier'])assert.equal(rules[key+'.sql'],rules[key]);
  }
});
test('legacy default SQL colors upgrade while explicit user customization remains intact',()=>{
  const defaults=resolveTokenColors({default:palettes.default.legacyEditor});
  assert.equal(defaults.default.comment,palettes.default.editor.comment);
  const custom={...palettes.default.legacyEditor,keyword:'#abcdef'};
  assert.deepEqual(resolveTokenColors({default:custom}).default,custom);
  const doc={documentElement:{dataset:{},style:{}}};applyDocumentTheme('light',doc);assert.equal(doc.documentElement.dataset.theme,'light');assert.equal(doc.documentElement.style.colorScheme,'light');
});
test('CSS/XAML palette generation stays synchronized with the single shared source',()=>{
  assert.doesNotThrow(()=>execFileSync(process.execPath,['scripts/generate/generate-theme-tokens.mjs','--check'],{stdio:'pipe'}));
});
test('component CSS has no palette literals or unresolved color variables',()=>{
  const definitions=new Set(),references=[],literals=[];
  for(const file of readdirSync('src').filter(f=>f.endsWith('.css'))){
    const root=postcss.parse(readFileSync('src/'+file,'utf8'));
    root.walkDecls(d=>{
      if(d.prop.startsWith('--'))definitions.add(d.prop);
      if(file!=='themeTokens.css'&&/#[a-f\d]{3,8}\b|\brgba?\(|\b(?:white|black)\b/i.test(d.value))literals.push(`${file}:${d.source.start.line} ${d.prop}`);
      if(/color|background|border|shadow|outline|fill|stroke|text-decoration/.test(d.prop))for(const m of d.value.matchAll(/var\((--[\w-]+)/g))references.push(m[1]);
    });
  }
  assert.deepEqual(literals,[]);assert.deepEqual([...new Set(references.filter(name=>!definitions.has(name)))],[]);
});
