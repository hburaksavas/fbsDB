// Templates only seed editor text; nothing is executed or connected until the user chooses to.
export const newQueryTemplates = [
  { id: 'select', label: 'SELECT query', content: 'SELECT *\nFROM \nWHERE 1 = 1\nFETCH FIRST 100 ROWS ONLY;\n' },
  { id: 'block', label: 'PL/SQL anonymous block', content: 'DECLARE\nBEGIN\n  NULL;\nEXCEPTION\n  WHEN OTHERS THEN\n    RAISE;\nEND;\n/\n' },
  { id: 'session', label: 'Session context', content: "SELECT SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS current_schema,\n       SYS_CONTEXT('USERENV', 'SERVICE_NAME') AS service_name\nFROM dual;\n" },
];

export function newQueryProfileItems(profiles = [], currentId = null) {
  return profiles.map(profile => ({ id: profile.id, name: profile.name || profile.id, environment: profile.environment || '', current: profile.id === currentId, available: profile.available !== false }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

export function newQueryMainLabel(profiles = [], currentId = null) {
  const current = profiles.find(profile => profile.id === currentId);
  return current ? `New SQL file on ${current.name || current.id} (Ctrl+N)` : 'New SQL file (Ctrl+N)';
}
