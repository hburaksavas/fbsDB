// Maps marked row identities to their position in the rendered (filtered/sorted/paged) view.
export function rowMarkerPositions(rows, marks = [], { height = 0, limit = 500, minGap = 3 } = {}) {
  if (!marks.length || !rows.length || height <= 0) return { markers: [], outside: marks.length };
  const wanted = new Set(marks), markers = [];
  let found = 0;
  rows.forEach((item, r) => {
    if (!wanted.has(item.index)) return;
    found++;
    const top = Math.round((r + 0.5) / rows.length * height), last = markers.at(-1);
    if (last && top - last.top < minGap) last.count++;
    else if (markers.length < limit) markers.push({ index: item.index, r, top, count: 1 });
  });
  return { markers, outside: wanted.size - found };
}
