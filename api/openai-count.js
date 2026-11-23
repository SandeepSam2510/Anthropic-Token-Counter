// Vercel Serverless Function: POST /api/openai-count
//
// OpenAI's API does not allow direct browser (CORS) requests that carry an API key,
// so the browser sends the request here and this function forwards it to OpenAI's
// official token-counting endpoint: POST https://api.openai.com/v1/responses/input_tokens
//
// Security:
// - The user's key arrives in the Authorization header and is forwarded ONLY to api.openai.com.
// - It is never stored, cached or logged (there is no console.log in this file).
// - Responses are marked no-store so nothing is cached by browsers or the CDN.

const OPENAI_URL = 'https://api.openai.com/v1/responses/input_tokens';
const MAX_INPUT_CHARS = 20000;

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: { message: 'Method not allowed. Use POST.' } });
  }

  const auth = req.headers.authorization || '';
  if (!/^Bearer sk-\S+$/.test(auth)) {
    return send(res, 401, { error: { message: 'Missing or invalid OpenAI API key.' } });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return send(res, 400, { error: { message: 'Request body must be JSON.' } });
    }
  }
  const model = typeof body?.model === 'string' ? body.model.trim() : '';
  const input = body?.input;
  if (!model || typeof input !== 'string' || !input) {
    return send(res, 400, { error: { message: 'Body must include "model" and "input" strings.' } });
  }
  if (input.length > MAX_INPUT_CHARS) {
    return send(res, 413, { error: { message: 'Text is too long.' } });
  }

  try {
    const upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth },
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await upstream.json().catch(() => ({ error: { message: 'Unexpected response from OpenAI.' } }));
    return send(res, upstream.status, data);
  } catch {
    return send(res, 502, { error: { message: 'Could not reach the OpenAI API.' } });
  }
}
