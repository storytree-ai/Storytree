import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { InMemoryStore, type Store } from "@storytree/storage-protocol";
import { Friction } from "@storytree/library";

import { cliActorFor } from "./cli-actor.js";
import { run } from "./commands.js";
import { hasConcreteEvidence, lifecycleOf, standingRouteSetter, validateInboxDir } from "./friction.js";

/**
 * A fixture document, deliberately OPEN and mutable. These tests build a well-formed doc and then
 * delete or overwrite fields to reach the malformed shapes the migration has to survive, so the
 * fixture cannot carry a fixed key set: an annotated literal is the widening
 * `no-known-value-widening` rejects, and `satisfies` would pin exactly the keys the tests break.
 * Routing the literal through a call keeps it open and says why.
 */
function openDoc(fields: Record<string, unknown>): Record<string, unknown> {
  return fields;
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-07-06T12:00:00.000Z";
const BRANCH = "claude/test-branch";

/** A fresh in-memory store (the offline seed stand-in for these tests). */
function store(): InMemoryStore {
  return new InMemoryStore();
}

/** A fresh temp dir pair for the inbox fallback + doc: reference resolution. */
function tempDirs() {
  const docsDir = mkdtempSync(path.join(os.tmpdir(), "friction-docs-"));
  return { inboxDir: path.join(docsDir, "friction-inbox"), docsDir };
}

/** The friction injection RunDeps seam wired to deterministic branch/clock + the given dirs. */
function frictionDeps(dirs: { inboxDir: string; docsDir: string }, over: Record<string, unknown> = {}) {
  return { branch: BRANCH, now: NOW, inboxDir: dirs.inboxDir, docsDir: dirs.docsDir, ...over };
}

/** The substance an author supplies; the CLI stamps kind/provenance/timestamps. */
function frictionDoc(id: string, over: Record<string, unknown> = {}) {
  return openDoc({
    id,
    title: `Friction ${id}`,
    description: "one-line description",
    statement: "the --pg CLI write appeared to hang",
    evidence: "`pnpm storytree friction new --pg` hung; PR #635 shows the write path",
    impact: "cost ~20 min; the next agent to run it hits the same wall",
    ...over,
  });
}

/** File a friction item through the real dispatch (`--json` avoids temp doc files). */
async function fileNew(
  s: InMemoryStore,
  doc: Record<string, unknown>,
  dirs: { inboxDir: string; docsDir: string },
  opts: { writable?: boolean; extra?: string[]; over?: Record<string, unknown> } = {},
) {
  const argv = ["friction", "new", "--json", JSON.stringify(doc), ...(opts.extra ?? [])];
  return run(argv, { store: s, ...(opts.writable ? { writable: true } : {}), friction: frictionDeps(dirs, opts.over ?? {}) });
}

/** The injected `node:<id>` resolver (ADR-0107 D2) — only `cli` is a real node in these tests. */
const NODE_RESOLVER = { nodeExists: (id: string) => id === "cli" };

/**
 * Scaffold an ARC through the REAL dispatch — the initiative a `tool` routing's remedy parks on
 * (ADR-0298 D2). Composed outward on purpose: every `tool` routing below runs against docs the actual
 * `arc new` / `arc proposal add` verbs wrote, so a writer whose output the fence cannot recognise
 * fails here rather than in production.
 */
async function newArc(s: InMemoryStore, id: string) {
  return run(
    [
      "arc", "new", id,
      "--title", `Arc ${id}`,
      "--intent", "collapse the three export ceremonies into one command",
      "--end-state", "one `library sync` verb, and the three zero ceilings answer to it",
      "--objective", "land the first slice",
      "--body", "what the first increment of this arc does",
      "--pg",
    ],
    { store: s, writable: true },
  );
}

/** Park one entry on `arcId` naming `frictionId` — the half the fence checks EXISTS (ADR-0298 D2). */
async function parkOnArc(s: InMemoryStore, arcId: string, entryId: string, frictionId: string) {
  return run(
    [
      "arc", "increment", "new", arcId,
      "--id", entryId,
      "--title", `Park ${entryId}`,
      "--objective", "collapse the three export ceremonies into one command",
      "--body", "three near-identical seed ceremonies, each with its own zero ceiling; touches `packages/cli` only",
      "--friction", frictionId,
      "--pg",
    ],
    { store: s, writable: true },
  );
}

/** Route an item to `tool`, parking + citing its arc entry (the ADR-0298 D2 two-step, in one call). */
async function routeToTool(
  s: InMemoryStore,
  dirs: { inboxDir: string; docsDir: string },
  id: string,
  reason: string,
  extra: string[] = [],
  branch: string = BRANCH,
) {
  const arcId = `${id}-arc`;
  await newArc(s, arcId);
  await parkOnArc(s, arcId, `${id}-remedy`, id);
  return run(
    ["friction", "route", id, "--route", "tool", "--reason", reason, "--arc", arcId, ...extra, "--pg"],
    liveDeps(s, dirs, branch),
  );
}

/**
 * Live (`--pg`) run deps with the write ACTOR PINNED to a branch.
 *
 * Every test that routes an item TWICE needs this: the foreign-overwrite guard compares the standing
 * route's `cli@<branch>` stamp against the current one, and an unpinned run falls back to
 * `defaultCliActor()`, which reads ambient git. That passes on a developer's branch and refuses under
 * CI's DETACHED HEAD (no branch ⇒ the unattributed `"cli"` ⇒ not provably the same adjudicator), so
 * leaving it ambient would make the guard's own tests environment-dependent.
 */
function liveDeps(s: InMemoryStore, dirs: { inboxDir: string; docsDir: string }, branch: string = BRANCH) {
  return { store: s, writable: true, actor: cliActorFor(branch), friction: frictionDeps(dirs) };
}

// ---------------------------------------------------------------------------
// the concrete-evidence floor (ADR-0168 D3)
// ---------------------------------------------------------------------------

test("hasConcreteEvidence accepts concrete markers, rejects vague prose", () => {
  // Concrete: path, PR#, command, error token, quoted excerpt, SHA, backtick span.
  assert.ok(hasConcreteEvidence("failed in packages/cli/src/friction.ts"));
  assert.ok(hasConcreteEvidence("see PR #635"));
  assert.ok(hasConcreteEvidence("`pnpm gate` exited non-zero"));
  assert.ok(hasConcreteEvidence("threw TS2307 module not found"));
  assert.ok(hasConcreteEvidence('the log said "cannot connect"'));
  assert.ok(hasConcreteEvidence("at commit d976069 the build broke"));
  // Vague: no marker at all.
  assert.equal(hasConcreteEvidence("it was frustrating and slow to work with"), false);
  assert.equal(hasConcreteEvidence("things felt harder than they should have"), false);
});

test("lifecycleOf projects open / archived from route (ADR-0196 D2 collapse)", () => {
  assert.equal(lifecycleOf(undefined), "open");
  assert.equal(lifecycleOf("adr"), "archived");
  assert.equal(lifecycleOf("nothing"), "archived");
});

// ---------------------------------------------------------------------------
// friction new — the fail-closed capture fences (ADR-0168 D3)
// ---------------------------------------------------------------------------

test("new refuses an evidence-free item (schema floor)", async () => {
  const s = store();
  const dirs = tempDirs();
  const doc = frictionDoc("f-noev");
  delete doc["evidence"];
  const env = await fileNew(s, doc, dirs, { writable: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /failed validation/);
  assert.equal(await s.getDoc("f-noev"), null, "nothing written");
});

test("new refuses vague (non-concrete) evidence, fail-closed", async () => {
  const s = store();
  const dirs = tempDirs();
  const env = await fileNew(s, frictionDoc("f-vague", { evidence: "it was frustrating and slow" }), dirs, { writable: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /evidence must be CONCRETE/);
  assert.equal(await s.getDoc("f-vague"), null);
});

test("new refuses a route set at capture (capture never classifies)", async () => {
  const s = store();
  const dirs = tempDirs();
  const env = await fileNew(s, frictionDoc("f-routed", { route: "adr" }), dirs, { writable: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /capture never classifies/);
  assert.equal(await s.getDoc("f-routed"), null);
});

test("new refuses a 4th item on the same branch/date (the cap-3 fence)", async () => {
  const s = store();
  const dirs = tempDirs();
  for (const n of ["a", "b", "c"]) {
    const env = await fileNew(s, frictionDoc(`f-${n}`), dirs, { writable: true });
    assert.equal(env.ok, true, `f-${n} should file`);
  }
  const fourth = await fileNew(s, frictionDoc("f-d"), dirs, { writable: true });
  assert.equal(fourth.ok, false);
  assert.match(fourth.body, /cap reached/);
  assert.equal(await s.getDoc("f-d"), null, "the 4th is not written");
});

test("new refuses an unresolvable reference; a resolvable one passes", async () => {
  const s = store();
  const dirs = tempDirs();
  const bad = await fileNew(s, frictionDoc("f-badref", { references: ["asset:ghost"] }), dirs, { writable: true });
  assert.equal(bad.ok, false);
  assert.match(bad.body, /do not resolve/);

  // Seed the referenced artifact, then it resolves.
  await s.upsertDoc({ id: "real-principle", kind: "principle", doc: { id: "real-principle", kind: "principle", title: "R" } });
  const good = await fileNew(s, frictionDoc("f-goodref", { references: ["asset:real-principle"] }), dirs, { writable: true });
  assert.equal(good.ok, true, good.body);
});

// ---------------------------------------------------------------------------
// the three `friction-capture-surface-is-itself-high-friction` defects (route `tool`)
// ---------------------------------------------------------------------------

test("defect 1: a validation refusal names the friction arm's real defect, not stamped keys", async () => {
  // The item's reproduction: `summary` where commonShape requires `description`. The raw LibraryDoc
  // union throw blamed [summary, statement, evidence, impact, kind, provenance, schemaVersion] —
  // three of which the CLI stamps at capture and three of which the kind REQUIRES.
  const s = store();
  const dirs = tempDirs();
  const doc = frictionDoc("f-summary");
  doc["summary"] = doc["description"];
  delete doc["description"];

  const env = await fileNew(s, doc, dirs, { writable: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /friction artifact schema/);
  assert.match(env.body, /missing required field\(s\): description/);
  assert.match(env.body, /field\(s\) this kind does not have: summary/);
  for (const key of ["kind", "provenance", "schemaVersion", "statement", "evidence", "impact"]) {
    assert.ok(
      !new RegExp(`does not have:[^\\n]*\\b${key}\\b`).test(env.body),
      `"${key}" must not be blamed — the caller cannot remove it or the kind requires it:\n${env.body}`,
    );
  }
  // And it says which fields it stamps, so "just remove kind" is never the reader's conclusion.
  assert.match(env.body, /the CLI stamps kind, provenance, createdAt, updatedAt, schemaVersion for you/);
  assert.equal(await s.getDoc("f-summary"), null, "still fail-closed — nothing written");
});

test("defect 2: a node:<id> reference resolves (ADR-0107 D2), and a dangling one is still refused", async () => {
  const s = store();
  const dirs = tempDirs();

  // Before this, `node:` fell to the else-arm and was rejected as "not an asset:/doc: pointer" —
  // so a friction item about a capability could not cite that capability.
  const good = await fileNew(s, frictionDoc("f-node", { references: ["node:cli"] }), dirs, {
    writable: true,
    over: NODE_RESOLVER,
  });
  assert.equal(good.ok, true, good.body);
  const stored = (await s.getDoc("f-node"))?.doc as Record<string, unknown>;
  assert.deepEqual(stored["references"], ["node:cli"], "the token round-trips unchanged");

  // The ADR-0168 D3 floor is unchanged in strength: a node that does not exist is still refused.
  const bad = await fileNew(s, frictionDoc("f-ghostnode", { references: ["node:no-such-story"] }), dirs, {
    writable: true,
    over: NODE_RESOLVER,
  });
  assert.equal(bad.ok, false);
  assert.match(bad.body, /no such story\/capability node/);
  assert.equal(await s.getDoc("f-ghostnode"), null);
});

test("defect 2: a genuinely bad token names all three accepted reference forms", async () => {
  const s = store();
  const dirs = tempDirs();
  const env = await fileNew(s, frictionDoc("f-badtoken", { references: ["https://example.com/x"] }), dirs, {
    writable: true,
    over: NODE_RESOLVER,
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /not an asset:<id>, doc:<path> or node:<id> pointer/);
});

test("defect 3: route --reason and reinforce --evidence read a value from @path", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("f-atpath"), dirs, { writable: true });

  // Real newlines and a `->` — the exact pair that, as a quoted shell argument, flattened to a
  // literal \n and escaped quoting badly enough to truncate the value and drop a stray file.
  const reason = "question 1 -> the evidence supports it.\n\nquestion 2 -> a fence is cheaper.\n";
  const reasonFile = path.join(dirs.docsDir, "reason.txt");
  writeFileSync(reasonFile, reason, "utf8");
  await newArc(s, "f-atpath-arc");
  await parkOnArc(s, "f-atpath-arc", "f-atpath-remedy", "f-atpath");
  const routed = await run(
    ["friction", "route", "f-atpath", "--route", "tool", "--reason", `@${reasonFile}`, "--arc", "f-atpath-arc", "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(routed.ok, true, routed.body);
  const afterRoute = (await s.getDoc("f-atpath"))?.doc as Record<string, unknown>;
  assert.equal(afterRoute["routeReason"], reason.trim(), "the multi-line reason survives verbatim");

  const evidence = "recurred on PR #1008:\n  packages/cli/src/friction.ts -> still flattened\n";
  const evidenceFile = path.join(dirs.docsDir, "evidence.txt");
  writeFileSync(evidenceFile, evidence, "utf8");
  const reinforced = await run(
    ["friction", "reinforce", "f-atpath", "--evidence", `@${evidenceFile}`, "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(reinforced.ok, true, reinforced.body);
  const afterReinforce = Friction.safeParse((await s.getDoc("f-atpath"))?.doc);
  assert.ok(afterReinforce.success);
  assert.equal(afterReinforce.data.reinforcedBy?.[0]?.evidence, evidence.trim());
});

test("defect 3: a missing @path file is guidance, not a throw — and never a stored literal", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("f-nofile"), dirs, { writable: true });
  const missing = path.join(dirs.docsDir, "gone.txt");
  const env = await run(
    ["friction", "route", "f-nofile", "--route", "tool", "--reason", `@${missing}`, "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(env.ok, false);
  // Refused at the `@path` flag boundary now (cli-write-fidelity-arc), which names the flag and the
  // path the old shared message did not.
  assert.match(env.body, /--reason .* could not be read/);
  assert.ok(env.body.includes(missing), "the unreadable path is named");
  // The point of the refusal: the write never happened, so no route carries the literal @path.
  const after = (await s.getDoc("f-nofile"))?.doc as Record<string, unknown>;
  assert.equal(after["routeReason"], undefined, "an unresolvable reason stores nothing at all");
});

test("new stamps provenance + kind and files a schema-valid live item", async () => {
  const s = store();
  const dirs = tempDirs();
  const env = await fileNew(s, frictionDoc("f-live"), dirs, { writable: true });
  assert.equal(env.ok, true, env.body);
  const stored = await s.getDoc("f-live");
  assert.ok(stored, "written to the store");
  const parsed = Friction.safeParse(stored?.doc);
  assert.ok(parsed.success, "the stored doc validates as Friction");
  assert.deepEqual(parsed.success ? parsed.data.provenance : null, { branch: BRANCH, date: "2026-07-06", source: "retro" });
  assert.equal(parsed.success ? parsed.data.route : "x", undefined, "capture leaves route unset");
});

test("new refuses re-filing an existing id (recurrence reinforces, ADR-0168 D2)", async () => {
  const s = store();
  const dirs = tempDirs();
  assert.equal((await fileNew(s, frictionDoc("f-dup"), dirs, { writable: true })).ok, true);
  const again = await fileNew(s, frictionDoc("f-dup"), dirs, { writable: true });
  assert.equal(again.ok, false);
  assert.match(again.body, /already exists — reinforce it/);
});

// ---------------------------------------------------------------------------
// the offline inbox fallback (ADR-0168 D2)
// ---------------------------------------------------------------------------

test("new offline stages a schema-valid JSON doc to the inbox (no --pg)", async () => {
  const s = store();
  const dirs = tempDirs();
  const env = await fileNew(s, frictionDoc("f-offline"), dirs); // writable omitted → offline
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /staged friction f-offline/);
  const stagePath = path.join(dirs.inboxDir, "f-offline.json");
  assert.ok(existsSync(stagePath), "the staging file exists");
  const staged: unknown = JSON.parse(readFileSync(stagePath, "utf8"));
  assert.ok(Friction.safeParse(staged).success, "the staged JSON validates as Friction");
  assert.equal(await s.getDoc("f-offline"), null, "offline never touches the store");
});

test("the offline cap-3 counts staged inbox files", async () => {
  const s = store();
  const dirs = tempDirs();
  for (const n of ["a", "b", "c"]) {
    assert.equal((await fileNew(s, frictionDoc(`o-${n}`), dirs)).ok, true);
  }
  const fourth = await fileNew(s, frictionDoc("o-d"), dirs);
  assert.equal(fourth.ok, false);
  assert.match(fourth.body, /cap reached/);
  assert.equal(existsSync(path.join(dirs.inboxDir, "o-d.json")), false, "the 4th is not staged");
});

// ---------------------------------------------------------------------------
// friction migrate — the D2 migrate step (transport, not capture)
// ---------------------------------------------------------------------------

/** The provenance ANOTHER session's offline capture stamped — the thing migrate must preserve. */
const FOREIGN_PROVENANCE = { branch: "claude/other-session", date: "2026-07-01", source: "retro" } as const;

/** Stage a fully-stamped doc straight into the inbox, as a foreign session's offline capture left it. */
function stageForeign(
  dirs: { inboxDir: string },
  id: string,
  over: Record<string, unknown> = {},
) {
  const doc = {
    ...frictionDoc(id),
    kind: "friction",
    provenance: { ...FOREIGN_PROVENANCE },
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    ...over,
  };
  mkdirSync(dirs.inboxDir, { recursive: true });
  writeFileSync(path.join(dirs.inboxDir, `${id}.json`), JSON.stringify(doc, null, 2) + "\n", "utf8");
  return doc satisfies Record<string, unknown>;
}

/** Run `friction migrate` through the real dispatch. */
async function migrate(s: InMemoryStore, dirs: { inboxDir: string; docsDir: string }, extra: string[] = []) {
  return run(["friction", "migrate", ...extra], { store: s, writable: true, friction: frictionDeps(dirs) });
}

test("migrate files a staged item live with its ORIGINAL provenance (transport, not capture)", async () => {
  const s = store();
  const dirs = tempDirs();
  stageForeign(dirs, "m-keep");
  const env = await migrate(s, dirs);
  assert.equal(env.ok, true, env.body);
  const parsed = Friction.safeParse((await s.getDoc("m-keep"))?.doc);
  assert.ok(parsed.success, "the migrated doc validates as Friction");
  assert.deepEqual(
    parsed.success ? parsed.data.provenance : null,
    FOREIGN_PROVENANCE,
    "provenance is the ORIGINAL capture's branch/date/source, not the migrating session's",
  );
  assert.equal(parsed.success ? parsed.data.createdAt : "", "2026-07-01T09:00:00.000Z", "createdAt survives");
  assert.equal(existsSync(path.join(dirs.inboxDir, "m-keep.json")), false, "the staging file is deleted");
});

test("migrate applies no cap-3 — a session with 3 own items filed can still drain the inbox", async () => {
  const s = store();
  const dirs = tempDirs();
  for (const n of ["a", "b", "c"]) {
    assert.equal((await fileNew(s, frictionDoc(`cap-${n}`), dirs, { writable: true })).ok, true, `cap-${n} files`);
  }
  stageForeign(dirs, "m-fourth");
  const env = await migrate(s, dirs);
  assert.equal(env.ok, true, env.body);
  assert.ok(await s.getDoc("m-fourth"), "migrated despite the migrating session's own 3 items");
});

test("migrate never overwrites an item already live (migrate-only, like sync-corpus)", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("m-dup", { title: "the LIVE truth" }), dirs, { writable: true });
  stageForeign(dirs, "m-dup", { title: "a stale staged twin" });
  const env = await migrate(s, dirs);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /already live/);
  const raw = (await s.getDoc("m-dup"))?.doc as Record<string, unknown>;
  assert.equal(raw["title"], "the LIVE truth", "the live doc is untouched");
  assert.ok(existsSync(path.join(dirs.inboxDir, "m-dup.json")), "the staging file is left for a manual verify+delete");
});

test("migrate refuses a staged item carrying a route (capture never classifies)", async () => {
  const s = store();
  const dirs = tempDirs();
  stageForeign(dirs, "m-routed", { route: "adr", routeReason: "smuggled past adjudication" });
  const env = await migrate(s, dirs);
  assert.equal(env.ok, false);
  assert.match(env.body, /carries a route/);
  assert.equal(await s.getDoc("m-routed"), null, "nothing written");
  assert.ok(existsSync(path.join(dirs.inboxDir, "m-routed.json")), "left staged for a fix");
});

test("migrate --file migrates just that staged item; a --file outside the inbox is refused", async () => {
  const s = store();
  const dirs = tempDirs();
  stageForeign(dirs, "m-one");
  stageForeign(dirs, "m-two");
  const env = await migrate(s, dirs, ["--file", path.join(dirs.inboxDir, "m-one.json")]);
  assert.equal(env.ok, true, env.body);
  assert.ok(await s.getDoc("m-one"), "the named item migrated");
  assert.equal(await s.getDoc("m-two"), null, "the other stays staged");
  assert.ok(existsSync(path.join(dirs.inboxDir, "m-two.json")));

  const outside = await migrate(s, dirs, ["--file", path.join(dirs.docsDir, "loose.json")]);
  assert.equal(outside.ok, false);
  assert.match(outside.body, /under docs\/friction-inbox/);
});

test("migrate offline is refused (it files into the live store)", async () => {
  const s = store();
  const dirs = tempDirs();
  stageForeign(dirs, "m-off");
  const env = await run(["friction", "migrate"], { store: s, friction: frictionDeps(dirs) });
  assert.equal(env.ok, false);
  assert.match(env.body, /run with --pg/);
  assert.ok(existsSync(path.join(dirs.inboxDir, "m-off.json")), "nothing consumed");
});

test("migrate on an empty inbox is a friendly no-op", async () => {
  const s = store();
  const dirs = tempDirs();
  const env = await migrate(s, dirs);
  assert.equal(env.ok, true);
  assert.match(env.body, /nothing to migrate/);
});

test("new --file pointing into the inbox is refused toward migrate (the re-stamp trap)", async () => {
  const s = store();
  const dirs = tempDirs();
  stageForeign(dirs, "m-trap");
  const env = await run(
    ["friction", "new", "--file", path.join(dirs.inboxDir, "m-trap.json")],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /staged inbox item/);
  assert.match(env.body, /re-stamp/);
  assert.equal(await s.getDoc("m-trap"), null, "nothing lands under re-stamped provenance");
});

// ---------------------------------------------------------------------------
// the inbox gate check — fail-closed on a malformed staging file (ADR-0168 D3)
// ---------------------------------------------------------------------------

test("validateInboxDir passes a clean dir and fails closed on a malformed file", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("clean"), dirs); // one valid staged item
  assert.deepEqual(validateInboxDir(dirs.inboxDir), [], "a valid staging dir is clean");

  writeFileSync(path.join(dirs.inboxDir, "broken.json"), "{ not json", "utf8");
  writeFileSync(
    path.join(dirs.inboxDir, "wrong-kind.json"),
    JSON.stringify({ id: "x", kind: "principle", title: "T", description: "d", statement: "s", createdAt: NOW, updatedAt: NOW }),
    "utf8",
  );
  const offenders = validateInboxDir(dirs.inboxDir);
  const files = offenders.map((o) => o.file).sort();
  assert.deepEqual(files, ["broken.json", "wrong-kind.json"], "both malformed files are flagged, clean one is not");
});

test("validateInboxDir is empty for an absent dir", () => {
  assert.deepEqual(validateInboxDir(path.join(os.tmpdir(), "friction-does-not-exist-xyz")), []);
});

// ---------------------------------------------------------------------------
// friction reinforce (ADR-0168 D2)
// ---------------------------------------------------------------------------

test("reinforce without --evidence is refused", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("r-1"), dirs, { writable: true });
  const env = await run(["friction", "reinforce", "r-1"], { store: s, writable: true, friction: frictionDeps(dirs) });
  assert.equal(env.ok, false);
  assert.match(env.body, /reinforce needs --evidence/);
});

