/**
 * ADR-0533 D4 — the composed statement is what a bare single-record read RETURNS, and the record's
 * own text moves behind `--full`.
 *
 * ## What is actually at risk here, and why the arms are chosen the way they are
 *
 * The machinery being wired already worked: `adr compose` has authored and marked statements since
 * ADR-0428, and `viewArtifact` has printed the banner over the body since. What lands here is a
 * SUBSTITUTION — the read stops printing something — and every way that goes wrong takes text away
 * from a reader rather than merely looking odd:
 *
 *   - It fires on a record with no statement, and 411 of 465 decisions become unreadable.
 *   - It fires on a non-decision, and the whole corpus loses its bodies.
 *   - It swallows the staleness line, leaving a summary that cannot say it is out of date — which
 *     is the ONLY thing this machinery has over an ordinary abstract.
 *   - The flag is unreachable or expensive, and ADR-0533 D2's protection of the record's evidence
 *     dies by ergonomics instead of by decision.
 *
 * So the arms below are mostly ABSENCE arms: what still renders in full, not what was removed.
 *
 * ## The dispatch arm is not ceremony
 *
 * `run([...])` drives every case rather than calling `viewArtifact` directly. A flag can be
 * implemented correctly, typechecked, and unit-tested, and still be dead because the dispatch never
 * passes it — the failure is silent and no test of the function can see it. That is the measured
 * shape of `a-new-cli-verb-has-four-registration-points`; this file is the arm that catches it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { fingerprintDecision } from "@storytree/library";
import { InMemoryStore } from "@storytree/storage-protocol";

import { run } from "./commands.js";

/** A decision body long enough that withholding it is worth something and the count is legible. */
const BENEATH_BODY = "# ADR-0090: the record beneath\n\n## Status\n\naccepted (2026-01-01)\n";
/**
 * A phrase that can ONLY have come from the record's own text.
 *
 * Deliberately a sentinel rather than a natural sentence about evidence or the arguments that lost:
 * the offer block the render prints INSTEAD of the body talks about exactly those, so an assertion
 * phrased that way matches the OFFER and passes while proving the reverse of what it claims. Not
 * hypothetical — it is what the first version of this file did, and both absence arms went green.
 */
const BODY_ONLY = "ADR0100-BODY-SENTINEL";
const FRONTIER_BODY = `# ADR-0100: the frontier\n\n## Status\n\naccepted (2026-01-02)\n\n${`${BODY_ONLY} — one line of preserved evidence. `.repeat(40)}\n`;

const STATEMENT = "The position at this frontier, in one paragraph a reader can calibrate against.";

interface AdrRow {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly dependsOn?: readonly string[];
  readonly composed?: readonly unknown[];
}

const adrId = (n: number): string => `adr-${String(n).padStart(4, "0")}`;

async function storeWith(rows: readonly AdrRow[]): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const row of rows) {
    const id = adrId(row.number);
    const base = {
      kind: "adr",
      id,
      title: row.title,
      description: `ADR-${String(row.number).padStart(4, "0")} — ${row.title}`,
      body: row.body,
      number: row.number,
      status: "accepted",
      supersedes: [],
      loadBearing: false,
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-06T00:00:00.000Z",
    };
    // Two optional keys, each ABSENT rather than empty when it does not apply: `composed` absent is
    // "no statement was ever written here", which the schema keeps distinguishable from a drained
    // list (ADR-0223), and that distinction is the whole subject of the no-statement arm below.
    const withDepends = row.dependsOn === undefined ? base : { ...base, dependsOn: row.dependsOn };
    const doc = row.composed === undefined ? withDepends : { ...withDepends, composed: row.composed };
    await store.upsertDoc({ id, kind: "adr", doc });
  }
  return store;
}

/** The basis a statement composed over ADR-0090 AS IT STANDS carries — so the marker reads current. */
function currentBasis(): readonly unknown[] {
  return [{ decision: 90, fingerprint: fingerprintDecision({ status: "accepted", body: BENEATH_BODY }) }];
}

