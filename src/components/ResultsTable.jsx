import { fewestIn } from '../utils/compare.js';

function Cell({ result, isFewest }) {
  const { status, tokens, error } = result || {};
  if (!status) return <span className="dash">—</span>;
  if (status === 'loading')
    return (
      <span className="cell-loading">
        <span className="spinner" aria-hidden="true" />
        <span className="sr-only">Counting</span>
      </span>
    );
  if (status === 'error')
    return (
      <span className="cell-error" title={error}>
        Failed
        <span className="cell-error-msg">{error}</span>
      </span>
    );
  return (
    <span className={`count ${isFewest ? 'count-best' : ''}`}>
      {tokens}
      {isFewest && <span className="best-tag">fewest</span>}
    </span>
  );
}

export default function ResultsTable({ samples, providers, results, totals, totalWinners, onRemove }) {
  const ids = providers.map((p) => p.id);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col" className="col-sample">
              Sample
            </th>
            {providers.map((p) => (
              <th scope="col" key={p.id} className="col-num">
                <span className="dot" style={{ background: p.color }} aria-hidden="true" />
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {samples.map((s) => {
            const best = fewestIn(results[s.id], ids);
            return (
              <tr key={s.id}>
                <th scope="row" className="col-sample">
                  <div className="sample-head">
                    <span className="sample-label">{s.label}</span>
                    {onRemove && (
                      <button type="button" className="link-btn" onClick={() => onRemove(s.id)}>
                        Remove
                      </button>
                    )}
                  </div>
                  <span className="sample-text">{s.text}</span>
                  <span className="meta">{s.text.length} chars</span>
                </th>
                {providers.map((p) => (
                  <td key={p.id} className="col-num" data-label={p.name}>
                    <Cell result={results[s.id]?.[p.id]} isFewest={best.has(p.id)} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="col-sample">
              Total
            </th>
            {providers.map((p) => (
              <td key={p.id} className="col-num" data-label={`${p.name} total`}>
                {totals[p.id] == null ? (
                  <span className="dash">—</span>
                ) : (
                  <span className={`count ${totalWinners.has(p.id) ? 'count-best' : ''}`}>
                    {totals[p.id]}
                    {totalWinners.has(p.id) && <span className="best-tag">fewest</span>}
                  </span>
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