test("reinforce appends a reinforcedBy entry (never a twin)", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("r-2"), dirs, { writable: true });
  const env = await run(
    ["friction", "reinforce", "r-2", "--evidence", "hit again on PR #640", "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(env.ok, true, env.body);
  const parsed = Friction.safeParse((await s.getDoc("r-2"))?.doc);
  assert.equal(parsed.success ? parsed.data.reinforcedBy?.length : 0, 1);
  assert.deepEqual(parsed.success ? parsed.data.reinforcedBy?.[0] : null, {
    branch: BRANCH,
    date: "2026-07-06",
    evidence: "hit again on PR #640",
  });
});

test("reinforce records a recurrence on an ARCHIVED item (tombstone re-open is adjudication's)", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("r-3"), dirs, { writable: true });
  await run(["friction", "route", "r-3", "--route", "nothing", "--reason", "reconstructible", "--pg"], { store: s, writable: true, friction: frictionDeps(dirs) });
  const env = await run(["friction", "reinforce", "r-3", "--evidence", "recurred at packages/cli/src/x.ts", "--pg"], { store: s, writable: true, friction: frictionDeps(dirs) });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /ARCHIVED/);
});

test("reinforce offline is refused (writes need the live store)", async () => {
  const s = store();
  const dirs = tempDirs();
  const env = await run(["friction", "reinforce", "whatever", "--evidence", "x"], { store: s, friction: frictionDeps(dirs) });
  assert.equal(env.ok, false);
  assert.match(env.body, /writes to the shared store/);
});

