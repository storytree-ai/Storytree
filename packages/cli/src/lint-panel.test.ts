import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPanelPacket,
  renderKey,
  renderPacket,
  REFACTOR_PANEL_LENSES,
  RULE_PANEL_LENSES,
  type PanelSpecimen,
} from "./lint-panel.js";

const CONTEXT = "A TypeScript monorepo with strict compiler settings and a document-store seam.";

const site = (over: Partial<PanelSpecimen["sites"][number]> = {}) => ({
  file: "packages/library/src/thing.ts",
  line: 12,
  flagged: "Record<string, unknown>",
  context: "export interface Doc {\n  readonly body: Record<string, unknown>;\n}",
  ...over,
});

const specimen = (over: Partial<PanelSpecimen> = {}): PanelSpecimen => ({
  ruleId: "anti-slop/rule-one",
  role: "target",
  statement: "Dictionaries must declare a concrete value type.",
  sites: [site()],
  ...over,
});

const opts = { panel: "rule" as const, codebaseContext: CONTEXT, seed: "seed-1" };

void test("a one-rule packet is refused — it cannot be blind however it is worded", () => {
  const result = buildPanelPacket([specimen()], opts);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.refusal.code, "too-few-specimens");
});

void test("a packet with no control is refused", () => {
  const result = buildPanelPacket(
    [specimen(), specimen({ ruleId: "anti-slop/rule-two" })],
    opts,
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.refusal.code, "no-control");
});

void test("a packet of controls only is refused — it adjudicates nothing", () => {
  const result = buildPanelPacket(
    [
      specimen({ role: "control-uphold" }),
      specimen({ ruleId: "anti-slop/rule-two", role: "control-reject" }),
    ],
    opts,
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.refusal.code, "no-target");
});

void test("a specimen with no sites is refused — the panel judges real code, not descriptions", () => {
  const result = buildPanelPacket(
    [specimen(), specimen({ ruleId: "anti-slop/rule-two", role: "control-uphold", sites: [] })],
    opts,
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.refusal.code, "empty-specimen");
});

void test("a rule that names itself in its own statement is refused", () => {
  const result = buildPanelPacket(
    [
      specimen({ statement: "The rule-one check forbids unknown dictionary values." }),
      specimen({ ruleId: "anti-slop/rule-two", role: "control-uphold" }),
    ],
    opts,
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.refusal.code, "rule-name-leak");
});

void test("a rule named in ANOTHER specimen's evidence is refused — it identifies by elimination", () => {
  const result = buildPanelPacket(
    [
      specimen(),
      specimen({
        ruleId: "anti-slop/rule-two",
        role: "control-uphold",
        // A disable comment in real sampled code is the realistic way this happens.
        sites: [site({ context: "// oxlint-disable-next-line rule-one\nconst x = 1;" })],
      }),
    ],
    opts,
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.refusal.code, "rule-name-leak");
});

void test("a violation count stated in a rule statement is refused", () => {
  const result = buildPanelPacket(
    [
      specimen({ statement: "Dictionaries need concrete value types; this fires at 612 sites." }),
      specimen({ ruleId: "anti-slop/rule-two", role: "control-uphold" }),
    ],
    opts,
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.refusal.code, "count-leak");
});

void test("a violation count in the shared codebase context is refused", () => {
  const result = buildPanelPacket(
    [specimen(), specimen({ ruleId: "anti-slop/rule-two", role: "control-uphold" })],
    { ...opts, codebaseContext: "A monorepo carrying 5383 violations across ten rules." },
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.refusal.code, "count-leak");
});

void test("a well-formed packet is built and labelled", () => {
  const result = buildPanelPacket(
    [
      specimen(),
      specimen({ ruleId: "anti-slop/rule-two", role: "control-uphold", expected: "uphold: proven" }),
      specimen({ ruleId: "synthetic/rule-three", role: "control-reject", expected: "reject: bad" }),
    ],
    opts,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.packet.specimens.length, 3);
  assert.deepEqual(
    result.packet.specimens.map((s) => s.label),
    ["Rule A", "Rule B", "Rule C"],
  );
  assert.equal(result.packet.key.length, 3);
});

/**
 * THE CENTRAL ASSERTION. Everything else in this file guards an input; this guards the OUTPUT — the
 * text a judge actually receives. It would go red if `renderPacket` ever grew a line that printed a
 * rule id, a role or an expected answer, which is the single change that would turn this instrument
 * back into a survey without any other test noticing.
 */
