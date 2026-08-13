// Contract for the fresh-worktree pre-provisioner (`packages/cli/provision-worktree.mjs`,
// ADR-0162 inc 3 — BOOT: move the mandatory `pnpm install` off the agent's onboarding tool-call path
// into a SessionStart hook). Its behavioural invariants:
//   - idempotent / detects an already-installed worktree → a no-op fast path (installer NOT called),
//     which is what makes it safe to run at EVERY SessionStart;
//   - a fresh worktree runs the installer, retrying once from the warm store before it gives up;
//   - an install failure surfaces a non-zero exit code — UNLESS `--hook` mode swallows it so a failed
//     install never breaks the session;
//   - a STILL-unprovisioned worktree yields the agent-visible `SessionStart` signal (`hookStdout` /
//     `unprovisionedContext`) so the fix is announced up front, never rediscovered mid-work.
// The installer is injected so the contract is proven WITHOUT spawning a real pnpm (slow, networked,
// environment-dependent); one spawn of the real entry proves the fast-path wiring end-to-end.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  needsProvision,
  needsRelink,
  lockfileAdvanced,
  lockfilePair,
  provisionWorktree,
  exitCode,
  unprovisionedContext,
  hookStdout,
} from "../provision-worktree.mjs";

const SCRIPT = fileURLToPath(new URL("../provision-worktree.mjs", import.meta.url));

/**
 * A throwaway worktree root. `provisioned` seeds pnpm's install-complete marker (.modules.yaml);
 * `lock` seeds the lockfile PAIR this build reads — `wanted` is the tracked `pnpm-lock.yaml` and
 * `current` is pnpm's `node_modules/.pnpm/lock.yaml` copy of whatever the last install ran against.
 * Real files on a real disk: `lockfileAdvanced` is deliberately NOT injectable, so the tests drive the
 * same code the hook runs rather than a stub of it.
 */
function makeTmpRoot(
  provisioned: boolean,
  lock?: { wanted?: string; current?: string },
  opts?: { linked?: boolean },
): string {
  const dir = mkdtempSync(join(tmpdir(), "st-provision-"));
  if (provisioned) {
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    writeFileSync(join(dir, "node_modules", ".modules.yaml"), "hoistPattern:\n  - '*'\n");
    // A genuinely provisioned pnpm root ALSO has `node_modules/.bin`. Modelling only `.modules.yaml`
    // was what hid the unlinked-tree bug from this suite for as long as it existed: every "provisioned"
    // fixture was, in production terms, a broken tree that the assertions called healthy.
    if (opts?.linked !== false) mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  }
  if (lock?.wanted !== undefined) writeFileSync(join(dir, "pnpm-lock.yaml"), lock.wanted);
  if (lock?.current !== undefined) {
    mkdirSync(join(dir, "node_modules", ".pnpm"), { recursive: true });
    writeFileSync(join(dir, "node_modules", ".pnpm", "lock.yaml"), lock.current);
  }
  return dir;
}

/** Two lockfile bodies that differ the way a real advance does: a new importer / dependency entry. */
const LOCK_OLD = "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      zod: 3.23.8\n";
const LOCK_NEW = `${LOCK_OLD}  packages/new-organism:\n    dependencies:\n      zod: 3.23.8\n`;

test("needsProvision: an installed worktree is skipped, a fresh one is flagged", () => {
  const installed = makeTmpRoot(true);
  const fresh = makeTmpRoot(false);
  try {
    assert.equal(needsProvision(installed), false, "node_modules/.modules.yaml ⇒ provisioned");
    assert.equal(needsProvision(fresh), true, "no node_modules ⇒ needs provisioning");
  } finally {
    rmSync(installed, { recursive: true, force: true });
    rmSync(fresh, { recursive: true, force: true });
  }
});

// ── the lockfile-advance detector (the stale-worktree half) ──────────────────────────────────────
// REGRESSION: a worktree provisioned once and then reused went stale as `main` gained packages, and
// the old presence-only marker no-op'd right past it — so the session met a `TS2307` /
// `ERR_MODULE_NOT_FOUND` naming a dependency it never touched. These drive the REAL filesystem.

// The pair is EXPORTED because a second reader (`storytree doctor`'s dependency-currency probe) must
// screen for presence itself — `lockfileAdvanced` fails open, so "false" there does not mean "current".
// Pinning the two paths here is what keeps the two readers asking about the same files.
test("lockfilePair: names the tracked lockfile and pnpm's copy of the one the last install ran against", () => {
  const { wanted, current } = lockfilePair(join("/wt"));
  assert.equal(wanted, join("/wt", "pnpm-lock.yaml"));
  assert.equal(current, join("/wt", "node_modules", ".pnpm", "lock.yaml"));
});

