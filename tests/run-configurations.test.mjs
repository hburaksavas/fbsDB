import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRunConfiguration,sourceRunConfigurations,runConfigurationSql,runConfigurationParameters} from '../src/runConfigurations.js';

test('public package signatures retain overloads, modes and optional arguments without private body routines',()=>{
  const source={name:'billing.pks',content:'CREATE PACKAGE billing AS PROCEDURE pay(p_amount NUMBER, p_label OUT VARCHAR2, p_tag IN OUT VARCHAR2); PROCEDURE pay(p_text VARCHAR2); FUNCTION total(p_id NUMBER DEFAULT 1) RETURN NUMBER; END;'};
  const {configurations,errors}=sourceRunConfigurations(source,undefined,'APP');
  assert.deepEqual(errors,[]);
  assert.equal(configurations.length,3);
  assert.deepEqual(configurations[0].parameters.map(parameter=>parameter.mode),['IN','OUT','IN OUT']);
  assert.equal(configurations[2].parameters[0].useDefault,true);
  assert.equal(configurations[2].returnBindType,'NUMBER');
  assert.equal(sourceRunConfigurations({name:'billing.pkb',content:'CREATE PACKAGE BODY billing AS PROCEDURE hidden IS BEGIN NULL; END; END;'}).configurations.length,0);
});

test('generated calls quote semantic identifiers, bind values separately and return function outputs',()=>{
  const configuration=sourceRunConfigurations({name:'demo.fnc',content:'CREATE FUNCTION "MiOwner"."Do""It"(p_value IN VARCHAR2) RETURN NUMBER AS BEGIN RETURN 1; END;'}).configurations[0];
  const sql=runConfigurationSql(configuration),secret="'; DELETE FROM users; --";
  assert.ok(sql.includes('"MiOwner"."Do""It"("P_VALUE" => :arg_0)'));
  assert.ok(sql.includes(':run_result := '));
  assert.ok(!sql.includes(secret));
  const parameters=runConfigurationParameters(configuration,{arg_0:secret});
  assert.equal(parameters[0].value,secret);
  assert.equal(parameters[1].direction,'OUT');
});

test('configuration normalization excludes runtime values and invalid default omissions',()=>{
  const configuration=sourceRunConfigurations({name:'demo.prc',content:'CREATE PROCEDURE demo(p_password VARCHAR2, p_result OUT NUMBER) AS BEGIN NULL; END;'}).configurations[0];
  const clean=normalizeRunConfiguration({...configuration,values:{arg_0:'SECRET'},profileId:'SECRET',parameters:configuration.parameters.map(parameter=>({...parameter,value:'SECRET'}))});
  assert.ok(!JSON.stringify(clean).includes('SECRET'));
  assert.equal(clean.parameters[0].sensitive,true);
  assert.throws(()=>normalizeRunConfiguration({...configuration,parameters:configuration.parameters.map(parameter=>({...parameter,useDefault:true}))}));
});

test('unsupported record/collection parameters are reported rather than mapped to guessed scalar binds',()=>{
  const result=sourceRunConfigurations({name:'demo.prc',content:'CREATE PROCEDURE demo(p_rec APP.DATA_REC) AS BEGIN NULL; END;'});
  assert.equal(result.configurations.length,0);
  assert.match(result.errors[0],/Unsupported parameter/);
});
