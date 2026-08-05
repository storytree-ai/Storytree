/**
 * Story `context-traversal-capture`, capability `offer-set-render-agreement` (ADR-0260),
 * story spec `stories/context-traversal-capture/offer-set-render-agreement.md`.
 *
 * Every capability landed on this story so far verifies a read against ITS OWN recorded account —
 * against the traversal's account of what it was shown. This capability breaks that circularity for
 * one axis: it checks the recorded `candidate_set` against an ORACLE that reads the CLI's own printed
 * Sources block, independently of the telemetry's re-derivation from `doc.references`.
 *
 * Contracts 1 and 3 spawn the REAL `storytree` CLI (`node packages/cli/launch.mjs …`) as a child
 * process — never an in-process call — through a fixture STORE DOOR served in its own process, exactly
 * as `terminal-capture.uat.test.ts` does in this same package. A hand-built stdout string would
 * re-create the very circularity this capability exists to break, so those two contracts must observe
 * a real, already-exited process's own bytes.
 *
 * No `as` cast narrows anything anywhere in this file: composed events are annotated with their OWN
 * member type (`ContextVisitEvent`, `CandidateSetEvent`), and every `OfferSetAgreement` read back is
 * narrowed via an explicit `verified` check + `assert.equal` + `if (...) throw`, mirroring
 * `decision-point-playback.test.ts`.
 *
 * Contracts covered (`stories/context-traversal-capture/offer-set-render-agreement.md`):
 *   1. the-recorded-offer-set-is-verified-against-the-cli-s-own-rendered-sources-block
 *   2. the-oracle-derives-offer-ids-from-the-render-without-importing-the-function-it-checks
 *   3. the-recorded-order-is-authored-and-the-rendered-order-is-grouped-so-the-sequences-differ
 *   4. a-read-that-recorded-no-offer-is-reported-as-unverified-and-never-as-agreement
 *   5. a-label-carrying-its-own-parentheses-still-yields-the-trailing-ref
 *   6. a-membership-disagreement-names-the-ids-on-each-side-rather-than-a-bare-boolean
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, before, after } from "node:test";

import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type {
  CandidateSetEvent,
  ContextTraversalEvent,
  ContextVisitEvent,
} from "@storytree/context-traversal-telemetry";

import { readTraversalSession } from "./sink.js";
import {
  compareOfferSetToRender,
  parseRenderedSourcesOffers,
  renderOfferSetAgreement,
} from "./offer-set-render-agreement.js";
import type { OfferSetAgreement } from "./offer-set-render-agreement.js";

const LAUNCHER = fileURLToPath(new URL("../../cli/launch.mjs", import.meta.url));
const IMPL_SOURCE_PATH = fileURLToPath(new URL("./offer-set-render-agreement.ts", import.meta.url));

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: readonly string[], env: NodeJS.ProcessEnv): CliResult {
  const res = spawnSync(process.execPath, [LAUNCHER, ...args], { encoding: "utf8", env });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/**
 * A STORE DOOR over the library's fixture corpus, in its OWN process, for the whole suite — see
 * `terminal-capture.uat.test.ts` for the full rationale (an in-process door would deadlock against
 * `spawnSync`'s blocking of this process's event loop).
 */
let doorProc: ChildProcess | undefined;
let doorUrl: string | undefined;

const DOOR = fileURLToPath(new URL("../../cli/fixture-door.mjs", import.meta.url));

before(async () => {
  doorProc = spawn(process.execPath, [DOOR], { stdio: ["ignore", "pipe", "pipe"] });
  const port = await new Promise<string>((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error(`fixture door did not start: ${buf}`)), 30_000);
    doorProc?.stdout?.setEncoding("utf8");
    doorProc?.stdout?.on("data", (c: string) => {
      buf += c;
      const m = /PORT=(\d+)/.exec(buf);
      if (m?.[1]) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    doorProc?.on("error", reject);
  });
  doorUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  doorProc?.kill();
});

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `offer-set-render-agreement-${prefix}-`));
}

/** The env every test starts from: ambient process.env with the traversal-only variables stripped. */
function baseEnv(): NodeJS.ProcessEnv {
  const {
    STORYTREE_TRAVERSAL_DIR: _dir,
    STORYTREE_SESSION_ID: _session,
    STORYTREE_TRAVERSAL: _toggle,
    ...rest
  } = process.env;
  return doorUrl === undefined ? rest : { ...rest, STORYTREE_STORE_URL: doorUrl };
}