// ---------------------------------------------------------------------------
// friction route (ADR-0168 D5)
// ---------------------------------------------------------------------------

test("route sets route + routeReason with a valid enum", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("rt-1"), dirs, { writable: true });
  const env = await run(["friction", "route", "rt-1", "--route", "adr", "--reason", "genuine re-decision", "--pg"], { store: s, writable: true, friction: frictionDeps(dirs) });
  assert.equal(env.ok, true, env.body);
  const raw = (await s.getDoc("rt-1"))?.doc as Record<string, unknown>;
  assert.ok(Friction.safeParse(raw).success, "the routed doc still validates as Friction");
  assert.equal(raw["route"], "adr");
  assert.equal(raw["routeReason"], "genuine re-decision");
});

test("route refuses an out-of-enum route", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("rt-2"), dirs, { writable: true });
  const env = await run(["friction", "route", "rt-2", "--route", "bogus", "--reason", "x", "--pg"], { store: s, writable: true, friction: frictionDeps(dirs) });
  assert.equal(env.ok, false);
  assert.match(env.body, /--route must be one of/);
});

test("route refuses a missing --reason (the justification is mandatory)", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("rt-3"), dirs, { writable: true });
  const env = await run(["friction", "route", "rt-3", "--route", "nothing", "--pg"], { store: s, writable: true, friction: frictionDeps(dirs) });
  assert.equal(env.ok, false);
  assert.match(env.body, /route needs --reason/);
});

