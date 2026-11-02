const nlsOrder = ['NLS_LANGUAGE', 'NLS_TERRITORY', 'NLS_DATE_LANGUAGE', 'NLS_DATE_FORMAT', 'NLS_TIMESTAMP_FORMAT', 'NLS_TIMESTAMP_TZ_FORMAT', 'NLS_NUMERIC_CHARACTERS', 'SESSIONTIMEZONE'];

// Groups what is known about the active tab's physical session; every value says where it came from.
export function sessionInspectorSections({ connection = null, context = null, nls = null, transactionPending = false, autoCommit = false, executing = false, result = null, rowsLoaded = 0, generation = null } = {}) {
  const connected = Boolean(connection && !['No connection', 'Disconnected'].includes(connection.id));
  const sections = [];
  sections.push({ id: 'connection', title: 'Connection', rows: [
    ['Profile', connection?.name || connection?.id || 'None', 'Saved profile'],
    ['State', connected ? 'Connected' : 'Not connected', 'This tab'],
    ...(generation != null ? [['Connection generation', String(generation), 'Detects reconnects']] : []),
  ] });
  sections.push({ id: 'session', title: 'Oracle session', rows: context ? [
    ['Current schema', context.schema || '—', 'Database, read on request'],
    ['Container', context.container || '—', 'Database, read on request'],
    ['Edition', context.edition || '—', 'Database, read on request'],
    ['Service', context.service || '—', 'Database, read on request'],
    ...(context.sessionId ? [['Session id', String(context.sessionId), 'Database, read on request']] : []),
  ] : [['Details', connected ? 'Not loaded yet' : 'Connect to read the session', '—']] });
  const effective = nls?.effective || {};
  const names = [...nlsOrder.filter(name => name in effective), ...Object.keys(effective).filter(name => !nlsOrder.includes(name)).sort()];
  sections.push({ id: 'nls', title: 'NLS settings', rows: names.length ? names.map(name => {
    const configured = nls.configured?.[name], initial = nls.initial?.[name];
    return [name, effective[name], configured != null ? 'Profile override' : initial != null && initial !== effective[name] ? `Changed from ${initial} in this session` : 'Database default'];
  }) : [['Settings', connected ? 'Not loaded yet' : 'Connect to read NLS settings', '—']] });
  sections.push({ id: 'transaction', title: 'Transaction', rows: [
    ['Pending changes', transactionPending ? 'Yes — commit or roll back' : 'None', 'This tab\'s session'],
    ['Auto commit', autoCommit ? 'On' : 'Off', 'This tab'],
    ['Statement running', executing ? 'Yes' : 'No', 'This tab'],
  ] });
  const cursor = result ? [
    ['Rows loaded', rowsLoaded.toLocaleString('en-US'), 'Latest result'],
    ['More rows on server', result.hasMore ? (result.cursorUnavailable ? 'Cursor no longer available' : 'Yes — open cursor') : 'No', 'Latest result'],
    ...(result.sqlId ? [['SQL id', result.sqlId, 'Latest result']] : []),
    ...(result.elapsedMs != null ? [['Elapsed', `${result.elapsedMs} ms`, 'Latest result']] : []),
  ] : [['Latest result', 'No result yet', '—']];
  sections.push({ id: 'cursor', title: 'Cursor and result', rows: cursor });
  return sections;
}