function candidateSetsOf(events: readonly ContextTraversalEvent[]): CandidateSetEvent[] {
  return events.filter((event): event is CandidateSetEvent => event.kind === "candidate_set");
}

/** Narrows an `OfferSetAgreement` to its verified branch or fails loudly — no `as` cast. */
function expectVerified(
  result: OfferSetAgreement,
  context: string,
): Extract<OfferSetAgreement, { verified: true }> {
  assert.equal(result.verified, true, `${context}: expected verified:true, got ${JSON.stringify(result)}`);
  if (!result.verified) throw new Error("unreachable");
  return result;
}

/** Narrows an `OfferSetAgreement` to its unverified branch or fails loudly — no `as` cast. */
function expectUnverified(
  result: OfferSetAgreement,
  context: string,
): Extract<OfferSetAgreement, { verified: false }> {
  assert.equal(result.verified, false, `${context}: expected verified:false, got ${JSON.stringify(result)}`);
  if (result.verified) throw new Error("unreachable");
  return result;
}

/** A minimal `library-artifact` surface visit event, typed with its OWN member type. */
function visitEvent(visitId: string, nodeId: string, surfaceId: string): ContextVisitEvent {
  return {
    kind: "full_payload_read",
    eventId: `event:${visitId}`,
    sessionId: "session-hand-built",
    at: "2026-08-06T00:00:00.000Z",
    visitId,
    nodeId,
    surfaceId,
  };
}

/** A minimal `candidate_set` event, typed with its OWN member type. */
function candidateSetEvent(
  candidateSetId: string,
  candidateNodeIds: [string, ...string[]],
  surfaceId: string,
): CandidateSetEvent {
  return {
    kind: "candidate_set",
    eventId: `event:${candidateSetId}`,
    sessionId: "session-hand-built",
    at: "2026-08-06T00:00:00.000Z",
    candidateSetId,
    surfaceId,
    candidateNodeIds,
  };
}

// ---------------------------------------------------------------------------
// 1. the-recorded-offer-set-is-verified-against-the-cli-s-own-rendered-sources-block
// ---------------------------------------------------------------------------

test(
  "the-recorded-offer-set-is-verified-against-the-cli-s-own-rendered-sources-block: a real spawned `library artifact merge-ceremony` read's recorded offer set agrees in membership with the ids the CLI's own Sources block actually printed",
  () => {
    const dir = freshDir("contract1");
    const sessionId = "session-contract1";
    const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };

    const result = runCli(["library", "artifact", "merge-ceremony"], env);
    assert.equal(result.status, 0, `expected the spawned read to exit 0, got ${result.status}: ${result.stderr}`);
    assert.match(result.stdout, /\nSources:\n/, "sanity: this fixture must really print a Sources block");

    const { replay, skipped } = readTraversalSession({ dir, sessionId });
    assert.equal(skipped, 0);
    assert.equal(candidateSetsOf(replay.events).length, 1, "sanity: the read must have recorded exactly one offer");

    const agreement = compareOfferSetToRender(result.stdout, replay.events);
    const verified = expectVerified(agreement, "contract1");

    assert.equal(
      verified.membershipAgrees,
      true,
      "the recorded offer set must agree with the ids the render's Sources block actually printed",
    );
    assert.deepEqual([...verified.disagreement.missingFromRecorded], []);
    assert.deepEqual([...verified.disagreement.extraInRecorded], []);
    assert.ok(verified.rendered.length > 0, "the render must have printed at least one offer");
    assert.equal(
      verified.recorded.length,
      verified.rendered.length,
      "membership agreement over no duplicate ids means equal cardinality too",
    );

    // Independently: the oracle applied directly to THIS SAME stdout must derive the same id set the
    // comparison read off it — proven on its own terms, not merely through the comparison's verdict.
    const oracleIds = parseRenderedSourcesOffers(result.stdout);
    assert.deepEqual([...oracleIds].sort(), [...verified.recorded].sort());

    const summary = renderOfferSetAgreement(agreement);
    assert.match(
      summary,
      /^offer-set agreement: membership agrees, order (agrees|differs) \(rendered \d+, recorded \d+\)$/,
    );
  },
);

