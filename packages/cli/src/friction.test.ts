import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { Friction } from "@storytree/library";

import { run } from "./commands.js";
import { hasConcreteEvidence, lifecycleOf, validateInboxDir } from "./friction.js";

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
function tempDirs(): { inboxDir: string; docsDir: string } {
  const docsDir = mkdtempSync(path.join(os.tmpdir(), "friction-docs-"));
  return { inboxDir: path.join(docsDir, "friction-inbox"), docsDir };
}

/** The friction injection RunDeps seam wired to deterministic branch/clock + the given dirs. */
function frictionDeps(dirs: { inboxDir: string; docsDir: string }, over: Record<string, unknown> = {}) {
  return { branch: BRANCH, now: NOW, inboxDir: dirs.inboxDir, docsDir: dirs.docsDir, ...over };
}

/** The substance an author supplies; the CLI stamps kind/provenance/timestamps. */
function frictionDoc(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Friction ${id}`,
    description: "one-line description",
    statement: "the --pg CLI write appeared to hang",
    evidence: "`pnpm storytree friction new --pg` hung; PR #635 shows the write path",
    impact: "cost ~20 min; the next agent to run it hits the same wall",
    ...over,
  };
}

/** File a friction item through the real dispatch (`--json` avoids temp doc files). */
async function fileNew(
  s: InMemoryStore,
  doc: Record<string, unknown>,
  dirs: { inboxDir: string; docsDir: string },
  opts: { writable?: boolean; extra?: string[] } = {},
) {
  const argv = ["friction", "new", "--json", JSON.stringify(doc), ...(opts.extra ?? [])];
  return run(argv, { store: s, ...(opts.writable ? { writable: true } : {}), friction: frictionDeps(dirs) });
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
): Record<string, unknown> {
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
  return doc;
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

// ---------------------------------------------------------------------------
// friction list — the worklist (ADR-0168 D2)
// ---------------------------------------------------------------------------

test("list groups items by derived lifecycle with counts", async () => {
  const s = store();
  const dirs = tempDirs();
  await fileNew(s, frictionDoc("l-open"), dirs, { writable: true });
  await fileNew(s, frictionDoc("l-routed"), dirs, { writable: true });
  await run(["friction", "route", "l-routed", "--route", "tool", "--reason", "cheaper as a fence", "--pg"], { store: s, writable: true, friction: frictionDeps(dirs) });
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
