/**
 * `adr attest` AT THE LAYERS ABOVE THE VERB: the `adrCommand` dispatch arm, `adr list --basis`,
 * the argv flag threading, the help text, and the record view's banner wiring.
 *
 * ## Why these are separate from `adr-attest.test.ts`
 *
 * That file proves the VERB. Everything here is the wiring around it, and each layer can drop a
 * flag or a branch silently while the verb stays perfect: the dispatch arm can fail to thread an
 * option, `commands.ts` can parse a flag it never passes on, and `viewArtifact` can compute a
 * banner it never pushes. None of those is visible from inside `adrAttest`.
 *
 * The help block and the banner wiring are pinned as CONTIGUOUS SUBSTRINGS rather than by
 * whole-body equality: both live in files many sessions edit, so a whole-body golden would break on
 * every unrelated neighbouring change. The substring still holds every literal inside the block —
 * any mutation to a word of it breaks the match — while leaving the rest of the surface alone.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { adrCommand, adrHelp, type AdrCommandDeps } from "./adr.js";
import { run, viewArtifact } from "./commands.js";

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

test("adrCommand attest: refuses with the reason when the store was never wired", async () => {
  const env = await adrCommand("attest", { number: "100" }, depsFor());
  assert.equal(env.ok, false);
  assert.equal(env.body, "adr attest needs the live store, which this invocation was not given.");
  assert.deepEqual(env.next, ["pnpm db:up", "storytree adr list --current"]);
});

test("adrCommand attest: threads --basis and --owner-said through to the stored stamp", async () => {
  const store = new InMemoryStore();
  await seed(store, 519);
  const env = await adrCommand(
    "attest",
    { number: "519", basis: "owner-directed", ownerSaid: "his exact words" },
    depsFor(store),
  );
  assert.equal(env.ok, true);
  assert.deepEqual(await authorityOf(store, 519), {
    basis: "owner-directed",
    scribedBy: "tester",
    at: "2026-09-05",
    ownerSaid: "his exact words",
  });
});

test("adrCommand attest: threads --transcribed-from-prose", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await adrCommand(
    "attest",
    { number: "100", basis: "owner-directed", transcribedFromProse: true },
    depsFor(store),
  );
  assert.equal(env.ok, true);
  assert.equal((await authorityOf(store, 100))?.["transcribedFromProse"], true);
});

test("adrCommand attest: threads --backfill, and the pass reaches the rows", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  await seed(store, 200);
  const env = await adrCommand("attest", { backfill: true }, depsFor(store));
  assert.equal(env.ok, true);
  assert.match(env.body, /stamped 2 of 2 classifiable decisions/);
  assert.equal((await authorityOf(store, 100))?.["basis"], "owner-directed");
});

test("adrCommand attest: threads --restamp, so an existing stamp is replaced rather than refused", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, { authority: { basis: "agent-derived", scribedBy: "cli@earlier", at: "2026-09-01" } });
  const refused = await adrCommand("attest", { number: "100", basis: "agent-flipped" }, depsFor(store));
  assert.equal(refused.ok, false, "without --restamp the arm must carry the refusal through");
  const env = await adrCommand("attest", { number: "100", basis: "agent-flipped", restamp: true }, depsFor(store));
  assert.equal(env.ok, true);
  assert.equal((await authorityOf(store, 100))?.["basis"], "agent-flipped");
});

test("adrCommand attest: the bare form READS, and writes nothing", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await adrCommand("attest", {}, depsFor(store));
  assert.equal(env.ok, true);
  assert.match(env.body, /0 of 1 decision rows declare a basis/);
  assert.equal(await authorityOf(store, 100), undefined);
});

test("adrCommand: a verb that is not attest still falls through to the unknown-command refusal", async () => {
  // A dispatch arm's condition can only be killed by a verb dispatched AFTER it — `sub === "attest"`
  // mutated to `true` would swallow this one.
  const env = await adrCommand("wibble", {}, depsFor(new InMemoryStore()));
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown adr command "wibble"/);
});

// ─── adr list --basis ─────────────────────────────────────────────────────────────────────────

test("adr list --basis: an unknown word is REFUSED and names every accepted value", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await adrCommand("list", { basis: "owner-said-so" }, depsFor(store));
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    'unknown --basis "owner-said-so". use one of: owner-directed, owner-ratified, agent-derived, agent-flipped, unstamped.',
  );
  assert.deepEqual(env.next, ["storytree adr list --basis owner-directed", "storytree adr attest"]);
});

test("adr list --basis: the header names the cut, and composes it with the others", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, { authority: { basis: "agent-derived", scribedBy: "x", at: "d" } });
  await seed(store, 200);

  const bare = await adrCommand("list", { basis: "agent-derived" }, depsFor(store));
  assert.equal(bare.ok, true);
  assert.match(bare.body, /storytree adr — 1 ADRs \[all · basis agent-derived\]/);

  const unstamped = await adrCommand("list", { basis: "unstamped" }, depsFor(store));
  assert.match(unstamped.body, /storytree adr — 1 ADRs \[all · basis unstamped\]/);

  const composed = await adrCommand("list", { basis: "agent-derived", current: true }, depsFor(store));
  assert.match(
    composed.body,
    /\[current \(accepted, not superseded\) · basis agent-derived\]/,
    "a cut naming only one of two active filters would misdescribe what it shows",
  );

  const none = await adrCommand("list", {}, depsFor(store));
  assert.match(none.body, /storytree adr — 2 ADRs \[all\]/, "no --basis must leave the label alone");
});

// ─── the help text ────────────────────────────────────────────────────────────────────────────

test("adr --help carries the attest block and the --basis filter, verbatim", () => {
  const body = adrHelp().body;
  const helpLines = body.split("\n");
  /**
   * Assert a block appears verbatim AND that the line after it is exactly `blankAfter`.
   *
   * The trailing blank matters and a substring cannot hold it: appending `""` to the needle only
   * adds a trailing newline, which still matches when the blank line has been replaced by other
   * text. Checking the NEXT line by position brackets it without coupling the assertion to whatever
   * unrelated block happens to follow.
   */
  const blockAt = (block: readonly string[]): void => {
    const at = helpLines.indexOf(block[0] ?? "");
    assert.notEqual(at, -1, `help is missing: ${JSON.stringify(block[0])}`);
    assert.deepEqual(helpLines.slice(at, at + block.length), block);
    assert.equal(helpLines[at + block.length], "", "the block must be followed by a blank line");
  };
  blockAt([
        "  storytree adr attest                               how much of the log declares WHOSE CALL it was",
        "  storytree adr attest <n>                           one record's authority stamp + the owner's words",
        "  storytree adr attest <n> --basis <b> [--owner-said <text|@file>] --pg      stamp it",
        "  storytree adr attest --backfill [--pg]             ADR-0519 D5's mechanical pass (a DRY RUN without --pg)",
  ]);
  blockAt([
        "`attest` (ADR-0519) records WHOSE CALL a decision was, as a fact rather than as prose. The four",
        "bases are owner-directed | owner-ratified | agent-derived | agent-flipped, and an OWNER basis",
        "cannot validate without his verbatim words — so the cheap path and the honest path are the same",
        "path: with nothing to quote, the basis is `agent-derived`.",
        "  `adr new` stamps at CREATION; this is the only way to stamp a decision that ALREADY EXISTS.",
        "  `library artifact edit --set` cannot: the stamp is an OBJECT and --set writes strings and arrays.",
        "  `scribedBy` is never a flag — it is always the current session, because it is the one field the",
        "  store corroborates independently (`events.library_event.actor`). A flag would forge exactly that.",
        "  An existing stamp is NOT overwritten without --restamp: evidence a later pass can quietly",
        "  rewrite is not evidence. --restamp is refused outright on --backfill.",
        "  --backfill TRANSCRIBES the two exact phrases D5 names and stamps nothing else. It writes no",
        "  `ownerSaid` at all — those words were never captured, and rebuilding them from an agent's",
        "  summary would forge the evidence the field exists to make trustworthy. The rows it leaves",
        "  alone are an HONEST ABSENCE, not a hole: do not widen the classifier to reach them.",
  ]);
  assert.ok(
    body.includes(
      [
        "  storytree adr list [--current | --load-bearing | --status <s> | --basis <b>]   the searchable current-state view",
        "     --basis <owner-directed|owner-ratified|agent-derived|agent-flipped|unstamped> (ADR-0519):",
        "     whose call each decision was. `unstamped` selects the rows that declare NOTHING — an",
        "     absence, which is why it is a filter word and not a fifth basis. It COMPOSES with the",
        "     other three filters, and the header names every cut in force.",
      ].join("\n"),
    ),
    "the --basis filter documentation must appear verbatim",
  );
});

