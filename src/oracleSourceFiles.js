export const oracleSourceExtensions = ['.sql', '.pks', '.pkb', '.prc', '.fnc', '.trg'];

export function sourceFileName(name) {
  const value = name.trim();
  // Keep explicit extensions for native validation, rather than hiding typos as .sql.
  return /\.[^./\\]+$/.test(value) ? value : `${value}.sql`;
}

export function duplicateSourceFileName(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy.sql`;
}
