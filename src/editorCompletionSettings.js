export const defaultCompletionSettings = Object.freeze({
  learning: true, popup: true, inline: true, delay: 200, keywordCase: 'auto', acceptEnter: true,
  acceptTab: true, snippets: true, functionParentheses: true, signatureHelp: true,
  schemaScope: 'accessible', qualification: 'collision', generateAlias: false, fkJoins: true,
  matchMode: 'prefix', recentFirst: true, systemPackages: false, oracleVersion: 'auto', plscope: false,
});

export function normalizeCompletionSettings(value = {}, legacyPopup = true) {
  const settings = { ...defaultCompletionSettings, popup: legacyPopup };
  for (const key of ['learning', 'popup', 'inline', 'acceptEnter', 'acceptTab', 'snippets', 'functionParentheses', 'signatureHelp', 'generateAlias', 'fkJoins', 'recentFirst', 'systemPackages', 'plscope']) {
    if (typeof value[key] === 'boolean') settings[key] = value[key];
  }
  if (Number.isFinite(value.delay)) settings.delay = Math.max(0, Math.min(1000, value.delay));
  for (const [key, allowed] of Object.entries({
    keywordCase: ['auto', 'upper', 'lower', 'preserve'], schemaScope: ['current', 'accessible'],
    qualification: ['collision', 'always', 'never'], matchMode: ['prefix', 'contains'], oracleVersion: ['auto', '19', '21', '23', '26'],
  })) if (allowed.includes(value[key])) settings[key] = value[key];
  // Before these controls existed, one preference enabled both providers.
  if (typeof value.inline !== 'boolean') settings.inline = legacyPopup;
  return settings;
}

export function loadCompletionSettings(storage) {
  try {
    const legacy = storage.getItem('fbsdb.autoCompletion') !== 'false';
    return normalizeCompletionSettings(JSON.parse(storage.getItem('fbsdb.completion') || '{}'), legacy);
  } catch { return { ...defaultCompletionSettings }; }
}