/** A frontier carrying a CURRENT statement, over one record beneath. */
function composedCorpus(): Promise<InMemoryStore> {
  return storeWith([
    { number: 90, title: "the record beneath", body: BENEATH_BODY },
    {
      number: 100,
      title: "the frontier",
      body: FRONTIER_BODY,
      dependsOn: ["asset:adr-0090"],
      composed: [{ statement: STATEMENT, composedAt: "2026-09-06", basis: currentBasis() }],
    },
  ]);
}

// ─── the substitution itself ──────────────────────────────────────────────────────────────────

test("a bare read of a COMPOSED decision returns the statement, not the record's body", async () => {
  const env = await run(["library", "artifact", "adr-0100"], { store: await composedCorpus() });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /CURRENT POSITION AT THIS FRONTIER/);
  assert.ok(env.body.includes(STATEMENT), "the composed statement is what the read returns");
  // The body is DEFERRED, not deleted. Pinned on a phrase from the record's own text rather than on
  // a length, so a render that merely truncated the body would still fail here.
  assert.equal(
    env.body.includes(BODY_ONLY),
    false,
    "the record's own text must not be printed on the default read",
  );
});

test("the read says the text is missing, what it costs, and the exact command that opens it", async () => {
  const env = await run(["library", "artifact", "adr-0100"], { store: await composedCorpus() });
  assert.match(env.body, /THE RECORD'S OWN TEXT IS NOT ABOVE/);
  // The COST is the load-bearing half: the statement's job is telling a reader whether the record is
  // worth opening, and "worth" is unanswerable without a price. The count is the body's, so it is
  // asserted against the fixture's own length rather than against a number copied into this file.
  assert.ok(
    env.body.includes(FRONTIER_BODY.length.toLocaleString("en-US")),
    "the offer states the size of what is being withheld",
  );
  assert.match(env.body, /storytree library artifact adr-0100 --full/);
});

test("the WHOLE composed read, byte for byte — the exact text a reader is handed", async () => {
  // ONE golden over the entire rendered body, not a scatter of `assert.match` probes and not an
  // `includes` of the offer block. Three reasons, and the third is why the first draft of this test
  // was not good enough:
  //
  //   1. Probes leave every unprobed line unpinned, so the mutation rung charges for prose no arm
  //      discriminates — the house convention is to pin the body once instead.
  //   2. This render IS the deliverable. Whether the flag reads as obvious is a property of the
  //      words and their layout, which a set of substring matches cannot hold.
  //   3. ⚠ A SUBSTRING GOLDEN CANNOT PIN ITS OWN EDGES. The first version asserted
  //      `body.includes(offerBlock)` with the leading and trailing blank lines inside the expected
  //      string — and the mutation rung killed it: turning either `""` into any other text leaves
  //      the expected substring still present, just with something now beside it. `includes` can
  //      never see what surrounds it. Equality over the whole body is what makes the blank lines
  //      assertable, and they are load-bearing here (the authority stamp above ends without one).
  const env = await run(["library", "artifact", "adr-0100"], { store: await composedCorpus() });
  assert.equal(
    env.body,
    "# the frontier    [adr]\n" +
      "id: adr-0100\n" +
      "\n" +
      "ADR-0100 — the frontier\n" +
      "\n" +
      "CURRENT POSITION AT THIS FRONTIER — composed 2026-09-06 over 1 record beneath, and nothing beneath has moved since\n" +
      "\n" +
      `${STATEMENT}\n` +
      "\n" +
      "\n" +
      `  ⋯ THE RECORD'S OWN TEXT IS NOT ABOVE — ${FRONTIER_BODY.length.toLocaleString("en-US")} characters, one command away:\n` +
      "\n" +
      "        storytree library artifact adr-0100 --full\n" +
      "\n" +
      "    A composed statement is a summary, and a summary can be wrong in a way the record cannot.\n" +
      "    The evidence, the traps and the arguments that lost are all in the full text — open it when\n" +
      "    this decision bears on what you are deciding (ADR-0533 D1/D2).\n",
  );
});

test("the --full offer is the FIRST next: branch, ahead of every edge out of the record", async () => {
  const env = await run(["library", "artifact", "adr-0100"], { store: await composedCorpus() });
  // POSITION, not presence. ADR-0533 D2 keeps the record's evidence whole, and the increment names
  // ergonomics as the way that protection is defeated — an offer sitting sixth among authored edges
  // is reachable and not obvious, which is the failure wearing a passing test.
  assert.match((env.next ?? [])[0] ?? "", /^storytree library artifact adr-0100 --full/);
  // And it does not displace the onward nav it was prepended to.
  assert.ok(
    (env.next ?? []).some((n) => n.startsWith("storytree library artifact adr-0090")),
    "the authored depends_on edge survives the prepend",
  );
});

test("--full returns the whole record, statement and all", async () => {
  const env = await run(["library", "artifact", "adr-0100", "--full"], { store: await composedCorpus() });
  assert.equal(env.ok, true, env.body);
  assert.ok(env.body.includes(BODY_ONLY), "the body is printed in full");
  // ADDITIVE, per ADR-0428 D4: the flag opens the record, it does not trade the statement away.
  assert.ok(env.body.includes(STATEMENT), "the statement stays above the body it covers");
  assert.equal(
    env.body.includes("THE RECORD'S OWN TEXT IS NOT ABOVE"),
    false,
    "no offer to open what is already open",
  );
  assert.equal(
    (env.next ?? []).some((n) => n.includes("--full")),
    false,
    "and no --full branch on a --full read",
  );
});

test("`adr compose <n>` points onward at --full, not at the read showing the same statement", async () => {
  // The second surface that renders a statement, and the one that quietly broke. Before ADR-0533 D4
  // a bare `library artifact <id>` WAS the whole record, so it was the right onward branch from a
  // statement — "and here is what it was composed over". It now returns this same paragraph, so the
  // un-updated line hands a caller back exactly what they are already looking at. A nav edge to
  // nowhere is not something a render test notices, because the line is still there and still valid.
  const env = await run(["adr", "compose", "100"], { store: await composedCorpus() });
  assert.equal(env.ok, true, env.body);
  assert.ok(env.body.includes(STATEMENT), "compose <n> still reads the statement");
  assert.match((env.next ?? [])[0] ?? "", /^storytree library artifact adr-0100 --full/);
  assert.equal(
    (env.next ?? []).some((n) => n === "storytree library artifact adr-0100"),
    false,
    "the bare read is no longer the onward branch from a statement",
  );
});

// ─── the absences: what this must NOT reach ───────────────────────────────────────────────────

test("a decision with NO composed statement renders its body in full, unchanged", async () => {
  // 411 of 465 records at decision time. There is nothing to substitute, so a substitution that
  // fired here would not shorten the read — it would make most of the decision log unreadable.
  const env = await run(["library", "artifact", "adr-0090"], {
    store: await composedCorpus(),
  });
  assert.equal(env.ok, true, env.body);
  assert.ok(env.body.includes("## Status"), "the record's own text is still the read");
  assert.equal(env.body.includes("THE RECORD'S OWN TEXT IS NOT ABOVE"), false);
  assert.equal((env.next ?? []).some((n) => n.includes("--full")), false, "nothing is being withheld to offer");
});

test("a NON-DECISION artifact is untouched — the substitution is a decision-log rule", async () => {
  const store = await composedCorpus();
  await store.upsertDoc({
    id: "some-principle",
    kind: "principle",
    doc: {
      kind: "principle",
      id: "some-principle",
      title: "a principle",
      description: "one line",
      body: `a non-decision body carrying ${BODY_ONLY}`,
      assertion: "a principle asserts something",
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-06T00:00:00.000Z",
    },
  });
  const env = await run(["library", "artifact", "some-principle"], { store });
  assert.equal(env.ok, true, env.body);
  assert.ok(env.body.includes(BODY_ONLY), "a principle renders its body, exactly as it always did");
});

// ─── the staleness line: the one thing an abstract cannot do ──────────────────────────────────

test("a STALE statement keeps its outstanding-effects marker on the shortened read", async () => {
  // The increment's words: a paragraph without its staleness line is a summary that cannot tell the
  // reader it is out of date, which is the single thing this machinery has over an ordinary
  // abstract. Substituting the statement for the body while dropping the marker would ship exactly
  // that — and it would look correct, because the paragraph would still be there.
  const store = await storeWith([
    { number: 90, title: "the record beneath", body: `${BENEATH_BODY}\nAND IT HAS SINCE MOVED.\n` },
    {
      number: 100,
      title: "the frontier",
      body: FRONTIER_BODY,
      dependsOn: ["asset:adr-0090"],
      // The basis was stamped over the PRE-move text, so ADR-0090 now reads as a changed effect.
      composed: [{ statement: STATEMENT, composedAt: "2026-09-06", basis: currentBasis() }],
    },
  ]);
  const env = await run(["library", "artifact", "adr-0100"], { store });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /EFFECTS NOT YET APPLIED — 1 record beneath moved/);
  assert.match(env.body, /ADR-0090/);
  // Still shortened — the marker is not an escape hatch back to the full body.
  assert.equal(env.body.includes(BODY_ONLY), false);
});

