import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadFixtureCorpus } from "@storytree/library/fixture";

import {
  parseSurfaceRefs,
  classifySurfaceCoverage,
  formatSurfaceCoverage,
  runSurfaceCoverageGate,
  enumerateEntrypoints,
  isInternalScript,
  loadSurfaceCoverageInputs,
  type Entrypoint,
  type ProcessSurfaces,
} from "./surface-coverage-gate.js";

/**
 * `check:surface-coverage` — the process↔entrypoint bijection sweep (ADR-0154).
 *
 * Pure-by-injection (the input loader is a seam), so the WARN/OK decision is tested with fixtures — no
 * disk, no DB. The headline red→green: a process naming a surface that resolves to NOTHING, and an
 * operator-facing entrypoint with NO process, both make the gate WARN and are named; a fully-covered
 * set is a clean OK. The parser tests pin the `surfaces`-names-an-entrypoint convention; the final
 * test grounds the disk wiring (seed + package.json → entrypoints) on the real repo.
 */

// A small hand-built entrypoint universe. `storytree library` is a resolution-only CLI area (never an
// orphan); `pnpm db:up` is an operator-facing script (orphan-checked); `pnpm check:coverage` is
// internal (enumerated so a process MAY name it, but not orphan-checked).
const ENTRYPOINTS: Entrypoint[] = [
  { id: "storytree library", namespace: "cli", orphanChecked: false },
  { id: "pnpm db:up", namespace: "pnpm", orphanChecked: true },
  { id: "pnpm check:coverage", namespace: "pnpm", orphanChecked: false },
  { id: "pnpm --filter studio dev", namespace: "pnpm-app", orphanChecked: true },
];

// ---------------------------------------------------------------------------
// parseSurfaceRefs — the convention
// ---------------------------------------------------------------------------

test("parseSurfaceRefs: recognises the storytree / pnpm / per-app forms and normalises to canonical ids", () => {
  const prose =
    "Run `storytree library artifact new --file d.json --pg` then `pnpm db:up`; the studio via " +
    "`pnpm --filter studio dev`. A `pnpm storytree tree --pg` orient. Ordinary prose like `--pg` and " +
    "`apps/studio/data/knowledge.json` and `build-corpus.mjs` is ignored.";
  const refs = parseSurfaceRefs(prose);
  // `storytree library artifact …` resolves at AREA granularity; `pnpm storytree tree` unifies to the area.
  assert.deepEqual(refs, ["storytree library", "pnpm db:up", "pnpm --filter studio dev", "storytree tree"]);
});

test("parseSurfaceRefs: the lenient bare-script form needs the known-scripts set; a bare area word is NOT a ref", () => {
  const prose = "The staging step brings the studio up with `studio:up`. It is `library` doctrine, not a launcher.";
  // Without the known-scripts set, a bare `studio:up` is not recognised.
  assert.deepEqual(parseSurfaceRefs(prose), []);
  // With it, `studio:up` → `pnpm studio:up`; the bare word `library` is still never a CLI-area ref.
  assert.deepEqual(parseSurfaceRefs(prose, new Set(["studio:up", "db:up"])), ["pnpm studio:up"]);
});

test("parseSurfaceRefs: dedupes in first-seen order and skips a bare/flag-only command", () => {
  const prose = "`pnpm db:up` … `pnpm db:up` again … a bare `storytree` and a `storytree --help` name no area.";
  assert.deepEqual(parseSurfaceRefs(prose), ["pnpm db:up"]);
});

// ---------------------------------------------------------------------------
// classifySurfaceCoverage — the bijection
// ---------------------------------------------------------------------------

test("RED: a process naming a surface that resolves to no entrypoint is flagged unresolved + WARN", async () => {
  const processes: ProcessSurfaces[] = [
    // db:up is real; `pnpm studdio:up` (typo) and `storytree bild` (typo area) resolve to nothing.
    { id: "db-control", refs: ["pnpm db:up", "pnpm studdio:up"] },
    { id: "launch", refs: ["storytree bild", "pnpm --filter studio dev"] },
  ];
  const { warn, lines } = await runSurfaceCoverageGate({
    loadInputs: async () => ({ processes, entrypoints: ENTRYPOINTS }),
  });
  assert.equal(warn, true);
  const body = lines.join("\n");
  assert.match(body, /2 named surface\(s\) resolve to NO entrypoint/);
  assert.match(body, /db-control → "pnpm studdio:up"/);
  assert.match(body, /launch → "storytree bild"/);
});

test("RED: an operator-facing entrypoint named by no process is flagged an orphan + WARN", () => {
  // Only db:up is named; `pnpm --filter studio dev` (orphan-checked) is left with no process.
  const processes: ProcessSurfaces[] = [{ id: "db-control", refs: ["pnpm db:up"] }];
  const report = classifySurfaceCoverage({ processes, entrypoints: ENTRYPOINTS });
  assert.deepEqual(report.orphans, ["pnpm --filter studio dev"]);
  assert.equal(report.clean, false);
  const { warn, lines } = formatSurfaceCoverage(report);
  assert.equal(warn, true);
  assert.match(lines.join("\n"), /operator-facing entrypoint\(s\) have NO process/);
  assert.match(lines.join("\n"), /pnpm --filter studio dev/);
});

