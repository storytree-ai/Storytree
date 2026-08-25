import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { FILE_WRITE_TOOLS, FileToolExecutor } from "@storytree/agent";
import { OwnedLoopAuthor, PathWriteScope, scriptedWriterModel } from "@storytree/orchestrator";
import { appendSliceScope, ownedLoopScopeWalls } from "@storytree/drive";
import { InMemoryStore } from "@storytree/storage-protocol";
import type { StoreEvent } from "@storytree/storage-protocol";

import { foldScopeSlices, renderScopeReading, scopeReading } from "./scope-reading.js";

/**
 * The write-scope wall reading (ADR-0446), end to end over the REAL fence.
 *
 * ## Why this test drives the actual executor rather than pushing violations by hand
 *
 * The increment this lands on names its own most likely failure: shipping a counter that can only
 * ever read zero — recorded but never written, written but never read, or read from a path
 * production does not take. So the two tests below FORCE A REFUSAL through the real
 * `OwnedLoopAuthor` → `WriteScopedToolExecutor` → `PathWriteScope` chain and follow it all the way
 * to the rendered reading. Delete the `violations.push` in the executor, the fold in
 * `scope-walls.ts`, or the append, and `armed-wall-fires` goes red rather than quietly reading zero.
 *
 * ## The four renderings that must never converge
 *
 * ABSENCE (nothing recorded) · ARMED-AND-SILENT (M slices, 0 refusals) · FIRED (N > 0) ·
 * WRITE-FENCE-SILENT-BUT-SURFACE-FIRED (the pi leaf's shell wall refused while the write fence
 * never did). A reading that cannot separate the first two is unfalsifiable, which is exactly how
 * an unverified state gets reported as an authoritative one; one that cannot separate the last two
 * credits the write fence with refusals it never made. Each is asserted below, on wording that
 * does not overlap.
 */

const TEST_REL = "unit.test.cjs";
const IMPL_REL = "impl.cjs";

/** The gate's own dry-run shape: tests-only in AUTHOR_TEST, source-only in IMPLEMENT. */
function scope(): PathWriteScope {
  return new PathWriteScope({ testGlobs: ["*.test.cjs"], sourceGlobs: [IMPL_REL] });
}

async function inWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-scope-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Run ONE authoring slice through the real owned loop and bank whatever the wall did.
 * `writes` are the paths the scripted leaf attempts, in order.
 */
async function armedSlice(args: {
  phase: "AUTHOR_TEST" | "IMPLEMENT";
  writes: readonly string[];
}): Promise<InMemoryStore> {
  return inWorkspace(async (dir) => {
    const author = new OwnedLoopAuthor({
      model: scriptedWriterModel(
        args.writes.map((rel) => ({ path: rel, content: "// authored\n" })),
      ),
      tools: new FileToolExecutor({ rootDir: dir }),
      scope: scope(),
      writeTools: FILE_WRITE_TOOLS,
    });
    await author.author(args.phase, "author the deliverable");
    const store = new InMemoryStore();
    await appendSliceScope(
      store,
      { unitId: "cap-under-test", runId: "run-1" },
      ownedLoopScopeWalls(author),
      "tester@storytree.invalid",
    );
    return store;
  });
}

test("armed-wall-silent: an in-scope slice banks a row whose refusal count is a MEASURED zero", async () => {
  // AUTHOR_TEST may write the test file — the wall is armed and nothing hits it.
  const store = await armedSlice({ phase: "AUTHOR_TEST", writes: [TEST_REL] });
  const entries = foldScopeSlices(await store.readEvents());

  assert.equal(entries.length, 1, "the armed slice must bank a row even though nothing was refused");
  const reading = scopeReading(entries);
  assert.equal(reading.slices, 1, "the row IS the denominator");
  assert.equal(reading.refusals, 0);

  const rendered = renderScopeReading({ entries });
  assert.match(rendered, /ARMED 1 TIME\(S\) AND NEVER FIRED/);
  assert.doesNotMatch(
    rendered,
    /NOTHING RECORDED/,
    "an armed-and-silent wall must not read like an unobserved one",
  );
});

