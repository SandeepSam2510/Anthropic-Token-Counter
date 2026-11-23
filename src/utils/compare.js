/** Lowest successful count in a row → set of provider ids that tie for "fewest". */
export function fewestIn(rowResults, providerIds) {
  let min = Infinity;
  for (const id of providerIds) {
    const r = rowResults?.[id];
    if (r?.status === 'success' && r.tokens < min) min = r.tokens;
  }
  if (min === Infinity) return new Set();
  const done = providerIds.filter((id) => rowResults?.[id]?.status === 'success');
  if (done.length < 2) return new Set(); // nothing to compare against
  return new Set(done.filter((id) => rowResults[id].tokens === min));
}

