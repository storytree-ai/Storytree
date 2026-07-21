// nvidia-trellis.ts — the LIVE generative backend (contract 4): NVIDIA-hosted
// microsoft/TRELLIS (build.nvidia.com), text/image -> a GLB mesh maquette.
//
// CREDENTIAL-GATED, AUTHOR-TIME ONLY. This is the one backend that reaches a real vendor
// behind the swappable seam. It is NEVER in the deterministic build, the runtime, or the
// browser bundle. Its produced maquette is thrown away — an author re-authors a checkable
// vector against it (see ../reauthor.ts); the GLB is never parsed into our code or shipped.
//
// Verified END-TO-END against the hosted endpoint on 2026-07-21 (a real 200 returned a
// 3.48 MB GLB with "glTF" magic — request + response confirmed empirically):
//   POST https://ai.api.nvidia.com/v1/genai/microsoft/trellis
//   headers: Authorization: Bearer <nvapi-...> · Accept: application/json · Content-Type: application/json
//   body (text):  { prompt, slat_cfg_scale, ss_cfg_scale, slat_sampling_steps, ss_sampling_steps, seed }
//   body (image): { image: 'data:image/png;base64,<...>', slat_cfg_scale, ss_cfg_scale, slat_sampling_steps, ss_sampling_steps, seed }
//   (the hosted endpoint infers the mode from prompt-vs-image; there is NO `mode` field, unlike the
//    self-hosted /v1/infer container.)
//   response: { artifacts: [ { base64: '<glb-base64>', finishReason, seed } ] } — synchronous
//   (nvcf-status: fulfilled); base64-decode artifacts[0].base64 to the GLB bytes.
//
// NVIDIA pulled Edify's direct API (June 2025 — Edify is Shutterstock/Getty-only now); a direct
// nvapi- key reaches build.nvidia.com models like TRELLIS instead. Because the adapter is
// vendor-swappable (ADR-0225), TRELLIS is a backend, not a rewrite; an Edify-via-Shutterstock/Getty
// backend can be added the same way.
//
// The key comes from the ENVIRONMENT — the author's tooling hydrates NVIDIA_API_KEY from GCP Secret
// Manager (projects/635716509357/secrets/nvidia-api-key). This package never reads Secret Manager and
// never logs the key. Fail-closed: an absent key throws.

import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BlockRequest, GenerativeBackend, Maquette } from '../adapter.js';

export const NVIDIA_TRELLIS_BACKEND_ID = 'nvidia-trellis';

/** The hosted TRELLIS invoke URL (build.nvidia.com/microsoft/trellis "Try API"). Overridable. */
export const DEFAULT_TRELLIS_URL = 'https://ai.api.nvidia.com/v1/genai/microsoft/trellis';

export interface NvidiaTrellisOptions {
  /** override the invoke URL. Env: NVIDIA_TRELLIS_URL. Default: {@link DEFAULT_TRELLIS_URL}. */
  url?: string;
  /** the nvapi- key; hydrated from Secret Manager by the author's tooling. Env: NVIDIA_API_KEY. */
  apiKey?: string;
  /** directory to write the produced .glb into (author-time scratch). Default: the OS temp dir. */
  outDir?: string;
  /** the documented TRELLIS defaults. */
  ssSamplingSteps?: number;
  slatSamplingSteps?: number;
  ssCfgScale?: number;
  slatCfgScale?: number;
  /** generation seed (non-determinism handled structurally: the maquette is thrown away). */
  seed?: number;
  /** attempts before giving up (the hosted free tier returns transient 5xx). Default 3. */
  maxAttempts?: number;
  /** linear backoff base between 5xx retries, ms. Default 3000. */
  retryBackoffMs?: number;
  /** injected fetch, for the offline conformance test. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** injected image->data-URL reader, for the offline conformance test. */
  readConceptImage?: (path: string) => Promise<string>;
}

interface TrellisArtifact {
  base64?: string;
  finishReason?: string;
  seed?: number;
}
interface TrellisResponse {
  artifacts?: TrellisArtifact[];
}

/**
 * The live NVIDIA/TRELLIS backend. Conforms to {@link GenerativeBackend} so it plugs into the
 * vendor-swappable adapter exactly like a fixture. Fail-closed on a missing credential, so it can be
 * constructed (and its interface conformance proven) offline without ever calling the API.
 */
export function nvidiaTrellisBackend(opts: NvidiaTrellisOptions = {}): GenerativeBackend {
  const doFetch = opts.fetchImpl ?? fetch;
  const readImage = opts.readConceptImage ?? defaultReadConceptImage;
  return {
    id: NVIDIA_TRELLIS_BACKEND_ID,
    async generate(req: BlockRequest): Promise<Maquette> {
      const url = opts.url ?? process.env['NVIDIA_TRELLIS_URL'] ?? DEFAULT_TRELLIS_URL;
      const apiKey = opts.apiKey ?? process.env['NVIDIA_API_KEY'];
      if (!apiKey) {
        throw new Error(
          'NVIDIA_API_KEY is not set — hydrate the nvapi- key from Secret Manager ' +
            '(projects/635716509357/secrets/nvidia-api-key) into the env; Claude never enters it.',
        );
      }

      // The confirmed hosted body: no `mode` field; text-vs-image is inferred from the payload.
      const tuning = {
        slat_cfg_scale: opts.slatCfgScale ?? 3,
        ss_cfg_scale: opts.ssCfgScale ?? 7.5,
        slat_sampling_steps: opts.slatSamplingSteps ?? 25,
        ss_sampling_steps: opts.ssSamplingSteps ?? 25,
        seed: opts.seed ?? 0,
      };
      const body = req.conceptImage
        ? { image: await readImage(req.conceptImage), ...tuning }
        : { prompt: req.prompt, ...tuning };

      const maxAttempts = opts.maxAttempts ?? 3;
      let res: Response;
      for (let attempt = 1; ; attempt++) {
        res = await doFetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (res.ok) break;
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        const msg = `TRELLIS request failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`;
        // 5xx are transient on the hosted free tier (load-balanced instances) — retry with backoff;
        // a 4xx is our request's fault — fail fast, no retry.
        if (res.status < 500 || attempt >= maxAttempts) throw new Error(msg);
        await new Promise((r) => setTimeout(r, (opts.retryBackoffMs ?? 3000) * attempt));
      }
      const json = (await res.json()) as TrellisResponse;
      const artifact = json.artifacts?.[0];
      if (!artifact?.base64) {
        throw new Error('TRELLIS response carried no artifacts[0].base64 GLB');
      }
      const glb = Buffer.from(artifact.base64, 'base64');
      const outPath = join(opts.outDir ?? tmpdir(), `trellis-${tuning.seed}-${glb.length}.glb`);
      await writeFile(outPath, glb);
      const meta: Record<string, string> = { bytes: String(glb.length), model: 'microsoft/trellis' };
      if (artifact.finishReason) meta['finishReason'] = artifact.finishReason;
      return {
        backend: NVIDIA_TRELLIS_BACKEND_ID,
        prompt: req.prompt,
        meshFormat: 'glb',
        meshRef: outPath,
        meta,
      };
    },
  };
}

/** Read a local image file into a `data:` URL (author-time; the concept image informs, is never parsed). */
async function defaultReadConceptImage(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(path);
  const lower = path.toLowerCase();
  const ext = lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'jpeg' : 'png';
  return `data:image/${ext};base64,${bytes.toString('base64')}`;
}
