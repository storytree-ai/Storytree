/**
 * Contract tests for the multi-adapter replay composition (story `context-traversal-spawn`,
 * capability `multi-adapter-replay`, ADR-0235 / ADR-0241 / ADR-0192).
 *
 * Real-collaborator integration: fixtures are written through increment 2's actual
 * `appendTraversalEvents` sink into a temporary directory (no mock store), and the corrupt-line
 * fixture is appended as a raw byte line the same way a crash-truncated write would land on disk —
 * never a stubbed reader. `showTraversalSessionAllAdapters` is exercised end-to-end: read through
 * increment 2's `readTraversalSession`, rendered through its `renderTraversalSession`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  appendTraversalEvents,
  AGENT_DESCENT_COVERAGE,
  CLI_READ_VERBS,
} from "@storytree/context-traversal-capture";
import { CoverageFeature, traversalProvenanceOf } from "@storytree/context-traversal-telemetry";
import type { CoverageFeature as CoverageFeatureValue } from "@storytree/context-traversal-telemetry";

import { BUILD_SPAWN_BOUNDARY_COVERAGE } from "./observe-leaf-slices.js";
import { replayTraversalSessionAllAdapters, showTraversalSessionAllAdapters } from "./replay-adapters.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "context-traversal-spawn-replay-"));
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function sessionFilePath(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}.jsonl`);
}

/** Maps one event kind to the `CoverageFeature` literal that names it, using the closed domain
 * itself so a future vocabulary addition would fail this mapping to compile rather than silently
 * passing an untracked feature. */
function eventKindFeature(
  kind: "front_matter_read" | "spawn_handoff" | "model_context" | "result_return",
): CoverageFeatureValue {
  const feature = ({
    front_matter_read: "event:front_matter_read",
    spawn_handoff: "event:spawn_handoff",
    model_context: "event:model_context",
    result_return: "event:result_return",
  } as const)[kind];
  assert.ok((CoverageFeature.options as readonly string[]).includes(feature));
  return feature;
}

/**
 * A mixed fixture: one terminal-adapter read event alongside a full build-spawn-boundary triple
 * (spawn_handoff / model_context / result_return), all under one session. The `model_context`
 * carries no `contextWindowCapacity` — an honest, common shape the CLI boundary actually produces.
 */
function writeMixedFixture(dir: string, sessionId: string): void {
  const childSessionId = `${sessionId}-child`;
  const events: unknown[] = [
    {
      kind: "front_matter_read",
      eventId: "event:visit-1",
      sessionId,
      visitId: "visit-1",
      nodeId: "node-a",
      surfaceId: "tree",
      at: "2026-07-26T10:00:00.000Z",
    },
    {
      kind: "spawn_handoff",
      eventId: "event:spawn-1",
      sessionId,
      at: "2026-07-26T10:00:01.000Z",
      edgeId: "edge-1",
      parentSessionId: sessionId,
      childSessionId,
      agentType: "red-builder",
    },
    {
      kind: "model_context",
      eventId: "event:model-1",
      sessionId,
      at: "2026-07-26T10:00:02.000Z",
      cumulativeInputTokens: 1_500,
      addedInputTokens: 1_500,
    },
    {
      kind: "result_return",
      eventId: "event:result-1",
      sessionId,
      at: "2026-07-26T10:00:03.000Z",
      edgeId: "edge-1",
      parentSessionId: sessionId,
      childSessionId,
      ok: true,
      resultTokenCount: 120,
    },
  ];

  const ok = appendTraversalEvents(events, { dir, sessionId });
  assert.equal(ok, true, "fixture events must be schema-valid and actually land on disk");
}