test("armed-wall-fires: a deliberately out-of-scope write moves the count OFF zero, all the way to the reading", async () => {
  // impl.cjs is the SOURCE file — writing it during AUTHOR_TEST is exactly what the phase fence
  // exists to refuse. This is the forced refusal: if any link in the chain drops it, this goes red.
  const store = await armedSlice({ phase: "AUTHOR_TEST", writes: [IMPL_REL] });
  const entries = foldScopeSlices(await store.readEvents());

  assert.equal(entries.length, 1);
  const reading = scopeReading(entries);
  assert.equal(reading.slices, 1);
  assert.equal(reading.refusals, 1, "the wall fired once and the sink must hold it");
  assert.equal(reading.noPathCalls, 0);

  const refusal = entries[0]?.doc.refusals[0];
  assert.equal(refusal?.kind, "scope");
  assert.equal(refusal?.path, IMPL_REL);
  assert.equal(entries[0]?.doc.source, "owned-loop");
  assert.equal(
    entries[0]?.doc.noPathDisposition,
    "passed-through",
    "the owned loop's side of the disagreement is recorded on the row, not inferred later",
  );

  const rendered = renderScopeReading({ entries });
  assert.match(rendered, /refusals:\s+1/);
  assert.match(rendered, /\[scope\]\s+write_file → impl\.cjs/);
  assert.doesNotMatch(rendered, /NEVER FIRED/);
});

test("armed-wall-refusal-does-not-write: the fence still HELD — the sink observes, it does not relax", async () => {
  // The one property this arc must not disturb: banking the refusal changes no behaviour. The
  // refused path must be absent from the workspace, exactly as before ADR-0446.
  await inWorkspace(async (dir) => {
    const author = new OwnedLoopAuthor({
      model: scriptedWriterModel([{ path: IMPL_REL, content: "// smuggled\n" }]),
      tools: new FileToolExecutor({ rootDir: dir }),
      scope: scope(),
      writeTools: FILE_WRITE_TOOLS,
    });
    await author.author("AUTHOR_TEST", "author the deliverable");
    assert.equal(author.violations.length, 1);
    await assert.rejects(
      () => fs.stat(path.join(dir, IMPL_REL)),
      "the refused write must never have reached disk",
    );
  });
});

test("scope-absence: an EMPTY sink reads as NOTHING RECORDED, never as a zero", () => {
  const rendered = renderScopeReading({ entries: [] });
  assert.match(rendered, /NOTHING RECORDED/);
  assert.match(rendered, /This is an ABSENCE, not a zero/);
  // The wording the armed-and-silent branch uses must be absent here, and vice versa: a reader who
  // cannot tell "nobody looked" from "the wall held" cannot use either answer.
  assert.doesNotMatch(rendered, /NEVER FIRED/);
});

test("scope-reading-denominator: totals are split by runtime and phase, never reported bare", () => {
  const entries = foldScopeSlices([
    event("cap-a", "AUTHOR_TEST", "sdk-leaf", 1, 0, "refused", "2026-08-01T00:00:00.000Z"),
    event("cap-a", "IMPLEMENT", "sdk-leaf", 0, 2, "refused", "2026-08-02T00:00:00.000Z"),
    event("cap-b", "IMPLEMENT", "owned-loop", 0, 0, "passed-through", "2026-08-03T00:00:00.000Z"),
  ]);
  const reading = scopeReading(entries);
  assert.equal(reading.slices, 3);
  assert.equal(reading.refusals, 1);
  assert.equal(reading.noPathCalls, 2);
  assert.equal(reading.byRuntime.get("sdk-leaf")?.slices, 2);
  assert.equal(reading.byRuntime.get("owned-loop")?.slices, 1);
  assert.equal(reading.byPhase.get("IMPLEMENT")?.slices, 2);
  assert.equal(reading.from, "2026-08-01T00:00:00.000Z");
  assert.equal(reading.to, "2026-08-03T00:00:00.000Z");

  const rendered = renderScopeReading({ entries });
  assert.match(rendered, /armed slices:\s+3/);
  assert.match(rendered, /no-path calls:\s+2/);
  // The no-path total must never be folded into the refusal total.
  assert.match(rendered, /refusals:\s+1/);
  assert.match(rendered, /never added into the refusal count/i);
});

test("scope-reading-unit-filter: a unit id narrows the fold to that unit's slices", () => {
  const all = [
    event("cap-a", "AUTHOR_TEST", "sdk-leaf", 1, 0, "refused", "2026-08-01T00:00:00.000Z"),
    event("cap-b", "AUTHOR_TEST", "sdk-leaf", 3, 0, "refused", "2026-08-02T00:00:00.000Z"),
  ];
  assert.equal(scopeReading(foldScopeSlices(all, "cap-a")).refusals, 1);
  assert.equal(scopeReading(foldScopeSlices(all, "cap-b")).refusals, 3);
  // A unit with rows elsewhere but none of its own is still an ABSENCE for that unit.
  assert.match(
    renderScopeReading({ unitId: "cap-c", entries: foldScopeSlices(all, "cap-c") }),
    /NOTHING RECORDED for "cap-c"/,
  );
});

