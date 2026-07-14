import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { StoredDoc } from "@storytree/storage-protocol";
import { lifecycleOf } from "./lifecycle.js";
import { lifecycleOf as lifecycleOfFromBarrel } from "./index.js";
import { renderStoredDoc } from "./store/render-doc.js";

/**
 * ADR-0196 D1/D2 — the universal lifecycle projection `lifecycleOf(kind, doc)` and the plan-`status`
 * wire crossing on `renderStoredDoc`. Offline + pure: every fixture here is a literal object, no
 * store/clock/DB/socket. Every `test(...)` title LEADS with its exact `llw-…` contract id (ADR-0122
 * coverage scans this ONE file's test titles verbatim — do not rename/drop/merge any).
 */

// The closed FrictionRoute set (ADR-0168 D5), duplicated here as literal strings so this test does
// not import knowledge.ts's zod enum just to enumerate it.
const FRICTION_ROUTES = [
  "adr",
  "tool",
  "principle",
  "guardrail",
  "process",
  "definition",
  "edit-existing",
  "nothing",
] as const;

const DURABLE_KINDS = [
  "definition",
  "principle",
  "pattern",
  "guardrail",
  "techstack",
  "process",
  "agent",
  "template",
] as const;

test("llw-friction-and-plan-project-lifecycle — friction route and plan status project onto the universal triad", () => {
  // No / empty route => open; friction is NEVER active.
  assert.equal(lifecycleOf("friction", { route: undefined }), "open");
  assert.equal(lifecycleOf("friction", { route: null }), "open");
  assert.equal(lifecycleOf("friction", { route: "" }), "open");

  // ANY route in the closed set, tombstone included, => archived.
  for (const route of FRICTION_ROUTES) {
    assert.equal(
      lifecycleOf("friction", { route }),
      "archived",
      `friction route "${route}" must project to archived`,
    );
  }

  // plan status: draft -> open, ready -> active, consumed|superseded|retired -> archived.
  assert.equal(lifecycleOf("plan", { status: "draft" }), "open");
  assert.equal(lifecycleOf("plan", { status: "ready" }), "active");
  assert.equal(lifecycleOf("plan", { status: "consumed" }), "archived");
  assert.equal(lifecycleOf("plan", { status: "superseded" }), "archived");
  assert.equal(lifecycleOf("plan", { status: "retired" }), "archived");
});

test("llw-adr-and-defaults-project-lifecycle — adr status + the stateless-kind defaults project onto the triad; unknown kinds degrade to active", () => {
  assert.equal(lifecycleOf("adr", { status: "proposed" }), "open");
  assert.equal(lifecycleOf("adr", { status: "accepted" }), "active");
  assert.equal(lifecycleOf("adr", { status: "superseded" }), "archived");

  assert.equal(lifecycleOf("open-question", {}), "open");
  assert.equal(lifecycleOf("proposal", {}), "open");

  assert.equal(lifecycleOf("arc", {}), "active");

  for (const kind of DURABLE_KINDS) {
    assert.equal(lifecycleOf(kind, {}), "active", `durable kind "${kind}" must project to active`);
  }

  // An unrecognised kind degrades to active and never throws (a corpus that grows kinds must not
  // crash a shelf).
  assert.doesNotThrow(() => {
    assert.equal(lifecycleOf("some-future-kind-nobody-has-invented-yet", {}), "active");
  });
});

test("llw-lifecycleof-exported-and-browser-safe — lifecycleOf is re-exported from the @storytree/library root barrel and its module carries no node import", () => {
  assert.equal(typeof lifecycleOfFromBarrel, "function", "the root barrel re-exports lifecycleOf");
  assert.equal(
    lifecycleOfFromBarrel("adr", { status: "accepted" }),
    "active",
    "the barrel-imported lifecycleOf projects the same as the direct import",
  );

  // The browser-safe invariant the studio bundle depends on: lifecycle.ts carries NO node:/pg/fs
  // import specifier (the barrel's own "no node: imports in this entry" header).
  const lifecyclePath = fileURLToPath(new URL("./lifecycle.ts", import.meta.url));
  const source = readFileSync(lifecyclePath, "utf8");
  assert.doesNotMatch(
    source,
    /from\s+["'](node:|fs["']|pg["'])/,
    "lifecycle.ts must not import node:/fs/pg — the studio bundles the root barrel",
  );
});

test("llw-plan-status-crosses-the-wire — a stored plan doc surfaces status on the RenderedAsset (structured branch)", () => {
  const planDoc = {
    kind: "plan",
    id: "sample-plan",
    title: "Sample plan",
    description: "a fixture plan",
    references: [],
    objective: "Deliver the fixture.",
    arcRef: "asset:sample-arc",
    anchor: { sha: "abcdef1", date: "2026-07-01T00:00:00Z" },
    status: "ready",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const stored: StoredDoc = {
    id: "sample-plan",
    kind: "plan",
    doc: planDoc,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.equal(rendered.status, "ready", "a plan's status crosses onto the RenderedAsset wire");
});

test("llw-non-plan-docs-carry-no-status — a non-plan structured doc omits status (undefined, spread-when-present idiom)", () => {
  const principleDoc = {
    kind: "principle",
    id: "sample-principle",
    title: "Sample principle",
    description: "a fixture principle",
    references: [],
    statement: "State it.",
    why: "Because.",
    howToApply: "Apply it.",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const stored: StoredDoc = {
    id: "sample-principle",
    kind: "principle",
    doc: principleDoc,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.equal(rendered.status, undefined, "a non-plan structured doc never carries status");
});

test("llw-passthrough-and-degraded-carry-no-status — a body-bearing pass-through doc AND a degraded/unknown-kind doc both carry no status and never throw", () => {
  // (a) a body-bearing pass-through doc (a template).
  const templateDoc = {
    id: "template-sample",
    category: "template",
    title: "Template · sample",
    description: "the shape a fixture conforms to",
    body: "**The fixture.** A literal passthrough body.",
    references: [],
  };
  const storedTemplate: StoredDoc = {
    id: "template-sample",
    kind: "template",
    doc: templateDoc,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  let renderedTemplate: ReturnType<typeof renderStoredDoc> | undefined;
  assert.doesNotThrow(() => {
    renderedTemplate = renderStoredDoc(storedTemplate);
  });
  assert.equal(renderedTemplate?.status, undefined, "a pass-through doc never carries status");

  // (b) a degraded doc — an unknown kind this code has no KIND_SPECS entry for.
  const degradedDoc = {
    kind: "from-the-future",
    id: "navigator",
    title: "Navigator",
    description: "a unit from a newer schema",
    references: [],
    schemaVersion: 99,
  };
  const storedDegraded: StoredDoc = {
    id: "navigator",
    kind: "from-the-future",
    doc: degradedDoc,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  let renderedDegraded: ReturnType<typeof renderStoredDoc> | undefined;
  assert.doesNotThrow(() => {
    renderedDegraded = renderStoredDoc(storedDegraded);
  });
  assert.equal(renderedDegraded?.status, undefined, "a degraded doc never carries status");
  assert.ok(renderedDegraded?.degraded, "the degraded doc is flagged, but still carries no status");
});
