import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  EXIT_CODE_COLLAPSING_INVOCATION,
  EXPENSIVE_STEPS,
  GATE_AUTHORITY_PHRASES,
  GATE_PLAN,
  GATE_VOICE_EXEMPTIONS,
  GATE_VOICE_SCAN_ROOTS,
  type GateStep,
  LOAD_BEARING_MARKER,
  NON_GATE_CHECK_SCRIPTS,
  PRE_EXPENSIVE_CHECKS,
  RETIRED_CHECKS,
  RETIRED_TEST_COMPANIONS,
  SHARED_ENVIRONMENT_CHECKS,
  SKIP_CAPABLE_CHECKS,
  UNWIRED_MARKER,
  companionFileFor,
  evaluateGateOrder,
  findGateVoice,
  firstExpensiveIndex,
  gateVoiceKey,
  lastExpensiveIndex,
} from "./gate-order.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliSrc = fileURLToPath(new URL(".", import.meta.url));

/** The REAL root scripts — a missing `gate` script is a failure, never a skip. */
function rootScripts(): Record<string, string> {
  const raw: unknown = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const scripts = (raw as { scripts?: Record<string, string> }).scripts;
  assert.ok(scripts !== undefined, "the root package.json must declare scripts");
  assert.equal(typeof scripts["gate"], "string", "the root package.json must declare a `gate` script");
  return scripts;
}

/** Terse fixture builder for the evaluator's unit tests. */
function chain(spec: string): GateStep[] {
  return spec
    .split("&&")
    .map((raw) => raw.trim())
    .filter((command) => command !== "")
    .map((command) => {
      const name = /\bpnpm\s+(check:[\w-]+)/.exec(command)?.[1];
      return { command, check: name ?? undefined };
    });
}

// ── the walls ────────────────────────────────────────────────────────────────

test("firstExpensiveIndex finds the earliest minutes-cost leg, lastExpensiveIndex the latest", () => {
  const steps = chain("pnpm check:boundaries && pnpm -r typecheck && pnpm -r test && pnpm check:late");
  assert.equal(firstExpensiveIndex(steps), 1);
  assert.equal(lastExpensiveIndex(steps), 2);
});

// ── axis 1: cheap-first ──────────────────────────────────────────────────────

test("evaluateGateOrder passes a plan whose cheap checks all precede the expensive legs", () => {
  const v = evaluateGateOrder({
    steps: chain("pnpm check:boundaries && pnpm -r typecheck && pnpm -r test && pnpm check:late"),
    earlyChecks: new Set(["check:boundaries"]),
  });
  assert.equal(v.verdict, "ok");
  assert.deepEqual(v.misordered, []);
});