test("every-rendered-event-kind-is-supported-by-a-declared-adapter: every rendered event kind in a mixed terminal+build-spawn session is supported by at least one declared adapter", () => {
  const dir = makeTempDir();
  const sessionId = "session-mixed-coverage";
  try {
    writeMixedFixture(dir, sessionId);

    const result = showTraversalSessionAllAdapters(sessionId, { dir });
    assert.equal(result.ok, true);

    const unionSupported = new Set<string>([
      ...AGENT_DESCENT_COVERAGE.supported,
      ...BUILD_SPAWN_BOUNDARY_COVERAGE.supported,
    ]);

    const presentKinds = ["front_matter_read", "spawn_handoff", "model_context", "result_return"] as const;
    for (const kind of presentKinds) {
      assert.ok(
        unionSupported.has(eventKindFeature(kind)),
        `event kind ${kind} must be named supported by at least one declared adapter`,
      );
    }

    // The render itself must actually show every one of these event kinds — never silently drop
    // one because it happens to fall in some other adapter's territory.
    assert.ok(result.body.includes("[front-matter] visit=visit-1"));
    assert.ok(result.body.includes("[spawn-handoff] edge=edge-1"));
    assert.ok(result.body.includes("[model-context] model=unknown cumulative=1500"));
    assert.ok(result.body.includes("[result-return] edge=edge-1"));
  } finally {
    removeTempDir(dir);
  }
});

test("both-adapter-declarations-render-supported-and-omitted: the rendered body names both adapter declarations in full, never merged or one-sided", () => {
  const dir = makeTempDir();
  const sessionId = "session-both-adapters";
  try {
    writeMixedFixture(dir, sessionId);

    const result = showTraversalSessionAllAdapters(sessionId, { dir });

    // Regression pin, asserted BEFORE the verbatim-line comparison below so it is the assertion that
    // reports this specific defect rather than being masked by a whole-line mismatch. This is the ONE
    // render the CLI actually calls, and it must declare the terminal adapter as it really behaves:
    // declaring `observe-cli.ts`'s BASE constant here printed `field:prior_visit_id` under `omitted`
    // while the very same body rendered "(revisit of visit=...)" — a declaration denying what the
    // trace visibly carried (ADR-0235 clause 6). Found by walking the real CLI, not by any test.
    const renderedTerminal = result.body
      .split("\n")
      .find((line) => line.includes(`coverage: adapter=${AGENT_DESCENT_COVERAGE.adapterId}`));
    assert.ok(renderedTerminal !== undefined, "the terminal coverage line must render");
    const [renderedSupported, renderedOmitted] = renderedTerminal.split(" omitted=");
    // The pin tracks the OUTERMOST composed constant, and grows with it: each composition layer adds
    // a field the wired terminal really emits, and every one of them must render as supported and
    // NOT as omitted. Naming them individually (rather than looping the constant) keeps the pin
    // falsifiable against a render that silently drops back to an inner layer.
    for (const field of ["field:prior_visit_id", "field:parent_visit_id"]) {
      assert.ok(
        renderedSupported?.includes(field),
        `the wired terminal adapter emits ${field}, so its rendered declaration must SUPPORT it`,
      );
      assert.ok(
        !renderedOmitted?.includes(field),
        `${field} must not also render as omitted — a render may not deny a field it produces`,
      );
    }
    // The inverse dishonesty is pinned too: what this adapter genuinely CANNOT see must stay denied.
    // No CLI boundary observes a model's own context window or a child's, so a declaration claiming
    // either would be as wrong as one denying a field it produces — and a pin that only checked the
    // supported side would miss it.
    //
    // ⚠ THE OFFER TRIO JOINED THIS LIST ON ADR-0464 D1, MOVING THE OTHER WAY FOR THE FIRST TIME.
    // `event:candidate_set`, `event:followed_edge` and `field:candidate_follow_causality` were pinned
    // as SUPPORTED above from the commit that wired their producers; the producers are now deleted, so
    // the honest declaration denies all three. This is the assertion that makes the deletion provable
    // rather than merely done: `replay-adapters.ts` composes the outermost coverage constant, both
    // retired constants are still recoverable from git, and re-wiring one is the single easiest way to
    // undo this landing by accident. Doing so reds HERE, naming the exact feature.
    for (const unobserved of [
      "field:resident_input_tokens",
      "field:child_context_window",
      "event:candidate_set",
      "event:followed_edge",
      "field:candidate_follow_causality",
    ]) {
      assert.ok(
        renderedOmitted?.includes(unobserved),
        `${unobserved} has no producer at this boundary, so the declaration must still OMIT it`,
      );
      assert.ok(
        !renderedSupported?.includes(unobserved),
        `${unobserved} must not render as supported — nothing at this adapter emits it`,
      );
    }

    // ADR-0235 clause 6: every declared gap rides with the declaration in this render too, since this
    // is the one the CLI actually calls.
    //
    // ADR-0464 D1 REPLACED THE THREE CAVEATS THIS ONCE PINNED, and the replacement is asserted here
    // rather than the block simply being deleted. The old three all described gaps in the offer
    // mechanism — `doc:` offers being unfollowable, follow-completeness depending on the agent reusing
    // the printed form, and an unanswered offer being indistinguishable from a bypassed one. A
    // mechanism that does not exist has no gaps, so carrying them forward would have described the
    // thinness of a picture this adapter no longer draws.
    //
    // Deleting the loop outright was the tempting move and would have been wrong: this render's whole
    // contract is that it states what it cannot see, and a render with NO caveat block satisfies that
    // contract vacuously. So the successor caveat is pinned by id, and it says the honest successor
    // thing — that offers and follows are no longer recorded at all, and that the lost causality must
    // not be reconstructed by joining a read to an earlier render (ADR-0260 D4's refusal, which
    // outlives the mechanism it was written for).
    assert.ok(
      result.body.includes("offers-and-follows-are-no-longer-recorded"),
      "the declaration must still surface a caveat — a render that states no gap at all satisfies " +
        "ADR-0235 clause 6 vacuously",
    );
    for (const retired of [
      "doc-refs-are-offered-but-follows-are-unobservable",
      "follow-completeness-depends-on-the-offered-command-form",
      "an-unanswered-visit-and-a-bypassed-mechanism-are-indistinguishable",
    ]) {
      assert.ok(
        !result.body.includes(retired),
        `${retired} describes the retired offer mechanism and must not survive it`,
      );
    }

    const terminalLine = `coverage: adapter=${AGENT_DESCENT_COVERAGE.adapterId} supported=[${AGENT_DESCENT_COVERAGE.supported.join(", ")}] omitted=[${AGENT_DESCENT_COVERAGE.omitted.join(", ")}]`;
    const buildLine = `coverage: adapter=${BUILD_SPAWN_BOUNDARY_COVERAGE.adapterId} supported=[${BUILD_SPAWN_BOUNDARY_COVERAGE.supported.join(", ")}] omitted=[${BUILD_SPAWN_BOUNDARY_COVERAGE.omitted.join(", ")}]`;

    assert.ok(
      result.body.includes(terminalLine),
      "the terminal adapter's full supported+omitted declaration must render verbatim",
    );
    assert.ok(
      result.body.includes(buildLine),
      "the build spawn boundary adapter's full supported+omitted declaration must render verbatim",
    );

    // Both declarations carry a non-empty omitted side in the real vocabulary — a render that
    // dropped the omitted half of either would still pass a naive "adapter=... appears" check but
    // fail these.
    assert.ok(AGENT_DESCENT_COVERAGE.omitted.length > 0);
    assert.ok(BUILD_SPAWN_BOUNDARY_COVERAGE.omitted.length > 0);
  } finally {
    removeTempDir(dir);
  }
});