test("route --discharged-by stamps the delivery ref — a landed remedy stops looking like a never-built one", async () => {
  // The delivery-signal gap: an adr/tool-routed item whose remedy later LANDS was indistinguishable
  // from one whose remedy was never built. The stamp is optional (route without it is unchanged) and
  // re-running the route with it records a later landing.
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("rt-4"), dirs, { writable: true });
  const env = await run(
    ["friction", "route", "rt-4", "--route", "adr", "--reason", "remedy landed in the same PR", "--discharged-by", "#1025", "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /discharged by #1025/);
  const raw = (await s.getDoc("rt-4"))?.doc as Record<string, unknown>;
  assert.ok(Friction.safeParse(raw).success, "the discharged doc still validates as Friction");
  assert.equal(raw["dischargedBy"], "#1025");

  // Without the flag the field stays absent — routing semantics are unchanged.
  await fileNew(s, frictionDoc("rt-5"), dirs, { writable: true });
  await run(["friction", "route", "rt-5", "--route", "adr", "--reason", "adr not yet drafted", "--pg"], { store: s, writable: true, friction: frictionDeps(dirs) });
  const undischarged = (await s.getDoc("rt-5"))?.doc as Record<string, unknown>;
  assert.equal(undischarged["dischargedBy"], undefined);

  // An empty ref is refused — omit the flag when the remedy has not landed.
  const empty = await run(
    ["friction", "route", "rt-4", "--route", "adr", "--reason", "x", "--discharged-by", "", "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(empty.ok, false);
  assert.match(empty.body, /--discharged-by needs a ref/);
});

test("list marks a discharged archived item so the two ends of a route are tellable apart", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("l-done"), dirs, { writable: true });
  await routeToTool(s, dirs, "l-done", "capability shipped", ["--discharged-by", "#1025"]);
  await fileNew(s, frictionDoc("l-pending"), dirs, { writable: true });
  await routeToTool(s, dirs, "l-pending", "capability not yet built");

  const env = await run(["friction", "list"], { store: s, writable: true, friction: frictionDeps(dirs) });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /l-done.*✓ #1025/, "the discharged row carries the delivery ref");
  assert.doesNotMatch(env.body, /l-pending.*✓/, "the undischarged row does not");
});

// ---------------------------------------------------------------------------
// the `tool` route's EMISSION fence (ADR-0298 D2, replacing ADR-0287 D1's proposal artifact)
//
// `tool` was the one route naming no artifact kind: it named a destination (story-author) and
// stopped, so the item archived — satisfying `check:friction-drain`, the loop's only fail-closed
// gate — while nothing was built (6 of 125 delivered, measured 2026-08-02). These tests pin the
// symmetry: routing to `tool` requires a PARKED ENTRY on the arc that owns the remedy, and cites
// that arc, exactly as every other route emits its own kind. The route ENUM is deliberately
// untouched (no ninth route; ~125 live rows).
// ---------------------------------------------------------------------------

test("routing to `tool` is refused until the item cites an arc that parks it (ADR-0298 D2)", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("t-bare"), dirs, { writable: true });

  const bare = await run(
    ["friction", "route", "t-bare", "--route", "tool", "--reason", "deferred capability work", "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(bare.ok, false);
  assert.match(bare.body, /routing to `tool` requires a PARKED ENTRY on the arc that owns the remedy/);
  // The refusal hands over the commands in order — the affordance paired with the fence — and it
  // says FOLD FIRST, which is the behaviour ADR-0298 D6 exists to produce.
  assert.match(bare.body, /FOLD FIRST, CHARTER SECOND/);
  assert.match(bare.body, /storytree arc increment new <arc-id>/);
  assert.match(bare.body, /--arc <arc-id>/);

  // NOTHING was written on the way to the refusal: the item is still open and unrouted, so a
  // refused routing can never be mistaken for an archived one.
  const untouched = (await s.getDoc("t-bare"))?.doc as Record<string, unknown>;
  assert.equal(untouched["route"], undefined);
  assert.equal(untouched["routeReason"], undefined);
});

test("an arc carrying NO entry that names this item is refused — citing one is not parking one (ADR-0298 D2)", async () => {
  // The half a citation-only fence would miss: naming a live arc would otherwise satisfy the route
  // while no remedy exists anywhere, which is the pre-ADR-0287 failure in a new costume.
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("t-empty"), dirs, { writable: true });
  await newArc(s, "empty-arc");

  const refused = await run(
    ["friction", "route", "t-empty", "--route", "tool", "--reason", "r", "--arc", "empty-arc", "--pg"],
    liveDeps(s, dirs),
  );
  assert.equal(refused.ok, false);
  assert.match(refused.body, /carries no PARKED entry naming this friction item/);
  assert.equal(((await s.getDoc("t-empty"))?.doc as Record<string, unknown>)["route"], undefined);

  // An entry naming a DIFFERENT friction is equally not a parking of this one.
  await parkOnArc(s, "empty-arc", "someone-elses", "another-friction");
  const stillRefused = await run(
    ["friction", "route", "t-empty", "--route", "tool", "--reason", "r", "--arc", "empty-arc", "--pg"],
    liveDeps(s, dirs),
  );
  assert.equal(stillRefused.ok, false);
  assert.match(stillRefused.body, /carries no PARKED entry naming this friction item/);
});

