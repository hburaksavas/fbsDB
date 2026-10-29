import { getOracleCompletionContext, getOracleVocabulary, lexOracle } from './oracleCompletion.js';
import { getSqlStatements } from './sqlStatements.js';

export function extractSuggestionUsage(source, objects, currentSchema, version = 19) {
  if (source.length > 100000) return [];
  const observations = new Map(), functions = new Set(getOracleVocabulary(version).filter(e => e.kind === 'function').map(e => e.name));
  const add = (context,key) => observations.set(JSON.stringify([context,key]), {context,key});
  for (const statement of getSqlStatements(source).slice(0,20)) {
    if (statement.sql.length > 20000) continue;
    const context = getOracleCompletionContext(source, statement.start + Math.max(1, statement.sql.length-1));
    const resolved = (context.sources || []).map(ref => ({ref,object: objects.find(o => o.name === ref.nameKey && o.owner === (ref.ownerKey || currentSchema))})).filter(row => row.object);
    for (const {object} of resolved) add('relation', `class:${object.owner}.${object.name}`);
    const tokens = lexOracle(statement.sql).filter(t => t.kind !== 'comment' && t.kind !== 'string');
    for (let i=0;i<Math.min(tokens.length,512);i++) {
      const token = tokens[i]; if (token.kind !== 'identifier') continue;
      const name = token.quoted ? token.value : token.value.toUpperCase();
      const positionContext = getOracleCompletionContext(source, statement.start + token.end);
      const bucket = positionContext.clause || 'statement';
      if (!token.quoted && functions.has(name) && tokens[i+1]?.value === '(') add(bucket, `function:${name}`);
      const qualifier = tokens[i-1]?.value === '.' ? tokens[i-2]?.value : null;
      const matches = resolved.filter(({ref,object}) => (!qualifier || (ref.aliasKey || ref.nameKey) === qualifier.toUpperCase()) && object.columns?.some(c => c.name === name));
      if (matches.length === 1) { const {ref} = matches[0]; add(qualifier ? 'member' : bucket, qualifier ? `field:${name}` : `field:${ref.alias || ref.name}.${name}`); }
    }
    const expression = tokens.map(t => t.quoted ? t.value : t.value.toUpperCase()).join('');
    for (const {object,ref} of resolved) {
      const groups = new Map();
      for (const fk of object.foreignKeys || []) if (fk.owner === object.owner && fk.table === object.name) { const key = JSON.stringify([fk.owner,fk.name]); if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(fk); }
      for (const rows of groups.values()) {
        const fk = rows[0], target = resolved.find(row => row.object.owner === fk.targetOwner && row.object.name === fk.targetTable);
        if (!target) continue;
        const left = ref.aliasKey || ref.nameKey, right = target.ref.aliasKey || target.ref.nameKey;
        if (rows.every(row => expression.includes(`${left}.${row.column}=${right}.${row.targetColumn}`) || expression.includes(`${right}.${row.targetColumn}=${left}.${row.column}`))) add('relation', `class:${target.object.owner}.${target.object.name}:fk:${fk.name}`);
      }
    }
  }
  return [...observations.values()];
}
