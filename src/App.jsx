import { useRef, useState } from 'react';
import ProviderCard from './components/ProviderCard.jsx';
import ResultsTable from './components/ResultsTable.jsx';
import { fewestIn } from './utils/compare.js';
import Summary from './components/Summary.jsx';
import { PROVIDERS, countTokens, validateKey, TokenCountError } from './api/providers.js';
import { SAMPLES } from './data/samples.js';

const CONCURRENCY = 4; // a few requests at a time to stay friendly with rate limits
const MAX_CUSTOM_LENGTH = 5000;
const emptyKeys = () => Object.fromEntries(PROVIDERS.map((p) => [p.id, '']));

export default function App() {
  // Keys live in memory only – never persisted anywhere.
  const [keys, setKeys] = useState(emptyKeys);
  const [models, setModels] = useState(() => Object.fromEntries(PROVIDERS.map((p) => [p.id, p.defaultModel])));
  const [keyErrors, setKeyErrors] = useState({});
  const [samples, setSamples] = useState(SAMPLES);
  // results[sampleId][providerId] = { status, tokens?, error? }
  const [results, setResults] = useState({});
  const [ranProviders, setRanProviders] = useState([]); // providers included in the last run
  const [isCounting, setIsCounting] = useState(false);
  const [banner, setBanner] = useState(null);
  const [customText, setCustomText] = useState('');
  const abortRef = useRef(null);

  const shownProviders = PROVIDERS.filter((p) => ranProviders.includes(p.id));
  const shownIds = shownProviders.map((p) => p.id);

  // Totals only for providers that counted every sample (so comparisons are fair).
  const totals = {};
  for (const id of shownIds) {
    const all = samples.length > 0 && samples.every((s) => results[s.id]?.[id]?.status === 'success');
    totals[id] = all ? samples.reduce((sum, s) => sum + results[s.id][id].tokens, 0) : null;
  }

  const completed = shownIds.filter((id) => totals[id] != null);
  const minTotal = Math.min(...completed.map((id) => totals[id]));
  const totalWinners = new Set(completed.length >= 2 ? completed.filter((id) => totals[id] === minTotal) : []);

  // How many samples each provider had the fewest tokens for.
  const wins = {};
  for (const s of samples) for (const id of fewestIn(results[s.id], shownIds)) wins[id] = (wins[id] || 0) + 1;

  const setCell = (sampleId, providerId, value) =>
    setResults((prev) => ({ ...prev, [sampleId]: { ...prev[sampleId], [providerId]: value } }));

  function updateKey(id, value) {
    setKeys((k) => ({ ...k, [id]: value }));
    if (keyErrors[id]) setKeyErrors((e) => ({ ...e, [id]: '' }));
  }

  async function handleCount() {
    // 1. Validate keys locally; only providers with a key are used.
    const errors = {};
    for (const p of PROVIDERS) {
      const err = validateKey(p.id, keys[p.id]);
      if (err) errors[p.id] = err;
      else if (keys[p.id].trim() && !models[p.id].trim()) errors[p.id] = 'Please enter a model name.';
    }
    const active = PROVIDERS.filter((p) => keys[p.id].trim()).map((p) => p.id);
    setKeyErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      setBanner({ kind: 'error', text: 'Please fix the highlighted API key(s) first.' });
      return;
    }
    if (active.length === 0) {
      setBanner({ kind: 'error', text: 'Enter at least one API key (Anthropic, Gemini or OpenAI).' });
      return;
    }
    if (samples.length === 0) {
      setBanner({ kind: 'info', text: 'There are no text samples to count. Add one below.' });
      return;
    }

    // 2. Reset and mark everything as loading.
    setBanner(null);
    setIsCounting(true);
    setRanProviders(active);
    setResults(
      Object.fromEntries(samples.map((s) => [s.id, Object.fromEntries(active.map((id) => [id, { status: 'loading' }]))])),
    );

    const controller = new AbortController();
    abortRef.current = controller;
    const authFailed = {}; // providerId -> message; skip that provider's remaining work
    let failures = 0;

    // 3. One task per (sample, provider); a small worker pool runs them.
    const queue = samples.flatMap((s) => active.map((pid) => ({ s, pid })));
    const snapshotKeys = { ...keys };
    const snapshotModels = { ...models };

    async function worker() {
      while (queue.length && !controller.signal.aborted) {
        const { s, pid } = queue.shift();
        if (authFailed[pid]) {
          setCell(s.id, pid, { status: 'error', error: 'Skipped – API key was rejected.' });
          continue;
        }
        try {
          const tokens = await countTokens(pid, {
            apiKey: snapshotKeys[pid],
            model: snapshotModels[pid],
            text: s.text,
            signal: controller.signal,
          });
          setCell(s.id, pid, { status: 'success', tokens });
        } catch (err) {
          failures += 1;
          const isAuth = err.status === 401 || err.status === 403;
          if (isAuth) authFailed[pid] = err.message;
          const message =
            authFailed[pid] && !isAuth
              ? 'Skipped – API key was rejected.'
              : err instanceof TokenCountError
                ? err.message
                : 'Something went wrong.';
          setCell(s.id, pid, { status: 'error', error: message });
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    // 4. Anything still loading was cancelled by the user.
    setResults((prev) => {
      const next = { ...prev };
      for (const s of samples) {
        for (const pid of active) {
          if (next[s.id]?.[pid]?.status === 'loading') {
            next[s.id] = { ...next[s.id], [pid]: { status: 'error', error: 'Cancelled.' } };
          }
        }
      }
      return next;
    });

    const authIds = Object.keys(authFailed);
    if (authIds.length) {
      setKeyErrors((e) => ({ ...e, ...authFailed }));
    }
    if (controller.signal.aborted) {
      setBanner({ kind: 'info', text: 'Counting was cancelled.' });
    } else if (authIds.length) {
      setBanner({ kind: 'error', text: Object.values(authFailed).join(' ') });
    } else if (failures > 0) {
      setBanner({ kind: 'error', text: `${failures} request(s) failed. Hover or read the message in each failed cell.` });
    } else {
      setBanner({
        kind: 'success',
        text: `Counted ${samples.length} samples with ${active.length} provider${active.length > 1 ? 's' : ''}.`,
      });
    }
    abortRef.current = null;
    setIsCounting(false);
  }

  function handleAddCustom(e) {
    e.preventDefault();
    const text = customText.trim();
    if (!text) return;
    setSamples((prev) => [...prev, { id: `custom-${Date.now()}`, label: 'Your text', text }]);
    setCustomText('');
  }

  function handleRemove(id) {
    setSamples((prev) => prev.filter((s) => s.id !== id));
    setResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function clearAllKeys() {
    setKeys(emptyKeys());
    setKeyErrors({});
  }

  const tableProviders = shownProviders.length ? shownProviders : PROVIDERS;
  const anyKey = Object.values(keys).some((k) => k.trim());

  return (
    <div className="page">
      <header className="header">
        <div className="logo" aria-hidden="true">
          #
        </div>
        <div>
          <h1>Multi-LLM Token Counter</h1>
          <p className="subtitle">
            Count tokens with Anthropic's official{' '}
            <a
              href="https://docs.anthropic.com/en/docs/build-with-claude/token-counting"
              target="_blank"
              rel="noreferrer noopener"
            >
              Token Counting API
            </a>{' '}
            and compare the same text across Google Gemini and OpenAI.
          </p>
        </div>
      </header>

      <main className="main">
        <section className="panel" aria-labelledby="keys-heading">
          <div className="panel-head">
            <h2 id="keys-heading" className="panel-title">
              1. API keys &amp; models
            </h2>
            <button type="button" className="link-btn link-strong" onClick={clearAllKeys} disabled={isCounting || !anyKey}>
              Clear all keys
            </button>
          </div>
          <p className="field-hint notice">
            🔒 Keys stay in this tab's memory only. Each one is sent straight to its own provider over HTTPS – never to
            any other server, never logged, never saved, and gone when you refresh. Enter one or more keys; only
            providers with a key are used.
          </p>

          <div className="providers">
            {PROVIDERS.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                apiKey={keys[p.id]}
                model={models[p.id]}
                error={keyErrors[p.id]}
                disabled={isCounting}
                onKeyChange={(v) => updateKey(p.id, v)}
                onModelChange={(v) => setModels((m) => ({ ...m, [p.id]: v }))}
              />
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="samples-heading">
          <div className="panel-head">
            <h2 id="samples-heading" className="panel-title">
              2. Text samples &amp; token counts
            </h2>
            <div className="actions">
              {isCounting ? (
                <>
                  <button type="button" className="btn btn-primary" disabled>
                    <span className="spinner spinner-light" aria-hidden="true" /> Counting…
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => abortRef.current?.abort('user')}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary" onClick={handleCount}>
                  Count Tokens
                </button>
              )}
            </div>
          </div>

          {banner && (
            <div className={`banner banner-${banner.kind}`} role={banner.kind === 'error' ? 'alert' : 'status'}>
              {banner.text}
            </div>
          )}

          {samples.length === 0 ? (
            <p className="empty">No samples yet. Add your own text below.</p>
          ) : (
            <ResultsTable
              samples={samples}
              providers={tableProviders}
              results={results}
              totals={totals}
              totalWinners={totalWinners}
              onRemove={isCounting ? undefined : handleRemove}
            />
          )}

          <form className="custom" onSubmit={handleAddCustom}>
            <label htmlFor="custom-text" className="field-label">
              Add your own text (optional)
            </label>
            <textarea
              id="custom-text"
              className="input textarea"
              rows={3}
              maxLength={MAX_CUSTOM_LENGTH}
              placeholder="Type or paste any text…"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              disabled={isCounting}
            />
            <div className="custom-foot">
              <span className="meta">
                {customText.length}/{MAX_CUSTOM_LENGTH}
              </span>
              <button type="submit" className="btn btn-ghost" disabled={isCounting || !customText.trim()}>
                Add sample
              </button>
            </div>
          </form>
        </section>

        {!isCounting && (
          <Summary providers={shownProviders} totals={totals} wins={wins} sampleCount={samples.length} />
        )}
      </main>

      <footer className="footer">
        Built with React + Vite · Uses each provider's official token-counting endpoint.
      </footer>
    </div>
  );
}