test("capacity-still-renders-honestly-unknown: capacity still renders honestly unknown when the latest model_context carries none, while its token observation still renders", () => {
  const dir = makeTempDir();
  const sessionId = "session-capacity-unknown";
  try {
    writeMixedFixture(dir, sessionId);

    const result = showTraversalSessionAllAdapters(sessionId, { dir });

    assert.ok(
      result.body.includes("capacity: unknown (observed, but this boundary declares no window capacity)"),
      "no default capacity, no inferred gauge, no danger region may be fabricated",
    );
    // This fixture DOES carry a model_context (`writeMixedFixture` above, built as a literal event):
    // the render must report the capacity as unknown WITHOUT denying the observation it just made.
    // Distinguishing the two is the durable part — it holds however many shapes reach this branch.
    assert.ok(
      !result.body.includes("no model_context observation"),
      "an observed-but-capacity-absent window must not be reported as no observation at all",
    );
    assert.ok(result.body.includes("cumulative=1500"), "the actual token observation must still render");
  } finally {
    removeTempDir(dir);
  }
});

test("a-corrupt-line-renders-a-partial-notice-without-throwing: a corrupt line replays every good event, reports the skipped count, and never throws", () => {
  const dir = makeTempDir();
  const sessionId = "session-corrupt-line";
  try {
    writeMixedFixture(dir, sessionId);
    fs.appendFileSync(sessionFilePath(dir, sessionId), "this is not json at all\n", { encoding: "utf8" });

    const result = showTraversalSessionAllAdapters(sessionId, { dir });

    assert.equal(result.ok, true);
    assert.ok(result.body.includes("partial replay: 1 event line(s) skipped (unreadable or corrupt)"));
    // The good events from the same file still replay in full alongside the partial notice.
    assert.ok(result.body.includes("[front-matter] visit=visit-1"));
    assert.ok(result.body.includes("[spawn-handoff] edge=edge-1"));
    assert.ok(result.body.includes("[result-return] edge=edge-1"));
  } finally {
    removeTempDir(dir);
  }
});

