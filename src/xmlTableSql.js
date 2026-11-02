// Element model: { local, uri, attributes: [{ local, uri }], children: [element], parent }.
const quoteLiteral = text => `'${String(text).replace(/'/g, "''")}'`;
const identifier = name => /^[A-Z][A-Z0-9_$#]{0,127}$/.test(name) ? name : `"${String(name).replace(/"/g, '""')}"`;
const columnName = name => (String(name).toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^[^A-Z]+/, '') || 'VALUE').slice(0, 128);

// Every namespace URI gets a stable SQL prefix; the default namespace cannot be left implicit in XPath.
export function namespacePrefixes(root) {
  const prefixes = new Map(), visit = element => {
    for (const uri of [element.uri, ...element.attributes.map(attribute => attribute.uri)]) if (uri && !prefixes.has(uri)) prefixes.set(uri, `ns${prefixes.size + 1}`);
    element.children.forEach(visit);
  };
  visit(root);
  return prefixes;
}

const qualified = (node, prefixes) => node.uri ? `${prefixes.get(node.uri)}:${node.local}` : node.local;

export function xmlElementPath(element, prefixes) {
  const steps = [];
  for (let node = element; node; node = node.parent) steps.unshift(qualified(node, prefixes));
  return `/${steps.join('/')}`;
}

// Rows come from the selected element path; columns are its attributes and leaf child elements.
export function xmlTableSql({ element, root, column, sourceSchema, sourceTable }) {
  const prefixes = namespacePrefixes(root), rowPath = xmlElementPath(element, prefixes), used = new Set();
  const unique = name => { let candidate = name, n = 2; while (used.has(candidate)) candidate = `${name}_${n++}`.slice(0, 128); used.add(candidate); return candidate; };
  const leaves = element.children.filter(child => !child.children.length);
  const columns = [
    ...element.attributes.map(attribute => ({ name: unique(columnName(attribute.local)), path: `@${qualified(attribute, prefixes)}` })),
    ...leaves.filter((child, index) => leaves.findIndex(other => other.local === child.local && other.uri === child.uri) === index).map(child => ({ name: unique(columnName(child.local)), path: qualified(child, prefixes) })),
  ];
  if (!columns.length) columns.push({ name: unique(columnName(element.local)), path: '.' });
  const namespaces = [...prefixes].map(([uri, prefix]) => `${quoteLiteral(uri)} AS "${prefix}"`);
  const source = sourceTable ? `${sourceSchema ? `${identifier(sourceSchema)}.` : ''}${identifier(sourceTable)}` : '/* source table */ your_table';
  const xmlColumn = identifier(String(column?.sourceColumn || column?.name || 'XML_COLUMN'));
  return `-- Draft generated from result XML path ${rowPath}; review types and paths before running.\nSELECT x.*\nFROM ${source} t,\n     XMLTABLE(${namespaces.length ? `XMLNAMESPACES(${namespaces.join(', ')}),\n              ` : ''}${quoteLiteral(rowPath)}\n              PASSING t.${xmlColumn}\n              COLUMNS ${columns.map(item => `${identifier(item.name)} VARCHAR2(4000) PATH ${quoteLiteral(item.path)}`).join(',\n                      ')}) x;\n`;
}

export function elementModel(node, parent = null) {
  const element = { local: node.localName, uri: node.namespaceURI || null, attributes: [...node.attributes].filter(attribute => attribute.name !== 'xmlns' && !attribute.name.startsWith('xmlns:')).map(attribute => ({ local: attribute.localName, uri: attribute.namespaceURI || null })), children: [], parent };
  element.children = [...node.children].map(child => elementModel(child, element));
  return element;
}