void test("the judge's brief carries no rule id, no role and no expected answer", () => {
  const result = buildPanelPacket(
    [
      specimen({ ruleId: "anti-slop/no-unsafe-dictionary-type" }),
      specimen({
        ruleId: "anti-slop/no-chained-type-assertions",
        role: "control-uphold",
        statement: "Assertions must not be chained.",
        expected: "uphold — three chains hid claims the compiler then rejected",
      }),
      specimen({
        ruleId: "synthetic/no-separated-type-imports",
        role: "control-reject",
        statement: "Import type-only bindings through the same statement as values.",
        expected: "reject — the compiler settings make this impossible",
      }),
    ],
    opts,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const lens of result.packet.lenses) {
    const brief = renderPacket(result.packet, lens);
    for (const row of result.packet.key) {
      assert.ok(!brief.includes(row.ruleId), `brief leaked rule id ${row.ruleId}`);
      assert.ok(!brief.includes(row.role), `brief leaked role ${row.role}`);
      if (row.expected !== undefined) {
        assert.ok(!brief.includes(row.expected), "brief leaked an expected answer");
      }
    }
    assert.ok(brief.includes("Rule A"));
    assert.ok(brief.includes(lens.brief));
  }
});

void test("the answer key carries exactly what the brief must not", () => {
  const result = buildPanelPacket(
    [
      specimen(),
      specimen({
        ruleId: "anti-slop/rule-two",
        role: "control-uphold",
        expected: "uphold — independently proven",
      }),
    ],
    opts,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const key = renderKey(result.packet);
  assert.ok(key.includes("anti-slop/rule-two"));
  assert.ok(key.includes("control-uphold"));
  assert.ok(key.includes("uphold — independently proven"));
});

void test("labels are a seeded shuffle — reproducible, and not the authoring order", () => {
  const specimens = [
    specimen({ ruleId: "anti-slop/rule-a" }),
    specimen({ ruleId: "anti-slop/rule-b", role: "control-uphold" }),
    specimen({ ruleId: "anti-slop/rule-c", role: "control-reject" }),
    specimen({ ruleId: "anti-slop/rule-d", role: "control-uphold" }),
  ];
  const first = buildPanelPacket(specimens, { ...opts, seed: "alpha" });
  const again = buildPanelPacket(specimens, { ...opts, seed: "alpha" });
  assert.equal(first.ok, true);
  assert.equal(again.ok, true);
  if (!first.ok || !again.ok) return;
  assert.deepEqual(first.packet.key, again.packet.key, "same seed must give the same packet");

  // At least one seed must move the target off the authoring position, or the shuffle is decorative.
  const seeds = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const moved = seeds.some((seed) => {
    const built = buildPanelPacket(specimens, { ...opts, seed });
    return built.ok && built.packet.key[0]?.ruleId !== "anti-slop/rule-a";
  });
  assert.ok(moved, "no seed moved the authoring order — the shuffle is not shuffling");
});

void test("the panels are perspective-diverse, and the refactor panel is the smaller one", () => {
  const ruleIds = RULE_PANEL_LENSES.map((l) => l.id);
  const refactorIds = REFACTOR_PANEL_LENSES.map((l) => l.id);
  assert.equal(new Set(ruleIds).size, ruleIds.length, "rule-panel lenses must be distinct");
  assert.equal(new Set(refactorIds).size, refactorIds.length, "refactor lenses must be distinct");
  assert.ok(ruleIds.length >= 5, "the rule panel is the larger one");
  assert.ok(refactorIds.length < ruleIds.length, "the refactor panel is deliberately smaller");
  // Diversity has to reach the rendered text, not just the ids.
  const briefs = new Set(RULE_PANEL_LENSES.map((l) => l.brief));
  assert.equal(briefs.size, RULE_PANEL_LENSES.length);
  // One seat must be adversarial by assignment, or a unanimous verdict means nothing.
  assert.ok(ruleIds.includes("skeptic"));
});

void test("a refactor packet takes the refactor lenses and states the narrower question", () => {
  const result = buildPanelPacket(
    [specimen(), specimen({ ruleId: "anti-slop/rule-two", role: "control-uphold" })],
    { ...opts, panel: "refactor" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.packet.lenses.length, REFACTOR_PANEL_LENSES.length);
  const first = REFACTOR_PANEL_LENSES[0];
  assert.ok(first !== undefined);
  const brief = renderPacket(result.packet, first);
  assert.ok(brief.includes("is taken as CORRECT"));

  // The refactor panel must be asked for a REFACTOR finding, never a rule-panel verdict. Handed
  // `adopt`/`reject` it would re-litigate the rule it was told to take as settled, and the run would
  // produce a second rule-panel verdict wearing a refactor panel's name.
  assert.ok(brief.includes("refactor-found"));
  assert.ok(brief.includes("no-viable-refactor"));
  assert.ok(!brief.includes("`adopt`"), "the refactor brief must not offer rule-panel verdicts");
  assert.ok(!brief.includes("`adopt-narrowed`"));
});

void test("the rule panel keeps its own verdict vocabulary and is offered no refactor findings", () => {
  const result = buildPanelPacket(
    [specimen(), specimen({ ruleId: "anti-slop/rule-two", role: "control-uphold" })],
    opts,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const lens = RULE_PANEL_LENSES[0];
  assert.ok(lens !== undefined);
  const brief = renderPacket(result.packet, lens);
  assert.ok(brief.includes("`adopt`"));
  assert.ok(!brief.includes("no-viable-refactor"));
});
