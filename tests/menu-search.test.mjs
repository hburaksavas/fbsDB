import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
test('menu filtering preserves nested action identity and disabled states, matches all words and removes separators',async()=>{
 const output=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {filterMenuItems} from './src/FilteredMenuItems.jsx';
 const children=<><button role="menuitem" disabled><span>Copy connection name</span></button><hr/><div><button role="menuitem"><span>Copy endpoint</span></button><button role="menuitem">New SQL</button></div></>;
 export const match=renderToStaticMarkup(<>{filterMenuItems(children,'NAME copy')}</>);
 export const absent=renderToStaticMarkup(<>{filterMenuItems(children,'unknown')}</>);
 export const all=renderToStaticMarkup(<>{filterMenuItems(children,'')}</>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',logLevel:'silent'});
 const module={exports:{}};new Function('module','exports','require',output.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));
 assert.match(module.exports.match,/Copy connection name/);assert.match(module.exports.match,/disabled/);assert.doesNotMatch(module.exports.match,/endpoint|New SQL|<hr/);assert.doesNotMatch(module.exports.absent,/<button/);assert.equal((module.exports.all.match(/role="menuitem"/g)||[]).length,3);
});
