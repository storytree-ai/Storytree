// The transport double's OWN red-green cover (anti-slop-adoption-arc inc-06).
//
// 27 suites replaced `vi.mock('../api', …)` with this double. A helper that silently answered
// anything would convert all 27 into green checks that verify nothing — the exact fault class this
// lane is guarding against — so the properties those suites rely on are asserted here rather than
// assumed:
//
//   1. FAIL-CLOSED. An unrouted request REJECTS. This is what makes a suite go red when the app
//      starts calling an endpoint the test never declared.
//   2. THE REAL CLIENT RUNS. `api.*` is exercised end to end through the double — URL building,
//      query encoding, `res.ok`, the server `{error}` unwrap, the SSE frame splitter. None of
//      these executed under module mocking.
//   3. THE SEAM IS OBSERVABLE. `requests` records what the app actually asked for, so a suite can
//      assert the double was EXERCISED instead of inferring it from a render.

import { afterEach, describe, expect, it } from 'vitest';

import { api } from '../api';
import type { ChatEvent } from '../api';
import {
  HttpDouble,
  UnroutedRequestError,
  errorReply,
  installHttpDouble,
  sseChunkedReply,
} from './httpDouble';

let double: HttpDouble | null = null;

afterEach(() => {
  double?.uninstall();
  double = null;
});

describe('httpDouble — fail-closed', () => {
  it('REJECTS an unrouted request rather than answering something benign', async () => {
    double = installHttpDouble();
    // No routes declared at all.
    await expect(api.listDocs()).rejects.toBeInstanceOf(UnroutedRequestError);
  });

  it('names the method and URL it refused, so the failure is diagnosable', async () => {
    double = installHttpDouble();
    double.get('/api/tree', () => ({ stories: [], builds: [], claims: [] }));

    await expect(api.listDocs()).rejects.toThrow(/no route for GET \/api\/docs/);
    // And it lists what WAS declared, so a path typo is visible in the message.
    await expect(api.listDocs()).rejects.toThrow(/GET \/api\/tree/);
  });

  it('refuses a declared path on the WRONG verb — a method mismatch is not silently served', async () => {
    double = installHttpDouble();
    double.get('/api/comments', () => []);

    await expect(
      api.createComment({ topicKind: 'doc', topicId: 'd1', body: 'hello', author: 'a@b.c' }),
    ).rejects.toBeInstanceOf(UnroutedRequestError);
  });

  it('still RECORDS a request it refused, so "the app called something unexpected" is inspectable', async () => {
    double = installHttpDouble();
    await expect(api.listDocs()).rejects.toBeInstanceOf(UnroutedRequestError);
    expect(double.countTo('/api/docs')).toBe(1);
  });
});

describe('httpDouble — the real api client runs through it', () => {
  it('serves a plain JSON reply and the real client parses it', async () => {
    double = installHttpDouble();
    double.get('/api/docs', () => [{ id: 'adr-1', title: 'One' }]);

    await expect(api.listDocs()).resolves.toEqual([{ id: 'adr-1', title: 'One' }]);
    expect(double.countTo('/api/docs')).toBe(1);
  });

  it('exercises the client’s own query ENCODING — a mocked module never built this URL', async () => {
    double = installHttpDouble();
    double.get('/api/docs/content', (request) => ({
      id: request.query.get('id'),
      title: '',
      body: '',
    }));

    // A raw `&` and a space must survive encoding intact.
    const content = await api.docContent('a b&c');
    expect(content.id).toBe('a b&c');
    expect(double.requestsTo('/api/docs/content')[0]?.url).toContain('id=a%20b%26c');
  });

  it('surfaces the SERVER’S `{error}` message through the real non-OK branch', async () => {
    double = installHttpDouble();
    double.get('/api/tree', () => errorReply('corpus unreadable', 500));

    // `http()` unwraps `{error}` — the branch a module mock replaced with a bare rejection.
    await expect(api.tree()).rejects.toThrow('corpus unreadable');
  });

  it('falls back to status text when the error body carries no `error` field', async () => {
    double = installHttpDouble();
    double.get('/api/tree', () => new Response('null', { status: 503 }));

    await expect(api.tree()).rejects.toThrow(/503/);
  });

  it('reads the POST body the client actually serialised', async () => {
    double = installHttpDouble();
    double.post('/api/comments', (request) => ({ id: 'c1', ...(request.body as object) }));

    await api.createComment({ topicKind: 'doc', topicId: 'd1', body: 'hi', author: 'a@b.c' });
    const sent = double.requestsTo('/api/comments')[0];
    expect(sent?.method).toBe('POST');
    expect(sent?.headers.get('Content-Type')).toBe('application/json');
    expect(sent?.body).toMatchObject({ topicId: 'd1', body: 'hi' });
  });

  it('drives the real SSE frame splitter across CHUNK boundaries', async () => {
    double = installHttpDouble();
    // One frame deliberately split mid-JSON, so a splitter that assumed whole frames per chunk fails.
    double.post('/api/chat', () =>
      sseChunkedReply([
        'data: {"type":"delta","text":"he',
        'llo"}\n\ndata: {"type":"done","proposal":"done!"}\n\n',
      ]),
    );

    const events: ChatEvent[] = [];
    await api.chatStream('hi', (event) => events.push(event));

    expect(events).toEqual([
      { type: 'delta', text: 'hello' },
      { type: 'done', proposal: 'done!' },
    ]);
  });

  it('rejects the chat stream on a non-OK status, as the absent-route case does', async () => {
    double = installHttpDouble();
    double.post('/api/chat', () => new Response('', { status: 404, statusText: 'Not Found' }));

    await expect(api.chatStream('hi', () => {})).rejects.toThrow(/chat unavailable/);
  });
});

describe('httpDouble — route declaration', () => {
  it('lets a later declaration override an earlier default', async () => {
    double = installHttpDouble();
    double.get('/api/tree', () => ({ stories: [], builds: [], claims: [] }));
    double.get('/api/tree', () => errorReply('down', 500));

    await expect(api.tree()).rejects.toThrow('down');
  });

  it('answers any verb on an `any` route', async () => {
    double = installHttpDouble();
    double.any('/api/comments', () => []);

    await expect(api.listComments()).resolves.toEqual([]);
    await expect(api.deleteComment('c1')).resolves.toEqual([]);
  });

  it('clearRequests forgets history but keeps the routes', async () => {
    double = installHttpDouble();
    double.get('/api/docs', () => []);

    await api.listDocs();
    expect(double.countTo('/api/docs')).toBe(1);
    double.clearRequests();
    expect(double.countTo('/api/docs')).toBe(0);
    await api.listDocs();
    expect(double.countTo('/api/docs')).toBe(1);
  });

  it('uninstall puts the original fetch back', () => {
    const before = globalThis.fetch;
    const installed = installHttpDouble();
    expect(globalThis.fetch).not.toBe(before);
    installed.uninstall();
    expect(globalThis.fetch).toBe(before);
  });
});