test("a resolution-only CLI area and an internal script are never orphans, even when un-named", () => {
  // No process names anything, yet `storytree library` (area) and `pnpm check:coverage` (internal) are
  // NOT orphans — only the two operator-facing scripts are.
  const report = classifySurfaceCoverage({ processes: [], entrypoints: ENTRYPOINTS });
  assert.deepEqual(report.orphans, ["pnpm db:up", "pnpm --filter studio dev"]);
  assert.doesNotMatch(report.orphans.join("\n"), /storytree library|check:coverage/);
});

test("GREEN: every named surface resolves and every operator-facing entrypoint has a process → clean OK", async () => {
  const processes: ProcessSurfaces[] = [
    { id: "db-control", refs: ["pnpm db:up"] },
    { id: "launch-studio", refs: ["pnpm --filter studio dev", "storytree library"] },
  ];
  const { warn, lines } = await runSurfaceCoverageGate({
    loadInputs: async () => ({ processes, entrypoints: ENTRYPOINTS }),
  });
  assert.equal(warn, false);
  const body = lines.join("\n");
  assert.match(body, /OK — every process names a real entrypoint and every operator-facing entrypoint has a process/);
  assert.match(body, /2 processes, 4 entrypoints/);
  assert.doesNotMatch(body, /WARN/);
});

// ---------------------------------------------------------------------------
// enumeration — operator-facing vs internal
// ---------------------------------------------------------------------------

test("isInternalScript: gate/generator mechanics are internal; launchers are operator-facing", () => {
  for (const internal of ["check:coverage", "build:agents", "sync:web-engine", "storytree", "build", "typecheck", "test", "sync"]) {
    assert.equal(isInternalScript(internal), true, `${internal} should be internal`);
  }
  for (const operator of ["db:up", "db:down", "studio:up", "studio:status", "gate"]) {
    assert.equal(isInternalScript(operator), false, `${operator} should be operator-facing`);
  }
});

test("enumerateEntrypoints: CLI areas are resolution-only; operator scripts + per-app launchers are orphan-checked", () => {
  const eps = enumerateEntrypoints(["db:up", "check:coverage", "gate", "storytree"]);
  const byId = new Map(eps.map((e) => [e.id, e]));
  // Every CLI area is enumerated but never orphan-checked (the deferred next:-graph follow-on).
  const areas = eps.filter((e) => e.namespace === "cli");
  assert.ok(areas.length >= 17, "expected all CLI areas enumerated");
  assert.ok(areas.every((e) => e.orphanChecked === false), "CLI areas must be resolution-only");
  assert.equal(byId.get("storytree library")?.orphanChecked, false);
  // db:up + gate operator-facing; check:coverage + the storytree forwarder internal.
  assert.equal(byId.get("pnpm db:up")?.orphanChecked, true);
  assert.equal(byId.get("pnpm gate")?.orphanChecked, true);
  assert.equal(byId.get("pnpm check:coverage")?.orphanChecked, false);
  assert.equal(byId.get("pnpm storytree")?.orphanChecked, false);
  // The per-app launchers are always present + orphan-checked.
  assert.equal(byId.get("pnpm --filter studio dev")?.orphanChecked, true);
  assert.equal(byId.get("pnpm --filter desktop start")?.orphanChecked, true);
});

// ---------------------------------------------------------------------------
// end-to-end over the REAL repo (durable structural invariants)
// ---------------------------------------------------------------------------

test("end-to-end: the loader reads a store's process tier + the real package.json into a well-formed, classifiable input", async () => {
  // HALF hermetic, deliberately. The ENTRYPOINT half is still the REAL repo (`package.json` on
  // disk), because that is what the loader's disk arm exists to read and it needs no credential.
  // The PROCESS half came from the committed seed until ADR-0302 D1 deleted it, and it cannot
  // follow it onto the live store here — ADR-0302 D3 keeps `STORYTREE_DB_USER` out of
  // `pnpm -r test` so the suites stay hermetic — so it reads the fixture corpus.
  //
  // WHAT MOVED, so the coverage is not quietly weaker than it looks: the "the real corpus's process
  // tier is populated and its bijection is clean" assertion is now the `check:surface-coverage`
  // RUNG's, which reads live and runs in BOTH `pnpm gate` and CI. What this test still owns is the
  // loader's own contract — that it joins a store's `process` docs to the real entrypoint set and
  // produces something the classifier can consume.
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const store = new InMemoryStore();
  await loadFixtureCorpus(store);
  const { processes, entrypoints } = await loadSurfaceCoverageInputs({
    store,
    packageJsonPath: path.join(repoRoot, "package.json"),
  });

  // The store's process tier is loaded, every entry well-formed.
  assert.ok(processes.length >= 1, "expected the store's process artifacts");
  for (const p of processes) {
    assert.equal(typeof p.id, "string");
    assert.ok(Array.isArray(p.refs));
  }

  // Durable entrypoint invariants (independent of how the tier is backfilled over the arc):
  const byId = new Map(entrypoints.map((e) => [e.id, e]));
  assert.equal(byId.get("storytree library")?.orphanChecked, false, "a CLI area is resolution-only");
  assert.equal(byId.get("pnpm db:up")?.orphanChecked, true, "db:up is an operator-facing launcher");
  assert.equal(byId.get("pnpm check:surface-coverage")?.orphanChecked, false, "this gate is internal");
  assert.equal(byId.get("pnpm --filter desktop start")?.orphanChecked, true, "the desktop launcher is enumerated");

  // The classifier runs clean-of-crashes and never flags a CLI area as an orphan (they are not checked).
  const report = classifySurfaceCoverage({ processes, entrypoints });
  assert.doesNotMatch(report.orphans.join("\n"), /^storytree /m, "CLI areas are never orphans in this cut");
});
