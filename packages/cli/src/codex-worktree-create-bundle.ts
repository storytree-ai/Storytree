import { fileURLToPath } from "node:url";

import { buildSync } from "esbuild";

let cachedBundle: string | undefined;

/** Build the single-purpose claim-gated worktree bootstrap installed with the trusted actuator. */
export function buildManagedCodexWorktreeCreate(): string {
  if (cachedBundle !== undefined) return cachedBundle;
  const result = buildSync({
    entryPoints: [fileURLToPath(new URL("./codex-worktree-create-entry.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    write: false,
    legalComments: "none",
    logLevel: "silent",
    // `worktree-create.ts` historically re-exports `storyArcStamps` through the CLI's broad
    // `arc.ts`. Bundling that graph also sees executable modules whose source-only entry guards
    // compare their own `import.meta.url` with argv[1]. Give bundled dependencies a deliberately
    // non-file identity so none can mistake the one installed payload for their source entry.
    // The raw banner is not transformed, so createRequire still receives the real payload URL.
    define: { "import.meta.url": JSON.stringify("file:///C:/__storytree_dependencies__/index.mjs") },
    banner: {
      js:
        '#!/usr/bin/env node\nimport { createRequire as __storytreeCreateRequire } from "node:module";\n' +
        'import { fileURLToPath as __storytreeFileURLToPath } from "node:url";\n' +
        'import { dirname as __storytreeDirname } from "node:path";\n' +
        "const require = __storytreeCreateRequire(import.meta.url);\n" +
        "const __filename = __storytreeFileURLToPath(import.meta.url);\n" +
        "const __dirname = __storytreeDirname(__filename);",
    },
  });
  const output = result.outputFiles?.[0]?.text;
  if (!output) throw new Error("esbuild produced no managed worktree-create payload");
  cachedBundle = output;
  return output;
}
