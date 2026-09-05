/**
 * ADR-0519's AUTHORITY STAMP, proved where a drop is actually visible.
 *
 * ## Why every arm here goes through a command and asserts the STORED ROW
 *
 * A decision's fields do NOT flow by spread — four writers name them one by one, so a field added to
 * the schema is silently dropped by every writer that was not edited, and each drop reports
 * `ok: true`. A unit test over the pure `scaffold()` asserts a frontmatter STRING and passes while
 * the drop happens two layers later, at `scaffoldRow`. So the assertions below read the row out of an
 * `InMemoryStore` after the command ran, and the flag-threading arms go through `run([...])` — the
 * only layer that can see whether `--owner-said` reaches `adrOpts` at all.
 *
 * ## And why the ABSENCES are arms rather than omissions
 *
 * This field's whole value is that a prose correction cannot rewrite it, which is a property of what
 * is NOT wired: it is out of `FRONTMATTER_ORDER` (so a push REFUSES an `authority:` key instead of
 * dropping it), out of `renderAdrDocument` (so it never enters the document a human hand-edits), and
 * unnamed in `adrPush`'s spread (so a push carries the stored value through untouched). Each reads
 * like an oversight in the source and is load-bearing, so each is pinned here — ADR-0424 D7's rule,
 * applied: an unpinned deliberate absence is indistinguishable from a forgotten one, and the next
 * session to "finish the wiring" would quietly delete the guarantee.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";
import { DecisionAuthority, hasQuotedOwnerDirective, isOwnerBasis } from "@storytree/library";

import { adrCommand, resolveAuthority, type AdrAllocatorLike, type AdrCommandDeps } from "./adr.js";
import { adrPull, adrPush, type AdrRoundTripDeps } from "./adr-round-trip.js";
import { LITERAL_FLAGS, PROSE_FLAGS } from "./at-path.js";
import { run } from "./commands.js";

const OWNER_WORDS = "yes, do it — basis plus my verbatim words";

function fakeAllocator(n: number): AdrAllocatorLike {
  return { allocate: async () => ({ number: n }) };
}

function depsFor(allocator: AdrAllocatorLike | null, store?: InMemoryStore): AdrCommandDeps {
  const deps: AdrCommandDeps = { allocator, branch: "claude/test", actor: "tester", today: "2026-09-05" };
  if (store !== undefined) deps.roundTrip = { store, writable: true, actor: "tester" };
  return deps;
}

const rowOf = async (store: InMemoryStore, n: number): Promise<Record<string, unknown> | undefined> =>
  (await store.getDoc(`adr-${String(n).padStart(4, "0")}`))?.doc as Record<string, unknown> | undefined;

const authorityOf = (row: Record<string, unknown> | undefined): Record<string, unknown> | undefined =>
  row?.["authority"] as Record<string, unknown> | undefined;

// ─── the stamp reaches the row ────────────────────────────────────────────────────────────────

test("adr new --decided --owner-said: the stamp lands on the STORED ROW, owner words verbatim", async () => {
  const store = new InMemoryStore();
  const env = await adrCommand(
    "new",
    { title: "Stamp the authority", decided: true, ownerSaid: OWNER_WORDS },
    depsFor(fakeAllocator(519), store),
  );
  assert.equal(env.ok, true, env.body);
  const authority = authorityOf(await rowOf(store, 519));
  assert.deepEqual(authority, {
    basis: "owner-directed",
    scribedBy: "tester",
    at: "2026-09-05",
    // VERBATIM — not trimmed of its em-dash, not normalised, not summarised. The whole point of D3
    // is that a later reader weighs what was actually said, so any transformation here is a defect.
    ownerSaid: OWNER_WORDS,
  });
});

test("no flags at all: the stamp still lands, and it claims the LEAST (agent-derived)", async () => {
  const store = new InMemoryStore();
  const env = await adrCommand("new", { title: "Just thinking" }, depsFor(fakeAllocator(520), store));
  assert.equal(env.ok, true, env.body);
  const authority = authorityOf(await rowOf(store, 520));
  // ADR-0519 D4 rests on this: the value a session gets by typing nothing is the WEAK one, so the
  // cheapest way to satisfy the health rung is also the honest way. A default of `owner-directed`
  // here would make the rung the confidence-manufacturing presence check ADR-0427 refuses.
  assert.equal(authority?.["basis"], "agent-derived");
  assert.equal(authority?.["ownerSaid"], undefined);
  assert.equal(authority?.["scribedBy"], "tester");
});

test("--basis agent-flipped records an ADR-0084 transcription as its own class", async () => {
  const store = new InMemoryStore();
  const env = await adrCommand(
    "new",
    { title: "Flip it", basis: "agent-flipped" },
    depsFor(fakeAllocator(521), store),
  );
  assert.equal(env.ok, true, env.body);
  assert.equal(authorityOf(await rowOf(store, 521))?.["basis"], "agent-flipped");
});

// ─── an owner claim owes the owner's words ────────────────────────────────────────────────────

test("--decided WITHOUT --owner-said is REFUSED, and the refusal names the honest alternative", async () => {
  const store = new InMemoryStore();
  const env = await adrCommand(
    "new",
    { title: "Claiming his authority", decided: true },
    depsFor(fakeAllocator(522), store),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /must quote the owner verbatim/);
  // The message must point at `agent-derived` rather than at inventing a quote — a refusal that
  // reads as "supply any string here" trains exactly the fabrication D3 exists to price.
  assert.match(env.body, /the honest basis is 'agent-derived'/);
  // AND NOTHING WAS WRITTEN: the guard runs before the allocator, so a typo cannot burn a number.
  assert.equal(await rowOf(store, 522), undefined, "no row — the refusal precedes the allocation");
});

test("the owner-quote guard runs BEFORE the allocator — a refused stamp spends no number", async () => {
  let allocated = 0;
  const counting: AdrAllocatorLike = {
    allocate: async () => {
      allocated += 1;
      return { number: 523 };
    },
  };
  const env = await adrCommand(
    "new",
    { title: "Burn nothing", basis: "owner-ratified" },
    depsFor(counting, new InMemoryStore()),
  );
  assert.equal(env.ok, false);
  // Reservation is transactional and does NOT roll back, so "refused after allocate" would mean a
  // permanently spent number reporting a typo — the one failure `adr new` must not have.
  assert.equal(allocated, 0, "the allocator was never called");
});

test("--owner-said on an AGENT basis is refused: a quote there asserts nothing", async () => {
  const env = await adrCommand(
    "new",
    { title: "Muddled", basis: "agent-derived", ownerSaid: OWNER_WORDS },
    depsFor(fakeAllocator(524), new InMemoryStore()),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /meaningless on 'agent-derived'/);
});

test("--decided paired with an agent basis is refused rather than shipping a self-contradicting record", async () => {
  const env = await adrCommand(
    "new",
    { title: "Two stories", decided: true, basis: "agent-flipped", ownerSaid: OWNER_WORDS },
    depsFor(fakeAllocator(525), new InMemoryStore()),
  );
  assert.equal(env.ok, false);
  // `--decided` writes "decided/directed by the owner in conversation" into the DOCUMENT. Letting it
  // sit beside `basis: agent-flipped` would manufacture, at authoring time, the exact prose-versus-
  // stamp disagreement the whole field exists to end.
  assert.match(env.body, /contradicts --basis agent-flipped/);
  // A refusal that only named the conflict would leave the caller guessing which side to drop, so
  // BOTH exits are spelled out — and both halves of that sentence are asserted, since a refusal is
  // only as good as the way out it names.
  assert.match(env.body, /Drop --decided to author a 'agent-flipped' decision/);
  assert.match(env.body, /or drop --basis if the owner did direct this/);
});

test("--basis tolerates surrounding whitespace — a padded flag value is not a typo", async () => {
  const store = new InMemoryStore();
  // Kills the mutant that drops the `.trim()`: shells and copy-paste routinely add padding, and
  // without the trim this refuses a perfectly good value as an unknown basis.
  const env = await adrCommand(
    "new",
    { title: "Padded", basis: "  agent-flipped  " },
    depsFor(fakeAllocator(531), store),
  );
  assert.equal(env.ok, true, env.body);
  assert.equal(authorityOf(await rowOf(store, 531))?.["basis"], "agent-flipped");
});

test("a refusal points the caller at the flag pair that would have worked", async () => {
  const env = await adrCommand(
    "new",
    { title: "Lost", decided: true },
    depsFor(fakeAllocator(532), new InMemoryStore()),
  );
  assert.equal(env.ok, false);
  // The `next:` line is the whole affordance of an envelope refusal — an empty one leaves the caller
  // to reconstruct the invocation from prose.
  assert.deepEqual(env.next, [
    'storytree adr new --title "..." --decided --owner-said "<his words>" --pg',
  ]);
});

test("an unknown --basis is refused with the four legal values named", async () => {
  const env = await adrCommand(
    "new",
    { title: "Typo", basis: "owner-decided" },
    depsFor(fakeAllocator(526), new InMemoryStore()),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /owner-directed \| owner-ratified \| agent-derived \| agent-flipped/);
});

// ─── the stamp is NOT in the document, and that is what protects it ───────────────────────────

test("the stamp never enters the decision DOCUMENT — a prose round trip cannot see it", async () => {
  const store = new InMemoryStore();
  await adrCommand(
    "new",
    { title: "Row only", decided: true, ownerSaid: OWNER_WORDS },
    depsFor(fakeAllocator(527), store),
  );
  const row = await rowOf(store, 527);
  const body = String(row?.["body"]);
  // Not in the frontmatter, not in the prose, nowhere in the document text. If the owner's words
  // were IN here, every in-place prose correction (ADR-0139) would be free to rewrite them — which
  // is the failure ADR-0519 was authored to close.
  assert.doesNotMatch(body, /authority:/, "no authority key in the frontmatter");
  assert.doesNotMatch(body, /basis:/, "no basis key in the frontmatter");
  assert.equal(body.includes(OWNER_WORDS), false, "the owner's words are not in the document text");
  // ...and yet they are on the row.
  assert.equal(authorityOf(row)?.["ownerSaid"], OWNER_WORDS);
});

/** Author a stamped decision, then pull it to a temp file — the setup both push arms share. */
async function stampedAndPulled(
  n: number,
): Promise<{ store: InMemoryStore; path: string; deps: AdrRoundTripDeps; doc: string }> {
  const store = new InMemoryStore();
  const env = await adrCommand(
    "new",
    { title: "Correct my prose", decided: true, ownerSaid: OWNER_WORDS },
    depsFor(fakeAllocator(n), store),
  );
  assert.equal(env.ok, true, env.body);
  const deps: AdrRoundTripDeps = { store, writable: true, actor: "later-session" };
  const path = join(await mkdtemp(join(tmpdir(), "storytree-authority-")), `adr-${String(n)}.md`);
  const pulled = await adrPull(String(n), path, deps);
  assert.equal(pulled.ok, true, pulled.body);
  return { store, path, deps, doc: await readFile(path, "utf8") };
}