test("a-corrupt-line-renders-a-partial-notice-without-throwing: a DUPLICATE-IDENTITY line is skipped and counted too, not only an unparseable one", () => {
  // The contract names three corruption shapes — malformed, truncated, and duplicate-identity — but
  // the sibling above only ever exercised the unparseable one. Duplicate identity is a genuinely
  // DIFFERENT branch of the reader (a seen-eventId/seen-visitId check, not a JSON/schema failure),
  // so labelling the sibling with this contract id while that branch went unasserted would have
  // repeated increment 5's contract-5 finding: a contract label sitting over a test that does not
  // prove its whole claim.
  const dir = makeTempDir();
  const sessionId = "session-duplicate-identity";
  try {
    writeMixedFixture(dir, sessionId);
    const lines = fs
      .readFileSync(sessionFilePath(dir, sessionId), { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.trim().length > 0);
    const firstLine = lines[0];
    assert.ok(firstLine !== undefined, "the fixture must have written at least one event line");
    // Byte-for-byte the line the sink itself wrote: a schema-VALID event whose only defect is that
    // its identity has already been replayed. An unparseable line could not test this branch.
    fs.appendFileSync(sessionFilePath(dir, sessionId), `${firstLine}\n`, { encoding: "utf8" });

    const result = showTraversalSessionAllAdapters(sessionId, { dir });

    assert.equal(result.ok, true);
    assert.ok(
      result.body.includes("partial replay: 1 event line(s) skipped (unreadable or corrupt)"),
      "a replayed duplicate identity must be counted as skipped, not silently rendered twice",
    );
    // Every good event still replays exactly once — the duplicate is dropped, not the original.
    assert.equal(result.body.split("[front-matter] visit=visit-1").length - 1, 1);
    assert.ok(result.body.includes("[spawn-handoff] edge=edge-1"));
    assert.ok(result.body.includes("[result-return] edge=edge-1"));
  } finally {
    removeTempDir(dir);
  }
});

test("the structured view and the rendered body declare the SAME installed-adapter coverage", () => {
  // The one invariant a second consumer could break: `replayTraversalSessionAllAdapters` (the studio
  // panel's read) and `showTraversalSessionAllAdapters` (the CLI's render) must be told the same thing
  // about what these adapters can observe. This file's header records that each composition layer moved
  // the terminal declaration OUTWARD and that only walking the real binary caught a render that had
  // dropped back to an inner one — a defect whose whole shape is "two places disagree". A structured
  // view deriving its own coverage would reopen exactly that, in a surface no CLI walk ever reaches.
  const dir = makeTempDir();
  const sessionId = "session-structured-coverage";
  try {
    writeMixedFixture(dir, sessionId);

    const view = replayTraversalSessionAllAdapters(sessionId, { dir });
    const rendered = showTraversalSessionAllAdapters(sessionId, { dir });

    assert.deepEqual(
      view.coverage.map((declaration) => declaration.adapterId),
      [AGENT_DESCENT_COVERAGE.adapterId, BUILD_SPAWN_BOUNDARY_COVERAGE.adapterId],
    );
    for (const declaration of view.coverage) {
      const line = `coverage: adapter=${declaration.adapterId} supported=[${declaration.supported.join(", ")}] omitted=[${declaration.omitted.join(", ")}]`;
      assert.ok(
        rendered.body.includes(line),
        `the structured view's ${declaration.adapterId} declaration must be the SAME one the render prints`,
      );
    }

    // The structure, not the text: the events the panel plots, and the honesty it must render beside
    // them. `sessions` is deliberately absent — a single-session replay's one lane would restate
    // `events` verbatim and double the payload.
    assert.equal(view.sessionId, sessionId);
    assert.equal(view.events.length, 4);
    assert.equal(view.skipped, 0);
    assert.equal(view.partial, false);
    assert.ok(view.coverageCaveats.length > 0, "the declared gaps ride with the structured view too");

    // Occupancy: observed NOWHERE in this fixture, and reported as unobserved rather than as zero.
    assert.equal(view.occupancy.modelContextCount, 1);
    assert.equal(view.occupancy.observationCount, 0);
    assert.equal(view.occupancy.declared, false);
    assert.ok(view.occupancy.note.includes("no occupancy series"));
  } finally {
    removeTempDir(dir);
  }
});

test("a session with no captured file at all replays empty, with no coverage-block omission of either adapter", () => {
  const dir = makeTempDir();
  const sessionId = "session-never-captured";
  try {
    const result = showTraversalSessionAllAdapters(sessionId, { dir });

    assert.equal(result.ok, true);
    assert.ok(result.body.includes("(no events observed)"));
    assert.ok(result.body.includes(`coverage: adapter=${AGENT_DESCENT_COVERAGE.adapterId}`));
    assert.ok(result.body.includes(`coverage: adapter=${BUILD_SPAWN_BOUNDARY_COVERAGE.adapterId}`));
  } finally {
    removeTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// ADR-0484 D5 — the two recorders, labelled at the point of use
// ---------------------------------------------------------------------------

/** One own-log read and two harness-derived ones, in the same session file. */
function writeMixedProvenanceFixture(dir: string, sessionId: string): void {
  const events: unknown[] = [
    {
      kind: "full_payload_read",
      eventId: "event:own-1",
      sessionId,
      visitId: "visit-own-1",
      nodeId: "adr-0484",
      surfaceId: "library-artifact",
      at: "2026-08-30T10:00:00.000Z",
    },
    {
      kind: "full_payload_read",
      eventId: "event:harness-1",
      sessionId,
      visitId: "visit-harness-1",
      nodeId: "doc:decisions/0403-a.md",
      surfaceId: "host-transcript-file-read",
      at: "2026-08-30T10:00:01.000Z",
    },
    {
      kind: "full_payload_read",
      eventId: "event:harness-2",
      sessionId,
      visitId: "visit-harness-2",
      nodeId: "adr-0403",
      surfaceId: "host-transcript-cli-read",
      at: "2026-08-30T10:00:02.000Z",
    },
  ];
  assert.equal(appendTraversalEvents(events, { dir, sessionId }), true);
}

test("the-replay-counts-the-two-recorders-apart: a mixed trace reports its own log and the harness tier separately, and never as one total", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-mixed";
  try {
    writeMixedProvenanceFixture(dir, sessionId);

    const view = replayTraversalSessionAllAdapters(sessionId, { dir });
    assert.equal(view.provenance.census.own, 1);
    assert.equal(view.provenance.census.harness, 2);
    assert.equal(view.provenance.census.unclassified, 0);
    assert.equal(view.provenance.census.total, 3);
    // Three reads of which two are secondary must never be readable as three of ours.
    assert.notEqual(view.provenance.census.own, view.provenance.census.total);

    const body = showTraversalSessionAllAdapters(sessionId, { dir }).body;
    assert.match(body, /provenance: which recorder wrote these observations/);
    assert.match(body, /1 from storytree/);
    assert.match(body, /2 harness-derived/);
    assert.match(body, /storytree log is authoritative/);
  } finally {
    removeTempDir(dir);
  }
});

test("the-replay-states-each-harness-surfaces-narrowness: the count is printed with what that surface can observe, so it cannot read as general tool capture", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-scope";
  try {
    writeMixedProvenanceFixture(dir, sessionId);
    const body = showTraversalSessionAllAdapters(sessionId, { dir }).body;

    assert.match(body, /\[HARNESS-DERIVED\] host-transcript-file-read x1/);
    // Deliverable 3: the surface that reads most like "files the agent read" says what it really is.
    assert.match(body, /DECISION RECORD opened with the harness/);
    assert.match(body, /and NOTHING ELSE/);
    // Deliverable 2: the one surface that duplicates our own log says so, on its own row.
    assert.match(body, /OVERLAPS library-artifact/);
    assert.match(body, /count distinct reads by surface, never by summing/);
    // …and our own rows carry NO scope line, which is what keeps the four that matter visible.
    assert.match(body, /\[storytree-own \] library-artifact x1\n/);
  } finally {
    removeTempDir(dir);
  }
});

test("a-trace-with-no-harness-event-still-prints-the-block-and-the-never-run-line: an unmeasured absence never renders as a measured zero", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-own-only";
  try {
    writeMixedFixture(dir, sessionId);

    const view = replayTraversalSessionAllAdapters(sessionId, { dir });
    assert.equal(view.provenance.census.harness, 0);
    assert.equal(view.provenance.ingestRan, false);

    const body = showTraversalSessionAllAdapters(sessionId, { dir }).body;
    // Unconditional: a block that appeared only when a harness event was present would be missing on
    // exactly the traces most likely to be mistaken for complete.
    assert.match(body, /provenance: which recorder wrote these observations/);
    assert.match(body, /harness ingest: NEVER RUN for this session/);
    assert.match(body, /UNMEASURED, not zero/);
  } finally {
    removeTempDir(dir);
  }
});

test("a-receipt-beside-the-trace-turns-the-absence-into-a-measured-zero: once an ingest has run, the same empty harness census reads differently", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-receipted";
  try {
    writeMixedFixture(dir, sessionId);
    // The RECEIPT, written the way the harness adapter writes it — beside the trace, not in it.
    fs.writeFileSync(
      path.join(dir, `${sessionId}.ingest.json`),
      JSON.stringify({
        runs: {
          "host-transcript-decision-read": { at: "2026-08-31T09:00:00.000Z", observed: 0, appended: 0 },
        },
      }),
    );

    const view = replayTraversalSessionAllAdapters(sessionId, { dir });
    assert.equal(view.provenance.census.harness, 0, "still nothing harness-derived in the trace");
    assert.equal(view.provenance.ingestRan, true, "but somebody has now looked");

    const body = showTraversalSessionAllAdapters(sessionId, { dir }).body;
    assert.doesNotMatch(body, /NEVER RUN/);
    assert.match(body, /host-transcript-decision-read last ran 2026-08-31T09:00:00\.000Z/);
    // The adapter that has NOT run is named too, rather than left silent.
    assert.match(body, /host-transcript-occupancy never run/);
  } finally {
    removeTempDir(dir);
  }
});

