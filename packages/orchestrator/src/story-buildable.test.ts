import test from "node:test";
import assert from "node:assert/strict";

import type { NodeSpec } from "./node-spec.js";
import type { NodeBuildConfig } from "./proof-config.js";
import { isStoryBuildable, storyDriveOrder, storyGoGreen } from "./story-build.js";

// Stage-1 red-green for the studio's story-level Build affordance (ADR-0090 Phase 2 increment): the
// SHARED predicate that decides whether `story build <id> --<mode>` has real work to drive, so the
// UI's "is this story buildable" answer mirrors what the build would actually run (never a drifting
// guess). Plus the STATUS-AWARE go-green affordance (ADR-0094): proposed→Build, mapped→Adopt, else
// none. Pure over hand-built NodeSpecs (the loader's output shape), no FS / no DB.

/** A minimal NodeSpec literal; pass a buildConfig to make the node buildable. */
function spec(
  id: string,
  tier: NodeSpec["tier"],
  opts: {
    dependsOn?: string[];
    capabilities?: string[];
    uatWitness?: NodeSpec["uatWitness"];
    buildConfig?: NodeBuildConfig;
    status?: NodeSpec["status"];
    reliabilityGates?: NodeSpec["reliabilityGates"];
  } = {},
): NodeSpec {
  return {
    id,
    tier,
    title: id,
    outcome: `outcome of ${id}`,
    status: opts.status ?? "proposed",
    proofMode: tier === "story" ? "UAT" : "integration-test",
    uatWitness: opts.uatWitness,
    story: tier === "story" ? undefined : "s",
    dependsOn: opts.dependsOn ?? [],
    consumedBy: [],
    capabilities: opts.capabilities ?? [],
    decisions: [],
    buildConfig: opts.buildConfig,
    guidance: undefined,
    uatTests: [],
    reliabilityGates: opts.reliabilityGates ?? [],
    file: `${id}.md`,
  };
}

/** A minimal observe reliability gate (the brownfield Adopt obligation, ADR-0085). */
const observeGate = (id: string): NodeSpec["reliabilityGates"][number] => ({
  id,
  title: `gate ${id}`,
  kind: "observe",
  covers: [],
  proofCommand: "pnpm test",
});

const cmd = { file: "node", args: ["--test"] };
const scope = { testGlobs: ["*.test.ts"], sourceGlobs: ["*.ts"] };
/** A live/dry-buildable config (a proof command + scope, no `real:` arm). */
const liveCfg: NodeBuildConfig = { command: cmd, scope };
/** A real-buildable config (adds the `real:` arm `--real` needs). */
const realCfg: NodeBuildConfig = {
  command: cmd,
  scope,
  real: { testFile: "x.test.ts", sourceFile: "x.ts", scope },
};

// ── isStoryBuildable ────────────────────────────────────────────────────────

test("a human-witnessed story with all-real-buildable caps is buildable both live and real (story node withheld)", () => {
  // notice-board / binding-staleness shape: human witness ⇒ story UAT node withheld; every cap real.
  const caps = [spec("c1", "capability", { buildConfig: realCfg }), spec("c2", "capability", { buildConfig: realCfg })];
  const story = spec("nb", "story", { capabilities: ["c1", "c2"] }); // uatWitness undefined ⇒ human
  assert.equal(isStoryBuildable(story, caps, "live"), true);
  assert.equal(isStoryBuildable(story, caps, "real"), true);
});

test("a story whose caps are live-only is live-buildable but NOT real-buildable", () => {
  // library shape: caps carry a (registry/spec) proof config but NO real: arm.
  const caps = [spec("c1", "capability", { buildConfig: liveCfg }), spec("c2", "capability", { buildConfig: liveCfg })];
  const story = spec("lib", "story", { capabilities: ["c1", "c2"] });
  assert.equal(isStoryBuildable(story, caps, "live"), true);
  assert.equal(isStoryBuildable(story, caps, "real"), false);
});

