/**
 * WHO STARTED THIS SESSION — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (ADR-0484 D7).
 *
 * Pure by construction, so every case here injects the environment and the persisted declaration
 * rather than touching `process.env` or the disk: the whole precedence is decided by values, and the
 * suite is HOME-independent and order-independent for the same reason `session-identity.test.ts` is.
 *
 * Covers the contracts declared in `stories/context-traversal-capture/terminal-capture-activation.md`:
 *   6. an-undeclared-session-resolves-to-no-origin-and-is-never-defaulted-to-human
 *   7. a-declaration-wins-over-the-environment-and-neither-is-ever-inferred
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifySessionOrigin,
  declareSessionOrigin,
  describeSessionOrigin,
  foldSessionOrigin,
  parseSessionOriginDeclaration,
  censusSessionOrigins,
  resolveSessionOrigin,
  undeclaredOriginNudge,
  CUT_BY_SESSION_ENV,
  CUT_FOR_UNIT_ENV,
  SESSION_ORIGIN_ENV,
} from "./session-origin.js";
import type { SessionOriginDeclaration } from "./session-origin.js";

/** Resolve against an environment alone — the channel a storytree-owned launcher would set. */
function fromEnv(env: Record<string, string | undefined>): ReturnType<typeof resolveSessionOrigin> {
  return resolveSessionOrigin({ env, declaration: null });
}

test("a-declaration-wins-over-the-environment-and-neither-is-ever-inferred: the three environment names are the published contract, spelled out", () => {
  // A launcher sets these; nothing in this repo can tell it what they are called except these
  // constants, so a test using only the constants would agree with any spelling at all.
  assert.equal(SESSION_ORIGIN_ENV, "STORYTREE_SESSION_ORIGIN");
  assert.equal(CUT_BY_SESSION_ENV, "STORYTREE_CUT_BY");
  assert.equal(CUT_FOR_UNIT_ENV, "STORYTREE_CUT_FOR");
  assert.equal(new Set([SESSION_ORIGIN_ENV, CUT_BY_SESSION_ENV, CUT_FOR_UNIT_ENV]).size, 3);
});

test("an-undeclared-session-resolves-to-no-origin-and-is-never-defaulted-to-human: an empty environment and no declaration resolve to NOTHING", () => {
  assert.equal(fromEnv({}), null);
  assert.equal(resolveSessionOrigin({ env: {}, declaration: null }), null);

  // The whole failure mode this module exists to prevent, stated as an assertion rather than as a
  // comment: nothing about an absent declaration may produce a `human` origin.
  const unresolved = resolveSessionOrigin({ env: { PATH: "/usr/bin" }, declaration: null });
  assert.equal(unresolved, null, "an unrelated environment declares nothing");
});

test("an-undeclared-session-resolves-to-no-origin-and-is-never-defaulted-to-human: an unrecognised or blank origin word states nothing, and is not coerced into either value", () => {
  assert.equal(fromEnv({ [SESSION_ORIGIN_ENV]: "agent" }), null);
  assert.equal(fromEnv({ [SESSION_ORIGIN_ENV]: "HUMAN" }), null, "the word is exact — no case folding invents a claim");
  assert.equal(fromEnv({ [SESSION_ORIGIN_ENV]: "" }), null);
  assert.equal(fromEnv({ [SESSION_ORIGIN_ENV]: "   " }), null);

  // ...but an unrecognised word does not SUPPRESS a claim made by the other channel: the cutter is
  // still named, and a session that knows only "I was cut, by something" is more than nothing.
  assert.deepEqual(fromEnv({ [SESSION_ORIGIN_ENV]: "agent", [CUT_BY_SESSION_ENV]: "parent-window" }), {
    kind: "cut",
    cutBy: "parent-window",
    cutFor: null,
  });
});

test("an-undeclared-session-resolves-to-no-origin-and-is-never-defaulted-to-human: `cut-for` ALONE is not a claim of origin", () => {
  // A human-started session driving an increment could carry the same value honestly, so promoting
  // it would be an inference rather than a record — the one thing the increment forbids outright.
  assert.equal(fromEnv({ [CUT_FOR_UNIT_ENV]: "linked-session-context-arc" }), null);

  // ...and a cutter of pure whitespace names NOBODY, which is where the trim is observable: a blank
  // that survived would resolve `cut` with an empty cutter — a claim nobody made.
  assert.equal(fromEnv({ [CUT_BY_SESSION_ENV]: "   " }), null);
});

