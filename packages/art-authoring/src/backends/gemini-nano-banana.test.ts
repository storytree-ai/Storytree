// gemini-nano-banana.test.ts — the live image backend is offline-provable with an INJECTED generator
// (no SDK load, no network, no credential): fail-closed on a missing key, the request carries the style
// ref + prompt + 1K image config, the image part is decoded out of the response, and a no-image response
// (a safety block / refusal) is surfaced rather than silently returning empty bytes.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  geminiNanoBananaBackend,
  GEMINI_NANO_BANANA_BACKEND_ID,
  GEMINI_NANO_BANANA_MODEL,
  type GenImplArgs,
  type GenaiLikeResponse,
} from './gemini-nano-banana.js';

const FAKE_PNG_B64 = Buffer.from('\x89PNG\r\n\x1a\n fake-sprite-bytes').toString('base64');

test('geminiNanoBananaBackend exposes the model id and plugs a stable backend id', () => {
  const backend = geminiNanoBananaBackend({ apiKey: 'k' });
  assert.equal(backend.id, GEMINI_NANO_BANANA_BACKEND_ID);
  assert.equal(GEMINI_NANO_BANANA_MODEL, 'gemini-3-pro-image');
  assert.equal(typeof backend.generateImage, 'function');
});

test('fail-closed on a missing key (Claude never enters the credential)', async () => {
  // apiKey: '' forces the falsy path deterministically, independent of the env (so this never calls out
  // even in an author session that has hydrated the key).
  await assert.rejects(
    () => geminiNanoBananaBackend({ apiKey: '' }).generateImage({ prompt: 'x' }),
    /GEMINI_API_KEY .* is not set/,
  );
});

test('sends the style ref + prompt + 1K image config, and decodes the image part out', async () => {
  const calls: GenImplArgs[] = [];
  const genImpl = async (args: GenImplArgs): Promise<GenaiLikeResponse> => {
    calls.push(args);
    return { candidates: [{ content: { parts: [{ text: 'here you go' }, { inlineData: { data: FAKE_PNG_B64, mimeType: 'image/png' } }] } }] };
  };
  const backend = geminiNanoBananaBackend({ apiKey: 'secret', genImpl, imageSize: '1K' });
  const img = await backend.generateImage({
    prompt: 'a cosy cottage',
    styleRef: { data: 'AAAA', mimeType: 'image/png' },
  });

  assert.equal(calls.length, 1);
  const c = calls[0]!;
  assert.equal(c.apiKey, 'secret');
  assert.equal(c.model, GEMINI_NANO_BANANA_MODEL);
  // parts: [styleRef inlineData, prompt text]
  assert.equal(c.parts.length, 2);
  assert.deepEqual(c.parts[0]!.inlineData, { mimeType: 'image/png', data: 'AAAA' });
  assert.equal(c.parts[1]!.text, 'a cosy cottage');
  assert.equal(c.config.imageConfig.imageSize, '1K');
  assert.deepEqual(c.config.responseModalities, ['IMAGE']);

  // response: the inlineData part is decoded to bytes (text part ignored)
  assert.equal(img.mimeType, 'image/png');
  assert.deepEqual(img.data, Buffer.from(FAKE_PNG_B64, 'base64'));
});

test('a no-image response (safety block / refusal) is surfaced, not swallowed', async () => {
  const genImpl = async (): Promise<GenaiLikeResponse> => ({ candidates: [{ content: { parts: [{ text: 'refused' }] }, finishReason: 'SAFETY' }] });
  await assert.rejects(
    () => geminiNanoBananaBackend({ apiKey: 'k', genImpl }).generateImage({ prompt: 'y' }),
    /no image part .*finishReason=SAFETY/,
  );
});