test("adr push over an edited body leaves the stamp UNTOUCHED (the fence, pinned as deliberate)", async () => {
  const { store, path, deps, doc } = await stampedAndPulled(528);
  const before = authorityOf(await rowOf(store, 528));
  assert.equal(before?.["ownerSaid"], OWNER_WORDS, "precondition: the stamp is there to survive");
  // The pulled DOCUMENT carries no trace of it — which is why a later session editing this file
  // cannot touch the stamp even deliberately.
  assert.equal(doc.includes(OWNER_WORDS), false, "the pulled document does not carry the owner's words");

  // The ordinary in-place correction ADR-0139 asks every session to make.
  await writeFile(path, doc.replace("## Context", "## Context\n\nA later session corrected this."), "utf8");
  const env = await adrPush(String(528), path, deps);
  assert.equal(env.ok, true, env.body);

  const after = await rowOf(store, 528);
  assert.match(String(after?.["body"]), /A later session corrected this/, "the prose DID change");
  // `adrPush` spreads `{...row, <named fields>}` and does not name `authority`, so the stored stamp
  // rides through. That spread reads like an oversight and is the guarantee: correcting a decision's
  // prose is no evidence anyone re-checked WHO DECIDED it.
  assert.deepEqual(authorityOf(after), before, "the stamp survived a body rewrite byte for byte");
});