test("a-declaration-wins-over-the-environment-and-neither-is-ever-inferred: each channel resolves the origin it states, with the riders it carries", () => {
  assert.deepEqual(fromEnv({ [SESSION_ORIGIN_ENV]: "human" }), {
    kind: "human",
    cutBy: null,
    cutFor: null,
  });

  // `cut` with nothing else is a complete answer, not a degraded one.
  assert.deepEqual(fromEnv({ [SESSION_ORIGIN_ENV]: "cut" }), { kind: "cut", cutBy: null, cutFor: null });

  // Naming a cutter IS the claim — the origin word is not required beside it.
  assert.deepEqual(fromEnv({ [CUT_BY_SESSION_ENV]: "  parent-window  " }), {
    kind: "cut",
    cutBy: "parent-window",
    cutFor: null,
  });

  assert.deepEqual(
    fromEnv({
      [SESSION_ORIGIN_ENV]: "cut",
      [CUT_BY_SESSION_ENV]: "parent-window",
      [CUT_FOR_UNIT_ENV]: "trace-records-whether-a-session-was-cut-or-human-started",
    }),
    {
      kind: "cut",
      cutBy: "parent-window",
      cutFor: "trace-records-whether-a-session-was-cut-or-human-started",
    },
  );
});

test("a-declaration-wins-over-the-environment-and-neither-is-ever-inferred: a `human` origin drops both riders, from either channel", () => {
  // A session an operator started was cut by nobody, for nothing. Carrying either value through
  // would put a field on the row a later reader could quote back as a cut.
  assert.deepEqual(
    fromEnv({
      [SESSION_ORIGIN_ENV]: "human",
      [CUT_BY_SESSION_ENV]: "parent-window",
      [CUT_FOR_UNIT_ENV]: "some-arc",
    }),
    { kind: "human", cutBy: null, cutFor: null },
  );

  const declaration: SessionOriginDeclaration = {
    v: 1,
    origin: "human",
    cutBy: "parent-window",
    cutFor: "some-arc",
    declaredAt: "2026-08-31T00:00:00.000Z",
  };
  assert.deepEqual(resolveSessionOrigin({ env: {}, declaration }), {
    kind: "human",
    cutBy: null,
    cutFor: null,
  });
});

test("a-declaration-wins-over-the-environment-and-neither-is-ever-inferred: the declaration wins because it is keyed by this session, and an exported variable is not", () => {
  const declaration: SessionOriginDeclaration = {
    v: 1,
    origin: "cut",
    cutBy: "the-session-that-actually-cut-me",
    cutFor: null,
    declaredAt: "2026-08-31T00:00:00.000Z",
  };

  // A stale exported variable — inherited from a shell that set it for a different session — loses
  // to the session's own statement about itself, in BOTH directions.
  assert.deepEqual(
    resolveSessionOrigin({
      env: { [SESSION_ORIGIN_ENV]: "human", [CUT_BY_SESSION_ENV]: "somebody-else" },
      declaration,
    }),
    { kind: "cut", cutBy: "the-session-that-actually-cut-me", cutFor: null },
  );

  assert.deepEqual(
    resolveSessionOrigin({
      env: { [SESSION_ORIGIN_ENV]: "cut", [CUT_BY_SESSION_ENV]: "somebody-else" },
      declaration: { v: 1, origin: "human", cutBy: null, cutFor: null, declaredAt: null },
    }),
    { kind: "human", cutBy: null, cutFor: null },
  );
});

test("a-declaration-wins-over-the-environment-and-neither-is-ever-inferred: a declaration this reader cannot understand is no claim at all", () => {
  assert.deepEqual(
    parseSessionOriginDeclaration({ v: 1, origin: "cut", cutBy: "a", cutFor: "b", declaredAt: "t" }),
    { v: 1, origin: "cut", cutBy: "a", cutFor: "b", declaredAt: "t" },
  );

  // A document with only what it must have: the absent riders degrade to null rather than rejecting
  // the ORIGIN, which is the part that matters.
  assert.deepEqual(parseSessionOriginDeclaration({ v: 1, origin: "human" }), {
    v: 1,
    origin: "human",
    cutBy: null,
    cutFor: null,
    declaredAt: null,
  });

  // A rider of the wrong SHAPE degrades the same way — it never takes the origin down with it.
  assert.deepEqual(parseSessionOriginDeclaration({ v: 1, origin: "cut", cutBy: 42, cutFor: "" }), {
    v: 1,
    origin: "cut",
    cutBy: null,
    cutFor: null,
    declaredAt: null,
  });

  // ...while an unusable ORIGIN, an unknown version, or a non-document is refused outright: null
  // resolves to no origin, which is the honest answer and never a guess.
  assert.equal(parseSessionOriginDeclaration({ v: 1, origin: "agent" }), null);
  assert.equal(parseSessionOriginDeclaration({ v: 2, origin: "cut" }), null);
  assert.equal(parseSessionOriginDeclaration({ origin: "cut" }), null);
  assert.equal(parseSessionOriginDeclaration("cut"), null);
  assert.equal(parseSessionOriginDeclaration(null), null);
});