// ---------------------------------------------------------------------------
// 2. the-oracle-derives-offer-ids-from-the-render-without-importing-the-function-it-checks
// ---------------------------------------------------------------------------

test(
  "the-oracle-derives-offer-ids-from-the-render-without-importing-the-function-it-checks: parseRenderedSourcesOffers applies the asset:-stripping offer-id rule to a printed Sources block on its own, and the module doing so imports nothing from offer-candidate-sets.js",
  () => {
    const source = fs.readFileSync(IMPL_SOURCE_PATH, "utf8");
    assert.ok(
      !source.includes("offer-candidate-sets"),
      "the oracle must never import offer-candidate-sets.js — that would re-run the circularity " +
        "this capability exists to break",
    );
    assert.ok(
      !/\bofferIdOf\b/.test(source),
      "the oracle must not import or call offerIdOf — it applies the same id rule independently",
    );

    const stdout = [
      "# some title    [definition]",
      "id: some-id",
      "",
      "body text",
      "",
      "Sources:",
      "  Definitions:",
      "    - trunk  (asset:trunk)",
      "  Decisions (ADRs):",
      "    - decisions/0022-ci-green-gate-and-auto-merge.md  " +
        "(doc:decisions/0022-ci-green-gate-and-auto-merge.md)",
      "  Story nodes:",
      "    - some-story  (node:some-story)",
      "  Other:",
      "    - bare-id  (bare-id)",
      "    - asset:x  (asset:asset:x)",
      "",
      "provenance: test",
    ].join("\n");

    const ids = parseRenderedSourcesOffers(stdout);
    assert.deepEqual(
      [...ids],
      [
        "trunk",
        "doc:decisions/0022-ci-green-gate-and-auto-merge.md",
        "node:some-story",
        "bare-id",
        "asset:x",
      ],
      "a leading asset: is stripped, every other prefix (doc:, node:) and a bare id are kept verbatim",
    );
    // The trailing entry is the STRIP-ONCE case, and it is the one a regex would get wrong: a rule
    // written /^(asset:)+/ (or applied in a loop) would reduce `asset:asset:x` to `x`, silently
    // renaming an offer whose id legitimately begins with the prefix string. `offerIdOf` strips one
    // occurrence, so the oracle's independent copy must too — otherwise the two paths would diverge
    // here and this capability's whole comparison would be reading a corrupted oracle.
    assert.ok(
      ids.includes("asset:x"),
      "the asset: prefix must be stripped exactly ONCE, never repeatedly",
    );
    assert.ok(!ids.includes("x"), "a repeated strip would wrongly reduce asset:asset:x to x");
  },
);

// ---------------------------------------------------------------------------
// 3. the-recorded-order-is-authored-and-the-rendered-order-is-grouped-so-the-sequences-differ
// ---------------------------------------------------------------------------

test(
  "the-recorded-order-is-authored-and-the-rendered-order-is-grouped-so-the-sequences-differ: a real spawned `library artifact merge-ceremony` read's recorded order is authored order while the CLI's own render regroups by target type, so the two sequences genuinely differ though membership still agrees",
  () => {
    const dir = freshDir("contract3");
    const sessionId = "session-contract3";
    const env = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dir, STORYTREE_SESSION_ID: sessionId };

    const result = runCli(["library", "artifact", "merge-ceremony"], env);
    assert.equal(result.status, 0, `expected the spawned read to exit 0, got ${result.status}: ${result.stderr}`);

    const { replay, skipped } = readTraversalSession({ dir, sessionId });
    assert.equal(skipped, 0);

    const agreement = compareOfferSetToRender(result.stdout, replay.events);
    const verified = expectVerified(agreement, "contract3");

    assert.equal(verified.membershipAgrees, true, "the two sequences must still carry the same ids");
    assert.equal(
      verified.orderAgrees,
      false,
      "authored order and grouped render order must genuinely differ for this fixture",
    );
    assert.notDeepEqual(
      [...verified.recorded],
      [...verified.rendered],
      "the two sequences must not merely be asserted to differ by a flag — they must actually differ",
    );

    // The MECHANISM, not merely the boolean: `merge-ceremony`'s authored references open on a `doc:`
    // ADR ref, while the render's group order (Definitions/Guardrails ahead of Decisions (ADRs))
    // puts a non-doc: item first — so the first id printed is never the first id authored.
    const firstRecorded = verified.recorded[0];
    const firstRendered = verified.rendered[0];
    assert.ok(firstRecorded !== undefined && firstRecorded.startsWith("doc:"), `expected the recorded order to open on a doc: ref; got ${String(firstRecorded)}`);
    assert.ok(
      firstRendered !== undefined && !firstRendered.startsWith("doc:"),
      `expected the rendered order to open on a non-doc: group ahead of "Decisions (ADRs)"; got ${String(firstRendered)}`,
    );

    const summary = renderOfferSetAgreement(agreement);
    assert.match(
      summary,
      /^offer-set agreement: membership agrees, order differs \(rendered \d+, recorded \d+\)$/,
      "the summary must use 'differs', never 'DISAGREES', for an order mismatch — order carries no verdict",
    );
  },
);

