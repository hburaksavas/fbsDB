import test from 'node:test';
import assert from 'node:assert/strict';
import {addToGroup,arrangeTabs,createGroup,groupOf,normalizeTabGroups,pruneGroups,removeFromGroups,renameGroup,toggleCollapsed,ungroup,validateGroupName} from '../src/tabGroups.js';
const order=['a','b','c','d','e'];
test('creating a group moves tabs out of other groups and cycles colors',()=>{
 let {groups,id}=createGroup([],['a','b'],{name:'Validation',id:'g1'});
 assert.equal(groups[0].color,'teal');
 ({groups}=createGroup(groups,['b','c'],{name:'Temp',id:'g2'}));
 assert.deepEqual(groups.map(group=>[group.name,group.members,group.color]),[['Validation',['a'],'teal'],['Temp',['b','c'],'amber']]);
 assert.equal(groupOf(groups,'c').id,'g2');assert.equal(groupOf(groups,'d'),null);
});
test('names are trimmed, bounded and unique ignoring case; failures keep the groups',()=>{
 const {groups}=createGroup([],['a'],{name:'Packages',id:'g1'});
 assert.equal(validateGroupName(groups,'  ').error,'Enter a group name.');assert.match(validateGroupName(groups,'x'.repeat(41)).error,/40/);
 assert.match(validateGroupName(groups,'packages').error,/already/);assert.equal(validateGroupName(groups,'packages','g1').name,'packages');
 assert.deepEqual(renameGroup(groups,'g1','').groups,groups);assert.equal(renameGroup(groups,'g1',' Core ').groups[0].name,'Core');
 assert.ok(createGroup(groups,['b'],{name:'PACKAGES'}).error);
});
test('adding, removing, ungrouping and pruning keep groups consistent',()=>{
 let groups=createGroup([],['a','b'],{name:'One',id:'g1'}).groups;
 groups=createGroup(groups,['c'],{name:'Two',id:'g2'}).groups;
 groups=addToGroup(groups,'g2',['a','d']);assert.deepEqual(groups.map(group=>group.members),[['b'],['c','a','d']]);
 groups=removeFromGroups(groups,['b']);assert.deepEqual(groups.map(group=>group.id),['g2']);
 assert.deepEqual(pruneGroups(groups,['c','d']).map(group=>group.members),[['c','d']]);assert.deepEqual(pruneGroups(groups,['z']),[]);
 assert.deepEqual(ungroup(groups,'g2'),[]);assert.equal(pruneGroups(groups,order),groups);
});
test('arrangement keeps members together and collapsed groups show only the active tab',()=>{
 const groups=createGroup(createGroup([],['b','d'],{name:'G',id:'g1'}).groups,['e'],{name:'H',id:'g2'}).groups;
 assert.deepEqual(arrangeTabs(order,groups,'a').map(item=>item.id),['a','b','d','c','e']);
 assert.deepEqual(arrangeTabs(order,groups,'a').filter(item=>item.first).map(item=>item.id),['b','e']);
 const collapsed=toggleCollapsed(groups,'g1');
 assert.deepEqual(arrangeTabs(order,collapsed,'a').map(item=>item.id),['a',null,'c','e']);
 assert.deepEqual(arrangeTabs(order,collapsed,'d').map(item=>item.id),['a','d','c','e']);
});
test('stored groups are sanitized',()=>{
 assert.deepEqual(normalizeTabGroups('x'),[]);
 const cleaned=normalizeTabGroups([{id:'g',name:'N',color:'pink',members:['a','a',5]},{id:'h',name:'M',members:['a','b']},{nope:true}]);
 assert.deepEqual(cleaned.map(group=>[group.color,group.members]),[['teal',['a']],['teal',['b']]]);
});