test("an-undeclared-session-resolves-to-no-origin-and-is-never-defaulted-to-human: an absent line is not a competing claim, and only a contradiction is mixed", () => {
  assert.equal(classifySessionOrigin([]), "unknown");
  assert.equal(classifySessionOrigin([undefined, undefined]), "unknown");
  assert.equal(classifySessionOrigin(["human"]), "human");
  assert.equal(classifySessionOrigin(["cut", "cut"]), "cut");

  // ⚠ THE DELIBERATE DIVERGENCE FROM `classifyTraceIdentity`. There, an ungraded line is a positive
  // fact about the era it was written in, so blanks beside grades really are mixed. Here a blank
  // says only "not declared YET", and a session that declares at minute ten was cut at minute zero
  // — so its earlier lines must not be counted against it, or nearly every declared session would
  // render `mixed` and the reading would carry no information.
  assert.equal(classifySessionOrigin([undefined, undefined, "cut"]), "cut");
  assert.equal(classifySessionOrigin(["human", undefined]), "human");

  // `mixed` is reserved for the one shape that really is contradictory.
  assert.equal(classifySessionOrigin(["human", "cut"]), "mixed");
  assert.equal(classifySessionOrigin(["cut", undefined, "human"]), "mixed");
});

test("an-undeclared-session-resolves-to-no-origin-and-is-never-defaulted-to-human: the fold collects distinct riders in first-seen order and drops the ones that name nobody", () => {
  const folded = foldSessionOrigin([
    { origin: undefined, cutBy: null, cutFor: null },
    { origin: "cut", cutBy: "parent-b", cutFor: "arc-two" },
    { origin: "cut", cutBy: "parent-a", cutFor: "arc-one" },
    { origin: "cut", cutBy: "parent-b", cutFor: "arc-two" },
    { origin: "cut", cutBy: "", cutFor: "" },
    { origin: "cut", cutBy: null, cutFor: undefined },
    { origin: "cut", cutBy: 42, cutFor: { not: "a string" } },
  ]);

  assert.deepEqual(folded, {
    reading: "cut",
    cutBy: ["parent-b", "parent-a"],
    cutFor: ["arc-two", "arc-one"],
  });

  assert.deepEqual(foldSessionOrigin([]), { reading: "unknown", cutBy: [], cutFor: [] });
});

test("an-undeclared-session-resolves-to-no-origin-and-is-never-defaulted-to-human: the `unknown` description says outright that it is not `human`", () => {
  const unknown = describeSessionOrigin("unknown");
  assert.match(unknown, /NOT a synonym for human/i);

  // The reading a figure would otherwise be attributed to the owner says what it actually means.
  assert.match(describeSessionOrigin("cut"), /handover/i);
  assert.match(describeSessionOrigin("human"), /operator/i);
  assert.match(describeSessionOrigin("mixed"), /CONTRADICTORY/i);

  // Four distinct sentences — a describe that collapsed two readings onto one wording would let a
  // render state the right word beside the wrong explanation.
  const all = ["human", "cut", "unknown", "mixed"] as const;
  assert.equal(new Set(all.map(describeSessionOrigin)).size, all.length);
});