// ---------------------------------------------------------------------------
// 4. a-read-that-recorded-no-offer-is-reported-as-unverified-and-never-as-agreement
// ---------------------------------------------------------------------------

test(
  "a-read-that-recorded-no-offer-is-reported-as-unverified-and-never-as-agreement: a real spawned read that recorded no library-artifact visit, and a real spawned library-artifact read whose render and trace both genuinely offer nothing, are both reported unverified — never as agreement",
  () => {
    // Case (a): a real spawned read that is not a library-artifact read at all — so `events` carries
    // no library-artifact-surface visit for the comparison to join against.
    const dirA = freshDir("contract4a");
    const sessionA = "session-contract4a";
    const envA = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dirA, STORYTREE_SESSION_ID: sessionA };
    const resultA = runCli(["tree", "context-traversal-telemetry"], envA);
    assert.equal(resultA.status, 0, `expected the spawned read to exit 0: ${resultA.stderr}`);

    const { replay: replayA, skipped: skippedA } = readTraversalSession({ dir: dirA, sessionId: sessionA });
    assert.equal(skippedA, 0);
    assert.ok(replayA.events.length > 0, "sanity: the read must have recorded SOME visit");
    const libraryArtifactVisitA = replayA.events.find(
      (event): event is ContextVisitEvent => isContextVisitEvent(event) && event.surfaceId === "library-artifact",
    );
    assert.equal(libraryArtifactVisitA, undefined, "sanity: this read must record no library-artifact visit");

    const agreementA = compareOfferSetToRender(resultA.stdout, replayA.events);
    const unverifiedA = expectUnverified(agreementA, "contract4a");
    assert.equal(unverifiedA.reason, "the-read-recorded-no-library-artifact-visit");
    assert.equal(
      renderOfferSetAgreement(agreementA),
      "offer-set agreement: unverified — the-read-recorded-no-library-artifact-visit",
    );

    // Case (b): a real spawned `library artifact <id>` read of an artifact carrying NO references at
    // all — both the render and the trace genuinely offer nothing, so a vacuous match must not read
    // as agreement either.
    const dirB = freshDir("contract4b");
    const sessionB = "session-contract4b";
    const envB = { ...baseEnv(), STORYTREE_TRAVERSAL_DIR: dirB, STORYTREE_SESSION_ID: sessionB };
    const resultB = runCli(["library", "artifact", "verdict"], envB);
    assert.equal(resultB.status, 0, `expected the spawned read to exit 0: ${resultB.stderr}`);
    assert.ok(!resultB.stdout.includes("Sources:"), "sanity: this fixture must print no Sources block");

    const { replay: replayB, skipped: skippedB } = readTraversalSession({ dir: dirB, sessionId: sessionB });
    assert.equal(skippedB, 0);
    assert.equal(candidateSetsOf(replayB.events).length, 0, "sanity: this read must have recorded no offer");
    const libraryArtifactVisitB = replayB.events.find(
      (event): event is ContextVisitEvent => isContextVisitEvent(event) && event.surfaceId === "library-artifact",
    );
    assert.ok(libraryArtifactVisitB !== undefined, "sanity: this read must still be a library-artifact visit");

    const agreementB = compareOfferSetToRender(resultB.stdout, replayB.events);
    const unverifiedB = expectUnverified(agreementB, "contract4b");
    assert.equal(unverifiedB.reason, "the-render-and-the-trace-both-offered-nothing");
  },
);

