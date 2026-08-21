// A faithful test implementation of the ONE seam the studio's `api` module actually depends on:
// the platform `fetch` (see `api.ts` — every method is `http()` over `fetch`, and `chatStream`
// reads `res.body` directly).
//
// WHY THIS EXISTS (anti-slop-adoption-arc inc-06, `no-module-mocking`). The suites here used to
// replace the whole `../api` module with `vi.mock`, which meant the real client never ran: URL
// construction, query encoding, the `res.ok` branch, the server's `{error}` message extraction,
// the SSE frame splitter, the abort backstops and the `/api/arcs` retry were all substituted away
// by a hand-written object that only had to look plausible to the caller. Standing in one layer
// LOWER — at the transport the browser hands the app — keeps every one of those code paths under
// test and needs no module rewriting at all.
//
// IT FAILS CLOSED, WHICH IS THE WHOLE POINT. An unrouted request REJECTS with a message naming the
// method and URL rather than answering something benign. A double that answers `{}` to anything
// would let a suite keep passing after the code under test started calling a different endpoint —
// the "green check that verified nothing" this lane exists to avoid. If a test wants a route, it
// must say so, and if the app stops calling that route the recorder can say so too.

/** One request the app actually made, as the double observed it. */
export interface RecordedRequest {
  readonly method: string;
  /** The URL exactly as the client built it — query string included. */
  readonly url: string;
  /** The path alone, for matching. */
  readonly path: string;
  readonly query: URLSearchParams;
  /** The parsed JSON request body, or `undefined` when the request carried none. */
  readonly body: unknown;
  readonly headers: Headers;
  readonly signal: AbortSignal | undefined;
}

/**
 * What a route answers. A bare value is serialised as a 200 JSON body (the overwhelmingly common
 * case); returning a `Response` covers everything else — a status, a stream, a malformed body.
 */
export type RouteReply = Response | Promise<Response> | unknown;

export type RouteHandler = (request: RecordedRequest) => RouteReply;

/** `GET`, `POST`, … or `'*'` to answer a path whatever the verb. */
type Method = string;

interface Route {
  readonly method: Method;
  readonly path: string;
  readonly handler: RouteHandler;
}

/** Thrown (as a rejected fetch) when the app asks for a route the test never declared. */
export class UnroutedRequestError extends Error {
  constructor(method: string, url: string, declared: readonly string[]) {
    const known = declared.length === 0 ? '(no routes declared)' : declared.join(', ');
    super(
      `httpDouble: no route for ${method} ${url}. Declared: ${known}. ` +
        'Declare it with .get()/.post()/.route(), or assert the app should not have called it.',
    );
    this.name = 'UnroutedRequestError';
  }
}

/** A JSON error body in the shape `api.http()` unwraps — `{ error }` at a non-OK status. */
export function errorReply(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A `text/event-stream` response carrying `frames` as SSE `data:` lines, as `/api/chat` serves. */
export function sseReply(frames: readonly unknown[]): Response {
  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/**
 * An SSE response whose frames arrive over SEPARATE chunks, so the client's rolling-buffer frame
 * splitter is genuinely exercised rather than handed one pre-assembled string. `chunks` are pushed
 * in order; a chunk may hold a partial frame.
 */
export function sseChunkedReply(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/** A response that never settles until `signal` aborts — for the abort/timeout backstops. */
export function neverReply(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    if (signal === undefined) return;
    if (signal.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
      return;
    }
    signal.addEventListener('abort', () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    });
  });
}

function parseBody(init: RequestInit | undefined): unknown {
  const raw = init?.body;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * The transport double. Build one per test file, declare the routes a suite expects, `install()`
 * it over `globalThis.fetch`, and read `requests` to assert the app actually reached the seam.
 */
export class HttpDouble {
  private readonly routes: Route[] = [];
  private readonly seen: RecordedRequest[] = [];
  private restore: (() => void) | null = null;

  /** Every request the app made, oldest first. */
  get requests(): readonly RecordedRequest[] {
    return this.seen;
  }

  /** The requests that hit one path, in order. */
  requestsTo(path: string): readonly RecordedRequest[] {
    return this.seen.filter((request) => request.path === path);
  }

  /** How many times the app reached one path — the "was the double EXERCISED?" assertion. */
  countTo(path: string): number {
    return this.requestsTo(path).length;
  }

  route(method: Method, path: string, handler: RouteHandler): this {
    // Last declaration wins, so a `beforeEach` default can be overridden inside one test.
    this.routes.unshift({ method, path, handler });
    return this;
  }

  get(path: string, handler: RouteHandler): this {
    return this.route('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): this {
    return this.route('POST', path, handler);
  }

  patch(path: string, handler: RouteHandler): this {
    return this.route('PATCH', path, handler);
  }

  delete(path: string, handler: RouteHandler): this {
    return this.route('DELETE', path, handler);
  }

  /** Answer `path` on any verb — for a route whose method the test does not care about. */
  any(path: string, handler: RouteHandler): this {
    return this.route('*', path, handler);
  }

  /** Forget every recorded request, keeping the declared routes. */
  clearRequests(): void {
    this.seen.length = 0;
  }

  /** Swap `globalThis.fetch` for this double. Returns the restore function; also see `uninstall`. */
  install(): () => void {
    const original = globalThis.fetch;
    const patched: typeof globalThis.fetch = (input, init) => this.handle(input, init);
    globalThis.fetch = patched;
    this.restore = () => {
      globalThis.fetch = original;
    };
    return this.restore;
  }

  uninstall(): void {
    this.restore?.();
    this.restore = null;
  }

  private async handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = urlOf(input);
    // jsdom serves a real origin, but the app builds root-relative URLs; `URL` needs a base.
    const parsed = new URL(url, 'http://studio.test');
    const method = (init?.method ?? 'GET').toUpperCase();
    const request: RecordedRequest = {
      method,
      url,
      path: parsed.pathname,
      query: parsed.searchParams,
      body: parseBody(init),
      headers: new Headers(init?.headers),
      signal: init?.signal ?? undefined,
    };
    this.seen.push(request);

    const match = this.routes.find(
      (route) => route.path === request.path && (route.method === '*' || route.method === method),
    );
    if (match === undefined) {
      throw new UnroutedRequestError(
        method,
        url,
        this.routes.map((route) => `${route.method} ${route.path}`),
      );
    }

    const reply = await match.handler(request);
    if (reply instanceof Response) return reply;
    return new Response(JSON.stringify(reply ?? null), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Build a double, install it, and hand it back. Pair with `double.uninstall()` in `afterEach`
 * (or use the returned restore via `install()` directly when a suite needs finer control).
 */
export function installHttpDouble(): HttpDouble {
  const double = new HttpDouble();
  double.install();
  return double;
}
