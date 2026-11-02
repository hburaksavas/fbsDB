import { lexOracle } from './oracleLexer.js';
import { getSqlStatements } from './sqlStatements.js';
import { pathKey } from './workspaceTree.js';
import {sourceAssociation,packageConventionMatch,relatedTestPaths,projectRelativePath} from './projectRules.js';

const word = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;
const identifierKey = token => token.quoted ? token.value : token.value.toUpperCase();
const headerWords = new Set(['AS', 'IS', 'BEGIN', 'END', 'BODY', 'RETURN', 'AUTHID', 'WRAPPED']);
const isName = token => token?.kind === 'identifier' && !token.open && (token.quoted || !headerWords.has(token.value.toUpperCase()));

// This is a declaration recognizer, not a compiler. Never infer identity from a filename.
export function oracleSourceDeclaration(source) {
  const all = lexOracle(source);
  const tokens = all.filter(token => token.kind !== 'comment');
  if (all.some(token => token.open && !(token.kind === 'comment' && token.value.startsWith('--')))) return { declaration: null, reason: 'The source contains an unfinished literal, identifier or comment.' };
  let at = 0;
  if (word(tokens[at], 'CREATE')) {
    at++;
    if (word(tokens[at], 'OR')) {
      if (!word(tokens[at + 1], 'REPLACE')) return { declaration: null, reason: 'Incomplete CREATE OR REPLACE declaration.' };
      at += 2;
    }
    if (word(tokens[at], 'EDITIONABLE') || word(tokens[at], 'NONEDITIONABLE')) at++;
  }
  const typeToken = tokens[at++];
  if (!['PACKAGE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE'].some(type => word(typeToken, type)))
    return { declaration: null, reason: 'No supported Oracle object declaration at the start of this source.' };
  let type = typeToken.value.toUpperCase();
  if (['PACKAGE', 'TYPE'].includes(type) && word(tokens[at], 'BODY')) { type += ' BODY'; at++; }
  const first = tokens[at++];
  if (!isName(first)) return { declaration: null, reason: 'The declaration needs a complete object name.' };
  let owner = null, name = first;
  if (tokens[at]?.value === '.') {
    owner = first; name = tokens[++at]; at++;
    if (!isName(name)) return { declaration: null, reason: 'The declaration needs a complete qualified object name.' };
  }
  if (!tokens[at] || tokens[at].value === '.' || !['(', ';'].includes(tokens[at].value) && !['AS', 'IS', 'RETURN', 'AUTHID', 'ACCESSIBLE', 'DEFAULT', 'COLLATION', 'BEFORE', 'AFTER', 'INSTEAD', 'FOR', 'COMPOUND', 'SHARING', 'WRAPPED'].some(value => word(tokens[at], value)))
    return { declaration: null, reason: 'The object declaration header is incomplete or unsupported.' };
  let statementSource = source;
  for (const comment of all.filter(token => token.kind === 'comment').reverse())
    statementSource = statementSource.slice(0, comment.start) + comment.value.replace(/[^\r\n]/g, ' ') + statementSource.slice(comment.end);
  if (getSqlStatements(statementSource).length !== 1)
    return { declaration: null, reason: 'Multiple statements cannot identify a single source object.' };
  return { declaration: { type, name: name.value, nameKey: identifierKey(name), owner: owner?.value ?? null, ownerKey: owner ? identifierKey(owner) : null, start: typeToken.start, nameStart: name.start }, reason: null };
}

export function describeOracleSource(document, rules) {
  const extension = /\.[^./\\]+$/.exec(document.path || document.name || '')?.[0]?.toLowerCase();
  const associatedType = sourceAssociation(extension || '', rules);
  const expectedType = associatedType === 'SQL' ? undefined : associatedType;
  const result = oracleSourceDeclaration(document.content || '');
  const mismatch = !!expectedType && result.declaration?.type !== expectedType;
  return { ...result, expectedType, mismatch,
    warning: expectedType && (!result.declaration ? `${expectedType} file: ${result.reason}` : mismatch ? `The extension suggests ${expectedType}, but the source declares ${result.declaration.type}.` : null) };
}

function scope(document, context) {
  if (context.sourceScopes?.has(document)) return context.sourceScopes.get(document);
  const result = readScope(document, context);
  context.sourceScopes?.set(document, result);
  return result;
}

