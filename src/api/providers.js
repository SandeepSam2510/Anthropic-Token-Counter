// Clients for each provider's OFFICIAL token-counting API.
//
// Security notes:
// - API keys are passed in per call and never stored, cached or logged here.
// - Keys are always sent in request HEADERS (never in the URL), directly from the
//   browser to the provider over HTTPS. No other server ever sees them.

const TIMEOUT_MS = 20000;

/** Error type carrying a user-friendly message and the HTTP status. */
export class TokenCountError extends Error {
  constructor(message, { status = 0, type = 'unknown' } = {}) {
    super(message);
    this.name = 'TokenCountError';
    this.status = status;
    this.type = type;
  }
}

/** Provider definitions: how to label, validate and call each API. */
export const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    color: '#c96442',
    keyPlaceholder: 'sk-ant-...',
    keyPrefix: 'sk-ant-',
    defaultModel: 'claude-sonnet-4-5',
    modelSuggestions: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/en/docs/build-with-claude/token-counting',
    note: 'POST /v1/messages/count_tokens – counts one user message (includes a few tokens of message-format overhead).',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    color: '#3b82f6',
    keyPlaceholder: 'AIza...',
    keyPrefix: 'AIza',
    defaultModel: 'gemini-2.5-flash',
    modelSuggestions: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'],
    keyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/api/tokens',
    note: 'POST models/{model}:countTokens – counts the raw text.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    color: '#10a37f',
    keyPlaceholder: 'sk-...',
    keyPrefix: 'sk-',
    defaultModel: 'gpt-4o',
    modelSuggestions: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-5', 'gpt-5.5'],
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://developers.openai.com/api/docs/guides/token-counting',
    note: 'POST /v1/responses/input_tokens – counts the input as the Responses API would.',
  },
];

export const PROVIDER_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/** Quick client-side sanity check before we hit the network. Returns an error string or null. */
export function validateKey(providerId, key) {
  const p = PROVIDER_BY_ID[providerId];
  const trimmed = (key || '').trim();
  if (!trimmed) return null; // empty = provider not used
  if (/\s/.test(trimmed)) return 'API key must not contain spaces.';
  if (!trimmed.startsWith(p.keyPrefix)) {
    return `That does not look like a ${p.name} key (they start with "${p.keyPrefix}").`;
  }
  if (trimmed.length < 20) return 'API key looks too short – please check it.';
  return null;
}

/** Map an HTTP status + provider error message to a clear message for the user. */
function friendlyMessage(providerName, status, apiMessage) {
  switch (status) {
    case 400:
      // Gemini reports a bad key as 400 API_KEY_INVALID.
      if (/api key/i.test(apiMessage || '')) return `Invalid ${providerName} API key.`;
      return `Bad request: ${apiMessage || 'the request was rejected.'}`;
    case 401:
      return `Invalid ${providerName} API key. Please check it and try again.`;
    case 403:
      return `This ${providerName} key does not have permission for token counting${apiMessage ? `: ${apiMessage}` : '.'}`;
    case 404:
      return `Model not found: ${apiMessage || 'check the model name.'}`;
    case 413:
      return 'The text is too large to count.';
    case 429:
      return `${providerName} rate limit or quota reached. Wait a moment and try again.`;
    case 500:
    case 502:
    case 503:
    case 529:
      return `${providerName} API is having trouble right now. Try again shortly.`;
    default:
      return apiMessage || `Request failed with status ${status}.`;
  }
}

/** Shared fetch with timeout, cancellation and error mapping. */
async function postJson(providerName, url, headers, body, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);
  const onAbort = () => controller.abort('cancelled');
  signal?.addEventListener('abort', onAbort);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    if (controller.signal.aborted) {
      if (controller.signal.reason === 'timeout') {
        throw new TokenCountError('Request timed out. Check your connection and try again.', { type: 'timeout' });
      }
      throw new TokenCountError('Cancelled.', { type: 'cancelled' });
    }
    throw new TokenCountError(`Network error: could not reach the ${providerName} API.`, { type: 'network' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body – handled below.
  }

  if (!response.ok) {
    const apiMessage = data?.error?.message;
    let status = response.status;
    // Normalise Gemini's "400 API key not valid" to an auth error so we stop early.
    if (status === 400 && /api key/i.test(apiMessage || '')) status = 401;
    throw new TokenCountError(friendlyMessage(providerName, response.status, apiMessage), {
      status,
      type: data?.error?.type || data?.error?.status || 'api_error',
    });
  }
  return data;
}

function ensureNumber(value, providerName) {
  if (typeof value !== 'number') {
    throw new TokenCountError(`Unexpected response from ${providerName} (no token count returned).`, {
      type: 'bad_response',
    });
  }
  return value;
}

const COUNTERS = {
  async anthropic({ apiKey, model, text, signal }) {
    const data = await postJson(
      'Anthropic',
      'https://api.anthropic.com/v1/messages/count_tokens',
      {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required by Anthropic for browser (CORS) requests. Safe here because each
        // user supplies their own key at runtime – nothing is bundled into the app.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      { model, messages: [{ role: 'user', content: text }] },
      signal,
    );
    return ensureNumber(data?.input_tokens, 'Anthropic');
  },

  async gemini({ apiKey, model, text, signal }) {
    const data = await postJson(
      'Gemini',
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:countTokens`,
      { 'x-goog-api-key': apiKey }, // header, not ?key= in the URL
      { contents: [{ role: 'user', parts: [{ text }] }] },
      signal,
    );
    return ensureNumber(data?.totalTokens, 'Gemini');
  },

  async openai({ apiKey, model, text, signal }) {
    const data = await postJson(
      'OpenAI',
      'https://api.openai.com/v1/responses/input_tokens',
      { authorization: `Bearer ${apiKey}` },
      { model, input: text },
      signal,
    );
    return ensureNumber(data?.input_tokens, 'OpenAI');
  },
};

/** Count tokens for one piece of text with one provider. Resolves to a number. */
export function countTokens(providerId, { apiKey, model, text, signal }) {
  return COUNTERS[providerId]({ apiKey: apiKey.trim(), model: model.trim(), text, signal });
}
