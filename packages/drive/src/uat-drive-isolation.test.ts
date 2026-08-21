/**
 * A UAT DRIVE IS ISOLATED FROM THE SESSION THAT LAUNCHED IT.
 *
 * One defect with three faces, all measured in production drives, all the same cause: the spawned
 * drive is indistinguishable from its parent. `uat-drive.run.ts` spawns a fresh `bypassPermissions`
 * session in the SAME worktree, on the SAME branch, with the SAME env and ports — so the claim
 * ledger, the port space and the working tree all answer with the PARENT.
 *
 * Each face gets its own red→green assertion here, and each is written against the OBSERVED failure
 * rather than the abstraction:
 *
 *  1. CLAIMS — a drive's `noticeboard done` released the LAUNCHING session's claims. The proof drives
 *     the real `noticeboardCommand` `done` path against a fake ledger seeded with the parent's rows,
 *     under the identity a drive actually resolves to, and asserts those rows are untouched.
 *  2. SURFACE — a drive walked `localhost:5180`, a sibling worktree's JSON-backed studio, and reported
 *     on the criterion as though it had driven its own checkout. The proof is that the ownership
 *     judge REFUSES exactly that payload, and refuses every payload it cannot positively identify.
 *  3. LIFETIME — a walk that outlived its session was scored as a MISS (a product-shaped red for a
 *     harness reason), and its orphan dirtied the tree, which then refused the NEXT drive.
 *
 * On the `spawnSync` boundary: an in-process fake cannot answer a spawned child, so nothing here
 * pretends to. The isolation reaches the child through exactly one seam — the ENV `driveChildEnv`
 * builds — so that seam is what is asserted, and the runner's use of it is a single line that cannot
 * carry a different value than the one proved here.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";

import {
  deriveIdentity,
  noticeboardCommand,
  type SessionClaimStoreLike,
  type SessionIdentity,
} from "./noticeboard.js";
import {
  assertDriveIsolated,
  auditDrivePrompt,
  classifyDriveEnd,
  createDriveTiming,
  classifyDriveResidue,
  driveChildEnv,
  driveIdentityOverride,
  driveScratchDir,
  driveSurfacePorts,
  driveSurfaceUrl,
  isDriveSessionId,
  judgeDriveSurface,
  mintDriveSessionId,
  parsePorcelain,
  parseSurfaceAttestations,
  requireOwnSurface,
  uatDriveTaskPrompt,
  UAT_DRIVE_COMMIT_ENV,
  UAT_DRIVE_DEADLINE_AT_ENV,
  UAT_DRIVE_PORT_BASE,
  UAT_DRIVE_PORT_SPAN,
  UAT_DRIVE_SCRATCH_ENV,
  UAT_DRIVE_REPORT_BY_ENV,
  UAT_DRIVE_SESSION_ENV,
  UAT_DRIVE_SESSION_PREFIX,
  UAT_DRIVE_SURFACE_PORT_ENV,
  UAT_DRIVE_START_AT_ENV,
  type DriveIsolation,
  type DriveSurfaceAttestation,
  type UatDriveSpec,
} from "./uat-drive.js";

/**
 * A minimal but REAL drive spec — the prompt tests below run against `uatDriveTaskPrompt` itself,
 * not a paraphrase, so an edit that drops the surface contract reds here rather than degrading every
 * later drive silently.
 */
function driveSpec(): UatDriveSpec {
  return {
    storyId: "demo",
    storyTitle: "The demo story",
    storyOutcome: "A reader can walk from the map into a story.",
    criterionId: "uatc_0123456789abcdef01234567",
    journey: [
      "1. **The map shows the story** _(witness: machine)_: open the studio at `/`, find the story's",
      "   flower, click it. **Success —** the traversal panel opens on that story.",
    ].join("\n"),
    isolation: {
      sessionId: "uat-drive~uatc_0123456789abcdef01234567~4242",
      surfacePort: 5312,
      commitSha: COMMIT,
      scratchDir: "/tmp/storytree-uat-drive/demo",
      ceilingMinutes: 30,
      startAt: "2026-08-21T00:00:00.000Z",
      reportBy: "2026-08-21T00:28:00.000Z",
      deadlineAt: "2026-08-21T00:30:00.000Z",
      reportCleanupBufferMinutes: 2,
    },
  };
}

