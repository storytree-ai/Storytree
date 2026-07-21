// nvidia-trellis.test.ts — contract bsa-nvidia-edify-backend-exports-a-mesh (4), the live vendor leg.
//
// OFFLINE part (always runs): interface conformance + fail-closed + the request/response contract,
// exercised with an INJECTED fetch (no network, no credential). This is the offline stand-in
// story-author's spec names, so the capability's offline green never depends on the credential. The
// request/response shapes asserted here were confirmed against the real hosted endpoint on 2026-07-21
// (a 200 returned a 3.48 MB "glTF" GLB).
//
// LIVE part (credential-gated, SKIPPED unless NVIDIA_API_KEY + RUN_LIVE_TRELLIS are set): the real
// hosted call, run separately and excluded from the offline prove-it-gate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BlockingSubstrateAdapter } from '../adapter.js';
import { nvidiaTrellisBackend, NVIDIA_TRELLIS_BACKEND_ID, DEFAULT_TRELLIS_URL } from './nvidia-trellis.js';

// A minimal fake GLB base64 (real "glTF" magic), enough to prove decode+write without a real asset.
const FAKE_GLB_B64 = Buffer.from('glTF   fake-maquette').toString('base64');

test('bsa-nvidia-edify-backend-exports-a-mesh (offline conformance) — plugs into the swappable seam as a GenerativeBackend', () => {
  const backend = nvidiaTrellisBackend({ apiKey: 'nvapi-test' });
  assert.equal(backend.id, NVIDIA_TRELLIS_BACKEND_ID);
  assert.equal(typeof backend.generate, 'function');
  // it registers in the real adapter exactly like any vendor
  const adapter = new BlockingSubstrateAdapter().register(backend);
  assert.deepEqual([...adapter.backendIds], [NVIDIA_TRELLIS_BACKEND_ID]);
  assert.equal(DEFAULT_TRELLIS_URL, 'https://ai.api.nvidia.com/v1/genai/microsoft/trellis');
});

test('bsa-nvidia-edify-backend-exports-a-mesh (offline conformance) — fail-closed on a missing key (Claude never enters the credential)', async () => {
  // apiKey: '' forces the falsy path deterministically — independent of whether NVIDIA_API_KEY is in the env
  // (so this offline test never makes a real call, even in an author session that has hydrated the key).
  await assert.rejects(() => nvidiaTrellisBackend({ apiKey: '' }).generate({ prompt: 'x' }), /NVIDIA_API_KEY is not set/);
});

test('bsa-nvidia-edify-backend-exports-a-mesh (offline conformance) — the confirmed request/response contract, with an injected fetch', async () => {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
      auth: new Headers(init?.headers).get('authorization'),
    });
    return new Response(JSON.stringify({ artifacts: [{ base64: FAKE_GLB_B64, finishReason: 'SUCCESS', seed: 0 }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const backend = nvidiaTrellisBackend({ apiKey: 'nvapi-secret', outDir: tmpDir(), fetchImpl: fakeFetch });
  const maquette = await backend.generate({ prompt: 'a cosy shingled cottage' });

  // request: the confirmed hosted body — NO `mode` field, cfg_scale present, Bearer nvapi- auth, default URL.
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, DEFAULT_TRELLIS_URL);
  assert.equal(calls[0]!.auth, 'Bearer nvapi-secret');
  assert.deepEqual(calls[0]!.body, {
    prompt: 'a cosy shingled cottage',
    slat_cfg_scale: 3,
    ss_cfg_scale: 7.5,
    slat_sampling_steps: 25,
    ss_sampling_steps: 25,
    seed: 0,
  });
  assert.equal('mode' in calls[0]!.body, false, 'the hosted endpoint takes no `mode` field');

  // response: artifacts[0].base64 -> a written GLB the maquette handle points at, finishReason carried through.
  assert.equal(maquette.backend, NVIDIA_TRELLIS_BACKEND_ID);
  assert.equal(maquette.meshFormat, 'glb');
  assert.ok(maquette.meshRef.endsWith('.glb'));
  assert.equal(maquette.meta?.['finishReason'], 'SUCCESS');
});

test('bsa-nvidia-edify-backend-exports-a-mesh (offline conformance) — image mode sends a data-URL (no prompt/mode); an errored response is surfaced', async () => {
  const okFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { mode?: string; image?: string; prompt?: string };
    assert.equal('mode' in body, false);
    assert.equal('prompt' in body, false, 'image mode omits prompt');
    assert.ok(body.image?.startsWith('data:image/png;base64,'), 'concept image sent as a data URL');
    return new Response(JSON.stringify({ artifacts: [{ base64: FAKE_GLB_B64 }] }), { status: 200 });
  };
  await nvidiaTrellisBackend({
    apiKey: 'nvapi-x',
    outDir: tmpDir(),
    fetchImpl: okFetch,
    readConceptImage: async () => 'data:image/png;base64,AAAA',
  }).generate({ prompt: 'cottage', conceptImage: '/some/concept.png' });

  // a non-2xx response is surfaced, not swallowed
  const errFetch: typeof fetch = async () => new Response('quota exceeded', { status: 429, statusText: 'Too Many Requests' });
  await assert.rejects(
    () => nvidiaTrellisBackend({ apiKey: 'nvapi-x', fetchImpl: errFetch }).generate({ prompt: 'y' }),
    /TRELLIS request failed: 429/,
  );
});

// The LIVE leg — credential-gated, excluded from the offline gate (only runs when explicitly opted in).
const liveEnabled = Boolean(process.env['NVIDIA_API_KEY'] && process.env['RUN_LIVE_TRELLIS']);
test(
  'bsa-nvidia-edify-backend-exports-a-mesh (LIVE) — the real hosted TRELLIS returns a GLB',
  { skip: liveEnabled ? false : 'credential-gated: set NVIDIA_API_KEY + RUN_LIVE_TRELLIS' },
  async () => {
    const maquette = await nvidiaTrellisBackend({ outDir: tmpDir() }).generate({
      prompt: 'a cosy shingled cottage with a steep roof and a stone chimney',
    });
    assert.equal(maquette.meshFormat, 'glb');
    assert.ok(maquette.meshRef.endsWith('.glb'));
    assert.ok(Number(maquette.meta?.['bytes'] ?? '0') > 1000, 'a non-empty GLB was written');
  },
);

function tmpDir(): string {
  return process.env['TMPDIR'] ?? process.env['TEMP'] ?? '/tmp';
}