// ─── argv: the three booleans this branch declared ────────────────────────────────────────────

// Each asserts an OUTCOME the flag alone can produce — a "not an unknown option" check would pass
// on a flag the parser declared and `commands.ts` then dropped, which is exactly this layer's bug.
const argvDeps = (store: InMemoryStore): Parameters<typeof run>[1] => ({
  store,
  writable: true,
  now: () => new Date("2026-09-05T02:00:00Z"),
});

test("argv: --backfill reaches the verb, and stamps rows the index alone never would", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await run(["adr", "attest", "--backfill", "--pg"], argvDeps(store));
  assert.equal(env.ok, true, env.body);
  // A dropped `--backfill` renders the coverage index and writes nothing, so the ROW is the proof.
  assert.equal((await authorityOf(store, 100))?.["basis"], "owner-directed");
});

test("argv: --transcribed-from-prose reaches the verb", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  // Without the flag an owner basis carrying no quote is REFUSED, so a landed stamp is the proof.
  const env = await run(
    ["adr", "attest", "100", "--basis", "owner-directed", "--transcribed-from-prose", "--pg"],
    argvDeps(store),
  );
  assert.equal(env.ok, true, env.body);
  assert.equal((await authorityOf(store, 100))?.["transcribedFromProse"], true);
});