test("evaluateGateOrder FAILS a cheap check stranded behind the expensive legs, naming the fix", () => {
  const v = evaluateGateOrder({
    steps: chain("pnpm check:boundaries && pnpm -r typecheck && pnpm -r test && pnpm check:agents"),
    earlyChecks: new Set(["check:boundaries", "check:agents"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.misordered, ["check:agents"]);
  assert.match(v.message, /run AFTER/);
  assert.match(v.message, /GATE_PLAN/);
});

// ── axis 2: the session's own work before the shared environment ─────────────

test("evaluateGateOrder FAILS a shared-environment check that runs before the expensive legs", () => {
  // The axis-2 regression: a check that can red on a sibling's state, ahead of the session's own answer.
  const v = evaluateGateOrder({
    steps: chain("pnpm check:verification-decay && pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set<string>(),
    lateChecks: new Set(["check:verification-decay"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.premature, ["check:verification-decay"]);
  assert.match(v.message, /may be a sibling session's/);
});

test("evaluateGateOrder measures axis 2 against the LAST expensive leg, not the first", () => {
  // Between typecheck and test is still ahead of the session's own answer.
  const v = evaluateGateOrder({
    steps: chain("pnpm -r typecheck && pnpm check:verification-decay && pnpm -r test"),
    earlyChecks: new Set<string>(),
    lateChecks: new Set(["check:verification-decay"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.premature, ["check:verification-decay"]);
});

// ── fail-closed ──────────────────────────────────────────────────────────────

test("evaluateGateOrder fails CLOSED on a plan with no recognised expensive leg", () => {
  // "nothing is on the wrong side of the wall" is vacuously true when the wall was never found.
  const v = evaluateGateOrder({
    steps: chain("pnpm check:boundaries && pnpm check:verification-decay"),
    earlyChecks: new Set(["check:boundaries"]),
  });
  assert.equal(v.verdict, "fail");
  assert.match(v.message, /expensive legs were not recognised/);
});

test("evaluateGateOrder fails CLOSED on a declared check the plan no longer runs — either set", () => {
  const early = evaluateGateOrder({
    steps: chain("pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set(["check:boundaries"]),
  });
  assert.equal(early.verdict, "fail");
  assert.deepEqual(early.missing, ["check:boundaries"]);
  assert.match(early.message, /not in the plan at all/);

  const late = evaluateGateOrder({
    steps: chain("pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set<string>(),
    lateChecks: new Set(["check:verification-decay"]),
  });
  assert.equal(late.verdict, "fail");
  assert.deepEqual(late.missing, ["check:verification-decay"]);
});

// ── the REAL plan ────────────────────────────────────────────────────────────

test("the REAL gate plan honours BOTH ordering axes", () => {
  const v = evaluateGateOrder({
    steps: GATE_PLAN,
    earlyChecks: PRE_EXPENSIVE_CHECKS,
    lateChecks: SHARED_ENVIRONMENT_CHECKS,
  });
  assert.equal(v.verdict, "ok", v.message);
});

test("the REAL gate plan still runs both expensive legs (the wall the axes are measured against)", () => {
  for (const leg of EXPENSIVE_STEPS) {
    assert.ok(
      GATE_PLAN.some((s) => s.command.includes(leg)),
      `the gate plan must still run \`${leg}\``,
    );
  }
});

test("the REAL gate plan is exactly the nine audited survivors in their declared order", () => {
  assert.deepEqual(
    GATE_PLAN.map((step) => step.command),
    [
      "pnpm check:boundaries",
      "pnpm check:mirror-conformance",
      "pnpm check:web-grounding",
      "pnpm check:web-engine",
      "pnpm -r --no-bail typecheck",
      "pnpm -r --no-bail test",
      "pnpm check:guidance",
      "pnpm check:agents",
      "pnpm check:verification-decay",
    ],
  );
});

test("the three live/shared checks are pinned LATE", () => {
  for (const check of ["check:guidance", "check:agents", "check:verification-decay"]) {
    assert.ok(SHARED_ENVIRONMENT_CHECKS.has(check));
    assert.ok(!PRE_EXPENSIVE_CHECKS.has(check));
    const at = GATE_PLAN.findIndex((s) => s.check === check);
    assert.notEqual(at, -1, `the gate plan must still run ${check}`);
    assert.ok(at > lastExpensiveIndex(GATE_PLAN), `${check} must run after the expensive legs`);
  }
});

test("the two ordering sets are disjoint — no check may be pinned both early and late", () => {
  const both = [...PRE_EXPENSIVE_CHECKS].filter((n) => SHARED_ENVIRONMENT_CHECKS.has(n));
  assert.deepEqual(both, [], "a check pinned to both sides makes the invariant unsatisfiable");
});

test("every step in the plan carries a subject, a cost, and a stated reason", () => {
  for (const step of GATE_PLAN) {
    assert.ok(step.why.length > 0, `${step.command} must record WHY it is ${step.subject}`);
    assert.equal(
      step.cost,
      EXPENSIVE_STEPS.some((leg) => step.command.includes(leg)) ? "minutes" : "seconds",
      `${step.command}: declared cost must match whether it is an expensive leg`,
    );
  }
});

test("the plan's subject classification agrees with the two pinned sets", () => {
  for (const step of GATE_PLAN) {
    if (step.check === undefined) continue;
    if (SHARED_ENVIRONMENT_CHECKS.has(step.check)) {
      assert.equal(step.subject, "shared-environment", `${step.check} is pinned late`);
    } else if (PRE_EXPENSIVE_CHECKS.has(step.check)) {
      assert.equal(step.subject, "own-work", `${step.check} is pinned cheap-first`);
    }
  }
});

// ── the plan vs. the real package.json ───────────────────────────────────────

test("every step the plan names is a script the root package.json actually declares", () => {
  const scripts = rootScripts();
  for (const step of GATE_PLAN) {
    if (step.check === undefined) continue;
    assert.ok(
      Object.hasOwn(scripts, step.check),
      `GATE_PLAN runs \`${step.check}\`, which the root package.json does not declare`,
    );
  }
});

test("every check:* script the repo declares is IN the plan, or excluded with a reason", () => {
  // THE LOAD-BEARING ONE. Without it, adding a check to package.json and forgetting the plan makes
  // the gate silently never run it — a new instance of the exact defect class this arc guards
  // (`asset:unrun-check-is-unverified-not-refuted`). A silent skip must be impossible to introduce.
  const planned = new Set(GATE_PLAN.map((s) => s.check).filter((c) => c !== undefined));
  const unplanned = Object.keys(rootScripts())
    .filter((name) => name.startsWith("check:"))
    .filter((name) => !planned.has(name) && !NON_GATE_CHECK_SCRIPTS.has(name));

  assert.deepEqual(
    unplanned,
    [],
    `these check:* scripts exist but the gate never runs them: ${unplanned.join(", ")}. ` +
      `Add each to GATE_PLAN, or to NON_GATE_CHECK_SCRIPTS with the reason it is deliberately out.`,
  );
});

test("every deliberate exclusion still names a real script — a stale exemption is removed, not kept", () => {
  const scripts = rootScripts();
  for (const [name, reason] of NON_GATE_CHECK_SCRIPTS) {
    assert.ok(Object.hasOwn(scripts, name), `NON_GATE_CHECK_SCRIPTS excludes \`${name}\`, which no longer exists`);
    assert.ok(reason.length > 0, `${name} must record why it is out of the gate`);
  }
});

// ── the skip protocol vs. the invocation form that silently destroys it ──────

test("every skip-capable check is invoked through a form that PRESERVES its exit code", () => {
  // MEASURED 2026-08-08: `pnpm --filter <pkg> exec node -e "process.exit(3)"` exits 1, while
  // `pnpm -C <dir> exec …` exits 3. pnpm's recursive exec normalises any non-zero child code, so a
  // skip-capable check on that form would deliver its declared SKIP to the runner as a FAILURE and
  // red the gate for every checkout that legitimately opts out. Harmless for the other checks (they
  // only ever mean pass or fail); silently destructive for these.
  const scripts = rootScripts();
  for (const [name] of SKIP_CAPABLE_CHECKS) {
    const script = scripts[name] ?? "";
    assert.ok(script.length > 0, `SKIP_CAPABLE_CHECKS names \`${name}\`, which no longer exists`);
    assert.ok(
      !script.includes(EXIT_CODE_COLLAPSING_INVOCATION),
      `\`${name}\` may declare a SKIP, but is invoked via \`${EXIT_CODE_COLLAPSING_INVOCATION}\`, ` +
        `which collapses its exit code to 1 — the skip would arrive as a FAILURE. ` +
        `Use \`pnpm -C <dir> exec …\`. Script: ${script}`,
    );
  }
});

test("a skip-capable check is a step the gate actually runs, and records why it may opt out", () => {
  const planned = new Set(GATE_PLAN.map((s) => s.check).filter((c) => c !== undefined));
  for (const [name, condition] of SKIP_CAPABLE_CHECKS) {
    assert.ok(planned.has(name), `${name} is declared skip-capable but is not a gate step`);
    assert.ok(condition.length > 0, `${name} must record the condition under which it verifies nothing`);
  }
});

test("the root `gate` script invokes the runner, so GATE_PLAN is what actually runs", () => {
  // The plan is only the source of truth while the script points at the runner that walks it. If the
  // `gate` script is ever reverted to an `&&` chain, every assertion above becomes decoration.
  assert.match(rootScripts()["gate"] ?? "", /gate-run\.ts/);
});

// ── the tombstone vs. the real source tree (ADR-0311 D2/D5) ──────────────────
//
// The three tests above guard a check that EXISTS but never runs. These guard the mirror image: a
// check that RUNS NOWHERE but still exists. ADR-0311 kept the retired implementations deliberately
// and named the cost in its Consequences — "discoverable code whose unwired status must not be
// mistaken for a forgotten gate rung" — without paying it. These pay it, mechanically, so the
// status cannot rot back into prose.

/** Every distinct file the tombstone claims survived, deduped across checks that shared one. */
function retiredSources(): string[] {
  return [...new Set([...RETIRED_CHECKS.values()].flatMap((entry) => entry.sources))].sort();
}

/** The `src/<name>.ts` entrypoints the root `check:*` scripts actually invoke. */
function wiredEntrypoints(): Set<string> {
  const wired = new Set<string>();
  for (const [name, command] of Object.entries(rootScripts())) {
    if (!name.startsWith("check:")) continue;
    for (const [, file] of command.matchAll(/\bsrc\/([\w.-]+\.ts)\b/g)) {
      if (file !== undefined) wired.add(file);
    }
  }
  return wired;
}

test("no retired check has quietly returned as a root script", () => {
  // A retired name reappearing in package.json is either a deliberate re-wiring — which ADR-0311 D5
  // says needs fresh production-catch evidence and an ADR, not just a script line — or an
  // accident. Either way the tombstone above is then lying, and this is where that surfaces.
  const resurrected = [...RETIRED_CHECKS.keys()].filter((name) => Object.hasOwn(rootScripts(), name));

  assert.deepEqual(
    resurrected,
    [],
    `these checks are declared RETIRED but the root package.json declares them: ${resurrected.join(", ")}. ` +
      "Re-wiring a retired rung needs new evidence and an ADR (ADR-0311 D5); if that happened, remove " +
      "it from RETIRED_CHECKS, add it to GATE_PLAN, and drop its UNWIRED banner.",
  );
});

test("every surviving retired source exists and carries the UNWIRED banner", () => {
  // THE LOAD-BEARING ONE. This is what stops a tested, confident-looking, wired-to-nothing fence
  // from reading as enforcement — the defect that put a false "enforced rather than merely advised"
  // claim into the `test-creation-principles` artifact a day after `check:test-timing` was retired.
  const unmarked: string[] = [];
  const missing: string[] = [];

  for (const file of retiredSources()) {
    let body: string;
    try {
      body = readFileSync(path.join(cliSrc, file), "utf8");
    } catch {
      missing.push(file);
      continue;
    }
    if (!body.includes(UNWIRED_MARKER)) unmarked.push(file);
  }

  assert.deepEqual(
    missing,
    [],
    `RETIRED_CHECKS names ${missing.join(", ")}, which no longer exist. A deleted source is fine — ` +
      "drop it from the inventory so the tombstone keeps describing the real tree.",
  );
  assert.deepEqual(
    unmarked,
    [],
    `these retired sources do not carry the \`${UNWIRED_MARKER}\` banner: ${unmarked.join(", ")}. ` +
      "Each still compiles and its own tests still pass, so without the banner a reader has no way " +
      "to tell it enforces nothing. Add the banner, or — if it was re-wired — update RETIRED_CHECKS.",
  );
});

// ── the tombstone's COMPANION half ───────────────────────────────────────────
//
// The tests above judge the retired PRODUCTION sources, which is the half that was tracked. Their
// `.test.ts` companions were not — and three of them are not leftovers at all: they run inside
// `pnpm -r test` (GATE_PLAN step 6, and a CI step) and assert invariants over the real tree. A
// tidy-up deleting "the unwired ADR-0311 leftovers" would have taken them along and dropped those
// invariants in silence. These make that impossible to do quietly.

test("every `.test.ts` companion of a retired source is DECLARED — one cannot sit untracked", () => {
  // The completeness half, and the direction that rots on its own: a companion nobody inventoried is
  // exactly how the three load-bearing ones went unbannered beside genuinely dead code for a week.
  const undeclared = retiredSources()
    .map(companionFileFor)
    .filter((file) => existsSync(path.join(cliSrc, file)))
    .filter((file) => !RETIRED_TEST_COMPANIONS.has(file))
    .sort();

  assert.deepEqual(
    undeclared,
    [],
    `these test files sit beside a retired source but are not in RETIRED_TEST_COMPANIONS: ` +
      `${undeclared.join(", ")}. Declare each with its role and what deleting it would cost — an ` +
      "undeclared companion is indistinguishable from a leftover, which is how a live invariant " +
      "gets swept up by a tidy-up.",
  );
});

test("every declared companion still EXISTS — deleting one reds here, naming what it enforced", () => {
  // THE LOAD-BEARING ONE. This is the mechanism, not the documentation: removing the FILE fails here
  // with its `cost` sentence, so dropping a repo-wide invariant takes three deliberate edits (the
  // file, its entry, and the pinned set below) and each one lands visibly in the diff.
  const gone: string[] = [];
  for (const [file, companion] of RETIRED_TEST_COMPANIONS) {
    if (!existsSync(path.join(cliSrc, file))) gone.push(`${file} (${companion.role}) — ${companion.cost}`);
  }

  assert.deepEqual(
    gone,
    [],
    `these declared companions no longer exist: ${gone.join(" | ")}. If the deletion was deliberate, ` +
      "remove the entry too — and for a `load-bearing` one, say in the commit which invariant is " +
      "being abandoned and where it moved.",
  );
});

test("every companion carries the banner its ROLE demands, and no inert one claims to enforce", () => {
  // Both directions on `LOAD-BEARING`, because both fail: a missing banner leaves a live invariant
  // looking like dead code, and a stale one leaves dead code looking protected. The second is the
  // half that rots — a companion can stop enforcing without anyone touching this map.
  const unbannered: string[] = [];
  const overclaiming: string[] = [];

  for (const [file, companion] of RETIRED_TEST_COMPANIONS) {
    assert.ok(companion.cost.length > 0, `${file} must record what deleting it would cost`);
    assert.ok(
      retiredSources().includes(companion.of),
      `${file} claims to companion \`${companion.of}\`, which RETIRED_CHECKS does not list`,
    );
    assert.equal(
      companionFileFor(companion.of),
      file,
      `${file} is declared against \`${companion.of}\`, whose companion would be ${companionFileFor(companion.of)}`,
    );

    let body: string;
    try {
      body = readFileSync(path.join(cliSrc, file), "utf8");
    } catch {
      continue; // the test above owns the missing-file failure; don't report it twice
    }
    const claims = body.includes(LOAD_BEARING_MARKER);
    if (companion.role === "load-bearing" && !claims) unbannered.push(file);
    if (companion.role !== "load-bearing" && claims) overclaiming.push(file);
  }

  assert.deepEqual(
    unbannered,
    [],
    `these still enforce a repo-wide invariant but carry no \`${LOAD_BEARING_MARKER}\` banner: ` +
      `${unbannered.join(", ")}. Without it they read as ADR-0311 leftovers and get tidied away.`,
  );
  assert.deepEqual(
    overclaiming,
    [],
    `these claim \`${LOAD_BEARING_MARKER}\` but are not declared load-bearing: ${overclaiming.join(", ")}. ` +
      "Either the banner is stale — remove it — or the file started enforcing something, in which " +
      "case say what in its RETIRED_TEST_COMPANIONS entry.",
  );
});

test("the load-bearing companions are pinned BY NAME, so dropping one is a visible edit", () => {
  // Derived by hand rather than read off the map — the same reason PRE_EXPENSIVE_CHECKS is. A set
  // computed from the map would agree with it by construction and could never contradict it, which
  // is precisely the contradiction this exists to force: quietly deleting a load-bearing entry has
  // to fail a literal that spells out the three files.
  const loadBearing = [...RETIRED_TEST_COMPANIONS]
    .filter(([, companion]) => companion.role === "load-bearing")
    .map(([file]) => file)
    .sort();

  assert.deepEqual(
    loadBearing,
    ["coverage-drain.test.ts", "coverage-gate.test.ts", "test-timing-drain.test.ts"],
    "the set of companions that still enforce a repo-wide invariant changed. Adding one is fine — " +
      "update this literal. REMOVING one means a repo-wide invariant is being abandoned or has " +
      "moved; say which, and where it went.",
  );
});

test("each load-bearing companion's banner NAMES the invariant, not just the marker", () => {
  // A bare `LOAD-BEARING` token satisfies the banner test while telling a reader nothing about what
  // is at stake, which is how a marker decays into decoration. The banner has to be readable on its
  // own, by a session that never opens this module.
  for (const [file, companion] of RETIRED_TEST_COMPANIONS) {
    if (companion.role !== "load-bearing") continue;
    const body = readFileSync(path.join(cliSrc, file), "utf8");
    const banner = body.split(/\r?\n/).findIndex((line) => line.includes(LOAD_BEARING_MARKER));
    const paragraph = body.split(/\r?\n/).slice(banner, banner + 12).join("\n");
    assert.match(
      paragraph,
      /pnpm -r|GATE_PLAN|do not delete|DO NOT DELETE/i,
      `${file}'s ${LOAD_BEARING_MARKER} banner must say where it runs and that it must survive a ` +
        "leftover sweep — a bare marker is decoration",
    );
  }
});

// ── the gate's VOICE vs. the real source tree ────────────────────────────────
//
// The tombstone tests above judge FILES. These judge SENTENCES, which is the half no inventory of
// check-shaped files can reach: `storytree library --check` is not a `check:*` script and leaves no
// `check-*.ts` behind, so every test above swept past it while it printed
// `GATE BROKEN: … — fix before merge` on a report nothing has ever run.

/** The module that DECLARES the phrases, and its test — scanning them would only flag their own data. */
const GATE_VOICE_SELF: ReadonlySet<string> = new Set([
  "packages/cli/src/gate-order.ts",
  "packages/cli/src/gate-order.test.ts",
]);

/** Every `.ts` under {@link GATE_VOICE_SCAN_ROOTS}, repo-root-relative with forward slashes. */
function gateVoiceFiles(): string[] {
  const out: string[] = [];
  for (const root of GATE_VOICE_SCAN_ROOTS) {
    for (const entry of readdirSync(path.join(repoRoot, root), { recursive: true })) {
      const rel = `${root}/${String(entry).split(path.sep).join("/")}`;
      if (rel.endsWith(".ts") && !GATE_VOICE_SELF.has(rel)) out.push(rel);
    }
  }
  return out.sort();
}

test("findGateVoice reports each phrase with its line and the sentence, and stays quiet otherwise", () => {
  // The non-vacuity control: the sweep below asserts an EMPTY list, which a scanner that finds
  // nothing would also satisfy. This proves it can speak before that one proves nobody is speaking.
  assert.deepEqual(findGateVoice("const ok = 1;\n// nothing to declare here\n"), []);

  const hits = findGateVoice('a\nlines.push("GATE BROKEN: x — fix before merge.");\nb\n');
  assert.deepEqual(
    hits.map((h) => [h.line, h.phrase]),
    [
      [2, "GATE BROKEN"],
      [2, "fix before merge"],
    ],
  );
  assert.match(hits[0]?.text ?? "", /lines\.push/);
});

test("a mention of merging that claims no blocking authority is NOT a hit", () => {
  // The two real sentences the narrow phrase list deliberately spares — widening it to catch these
  // would bury the check in an allowlist nobody reads.
  assert.deepEqual(findGateVoice("catch a collision before merge (it will fail the PR)"), []);
  assert.deepEqual(findGateVoice("N candidate(s) await a librarian pass before merge (ADR-0095)"), []);
});

test("no source claims merge-blocking authority unless it is exempted with a reason", () => {
  // THE LOAD-BEARING ONE, and the mirror of `every check:* script is IN the plan`: that test stops a
  // check from existing unrun, this one stops a command from SOUNDING enforced while unrun. Both
  // refuse the same conclusion — that something is watching when nothing is.
  const unexplained: string[] = [];
  for (const file of gateVoiceFiles()) {
    for (const hit of findGateVoice(readFileSync(path.join(repoRoot, file), "utf8"))) {
      if (GATE_VOICE_EXEMPTIONS.has(gateVoiceKey(file, hit.phrase))) continue;
      unexplained.push(`${file}:${hit.line} — ${hit.text}`);
    }
  }

  assert.deepEqual(
    unexplained,
    [],
    `these assert merge-blocking authority: ${unexplained.join(" | ")}. Either the claim is FALSE — ` +
      "reword it to report rather than to refuse (ADR-0311 D5: wiring a rung needs new " +
      "production-catch evidence and an ADR, never merely the wiring) — or it is true, in which case " +
      "trace it to its GATE_PLAN step and add it to GATE_VOICE_EXEMPTIONS with that reason.",
  );
});

test("every gate-voice exemption still names a real, still-claiming sentence", () => {
  // A stale exemption is removed, not kept — the same rule the NON_GATE_CHECK_SCRIPTS test applies,
  // and the reason a reworded sentence cannot leave a permanent licence behind for the next author.
  const live = new Set<string>();
  for (const file of gateVoiceFiles()) {
    for (const hit of findGateVoice(readFileSync(path.join(repoRoot, file), "utf8"))) {
      live.add(gateVoiceKey(file, hit.phrase));
    }
  }
  for (const [key, reason] of GATE_VOICE_EXEMPTIONS) {
    assert.ok(live.has(key), `GATE_VOICE_EXEMPTIONS exempts \`${key}\`, which no longer says it`);
    assert.ok(reason.length > 0, `${key} must record WHY the claim is honest`);
  }
});

test("every declared phrase is a distinct claim of blocking authority", () => {
  assert.ok(GATE_AUTHORITY_PHRASES.length > 0, "an empty phrase list makes the sweep vacuous");
  assert.equal(new Set(GATE_AUTHORITY_PHRASES).size, GATE_AUTHORITY_PHRASES.length);
});

test("every check-shaped source file is either wired into the gate or declared retired", () => {
  // The completeness half: the two tests above only judge files someone remembered to inventory.
  // This one judges the DIRECTORY, so a newly orphaned check cannot slip in unlisted and a session
  // reading `RETIRED_CHECKS` can trust it to be the whole tombstone rather than a sample.
  const wired = wiredEntrypoints();
  const retired = new Set(retiredSources());
  const unaccounted = readdirSync(cliSrc)
    .filter((file) => /^check-.+\.ts$|.+-check\.ts$/.test(file) && !file.endsWith(".test.ts"))
    .filter((file) => !wired.has(file) && !retired.has(file))
    .sort();

  assert.deepEqual(
    unaccounted,
    [],
    `these files look like gate checks but are neither invoked by a root check:* script nor listed ` +
      `in RETIRED_CHECKS: ${unaccounted.join(", ")}. Wire it, or declare it retired and banner it — ` +
      "an unaccounted check-shaped file is exactly the ambiguity this inventory exists to remove.",
  );
});