test("lockfileAdvanced: an install against an OLDER lockfile than the checkout now has is stale", () => {
  const root = makeTmpRoot(true, { wanted: LOCK_NEW, current: LOCK_OLD });
  try {
    assert.equal(lockfileAdvanced(root), true, "wanted != current ⇒ the lockfile advanced under it");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lockfileAdvanced: a worktree installed against the current lockfile is NOT stale", () => {
  const root = makeTmpRoot(true, { wanted: LOCK_NEW, current: LOCK_NEW });
  try {
    assert.equal(lockfileAdvanced(root), false, "identical lockfiles ⇒ nothing to do");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lockfileAdvanced: a CRLF-only skew is not an advance (a Windows checkout must not loop)", () => {
  const root = makeTmpRoot(true, { wanted: LOCK_NEW.replace(/\n/g, "\r\n"), current: LOCK_NEW });
  try {
    assert.equal(lockfileAdvanced(root), false, "line endings alone never mean the deps changed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lockfileAdvanced: FAILS OPEN when either lockfile is missing (absence is not staleness)", () => {
  const noCurrent = makeTmpRoot(true, { wanted: LOCK_NEW });
  const noWanted = makeTmpRoot(true, { current: LOCK_NEW });
  const neither = makeTmpRoot(true);
  try {
    assert.equal(lockfileAdvanced(noCurrent), false, "no pnpm snapshot ⇒ nothing to compare against");
    assert.equal(lockfileAdvanced(noWanted), false, "no lockfile ⇒ not a pnpm root");
    assert.equal(lockfileAdvanced(neither), false, "neither present ⇒ never reinstall on a guess");
  } finally {
    for (const d of [noCurrent, noWanted, neither]) rmSync(d, { recursive: true, force: true });
  }
});

// ── the unlinked-tree detector (the third condition) ────────────────────────────────────────────
// REGRESSION: `pnpm install` in a fresh worktree printed "Lockfile is up to date, resolution step is
// skipped" / "Already up to date" and exited 0 while leaving node_modules with NO package links and no
// `.bin` at all. Both existing conditions read healthy — the install COMPLETED (`.modules.yaml` was
// written) and the lockfile had NOT advanced (pnpm's copy matched) — so the hook no-opped forever and
// the session met `'tsx' is not recognized`, which CLAUDE.md documents as the unrelated worktree-root
// RESOLUTION trap. Following that documented remedy cannot help, because the cause is an unlinked tree.

test("needsRelink: an install that completed but linked NOTHING is flagged", () => {
  const unlinked = makeTmpRoot(true, { wanted: LOCK_NEW, current: LOCK_NEW }, { linked: false });
  const healthy = makeTmpRoot(true, { wanted: LOCK_NEW, current: LOCK_NEW });
  try {
    assert.equal(needsRelink(unlinked), true, ".modules.yaml present but no .bin ⇒ nothing was linked");
    assert.equal(needsRelink(healthy), false, "a linked tree is left alone");
  } finally {
    for (const d of [unlinked, healthy]) rmSync(d, { recursive: true, force: true });
  }
});

test("needsRelink: a FRESH worktree is not its business (needsProvision already forces the install)", () => {
  const fresh = makeTmpRoot(false);
  try {
    assert.equal(needsRelink(fresh), false, "no completed install ⇒ this predicate stays silent");
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
});

test("provisionWorktree: an UNLINKED worktree reinstalls though both older conditions read healthy", () => {
  const root = makeTmpRoot(true, { wanted: LOCK_NEW, current: LOCK_NEW }, { linked: false });
  try {
    assert.equal(needsProvision(root), false, "precondition: the install DID complete");
    assert.equal(lockfileAdvanced(root), false, "precondition: the lockfile did NOT advance");
    const calls: string[] = [];
    const logs: string[] = [];
    const res = provisionWorktree({
      root,
      log: (m) => logs.push(m),
      install: (r) => {
        calls.push(r);
        return { ok: true, code: 0 };
      },
    });
    assert.deepEqual(calls, [root], "the unlinked worktree is reinstalled rather than no-opped past");
    assert.deepEqual(res, { provisioned: true, ok: true, code: 0, reason: "relinked" });
    assert.match(logs.join("\n"), /UNLINKED/, "the log names the condition it actually hit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unprovisionedContext: the UNLINKED wording does not claim the install failed to complete", () => {
  const root = join("/wt", "cli-ad9712");
  const ctx: string = JSON.parse(unprovisionedContext(root, "unlinked")).hookSpecificOutput.additionalContext;
  assert.match(ctx, /linked no packages|no package links/i, "it names the real condition");
  assert.match(ctx, /tsx' is not recognized|is not recognized/i, "it names the symptom the session will meet");
  assert.doesNotMatch(
    ctx,
    /did not complete/,
    "the install DID complete and reported success — saying otherwise sends the session to the wrong remedy",
  );
});

test("hookStdout: a relink failure emits the UNLINKED context, not the never-provisioned one", () => {
  const root = join("/wt", "cli-ad9712");
  assert.equal(hookStdout({ ok: false, reason: "relink-failed" }, root, true), unprovisionedContext(root, "unlinked"));
});

test("provisionWorktree: a STALE worktree reinstalls instead of no-opping, and says so", () => {
  const root = makeTmpRoot(true, { wanted: LOCK_NEW, current: LOCK_OLD });
  try {
    const calls: string[] = [];
    const logs: string[] = [];
    const res = provisionWorktree({
      root,
      log: (m) => logs.push(m),
      install: (r) => {
        calls.push(r);
        return { ok: true, code: 0 };
      },
    });
    assert.deepEqual(calls, [root], "the stale worktree is reinstalled at its own root");
    assert.deepEqual(res, { provisioned: true, ok: true, code: 0, reason: "refreshed" });
    assert.match(logs.join("\n"), /STALE/, "the log names the condition, not a generic 'fresh worktree'");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// COUNTERWEIGHT — this must stay green, and it is what a vacuous "just always install" fix would
// break. It PASSED before the fix (the presence marker already no-op'd here), so it can only fail by
// over-reach, never by the regression above going green.
test("provisionWorktree: a provisioned worktree on the CURRENT lockfile is still a no-op", () => {
  const root = makeTmpRoot(true, { wanted: LOCK_NEW, current: LOCK_NEW });
  try {
    let called = false;
    const res = provisionWorktree({
      root,
      install: () => {
        called = true;
        return { ok: true, code: 0 };
      },
    });
    assert.equal(called, false, "an up-to-date worktree must still pay nothing at SessionStart");
    assert.equal(res.reason, "already-provisioned");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provisionWorktree: a failed REFRESH retries, then reports refresh-failed (not install-failed)", () => {
  const root = makeTmpRoot(true, { wanted: LOCK_NEW, current: LOCK_OLD });
  try {
    let calls = 0;
    const res = provisionWorktree({
      root,
      install: () => {
        calls += 1;
        return { ok: false, code: 5 };
      },
    });
    assert.equal(calls, 2, "the stale path retries from the warm store exactly like the fresh one");
    assert.equal(res.ok, false);
    assert.equal(res.code, 5);
    assert.equal(res.reason, "refresh-failed", "the reason distinguishes stale from never-provisioned");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provisionWorktree: an already-installed worktree is a no-op fast path (installer not called)", () => {
  const root = makeTmpRoot(true);
  try {
    let called = false;
    const res = provisionWorktree({
      root,
      install: () => {
        called = true;
        return { ok: true, code: 0 };
      },
    });
    assert.equal(called, false, "must not install a provisioned worktree");
    assert.deepEqual(res, { provisioned: false, ok: true, code: 0, reason: "already-provisioned" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provisionWorktree: a fresh worktree runs the installer once, at the worktree root", () => {
  const root = makeTmpRoot(false);
  try {
    const calls: string[] = [];
    const res = provisionWorktree({
      root,
      install: (r) => {
        calls.push(r);
        return { ok: true, code: 0 };
      },
    });
    assert.deepEqual(calls, [root], "installer called exactly once, at the worktree root");
    assert.equal(res.provisioned, true);
    assert.equal(res.ok, true);
    assert.equal(res.code, 0);
    assert.equal(res.reason, "installed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provisionWorktree: a persistently failed install retries then surfaces its non-zero exit code", () => {
  const root = makeTmpRoot(false);
  try {
    let calls = 0;
    const res = provisionWorktree({
      root,
      install: () => {
        calls += 1;
        return { ok: false, code: 7 };
      },
    });
    assert.equal(calls, 2, "default retries=1 ⇒ the installer is attempted twice before giving up");
    assert.equal(res.ok, false);
    assert.equal(res.code, 7, "the installer's failure code is propagated");
    assert.equal(res.reason, "install-failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provisionWorktree: a transient failure is healed by the retry from the warm store", () => {
  const root = makeTmpRoot(false);
  try {
    let calls = 0;
    const res = provisionWorktree({
      root,
      install: () => {
        calls += 1;
        return calls === 1 ? { ok: false, code: 1 } : { ok: true, code: 0 };
      },
    });
    assert.equal(calls, 2, "first attempt fails, the retry succeeds");
    assert.deepEqual(res, { provisioned: true, ok: true, code: 0, reason: "installed" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provisionWorktree: retries=0 disables the retry (single attempt)", () => {
  const root = makeTmpRoot(false);
  try {
    let calls = 0;
    const res = provisionWorktree({
      root,
      retries: 0,
      install: () => {
        calls += 1;
        return { ok: false, code: 3 };
      },
    });
    assert.equal(calls, 1, "retries=0 ⇒ exactly one attempt");
    assert.equal(res.reason, "install-failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unprovisionedContext: a valid SessionStart additionalContext payload naming the root + fix", () => {
  const root = "/tmp/some-worktree-root";
  const parsed = JSON.parse(unprovisionedContext(root));
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  const ctx: string = parsed.hookSpecificOutput.additionalContext;
  assert.match(ctx, /pnpm install/, "tells the agent the one-step fix");
  assert.ok(ctx.includes(root), "names the worktree root so install runs in the right place");
});

test("unprovisionedContext: the STALE wording names the real cause, not the never-provisioned one", () => {
  const root = "/tmp/some-worktree-root";
  const ctx: string = JSON.parse(unprovisionedContext(root, "stale")).hookSpecificOutput.additionalContext;
  assert.match(ctx, /STALE/, "names the condition outright");
  assert.match(ctx, /older `pnpm-lock\.yaml`/i, "says WHY: installed against an older lockfile");
  assert.match(ctx, /pnpm install/, "still gives the one-step fix");
  assert.ok(ctx.includes(root), "names the worktree root");
  // The whole point of the distinction: the misleading symptoms are named up front, so the agent does
  // not spend the session debugging the dependency the error blamed.
  for (const symptom of ["ERR_MODULE_NOT_FOUND", "TS2307", "tsc is not recognized"]) {
    assert.ok(ctx.includes(symptom), `warns about the opaque symptom ${symptom}`);
  }
  const freshCtx: string = JSON.parse(unprovisionedContext(root)).hookSpecificOutput.additionalContext;
  assert.doesNotMatch(freshCtx, /STALE/, "the fresh-worktree wording is unchanged in kind");
  assert.notEqual(ctx, freshCtx, "the two conditions do not share one generic message");
});

test("hookStdout: emits the signal only on a hook-mode failure, silent otherwise", () => {
  const root = "/tmp/wt";
  assert.equal(hookStdout({ ok: true }, root, true), "", "healthy provision ⇒ no context noise");
  assert.equal(hookStdout({ ok: false }, root, false), "", "non-hook failure ⇒ no stdout signal");
  const out = hookStdout({ ok: false }, root, true);
  assert.notEqual(out, "", "hook-mode failure ⇒ emits the agent signal");
  assert.equal(out, unprovisionedContext(root), "the emitted payload IS the unprovisioned context");
});

test("hookStdout: a refresh-failed result selects the stale wording", () => {
  const root = "/tmp/wt";
  assert.equal(
    hookStdout({ ok: false, reason: "refresh-failed" }, root, true),
    unprovisionedContext(root, "stale"),
    "the stale failure carries the stale message",
  );
  assert.equal(
    hookStdout({ ok: false, reason: "install-failed" }, root, true),
    unprovisionedContext(root, "fresh"),
    "the fresh failure keeps the never-provisioned message",
  );
});

test("exitCode: --hook swallows failure (never breaks the session); standalone propagates it", () => {
  assert.equal(exitCode({ code: 1 }, true), 0, "hook mode exits 0 even on failure");
  assert.equal(exitCode({ code: 7 }, false), 7, "standalone propagates the real code");
  assert.equal(exitCode({ code: 0 }, false), 0);
});

test("entry: `node provision-worktree.mjs --root <provisioned>` fast-paths to exit 0 without installing", () => {
  const root = makeTmpRoot(true);
  try {
    const res = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
    assert.equal(res.status, 0, `a provisioned root must exit 0; stderr: ${res.stderr}`);
    assert.doesNotMatch(res.stderr ?? "", /running pnpm install/, "must not attempt install on a provisioned root");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// End-to-end through the REAL entry (no injected installer): a worktree carrying matching lockfiles —
// the shape of every healthy reused worktree — must still take the silent no-op path. This is the
// spawn-level counterweight: it is what goes red if the new check ever misreads a current worktree as
// stale and starts running a real `pnpm install` at every SessionStart.
test("entry: a provisioned root on the CURRENT lockfile still fast-paths, silently", () => {
  const root = makeTmpRoot(true, { wanted: LOCK_NEW, current: LOCK_NEW });
  try {
    const res = spawnSync(process.execPath, [SCRIPT, "--root", root, "--hook"], { encoding: "utf8" });
    assert.equal(res.status, 0, `a current root must exit 0; stderr: ${res.stderr}`);
    assert.doesNotMatch(res.stderr ?? "", /running pnpm install/, "no install on an up-to-date worktree");
    assert.equal(res.stdout ?? "", "", "a healthy worktree emits NO agent context");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
