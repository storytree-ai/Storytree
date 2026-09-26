/**
 * The agent link's commands, built into plain Node scripts: what a harness runs, with no tsx and
 * no node_modules beside it. Each is one ES module that esbuild bundles with everything it
 * imports (the library, pg and zod included).
 *
 * `pnpm --filter @storytree/agent-link build` writes them to packages/agent-link/dist/; tests build
 * them into a directory of their own with buildBins().
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The commands, by the file each is built to. */
const ENTRY_POINTS: Readonly<Record<string, string>> = {
  "storytree-hook": path.join(here, "storytree-hook.ts"),
};

/** Build every command into `outdir`, and return the path of each, by name. */
export async function buildBins(outdir: string): Promise<Record<string, string>> {
  await build({
    entryPoints: ENTRY_POINTS,
    outdir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    logLevel: "warning",
    // pg is CommonJS and requires Node's own modules; an ES module has no `require` of its own.
    banner: { js: 'import { createRequire as __storytreeRequire } from "node:module"; const require = __storytreeRequire(import.meta.url);' },
    external: [
      // Optional parts of pg the commands never use: its native client and its Cloudflare sockets.
      "pg-native",
      "pg-cloudflare",
      "cloudflare:sockets",
      // The library's Cloud SQL path loads this lazily; the agent link only reaches a local Postgres.
      "@google-cloud/cloud-sql-connector",
    ],
  });
  return Object.fromEntries(Object.keys(ENTRY_POINTS).map((name) => [name, path.join(outdir, `${name}.mjs`)]));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const built = await buildBins(path.resolve(here, "..", "..", "dist"));
  for (const file of Object.values(built)) console.log(`built ${path.relative(process.cwd(), file)}`);
}
