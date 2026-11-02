// Tree paths use $.a, $["odd key"] and [n]; Oracle SQL/JSON paths quote unusual keys as ."odd key".
export function oracleJsonPath(path) {
  return String(path).replace(/\["((?:[^"\\]|\\.)*)"\]/g, (_, key) => `."${key.replace(/\\(.)/g, '$1').replace(/"/g, '\\"')}"`);
}

const quoteLiteral = text => `'${String(text).replace(/'/g, "''")}'`;
const identifier = name => /^[A-Z][A-Z0-9_$#]{0,127}$/.test(name) ? name : `"${String(name).replace(/"/g, '""')}"`;

export function jsonFieldAlias(path) {
  const key = [...String(path).matchAll(/\.([A-Za-z_$][\w$]*)|\["((?:[^"\\]|\\.)*)"\]/g)].map(match => match[1] ?? match[2]).at(-1) || 'VALUE';
  const alias = key.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^[^A-Z]+/, '').slice(0, 128);
  return alias || 'VALUE';
}

// Builds an editable draft; scalar types choose JSON_VALUE RETURNING, containers use JSON_QUERY.
export function jsonFieldSql({ column, path, type, sourceSchema, sourceTable }) {
  const columnName = identifier(String(column?.sourceColumn || column?.name || 'JSON_COLUMN'));
  const source = sourceTable ? `${sourceSchema ? `${identifier(sourceSchema)}.` : ''}${identifier(sourceTable)}` : '/* source table */ your_table';
  const literal = quoteLiteral(oracleJsonPath(path)), alias = identifier(jsonFieldAlias(path));
  const expression = type === 'object' || type === 'array'
    ? `JSON_QUERY(t.${columnName}, ${literal} RETURNING CLOB)`
    : `JSON_VALUE(t.${columnName}, ${literal} RETURNING ${type === 'number' ? 'NUMBER' : type === 'boolean' ? 'VARCHAR2(5)' : 'VARCHAR2(4000)'} NULL ON ERROR)`;
  return `-- Draft generated from result value path ${path}; review before running.\nSELECT ${expression} AS ${alias}\nFROM ${source} t;\n`;
}
