import catalog from './oracleCatalog.json' with { type: 'json' };

export function oracleVocabularyStatus(preference, vocabulary) {
  const automatic = preference === 'auto';
  const requested = Number.parseInt(automatic ? vocabulary?.version : preference, 10) || 19;
  const version = [...catalog.versions].reverse().find(value => value <= requested) || catalog.versions[0];
  const functions = catalog.entries.filter(entry => entry.kind === 'function' && entry.versions.includes(version)).length;
  const live = automatic && vocabulary?.words?.length > 0;
  const source = live ? `${vocabulary.words.length} server SQL keywords (V$RESERVED_WORDS)` : 'Offline SQL reference';
  const fallback = automatic && vocabulary?.error ? ` · ${vocabulary.error}` : '';
  return `Oracle ${version} reference · ${functions} SQL functions · ${source}${fallback}`;
}