// ─── the flag is refused where nothing reads it ───────────────────────────────────────────────

test("--full on a verb that does not read it is REFUSED, never ignored — the whole message", async () => {
  // `--raw`'s and `--out`'s rule, applied to a flag whose whole meaning is "give me all of it": a
  // caller who types it has just been told part of a record is missing, so an ignored one hands back
  // a view they will read AS the complete thing. Golden for the same reason the read above is.
  const refused = await run(["arc", "show", "some-arc", "--full"], { store: await composedCorpus() });
  assert.equal(refused.ok, false);
  assert.equal(
    refused.body,
    "`--full` opens the whole record behind a composed decision's statement, and `arc show` is not that read.\n" +
      "\n" +
      "the verbs that honour it:\n" +
      "  storytree library artifact <id> --full\n" +
      "\n" +
      "It is refused rather than ignored on purpose: a silently-dropped `--full` returns a view that\n" +
      "is not the full record, to a caller who asked for the full record and cannot tell the\n" +
      "difference from what they get back.",
  );
  assert.deepEqual(refused.next, ["storytree library artifact <id> --full"]);
});

test("the refusal names an AREA with no sub-verb as just the area", async () => {
  // The other arm of `spelled`'s ternary. Without it the two branches are interchangeable, and a
  // reader refused at `storytree arc --full` would be told the offending verb was `arc undefined`.
  const refused = await run(["arc", "--full"], { store: await composedCorpus() });
  assert.equal(refused.ok, false);
  assert.match(refused.body, /and `arc` is not that read\./);
});