test("a-declaration-wins-over-the-environment-and-neither-is-ever-inferred: declaring obeys the SAME three rules the resolver does, and refuses by reason rather than narrowing", () => {
  const AT = "2026-08-31T09:00:00.000Z";

  // Naming a cutter is the claim, with or without the word beside it.
  assert.deepEqual(declareSessionOrigin({ cutBy: "predecessor", cutFor: "some-arc" }, AT), {
    declaration: { v: 1, origin: "cut", cutBy: "predecessor", cutFor: "some-arc", declaredAt: AT },
  });
  assert.deepEqual(declareSessionOrigin({ origin: "cut" }, AT), {
    declaration: { v: 1, origin: "cut", cutBy: null, cutFor: null, declaredAt: AT },
  });
  assert.deepEqual(declareSessionOrigin({ origin: "human" }, AT), {
    declaration: { v: 1, origin: "human", cutBy: null, cutFor: null, declaredAt: AT },
  });

  // The three refusals, each by CODE — the sentence is the CLI's business, the rule is this one's.
  assert.deepEqual(declareSessionOrigin({ origin: "agent" }, AT), {
    refusedBecause: "origin-word-unknown",
  });
  assert.deepEqual(declareSessionOrigin({ origin: "" }, AT), {
    refusedBecause: "origin-word-unknown",
  });
  assert.deepEqual(declareSessionOrigin({ origin: "human", cutBy: "predecessor" }, AT), {
    refusedBecause: "human-carries-no-cut-riders",
  });
  assert.deepEqual(declareSessionOrigin({ origin: "human", cutFor: "some-arc" }, AT), {
    refusedBecause: "human-carries-no-cut-riders",
  });
  assert.deepEqual(declareSessionOrigin({ cutFor: "some-arc" }, AT), {
    refusedBecause: "cut-for-alone-declares-nothing",
  });
  assert.deepEqual(declareSessionOrigin({}, AT), { refusedBecause: "nothing-to-declare" });

  // AND IT AGREES WITH THE RESOLVER, asserted rather than trusted: every request this judge accepts
  // resolves back to the origin it recorded. Two copies of one rule drift silently; this is the
  // assertion that would catch it.
  for (const request of [
    { origin: "human" },
    { origin: "cut" },
    { cutBy: "predecessor" },
    { origin: "cut", cutBy: "predecessor", cutFor: "some-arc" },
  ]) {
    const outcome = declareSessionOrigin(request, AT);
    assert.ok("declaration" in outcome, `${JSON.stringify(request)} should be declarable`);
    const resolved = resolveSessionOrigin({ env: {}, declaration: outcome.declaration });
    assert.equal(resolved?.kind, outcome.declaration.origin);
    assert.deepEqual(resolveSessionOrigin({ env: request as Record<string, string>, declaration: null }), null);
  }
});

// ---------------------------------------------------------------------------
// undeclaredOriginNudge — the SessionStart ask (ADR-0487)
// ---------------------------------------------------------------------------

/** A declared origin, in the shape the resolver returns one. */
const DECLARED_HUMAN = { kind: "human", cutBy: null, cutFor: null } as const;

/**
 * The whole ask, pinned verbatim.
 *
 * A golden rather than a handful of `assert.match` probes, because this line is CONCATENATED from
 * six string literals and each one is separately mutable to `""` — a regex kills only the segment it
 * quotes and leaves the rest able to empty silently. Every clause here is load-bearing: the session
 * id, both declaration shapes, the sentence saying where the answer is legible (without which the
 * ask invites the guess this module exists to refuse), and the closing refusal to infer. It is
 * deliberately brittle — rewording the ask is meant to fail here.
 */
const ORIGIN_NUDGE_LINE =
  '[storytree] Session "window-abc" has NOT declared its ORIGIN (ADR-0487) — so every line it ' +
  "traces reads `unknown`, which is never a synonym for human-started. You can answer this from " +
  "your own opening: an operator's prompt means `human`, a predecessor's brief means `cut`. " +
  "Declare it once, and every line from here on carries the answer: pnpm storytree traversal " +
  "origin --origin human — or, if a predecessor briefed you, pnpm storytree traversal origin " +
  "--cut-by <the session that cut you, when its brief names it> [--cut-for <arc-or-increment-id>]. " +
  "Nothing infers this, and nothing may: an origin nobody stated stays absent rather than guessed.\n";

test("undeclaredOriginNudge: an undeclared session with a trace identity is ASKED, and the whole ask is pinned", () => {
  assert.equal(undeclaredOriginNudge({ sessionId: "window-abc", origin: null }), ORIGIN_NUDGE_LINE);
  // SessionStart stdout is line-oriented — the claim nudge beside this one ends the same way, and a
  // missing terminator would run the two asks together into one unreadable paragraph.
  assert.ok(ORIGIN_NUDGE_LINE.endsWith("\n"));
});

