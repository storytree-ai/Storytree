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

import { appendTraversalEvents, REVISIT_LINK_COVERAGE } from "@storytree/context-traversal-capture";
import { CoverageFeature } from "@storytree/context-traversal-telemetry";
import type { CoverageFeature as CoverageFeatureValue } from "@storytree/context-traversal-telemetry";

import { BUILD_SPAWN_BOUNDARY_COVERAGE } from "./observe-leaf-slices.js";
import { showTraversalSessionAllAdapters } from "./replay-adapters.js";

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
      ...REVISIT_LINK_COVERAGE.supported,
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
      .find((line) => line.includes(`coverage: adapter=${REVISIT_LINK_COVERAGE.adapterId}`));
    assert.ok(renderedTerminal !== undefined, "the terminal coverage line must render");
    const [renderedSupported, renderedOmitted] = renderedTerminal.split(" omitted=");
    assert.ok(
      renderedSupported?.includes("field:prior_visit_id"),
      "the terminal adapter links same-node revisits, so its rendered declaration must SUPPORT field:prior_visit_id",
    );
    assert.ok(
      !renderedOmitted?.includes("field:prior_visit_id"),
      "field:prior_visit_id must not also render as omitted — a render may not deny a field it produces",
    );

    const terminalLine = `coverage: adapter=${REVISIT_LINK_COVERAGE.adapterId} supported=[${REVISIT_LINK_COVERAGE.supported.join(", ")}] omitted=[${REVISIT_LINK_COVERAGE.omitted.join(", ")}]`;
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
    assert.ok(REVISIT_LINK_COVERAGE.omitted.length > 0);
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

test("a session with no captured file at all replays empty, with no coverage-block omission of either adapter", () => {
  const dir = makeTempDir();
  const sessionId = "session-never-captured";
  try {
    const result = showTraversalSessionAllAdapters(sessionId, { dir });

    assert.equal(result.ok, true);
    assert.ok(result.body.includes("(no events observed)"));
    assert.ok(result.body.includes(`coverage: adapter=${REVISIT_LINK_COVERAGE.adapterId}`));
    assert.ok(result.body.includes(`coverage: adapter=${BUILD_SPAWN_BOUNDARY_COVERAGE.adapterId}`));
  } finally {
    removeTempDir(dir);
  }
});