test("adr push REFUSES a document that tries to carry an authority: key", async () => {
  const { store, path, deps, doc } = await stampedAndPulled(529);
  // A hand-authored attempt to set the stamp through the document surface.
  await writeFile(path, doc.replace("---\nstatus:", "---\nauthority: owner-directed\nstatus:"), "utf8");
  const env = await adrPush(String(529), path, deps);
  // Leaving the key out of `FRONTMATTER_ORDER` — which is also the known-key set — is what makes
  // this a LOUD refusal instead of a silent drop at exit 0.
  assert.equal(env.ok, false, "a document carrying authority: must be refused, not quietly dropped");
  assert.match(env.body, /unknown frontmatter key/);
  assert.equal(authorityOf(await rowOf(store, 529))?.["basis"], "owner-directed", "the stamp is unchanged");
});

// ─── the flags actually reach the command (only `run` sees this layer) ────────────────────────

test("through run([...]): BOTH flags are threaded, not dropped at the parser", async () => {
  const store = new InMemoryStore();
  const env = await run(
    [
      "adr",
      "new",
      "--title",
      "Threaded",
      "--decided",
      "--owner-said",
      OWNER_WORDS,
      // `owner-ratified` DELIBERATELY, not `owner-directed`: `--decided` already derives the latter,
      // so asserting it would pass even if `--basis` never reached the command at all. The whole
      // point of this arm is the threading, and only a value the derivation would NOT produce can
      // prove it happened.
      "--basis",
      "owner-ratified",
    ],
    { store, adr: fakeAllocator(530), writable: true, now: () => new Date("2026-09-05T02:00:00Z") },
  );
  assert.equal(env.ok, true, env.body);
  const stamp = authorityOf(await rowOf(store, 530));
  // The arm the `adrCommand`-level tests structurally cannot cover: whether `commands.ts` maps these
  // flags onto `adrOpts` at all. Dropped there, every other test in this file still passes.
  assert.equal(stamp?.["ownerSaid"], OWNER_WORDS);
  assert.equal(stamp?.["basis"], "owner-ratified");
});