test("a DELIVERED remedy routes to `tool` with no parked entry at all (ADR-0298 D3's exemption)", async () => {
  // Demanding an entry here would force a false record: the work already landed, so parking it as
  // deferred is untrue. Measured on the retired tier — five delivered `tool` items were left
  // permanently unstamped rather than mint that row, understating the loop's own delivery number.
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("t-landed"), dirs, { writable: true });

  const stamped = await run(
    ["friction", "route", "t-landed", "--route", "tool", "--reason", "already built", "--discharged-by", "#1090", "--pg"],
    liveDeps(s, dirs),
  );
  assert.equal(stamped.ok, true, stamped.body);
  const doc = (await s.getDoc("t-landed"))?.doc as Record<string, unknown>;
  assert.equal(doc["route"], "tool");
  assert.equal(doc["dischargedBy"], "#1090");
});

test("`tool` + --arc writes the route AND the asset: citation in one validated upsert", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("t-cite"), dirs, { writable: true });
  await newArc(s, "one-seed-sync-arc");
  await parkOnArc(s, "one-seed-sync-arc", "one-seed-sync-verb", "t-cite");

  const routed = await run(
    ["friction", "route", "t-cite", "--route", "tool", "--reason", "q7: a verb beats prose", "--arc", "one-seed-sync-arc", "--pg"],
    liveDeps(s, dirs),
  );
  assert.equal(routed.ok, true, routed.body);
  assert.match(routed.body, /remedy parked on arc one-seed-sync-arc/);

  const parsed = Friction.safeParse((await s.getDoc("t-cite"))?.doc);
  assert.ok(parsed.success, "the whole doc is re-validated, citation included");
  assert.equal(parsed.data.route, "tool");
  assert.deepEqual(parsed.data.references, ["asset:one-seed-sync-arc"]);

  // Re-routing is idempotent on the citation — a second pass must not stack duplicate refs.
  const again = await run(
    ["friction", "route", "t-cite", "--route", "tool", "--reason", "q7: a verb beats prose", "--arc", "asset:one-seed-sync-arc", "--pg"],
    liveDeps(s, dirs),
  );
  assert.equal(again.ok, true, again.body);
  const after = (await s.getDoc("t-cite"))?.doc as Record<string, unknown>;
  assert.deepEqual(after["references"], ["asset:one-seed-sync-arc"], "an `asset:`-prefixed value is normalised, not double-added");
});

