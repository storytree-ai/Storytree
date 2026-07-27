import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";
import { ClaudeAgentAuthor } from "@storytree/agent";
import type { PhaseAuthor, SdkQueryFn } from "@storytree/agent";

import { loadNodeSpec, findNodeSpecFile } from "./node-spec.js";
import { resolveProveSpec } from "./resolve-prove-spec.js";

/**
 * live-author-accounting-override (capability): the resolver accepts a canned live author on the
 * accounting side only — an offline caller can supply the RESOLVED `liveAuthor`, but never as a
 * back door around `authorOverride` (which deliberately leaves `liveAuthor` unset today, D6).
 *
 * This is a REGRESSION test against the CURRENT `resolve-prove-spec.ts` behaviour: at HEAD there is
 * no `liveAuthorOverride` option at all, so every assertion here that depends on it fails against
 * today's resolver (a behaviour assertion, not a missing-symbol import — `RealResolveOptions` is a
 * structural type, so handing it an extra property is not a compile error under `tsx`).
 */

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const STORIES_DIR = path.join(REPO_ROOT, "stories");

/** Load a real migrated spec by id (capability or contract layout) — mirrors resolve-prove-spec.test.ts. */
function loadById(id: string) {
  const file = findNodeSpecFile(STORIES_DIR, id);
  assert.ok(file !== null, `${id} spec file exists`);
  return loadNodeSpec(file);
}

/** A do-nothing leaf for tests that only exercise the resolver's accounting/refusal behaviour. */
const NOOP_AUTHOR: PhaseAuthor = { author: async () => ({ ok: true }) };

/**
 * A `queryFn` that THROWS the instant it is driven — so if anything ever actually calls
 * `.author()` on the canned live author, the test explodes loudly rather than passing quietly.
 */
const explodingQueryFn: SdkQueryFn = async function* () {
  throw new Error(
    "live-author-accounting-override: the canned live author must NEVER be driven as the authoring leaf",
  );
};

/** Build a genuine (never-driven) ClaudeAgentAuthor with canned accounting pushed onto it. */
function cannedLiveAuthor(): ClaudeAgentAuthor {
  const author = new ClaudeAgentAuthor({
    cwd: os.tmpdir(),
    isWriteAllowed: () => false,
    queryFn: explodingQueryFn,
  });
  author.runs.push({
    phase: "AUTHOR_TEST",
    subtype: "success",
    turns: 1,
    costUsd: 0.0123,
  });
  return author;
}

function baseRealOpts(runId: string) {
  return {
    mode: "real" as const,
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId,
    signerInputs: { flag: "tester@example.com" },
  };
}

test("live-author-override-is-returned-as-the-resolved-live-author", () => {
  const spec = loadById("verdict-line");
  const canned = cannedLiveAuthor();
  const result = resolveProveSpec(spec, {
    ...baseRealOpts("live-author-override-1"),
    authorOverride: NOOP_AUTHOR,
    liveAuthorOverride: canned,
  } as never);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.liveAuthor,
    canned,
    "the resolved liveAuthor must be the EXACT canned instance supplied via liveAuthorOverride",
  );
  assert.equal(result.liveAuthor?.totalCostUsd, 0.0123, "the canned accounting rides through untouched");
});

test("an-author-override-alone-leaves-the-live-author-absent", () => {
  const spec = loadById("verdict-line");
  const result = resolveProveSpec(spec, {
    ...baseRealOpts("live-author-override-2"),
    authorOverride: NOOP_AUTHOR,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.liveAuthor,
    undefined,
    "authorOverride alone deliberately leaves liveAuthor unset — no cost/violation accounting is claimed",
  );
});

test("live-author-override-without-an-author-override-is-refused", () => {
  const spec = loadById("verdict-line");
  const canned = cannedLiveAuthor();
  const result = resolveProveSpec(spec, {
    ...baseRealOpts("live-author-override-3"),
    liveAuthorOverride: canned,
    // no authorOverride supplied — meaningless and must be refused fail-closed.
  } as never);

  assert.equal(result.ok, false, "liveAuthorOverride without authorOverride must be refused fail-closed");
  if (result.ok) return;
  assert.match(result.reason, /authorOverride/, "the refusal must name authorOverride literally");
  assert.match(result.reason, /liveAuthorOverride/, "the refusal must name liveAuthorOverride literally");
});

test("the-canned-live-author-is-never-the-authoring-leaf", async () => {
  const spec = loadById("verdict-line");
  const canned = cannedLiveAuthor();
  const result = resolveProveSpec(spec, {
    ...baseRealOpts("live-author-override-4"),
    authorOverride: NOOP_AUTHOR,
    liveAuthorOverride: canned,
  } as never);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  // The authoring leaf actually wired into the ProveSpec must be the NOOP override, never the
  // canned live author — driving IT would explode (explodingQueryFn). We assert identity, not
  // behaviour: calling .author() on the canned author is exactly what this unit must never do.
  assert.equal(
    result.spec.author,
    NOOP_AUTHOR,
    "the ProveSpec's authoring leaf must stay the authorOverride, never the accounting-only canned author",
  );
  assert.notEqual(result.spec.author, canned);
});

test("the-else-branch-still-constructs-its-own-live-leaf", () => {
  const spec = loadById("verdict-line");
  // No authorOverride, no liveAuthorOverride: the resolver must still construct a REAL live leaf
  // (a genuine ClaudeAgentAuthor instance), exactly as it does today.
  const result = resolveProveSpec(spec, baseRealOpts("live-author-override-5"));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(
    result.liveAuthor instanceof ClaudeAgentAuthor,
    "with no override at all the resolver still constructs its own real live leaf",
  );
});