// ─── the two flags are classified, and the classification is a behaviour ──────────────────────

test("--owner-said is a PROSE flag, so @path carries a directive too long for a shell argument", async () => {
  const store = new InMemoryStore();
  const dir = await mkdtemp(join(tmpdir(), "storytree-owner-said-"));
  const quotePath = join(dir, "directive.txt");
  // The value @path exists for: multi-line, em-dashes, quotes — everything a shell mangles, and
  // exactly the shape a real owner directive takes.
  const multiLine = `${OWNER_WORDS}\n\nand don't paraphrase me — store what I actually said.`;
  await writeFile(quotePath, multiLine, "utf8");

  const env = await run(
    ["adr", "new", "--title", "From a file", "--decided", "--owner-said", `@${quotePath}`],
    { store, adr: fakeAllocator(533), writable: true, now: () => new Date("2026-09-05T02:00:00Z") },
  );
  assert.equal(env.ok, true, env.body);
  // Classified LITERAL instead, this would store the string "@C:/…/directive.txt" — a corrupt record
  // that still reports success, which is the whole reason the two-class split exists.
  assert.equal(authorityOf(await rowOf(store, 533))?.["ownerSaid"], multiLine);
});

test("the two flags sit on OPPOSITE sides of the @path split, and that pairing is deliberate", () => {
  // `at-path.test.ts` asserts the two sets are exhaustive over declared flags; it cannot assert that
  // THESE two landed on the right sides. A durable prose record must be readable from a file; a
  // four-value enum word must not be, so a basis that genuinely begins with `@` stays the caller's
  // own bytes rather than becoming a file read.
  assert.equal(PROSE_FLAGS.has("owner-said"), true, "--owner-said is PROSE");
  assert.equal(LITERAL_FLAGS.has("owner-said"), false, "and not also LITERAL");
  assert.equal(LITERAL_FLAGS.has("basis"), true, "--basis is LITERAL");
  assert.equal(PROSE_FLAGS.has("basis"), false, "and not also PROSE");
});

