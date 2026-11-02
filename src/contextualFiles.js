import { routineHeaders } from './docSkeleton.js';
import { describeOracleSource } from './oracleSourceIdentity.js';

const slug = text => String(text || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'object';
const join = (...parts) => parts.filter(Boolean).join('/').replace(/\/{2,}/g, '/');

function callBlock(owner, header) {
  const bind = parameter => `:${parameter.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
  const args = header.params.map(parameter => `${parameter.name} => ${bind(parameter)}`).join(', ');
  const target = `${owner}.${header.name}${args ? `(${args})` : ''}`;
  return header.kind === 'FUNCTION' ? `  ${bind({ name: 'result' })} := ${target};` : `  ${target};`;
}

// Proposes related files from the package name and the project's own conventions. Nothing is created until the user confirms.
export function relatedFileProposals(document, rules, existingPaths = []) {
  const source = describeOracleSource(document, rules), declaration = source.declaration;
  if (!declaration || !['PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION'].includes(declaration.type)) return { error: 'Open a package, procedure or function source to create related files.', proposals: [] };
  const name = declaration.name, lower = slug(name), areas = rules?.project?.areas || {};
  const existing = new Set(existingPaths.map(path => path.replace(/\\/g, '/').toLowerCase()));
  const routines = routineHeaders(document.content || '');
  const unique = [...new Map(routines.map(header => [`${header.kind}:${header.name.toUpperCase()}`, header])).values()];
  const calls = unique.slice(0, 30).map(header => callBlock(name, header));
  const proposals = [];

  const testPattern = (rules?.testPatterns || [])[0] || join(areas.tests || 'tests', '{name}_test.sql');
  proposals.push({ id: 'test', label: 'Test draft', path: testPattern.replace(/\{name\}/g, lower),
    content: `-- Test draft for ${name}. Review it, then compile ${name} and run it explicitly.\n-- This is not a configured test framework.\nBEGIN\n${calls.length ? calls.join('\n') : `  NULL; -- call ${name} here`}\n  DBMS_OUTPUT.PUT_LINE('${name}: draft executed');\nEND;\n/\n` });

  const migrations = areas.migrations || 'migrations';
  const versions = [...existing].map(path => new RegExp(`^${migrations.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/v(\\d+)__`).exec(path)?.[1]).filter(Boolean).map(Number);
  const next = String((versions.length ? Math.max(...versions) : 0) + 1).padStart(3, '0');
  proposals.push({ id: 'migration', label: 'Migration draft', path: join(migrations, `V${next}__${lower}_change.sql`),
    content: `-- Migration draft V${next} for ${name}.\n-- Add the reviewed schema changes here. Applying and tracking migrations is not done by fbsDB.\n` });

  proposals.push({ id: 'example', label: 'Example call', path: join(areas.scripts || 'scripts', `${lower}_example.sql`),
    content: `-- Example calls for ${name}. Bind values are entered when you run it.\nBEGIN\n${calls.length ? calls.join('\n') : `  NULL; -- call ${name} here`}\nEND;\n/\n` });

  return { error: '', name, proposals: proposals.map(proposal => ({ ...proposal, exists: existing.has(proposal.path.toLowerCase()) })) };
}
