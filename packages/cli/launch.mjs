#!/usr/bin/env node
// Direct storytree-CLI launcher (ADR-0162 inc 2 — kill the CLI startup tax).
//
// `pnpm storytree …` used to shell through TWO nested pnpm process layers —
//   `pnpm --filter @storytree/cli storytree --`  →  `tsx src/main.ts`
// — which measured ~1.7 s of pure pnpm overhead on a warm dev box (a warm offline read was
// ~3.8 s, of which the actual node+tsx+import graph is only ~2.0 s). This launcher registers
// the tsx ESM loader IN-PROCESS and imports main.ts directly, so `node packages/cli/launch.mjs`
// pays node's startup once and drops a warm offline call to ~2.0 s. The root `storytree` script
// now points here, so `pnpm storytree` (referenced across docs/hooks) keeps working — it now
// costs one pnpm-run layer instead of two.
//
// Invariants:
//   - Still tsx, NO build step / dist bundle (ADR-0023 / ADR-0115) — this is a .mjs shim, not a
//     compiled binary.
//   - cwd is preserved: main.ts resolves its own paths from import.meta.url, and user-supplied
//     `--file <relative>` args stay relative to the caller's cwd (we never chdir).
//   - process.argv is forwarded verbatim (main.ts reads argv.slice(2)).
import { enableCompileCache } from "node:module";
import path from "node:path";

// Reuse V8 bytecode across invocations — every offline read command otherwise recompiles the
// same library/zod schema graph. Node 24's module compile cache; best-effort, keyed to a
// gitignored dir under this package's node_modules so it never touches the repo surface.
try {
  enableCompileCache(path.join(import.meta.dirname, "node_modules", ".cache", "storytree-v8"));
} catch {
  // Older node, or the cache is disabled by policy — proceed uncached.
}

// Turn OFF tsx's on-disk transform cache before tsx is imported (`the-gate-costs-what-the-change-
// risks-arc` inc 4). tsx caches every transform as one file in a FLAT `os.tmpdir()` directory and
// never evicts; at the 232,254 files / 4.18 GB this box had reached, a cache LOOKUP measured as
// costing more than the transform it saves — 3703 ms CPU against 2078 ms without, median of 7 runs
// of `storytree not-a-real-storytree-command` on a quiet box. ⚠ THAT READING DID NOT REPRODUCE:
// re-measured twice on 2026-08-21 (inc 7) against the SAME directory, the cache arm came back FASTER
// than the disabled one (1192/1361 ms against 1735/1802 ms). The preload stays — it is the state
// that cannot rot — but the figure above is one day's reading, not a property. Both measurements,
// and why the bounded-cache follow-up is closed rather than pending: scripts/tsx-cache-off.mjs.
//
// ORDER IS LOAD-BEARING: tsx reads this variable once, when its module graph is evaluated, so the
// assignment must precede the `tsx/esm/api` import below. Moved after it, this line still runs and
// still reads correctly — it just buys nothing.
process.env["TSX_DISABLE_CACHE"] ??= "1";

// Register the tsx ESM loader from THIS package's tsx (resolved relative to launch.mjs, not the
// caller's cwd) so a fresh worktree that has run `pnpm install` works from any directory. A
// worktree with no node_modules of its own fails here loudly rather than silently borrowing the
// primary checkout's code (CLAUDE.md "Fresh worktree?" — run `pnpm install` in the worktree).
let register;
try {
  ({ register } = await import("tsx/esm/api"));
} catch {
  process.stderr.write(
    "storytree: tsx is not installed in this worktree — run `pnpm install` here first " +
      "(a fresh git worktree has no node_modules of its own; see CLAUDE.md 'Fresh worktree?').\n",
  );
  process.exit(1);
}
register();

const { main } = await import("./src/main.ts");
await main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
