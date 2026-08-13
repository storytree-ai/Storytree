import { fileURLToPath } from "node:url";

import { buildSync } from "esbuild";

let cachedBundle: string | undefined;

/**
 * Produce the exact standalone Node payload installed beside the managed hook. Bundling closes the
 * deployment gap between workspace TypeScript exports and the administrator-owned plain-Node
 * runtime: the resulting script has no workspace package lookup at execution time.
 */
export function buildManagedCodexLiveClaimProbe(): string {
  if (cachedBundle !== undefined) return cachedBundle;
  const result = buildSync({
    entryPoints: [fileURLToPath(new URL("./codex-live-claim-probe-entry.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    write: false,
    legalComments: "none",
    logLevel: "silent",
    banner: {
      js:
        '#!/usr/bin/env node\nimport { createRequire as __storytreeCreateRequire } from "node:module";\n' +
        "const require = __storytreeCreateRequire(import.meta.url);",
    },
  });
  const output = result.outputFiles?.[0]?.text;
  if (!output) throw new Error("esbuild produced no managed live-claim probe payload");
  cachedBundle = output;
  return output;
}