test("an already-citing item re-routes without repeating --arc (the --discharged-by path stays open)", async () => {
  // The fence is on the CITATION, not the flag. `friction route` has no stamp-only path — adding
  // `--discharged-by` later means re-running the whole route — so demanding `--arc` again would
  // have closed the documented delivery-stamp path for every already-parked item.
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("t-stamp"), dirs, { writable: true });
  await routeToTool(s, dirs, "t-stamp", "the original adjudication");

  const stamped = await run(
    ["friction", "route", "t-stamp", "--route", "tool", "--reason", "the original adjudication", "--discharged-by", "#1088", "--pg"],
    liveDeps(s, dirs),
  );
  assert.equal(stamped.ok, true, stamped.body);
  const doc = (await s.getDoc("t-stamp"))?.doc as Record<string, unknown>;
  assert.equal(doc["dischargedBy"], "#1088");
  assert.deepEqual(doc["references"], ["asset:t-stamp-arc"]);
});

// ---------------------------------------------------------------------------
// the foreign-overwrite guard (compare-and-refuse)
// ---------------------------------------------------------------------------

/** The seven-question justification record a foreign overwrite destroys — long, and exactly restorable. */
const PEER_REASON = [
  "q1 recurrence: 4 sessions, 3 branches, 13 days.",
  "q2 cost: ~22,000 characters of adjudication destroyed, unrecoverable from the projection.",
  "q3 scope: routeFriction only — the deep locked read-modify-write is a substrate ADR.",
  "q4 owner: yes — two route flips changed whether the owner is involved.",
  "q5 alternative: prose discipline, rejected — 3 of 5 seats declined only because they were briefed.",
  "q6 evidence: events.library_event seq 2731/2735, 2732/2737, 2733/2739+2740, 2738/2741.",
  "q7 verdict: route `tool`, emit a proposal.",
].join("\n");

test("route refuses to overwrite ANOTHER branch's adjudication, and its routeReason survives byte-for-byte", async () => {
  // THE LOAD-BEARING ASSERTION IS THE REASON, NOT THE ENUM. A test that only checked `route` would
  // pass while the justification was still destroyed — which is precisely the measured harm: on
  // 2026-07-30 four items were routed twice inside ~13 minutes and ~22,000 characters of verified peer
  // reasoning went with them, with no conflict surfaced at either seat.
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("x-drain"), dirs, { writable: true });

  // Seat A adjudicates.
  const a = await run(
    ["friction", "route", "x-drain", "--route", "adr", "--reason", PEER_REASON, "--pg"],
    liveDeps(s, dirs, "claude/seat-a"),
  );
  assert.equal(a.ok, true, a.body);

  // Seat B, draining the same board concurrently, reaches the same item and routes it elsewhere.
  const b = await run(
    ["friction", "route", "x-drain", "--route", "nothing", "--reason", "reconstructible, archiving", "--pg"],
    liveDeps(s, dirs, "claude/seat-b"),
  );
  assert.equal(b.ok, false, "a foreign overwrite is REFUSED");
  assert.match(b.body, /already carries route `adr`/);
  assert.match(b.body, /claude\/seat-a/, "the refusal names the branch that set the standing route");
  assert.match(b.body, /--re-route/, "and names the override that would let it through");

  const doc = (await s.getDoc("x-drain"))?.doc as Record<string, unknown>;
  assert.equal(doc["route"], "adr", "seat A's route stands");
  assert.equal(doc["routeReason"], PEER_REASON, "seat A's justification survives BYTE-FOR-BYTE");
});