const PARENT_SESSION = "uat-drive-runs-i-5f31b2";
const PARENT_BRANCH = "claude/uat-drive-runs-i-5f31b2";
const COMMIT = "9b424f6b0000000000000000000000000000abcd";

const ISOLATION: DriveIsolation = {
  sessionId: "uat-drive~uatc_aaaaaaaaaaaaaaaaaaaaaaaa~7788",
  surfacePort: 5311,
  commitSha: COMMIT,
  scratchDir: "/tmp/storytree-uat-drive/run-1",
  ceilingMinutes: 30,
  startAt: "2026-08-21T00:00:00.000Z",
  reportBy: "2026-08-21T00:28:00.000Z",
  deadlineAt: "2026-08-21T00:30:00.000Z",
  reportCleanupBufferMinutes: 2,
};

// ---------------------------------------------------------------------------
// 1. CLAIMS — a drive cannot release the launching session's claims
// ---------------------------------------------------------------------------

/**
 * A claim store keyed the way `events.node_claim` is keyed — `(unit_id, session_id)` — so
 * `releaseClaimsBySession` deletes exactly what the real one deletes. The whole defect lives in that
 * key: two processes resolving to ONE session id are one holder as far as this store can tell.
 */
function makeLedger(rows: ClaimDocT[]): SessionClaimStoreLike & { rows: ClaimDocT[] } {
  const self = {
    rows,
    async claim(req: ClaimRequest): Promise<ClaimResult> {
      const claim: ClaimDocT = {
        unitId: req.unitId,
        sessionId: req.sessionId,
        branch: req.branch,
        intent: req.intent ?? "",
        claimedAt: "2026-08-19T00:00:00.000Z",
        heartbeatAt: "2026-08-19T00:00:00.000Z",
      };
      self.rows.push(claim);
      return { acquired: true, reclaimed: false, claim };
    },
    async releaseClaimsBySession(sessionId: string): Promise<number> {
      const before = self.rows.length;
      self.rows = self.rows.filter((r) => r.sessionId !== sessionId);
      return before - self.rows.length;
    },
  };
  return self;
}

function parentClaims(): ClaimDocT[] {
  return [
    {
      unitId: "uat-drive-runs-in-its-own-session-and-surface",
      sessionId: PARENT_SESSION,
      branch: PARENT_BRANCH,
      intent: "work",
      claimedAt: "2026-08-19T00:00:00.000Z",
      heartbeatAt: "2026-08-19T00:00:00.000Z",
    },
    {
      unitId: "uat-flip-remaining-eleven-nontaste-legs",
      sessionId: PARENT_SESSION,
      branch: PARENT_BRANCH,
      intent: "work",
      claimedAt: "2026-08-19T00:00:00.000Z",
      heartbeatAt: "2026-08-19T00:00:00.000Z",
    },
  ];
}