test("scope-reading-fold: a malformed row is dropped, never counted as an armed slice", () => {
  const entries = foldScopeSlices([
    { seq: 1, id: "scope:r:u:AUTHOR_TEST", kind: "scope", type: "created", doc: { nope: true }, actor: "t", at: "2026-08-01T00:00:00.000Z" },
    { seq: 2, id: "other", kind: "work", type: "created", doc: { unitId: "cap-a", event: "building" }, actor: "t", at: "2026-08-01T00:00:00.000Z" },
  ]);
  assert.deepEqual(entries, [], "a row that describes no slice is not evidence a wall was armed");
});

/** A raw `events.scope_event` row as the merged store stream hands it over. */
function event(
  unitId: string,
  phase: "AUTHOR_TEST" | "IMPLEMENT",
  source: "sdk-leaf" | "codex-leaf" | "owned-loop" | "pi-leaf",
  refusals: number,
  noPathCalls: number,
  noPathDisposition: "refused" | "passed-through" | "not-applicable",
  at: string,
  toolSurfaceRefusals: number = 0,
): StoreEvent {
  return {
    seq: 1,
    id: `scope:run-1:${unitId}:${phase}`,
    kind: "scope",
    type: "created",
    doc: {
      unitId,
      runId: "run-1",
      phase,
      source,
      armed: true,
      refusals: Array.from({ length: refusals }, (_unused, i) => ({
        kind: "scope" as const,
        tool: "Write",
        path: `denied-${i}.ts`,
      })),
      noPathCalls,
      noPathDisposition,
      // No `path` and no `kind`: a tool-surface refusal resolved neither, and the wire shape is
      // `.strict()`, so a helper that invented either would be refused rather than carried.
      toolSurfaceRefusals: Array.from({ length: toolSurfaceRefusals }, () => ({ tool: "bash" })),
    },
    actor: "tester@storytree.invalid",
    at,
  };
}

test("scope-reading-tool-surface: it is counted and rendered APART from the refusal total", () => {
  const entries = foldScopeSlices([
    event("cap-pi", "AUTHOR_TEST", "pi-leaf", 0, 0, "refused", "2026-08-25T00:00:00.000Z", 2),
  ]);
  const reading = scopeReading(entries);
  assert.equal(reading.slices, 1);
  assert.equal(reading.toolSurfaceRefusals, 2);
  // THE property: a call refused for the tool it is resolved no path and compared nothing against
  // the phase predicate, so it is not a write-fence firing and must not inflate this number.
  assert.equal(reading.refusals, 0);
  assert.equal(reading.byRuntime.get("pi-leaf")?.toolSurfaceRefusals, 2);

  const rendered = renderScopeReading({ entries });
  assert.match(rendered, /tool-surface:\s+2/);
  assert.match(rendered, /refusals:\s+0/);
  assert.match(rendered, /tool-surface refusals, oldest first:/);
  assert.match(rendered, /\[tool-surface\]\s+bash/);
  assert.match(rendered, /NEVER added in either/i);
});

test("scope-reading-tool-surface: a silent write fence beside a fired surface wall says BOTH", () => {
  // The rendering that would otherwise be a lie. "THE WALL WAS ARMED N TIMES AND NEVER FIRED" is
  // false when the surface wall fired; crediting the write fence with those refusals is worse.
  const fired = renderScopeReading({
    entries: foldScopeSlices([
      event("cap-pi", "AUTHOR_TEST", "pi-leaf", 0, 0, "refused", "2026-08-25T00:00:00.000Z", 1),
    ]),
  });
  assert.match(fired, /THE WRITE FENCE WAS ARMED 1 TIME\(S\) AND NEVER FIRED/);
  assert.match(fired, /but the tool-surface/);

  // …and with NEITHER wall fired, the plain armed-and-silent wording is what comes back.
  const silent = renderScopeReading({
    entries: foldScopeSlices([
      event("cap-pi", "AUTHOR_TEST", "pi-leaf", 0, 0, "refused", "2026-08-25T00:00:00.000Z", 0),
    ]),
  });
  assert.match(silent, /THE WALL WAS ARMED 1 TIME\(S\) AND NEVER FIRED\./);
  assert.doesNotMatch(silent, /but the tool-surface/);
});