test("the SAME branch re-routing its own item is never refused (correcting your own adjudication is normal)", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("x-self"), dirs, { writable: true });

  const first = await run(
    ["friction", "route", "x-self", "--route", "adr", "--reason", "first pass — escalate"],
    { ...liveDeps(s, dirs, "claude/seat-a"), },
  );
  assert.equal(first.ok, true, first.body);

  const corrected = await run(
    ["friction", "route", "x-self", "--route", "nothing", "--reason", "on reflection: reconstructible"],
    liveDeps(s, dirs, "claude/seat-a"),
  );
  assert.equal(corrected.ok, true, corrected.body);
  const doc = (await s.getDoc("x-self"))?.doc as Record<string, unknown>;
  assert.equal(doc["route"], "nothing");
  assert.equal(doc["routeReason"], "on reflection: reconstructible");
});

test("--re-route lets a deliberate foreign overwrite through (re-adjudication is not walled off)", async () => {
  // Without an override the guard would close the legitimate paths the proposal names: a curator
  // correcting a peer with cause, and the `--discharged-by` re-run when a routed remedy lands later.
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("x-override"), dirs, { writable: true });
  await run(
    ["friction", "route", "x-override", "--route", "adr", "--reason", PEER_REASON, "--pg"],
    liveDeps(s, dirs, "claude/seat-a"),
  );

  const forced = await run(
    ["friction", "route", "x-override", "--route", "nothing", "--reason", "peer erred: already an ADR", "--re-route", "--pg"],
    liveDeps(s, dirs, "claude/seat-b"),
  );
  assert.equal(forced.ok, true, forced.body);
  const doc = (await s.getDoc("x-override"))?.doc as Record<string, unknown>;
  assert.equal(doc["route"], "nothing");
  assert.equal(doc["routeReason"], "peer erred: already an ADR");
});

test("an UNATTRIBUTED standing route is treated as another's, not as yours (fail-closed)", async () => {
  // The 125 pre-ADR-0290 `tool` rows carry the bare `"cli"` actor, and `branchOfActor` calls that
  // UNATTRIBUTED rather than "not yours". Two unattributed writes are not evidence of one author, so
  // `null === null` must not pass — otherwise every legacy row is silently overwritable, which is the
  // whole population the guard exists to protect.
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("x-legacy"), dirs, { writable: true });
  await run(
    ["friction", "route", "x-legacy", "--route", "adr", "--reason", PEER_REASON, "--pg"],
    { store: s, writable: true, actor: "cli", friction: frictionDeps(dirs) },
  );

  const refused = await run(
    ["friction", "route", "x-legacy", "--route", "nothing", "--reason", "archiving", "--pg"],
    { store: s, writable: true, actor: "cli", friction: frictionDeps(dirs) },
  );
  assert.equal(refused.ok, false);
  assert.match(refused.body, /UNATTRIBUTED/);
  assert.equal((await s.getDoc("x-legacy"))?.doc && ((await s.getDoc("x-legacy"))!.doc as Record<string, unknown>)["routeReason"], PEER_REASON);
});

test("a FIRST routing is never refused — the guard only protects a standing adjudication", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("x-first"), dirs, { writable: true });
  const env = await run(
    ["friction", "route", "x-first", "--route", "adr", "--reason", "escalate"],
    liveDeps(s, dirs, "claude/seat-b"),
  );
  assert.equal(env.ok, true, env.body);
});

test("standingRouteSetter names who SET the standing route, not the latest writer", async () => {
  // `reinforce` appends a `reinforcedBy` entry without touching the route, so the obvious read —
  // "the latest writer" — would name a peer's reinforcement as the adjudication. Walking forward and
  // resetting on every differing route value leaves the first event of the final unbroken run.
  const events = [
    { type: "created", doc: {}, actor: "cli@claude/filer", at: "2026-07-30T10:00:00.000Z" },
    { type: "updated", doc: { route: "adr" }, actor: "cli@claude/seat-a", at: "2026-07-30T11:00:00.000Z" },
    { type: "updated", doc: { route: "adr" }, actor: "cli@claude/reinforcer", at: "2026-07-30T12:00:00.000Z" },
  ];
  assert.deepEqual(standingRouteSetter(events, "adr"), { actor: "cli@claude/seat-a", at: "2026-07-30T11:00:00.000Z" });

  // A LATER change to a different route resets the run: the standing value's setter is whoever set it
  // last, which is the most recent adjudicator rather than the original one.
  const flipped = [
    ...events,
    { type: "updated", doc: { route: "nothing" }, actor: "cli@claude/seat-b", at: "2026-07-30T13:00:00.000Z" },
    { type: "updated", doc: { route: "adr" }, actor: "cli@claude/seat-c", at: "2026-07-30T14:00:00.000Z" },
  ];
  assert.deepEqual(standingRouteSetter(flipped, "adr"), { actor: "cli@claude/seat-c", at: "2026-07-30T14:00:00.000Z" });

  // A retire-and-refile carries no adjudication across the gap.
  const refiled = [
    { type: "updated", doc: { route: "adr" }, actor: "cli@claude/seat-a", at: "2026-07-30T11:00:00.000Z" },
    { type: "deleted", doc: { route: "adr" }, actor: "cli@claude/curator", at: "2026-07-30T12:00:00.000Z" },
  ];
  assert.equal(standingRouteSetter(refiled, "adr"), undefined);

  // No route ever set — nothing to name.
  assert.equal(standingRouteSetter([{ type: "created", doc: {}, actor: "cli", at: "x" }], "adr"), undefined);
});

