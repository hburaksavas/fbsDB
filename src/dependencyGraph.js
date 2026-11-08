// Object-level dependencies built from the reference index: packages, standalone routines, triggers, types, tables, views,
// sequences, synonyms and script files, with the edges between them. Nothing is read from the database:
// - an object referenced but not created in any indexed file is "external" (it may exist in the database or not at all);
// - a name that matches several objects links to each of them and the edge is marked ambiguous;
// - synonyms are shown with their target but references are not redirected through them; grants and dynamic SQL are not followed.

export const EDGE_KINDS = ['calls', 'reads', 'writes', 'on', 'references', 'uses', 'aliases'];
export const edgeLabel = { calls: 'calls', reads: 'reads', writes: 'writes', on: 'fires on', references: 'foreign key to', uses: 'uses sequence', aliases: 'synonym for' };

const objectKey = (owner, name) => `${owner || ''}.${name}`;
const label = (owner, name) => [owner, name].filter(Boolean).join('.');

export function buildDependencyGraph(index) {
  const objects = new Map(), byName = new Map();
  const define = (kind, owner, name, declaration, extra = {}) => {
    const key = objectKey(owner, name);
    let object = objects.get(key);
    if (!object) {
      object = { key, kind, owner, name, label: label(owner, name), definitions: [], external: false, ...extra };
      objects.set(key, object);
      byName.set(name, [...(byName.get(name) || []), object]);
    }
    if (declaration) object.definitions.push(declaration);
    return object;
  };
  // Every routine belongs to one object: its package, itself when standalone, the object a statement creates, or its script file.
  const unitOf = new Map();
  const scriptOf = path => { const key = `script:${path.toLowerCase()}`; let object = objects.get(key); if (!object) { object = { key, kind: 'SCRIPT', owner: null, name: path, label: path.split(/[\\/]/).pop(), definitions: [{ path, start: 0 }], external: false }; objects.set(key, object); } return object; };
  const top = routine => { let current = routine; while (current?.parent) current = current.parent; return current; };
  for (const routine of index.routines.values()) {
    const root = top(routine);
    let object;
    if (root.kind === 'PACKAGE' || root.kind === 'TYPE') object = define(root.kind, root.owner, root.name, null);
    else if (routine.package) object = define('PACKAGE', routine.owner, routine.package, null);
    else if (root.anonymous && root.defines) object = define(root.defines.kind, root.defines.owner, root.defines.name, null);
    else if (root.anonymous) object = scriptOf(root.path);
    else object = define(root.kind, root.owner, root.name, null);
    unitOf.set(routine.id, object);
  }
  for (const routine of index.routines.values()) {
    if (routine.parent || routine.local) continue;
    const object = unitOf.get(routine.id);
    if (object.kind === 'SCRIPT') continue;
    for (const declaration of routine.declarations) object.definitions.push({ path: declaration.path, start: declaration.defines ? declaration.defines.nameStart : declaration.start, part: declaration.part });
  }
  // References resolve to defined objects by name; a schema on either side narrows the match only when both sides have one.
  const resolve = (owner, name, kind) => {
    const found = (byName.get(name) || []).filter(object => !object.external && (!owner || !object.owner || object.owner === owner));
    if (found.length) return found;
    return [define(kind, owner, name, null, { external: true })];
  };
  const edges = new Map();
  const link = (from, to, kind, site, ambiguous) => {
    if (!from || !to || from === to) return;
    const key = `${from.key}\u0000${to.key}\u0000${kind}`;
    const edge = edges.get(key) || { from: from.key, to: to.key, kind, sites: [], ambiguous: false };
    if (site) edge.sites.push(site); edge.ambiguous ||= ambiguous; edges.set(key, edge);
  };
  const siteOf = item => ({ path: item.path, start: item.start, end: item.end, line: item.line });
  for (const call of index.calls) link(unitOf.get(call.caller), unitOf.get(call.callee), 'calls', siteOf(call), call.ambiguous);
  for (const ref of index.references) {
    const from = unitOf.get(ref.caller);
    if (ref.kind === 'table') { const targets = resolve(ref.owner, ref.table, 'TABLE'); for (const to of targets) link(from, to, ref.access === 'write' ? 'writes' : 'reads', siteOf(ref), targets.length > 1); }
    else if (ref.kind === 'sequence') { const targets = resolve(ref.owner, ref.sequence, 'SEQUENCE'); for (const to of targets) link(from, to, 'uses', siteOf(ref), targets.length > 1); }
  }
  for (const routine of index.routines.values()) {
    const from = unitOf.get(routine.id);
    for (const declaration of routine.declarations) {
      if (declaration.triggerOn) { const targets = resolve(declaration.triggerOn.owner, declaration.triggerOn.name, 'TABLE'); for (const to of targets) link(from, to, 'on', { path: declaration.path, start: declaration.triggerOn.start, end: declaration.triggerOn.end }, targets.length > 1); }
      for (const target of declaration.defines?.links || []) { const targets = resolve(target.owner, target.name, 'TABLE'); for (const to of targets) link(from, to, target.kind, { path: declaration.path, start: target.start, end: target.end }, targets.length > 1); }
    }
  }
  return { objects, edges: [...edges.values()], unitOf };
}

// The objects a focused object uses and the objects that use it, each with the edge kinds between them.
export function dependencyNeighbors(graph, key) {
  const collect = (side, other) => {
    const groups = new Map();
    for (const edge of graph.edges) {
      if (edge[side] !== key) continue;
      const group = groups.get(edge[other]) || { object: graph.objects.get(edge[other]), kinds: [], sites: [], ambiguous: false };
      group.kinds.push(edge.kind); group.sites.push(...edge.sites); group.ambiguous ||= edge.ambiguous; groups.set(edge[other], group);
    }
    return [...groups.values()].sort((a, b) => a.object.kind.localeCompare(b.object.kind) || a.object.label.localeCompare(b.object.label));
  };
  return { uses: collect('from', 'to'), usedBy: collect('to', 'from') };
}

// The object to start from: a table, view or sequence named under the caret, otherwise the object around the caret.
export function dependencyObjectAt(graph, index, path, offset) {
  const key = String(path || '').toLowerCase(), inFile = item => item.path.toLowerCase() === key && item.start <= offset && offset <= item.end;
  const ref = index.references.find(item => (item.kind === 'table' || item.kind === 'sequence') && inFile(item));
  if (ref) {
    const name = ref.kind === 'table' ? ref.table : ref.sequence;
    const found = [...graph.objects.values()].filter(object => object.name === name && (!ref.owner || !object.owner || object.owner === ref.owner));
    if (found.length) return found.find(object => !object.external) || found[0];
  }
  const call = index.calls.find(inFile);
  if (call) return graph.unitOf.get(call.callee);
  let found = null;
  for (const routine of index.routines.values()) for (const declaration of routine.declarations) {
    if (declaration.path.toLowerCase() !== key || declaration.start > offset || offset > declaration.end) continue;
    if (!found || declaration.start >= found.start) found = { routine, start: declaration.start };
  }
  return found ? graph.unitOf.get(found.routine.id) : null;
}