test("a-corrupt-receipt-reads-as-never-run: a sidecar that will not parse must never certify that somebody looked", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-corrupt-receipt";
  try {
    writeMixedFixture(dir, sessionId);
    fs.writeFileSync(path.join(dir, `${sessionId}.ingest.json`), "{not json");

    const view = replayTraversalSessionAllAdapters(sessionId, { dir });
    assert.equal(view.provenance.ingestRan, false);
    assert.match(view.provenance.ingestNote, /NEVER RUN/);
  } finally {
    removeTempDir(dir);
  }
});

test("every-live-observer-surface-classifies-as-our-own: the provenance table cannot fall behind the allowlist it labels", () => {
  // THE DRIFT GUARD FOR THE OWN HALF. `CLI_READ_VERBS` is the allowlist of every read-shaped verb
  // storytree owns, and the classification lives in the vocabulary package, which is a ROOT and can
  // never import it back. This is the one place both are visible. A verb added there whose surface
  // is not classified here would render `unclassified` — our own read, on our own log, reported as
  // a reading nobody can weigh.
  const surfaces = new Set<string>();
  for (const spec of Object.values(CLI_READ_VERBS)) {
    if (spec.observes === "nothing") continue;
    surfaces.add(spec.surfaceId);
  }
  assert.ok(surfaces.size > 0, "an empty allowlist would make this assertion vacuous");

  for (const surfaceId of surfaces) {
    const row = traversalProvenanceOf(surfaceId);
    assert.equal(row.provenance, "storytree-own", `${surfaceId} is not classified as our own log`);
  }
  // The `agents` descent mints visits on its own surface name too; assert it explicitly so a future
  // move of that constant out of the allowlist cannot silently drop it from the classified set.
  assert.equal(traversalProvenanceOf("agents").provenance, "storytree-own");
});