// ─── the help text is the discoverability surface, so it is asserted ──────────────────────────

/**
 * Assert the help carries a phrase WITHOUT dumping the help text on failure.
 *
 * ⚠ DELIBERATELY NOT `assert.match(help, /…/)`, and this is an instrument fix rather than a style
 * preference. `adr help` is ~5KB, and both `match` and `equal` embed the whole haystack in the
 * failure message. Under the mutation rung that failure IS the kill signal, and the runner truncates
 * a test process's output at 600 chars — so a 5KB assertion message pushed the structured test-id
 * event out of the captured window and the kill came back unattributed. The result was six mutants
 * scored UNPROVEN ("killed, but the report named no test") in CI while passing locally, where the
 * run is fast enough and uncontended. `ok` + a short message keeps the payload to one line, which
 * is what makes these kills attributable.
 */
function assertHelpCarries(help: string, needle: string): void {
  assert.ok(help.includes(needle), `adr help is missing: ${JSON.stringify(needle)}`);
}

test("adr help documents both flags, what they mean, and the rule that binds them", async () => {
  const env = await adrCommand("help", {}, depsFor(null));
  const help = env.body;
  // The synopsis: someone scanning for the invocation must see the pair, and that --basis exists.
  assertHelpCarries(help, "--decided --owner-said <text|@file>");
  assertHelpCarries(help, "[--basis <b>]");
  // The --basis entry: all four values, and that the default claims the least.
  assertHelpCarries(help, "WHOSE call this was (ADR-0519)");
  assertHelpCarries(help, "owner-directed | owner-ratified | agent-derived |");
  assertHelpCarries(help, "agent-flipped. Omit and it derives from --decided");
  assertHelpCarries(help, "the default claims the LEAST, on purpose");
  // The --owner-said entry, matched as a WHOLE LINE — the synopsis carries the same flag spelling,
  // so a substring test would pass with this entry deleted entirely. A line-array membership test
  // does the anchoring a `/…/m` regex would, and still prints nothing but the needle on failure.
  assert.ok(
    help.split("\n").includes("  --owner-said <text|@file>"),
    "adr help has no standalone --owner-said entry line",
  );
  assertHelpCarries(help, "VERBATIM directive — his words, never your paraphrase");
  assertHelpCarries(help, "either owner basis and refused on an agent one");
  // The two facts a reader most needs and would otherwise have to discover by being refused.
  assertHelpCarries(help, "honest basis is agent-derived");
  assertHelpCarries(help, "`adr push` of an edited body cannot rewrite it");
});

// ─── the pure resolver and the shared predicates ──────────────────────────────────────────────

test("resolveAuthority derives the basis from --decided, and --basis wins when both are given", () => {
  const base = { scribedBy: "s", at: "2026-09-05" };
  const derivedOwner = resolveAuthority({ ...base, decided: true, ownerSaid: "go" });
  assert.equal(derivedOwner.ok && derivedOwner.authority.basis, "owner-directed");
  const derivedAgent = resolveAuthority({ ...base, decided: false });
  assert.equal(derivedAgent.ok && derivedAgent.authority.basis, "agent-derived");
  const explicit = resolveAuthority({ ...base, decided: false, basis: "owner-ratified", ownerSaid: "yes" });
  assert.equal(explicit.ok && explicit.authority.basis, "owner-ratified");
});