test("a machine-witnessed story drives its own UAT node, so a live-only story node blocks --real (library today)", () => {
  // Machine witness ⇒ the story node is DRIVEN (not withheld). Its caps are real, but the story
  // node has only a live config (a UAT ceremony, no real: arm) ⇒ --real is refused; --live is fine.
  const caps = [spec("c1", "capability", { buildConfig: realCfg })];
  const story = spec("m", "story", { capabilities: ["c1"], uatWitness: "machine", buildConfig: liveCfg });
  assert.equal(isStoryBuildable(story, caps, "live"), true);
  assert.equal(isStoryBuildable(story, caps, "real"), false);
});

test("a capless, human-witnessed story is not buildable in any mode — nothing to drive", () => {
  const story = spec("capless-story", "story", {}); // 0 caps, human witness ⇒ empty drive order
  assert.equal(isStoryBuildable(story, [], "live"), false);
  assert.equal(isStoryBuildable(story, [], "real"), false);
});

test("a story whose caps carry no proof config (e.g. drive-machinery) is not buildable", () => {
  const caps = [spec("c1", "capability"), spec("c2", "capability")]; // no buildConfig
  const story = spec("dm", "story", { capabilities: ["c1", "c2"] });
  assert.equal(isStoryBuildable(story, caps, "live"), false);
  assert.equal(isStoryBuildable(story, caps, "real"), false);
});

test("one non-real cap makes the whole story not real-buildable (every driven node must qualify)", () => {
  const caps = [spec("c1", "capability", { buildConfig: realCfg }), spec("c2", "capability", { buildConfig: liveCfg })];
  const story = spec("mix", "story", { capabilities: ["c1", "c2"] });
  assert.equal(isStoryBuildable(story, caps, "real"), false);
  assert.equal(isStoryBuildable(story, caps, "live"), true);
});

test("a malformed story (a listed cap with no spec) is not buildable — the topo refusal propagates", () => {
  const story = spec("bad", "story", { capabilities: ["missing"] });
  assert.equal(isStoryBuildable(story, [], "real"), false);
});

// ── storyDriveOrder (the drive set the build would run) ──────────────────────

test("storyDriveOrder withholds the story node for a human-witnessed story, keeps it for machine", () => {
  const caps = [spec("c1", "capability", { buildConfig: realCfg })];
  const human = spec("h", "story", { capabilities: ["c1"] });
  const machine = spec("m", "story", { capabilities: ["c1"], uatWitness: "machine" });

  const hd = storyDriveOrder(human, caps);
  assert.ok(hd.ok);
  assert.deepEqual(hd.order.map((n) => n.id), ["c1"]); // story node withheld

  const md = storyDriveOrder(machine, caps);
  assert.ok(md.ok);
  assert.deepEqual(md.order.map((n) => n.id), ["c1", "m"]); // story node driven (last)
});

// ── storyGoGreen (the status-aware go-green affordance, ADR-0094) ─────────────

test("a PROPOSED story with a real build to drive lights Build (proposed → healthy = drive)", () => {
  const caps = [spec("c1", "capability", { buildConfig: realCfg })];
  const story = spec("nb", "story", { capabilities: ["c1"], status: "proposed" });
  assert.equal(storyGoGreen(story, caps), "build");
});

test("a PROPOSED story with no real-buildable path lights nothing (build needs a genuine drive)", () => {
  const caps = [spec("c1", "capability", { buildConfig: liveCfg })]; // live-only, no real: arm
  const story = spec("p", "story", { capabilities: ["c1"], status: "proposed" });
  assert.equal(storyGoGreen(story, caps), "none");
});

test("a MAPPED story with reliability gates lights Adopt (mapped → healthy = adopt), NOT Build", () => {
  // The library shape under ADR-0094: brownfield with declared `## Reliability Gates`.
  const caps = [spec("c1", "capability", { buildConfig: liveCfg })];
  const story = spec("lib", "story", {
    capabilities: ["c1"],
    status: "mapped",
    reliabilityGates: [observeGate("lib#gate-1")],
  });
  assert.equal(storyGoGreen(story, caps), "adopt");
});