test("CLAIMS: a drive's `noticeboard done` leaves the launching session's claims standing", async () => {
  // The measured failure, end to end and through the REAL command: the drive tidies up, `done`
  // reports success, and the parent — still working, still on that branch — silently holds nothing.
  // Under ADR-0346 D1 a released work claim ADMITS a sibling that should have queued.
  const ledger = makeLedger(parentClaims());
  const driveIdentity: SessionIdentity = { sessionId: ISOLATION.sessionId, branch: PARENT_BRANCH };

  const env = driveChildEnv({}, ISOLATION);
  assert.equal(
    deriveIdentity(() => PARENT_BRANCH, env)?.sessionId,
    ISOLATION.sessionId,
    "a process spawned as a drive must resolve to the DRIVE's session, not the worktree's",
  );

  const res = await noticeboardCommand("done", { nodes: [] }, {
    identity: driveIdentity,
    now: () => new Date("2026-08-19T01:00:00.000Z"),
    claims: ledger,
  });

  assert.equal(res.ok, true, "the drive's own tidy-up still succeeds — it is not being crippled");
  assert.deepEqual(
    ledger.rows.map((r) => r.unitId).sort(),
    ["uat-drive-runs-in-its-own-session-and-surface", "uat-flip-remaining-eleven-nontaste-legs"],
    "THE PROPERTY: both of the launching session's claims survive a drive's `noticeboard done`",
  );
  assert.match(res.body, /No live claims held/, "and the drive is told, honestly, that it held none");
});

test("CLAIMS: the SAME command under the launching identity still releases — the test has teeth", async () => {
  // The control. Without it the assertion above would pass just as happily if `done` had quietly
  // stopped releasing anything at all, which would break the ceremony instead of fixing the drive.
  const ledger = makeLedger(parentClaims());
  const res = await noticeboardCommand("done", { nodes: [] }, {
    identity: { sessionId: PARENT_SESSION, branch: PARENT_BRANCH },
    now: () => new Date("2026-08-19T01:00:00.000Z"),
    claims: ledger,
  });
  assert.equal(res.ok, true);
  assert.deepEqual(ledger.rows, [], "an explicit `noticeboard done` by the session itself still releases");
  assert.match(res.body, /Released 2 story claims/);
});

test("CLAIMS: deriveIdentity honours a drive id, and IGNORES anything it cannot vouch for", () => {
  const git = () => PARENT_BRANCH;
  assert.equal(
    deriveIdentity(git, { [UAT_DRIVE_SESSION_ENV]: "  uat-drive~x~1  " })?.sessionId,
    "uat-drive~x~1",
    "trimmed and honoured",
  );
  // Failing OPEN on a bad value is deliberate: ignoring it costs the defect this closes, while
  // honouring it would re-key a real session's claims onto a string nobody can find.
  for (const bad of ["", "   ", "some-worktree", "uat-drive~a/b", "uat-drive~a\\b", "uat-drive~a b"]) {
    assert.equal(
      driveIdentityOverride({ [UAT_DRIVE_SESSION_ENV]: bad }),
      null,
      `"${bad}" must not be honoured as a drive identity`,
    );
  }
  assert.equal(driveIdentityOverride({}), null, "absent = the ordinary worktree derivation, unchanged");
});

test("CLAIMS: a minted drive id can never collide with a worktree-derived one", () => {
  const id = mintDriveSessionId({ criterionId: "uatc_aaaaaaaaaaaaaaaaaaaaaaaa", pid: 7788 });
  assert.ok(id.startsWith(UAT_DRIVE_SESSION_PREFIX));
  assert.ok(isDriveSessionId(id));
  assert.equal(isDriveSessionId(PARENT_SESSION), false, "a real worktree id is not a drive id");
  // Two concurrent drives of the SAME criterion are two rows, not one holder.
  assert.notEqual(id, mintDriveSessionId({ criterionId: "uatc_aaaaaaaaaaaaaaaaaaaaaaaa", pid: 7789 }));
  // The id keys spawn-record FILES as well as ledger rows, so a separator can never survive minting.
  const dirty = mintDriveSessionId({ criterionId: "../../etc/passwd", pid: 1 });
  assert.doesNotMatch(dirty, /[/\\]/);
  assert.ok(isDriveSessionId(dirty));
});

