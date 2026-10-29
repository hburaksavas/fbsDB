import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDockLayout, moveDockPanel, normalizeDockLayout } from '../src/dockLayout.js';
import { resolveDockDrop, projectDockTree } from '../src/dockTree.js';

const bounds={x:44,y:28,width:1200,height:900}, widths={left:240,right:0};
const group={id:'target',side:'left',rect:{x:44,y:128,width:240,height:400},header:{x:44,y:128,width:240,height:29},tabs:[{panel:'objects',rect:{x:44,y:128,width:130,height:29}}]};
const leaves=node=>!node?[]:node.kind==='group'?[node.id]:node.children.flatMap(leaves);
const find=node=>node?.kind==='split'?[node,...node.children.flatMap(find)]:[];

test('dropping beside a panel resolves to that horizontal edge rather than a vertical zone',()=>{
  assert.equal(resolveDockDrop({x:48,y:350},bounds,[group],widths).placement,'left');
  assert.equal(resolveDockDrop({x:280,y:350},bounds,[group],widths).placement,'right');
  const target=resolveDockDrop({x:280,y:350},bounds,[group],widths);
  assert.deepEqual(target.rect,{x:166.5,y:128,width:117.5,height:400});
});
test('only the heading groups as tabs; the body resolves geometrically',()=>{
  assert.equal(resolveDockDrop({x:180,y:142},bounds,[group],widths).placement,'merge');
  assert.notEqual(resolveDockDrop({x:180,y:350},bounds,[group],widths).placement,'merge');
  assert.equal(resolveDockDrop({x:180,y:520},bounds,[group],widths).placement,'bottom');
  assert.equal(resolveDockDrop({x:650,y:500},bounds,[group],widths),null);
});
test('bottom-left and top-left are anchored at the outer sidebar ends',()=>{
  const bottom=resolveDockDrop({x:48,y:922},bounds,[group],widths);
  assert.equal(bottom.side,'left');assert.equal(bottom.placement,'end');assert.equal(bottom.groupId,null);
  assert.equal(bottom.rect.y+bottom.rect.height,bounds.y+bounds.height);
  assert.equal(resolveDockDrop({x:48,y:32},bounds,[group],widths).placement,'start');
});
test('horizontal and nested vertical splits survive normalization without losing or duplicating groups',()=>{
  let layout=moveDockPanel(defaultDockLayout(),'files','left','group-objects','left');
  const horizontal=find(layout.trees.left).find(node=>node.axis==='x');
  assert.deepEqual(horizontal.children.map(leaves),[['group-files'],['group-objects']]);
  layout=moveDockPanel(layout,'connections','left','group-files','bottom');
  const nested=find(layout.trees.left).find(node=>node.axis==='x');
  assert.equal(nested.children[0].axis,'y');
  assert.deepEqual(leaves(nested.children[0]),['group-files','group-connections']);
  layout=normalizeDockLayout(layout);
  assert.deepEqual(leaves(layout.trees.left).sort(),layout.groups.map(group=>group.id).sort());
  layout=moveDockPanel(layout,'files','left','group-objects','merge');
  assert.equal(layout.groups.length,3);
  assert.ok(find(layout.trees.left).every(node=>node.children.length>1));
  assert.deepEqual(leaves(layout.trees.left).sort(),layout.groups.map(group=>group.id).sort());
});
test('tab insertion and reordering follow the heading drop location',()=>{
  let layout=moveDockPanel(defaultDockLayout(),'files','left','group-objects','merge',0);
  assert.deepEqual(layout.groups.find(group=>group.id==='group-objects').panels,['files','objects']);
  const topology=layout.trees.left;
  layout=moveDockPanel(layout,'files','left','group-objects','merge',2);
  assert.deepEqual(layout.groups.find(group=>group.id==='group-objects').panels,['objects','files']);
  assert.deepEqual(layout.trees.left,topology);
});

test('preview projection accounts for sibling removal and remaining minimum sizes',()=>{
  let layout=moveDockPanel(defaultDockLayout(),'objects','right');
  layout=moveDockPanel(layout,'files','right','group-objects','left');
  const rect={x:900,y:28,width:258,height:900};
  const split=projectDockTree(layout.trees.right,rect,layout.groups,layout.hidden);
  assert.equal(split['group-files'].width,126.5);
  layout=moveDockPanel(layout,'files','right','group-objects','merge');
  const merged=projectDockTree(layout.trees.right,rect,layout.groups,layout.hidden);
  assert.deepEqual(merged['group-objects'],rect);
});
