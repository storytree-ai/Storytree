/**
 * `adr authority` AT THE LAYERS ABOVE THE VERB: the `adrCommand` dispatch arm, the argv flag
 * threading, and the help text.
 *
 * ## Why these are separate from `adr-authority-verb.test.ts`
 *
 * That file proves the VERB. Everything here is the wiring around it, and each layer can drop a flag
 * silently while the verb stays perfect: the dispatch arm can fail to thread an option, and
 * `commands.ts` can parse a flag it never passes on. Neither is visible from inside `adrAuthority`.
 *
 * ## What is deliberately NOT here
 *
 * The READ surface — `adr list --basis` and the record's authority block — is `adr-authority-read.test.ts`'s,
 * beside the code that owns it. Asserting it twice would couple this file to a surface it does not
 * change, and the second copy would drift.
 *
 * The help block is pinned as a CONTIGUOUS SUBSTRING plus a positional check on the blank line that
 * closes it. `adrHelp` is one long array many sessions edit, so a whole-body golden would break on
 * every unrelated neighbouring change; the substring still holds every literal inside the block, and
 * appending `""` to a needle would not hold the blank line — that only adds a trailing newline,
 * which still matches when the blank has been replaced by other text.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { adrCommand, adrHelp, type AdrCommandDeps } from "./adr.js";
import { run } from "./commands.js";

const idOf = (n: number): string => `adr-${String(n).padStart(4, "0")}`;

async function seed(store: InMemoryStore, number: number, extra: Record<string, unknown> = {}): Promise<void> {
  const id = idOf(number);
  const title = `Decision ${String(number)}`;
  await store.upsertDoc({
    id,
    kind: "adr",
    doc: {
      kind: "adr",
      id,
      title,
      description: `ADR-${String(number).padStart(4, "0")} — ${title}`,
      body: `# ADR-${String(number).padStart(4, "0")}: ${title}\n\n## Status\n\naccepted (2026-06-29) — decided/directed by the owner in conversation on 2026-06-29.\n`,
      number,
      status: "accepted",
      supersedes: [],
      loadBearing: false,
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
      ...extra,
    },
  });
}

function depsFor(store?: InMemoryStore): AdrCommandDeps {
  const deps: AdrCommandDeps = { allocator: null, branch: "claude/test", actor: "tester", today: "2026-09-05" };
  if (store !== undefined) deps.roundTrip = { store, writable: true, actor: "tester" };
  return deps;
}

const authorityOf = async (store: InMemoryStore, n: number): Promise<Record<string, unknown> | undefined> =>
  ((await store.getDoc(idOf(n)))?.doc as Record<string, unknown> | undefined)?.["authority"] as
    | Record<string, unknown>
    | undefined;

// ─── the dispatch arm ─────────────────────────────────────────────────────────────────────────

test("adrCommand authority: refuses with the reason when the store was never wired", async () => {
  const env = await adrCommand("authority", { number: "100" }, depsFor());
  assert.equal(env.ok, false);
  assert.equal(env.body, "adr authority needs the live store, which this invocation was not given.");
  assert.deepEqual(env.next, ["pnpm db:up", "storytree adr list --current"]);
});

test("adrCommand authority: threads --basis and --owner-said through to the stored stamp", async () => {
  const store = new InMemoryStore();
  await seed(store, 519);
  const env = await adrCommand(
    "authority",
    { number: "519", basis: "owner-directed", ownerSaid: "his exact words" },
    depsFor(store),
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(await authorityOf(store, 519), {
    basis: "owner-directed",
    scribedBy: "tester",
    at: "2026-09-05",
    ownerSaid: "his exact words",
  });
});

test("adrCommand authority: threads --transcribed-from-prose", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  // Without the flag an owner basis carrying no quote is REFUSED, so a landed stamp is the proof.
  const env = await adrCommand(
    "authority",
    { number: "100", basis: "owner-directed", transcribedFromProse: true },
    depsFor(store),
  );
  assert.equal(env.ok, true, env.body);
  assert.equal((await authorityOf(store, 100))?.["transcribedFromProse"], true);
});

test("adrCommand authority: threads --backfill, and the pass reaches the rows", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  await seed(store, 200);
  const env = await adrCommand("authority", { backfill: true }, depsFor(store));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /stamped 2 of 2 classifiable decisions/);
  assert.equal((await authorityOf(store, 100))?.["basis"], "owner-directed");
});

test("adrCommand authority: the bare form READS, and writes nothing", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await adrCommand("authority", {}, depsFor(store));
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /0 of 1 decision rows declare a basis/);
  assert.equal(await authorityOf(store, 100), undefined);
});

test("adrCommand: a verb that is not `authority` still falls through to the unknown-command refusal", async () => {
  // A dispatch arm's condition can only be killed by a verb dispatched AFTER it — `sub === "authority"`
  // mutated to `true` would swallow this one.
  const env = await adrCommand("wibble", {}, depsFor(new InMemoryStore()));
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown adr command "wibble"/);
});

// ─── argv: the two booleans this branch declared ──────────────────────────────────────────────
//
// Each asserts an OUTCOME the flag alone can produce. A "not an unknown option" check would pass on
// a flag the parser declared and `commands.ts` then dropped, which is exactly this layer's bug.

const argvDeps = (store: InMemoryStore): Parameters<typeof run>[1] => ({
  store,
  writable: true,
  now: () => new Date("2026-09-05T02:00:00Z"),
});

test("argv: --backfill reaches the verb, and stamps rows the index alone never would", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await run(["adr", "authority", "--backfill", "--pg"], argvDeps(store));
  assert.equal(env.ok, true, env.body);
  // A dropped `--backfill` renders the coverage index and writes nothing, so the ROW is the proof.
  assert.equal((await authorityOf(store, 100))?.["basis"], "owner-directed");
});

test("argv: --transcribed-from-prose reaches the verb", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await run(
    ["adr", "authority", "100", "--basis", "owner-directed", "--transcribed-from-prose", "--pg"],
    argvDeps(store),
  );
  assert.equal(env.ok, true, env.body);
  assert.equal((await authorityOf(store, 100))?.["transcribedFromProse"], true);
});

// ─── the help text ────────────────────────────────────────────────────────────────────────────

test("adr --help carries the authority block verbatim, blank line and all", () => {
  const helpLines = adrHelp().body.split("\n");
  /** Assert a block appears verbatim AND that the line after it is exactly blank. */
  const blockAt = (block: readonly string[]): void => {
    const at = helpLines.indexOf(block[0] ?? "");
    assert.notEqual(at, -1, `help is missing: ${JSON.stringify(block[0])}`);
    assert.deepEqual(helpLines.slice(at, at + block.length), block);
    assert.equal(helpLines[at + block.length], "", "the block must be followed by a blank line");
  };

  blockAt([
    "  storytree adr authority                            how much of the log declares WHOSE CALL it was",
    "  storytree adr authority <n>                        one record's authority stamp + the owner's words",
    "  storytree adr authority <n> --basis <b> [--owner-said <text|@file>] --pg   stamp a record that has none",
    "  storytree adr authority --backfill [--pg]          ADR-0519 D5's mechanical pass (a DRY RUN without --pg)",
  ]);

  blockAt([
    "`authority` (ADR-0519) is the REPAIR ROUTE, and it FILLS AN ABSENCE — nothing more. `adr new`",
    "stamps at CREATION, so a decision scaffolded from a checkout older than ADR-0519 carries no",
    "stamp and, until this verb, could not be given one: `adr push` refuses an `authority:` key and",
    "`library artifact edit --set` cannot write an object. That row was stuck.",
    "  There is NO --force and no --restamp. An existing stamp is refused outright, which is the",
    "  whole reason a second writer is admissible: ADR-0424 D6 says evidence a hand-edit can rewrite",
    "  is not evidence, and a fill-only verb is not a rewrite. A stamp that is WRONG is corrected the",
    "  way a wrong decision is — in the record's own prose, or by superseding the record.",
    "  `scribedBy` is never a flag — always the current session, because it is the one field the",
    "  store corroborates independently (`events.library_event.actor`). A flag would forge that.",
    "  --backfill TRANSCRIBES the two exact phrases D5 names and stamps nothing else. It writes no",
    "  `ownerSaid` at all — those words were never captured, and rebuilding them from an agent's",
    "  summary would forge the evidence the field exists to make trustworthy. The rows it leaves",
    "  alone are an HONEST ABSENCE, not a hole: do not widen the classifier to reach them.",
  ]);
});
