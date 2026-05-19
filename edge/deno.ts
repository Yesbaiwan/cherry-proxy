const CHERRY_CLIENT_ID = 'cherry-studio';
const CHERRY_SIGNING_SECRET = 'K3RNPFx19hPh1AHr5E1wBEFfi4uYUjoCFuzjDzvS9cAWD8KuKJR8FOClwUpGqRRX.GvI6I5ZrEHcGOWjO5AKhJKGmnwwGfM62XKpWqkjhvzRU2NZIinM77aTGIqhqys0g';
const CHERRY_BASE_URL = 'https://api.cherry-ai.com';
const CHERRY_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' + '(KHTML, like Gecko) CherryStudio/1.9.4 Chrome/146.0.7680.188 ' + 'Electron/41.2.1 Safari/537.36';
const CHERRY_REFERER = 'https://cherry-ai.com';
const CHERRY_TITLE = 'Cherry Studio';

function handleIndex(): Response {
  return new Response(
    JSON.stringify({
      name: 'cherry-openai-proxy',
      object: 'service',
      message: 'OpenAI-compatible proxy for Cherry chat completions.',
      endpoints: ['/v1/chat/completions', '/v1/models', '/models'],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }
  );
}

function isAuthorized(request: Request, expectedApiKey: string | null): boolean {
  if (!expectedApiKey) return true;

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;

  const token = header.slice(7).trim();
  return token === expectedApiKey;
}

interface SignatureParams {
  method: string;
  path: string;
  body?: Record<string, unknown> | null;
}

async function generateSignatureHeaders({ method, path, body = null }: SignatureParams): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyString = body ? JSON.stringify(body) : '';

  const raw = [method.toUpperCase(), path, '', CHERRY_CLIENT_ID, timestamp, bodyString].join('\n');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(CHERRY_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(raw));
  const signature = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    'X-Client-ID': CHERRY_CLIENT_ID,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };
}

function openaiError(message: string, statusCode: number, errorType: string, code: string | null = null): Response {
  const error: Record<string, unknown> = { message, type: errorType };
  if (code) error.code = code;

  return new Response(JSON.stringify({ error }), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function handleModels(): Response {
  return new Response(
    JSON.stringify({
      object: 'list',
      data: [{ id: 'qwen', object: 'model' }],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }
  );
}

async function handleChatCompletions(request: Request): Promise<Response> {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return openaiError('Request body must be a JSON object.', 400, 'invalid_request_error', 'invalid_json');
  }

  if (!payload || typeof payload !== 'object') {
    return openaiError('Request body must be a JSON object.', 400, 'invalid_request_error', 'invalid_json');
  }

  const model = payload.model;
  if (!model || typeof model !== 'string' || !model.trim()) {
    return openaiError("'model' must be a non-empty string.", 400, 'invalid_request_error', 'invalid_model');
  }

  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return openaiError("'messages' must be a non-empty array.", 400, 'invalid_request_error', 'invalid_request');
  }

  const upstreamPayload = { ...payload, model: model.trim() };
  const stream = !!payload.stream;
  const path = '/chat/completions';
  const url = CHERRY_BASE_URL + path;

  const signedHeaders = await generateSignatureHeaders({
    method: 'POST',
    path,
    body: upstreamPayload,
  });

  const upstreamHeaders: Record<string, string> = {
    'Accept': 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'User-Agent': CHERRY_USER_AGENT,
    'X-Title': CHERRY_TITLE,
    'HTTP-Referer': CHERRY_REFERER,
    ...signedHeaders,
  };

  try {
    const upstreamResp = await fetch(url, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamPayload),
    });

    if (!upstreamResp.ok) {
      const errorBody = await upstreamResp.text();
      let errorJson: Record<string, unknown> | null = null;
      try {
        errorJson = JSON.parse(errorBody) as Record<string, unknown>;
      } catch {
        errorJson = null;
      }

      let message = `Cherry upstream returned HTTP ${upstreamResp.status}.`;
      let errorType = 'api_error';
      let code: string | null = null;

      if (errorJson && typeof errorJson === 'object') {
        const err = errorJson.error;
        if (err && typeof err === 'object' && err !== null) {
          const errObj = err as Record<string, unknown>;
          message = (errObj.message as string) || message;
          errorType = (errObj.type as string) || errorType;
          code = (errObj.code as string) || null;
        } else {
          message = (errorJson.message as string) || (errorJson.error as string) || message;
        }
      } else if (errorBody) {
        message = errorBody;
      }

      console.error(`Cherry upstream error status=${upstreamResp.status} type=${errorType} code=${code} message=${message}`);

      if (errorJson) {
        return new Response(JSON.stringify(errorJson), {
          status: upstreamResp.status,
          headers: {
            'Content-Type': upstreamResp.headers.get('content-type') || 'application/json; charset=utf-8',
          },
        });
      }

      return openaiError(message, upstreamResp.status, errorType, code);
    }

    if (stream) {
      return handleStreamResponse(upstreamResp);
    }

    const responseBody = await upstreamResp.json();
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (e) {
    console.error('Upstream request failed:', (e as Error).message);
    return openaiError('Failed to connect to Cherry upstream.', 502, 'api_connection_error', 'upstream_connection_error');
  }
}

function handleStreamResponse(upstreamResp: Response): Response {
  const doneMarker = 'data: [DONE]';
  const reader = upstreamResp.body!.getReader();
  const decoder = new TextDecoder();
  let seenDone = false;
  let tail = '';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;

          const combined = tail + chunk;
          if (combined.includes(doneMarker)) seenDone = true;
          tail = combined.slice(-64);

          controller.enqueue(value);
        }
      } catch (e) {
        console.error('Streaming failed:', (e as Error).message);
      } finally {
        reader.releaseLock();
        if (!seenDone) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;
  const apiKey: string | null = Deno.env.get('OPENAI_API_KEY') || null;

  if (path !== '/') {
    if (!isAuthorized(request, apiKey)) {
      return openaiError('Invalid or missing API key.', 401, 'authentication_error', 'invalid_api_key');
    }
  }

  if (request.method === 'GET' && path === '/') {
    return handleIndex();
  }

  if (request.method === 'GET' && (path === '/v1/models' || path === '/models')) {
    return handleModels();
  }

  if (request.method === 'POST' && path === '/v1/chat/completions') {
    return await handleChatCompletions(request);
  }

  return new Response('Not Found', { status: 404 });
});
