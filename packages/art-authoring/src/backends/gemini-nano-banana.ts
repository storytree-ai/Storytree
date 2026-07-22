// gemini-nano-banana.ts — the LIVE image backend: Nano Banana Pro (`gemini-3-pro-image`, Gemini API via
// `@google/genai`), (style-reference image + text prompt) -> one sprite PNG.
//
// CREDENTIAL-GATED, AUTHOR-TIME ONLY. Like the NVIDIA/TRELLIS backend it is the one place that reaches a
// real vendor; it is NEVER in the deterministic build, the runtime, or the browser bundle. It produces
// the sprite-sheet source PNGs an author commits under `apps/studio/public/art-sheets/<name>/` — the
// COMMITTED image is the source of truth (the model is non-deterministic; there is no seed round-trip).
//
// The key comes from the ENVIRONMENT — the author's tooling hydrates GEMINI_API_KEY (or GOOGLE_API_KEY)
// from GCP Secret Manager (`gemini-api-key`, project `storytree-498613`, reached via ambient ADC) into
// the env; this package never reads Secret Manager and never logs the key. Fail-closed: an absent key
// throws. The `@google/genai` SDK is imported LAZILY inside the default generator, and the network call
// is behind an injectable `genImpl` seam, so the offline conformance test never loads the SDK, never
// touches the network, and never needs a credential.

/** Nano Banana Pro — the Gemini image model id (per `docs/research/grounded-art-concept/`). */
export const GEMINI_NANO_BANANA_MODEL = 'gemini-3-pro-image';
export const GEMINI_NANO_BANANA_BACKEND_ID = 'gemini-nano-banana';

/** An inline image reference (base64 + mime), e.g. the style-reference concept fed to inform palette. */
export interface InlineImage {
  data: string;
  mimeType: string;
}

/** One image request: the composed prompt and an optional style-reference image. */
export interface SpriteImageRequest {
  prompt: string;
  styleRef?: InlineImage;
}

/** The produced sprite image bytes. */
export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
}

/** The request parts the generator sends (a structural subset of the SDK's `Part`). */
export interface GenPart {
  inlineData?: { mimeType: string; data: string };
  text?: string;
}

/** The generation config the generator sends (a structural subset of the SDK's config). */
export interface GenConfig {
  responseModalities: string[];
  imageConfig: { aspectRatio: string; imageSize: string };
}

/** The args handed to the (injectable) generator seam. */
export interface GenImplArgs {
  apiKey: string;
  model: string;
  parts: GenPart[];
  config: GenConfig;
}

/** A structural subset of the SDK's `GenerateContentResponse` — enough to pull the image part out, and
 *  simple enough that the offline test can hand-build a fake without importing the SDK. */
export interface GenaiLikeResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string }; text?: string }> };
    finishReason?: unknown;
  }>;
}

export interface GeminiNanoBananaOptions {
  /** the Gemini API key; hydrated from Secret Manager by the author's tooling. Env: GEMINI_API_KEY /
   *  GOOGLE_API_KEY. */
  apiKey?: string;
  /** override the model id. Default {@link GEMINI_NANO_BANANA_MODEL}. */
  model?: string;
  /** generation aspect ratio. Default '1:1'. */
  aspectRatio?: string;
  /** the largest-dimension image size ('1K' | '2K' | '4K'). Default '1K' (economical). */
  imageSize?: string;
  /** the response modalities. Default ['IMAGE']. */
  responseModalities?: string[];
  /** injected generator, for the offline conformance test (no SDK, no network, no credential). */
  genImpl?: (args: GenImplArgs) => Promise<GenaiLikeResponse>;
}

export interface GeminiNanoBananaBackend {
  readonly id: string;
  generateImage(req: SpriteImageRequest): Promise<GeneratedImage>;
}

/**
 * The live Nano Banana Pro image backend. Fail-closed on a missing credential, so it can be constructed
 * and its behaviour proven offline (with an injected `genImpl`) without ever calling the API.
 */
export function geminiNanoBananaBackend(opts: GeminiNanoBananaOptions = {}): GeminiNanoBananaBackend {
  return {
    id: GEMINI_NANO_BANANA_BACKEND_ID,
    async generateImage(req: SpriteImageRequest): Promise<GeneratedImage> {
      const apiKey = opts.apiKey ?? process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
      if (!apiKey) {
        throw new Error(
          'GEMINI_API_KEY (or GOOGLE_API_KEY) is not set — hydrate the gemini-api-key from Secret ' +
            'Manager (project storytree-498613) into the env; Claude never enters the credential.',
        );
      }
      const model = opts.model ?? GEMINI_NANO_BANANA_MODEL;
      const parts: GenPart[] = [];
      if (req.styleRef) parts.push({ inlineData: { mimeType: req.styleRef.mimeType, data: req.styleRef.data } });
      parts.push({ text: req.prompt });
      const config: GenConfig = {
        responseModalities: opts.responseModalities ?? ['IMAGE'],
        imageConfig: { aspectRatio: opts.aspectRatio ?? '1:1', imageSize: opts.imageSize ?? '1K' },
      };

      const gen = opts.genImpl ?? defaultGen;
      const resp = await gen({ apiKey, model, parts, config });

      const outParts = resp.candidates?.[0]?.content?.parts ?? [];
      for (const p of outParts) {
        const b64 = p.inlineData?.data;
        if (b64) return { data: Buffer.from(b64, 'base64'), mimeType: p.inlineData?.mimeType ?? 'image/png' };
      }
      const finish = resp.candidates?.[0]?.finishReason;
      throw new Error(
        `gemini-nano-banana: response carried no image part (finishReason=${String(finish ?? 'none')})`,
      );
    },
  };
}

/** The default generator: lazily load `@google/genai` (so the offline test never pulls the SDK) and make
 *  the real call. */
async function defaultGen(args: GenImplArgs): Promise<GenaiLikeResponse> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  return ai.models.generateContent({
    model: args.model,
    contents: [{ role: 'user', parts: args.parts }],
    config: args.config,
  });
}