test("--full needs BOTH halves of the verb to match — neither alone admits it", async () => {
  // `fullIsRead` is `a === area && s === sub`, and each conjunct has to be shown to carry weight or
  // the pair collapses into whichever half happens to be tested.
  const store = await composedCorpus();
  // Right area, wrong sub. Kills `s === sub -> true` and the `&&` -> `||` widening.
  const wrongSub = await run(["library", "search", "anything", "--full"], { store });
  assert.equal(wrongSub.ok, false, "library search does not honour --full");
  assert.match(wrongSub.body, /and `library search` is not that read\./);
  // Wrong area, right sub. Kills `a === area -> true`. Contrived as a command and exact as a fence:
  // the table is keyed on the PAIR, and a match on the sub word alone would admit any area that
  // ever grows an `artifact` sub-verb.
  const wrongArea = await run(["arc", "artifact", "x", "--full"], { store });
  assert.equal(wrongArea.ok, false, "only library's artifact read honours --full");
  assert.match(wrongArea.body, /and `arc artifact` is not that read\./);
});

test("a bare command carrying no --full is unaffected by the guard", async () => {
  // `full` is declared with `default: false`, so the parser hands back a value on EVERY command. A
  // guard written as `!== undefined` would have refused the entire CLI, and would have done it on
  // the first command anyone ran.
  const env = await run(["library", "artifact", "adr-0090"], { store: await composedCorpus() });
  assert.equal(env.ok, true, env.body);
});
