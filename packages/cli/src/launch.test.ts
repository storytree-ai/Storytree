// Contract for the direct CLI launcher (`packages/cli/launch.mjs`, ADR-0162 inc 2 — kill the
// CLI startup tax). The launcher registers the tsx ESM loader in-process and calls main.ts
// directly instead of shelling through two nested pnpm layers. These are its behavioural
// invariants: it forwards argv verbatim (positionals AND --flags), preserves exit codes, and
// produces the CLI envelope with none of the old nested-pnpm script noise. Each behavioural case
// spawns node once (the launcher's whole job is process orchestration, so a spawn is the honest
// proof); kept to two spawns to stay cheap.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const LAUNCHER = fileURLToPath(new URL("../launch.mjs", import.meta.url));
const ROOT_PKG = fileURLToPath(new URL("../../../package.json", import.meta.url));

function runLauncher(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, [LAUNCHER, ...args], { encoding: "utf8" });
  // No cwd override — the launcher must work from the default cwd and resolve its own paths from
  // import.meta.url (repoRoot is file-relative, not cwd-relative).
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

test("launcher forwards positionals + --flags to main.ts and returns a clean envelope", () => {
  // `adr list --current` runs fully offline (reads docs/decisions from disk). If the launcher
  // didn't forward argv, it wouldn't produce the current-view header — and if `--current` were
  // demoted to a positional (the end-of-options-marker trap), the header wouldn't say "current".
  const { status, stdout } = runLauncher(["adr", "list", "--current"]);
  assert.equal(status, 0, `expected exit 0, got ${status}`);
  assert.match(stdout, /current \(accepted, not superseded\)/, "positionals + --flag forwarded");
  // Regression guard: prove we're on the direct launcher path, not the old double-pnpm path that
  // echoed two lifecycle-script headers into stdout.
  assert.doesNotMatch(stdout, /pnpm --filter/, "must not shell through the nested pnpm layers");
  assert.doesNotMatch(stdout, /storytree@0\.0\.0 storytree/, "no pnpm lifecycle-script header");
});

test("launcher preserves a non-zero exit code on an unknown command", () => {
  const { status } = runLauncher(["not-a-real-storytree-command"]);
  assert.notEqual(status, 0, "an unknown command must exit non-zero");
});

test("root `storytree` script is wired to the launcher", () => {
  // Guards the wiring: the whole speed-up depends on the root script pointing at launch.mjs, and
  // `pnpm storytree` is referenced across docs/hooks, so a revert here would silently regress it.
  const pkg = JSON.parse(readFileSync(ROOT_PKG, "utf8")) as { scripts?: Record<string, string> };
  assert.equal(
    pkg.scripts?.["storytree"],
    "node packages/cli/launch.mjs",
    "root storytree script must invoke the direct launcher",
  );
});

// ---- `--raw <field>` puts the value ALONE on stdout ------------------------------------------
//
// The bare-bytes read (proposal `library-artifact-can-read-one-raw-stored-field`) is the ONE
// deliberate exception to the envelope convention, and the exception only pays off at the process
// boundary: anything else on stdout — a heading, `doctrine:`, `next:`, the delta footer — defeats
// piping it to a file. `run` returning the right bytes does not prove `main` writes them, so this
// spawns the CLI for real. It reads a REAL multi-KB seed field (7 KB of `process` prose), not a
// fixture, because the whole point is that a long field survives.
test("library artifact <id> --raw <field> writes the exact stored bytes and nothing else", () => {
  const SEED = fileURLToPath(new URL("../../../apps/studio/data/knowledge.json", import.meta.url));
  const seeded = JSON.parse(readFileSync(SEED, "utf8")) as Array<Record<string, unknown>>;
  const subject = seeded.find((d) => d["id"] === "merge-ceremony");
  assert.ok(subject, "the seed carries the merge-ceremony process");
  const expected = subject["steps"];
  assert.equal(typeof expected, "string");
  assert.ok((expected as string).length > 2000, "a genuinely multi-KB field, not a fixture");

  const { status, stdout } = runLauncher(["library", "artifact", "merge-ceremony", "--raw", "steps"]);
  assert.equal(status, 0, "a found field exits 0");
  assert.equal(stdout, expected, "stdout IS the stored value — byte for byte, nothing appended");
  // Stated as its own assertions so a regression names what leaked rather than dumping a 7 KB diff.
  assert.doesNotMatch(stdout, /\nnext:\n/, "no next: block");
  assert.doesNotMatch(stdout, /\ndoctrine:\n/, "no doctrine block");
  assert.doesNotMatch(stdout, /^# /, "no artifact heading");
});

test("library artifact <id> --raw <absent field> exits non-zero and writes no bare bytes", () => {
  const { status, stdout } = runLauncher([
    "library",
    "artifact",
    "merge-ceremony",
    "--raw",
    "notAStoredField",
  ]);
  assert.notEqual(status, 0, "an absent field is a miss");
  assert.match(stdout, /notAStoredField/, "the miss names the field it could not read");
});
