// `pnpm gate:bg` entry point — resolves the bash that can actually run this checkout's scripts,
// then hands off to scripts/gate-bg.sh and exits with THAT script's status.
//
// This file exists for one reason: `"gate:bg": "bash scripts/gate-bg.sh"` named a shell it did not
// pin. On Windows with WSL installed, bare `bash` is the WSL launcher, so the wrapper ran — and ran
// `pnpm gate` inside the Ubuntu distro. It did not fail; it succeeded at the wrong thing. The full
// measurement is in scripts/resolve-bash.mjs.
//
// The status contract is preserved end to end: gate-bg.sh exits with the wrapped command's status
// (via PIPESTATUS[0]), and this launcher exits with gate-bg.sh's. A backgrounded `pnpm gate:bg`
// therefore still reports THE GATE's verdict, which is the whole point of the wrapper.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepoBash } from "./resolve-bash.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "gate-bg.sh");
// The gate must run in the REPO ROOT, not wherever the launcher was invoked from — `pnpm gate` is
// a root script. Derived from this file's own location so it holds however the script is reached.
const repoRoot = path.join(here, "..");

let bash;
try {
  bash = resolveRepoBash();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const res = spawnSync(bash, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: repoRoot,
});

if (res.error) {
  console.error(`gate:bg: failed to start ${bash}: ${res.error.message}`);
  process.exit(1);
}

// A signal-killed child reports status null; surface that as a failure rather than as a green.
process.exit(res.status ?? 1);