test("argv: --restamp reaches the verb", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, { authority: { basis: "agent-derived", scribedBy: "cli@earlier", at: "2026-09-01" } });
  // Without the flag this is refused over the existing stamp, so the REPLACED basis is the proof.
  const env = await run(
    ["adr", "attest", "100", "--basis", "agent-flipped", "--restamp", "--pg"],
    argvDeps(store),
  );
  assert.equal(env.ok, true, env.body);
  assert.equal((await authorityOf(store, 100))?.["basis"], "agent-flipped");
});

// ─── the record view's banner wiring ──────────────────────────────────────────────────────────

test("viewArtifact: a stamped decision leads with WHOSE CALL, above its own prose", async () => {
  // `authorityBannerFor` is unit-tested next door; this is the wiring — `viewArtifact` can compute a
  // banner and never push it, which no test inside the banner function can see.
  const store = new InMemoryStore();
  await seed(store, 519, {
    authority: {
      basis: "owner-directed",
      scribedBy: "cli@claude/x",
      at: "2026-09-05",
      ownerSaid: "yes, do it — basis plus my verbatim words",
    },
  });
  const env = await viewArtifact(store, "adr-0519");
  assert.equal(env.ok, true);
  assert.ok(
    env.body.includes(
      [
        "whose call: owner-directed (quoted owner directive) · scribed by cli@claude/x on 2026-09-05",
        "",
        "the owner's words, verbatim:",
        "  > yes, do it — basis plus my verbatim words",
      ].join("\n"),
    ),
    "the stamp and the owner's words must reach the rendered record",
  );
  assert.ok(
    env.body.indexOf("whose call:") < env.body.indexOf("## Status"),
    "the banner is a cover note and belongs OVER the prose it covers",
  );
});

test("viewArtifact: an UNSTAMPED decision renders exactly as before — the banner never announces its absence", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await viewArtifact(store, "adr-0100");
  assert.equal(env.ok, true);
  assert.doesNotMatch(env.body, /whose call/);
});

test("viewArtifact: a NON-decision artifact is never given an authority banner", async () => {
  // The `stored.kind === "adr"` guard. Mutated to `true`, every kind would be handed to the reader.
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "some-principle",
    kind: "principle",
    doc: {
      kind: "principle",
      id: "some-principle",
      title: "A principle",
      description: "d",
      body: "Body.",
      // A stamp on a kind that has no business carrying one — it must still not be rendered.
      authority: { basis: "owner-directed", scribedBy: "x", at: "d", ownerSaid: "words" },
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
  });
  const env = await viewArtifact(store, "some-principle");
  // Asserted WHOLE. `doesNotMatch(/whose call/)` would pass on ANY other line injected here, and the
  // branch this pins is the `: []` arm — whose whole job is to contribute nothing.
  assert.equal(
    env.body,
    ["# A principle    [principle]", "id: some-principle", "", "d", "", "Body."].join("\n"),
  );
});