test("a stamp that breaks TWO rules reports both, one per line", () => {
  // A blank scribe AND an unquoted owner claim. Two issues, and the caller must see both — a
  // refusal that surfaced only the first would send them round the loop twice. This is also the
  // only arm where the `join("\n")` is observable: with one issue a separator changes nothing.
  const refused = resolveAuthority({ scribedBy: "  ", at: "2026-09-05", decided: true });
  assert.equal(refused.ok, false);
  const reason = refused.ok === false ? refused.reason : "";
  assert.match(reason, /non-blank/);
  assert.match(reason, /must quote the owner verbatim/);
  assert.equal(reason.split("\n").length, 2, "one issue per line, not run together");
});

test("a blank --owner-said is treated as absent, so whitespace cannot satisfy an owner claim", () => {
  const refused = resolveAuthority({
    scribedBy: "s",
    at: "2026-09-05",
    decided: true,
    ownerSaid: "   \n  ",
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && /must quote the owner verbatim/.test(refused.reason), true);
});

test("the schema refuses a backfilled stamp that also carries owner words (D5's fence)", () => {
  // The backfill reads a basis off the record's own prose and no owner words were ever captured, so
  // a stamp claiming BOTH would be presenting a reconstruction as evidence — forging exactly what
  // the field exists to make trustworthy.
  const both = DecisionAuthority.safeParse({
    basis: "owner-directed",
    scribedBy: "backfill",
    at: "2026-09-05",
    transcribedFromProse: true,
    ownerSaid: "reconstructed from an agent's summary",
  });
  assert.equal(both.success, false);
  // ...while the backfill's legitimate shape — an owner claim, openly marked as transcribed, with no
  // quote — validates. That is what lets D5 stamp 298 rows without overstating any of them.
  const transcribed = DecisionAuthority.safeParse({
    basis: "owner-directed",
    scribedBy: "backfill",
    at: "2026-09-05",
    transcribedFromProse: true,
  });
  assert.equal(transcribed.success, true);
});

test("transcribedFromProse is meaningless on an agent basis and is refused there", () => {
  const parsed = DecisionAuthority.safeParse({
    basis: "agent-derived",
    scribedBy: "backfill",
    at: "2026-09-05",
    transcribedFromProse: true,
  });
  assert.equal(parsed.success, false);
});

test("a blank scribedBy fails closed — every stamp names the session that wrote it", () => {
  const parsed = DecisionAuthority.safeParse({ basis: "agent-derived", scribedBy: "  ", at: "2026-09-05" });
  assert.equal(parsed.success, false);
});

test("an unknown key on the stamp fails closed rather than riding along unread", () => {
  const parsed = DecisionAuthority.safeParse({
    basis: "agent-derived",
    scribedBy: "s",
    at: "2026-09-05",
    verifiedByOwner: true,
  });
  assert.equal(parsed.success, false, "a strict schema is what stops an unread field reading as a guarantee");
});

test("hasQuotedOwnerDirective keeps the THREE states apart — unstamped, transcribed, quoted", () => {
  assert.equal(hasQuotedOwnerDirective(undefined), false, "no stamp at all");
  const transcribed = DecisionAuthority.parse({
    basis: "owner-directed",
    scribedBy: "backfill",
    at: "2026-09-05",
    transcribedFromProse: true,
  });
  // The distinction the predicate exists to protect: a backfilled claim read off prose is NOT the
  // same evidence as a record authored with the owner in the room, and flattening the two would
  // silently promote 298 rows into a class none of them earned.
  assert.equal(hasQuotedOwnerDirective(transcribed), false, "transcribed is not quoted");
  const quoted = DecisionAuthority.parse({
    basis: "owner-directed",
    scribedBy: "cli@claude/x",
    at: "2026-09-05",
    ownerSaid: OWNER_WORDS,
  });
  assert.equal(hasQuotedOwnerDirective(quoted), true);
  // And an agent basis can never reach it, however the record was written.
  assert.equal(isOwnerBasis("agent-flipped"), false);
});
