import test from "node:test";
import assert from "node:assert/strict";

import { NODE_MAJOR_FLOOR, type DoctorObservations } from "./doctor.js";
import { driveGuide, guideCommand, guideHelp, type GuideEffects } from "./guide.js";

/**
 * The machine floor for `storytree guide` (ADR-0207 D6) — the terminal surface that wires doctor +
 * planRepairs + the guide-loop controller + `install.ps1 -Step` into one runnable conversation.
 * Every effect is injected, so the WHOLE conversation is proven here with no machine, no installer
 * and no filesystem: scripted observations drive the loop, and a fake `runStep` records what the
 * guide would actually enact.
 *
 * The invariants that matter at this layer:
 *   • PREVIEW vs ENACT is the D6 "dev confirms" boundary — bare `guide` NEVER runs a step.
 *   • `--fix` repairs and RE-DOCTORS, converging to healthy (the repair loop closing).
 *   • D3 survives the shell: the Claude sign-in is instructed and the guide STOPS; storytree never
 *     runs the login, in either mode.
 *   • an owner-side block escalates rather than silently passing.
 */

const HEALTHY: DoctorObservations = {
  gitPresent: true,
  nodeMajor: NODE_MAJOR_FLOOR,
  provisioned: true,
  remoteReachable: true,
  seedReadable: true,
  claudeCliPresent: true,
  claudeLoggedIn: true,
  checkoutBehind: 0,
  hostedRead: "ok",
};

const obs = (over: Partial<DoctorObservations>): DoctorObservations => ({ ...HEALTHY, ...over });

/**
 * Build effects whose observations follow a SCRIPT — one entry per doctor run, so a repair can be
 * modelled as "the next probe comes back healthy". The last entry repeats if the loop probes again.
 */
function effects(
  script: DoctorObservations[],
  opts: { fix?: boolean; onStep?: (s: string) => void } = {},
): GuideEffects & { stepsRun: string[] } {
  const stepsRun: string[] = [];
  let i = 0;
  return {
    observe: () => script[Math.min(i++, script.length - 1)]!,
    runStep: (step) => {
      stepsRun.push(step);
      opts.onStep?.(step);
    },
    checkoutDir: "C:\\fake\\checkout",
    fix: opts.fix ?? false,
    stepsRun,
  };
}

// ---------------------------------------------------------------------------

test("guide-healthy-setup-reports-healthy-and-enacts-nothing", async () => {
  const fx = effects([obs({})]);
  const run = await driveGuide(fx);
  assert.equal(run.outcome, "healthy");
  assert.deepEqual(run.stepsRun, []);
  assert.match(run.lines.join("\n"), /healthy/i);
});

test("guide-preview-NEVER-enacts: a repairable failure is previewed, no installer step is run", async () => {
  const fx = effects([obs({ nodeMajor: null })], { fix: false });
  const run = await driveGuide(fx);
  assert.equal(run.outcome, "preview");
  assert.deepEqual(fx.stepsRun, [], "preview mode must never run an installer step");
  const text = run.lines.join("\n");
  assert.match(text, /guide --fix/, "preview must tell the dev how to opt in");
  assert.match(text, /@step:node/, "preview must name the concrete repair it would run");
});

test("guide-fix-repairs-and-re-doctors-to-healthy: the loop closes", async () => {
  // First probe: node missing. After the repair the next probe is clean — the repair loop converges.
  const fx = effects([obs({ nodeMajor: null }), obs({})], { fix: true });
  const run = await driveGuide(fx);
  assert.equal(run.outcome, "healthy");
  assert.deepEqual(fx.stepsRun, ["node"], "the guide must enact exactly the node installer step");
});

test("guide-fix-repairs-multiple-failures-in-dependency-order", async () => {
  // git + node both missing; each probe after a repair clears one, in doctor's probe order.
  const fx = effects(
    [obs({ gitPresent: false, nodeMajor: null }), obs({ nodeMajor: null }), obs({})],
    { fix: true },
  );
  const run = await driveGuide(fx);
  assert.equal(run.outcome, "healthy");
  assert.deepEqual(fx.stepsRun, ["git", "node"], "repairs must run prerequisites first");
});