test("the-occupancy-declaration-names-its-tier: the one series the playhead bar plots is harness-derived and says so", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-occupancy";
  try {
    writeMixedFixture(dir, sessionId);
    const view = replayTraversalSessionAllAdapters(sessionId, { dir });
    assert.equal(view.occupancy.seriesProvenance, "harness-derived");
    assert.match(view.occupancy.note, /HARNESS-DERIVED/);
  } finally {
    removeTempDir(dir);
  }
});

test("an-empty-trace-censuses-without-attributing-anything: a session with no readable event claims neither tier", () => {
  const dir = makeTempDir();
  try {
    const view = replayTraversalSessionAllAdapters("session-that-was-never-written", { dir });
    assert.equal(view.events.length, 0);
    assert.equal(view.provenance.census.total, 0);
    assert.equal(view.provenance.census.own, 0);
    assert.equal(view.provenance.census.harness, 0);
    assert.equal(view.provenance.ingestRan, false);

    const body = showTraversalSessionAllAdapters("session-that-was-never-written", { dir }).body;
    assert.match(body, /no observation here carries a surface/);
  } finally {
    removeTempDir(dir);
  }
});

test("the-census-line-carries-every-tier-and-its-denominator: a reader can see what was NOT attributable, not only what was", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-denominator";
  try {
    // Two own reads, one on a surface nothing classifies, and three events carrying no surface at
    // all — so every one of the four counts is non-zero and none can be dropped unnoticed.
    assert.equal(
      appendTraversalEvents(
        [
          {
            kind: "full_payload_read",
            eventId: "event:own",
            sessionId,
            visitId: "visit-own",
            nodeId: "adr-0484",
            surfaceId: "library-artifact",
            at: "2026-08-30T10:00:00.000Z",
          },
          {
            kind: "full_payload_read",
            eventId: "event:strange",
            sessionId,
            visitId: "visit-strange",
            nodeId: "node-x",
            surfaceId: "some-adapter-nobody-declared",
            at: "2026-08-30T10:00:01.000Z",
          },
          {
            kind: "model_context",
            eventId: "event:model",
            sessionId,
            at: "2026-08-30T10:00:02.000Z",
            cumulativeInputTokens: 10,
            addedInputTokens: 10,
          },
        ],
        { dir, sessionId },
      ),
      true,
    );

    const view = replayTraversalSessionAllAdapters(sessionId, { dir });
    assert.equal(view.provenance.census.unclassified, 1);
    assert.equal(view.provenance.census.withoutSurface, 1);

    const body = showTraversalSessionAllAdapters(sessionId, { dir }).body;
    assert.match(body, /1 unclassified · 1 carrying no surface/);
    assert.match(body, /3 observation\(s\) in total/);
    // The UNCLASSIFIED tier gets its own label rather than falling into either real one.
    assert.match(body, /\[unclassified {2}\] some-adapter-nobody-declared x1/);
    assert.doesNotMatch(body, /\[HARNESS-DERIVED\] some-adapter-nobody-declared/);
  } finally {
    removeTempDir(dir);
  }
});

