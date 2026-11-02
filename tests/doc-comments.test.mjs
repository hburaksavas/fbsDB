import test from 'node:test';
import assert from 'node:assert/strict';
import {docAtWord,documentedRoutines,parseDocComment} from '../src/docComments.js';
const source=`CREATE OR REPLACE PACKAGE BODY pkg AS
  /**
   * Adds a customer.
   *
   * @param p_name IN VARCHAR2 - display name
   * @param p_id   OUT NUMBER - new id
   * @return NUMBER - the id
   */
  FUNCTION add_customer(p_name IN VARCHAR2, p_id OUT NUMBER) RETURN NUMBER IS BEGIN RETURN 1; END;

  PROCEDURE plain IS BEGIN NULL; END;
  PROCEDURE caller IS BEGIN DECLARE n NUMBER; BEGIN n := add_customer('a', n); END; END;
END;`;
test('doc comments split into summary, parameters and return',()=>{
 const doc=parseDocComment('\n * Adds.\n *\n * @param a IN NUMBER - the a\n * @param b free text\n * @return NUMBER - sum\n * @throws oops\n ');
 assert.equal(doc.summary,'Adds.');assert.deepEqual(doc.params,[{name:'a',detail:'IN NUMBER',text:'the a'},{name:'b',detail:'',text:'free text'}]);
 assert.deepEqual(doc.returns,{detail:'NUMBER',text:'sum'});assert.deepEqual(doc.other,[{tag:'throws',text:'oops'}]);
});
test('only routines with a comment directly above are documented',()=>{
 const routines=documentedRoutines(source);assert.deepEqual(routines.map(entry=>entry.header.name),['add_customer']);
});
test('hovering the declaration or a call renders the same documentation; undocumented routines render nothing',()=>{
 const declaration=docAtWord(source,'add_customer',source.indexOf('add_customer(p_name')+2);
 assert.match(declaration,/Adds a customer\./);assert.match(declaration,/\*\*Parameters\*\*/);assert.match(declaration,/`p_name` IN VARCHAR2 — display name/);assert.match(declaration,/\*\*Returns\*\* NUMBER — the id/);
 assert.equal(docAtWord(source,'ADD_CUSTOMER',source.lastIndexOf('add_customer')),declaration);
 assert.equal(docAtWord(source,'plain',source.indexOf('plain')),null);assert.equal(docAtWord(source,'',0),null);
});