test("guide-D3-login-is-instructed-and-STOPS, never enacted (either mode)", async () => {
  for (const fix of [false, true]) {
    const fx = effects([obs({ claudeLoggedIn: false })], { fix });
    const run = await driveGuide(fx);
    if (fix) {
      assert.equal(run.outcome, "needs-dev", "--fix must stop at the dev's own sign-in");
      assert.match(run.lines.join("\n"), /never handles your Claude credential/i);
    } else {
      assert.equal(run.outcome, "preview");
    }
    assert.deepEqual(fx.stepsRun, [], "storytree must NEVER run an installer step for the login (D3)");
  }
});

test("guide-owner-side-block-escalates rather than reporting healthy", async () => {
  // repo-fetchable refused is a WARN (doctor.ok stays true) but is an owner-side block.
  const fx = effects([obs({ remoteReachable: false })], { fix: true });
  const run = await driveGuide(fx);
  assert.equal(run.outcome, "escalated");
  assert.deepEqual(fx.stepsRun, []);
  assert.match(run.lines.join("\n"), /escalation to owner/i);
});

test("guide-unrepairable-residue-terminates-stuck, and does not retry the same step forever", async () => {
  // The node step "runs" but never clears the probe — the loop must try once and stop.
  const fx = effects([obs({ nodeMajor: null })], { fix: true });
  const run = await driveGuide(fx); // script's last entry repeats: node stays absent
  assert.equal(run.outcome, "stuck");
  assert.deepEqual(fx.stepsRun, ["node"], "a non-converging step is attempted exactly once");
});

test("guideCommand: envelope ok mirrors healthy, and next: routes the dev onward", async () => {
  const healthy = await guideCommand([], { observe: () => obs({}), runStep: () => {}, checkoutDir: "x" });
  assert.equal(healthy.ok, true);
  assert.ok(healthy.next?.includes("storytree library"));

  const preview = await guideCommand([], { observe: () => obs({ nodeMajor: null }), runStep: () => {}, checkoutDir: "x" });
  assert.equal(preview.ok, false, "a setup needing repair is not ok");
  assert.ok(preview.next?.includes("storytree guide --fix"));
});

test("guideCommand: --fix is a DEP, so a bare invocation cannot accidentally enact", async () => {
  let ran = 0;
  const env = await guideCommand([], {
    observe: () => obs({ nodeMajor: null }),
    runStep: () => { ran += 1; },
    checkoutDir: "x",
    // fix omitted => false
  });
  assert.equal(ran, 0, "without an explicit fix:true the command must enact nothing");
  assert.equal(env.ok, false);
});

test("guideCommand help is offered and documents the D3 boundary", async () => {
  const viaSub = await guideCommand(["help"]);
  assert.equal(viaSub.ok, true);
  assert.equal(viaSub.body, guideHelp().body);
  assert.match(viaSub.body, /never runs the login|never handles/i);
});

test("guide-D4-gap: a dev with NO IAP grant is escalated, never told 'you're all set'", async () => {
  // THE GAP THIS CLOSES: everything local is fine and GitHub Read works, but the hosted live read
  // refuses this dev's Google identity. Before the hosted-read probe existed doctor reported a clean
  // bill of health and the dev discovered the broken live read on their own.
  const fx = effects([obs({ hostedRead: "refused" })], { fix: true });
  const run = await driveGuide(fx);
  assert.equal(run.outcome, "escalated");
  assert.deepEqual(fx.stepsRun, [], "nothing here is installer-repairable");
  const text = run.lines.join("\n");
  assert.match(text, /IAP/i, "the paste must send the owner to the IAP grant");
  assert.doesNotMatch(text, /you're all set/i);
});

test("guide-D4: an unconfigured or offline hosted read is advisory, not an escalation", async () => {
  for (const hostedRead of ["unconfigured", "unreachable"] as const) {
    const run = await driveGuide(effects([obs({ hostedRead })], { fix: true }));
    assert.equal(run.outcome, "healthy", `${hostedRead} must stay advisory — the offline seed is the fallback`);
  }
});