test("the-block-does-not-announce-an-absence-it-does-not-have: the no-surface line prints ONLY when nothing carries one", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-has-surfaces";
  try {
    writeMixedProvenanceFixture(dir, sessionId);
    const body = showTraversalSessionAllAdapters(sessionId, { dir }).body;
    assert.doesNotMatch(body, /no observation here carries a surface/);
  } finally {
    removeTempDir(dir);
  }
});

test("our-own-rows-carry-no-scope-line-and-no-overlap-line: the qualifications ride only the tiers a reader can misread", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-own-rows-plain";
  try {
    writeMixedProvenanceFixture(dir, sessionId);
    const body = showTraversalSessionAllAdapters(sessionId, { dir }).body;

    // The own surfaces' scope sentence must NOT appear: printing it on all twelve of our own rows
    // would bury the four harness rows the block exists for.
    assert.doesNotMatch(body, /the argv shape IS the observation/);
    // And an OVERLAPS line is printed only for a surface that HAS one — never with a blank target.
    assert.doesNotMatch(body, /OVERLAPS undefined/);
    const overlaps = body.match(/OVERLAPS /g) ?? [];
    assert.equal(overlaps.length, 1, "only host-transcript-cli-read overlaps our own log");
  } finally {
    removeTempDir(dir);
  }
});