function readScope(document, context) {
  const source = describeOracleSource(document, context.rules);
  if (!source.declaration || source.warning || document.readOnly) return null;
  const session = context.sessions?.[document.id] || {};
  const rawProfile = session.activeConnection?.id;
  const profile = rawProfile && !['No connection', 'Disconnected'].includes(rawProfile) ? rawProfile : document.connectionProfileId || null;
  // Metadata owner names already have Oracle casing; do not uppercase quoted schema names.
  const owner = source.declaration.ownerKey ?? (session.schemaOwner || null);
  const path = pathKey(document.path);
  const root = pathKey(context.root);
  if (!root || !path.startsWith(`${root}/`)) return null;
  return { path: document.path, declaration: source.declaration, profile, owner, directory: path.slice(0, path.lastIndexOf('/')) };
}

export function relatedPackageDocument(active, documents, context = {}) {
  const current = scope(active, context);
  if (!current || !['PACKAGE', 'PACKAGE BODY'].includes(current.declaration.type))
    return { target: null, reason: 'Open a valid local package source inside the workspace.' };
  const opposite = current.declaration.type === 'PACKAGE' ? 'PACKAGE BODY' : 'PACKAGE';
  const matches = documents.filter(document => {
    if (document.id === active.id) return false;
    const candidate = scope(document, context);
    const convention = candidate ? packageConventionMatch(current,candidate,context) : {applies:false,matches:false};
    return candidate && (!convention.applies || convention.matches) && candidate.declaration.type === opposite && candidate.declaration.nameKey === current.declaration.nameKey && candidate.profile === current.profile &&
      (current.owner !== null && candidate.owner !== null ? current.owner === candidate.owner : current.owner === candidate.owner && (current.directory === candidate.directory || convention.matches));
  });
  return matches.length === 1 ? { target: matches[0], reason: null } : { target: null,
    reason: matches.length ? 'Several open sources match this package. Choose the intended file in Open editors.' : 'Open the matching package specification/body in this workspace with the same connection and schema context.' };
}

export function packageDocumentGroups(documents, context = {}) {
  context = { ...context, sourceScopes: new Map() };
  const grouped = new Set(), groups = [];
  for (const document of documents) {
    if (grouped.has(document.id)) continue;
    const target = relatedPackageDocument(document, documents, context).target;
    if (!target || grouped.has(target.id) || relatedPackageDocument(target, documents, context).target?.id !== document.id) continue;
    const members = [document, target].sort((a, b) => describeOracleSource(a,context.rules).declaration.type === 'PACKAGE' ? -1 : 1);
    groups.push(members.map(member => member.id));
    members.forEach(member => grouped.add(member.id));
  }
  return groups;
}

export function relatedSourceCandidates(active, openDocuments, files, context = {}) {
  const current = describeOracleSource(active, context.rules);
  if (current.warning || active.readOnly) return [];
  const packageSource = ['PACKAGE', 'PACKAGE BODY'].includes(current.declaration?.type);
  const activePath = projectRelativePath(active.path,context.root);
  const openByPath = new Map(openDocuments.filter(document => document.path).map(document => [pathKey(document.path), document]));
  const testPaths = packageSource ? relatedTestPaths(active,current.declaration,context) : [];
  return files.flatMap(file => {
    const document = openByPath.get(pathKey(file.path)) || file;
    if (pathKey(document.path) === pathKey(active.path) || document.readOnly) return [];
    if (testPaths.includes(projectRelativePath(document.path,context.root))) return [{...document,relation:'Test',alreadyOpen:openByPath.has(pathKey(file.path))}];
    const source = describeOracleSource(document,context.rules);
    if (!packageSource) {
      if (activePath === null || source.warning || !['PACKAGE','PACKAGE BODY'].includes(source.declaration?.type) || !relatedTestPaths(document,source.declaration,context).includes(activePath)) return [];
      return [{...document,relation:'Source under test',declaration:source.declaration,alreadyOpen:openByPath.has(pathKey(file.path))}];
    }
    if (source.warning || !source.declaration || source.declaration.nameKey !== current.declaration.nameKey || source.declaration.type === current.declaration.type || !['PACKAGE', 'PACKAGE BODY'].includes(source.declaration.type)) return [];
    if (source.declaration.ownerKey && current.declaration.ownerKey && source.declaration.ownerKey !== current.declaration.ownerKey) return [];
    const convention = packageConventionMatch({...active,declaration:current.declaration},{...document,declaration:source.declaration},context);
    if (convention.applies && !convention.matches) return [];
    return [{ ...document, relation:source.declaration.type, declaration: source.declaration, alreadyOpen: openByPath.has(pathKey(file.path)) }];
  });
}
