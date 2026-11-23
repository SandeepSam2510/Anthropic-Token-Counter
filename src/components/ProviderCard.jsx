import { useId, useState } from 'react';

/**
 * API key + model inputs for one provider.
 * The key lives only in React state (memory) – never in localStorage,
 * sessionStorage, cookies, the URL or the console.
 */
export default function ProviderCard({ provider, apiKey, model, error, disabled, onKeyChange, onModelChange }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const keyId = `${id}-key`;
  const modelId = `${id}-model`;
  const listId = `${id}-models`;
  const errorId = `${id}-error`;
  const active = apiKey.trim().length > 0;

  return (
    <div className={`provider ${active ? 'provider-active' : ''}`} style={{ '--provider': provider.color }}>
      <div className="provider-head">
        <h3>{provider.name}</h3>
        <span className={`pill ${active ? 'pill-on' : ''}`}>{active ? 'Will be used' : 'Optional'}</span>
      </div>

      <label htmlFor={keyId} className="field-label">
        API key
      </label>
      <div className="key-row">
        <input
          id={keyId}
          type={visible ? 'text' : 'password'}
          className={`input mono ${error ? 'input-error' : ''}`}
          placeholder={provider.keyPlaceholder}
          value={apiKey}
          onChange={(e) => onKeyChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={`${visible ? 'Hide' : 'Show'} ${provider.name} API key`}
          disabled={disabled}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}

      <label htmlFor={modelId} className="field-label field-label-gap">
        Model
      </label>
      <input
        id={modelId}
        className="input mono"
        list={listId}
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
      />
      <datalist id={listId}>
        {provider.modelSuggestions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <p className="field-hint">
        {provider.note}{' '}
        <a href={provider.keyUrl} target="_blank" rel="noreferrer noopener">
          Get a key
        </a>{' '}
        ·{' '}
        <a href={provider.docsUrl} target="_blank" rel="noreferrer noopener">
          Docs
        </a>
      </p>
    </div>
  );
}