test("a MAPPED story does NOT light Build even when its driven nodes carry real: arms (ADR-0094 d.3)", () => {
  // The agent / binding-staleness shape: mapped, real-buildable caps, but NO reliability gates.
  // The old status-blind Build is gone — a mature brownfield artifact has no genuine live red — and
  // with no gates to adopt there is no go-green affordance yet (author `## Reliability Gates` to Adopt).
  const caps = [spec("c1", "capability", { buildConfig: realCfg })];
  const mappedRealNoGates = spec("agent", "story", { capabilities: ["c1"], status: "mapped" });
  assert.equal(isStoryBuildable(mappedRealNoGates, caps, "real"), true); // the MECHANISM still says yes…
  assert.equal(storyGoGreen(mappedRealNoGates, caps), "none"); // …but the affordance is gated on status.
});

test("a MAPPED story lights Adopt regardless of buildability (Adopt is observe-and-sign, not a drive)", () => {
  // Adopt does not need a real: arm — a pure port (zero caps) greens entirely from its gates.
  const port = spec("proof-protocol", "story", {
    status: "mapped",
    reliabilityGates: [observeGate("proof-protocol#gate-1")],
  });
  assert.equal(isStoryBuildable(port, [], "real"), false); // capless ⇒ not buildable…
  assert.equal(storyGoGreen(port, []), "adopt"); // …but Adopt-able via its reliability gate.
});

test("a PROVEN mapped story shows NO go-green action — proof outranks authored status (ADR-0040 / ADR-0094 d.1)", () => {
  // The storage-protocol bug (owner-reported 2026-06-27): a brownfield port keeps its authored
  // `mapped` FOREVER (`healthy` is non-authorable, ADR-0020) while its crown derives green from a
  // signed `adopted` verdict. Without the `proven` short-circuit it would keep offering Adopt on an
  // already-green tree. Same spec that lights Adopt unproven (below) must light NOTHING once proven.
  const port = spec("storage-protocol", "story", {
    status: "mapped",
    reliabilityGates: [observeGate("storage-protocol#gate-1")],
  });
  assert.equal(storyGoGreen(port, []), "adopt"); // unproven: Adopt is the path to green…
  assert.equal(storyGoGreen(port, [], true), "none"); // …proven: done, no go-green action.
});

test("proof outranks a proposed→build story too — proven ⇒ none even when a real drive exists", () => {
  // The clause is verdict-first: it precedes the status switch, so a proven story is `none` whatever
  // its authored status (a proposed story that reached a signed green is done, not still 'build').
  const caps = [spec("c1", "capability", { buildConfig: realCfg })];
  const story = spec("nb", "story", { capabilities: ["c1"], status: "proposed" });
  assert.equal(storyGoGreen(story, caps), "build"); // unproven proposed + real drive ⇒ Build…
  assert.equal(storyGoGreen(story, caps, true), "none"); // …proven ⇒ done.
});

test("proven defaults false — an offline caller keeps the status-only reading (under-claims, never guesses green)", () => {
  // Parity with the world hue offline (provenStatus): with no verdict to read, the affordance follows
  // authored status rather than fabricating a green it can't see. The 2-arg call is the offline form.
  const port = spec("p", "story", {
    status: "mapped",
    reliabilityGates: [observeGate("p#gate-1")],
  });
  assert.equal(storyGoGreen(port, []), "adopt"); // 2-arg (proven defaults false) ≡ the pre-fix behaviour.
});

test("a HEALTHY story has no go-green affordance (re-verification aside)", () => {
  const caps = [spec("c1", "capability", { buildConfig: realCfg })];
  const story = spec("h", "story", { capabilities: ["c1"], status: "healthy" });
  assert.equal(storyGoGreen(story, caps), "none");
});

test("an UNHEALTHY story has no go-green USER affordance — red-recovery is the agent loop (ADR-0094 d.2)", () => {
  const caps = [spec("c1", "capability", { buildConfig: realCfg })];
  const story = spec("u", "story", { capabilities: ["c1"], status: "unhealthy" });
  assert.equal(storyGoGreen(story, caps), "none");
});

test("a non-story node never has a go-green affordance", () => {
  const cap = spec("c1", "capability", { buildConfig: realCfg, status: "proposed" });
  assert.equal(storyGoGreen(cap, []), "none");
});
