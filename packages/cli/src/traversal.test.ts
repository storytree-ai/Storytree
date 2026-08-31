/**
 * `storytree traversal origin` — the CLI half of ADR-0484 D7, story `context-traversal-capture`.
 *
 * GLUE, and this file is here for the reason `terminal-capture.test.ts` gives one package over: the
 * RULE lives in `@storytree/context-traversal-capture` (`declareSessionOrigin`, beside the resolver
 * whose rules it mirrors), and what remains here is the surface — which envelope this dispatch hands
 * back, and what it SAYS. On this verb that is not decoration: the report is the only place a cutting
 * session learns the line to put in its successor's brief, and a refusal is the only place an
 * operator learns why a flag combination is impossible rather than believing it was accepted.
 *
 * So the assertions here are on WHOLE BODIES rather than on fragments. A body pinned line by line is
 * a body a later edit must mean to change; a body pinned by one regex is a body whose other nine
 * lines can quietly become empty strings.
 *
 * Every case points `STORYTREE_TRAVERSAL_DIR` at a fresh temporary directory and restores it, so no
 * assertion touches the real `~/.storytree/traces`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { appendTraversalEvents, readSessionOriginDeclaration } from "@storytree/context-traversal-capture";
import { InMemoryStore } from "@storytree/storage-protocol";

import { run } from "./commands.js";
import { traversalCommand, traversalHelp } from "./traversal.js";

const TRAVERSAL_DIR_ENV = "STORYTREE_TRAVERSAL_DIR";
const SESSION_ID_ENV = "STORYTREE_SESSION_ID";
const AT = new Date("2026-08-31T09:00:00.000Z");

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `traversal-cli-${prefix}-`));
}

/** Set env for one call and put it back, whatever the call does. */
async function withEnv<T>(
  vars: Readonly<Record<string, string | undefined>>,
  body: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(vars)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await body();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/** Run one `traversal origin` invocation against a throwaway trace directory. */
async function origin(
  opts: Parameters<typeof traversalCommand>[2],
  sessionId: string | null,
  dir = freshDir("origin"),
): Promise<{ envelope: Awaited<ReturnType<typeof traversalCommand>>; dir: string }> {
  const envelope = await withEnv({ [TRAVERSAL_DIR_ENV]: dir }, () =>
    traversalCommand("origin", undefined, opts, {
      resolveSessionId: () => sessionId,
      now: () => AT,
    }),
  );
  return { envelope, dir };
}

/** The handover block, spelled here so a line that quietly empties cannot pass. */
function howTo(sessionId: string): string {
  return [
    "Declare it, and every line this session writes from here on carries the answer:",
    "  storytree traversal origin --origin human",
    "  storytree traversal origin --cut-by <the session that cut you> [--cut-for <arc-or-increment-id>]",
    "",
    "Cutting a successor? Put this line in the brief you author for it — it is the one thing the",
    "successor cannot work out for itself, and nothing may infer it after the fact:",
    `  storytree traversal origin --cut-by ${sessionId} --cut-for <arc-or-increment-id>`,
    "",
    "A storytree-owned launcher can set STORYTREE_SESSION_ORIGIN / STORYTREE_CUT_BY /",
    "STORYTREE_CUT_FOR in the child's environment instead. The declaration wins where both are",
    "present: it is keyed by this session's own id, and an exported variable is not.",
  ].join("\n");
}

test("traversal origin: a bare invocation REPORTS the whole answer and writes nothing", async () => {
  const { envelope, dir } = await origin({}, "session-cli-a");

  assert.equal(envelope.ok, true);
  assert.equal(
    envelope.body,
    [
      "traversal origin — how this session says it came to exist (ADR-0484 D7)",
      "",
      "session: session-cli-a",
      "origin:  unknown — UNRECORDED — this session never declared how it started. NOT a synonym for human-started: reading it as one restores the assumption ADR-0484 D7 removed, and in the direction that reads as reassuring",
      "stated:  by nobody — and nothing here will guess",
      "",
      howTo("session-cli-a"),
    ].join("\n"),
  );
  assert.deepEqual(envelope.next, ["storytree traversal show session-cli-a"]);
  assert.equal(readSessionOriginDeclaration(dir, "session-cli-a"), null, "a report is not a write");
});

test("traversal origin: declaring a cut writes it, and says what it cannot reach — the events already recorded", async () => {
  const { envelope, dir } = await origin(
    { cutBy: "parent-window-id", cutFor: "trace-records-whether-a-session-was-cut-or-human-started" },
    "session-cli-b",
  );

  assert.equal(envelope.ok, true);
  assert.deepEqual(readSessionOriginDeclaration(dir, "session-cli-b"), {
    v: 1,
    origin: "cut",
    cutBy: "parent-window-id",
    cutFor: "trace-records-whether-a-session-was-cut-or-human-started",
    declaredAt: AT.toISOString(),
  });
  assert.equal(
    envelope.body,
    [
      "traversal origin — declared (ADR-0484 D7)",
      "",
      "session: session-cli-b",
      "origin:  cut — cut by a predecessor SESSION — its first reads follow an agent-authored handover, not an operator instruction, so a read here is not evidence of what the owner asked for",
      "cut by:  parent-window-id",
      "cut for: trace-records-whether-a-session-was-cut-or-human-started",
      "",
      "Every line this session writes from here on carries it.",
      "Nothing was recorded before this, so the whole trace carries the answer.",
    ].join("\n"),
  );
  assert.deepEqual(envelope.next, ["storytree traversal show session-cli-b"]);

  // A subsequent bare read reports what was declared, and by whom.
  const report = await withEnv({ [TRAVERSAL_DIR_ENV]: dir }, () =>
    traversalCommand("origin", undefined, {}, { resolveSessionId: () => "session-cli-b" }),
  );
  assert.match(report.body, /^origin:  cut —/m);
  assert.match(report.body, /^stated:  by this session, 2026-08-31T09:00:00\.000Z$/m);
});

test("traversal origin: a declaration made AFTER reads says so, and does not claim the earlier ones", async () => {
  const dir = freshDir("origin-late");
  const sessionId = "session-cli-late";
  // Two events already on disk, written before anyone declared — the ordinary shape, since a session
  // reads its brief before it thinks about telling the trace who wrote that brief.
  fs.writeFileSync(
    path.join(dir, `${sessionId}.jsonl`),
    [1, 2]
      .map((n) =>
        JSON.stringify({
          v: 1,
          event: {
            kind: "front_matter_read",
            eventId: `event:e${n}`,
            sessionId,
            at: `2026-08-31T08:0${n}:00.000Z`,
            visitId: `v${n}`,
            nodeId: `node-${n}`,
          },
        }),
      )
      .join("\n") + "\n",
    "utf8",
  );

  const { envelope } = await origin({ origin: "cut" }, sessionId, dir);
  assert.equal(envelope.ok, true);
  assert.equal(
    envelope.body,
    [
      "traversal origin — declared (ADR-0484 D7)",
      "",
      `session: ${sessionId}`,
      "origin:  cut — cut by a predecessor SESSION — its first reads follow an agent-authored handover, not an operator instruction, so a read here is not evidence of what the owner asked for",
      "",
      "Every line this session writes from here on carries it.",
      "The 2 event(s) already recorded keep what they were stamped with — an origin is applied forward, never backwards, because a retrofitted provenance cannot be told apart from a recorded one.",
    ].join("\n"),
  );
  // A `cut` with no cutter names nobody, and the render says nothing rather than an empty rider.
  assert.doesNotMatch(envelope.body, /^cut by:/m);
});

test("traversal origin: the ENVIRONMENT channel is reported too, and is named as the weaker of the two", async () => {
  const dir = freshDir("origin-env");
  const envelope = await withEnv(
    { [TRAVERSAL_DIR_ENV]: dir, STORYTREE_CUT_BY: "a-launcher-set-me", STORYTREE_CUT_FOR: "some-arc" },
    () => traversalCommand("origin", undefined, {}, { resolveSessionId: () => "session-cli-env" }),
  );

  assert.match(envelope.body, /^origin:  cut —/m);
  assert.match(envelope.body, /^cut by:  a-launcher-set-me$/m);
  assert.match(envelope.body, /^cut for: some-arc$/m);
  assert.match(envelope.body, /^stated:  by this session's environment$/m);
  // Reporting an environment-resolved origin still writes no declaration: the report says what WOULD
  // be stamped, it does not promote the weaker channel into the stronger one.
  assert.equal(readSessionOriginDeclaration(dir, "session-cli-env"), null);
});

test("traversal origin: `--cut-by` ALONE is a declaration, not a report", async () => {
  // The flag on its own is the shape a successor's brief actually carries, and it is the one that
  // distinguishes "asked to declare" from "asked to report" without help from either sibling flag.
  const { envelope, dir } = await origin({ cutBy: "just-the-cutter" }, "session-cli-cut-only");

  assert.equal(envelope.ok, true);
  assert.match(envelope.body, /^traversal origin — declared/m, "a lone --cut-by declares");
  assert.deepEqual(readSessionOriginDeclaration(dir, "session-cli-cut-only"), {
    v: 1,
    origin: "cut",
    cutBy: "just-the-cutter",
    cutFor: null,
    declaredAt: AT.toISOString(),
  });
});

test("traversal origin: a `cut` with NO cutter reports the origin and no rider lines", async () => {
  // The riders are printed only when the lines carried them. A render that printed them regardless
  // would say `cut by: null`, which reads as a recorded cutter nobody named.
  const dir = freshDir("origin-bare-cut");
  const envelope = await withEnv(
    { [TRAVERSAL_DIR_ENV]: dir, STORYTREE_SESSION_ORIGIN: "cut", STORYTREE_CUT_BY: undefined, STORYTREE_CUT_FOR: undefined },
    () => traversalCommand("origin", undefined, {}, { resolveSessionId: () => "session-cli-bare-cut" }),
  );

  assert.match(envelope.body, /^origin:  cut —/m);
  assert.doesNotMatch(envelope.body, /^cut by:/m);
  assert.doesNotMatch(envelope.body, /^cut for:/m);
  assert.match(envelope.body, /^stated:  by this session's environment$/m);
});

test("traversal origin: a declaration that records no time still reports as this session's own", async () => {
  // Only a hand-written file reaches this — the CLI always stamps `declaredAt`. It matters because
  // the alternative is a report that says the environment spoke when the session itself did.
  const dir = freshDir("origin-undated");
  fs.writeFileSync(
    path.join(dir, "session-cli-undated.origin.json"),
    JSON.stringify({ v: 1, origin: "cut", cutBy: "parent" }),
    "utf8",
  );

  const envelope = await withEnv({ [TRAVERSAL_DIR_ENV]: dir }, () =>
    traversalCommand("origin", undefined, {}, { resolveSessionId: () => "session-cli-undated" }),
  );
  assert.match(envelope.body, /^origin:  cut —/m);
  assert.match(envelope.body, /^stated:  by this session$/m);
});

test("traversal origin: `--origin human` is written with no riders", async () => {
  const { envelope, dir } = await origin({ origin: "human" }, "session-cli-c");

  assert.equal(envelope.ok, true);
  assert.deepEqual(readSessionOriginDeclaration(dir, "session-cli-c"), {
    v: 1,
    origin: "human",
    cutBy: null,
    cutFor: null,
    declaredAt: AT.toISOString(),
  });
  assert.match(envelope.body, /^origin:  human — started by an operator/m);
  assert.doesNotMatch(envelope.body, /^cut by:/m);
});

test("traversal origin: each impossible flag combination is REFUSED with the reason, never silently narrowed", async () => {
  // A third origin word. There are two, and a session that cannot say is left undeclared.
  const unknownWord = await origin({ origin: "agent" }, "session-cli-d");
  assert.equal(unknownWord.envelope.ok, false);
  assert.equal(
    unknownWord.envelope.body,
    '--origin must be "human" (an operator started this session) or "cut" (a predecessor session ' +
      "cut it). There is deliberately no third word: a session that cannot say is left UNDECLARED, " +
      "which is its own answer.",
  );
  assert.deepEqual(unknownWord.envelope.next, [
    "storytree traversal origin — what this session currently says, and how to declare it",
  ]);
  assert.equal(readSessionOriginDeclaration(unknownWord.dir, "session-cli-d"), null);

  // A human start plus a cutter is a contradiction, and dropping the rider quietly would leave the
  // operator believing they had recorded one.
  const contradiction = await origin({ origin: "human", cutBy: "parent" }, "session-cli-e");
  assert.equal(contradiction.envelope.ok, false);
  assert.equal(
    contradiction.envelope.body,
    "--origin human carries no --cut-by / --cut-for: a session an operator started was cut by " +
      "nobody, for nothing. Recording either would put a value on the row that a later reader could " +
      "quote back as a cut.",
  );
  assert.equal(readSessionOriginDeclaration(contradiction.dir, "session-cli-e"), null);

  // `--cut-for` alone is not a claim of origin: a human-started session driving an increment could
  // carry the same value honestly, so accepting it would be an inference rather than a record.
  const riderOnly = await origin({ cutFor: "some-arc" }, "session-cli-f");
  assert.equal(riderOnly.envelope.ok, false);
  assert.equal(
    riderOnly.envelope.body,
    "--cut-for alone declares nothing. A human-started session driving an increment could carry the " +
      "same value honestly, so treating it as proof of a cut would be an inference rather than a " +
      "record. Add --origin cut, or --cut-by <the session that cut you>.",
  );
  assert.equal(readSessionOriginDeclaration(riderOnly.dir, "session-cli-f"), null);

  // An empty `--origin` is the same refusal as a wrong word, not a fifth state.
  const empty = await origin({ origin: "" }, "session-cli-g");
  assert.equal(empty.envelope.ok, false);
  assert.match(empty.envelope.body, /^--origin must be "human"/);
  assert.equal(readSessionOriginDeclaration(empty.dir, "session-cli-g"), null);
});

test("traversal origin: a write that cannot land refuses rather than reporting a declaration nobody stored", async () => {
  // Force a write failure without touching OS permissions (unreliable cross-platform): occupy the
  // directory's own path with a plain file, so creating a directory there is impossible everywhere.
  const base = freshDir("origin-blocked");
  const blocked = path.join(base, "occupied");
  fs.writeFileSync(blocked, "in the way", "utf8");
  const dir = path.join(blocked, "traces");

  const { envelope } = await origin({ origin: "cut" }, "session-cli-blocked", dir);
  assert.equal(envelope.ok, false);
  assert.equal(
    envelope.body,
    [
      `could not write the origin declaration to ${path.join(dir, "session-cli-blocked.origin.json")}.`,
      "",
      "Nothing else changed: the session simply stays undeclared, which reads as `unknown` — the",
      "one thing that never happens is a guessed origin taking its place.",
    ].join("\n"),
  );
  assert.deepEqual(envelope.next, ["storytree traversal origin — what this session currently says"]);
});

test("traversal origin: a run with no session identity refuses rather than declaring for nobody", async () => {
  // The primary checkout, CI and the lobby resolve no identity — the same runs that capture no trace
  // at all. A declaration filed under no session would describe a trace that does not exist.
  const { envelope, dir } = await origin({ origin: "human" }, null);
  assert.equal(envelope.ok, false);
  assert.equal(
    envelope.body,
    [
      "storytree traversal origin — this invocation resolves no session identity, so there is no",
      "session to report on or declare for (the primary checkout, CI, and the lobby all resolve",
      "none — the same runs that capture no trace at all).",
      "",
      "A harness-run session resolves its own context window; an explicit STORYTREE_SESSION_ID",
      "overrides it.",
    ].join("\n"),
  );
  assert.deepEqual(envelope.next, ["storytree traversal list — the captured session ids"]);
  assert.deepEqual(fs.readdirSync(dir), [], "nothing is written for a session that has no id");
});

test("traversal origin: with no deps at all the area still answers — it resolves no identity rather than assuming one", async () => {
  // The DEFAULTS, which nothing else here reaches: a caller that supplies neither an identity
  // resolver nor a clock gets the honest refusal, not a declaration filed under a guess.
  const envelope = await traversalCommand("origin", undefined, {});
  assert.equal(envelope.ok, false);
  assert.match(envelope.body, /resolves no session identity/);
});

test("traversal origin: the area's help and its unknown-verb message both name it, so the verb is discoverable", async () => {
  const help = traversalHelp().body;
  assert.ok(
    help.includes(
      [
        "  storytree traversal origin            how THIS session came to exist — human-started, or",
        "                                        cut by a predecessor (ADR-0484 D7). Bare, it reports",
        "                                        and writes nothing; `--origin human`, `--origin cut`",
        "                                        or `--cut-by <sessionId> [--cut-for <unit>]` declares",
        "                                        it, and every line written from then on carries it.",
        "                                        An undeclared session reads `unknown`, which is NOT a",
        "                                        synonym for human-started — origins are never",
        "                                        inferred from timing, branch names or worktree reuse.",
      ].join("\n"),
    ),
    `the help does not carry the origin block:\n${help}`,
  );

  const unknown = await traversalCommand("nonsense", undefined, {}, {});
  assert.equal(unknown.ok, false);
  assert.equal(
    unknown.body,
    'unknown traversal sub-command "nonsense" — expected "list", "show", "origin", "ingest", "backlog", or "ship".',
  );
});

test("traversal origin: the DISPATCH threads every flag through, under the same session id the reads are keyed by", async () => {
  // The composition root's own wiring — `run(...)` rather than `traversalCommand(...)`, so what is
  // proved is that `--origin` / `--cut-by` / `--cut-for` reach the verb and that the declaration is
  // filed under `resolveTraceIdentity`'s answer. Nothing else in this file exercises that path, and
  // a flag dropped there would look exactly like a session that declined to declare.
  const dir = freshDir("dispatch");
  const sessionId = "session-cli-dispatch";

  const envelope = await withEnv({ [TRAVERSAL_DIR_ENV]: dir, [SESSION_ID_ENV]: sessionId }, () =>
    run(["traversal", "origin", "--cut-by", "the-predecessor", "--cut-for", "an-increment"], {
      store: new InMemoryStore(),
    }),
  );

  assert.equal(envelope.ok, true, envelope.body);
  const declared = readSessionOriginDeclaration(dir, sessionId);
  assert.equal(declared?.origin, "cut");
  assert.equal(declared?.cutBy, "the-predecessor", "--cut-by reached the verb");
  assert.equal(declared?.cutFor, "an-increment", "--cut-for reached the verb, and is not the same flag");

  // ...and the OTHER flag, on its own, through the same path.
  const humanDir = freshDir("dispatch-human");
  const humanEnvelope = await withEnv(
    { [TRAVERSAL_DIR_ENV]: humanDir, [SESSION_ID_ENV]: `${sessionId}-human` },
    () => run(["traversal", "origin", "--origin", "human"], { store: new InMemoryStore() }),
  );
  assert.equal(humanEnvelope.ok, true, humanEnvelope.body);
  assert.equal(readSessionOriginDeclaration(humanDir, `${sessionId}-human`)?.origin, "human");

  // A bare `traversal origin` through the dispatch declares nothing — the flags are what distinguish
  // a report from a write, and a dispatch that always passed them would have written here too.
  const bareDir = freshDir("dispatch-bare");
  const bare = await withEnv(
    { [TRAVERSAL_DIR_ENV]: bareDir, [SESSION_ID_ENV]: `${sessionId}-bare` },
    () => run(["traversal", "origin"], { store: new InMemoryStore() }),
  );
  assert.equal(bare.ok, true, bare.body);
  assert.equal(readSessionOriginDeclaration(bareDir, `${sessionId}-bare`), null);
});

test("traversal origin: with no session id in the environment the dispatch resolves NONE, rather than assuming one", async () => {
  // The identity half of the same wiring, and the only place it is observable: with neither the
  // explicit override nor the harness's own window id, `resolveTraceIdentity` answers nothing — and
  // a resolver that fell back to the worktree, or crashed on the absence, would both be visible here.
  const dir = freshDir("dispatch-anon");
  const envelope = await withEnv(
    { [TRAVERSAL_DIR_ENV]: dir, [SESSION_ID_ENV]: undefined, CLAUDE_CODE_SESSION_ID: undefined },
    () => run(["traversal", "origin", "--origin", "human"], { store: new InMemoryStore() }),
  );

  assert.equal(envelope.ok, false);
  assert.match(envelope.body, /resolves no session identity/);
  assert.deepEqual(fs.readdirSync(dir), [], "and nothing is filed under a session that has no id");
});

test("traversal ship: the injected store reaches the verb, and its absence is what refuses", async () => {
  // `traversal ship` is the ONE verb in this area that talks to the database, and the dispatch is
  // where the store is handed to it. Without a case that supplies one, a wiring that always passed
  // `null` would look exactly like a run with no `--pg`.
  const shipped: string[] = [];
  const store = {
    append: async () => true,
    read: async () => {
      throw new Error("the ship path does not read");
    },
    list: async () => [],
  };

  const withStore = await withEnv({ [TRAVERSAL_DIR_ENV]: freshDir("ship") }, () =>
    run(["traversal", "ship", "--pg"], {
      store: new InMemoryStore(),
      traversalEvents: store as never,
    }),
  );
  assert.equal(withStore.ok, true, withStore.body);
  assert.match(withStore.body, /draining local traces into the shared store/);
  assert.equal(shipped.length, 0, "an empty trace directory ships nothing, which is not a failure");

  const withoutStore = await withEnv({ [TRAVERSAL_DIR_ENV]: freshDir("ship-none") }, () =>
    run(["traversal", "ship"], { store: new InMemoryStore() }),
  );
  assert.equal(withoutStore.ok, false);
  assert.match(withoutStore.body, /needs --pg/);
});

// ---------------------------------------------------------------------------
// `traversal origin --census` — the coverage reading (ADR-0487)
// ---------------------------------------------------------------------------

/**
 * The WHOLE census render for an empty store, pinned verbatim.
 *
 * A golden body rather than a handful of `assert.match` probes, on this suite's own stated rule
 * and on a measured one: a render is mostly string literals, so every prose line is its own
 * mutant, and a regex kills only the words it quotes while every other literal stands. Pinning the
 * body kills that whole class in one assertion. It is deliberately brittle — changing this wording
 * is MEANT to fail here, because the caveat below is the verb's entire reason for existing and a
 * silent edit to it would leave a coverage figure reading as a compliance score.
 */
const CENSUS_EMPTY_BODY = [
    "traversal origin --census \u2014 who started the sessions in this store (ADR-0487)",
    "",
    "sessions: 0 with at least one captured event",
    "",
    "  human:   0  (\u2014)  started by an operator",
    "  cut:     0  (\u2014)  cut by a predecessor session",
    "  unknown: 0  (\u2014)  never declared \u2014 NOT a synonym for human-started",
    "  mixed:   0  (\u2014)  contradictory; neither answer may be quoted",
    "",
    "quotable: 0.0% of sessions carry an origin a reader may quote.",
    "",
    "READ EVERY ORIGIN-DERIVED FIGURE AGAINST THAT SHARE. The remainder is not a population with",
    "no origin \u2014 it is one whose origin nobody recorded, and nothing here will guess it. This is a",
    "reading of coverage and never a compliance score: a session that did not declare is not in",
    "breach of anything, and the honest response to a low share is to distrust the derived figure,",
    "not to chase the sessions.",
  ].join("\n");

/** The whole `traversal` help body, pinned for the same reason. */
const TRAVERSAL_HELP_BODY = [
    "storytree traversal \u2014 replay this machine's captured context-traversal traces.",
    "",
    "Traces are local, per-session, metadata-only JSONL under ~/.storytree/traces",
    "(override with STORYTREE_TRAVERSAL_DIR). Capture is on by default and opts out",
    "with STORYTREE_TRAVERSAL=off (ADR-0241).",
    "",
    "  storytree traversal list              the captured sessions, newest observed first",
    "  storytree traversal show <session>    replay one session chronologically",
    "  storytree traversal origin            how THIS session came to exist \u2014 human-started, or",
    "                                        cut by a predecessor (ADR-0484 D7). Bare, it reports",
    "                                        and writes nothing; `--origin human`, `--origin cut`",
    "                                        or `--cut-by <sessionId> [--cut-for <unit>]` declares",
    "                                        it, and every line written from then on carries it.",
    "                                        An undeclared session reads `unknown`, which is NOT a",
    "                                        synonym for human-started \u2014 origins are never",
    "                                        inferred from timing, branch names or worktree reuse.",
    "  storytree traversal origin --census   how much of this store's population declared at all",
    "                                        (ADR-0487). A READING of coverage, never a compliance",
    "                                        score: read every origin-derived figure against the",
    "                                        share it reports, because that share is the subset",
    "                                        such a figure was actually computed over.",
    "  storytree traversal ingest <session>  read this session's host transcript windows and",
    "                                        append their per-request context OCCUPANCY",
    "                                        (ADR-0248 D1). Idempotent \u2014 re-running appends",
    "                                        nothing. Transcripts are read from",
    "                                        ~/.claude/projects (STORYTREE_TRANSCRIPT_DIR).",
    "  storytree traversal backlog           what has NOT reached the shared store yet, and",
    "                                        since when. Offline \u2014 reads the local cursors.",
    "  storytree traversal ship --pg         drain the local traces into the shared store",
    "                                        (ADR-0484). Runs out of band; a command never",
    "                                        waits on it. Retries are the cursor, so re-running",
    "                                        after a failure is the normal repair.",
    "",
    "The shared log holds what was traced FORWARD from 2026-08-30 (ADR-0484 D6): a session's",
    "pre-existing local history stays local and is never backfilled, so a question spanning the",
    "change reads both stores.",
  ].join("\n");


test("origin --census: the EMPTY-store render is pinned WHOLE — every count, every percent, every caveat line", () => {
  return origin({ census: true }, null, freshDir("census-empty")).then(({ envelope }) => {
    assert.equal(envelope.ok, true);
    assert.equal(envelope.body, CENSUS_EMPTY_BODY);
    // `null` is what the primary checkout, CI and the lobby all resolve: the census branch runs
    // BEFORE the identity resolve, so the reading is available in exactly the runs most likely to
    // want it. Were it after, this call would be refused for a reason unrelated to the question.
    assert.deepEqual(envelope.next, ["storytree traversal origin \u2014 what THIS session says, and how to declare it"]);
  });
});

test("traversal help: the whole body is pinned, including the --census line", () => {
  assert.equal(traversalHelp().body, TRAVERSAL_HELP_BODY);
});

test("origin --census: a FULLY declared store drops the partiality caveat — it is a caveat, not a footer", () => {
  // The other half of the branch the empty-store golden pins. The caveat exists to stop a coverage
  // figure being read as complete; at 100% there is nothing to caveat, and printing it anyway would
  // train a reader to skip the line in exactly the case where it matters.
  const dir = freshDir("census-full");
  for (const [id, kind] of [
    ["window-h", "human"],
    ["window-c", "cut"],
  ] as const) {
    appendTraversalEvents([visit(id, 1)], { dir, sessionId: id, grade: "window", origin: kind });
  }

  return origin({ census: true }, null, dir).then(({ envelope }) => {
    assert.match(envelope.body, /quotable: 100\.0% of sessions/);
    assert.doesNotMatch(envelope.body, /READ EVERY ORIGIN-DERIVED FIGURE/);
    assert.doesNotMatch(envelope.body, /not to chase the sessions/);
  });
});

test("run: `traversal origin --census` reaches the census through the real dispatch", async () => {
  // The flag has to survive the ONE strict CLI parse and be handed across as a boolean; the tests
  // above all call `traversalCommand` directly and would stay green if `--census` were dropped in
  // `commands.ts` and every invocation silently reported this session's own origin instead.
  const envelope = await withEnv({ [TRAVERSAL_DIR_ENV]: freshDir("census-run") }, () =>
    run(["traversal", "origin", "--census"], { store: new InMemoryStore() }),
  );

  assert.equal(envelope.ok, true);
  assert.match(envelope.body, /who started the sessions in this store/);
  assert.match(envelope.body, /sessions: 0 with at least one captured event/);
});

/** One captured read, in the shape the sink writes them. */
function visit(sessionId: string, n: number) {
  return {
    kind: "full_payload_read",
    eventId: `event:${sessionId}-${n}`,
    sessionId,
    at: `2026-08-31T00:0${n}:00.000Z`,
    visitId: `visit-${sessionId}-${n}`,
    nodeId: `node-${n}`,
  };
}

test("origin --census: a populated store counts each class and reports the QUOTABLE share", async () => {
  // THREE sessions — one human, one cut, one that never declared — so the arithmetic is observable
  // rather than merely a shape. The reading this pins is the one the whole verb exists for: the
  // undeclared session is counted in the DENOMINATOR and is never folded into `human`, so the
  // quotable share is 2 of 3 and not 2 of 2.
  const dir = freshDir("census-mixed");
  appendTraversalEvents([visit("window-human", 1)], {
    dir,
    sessionId: "window-human",
    grade: "window",
    origin: "human",
  });
  appendTraversalEvents([visit("window-cut", 1)], {
    dir,
    sessionId: "window-cut",
    grade: "window",
    origin: "cut",
    cutBy: "predecessor-window",
  });
  // No `origin` at all — the ordinary case today, and the one that must not read as human-started.
  appendTraversalEvents([visit("window-silent", 1)], {
    dir,
    sessionId: "window-silent",
    grade: "window",
  });

  const { envelope } = await origin({ census: true }, null, dir);

  assert.match(envelope.body, /sessions: 3 with at least one captured event/);
  // The percentages exercise the non-empty arm of the render's own divide — the arm an empty-store
  // golden can never reach, and where an inverted operator would otherwise go unnoticed.
  assert.match(envelope.body, /human: {3}1 {2}\(33\.3%\)/);
  assert.match(envelope.body, /cut: {5}1 {2}\(33\.3%\)/);
  assert.match(envelope.body, /unknown: 1 {2}\(33\.3%\)/);
  assert.match(envelope.body, /quotable: 66\.7% of sessions/);
});

