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
  parsePrescribedCommands,
  storytreeInvocationTokens,
  stripSourceComments,
  deriveCommandRegister,
  readCliSources,
  resolveCommandPath,
  PRESCRIPTIVE_PROCESS_FIELDS,
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
// (c) prescriptive fields → prescribed commands
//
// The gap PR #1148 drove through: `surfaces` was the ONLY field checked, and it resolves at AREA
// granularity, so a deleted VERB under a surviving area was invisible to every rung.
// ---------------------------------------------------------------------------

/**
 * A register standing in for the real CLI: `library` mounts `artifact` (which takes an `<id>`
 * argument) and `tree focus`; `agents` takes a `<name>`. Nothing mounts `export-corpus` /
 * `sync-corpus` / `sync-agents` — PR #1148 deleted them.
 */
const REGISTER = deriveCommandRegister([
  '["storytree library artifact <id>", "storytree library artifact list <category>",',
  '  "storytree library artifact edit <id> --set <f>=<v> --pg", "storytree library tree focus <id>",',
  '  "storytree agents <name>", "storytree noticeboard done --pg", "storytree adr new --title <t>"]',
]);

test("parsePrescribedCommands: the recognition rule reads storytree invocations through every forwarder form", () => {
  const prose =
    "Run `storytree library artifact new --file d.json --pg`, or `pnpm storytree library tree focus <id>`. " +
    "The bare-bytes read is `pnpm --silent storytree library artifact <id> --raw <field> --pg`; inline JSON " +
    "needs `npx tsx packages/cli/src/main.ts library artifact edit <id> --json '<doc>'`. Env-prefixed: " +
    "`STORYTREE_DB_USER=<iam-email> storytree adr new --title \"x\"`.";
  assert.deepEqual(
    parsePrescribedCommands("steps", prose).map((c) => c.ref),
    [
      "storytree library artifact new",
      "storytree library tree focus",
      "storytree library artifact",
      "storytree library artifact edit",
      "storytree adr new",
    ],
  );
});

test("parsePrescribedCommands: what the rule deliberately does NOT read as a prescribed command", () => {
  // (1) OTHER TOOLS — their inventories are not ours to know.
  assert.deepEqual(parsePrescribedCommands("steps", "`git fetch origin`, `gh pr create`, `gcloud sql instances list`, `docker ps`, `node build.mjs`"), []);
  // (2) BARE `pnpm <script>` — `pnpm install`/`add`/`-r test` are builtins, not scripts; axis (a)
  //     already covers a script the author DECLARED an entrypoint in `surfaces`.
  assert.deepEqual(parsePrescribedCommands("steps", "`pnpm db:up`, `pnpm gate`, `pnpm -r test`, `pnpm --filter studio dev`, `pnpm install`"), []);
  // (3) THE DECISIVE ONE — a BARE token naming a command is prose ABOUT it, never a prescription
  //     OF it. Today's live corpus names all three deleted ceremonies in exactly this shape, in
  //     sentences saying they are gone; reading those as prescriptions would red the gate on prose.
  assert.deepEqual(
    parsePrescribedCommands("steps", "`sync-agents`, `sync-corpus`, `export-corpus` and `check:corpus-content` are DELETED, not renamed."),
    [],
  );
  // (4) A span naming no command path at all.
  assert.deepEqual(parsePrescribedCommands("steps", "a bare `storytree` and a `storytree --help` name nothing"), []);
  // (5) Nothing outside a backtick span is read at all.
  assert.deepEqual(parsePrescribedCommands("steps", "run storytree library export-corpus --pg to export"), []);
});

test("storytreeInvocationTokens: only a storytree invocation survives forwarder stripping", () => {
  assert.deepEqual(storytreeInvocationTokens("pnpm storytree adr list"), ["storytree", "adr", "list"]);
  assert.deepEqual(storytreeInvocationTokens("npx tsx packages/cli/src/main.ts adr list"), ["storytree", "adr", "list"]);
  assert.deepEqual(storytreeInvocationTokens("node packages/cli/launch.mjs adr list"), ["storytree", "adr", "list"]);
  assert.equal(storytreeInvocationTokens("pnpm db:up"), undefined);
  assert.equal(storytreeInvocationTokens("git rebase origin/main"), undefined);
});