test("undeclaredOriginNudge: SILENT once answered — by a declaration or by the environment", () => {
  assert.equal(
    undeclaredOriginNudge({ sessionId: "window-abc", origin: DECLARED_HUMAN }),
    "",
    "a session that already declared is not asked again",
  );
  // The environment channel resolves to the same shape, so a launcher-set origin silences it too —
  // asserted through the real resolver rather than a hand-built literal, so the two cannot drift.
  const fromLauncher = resolveSessionOrigin({
    env: { [SESSION_ORIGIN_ENV]: "cut", [CUT_BY_SESSION_ENV]: "predecessor" },
    declaration: null,
  });
  assert.notEqual(fromLauncher, null, "precondition: the environment channel resolves an origin");
  assert.equal(
    undeclaredOriginNudge({ sessionId: "window-abc", origin: fromLauncher }),
    "",
    "a launcher that set the environment has already answered; the ask would be noise",
  );
});

test("undeclaredOriginNudge: a session resolving NO trace identity is not asked at all", () => {
  // The primary checkout, CI and the lobby resolve no session id — and those are exactly the runs
  // that capture no trace, so there is no row for an origin to label. Asking there would spend a
  // line of every such start's context on a question with nothing to answer for.
  assert.equal(undeclaredOriginNudge({ sessionId: null, origin: null }), "");
  assert.equal(undeclaredOriginNudge({ sessionId: null, origin: DECLARED_HUMAN }), "");
});

test("undeclaredOriginNudge: PURE — the same inputs give the same line, and it reads no ambient state", () => {
  const once = undeclaredOriginNudge({ sessionId: "window-abc", origin: null });
  const twice = undeclaredOriginNudge({ sessionId: "window-abc", origin: null });
  assert.equal(once, twice);
  // Two different sessions get two different lines, which is the only thing that varies: the ask is
  // otherwise static, so it can be emitted by a hook that opens no store and reads no clock.
  assert.notEqual(once, undeclaredOriginNudge({ sessionId: "window-xyz", origin: null }));
});

// ---------------------------------------------------------------------------
// censusSessionOrigins — the coverage reading (ADR-0487)
// ---------------------------------------------------------------------------

test("censusSessionOrigins: the four counts PARTITION the population exactly", () => {
  const census = censusSessionOrigins(["human", "cut", "cut", "unknown", "unknown", "unknown", "mixed"]);

  assert.equal(census.total, 7);
  assert.equal(census.human, 1);
  assert.equal(census.cut, 2);
  assert.equal(census.unknown, 3);
  assert.equal(census.mixed, 1);
  // The property that makes the reading trustworthy: no session is counted twice and none is
  // dropped. A census whose parts did not sum to its whole could report any share at all.
  assert.equal(census.human + census.cut + census.unknown + census.mixed, census.total);
});

test("censusSessionOrigins: the share counts only QUOTABLE origins — `mixed` is excluded, `unknown` is never subtracted", () => {
  const census = censusSessionOrigins(["human", "cut", "mixed", "unknown"]);
  // 2 of 4, not 3 of 4 (mixed inflating it) and not 2 of 3 (unknown quietly dropped from the
  // denominator). Dropping `unknown` is the specific dishonesty this figure exists to prevent: it
  // would report 100% coverage the moment two sessions declared.
  assert.equal(census.quotableShare, 0.5);

  assert.equal(censusSessionOrigins(["mixed", "mixed"]).quotableShare, 0, "a contradiction is not coverage");
  assert.equal(censusSessionOrigins(["unknown", "unknown"]).quotableShare, 0);
  assert.equal(censusSessionOrigins(["human", "cut"]).quotableShare, 1);
});

test("censusSessionOrigins: an EMPTY population reads zero rather than dividing by zero", () => {
  assert.deepEqual(censusSessionOrigins([]), {
    total: 0,
    human: 0,
    cut: 0,
    unknown: 0,
    mixed: 0,
    quotableShare: 0,
  });
});

test("censusSessionOrigins: today's real shape — a wholly undeclared population reads 0, and says so as `unknown` rather than as `human`", () => {
  // The state this landed into: 811 traces, not one declaration. The census must report that as a
  // fully UNKNOWN population — the moment it reported it as human-started, every downstream figure
  // would inherit the assumption ADR-0484 D7 was built to remove.
  const census = censusSessionOrigins(new Array(811).fill("unknown"));
  assert.equal(census.unknown, 811);
  assert.equal(census.human, 0);
  assert.equal(census.quotableShare, 0);
});
