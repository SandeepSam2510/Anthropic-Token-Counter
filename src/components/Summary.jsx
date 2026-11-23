/**
 * Comparison summary: which provider used the fewest tokens overall,
 * how many samples each one "won", and a simple bar chart of totals.
 */
export default function Summary({ providers, totals, wins, sampleCount }) {
  const ranked = providers
    .filter((p) => totals[p.id] != null)
    .map((p) => ({ ...p, total: totals[p.id] }))
    .sort((a, b) => a.total - b.total);

  if (ranked.length === 0) return null;

  const max = Math.max(...ranked.map((r) => r.total), 1);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const tie = ranked.length > 1 && ranked.filter((r) => r.total === best.total).length > 1;
  const savingPct = worst.total > 0 ? Math.round(((worst.total - best.total) / worst.total) * 100) : 0;

  return (
    <section className="panel summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="panel-title">
        3. Comparison
      </h2>

      {ranked.length === 1 ? (
        <p className="summary-lead">
          {best.name} used <strong>{best.total}</strong> tokens for all {sampleCount} samples. Add another
          provider's key to compare.
        </p>
      ) : tie ? (
        <p className="summary-lead">
          It's a tie: {ranked.filter((r) => r.total === best.total).map((r) => r.name).join(' and ')} each used{' '}
          <strong>{best.total}</strong> tokens in total.
        </p>
      ) : (
        <p className="summary-lead">
          🏆 <strong style={{ color: best.color }}>{best.name}</strong> is the most token-efficient for these samples:{' '}
          <strong>{best.total}</strong> tokens in total, <strong>{savingPct}% fewer</strong> than {worst.name} (
          {worst.total}).
        </p>
      )}

      <ul className="bars" aria-label="Total tokens per provider">
        {ranked.map((r, i) => (
          <li key={r.id} className="bar-row">
            <span className="bar-name">
              {i + 1}. {r.name}
            </span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(r.total / max) * 100}%`, background: r.color }} />
            </span>
            <span className="bar-value">{r.total}</span>
          </li>
        ))}
      </ul>

      {ranked.length > 1 && (
        <p className="meta summary-wins">
          Fewest tokens per sample:{' '}
          {ranked.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ' · '}
              {r.name} <strong>{wins[r.id] || 0}</strong>
            </span>
          ))}{' '}
          (ties count for each).
        </p>
      )}

      <p className="field-hint">
        Fewer tokens for the same text usually means lower input cost and more room in the context window. Prices per
        token differ by provider and model, so fewest tokens is not always cheapest. Each API also adds its own small
        formatting overhead (Anthropic counts a full user message; Gemini counts the raw text).
      </p>
    </section>
  );
}