test("resolveCommandPath: conservative at every fork — a wildcard, a silent node, and an unknown area", () => {
  // An advertised `<id>`/`<name>` ABSORBS the token and everything after it, so an artifact id or an
  // agent name in argument position is never mistaken for an unmounted verb.
  assert.deepEqual(resolveCommandPath(REGISTER, ["library", "artifact", "edit-first-curation"]), { ok: true });
  assert.deepEqual(resolveCommandPath(REGISTER, ["agents", "session-orchestrator"]), { ok: true });
  // A register node that advertises nothing deeper accepts the rest rather than guessing.
  assert.deepEqual(resolveCommandPath(REGISTER, ["noticeboard", "done", "anything", "else"]), { ok: true });
  // A REAL area the sources never spell out is not checked below the area at all.
  assert.deepEqual(resolveCommandPath(REGISTER, ["worktree", "drain"]), { ok: true });
  // An area that is not a CLI area at all cannot resolve.
  assert.deepEqual(resolveCommandPath(REGISTER, ["bild", "node"]), { ok: false, token: "bild" });
  // Siblings advertised at this exact position, and this token is not among them → reported.
  assert.deepEqual(resolveCommandPath(REGISTER, ["library", "export-corpus"]), { ok: false, token: "export-corpus" });
});

test("stripSourceComments: a command the code merely REMEMBERS is not re-mounted", () => {
  // Not tidiness — the derivation rests on it. All three verbs PR #1148 deleted still appear in
  // `commands.ts` today, in comments explaining that they are gone.
  // The three shapes `commands.ts` actually carries them in: a multi-line JSDoc block, a `//` line,
  // and a trailing `//` after code — beside one real string literal that DOES mount a command.
  const source = [
    "/**",
    " * `storytree library export-corpus --id <id>` — the INVERSE of the migrate-only import.",
    " * `storytree library sync-agents --pg` — reconcile the live agent tier to the seed.",
    " */",
    "// `storytree library sync-corpus --pg` existed only to keep a committed mirror in step.",
    'const usage = "storytree library artifact <id>"; // `storytree library graduate` went too',
  ].join("\n");
  const register = deriveCommandRegister([source]);
  const library = register.children.get("library");
  assert.deepEqual([...(library?.children.keys() ?? [])], ["artifact"], "only the string literal mounts");
  assert.deepEqual(resolveCommandPath(register, ["library", "export-corpus"]), { ok: false, token: "export-corpus" });
});

test("REGRESSION (PR #1148): a process prescribing a DELETED CLI verb is now a finding — `surfaces` alone missed it", () => {
  // The two demonstrated cases, in the shape they had when the gate stayed green over them: a VALID
  // `surfaces` (so axes (a) and (b) are satisfied) plus prose that still prescribes a verb the CLI no
  // longer mounts. `library` survived as an area, which is the whole reason area-granularity resolution
  // saw nothing wrong.
  const processes: ProcessSurfaces[] = [
    {
      id: "library-edit-ceremony",
      refs: ["storytree library"],
      prescribed: parsePrescribedCommands(
        "steps",
        "Until ADR-0302 D1 a durable-tier edit also owed a seed edit or a `pnpm storytree library export-corpus --pg --write`.",
      ),
    },
    {
      id: "retire-realized-proposal",
      refs: ["storytree library"],
      prescribed: parsePrescribedCommands(
        "failureModes",
        "the migrate-only `storytree library sync-corpus --pg` would otherwise RESURRECT the retired artifact from the seed.",
      ),
    },
  ];
  const entrypoints: Entrypoint[] = [{ id: "storytree library", namespace: "cli", orphanChecked: false }];

  // THE CONTROL — and the reason this test is a red→green rather than a restatement. Without the
  // register the sweep is exactly what it computed before this axis existed, and it is CLEAN: both
  // artifacts pass while prescribing a command that does not exist.
  const before = classifySurfaceCoverage({ processes, entrypoints });
  assert.equal(before.clean, true, "the pre-extension sweep passed both — that is the gap being closed");
  assert.deepEqual(before.danglingCommands, []);

  // WITH the register, both are named — by process, by FIELD, and by the token that failed.
  const after = classifySurfaceCoverage({ processes, entrypoints, register: REGISTER });
  assert.equal(after.clean, false);
  assert.deepEqual(
    after.danglingCommands.map((d) => [d.processId, d.field, d.ref, d.token]),
    [
      ["library-edit-ceremony", "steps", "storytree library export-corpus", "export-corpus"],
      ["retire-realized-proposal", "failureModes", "storytree library sync-corpus", "sync-corpus"],
    ],
  );

  const { warn, lines } = formatSurfaceCoverage(after);
  assert.equal(warn, true);
  const body = lines.join("\n");
  assert.match(body, /2 PRESCRIBED command\(s\) the CLI no longer mounts/);
  assert.match(body, /library-edit-ceremony\.steps → "storytree library export-corpus"/);
  assert.match(body, /retire-realized-proposal\.failureModes → "storytree library sync-corpus"/);
});

