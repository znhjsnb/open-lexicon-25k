// Bump when publishing new data: index and shard caches share this version.
export const DATA_VERSION = '25k-2026-11-03';
export const INDEX_CACHE = `open-lexicon-index-${DATA_VERSION}`;

export function normalizeTags(tags) {
  const values = Array.isArray(tags) ? tags : [tags];
  return [...new Set(values.flatMap(value => String(value ?? '').split(',')).map(value =>
    value.replace(/[\[\]"']/g, '').trim()
  ).filter(Boolean))];
}

export function shardFor(word) {
  const first = String(word).charAt(0).toLowerCase();
  return /^[a-z]$/.test(first) ? first : 'other';
}