test("an --arc that is missing, or is another kind, is refused with the park-it-first order", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("t-ghost"), dirs, { writable: true });

  const missing = await run(
    ["friction", "route", "t-ghost", "--route", "tool", "--reason", "r", "--arc", "never-chartered", "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(missing.ok, false);
  assert.match(missing.body, /--arc "never-chartered" does not exist/);
  // The refusal names the FOLD-first order, not just the charter escape hatch (ADR-0298 D6).
  assert.match(missing.body, /Folding into an EXISTING arc is the default/);

  // Ids are shared across kinds, so pointing at a non-arc is a distinct, honest refusal — and
  // proves the fence resolves the ref rather than pattern-matching the string.
  const wrongKind = await run(
    ["friction", "route", "t-ghost", "--route", "tool", "--reason", "r", "--arc", "t-ghost", "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a friction, not an arc/);
});

test("--arc is refused on the seven routes that already name their own output kind", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("t-wrong-route"), dirs, { writable: true });
  await newArc(s, "some-arc");

  const env = await run(
    ["friction", "route", "t-wrong-route", "--route", "principle", "--reason", "r", "--arc", "some-arc", "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /--arc is the `tool` route's emission/);

  // The other seven routes are otherwise unchanged — no emission is demanded of them.
  const principle = await run(
    ["friction", "route", "t-wrong-route", "--route", "principle", "--reason", "r", "--pg"],
    { store: s, writable: true, friction: frictionDeps(dirs) },
  );
  assert.equal(principle.ok, true, principle.body);
});

// ---------------------------------------------------------------------------
// friction list — the worklist (ADR-0168 D2)
// ---------------------------------------------------------------------------

test("list groups items by derived lifecycle with counts", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("l-open"), dirs, { writable: true });
  await fileNew(s, frictionDoc("l-routed"), dirs, { writable: true });
  await routeToTool(s, dirs, "l-routed", "cheaper as a fence");
  await fileNew(s, frictionDoc("l-arch"), dirs, { writable: true });
  await run(["friction", "route", "l-arch", "--route", "nothing", "--reason", "one-off", "--pg"], { store: s, writable: true, friction: frictionDeps(dirs) });

  const env = await run(["friction", "list"], { store: s, writable: true, friction: frictionDeps(dirs) });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /1 open · 2 archived/);
  assert.match(env.body, /\[open\s*\] l-open/);
  assert.match(env.body, /→ tool/);
});

test("list on an empty worklist is a friendly first-class outcome", async () => {
  const s = store();
  const dirs = tempDirs();
  const env = await run(["friction", "list"], { store: s, friction: frictionDeps(dirs) });
  assert.equal(env.ok, true);
  assert.match(env.body, /nothing to report is a first-class/);
});

test("list surfaces the count of staged inbox items", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("staged-1"), dirs); // offline stage
  const env = await run(["friction", "list"], { store: s, friction: frictionDeps(dirs) });
  assert.match(env.body, /1 item\(s\) staged in docs\/friction-inbox\//);
});

// ---------------------------------------------------------------------------
// dispatch wiring
// ---------------------------------------------------------------------------

test("bare `friction` and `friction --help` return the help surface", async () => {
  const s = store();
  const help = await run(["friction"], { store: s });
  assert.equal(help.ok, true);
  assert.match(help.body, /the employees' upward voice channel/);
});

test("an unknown friction subcommand is guidance, not a throw", async () => {
  const s = store();
  const env = await run(["friction", "frobnicate"], { store: s });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown friction command/);
});

// ---------------------------------------------------------------------------
// ADR-0352 — `reinforce` and `route` are FIELD-SCOPED.
//
// These two verbs share a row and are written by DIFFERENT people: `route` is the adjudicator's
// seven-question record, `reinforce` is the testimony of whoever hit the friction again. Under the
// whole-doc write each carried a stale copy of the other's field, so a reinforcement landing between
// an adjudication's read and its write was reverted — and vice versa — with both reporting success.
//
// The race is mechanised rather than described: {@link raceStore} lands ONE sibling write at the
// verb's read of the item and hands the verb the snapshot from BEFORE it. Both halves are asserted —
// the sibling's field intact AND this verb's own change landed — since a write that landed nothing
// would satisfy the first alone.
// ---------------------------------------------------------------------------

/** A store that lands one sibling write into `target` at the verb's read, returning the older doc. */
function raceStore(inner: InMemoryStore, target: string, sibling: Record<string, unknown>): Store & { fired(): boolean } {
  let fired = false;
  return {
    fired: () => fired,
    getDoc: async (id) => {
      const before = await inner.getDoc(id);
      if (id === target && !fired) {
        fired = true;
        await inner.patchDoc({ id, fields: sibling });
      }
      return before;
    },
    upsertDoc: (input) => inner.upsertDoc(input),
    patchDoc: (input) => inner.patchDoc(input),
    queryDocs: (filter) => inner.queryDocs(filter),
    deleteDoc: (id, opts) => inner.deleteDoc(id, opts),
    appendEvent: (e) => inner.appendEvent(e),
    readEvents: (filter) => inner.readEvents(filter),
  };
}

test("ADR-0352: reinforce appends its testimony, and the adjudicator's concurrent routing survives", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("race-1"), dirs, { writable: true });
  const racy = raceStore(s, "race-1", {
    route: "guardrail",
    routeReason: "the adjudicator's seven-question record, ~2,000 characters of it",
  });

  const env = await run(
    ["friction", "reinforce", "race-1", "--evidence", "hit again on PR #1300", "--pg"],
    { store: racy, writable: true, friction: frictionDeps(dirs) },
  );

  assert.equal(env.ok, true, env.body);
  assert.equal(racy.fired(), true, "precondition: the sibling write actually interleaved");
  const doc = (await s.getDoc("race-1"))?.doc as Record<string, unknown>;
  assert.equal(doc["routeReason"], "the adjudicator's seven-question record, ~2,000 characters of it");
  assert.equal((doc["reinforcedBy"] as unknown[]).length, 1, "and the reinforcement itself landed");
});

test("ADR-0352: route writes its adjudication, and a concurrent reinforcement survives", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("race-2"), dirs, { writable: true });
  const testimony = [{ branch: "claude/someone-else", date: "2026-07-06", evidence: "hit again on PR #1301" }];
  const racy = raceStore(s, "race-2", { reinforcedBy: testimony });

  const env = await run(
    ["friction", "route", "race-2", "--route", "guardrail", "--reason", "It is a standing rule, not a tool gap.", "--pg"],
    { store: racy, writable: true, actor: cliActorFor(BRANCH), friction: frictionDeps(dirs) },
  );

  assert.equal(env.ok, true, env.body);
  assert.equal(racy.fired(), true, "precondition: the sibling write actually interleaved");
  const doc = (await s.getDoc("race-2"))?.doc as Record<string, unknown>;
  assert.deepEqual(doc["reinforcedBy"], testimony, "a bystander's recurrence evidence is not the adjudicator's to revert");
  assert.equal(doc["route"], "guardrail", "and the adjudication itself landed");
});
