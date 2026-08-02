// Bounded author-time Nano Banana spike. This script performs exactly one image-generation call.
// It reads the existing ambient ADC file, uses it only to access the documented Secret Manager key,
// and never prints or persists credentials.

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT_DIR = resolve('docs/research/nano-banana-tree-growth-spike-2026-07-30');
const MODEL = 'gemini-3-pro-image';
const PROMPT = `Create ONE coherent 3 by 3 sprite sheet showing exactly nine chronological growth stages of the SAME fantasy story tree. This is fresh original game art, not a copy of any existing asset.

LAYOUT
- A square 3x3 grid, read left-to-right then top-to-bottom.
- Nine equal invisible cells on one perfectly flat pure white (#FFFFFF) background.
- No grid lines, borders, labels, numbers, text, checkerboard, ground, island, soil tile, cast shadow, or decorations outside the tree.
- Keep generous blank white gutters so adjacent stages never touch.
- In every cell, the tree's root socket is fixed at exactly the same lower-centre position. The root tips and trunk base must not move at all between cells. No camera change, no whole-tree translation, no rotation, and no centre-scale pop.

NINE STAGES
1. tiny rooted sapling with a short ochre stem, two small leaves, and one restrained lime bud;
2. the same root and stem, trunk rising upward;
3. trunk taller, first major branch extending from an already-visible fork;
4. more major branches extending parent-first from visible trunk forks, still sparse foliage;
5. exactly five clearly separated canopy cluster buds appearing only at supported branch tips;
6. those same five clusters partly filling, with branch structure still legible;
7. those same five clusters fuller and denser;
8. nearly mature crown, same five-cluster topology;
9. mature asymmetrical story tree, same root, trunk, branches, and five canopy clusters.

ART DIRECTION
- crisp handcrafted pixel art with deliberately blocky pixels and no painterly blur;
- Storytree-like calm 2.5D low-top-down view: trunk and roots seen slightly from above, not a side-view platformer tree and not a fully top-down icon;
- warm ochre/copper bark with deep umber creases;
- deep forest-green and teal canopy shadows;
- restrained lime proof-bloom accents only, never neon-dominant;
- readable asymmetrical silhouette, selective dark outlines, compact game-sprite shading;
- one consistent warm upper-left light across all nine cells;
- canopy clusters remain visibly separable so a later deterministic runtime rig could reveal one stable cluster per capability.

Hard negatives: no flying leaves, no falling particles, no magical swirls, no duplicate trees inside a cell, no unrelated poses, no moving roots, no changing viewpoint, no image-frame border.`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const genaiModuleUrl = pathToFileURL(
    resolve('packages/art-authoring/node_modules/@google/genai/dist/node/index.mjs'),
  ).href;
  const authModuleUrl = pathToFileURL(
    resolve('node_modules/.pnpm/google-auth-library@10.7.0/node_modules/google-auth-library/build/src/index.js'),
  ).href;
  const [{ GoogleGenAI }, { GoogleAuth }] = await Promise.all([
    import(genaiModuleUrl),
    import(authModuleUrl),
  ]);

  const adc = join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json');
  const auth = new GoogleAuth({
    keyFile: adc,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const secretResponse = await client.request({
    url: 'https://secretmanager.googleapis.com/v1/projects/storytree-498613/secrets/gemini-api-key/versions/latest:access',
    timeout: 30_000,
  });
  const apiKey = Buffer.from(secretResponse.data.payload.data, 'base64').toString('utf8').trim();
  if (!apiKey) throw new Error('Secret Manager returned an empty gemini-api-key');

  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 300_000 } });
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error(
      `Nano Banana response contained no image (finishReason=${String(response.candidates?.[0]?.finishReason ?? 'none')})`,
    );
  }
  const mimeType = imagePart.inlineData.mimeType ?? 'image/png';
  const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
  const rawPath = join(OUT_DIR, `nano-banana-original.${ext}`);
  await writeFile(rawPath, Buffer.from(imagePart.inlineData.data, 'base64'));
  await writeFile(
    join(OUT_DIR, 'generation-metadata.json'),
    `${JSON.stringify(
      {
        model: MODEL,
        sdk: '@google/genai 2.13.0',
        backend: 'Gemini API via repository-documented ADC -> Secret Manager key path',
        imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
        inputImages: [],
        calls: 1,
        startedAt,
        elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        mimeType,
        finishReason: response.candidates?.[0]?.finishReason ?? null,
        prompt: PROMPT,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`generated ${rawPath} (${mimeType}) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error(`Nano Banana generation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
