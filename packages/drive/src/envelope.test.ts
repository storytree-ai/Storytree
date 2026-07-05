import { test } from "node:test";
import assert from "node:assert/strict";

import { emitNodeEnvelope, formatEnvelope } from "./envelope.js";

/**
 * The shared `node → next:` emitter (ADR-0161 decision 2). It is the ONE navigation format both the
 * agent step→refs surface (ADR-0156) and the process branch-edge graph (ADR-0154, un-deferred) emit
 * through — so these tests pin the edge→pull mapping the whole context DAG depends on. Node-type
 * agnostic by construction: the emitter only ever sees `{ id, headline, edges }`.
 */

test("emitNodeEnvelope maps each outbound edge to a `storytree library artifact <id>` pull", () => {
  const env = emitNodeEnvelope({
    id: "some-agent#session_start",
    headline: "at the start",
    edges: [{ ref: "asset:merge-ceremony" }, { ref: "asset:pull-based-context" }],
  });
  assert.equal(env.ok, true);
  assert.equal(env.body, "at the start");
  assert.deepEqual(env.next, [
    "storytree library artifact merge-ceremony",
    "storytree library artifact pull-based-context",
  ]);
});

test("emitNodeEnvelope strips a leading asset: prefix but accepts a bare id too", () => {
  const env = emitNodeEnvelope({
    id: "n",
    headline: "h",
    edges: [{ ref: "asset:with-prefix" }, { ref: "bare-id" }],
  });
  assert.deepEqual(env.next, [
    "storytree library artifact with-prefix",
    "storytree library artifact bare-id",
  ]);
});

test("emitNodeEnvelope appends an edge label as a gloss beside the pull command", () => {
  const env = emitNodeEnvelope({
    id: "n",
    headline: "h",
    edges: [{ ref: "asset:merge-ceremony", label: "how to land" }],
  });
  assert.deepEqual(env.next, ["storytree library artifact merge-ceremony   (how to land)"]);
});

test("emitNodeEnvelope: a node with no edges is ok with an empty next (a leaf node)", () => {
  const env = emitNodeEnvelope({ id: "leaf", headline: "nothing onward", edges: [] });
  assert.equal(env.ok, true);
  assert.deepEqual(env.next, []);
});

test("emitNodeEnvelope: ok can be overridden to mark a degraded node", () => {
  const env = emitNodeEnvelope({ id: "n", headline: "degraded", edges: [], ok: false });
  assert.equal(env.ok, false);
});

test("the emitted envelope round-trips through formatEnvelope with a `next:` block", () => {
  const text = formatEnvelope(
    emitNodeEnvelope({
      id: "n",
      headline: "body text",
      edges: [{ ref: "asset:one" }],
    }),
  );
  assert.match(text, /body text/);
  assert.match(text, /next:\n {2}- storytree library artifact one/);
});