// ---------------------------------------------------------------------------
// 5. a-label-carrying-its-own-parentheses-still-yields-the-trailing-ref
// ---------------------------------------------------------------------------

test(
  "a-label-carrying-its-own-parentheses-still-yields-the-trailing-ref: an item whose label itself carries parentheses (an unresolvable asset pointer) still yields the ref from the LAST parenthesised group on the line, never the first",
  () => {
    const stdout = [
      "# some title    [definition]",
      "id: some-id",
      "",
      "body text",
      "",
      "Sources:",
      "  Other:",
      "    - asset:ghost (unknown asset)  (asset:ghost)",
      "",
      "provenance: test",
    ].join("\n");

    const ids = parseRenderedSourcesOffers(stdout);
    assert.deepEqual(
      [...ids],
      ["ghost"],
      "the ref must come from the trailing (asset:ghost), with asset: stripped by the id rule",
    );
    assert.ok(
      !ids.includes("unknown asset"),
      "a first-match parse would wrongly return the label's own embedded parenthetical",
    );
  },
);

// ---------------------------------------------------------------------------
// 6. a-membership-disagreement-names-the-ids-on-each-side-rather-than-a-bare-boolean
// ---------------------------------------------------------------------------

test(
  "a-membership-disagreement-names-the-ids-on-each-side-rather-than-a-bare-boolean: when the rendered ids and the recorded ids genuinely disagree, the disagreement names which ids are missing from the recorded set and which are extra in it, not merely that they differ",
  () => {
    const visitId = "visit-mismatch";
    const candidateSetId = `candidate-set:${visitId}`;

    const visit = visitEvent(visitId, "some-id", "library-artifact");
    const candidateSet = candidateSetEvent(
      candidateSetId,
      ["shared-a", "shared-b", "extra-only-recorded"],
      "library-artifact",
    );

    const stdout = [
      "# some title    [definition]",
      "id: some-id",
      "",
      "body text",
      "",
      "Sources:",
      "  Other:",
      "    - shared-a  (shared-a)",
      "    - shared-b  (shared-b)",
      "    - missing-only-rendered  (missing-only-rendered)",
      "",
      "provenance: test",
    ].join("\n");

    const events: ContextTraversalEvent[] = [visit, candidateSet];
    const agreement = compareOfferSetToRender(stdout, events);
    const verified = expectVerified(agreement, "membership mismatch");

    assert.equal(verified.membershipAgrees, false);
    assert.deepEqual(
      [...verified.disagreement.missingFromRecorded],
      ["missing-only-rendered"],
      "an id the render printed but the recorded set never carried must be named",
    );
    assert.deepEqual(
      [...verified.disagreement.extraInRecorded],
      ["extra-only-recorded"],
      "an id the recorded set carried but the render never printed must be named",
    );

    const summary = renderOfferSetAgreement(agreement);
    assert.equal(summary, "offer-set agreement: membership DISAGREES, order differs (rendered 3, recorded 3)");

    // DUPLICATES ARE SIGNIFICANT — the comparison is a MULTISET one, not a Set one. This is where a
    // Set-based implementation would silently lie, and it is not a hypothetical shape: the same node
    // offered more than once in one set is the `ambiguous` case this arc's end state names by name.
    const dupVisitId = "visit-duplicate";
    const dupEvents: ContextTraversalEvent[] = [
      visitEvent(dupVisitId, "some-id", "library-artifact"),
      candidateSetEvent(`candidate-set:${dupVisitId}`, ["repeated"], "library-artifact"),
    ];
    const dupStdout = [
      "Sources:",
      "  Other:",
      "    - repeated  (repeated)",
      "    - repeated  (repeated)",
      "",
    ].join("\n");
    const dupVerified = expectVerified(
      compareOfferSetToRender(dupStdout, dupEvents),
      "duplicate significance",
    );
    assert.equal(
      dupVerified.membershipAgrees,
      false,
      "a render offering the same id twice against a set recording it once must DISAGREE — a Set comparison would call this equal",
    );
    assert.deepEqual([...dupVerified.disagreement.missingFromRecorded], ["repeated"]);
    assert.deepEqual([...dupVerified.disagreement.extraInRecorded], []);
  },
);