test("a-receipt-with-no-runs-in-it-is-still-never-run: an empty record is not evidence that anybody looked", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-empty-receipt";
  try {
    writeMixedFixture(dir, sessionId);
    fs.writeFileSync(path.join(dir, `${sessionId}.ingest.json`), JSON.stringify({ runs: {} }));

    const view = replayTraversalSessionAllAdapters(sessionId, { dir });
    assert.equal(view.provenance.ingestRan, false, "a receipt file is not the same as a recorded run");
    assert.match(view.provenance.ingestNote, /NEVER RUN/);
  } finally {
    removeTempDir(dir);
  }
});

test("the-occupancy-note-says-where-the-series-would-come-from: harness-derived, and not recorded by us", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-occupancy-note";
  try {
    writeMixedFixture(dir, sessionId);
    const note = replayTraversalSessionAllAdapters(sessionId, { dir }).occupancy.note;
    assert.match(note, /HARNESS-DERIVED/);
    assert.match(note, /read back out of the host harness's transcript rather than recorded by storytree/);
  } finally {
    removeTempDir(dir);
  }
});

test("an-event-kind-carrying-no-surface-is-counted-not-dropped: the census total matches the replay's own length", () => {
  const dir = makeTempDir();
  const sessionId = "session-provenance-total";
  try {
    // The mixed fixture is one visit plus a spawn/model/return triple — four events, one surface.
    writeMixedFixture(dir, sessionId);
    const view = replayTraversalSessionAllAdapters(sessionId, { dir });
    assert.equal(view.provenance.census.total, view.events.length);
    assert.equal(view.provenance.census.own, 1);
    assert.equal(view.provenance.census.withoutSurface, 3);
  } finally {
    removeTempDir(dir);
  }
});

test("the multi-adapter replay states WHO STARTED the session, not only what it read", () => {
  // ADR-0484 D7. This is the render `storytree traversal show` actually calls, so an origin dropped
  // in the composition would be recorded on disk, shipped to the shared store, and invisible on the
  // one surface a reader meets — which is the shape where a figure gets attributed to the owner's
  // prompt anyway. Both directions are asserted: what a declared session says, and that an
  // undeclared one is STATED rather than left silent.
  const dir = makeTempDir();
  try {
    const cutSession = "session-origin-cut";
    appendTraversalEvents(
      [
        {
          kind: "front_matter_read",
          eventId: "event:origin-cut",
          sessionId: cutSession,
          at: "2026-08-31T00:00:00.000Z",
          visitId: "visit-origin-cut",
          nodeId: "adr-0484",
        },
      ],
      { dir, sessionId: cutSession, grade: "window", origin: "cut", cutBy: "the-predecessor" },
    );

    const cut = showTraversalSessionAllAdapters(cutSession, { dir });
    assert.match(cut.body, /^origin: cut —/m);
    assert.match(cut.body, /handover/i);
    assert.match(cut.body, /^cut by: the-predecessor$/m);

    const silentSession = "session-origin-silent";
    appendTraversalEvents(
      [
        {
          kind: "front_matter_read",
          eventId: "event:origin-silent",
          sessionId: silentSession,
          at: "2026-08-31T00:00:01.000Z",
          visitId: "visit-origin-silent",
          nodeId: "adr-0484",
        },
      ],
      { dir, sessionId: silentSession, grade: "window" },
    );

    const silent = showTraversalSessionAllAdapters(silentSession, { dir });
    assert.match(silent.body, /^origin: unknown —/m);
    assert.match(silent.body, /NOT a synonym for human/i);
    assert.doesNotMatch(silent.body, /^cut by:/m);
  } finally {
    removeTempDir(dir);
  }
});