test("CLAIMS: the runner REFUSES to spawn a drive that would share the launching identity", () => {
  const launching = { sessionId: PARENT_SESSION };
  assert.equal(assertDriveIsolated(launching, ISOLATION.sessionId), null, "a distinct drive id is fine");

  // The regression this guards: a future edit that drops the override and passes the parent's id.
  // It is caught by the PREFIX arm, and that is not an accident — a worktree-derived id never carries
  // the reserved prefix, so "the drive was handed a real session's id" and "the drive was handed an id
  // deriveIdentity would ignore" are the same refusal, reached one check earlier.
  const collided = assertDriveIsolated(launching, PARENT_SESSION);
  assert.ok(collided !== null, "sharing the launching session's id must be refused BEFORE any spend");
  assert.match(collided, /does not carry the reserved/);
  assert.match(collided, /releases the launching\s+session's claims/, "and it says what the harm IS");

  // The equality arm is the belt-and-braces for the one case the prefix arm cannot see: a launching
  // session that is ITSELF a drive (a nested spawn), where both ids are legitimately drive-shaped.
  const nested = assertDriveIsolated({ sessionId: ISOLATION.sessionId }, ISOLATION.sessionId);
  assert.ok(nested !== null);
  assert.match(nested, /releases its parent's\s+claims/);

  // Any id without the reserved prefix is refused for the same reason.
  assert.match(assertDriveIsolated(launching, "plain-id")!, /does not carry the reserved/);

  // The primary checkout holds no claims, so there is nothing to protect and nothing to refuse.
  assert.equal(assertDriveIsolated(null, ISOLATION.sessionId), null);
});

test("CLAIMS: the child env is the ONLY seam, and it carries the whole isolation", () => {
  // An in-process fake cannot answer a spawnSync child, so this is where the runner's promise is
  // provable: whatever the child does, it starts from exactly this environment.
  const env = driveChildEnv({ PATH: "/usr/bin", STORYTREE_SESSION_ID: "the-parent" }, ISOLATION);
  assert.equal(env[UAT_DRIVE_SESSION_ENV], ISOLATION.sessionId);
  assert.equal(env[UAT_DRIVE_SURFACE_PORT_ENV], "5311");
  assert.equal(env[UAT_DRIVE_SCRATCH_ENV], ISOLATION.scratchDir);
  assert.equal(env[UAT_DRIVE_START_AT_ENV], ISOLATION.startAt);
  assert.equal(env[UAT_DRIVE_REPORT_BY_ENV], ISOLATION.reportBy);
  assert.equal(env[UAT_DRIVE_DEADLINE_AT_ENV], ISOLATION.deadlineAt);
  assert.equal(env["PATH"], "/usr/bin", "the rest of the environment is inherited");
  assert.equal(
    "STORYTREE_SESSION_ID" in env,
    false,
    "STORYTREE_SESSION_ID means 'inherit the parent session' — leaving it set re-collapses the two identities through the other door",
  );
});

test("LIFETIME: the runner owns an absolute deadline and reserves report/cleanup time before it", () => {
  assert.deepEqual(createDriveTiming(Date.parse("2026-08-21T00:00:00.000Z"), 30), {
    startAt: "2026-08-21T00:00:00.000Z",
    reportBy: "2026-08-21T00:28:00.000Z",
    deadlineAt: "2026-08-21T00:30:00.000Z",
    reportCleanupBufferMinutes: 2,
  });

  const prompt = uatDriveTaskPrompt(driveSpec());
  assert.match(prompt, /reportBy.*2026-08-21T00:28:00\.000Z/i);
  assert.match(prompt, /every wait and tool timeout.*end by reportBy/i);
  assert.match(prompt, /2 minutes.*report and cleanup/i);

  const weakened = prompt.replace(/\s*- reportBy: 2026-08-21T00:28:00\.000Z[^\n]*\n/i, "\n");
  const audit = auditDrivePrompt(weakened, driveSpec());
  assert.equal(audit.ok, false, "an absolute boundary missing from the prompt must refuse before spend");
  assert.ok(audit.missing.includes("the isolation clause"));
});

test("SURFACE LAUNCH: the prompt forwards Studio's reserved port through the canonical package script", () => {
  const spec = driveSpec();
  const prompt = uatDriveTaskPrompt(spec);
  const canonical =
    "$env:STORYTREE_STUDIO_STORE='pg'; pnpm --filter studio dev --port 5312 --strictPort --host 127.0.0.1";

  assert.ok(prompt.includes(canonical), "the walker receives one exact, runnable Studio launch command");
  assert.doesNotMatch(
    prompt,
    /pnpm --filter studio dev -- --port/,
    "a literal separator reaches Vite when pnpm.cmd is launched via Start-Process, so the reserved port is ignored",
  );
  assert.equal(auditDrivePrompt(prompt, spec).ok, true);

  for (const weakened of [
    prompt.replace(canonical, ""),
    prompt.replace(
      canonical,
      "$env:STORYTREE_STUDIO_STORE='pg'; pnpm --filter studio dev -- --port 5312 --strictPort --host 127.0.0.1",
    ),
    prompt.replace(
      canonical,
      "$env:STORYTREE_STUDIO_STORE='pg'; pnpm exec vite --port 5312 --strictPort --host 127.0.0.1",
    ),
  ]) {
    const audit = auditDrivePrompt(weakened, spec);
    assert.equal(audit.ok, false, "removing or bypassing the supported package script must refuse before spend");
    assert.ok(audit.missing.includes("the isolation clause"));
  }
});

// ---------------------------------------------------------------------------
// 2. SURFACE — a drive refuses a surface it cannot prove is its own
// ---------------------------------------------------------------------------

const EXPECT = { commitSha: COMMIT, requireLiveStore: true } as const;

test("SURFACE: the measured localhost:5180 failure — a sibling's JSON-backed studio is REFUSED", () => {
  const sibling = { store: "json", code: { startedAt: COMMIT, head: COMMIT, stale: false }, pid: 999 };
  const judged = judgeDriveSurface(sibling, EXPECT);
  assert.equal(judged.ok, false);
  assert.match(judged.reason, /json/);
  assert.match(judged.reason, /does not reflect CLI writes/);
});

test("SURFACE: a live-store studio serving a DIFFERENT checkout is REFUSED", () => {
  const otherWorktree = {
    store: "pg",
    code: { startedAt: "1111111111111111111111111111111111111111", head: "1111111111", stale: false },
  };
  const judged = judgeDriveSurface(otherWorktree, EXPECT);
  assert.equal(judged.ok, false);
  assert.match(judged.reason, /1111111111/);
  assert.match(judged.reason, /9b424f6b00/, "both shas are named, so the reader can see WHICH tree answered");
  assert.match(judged.reason, /DIFFERENT checkout/);
});

test("SURFACE: anything that cannot be positively identified is REFUSED (fail-closed)", () => {
  // The failure being closed is a drive BELIEVING an unproven surface, so "cannot tell" must land on
  // the same side as "not mine". Each of these is a real payload shape, not a hypothetical.
  const unidentifiable: Array<[string, unknown]> = [
    ["nothing answered", null],
    ["not an object", "<!doctype html>"],
    ["a studio with no code stamp (git unavailable to it)", { store: "pg", pid: 4 }],
    ["a code stamp with no startedAt", { store: "pg", code: { head: COMMIT } }],
    ["no store field at all", { code: { startedAt: COMMIT } }],
  ];
  for (const [label, payload] of unidentifiable) {
    const judged = judgeDriveSurface(payload, EXPECT);
    assert.equal(judged.ok, false, `${label} must be refused`);
    assert.ok(judged.reason.length > 0, `${label} must say WHY`);
  }
});

test("SURFACE: the drive's OWN studio is accepted — including when its checkout has since moved", () => {
  const own = judgeDriveSurface({ store: "pg", code: { startedAt: COMMIT, head: COMMIT, stale: false } }, EXPECT);
  assert.equal(own.ok, true);

  // `stale` says the checkout moved on disk AFTER the server started. What the server is SERVING is
  // still the pinned commit, which is the only thing a drive measures — so this is a note, not a red.
  const moved = judgeDriveSurface(
    { store: "pg", code: { startedAt: COMMIT, head: "2222222222", stale: true } },
    EXPECT,
  );
  assert.equal(moved.ok, true);
  assert.match(moved.note, /has since moved on disk/);
});

test("SURFACE: the reserved band avoids every port this box was measured holding", () => {
  const ports = driveSurfacePorts(process.pid);
  assert.equal(ports.length, UAT_DRIVE_PORT_SPAN, "the whole band is offered, so 'busy' means BUSY");
  assert.equal(new Set(ports).size, UAT_DRIVE_PORT_SPAN, "and never offers the same port twice");
  for (const measured of [5173, 5174, 5175, 5176, 5177, 5178, 5180, 5190, 5199]) {
    assert.equal(ports.includes(measured), false, `${measured} was held by a sibling worktree when this was filed`);
  }
  for (const p of ports) {
    assert.ok(p >= UAT_DRIVE_PORT_BASE && p < UAT_DRIVE_PORT_BASE + UAT_DRIVE_PORT_SPAN);
  }
  // Seeded, so two concurrent drives start at different candidates rather than racing for one.
  assert.notEqual(driveSurfacePorts(1)[0], driveSurfacePorts(2)[0]);
});

// ---------------------------------------------------------------------------
// 2b. SURFACE, ENFORCED — the judgement above has to actually RUN
//
// `judgeDriveSurface` was landed, fully tested, and called by NOTHING: the rule lived only as a
// sentence in the drive prompt, which `auditDrivePrompt` checked for PRESENCE and never for
// EXECUTION. These are the tests for the half that makes it mechanical.
// ---------------------------------------------------------------------------

const RESERVED = driveSurfaceUrl(5312);
const okAttestation = (url: string): DriveSurfaceAttestation => ({
  url,
  ok: true,
  detail: "the surface is this drive's own",
  at: "2026-08-20T00:00:00.000Z",
});

test("ENFORCED: a report that never names a surface is REFUSED — omission is the silence being closed", () => {
  const verdict = requireOwnSurface({
    reportedSurface: undefined,
    reservedUrl: RESERVED,
    attestations: [okAttestation(RESERVED)],
  });
  assert.equal(verdict.ok, false, "the OLD report shape must not pass — it is how every driver would opt out");
  assert.match(verdict.reason, /named no `surface`/);
  // Even a perfectly good attestation cannot rescue it: the report still does not say what it drove.
});

test("ENFORCED: the ORIGINAL failure — a report naming a sibling's studio is REFUSED", () => {
  // The measured failure: drive 2 pointed itself at localhost:5180, a JSON-backed sibling, and
  // reported on the criterion as though it were this checkout's studio.
  const verdict = requireOwnSurface({
    reportedSurface: "http://localhost:5180",
    reservedUrl: RESERVED,
    attestations: [okAttestation("http://localhost:5180")],
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /5180/, "the refusal names what it drove");
  assert.match(verdict.reason, /5312/, "and what it was given, so the reader can see the swap");
  // Note the attestation SAYS ok — a driver that ran the check against the wrong surface still fails,
  // because the reserved URL is the standard and the driver does not get to choose it.
});

test("ENFORCED: a report naming the reserved surface with NO attestation is REFUSED — the check never ran", () => {
  const verdict = requireOwnSurface({ reportedSurface: RESERVED, reservedUrl: RESERVED, attestations: [] });
  assert.equal(verdict.ok, false, "this is the whole point: an instructed check that was skipped must not pass");
  assert.match(verdict.reason, /never RAN/);
  assert.match(verdict.reason, /uat-drive-surface\.check\.ts/, "and the refusal says how to satisfy it");
});

test("ENFORCED: a REFUSING attestation is carried through, quoted, rather than being averaged away", () => {
  const verdict = requireOwnSurface({
    reportedSurface: RESERVED,
    reservedUrl: RESERVED,
    attestations: [
      okAttestation(RESERVED),
      { url: RESERVED, ok: false, detail: 'backed by the "json" store', at: "2026-08-20T00:01:00.000Z" },
    ],
  });
  assert.equal(verdict.ok, false, "ONE refusal against the surface is enough — passes do not outvote it");
  assert.match(verdict.reason, /json/, "and the original reason survives to the runner's output");
});

test("ENFORCED: the honest CLI-only journey passes without an attestation, and says why", () => {
  // Several criteria are pure CLI walks. Demanding an attestation from them would refuse correct
  // drives, so `null` is a first-class answer — a DECLARATION on the record, not a loophole.
  const verdict = requireOwnSurface({ reportedSurface: null, reservedUrl: RESERVED, attestations: [] });
  assert.equal(verdict.ok, true);
  assert.match(verdict.note, /no HTTP surface/);
});

test("ENFORCED: the honest drive passes — reserved URL, attested, trailing slash and case forgiven", () => {
  const verdict = requireOwnSurface({
    reportedSurface: `${RESERVED}/`,
    reservedUrl: RESERVED,
    attestations: [okAttestation(RESERVED.toUpperCase())],
  });
  assert.equal(verdict.ok, true, "a trailing slash and host case are noise; refusing them would tax the honest case");
  assert.match(verdict.note, /ownership proven/);
});

test("ENFORCED: a half-written attestation line is dropped, and dropping it REFUSES rather than passes", () => {
  // A killed child can leave a torn line. It proves nothing, so it is not read as evidence — and the
  // absence it leaves behind then lands on the fail-closed side rather than being ignored.
  const parsed = parseSurfaceAttestations(
    `${JSON.stringify(okAttestation(RESERVED))}\n{"url":"http://localhost:5312","ok":tr\n\n`,
  );
  assert.equal(parsed.length, 1, "the torn line is dropped, the good one survives");

  const onlyTorn = parseSurfaceAttestations('{"url":"http://localhost:5312","ok":tr');
  assert.deepEqual(onlyTorn, []);
  const verdict = requireOwnSurface({ reportedSurface: RESERVED, reservedUrl: RESERVED, attestations: onlyTorn });
  assert.equal(verdict.ok, false, "an unreadable attestation must never be counted as a passing one");
});

test("ENFORCED: the drive prompt ASKS for the surface field, and the audit fails when it stops asking", () => {
  // The quiet half of the failure: `requireOwnSurface` refuses a report with no `surface`, so a
  // prompt that stopped ASKING for one would turn every drive into a harness refusal — a whole
  // population of paid spend wasted, for a reason that looks like the driver's fault.
  const spec = driveSpec();
  const prompt = uatDriveTaskPrompt(spec);
  assert.ok(prompt.includes(`"surface": "${driveSurfaceUrl(spec.isolation.surfacePort)}" | null`));
  assert.equal(auditDrivePrompt(prompt, spec).ok, true);

  const weakened = prompt.replace(`  "surface": "${driveSurfaceUrl(spec.isolation.surfacePort)}" | null`, "");
  const audit = auditDrivePrompt(weakened, spec);
  assert.equal(audit.ok, false);
  assert.ok(audit.missing.some((m) => m.includes("surface")));
});

test("ENFORCED: the child is told which commit to hold the surface to — it never supplies its own standard", () => {
  const iso = driveSpec().isolation;
  const env = driveChildEnv({}, iso);
  assert.equal(
    env[UAT_DRIVE_COMMIT_ENV],
    iso.commitSha,
    "a check whose standard the caller supplies proves whatever the caller wanted",
  );
});

// ---------------------------------------------------------------------------
// 3. LIFETIME — a cut-off walk is not a finding, and its residue is swept
// ---------------------------------------------------------------------------

test("LIFETIME: a walk the harness cut off is a HARNESS end, never a product finding", () => {
  const end = classifyDriveEnd({ timedOut: true, reportReadable: false, ceilingMinutes: 30, elapsedMinutes: 30 });
  assert.equal(end.kind, "cut-off");
  assert.equal(end.harness, true, "THE PROPERTY: a journey still progressing is not scored as a product FAIL");
  assert.match(end.reason, /NOT a finding about the product/);
  assert.match(end.reason, /STORYTREE_UAT_DRIVE_TIMEOUT_MIN=60/, "and it names the repair, arithmetic done");
});

test("LIFETIME: a session that ran out BEFORE the walk did is a distinct harness end", () => {
  // The measured shape: a driver started a 40-minute poll inside a session that ended at 11.3 min —
  // well inside the 30-min ceiling, so nothing was cut off. Same red, completely different repair,
  // which is why the two are not one bucket.
  const end = classifyDriveEnd({ timedOut: false, reportReadable: false, ceilingMinutes: 30, elapsedMinutes: 11.3 });
  assert.equal(end.kind, "no-report");
  assert.equal(end.harness, true);
  assert.match(end.reason, /11\.3m/);
  assert.match(end.reason, /ceiling it never reached/);
  assert.match(end.reason, /Shorten the walk, or split the journey/);
});

test("LIFETIME: a drive that reported is the ONLY end that says anything about the product", () => {
  const end = classifyDriveEnd({ timedOut: false, reportReadable: true, ceilingMinutes: 30, elapsedMinutes: 4 });
  assert.equal(end.kind, "reported");
  assert.equal(end.harness, false, "a reported fail IS a finding and must keep reading as one");
});

test("LIFETIME: an orphan's residue is attributed to the drive and swept, so the NEXT drive runs", () => {
  // The measured cost: an orphaned Playwright harness wrote a PNG into the tree after its drive
  // ended; the next drive refused on the dirty tree, and the one after that too.
  const before = parsePorcelain("");
  const after = parsePorcelain("?? apps/studio/failure.png\n?? test-results/\n");
  const residue = classifyDriveResidue(before, after);
  assert.deepEqual(residue.sweep, ["apps/studio/failure.png", "test-results/"]);
  assert.deepEqual(residue.blocking, [], "untracked litter is not a violation, just litter");
});

test("LIFETIME: a drive that edited TRACKED source is reported, never swept", () => {
  // The prompt forbids editing repository source to make a journey pass. Deleting the evidence would
  // destroy work and hide the violation in one move, so the asymmetry is deliberate.
  const residue = classifyDriveResidue(parsePorcelain(""), parsePorcelain(" M packages/drive/src/uat-drive.ts\n?? shot.png\n"));
  assert.deepEqual(residue.sweep, ["shot.png"]);
  assert.deepEqual(residue.blocking, ["packages/drive/src/uat-drive.ts"]);
});

test("LIFETIME: residue is what appeared DURING the drive — pre-existing state is never touched", () => {
  const before = parsePorcelain("?? notes.md\n");
  const after = parsePorcelain("?? notes.md\n?? shot.png\n");
  assert.deepEqual(classifyDriveResidue(before, after).sweep, ["shot.png"]);
});

test("LIFETIME: porcelain parsing survives renames, quoting and CRLF", () => {
  const entries = parsePorcelain('R  old.ts -> new.ts\r\n?? "has space.png"\r\n\r\n');
  assert.deepEqual(entries, [
    { code: "R ", path: "new.ts" },
    { code: "??", path: "has space.png" },
  ]);
});

test("LIFETIME: the scratch directory is OUTSIDE the repository and unique per run", () => {
  const dir = driveScratchDir("/tmp/", "uat-drive:studio-build:9b424f6b00:7788");
  assert.match(dir, /^\/tmp\/storytree-uat-drive\//, "out of tree — a screenshot in the tree refuses the next drive");
  assert.doesNotMatch(dir, /:/, "and safe as a path on Windows too");
  assert.notEqual(dir, driveScratchDir("/tmp/", "uat-drive:studio-build:9b424f6b00:7789"));
});