test("the four prescriptive fields are the scanned set, and `surfaces` is not among them", () => {
  // `surfaces` is axis (a)'s field and stays there; this axis exists because the OTHER four were
  // never read at all.
  assert.deepEqual([...PRESCRIPTIVE_PROCESS_FIELDS], ["statement", "steps", "verification", "failureModes"]);
});

// ---------------------------------------------------------------------------
// end-to-end over the REAL repo (durable structural invariants)
// ---------------------------------------------------------------------------

test("the register derived from the REAL CLI sources mounts today's verbs and not the three PR #1148 deleted", () => {
  // The repo-coupled non-vacuity control: the fixtures above prove the classifier can speak, this
  // proves the DERIVATION reflects the real CLI. It also pins the `.test.ts` exclusion in
  // `readCliSources` — this very file names all three deleted verbs, and must not re-mount them.
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const register = deriveCommandRegister(readCliSources(path.join(repoRoot, "packages", "cli", "src")));

  for (const mounted of [
    ["library", "artifact", "edit"],
    ["library", "tree", "focus"],
    ["adr", "new"],
    ["arc", "increment", "add"],
  ]) {
    assert.deepEqual(resolveCommandPath(register, mounted), { ok: true }, `storytree ${mounted.join(" ")} should resolve`);
  }
  for (const deleted of ["export-corpus", "sync-corpus", "sync-agents"]) {
    assert.deepEqual(
      resolveCommandPath(register, ["library", deleted]),
      { ok: false, token: deleted },
      `storytree library ${deleted} was deleted by PR #1148 and must not resolve`,
    );
  }
});

test("end-to-end: the loader reads a store's process tier + the real package.json into a well-formed, classifiable input", async () => {
  // HALF hermetic, deliberately. The ENTRYPOINT half is still the REAL repo (`package.json` on
  // disk), because that is what the loader's disk arm exists to read and it needs no credential.
  // The PROCESS half came from the committed seed until ADR-0302 D1 deleted it, and it cannot
  // follow it onto the live store here — ADR-0302 D3 keeps `STORYTREE_DB_USER` out of
  // `pnpm -r test` so the suites stay hermetic — so it reads the fixture corpus.
  //
  // WHAT MOVED, so the coverage is not quietly stronger than it is: the
  // `check:surface-coverage` gate rung was retired by the survival audit. This test still owns the
  // loader's contract — that it joins a store's `process` docs to the real entrypoint set and
  // produces something the classifier can consume — but it must not resurrect the deleted root
  // command as an expected entrypoint.
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
  assert.equal(byId.has("pnpm check:surface-coverage"), false, "the retired gate is not an entrypoint");
  assert.equal(byId.get("pnpm --filter desktop start")?.orphanChecked, true, "the desktop launcher is enumerated");

  // The classifier runs clean-of-crashes and never flags a CLI area as an orphan (they are not checked).
  const report = classifySurfaceCoverage({ processes, entrypoints });
  assert.doesNotMatch(report.orphans.join("\n"), /^storytree /m, "CLI areas are never orphans in this cut");
});
