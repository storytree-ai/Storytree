// The desktop's `GET /api/attestations` mount — a story's UAT legs joined with their attestation
// marks and their signed `proven` state, re-composed from @storytree/orchestrator.
//
// THE BOUNDARY CALL, unchanged by this extraction: this does NOT import apps/studio/server (ADR-0100
// / ADR-0176). It re-composes the same algorithm over the SAME shared organism primitives the studio
// handler is built from — `loadNodeSpec`, `deriveAttestations`, `resolvedWitnessOf` /
// `unresolvedUatLegs`, `rollupCriterionStatus` / `rollupStoryUat` — exactly as `tree-verdicts.ts`
// and `boot-read-routes.ts` do. The duplication is the decision; the drift it invites is the defect.
//
// ## WHY IT LIVES HERE RATHER THAN INSIDE backend-entry.ts
//
// It was an inline closure in `electron/backend-entry.ts`'s `main()`, reachable only by booting the
// whole Electron backend — a live pg pool, a real attestation store, the launch sequence. Nothing
// could call it, so `check:mirror-conformance` could not compare it against the studio payload it is
// a hand-written copy of, and `check:verification-decay`'s `mirror-pair-drift` had been naming the
// pair as unobserved ever since its sweep widened to `apps/desktop/electron` (ADR-0269's re-baseline,
// 10 → 11). The closure's own comment said "same logic as uatContextForStory in apiRouter.ts" — the
// duplication a mirror row exists to fence, stated in the code and watched by nothing.
//
// The extraction moved NO logic: the body below is the closure verbatim, with its three ambient
// captures (`storiesDir`, the attestation store, the advisory verdict reader) turned into an
// injected {@link AttestationsRouteDeps}. `tree-verdicts.ts` took the same shape for the same reason.
//
// PURE + pg-FREE: no `electron`, no `pg`, no `@storytree/library/store`. Both event streams arrive
// through the injected seam (the live pg reads stay in `electron/backend-entry.ts`, where the store
// import is sanctioned), and the compute they are folded with is browser-safe raw TS, loaded lazily
// — the `.js` re-export trap this app already navigates.

import { promises as fs } from "node:fs";
import path from "node:path";

import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The `GET /api/attestations` wire envelope. `storyUat` and `unresolvedWitnesses` are OMITTED (never
 * `undefined`) when the rollup could not answer / the story resolves every witness — absence is the
 * signal the renderer keys on. `tests` rows are assembled from three sources (the declared leg, its
 * attestation marks, and the optional signed `proven`), so they are carried, not re-typed, here.
 */
export interface UatTestsEnvelope {
  storyId: string;
  tests: readonly unknown[];
  storyUat?: "healthy" | "unhealthy" | null;
  unresolvedWitnesses?: string[];
}

/**
 * One row of the envelope: a resolved UAT leg, spread together with its vouch marks, plus the two
 * fields that ride ONLY when something answered for them.
 *
 * The leg and the marks are carried rather than re-typed (their shapes belong to
 * @storytree/library and @storytree/proof-protocol, and re-declaring them here would be a
 * hand-mirror nothing checks), so the index signature is what says "everything those two brought".
 * The two named members are the ones this route DECIDES, and they are optional because their
 * ABSENCE is the signal the renderer keys on — an explicit `undefined` would read as a pointer that
 * failed to resolve rather than one that was never declared.
 */
interface UatAttestationRow {
  proven?: "pass" | "fail";
  detailArtifactId?: string;
  [field: string]: unknown;
}

/** One signed-verdict event, in the minimal shape the orchestrator's rollup compute reads. */
export interface VerdictEventRow {
  kind: string;
  seq: number;
  doc: unknown;
}

/** Everything the mount reads that is not on disk — injected, so a probe can drive it DB-free. */
export interface AttestationsRouteDeps {
  /** Absolute path to the repo's `stories/` dir — the story spec is read from it synchronously. */
  storiesDir: string;
  /**
   * The RAW attestation event stream (`events.attestation`), folded here by `deriveAttestations`.
   * May reject: an unreadable store must not blank the panel, so the mount catches and serves the
   * legs with no marks — the ADR-0033 advisory posture applied to this seam.
   */
  readAttestationEvents: () => Promise<ReadonlyArray<{ seq: number; doc: unknown }>>;
  /**
   * The signed-verdict stream (`events.verdict`) behind the `proven` column and the story rollup.
   * `null` is a first-class answer (the json backend / a down DB) and means those two proof-derived
   * fields are ABSENT rather than negative — the tree overlay's contract, same seam, same rule.
   */
  readVerdictEvents: () => Promise<readonly VerdictEventRow[] | null>;
}

/**
 * Build the `/api/attestations` mount: `(req, res, pathname) => claimed?`.
 *
 * Returns `false` for a pathname this mount does not own, so the caller's route table keeps
 * dispatching — the shape `backend-entry.ts` already composes its other mounts with.
 */
export function createAttestationsMount(
  deps: AttestationsRouteDeps,
): (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean> {
  return async (req, res, pathname) => {
    if (pathname !== "/api/attestations") return false;
    const method = req.method ?? "GET";
    if (method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `method ${method} not allowed` }));
      return true;
    }
    // Stryker disable next-line StringLiteral: EQUIVALENT, and measurably — `new URL("", base)` and
    // `new URL("/", base)` both resolve to `base + "/"`, so no replacement of this fallback can
    // change the parsed URL. It also never fires in production (Node's parser always sets `url`).
    const urlObj = new URL(req.url ?? "/", "http://localhost");
    const storyId = (urlObj.searchParams.get("storyId") ?? "").trim();
    if (!storyId) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "storyId query param is required" }));
      return true;
    }
    // Lazily imported — the raw-TS `.js` re-export discipline (same as tree-verdicts.ts).
    // All compute in @storytree/orchestrator; no apps/studio/server.
    const {
      loadNodeSpec,
      deriveAttestations,
      resolvedWitnessOf,
      unresolvedUatLegs,
      rollupCriterionStatus,
      rollupStoryUat,
    } = await import("@storytree/orchestrator");
    const spec = loadStorySpec(deps.storiesDir, storyId, loadNodeSpec);
    const tests = spec?.uatTestCriteria ?? [];
    // Stryker disable next-line LogicalOperator,ArrayDeclaration: EQUIVALENT, and worth stating
    // because it reads as load-bearing and is not. The ONLY consumer is `resolvedWitnessOf`, which
    // returns `resolveWitness(...).witness` — and every branch of that function answers `"machine"`
    // for a `machine` leg and `"human"` for anything else, WHATEVER the gates are. Gates decide the
    // refusal REASON and the routing, neither of which this route puts on the wire. So no gate list,
    // including a nonsense one, can change any answer here. It is passed anyway because the studio
    // passes it, and the day `resolvedWitnessOf` becomes gate-sensitive the two surfaces must move
    // together — dropping it to satisfy a mutant would plant exactly the divergence this route's
    // mirror row exists to catch.
    const gates = spec?.reliabilityGates ?? [];
    // Stryker disable next-line StringLiteral: EQUIVALENT, and provably so — the three `??`
    // fallbacks above and here fire TOGETHER, on the one condition `spec === null`. So whenever this
    // `""` is reached, `tests` is `[]`, and `adopted` below feeds `unresolvedUatLegs([])`, which is
    // `[]` for any status. No answer this route can give distinguishes the empty string from any
    // other unreachable-status placeholder. The literal stays because the field is typed `string`
    // and the reader below compares it to three named statuses.
    const status = spec?.status ?? "";
    // Attestation marks and verdict events in parallel (both advisory).
    const [marksMap, events] = await Promise.all([
      // Derive the latest-per-(testId,witness) marks and filter to this story's tests.
      deps
        .readAttestationEvents()
        .then((evts) => {
          const derived = deriveAttestations(evts);
          const out: Record<string, Record<string, unknown>> = {};
          for (const [testId, entry] of derived) {
            out[testId] = entry as Record<string, unknown>;
          }
          return out satisfies Record<string, Record<string, unknown>>;
        })
        .catch((): Record<string, Record<string, unknown>> => ({})),
      deps.readVerdictEvents(),
    ]);
    // Resolve each leg's declared witness into the binary one the UI reads (mirrors
    // resolveUatRowWitnesses from apiRouter.ts, re-composed from shared orchestrator functions
    // so the binary can never fork between studio and desktop).
    const resolved = tests.map((t) => ({ ...t, witness: resolvedWitnessOf(t, gates) }));
    // Stryker disable next-line ConditionalExpression,StringLiteral: the `status !== ""` clause alone
    // is EQUIVALENT, for the reason recorded at the `?? ""` above — `""` is reachable only when the
    // spec is null, and a null spec also empties `tests`, so this clause can never change the answer.
    // The other two clauses are NOT disabled and are asserted directly (a `mapped` story and a
    // `retired` one, each carrying a real leg).
    const adopted = status !== "" && status !== "mapped" && status !== "retired";
    const unresolvedWitnesses = adopted ? unresolvedUatLegs(tests).map((t) => t.criterionId) : [];
    // Proven state from signed verdicts (advisory — absent on a down DB).
    let provenOf:
      | ((criterion: { criterionId: string; revisionId: string }) => "pass" | "fail" | undefined)
      | null = null;
    let storyUat: "healthy" | "unhealthy" | null | undefined;
    if (events !== null) {
      provenOf = (criterion) => {
        const s = rollupCriterionStatus(criterion, events);
        return s === "healthy" ? "pass" : s === "unhealthy" ? "fail" : undefined;
      };
      const rolled = rollupStoryUat(tests, events);
      // Stryker disable next-line ConditionalExpression: EQUIVALENT — `rollupStoryUat` is DECLARED
      // `Status | null` (the six-member work enum) but its body can only ever return `healthy`,
      // `unhealthy` or `null`, so the `: null` arm is reached only when `rolled` is already null and
      // the whole-condition `true` mutant produces the identical value. The narrowing stays because
      // the studio narrows the SAME way against the same declared type: dropping it here would put
      // the two surfaces on different readings the day that function's range widens, which is the
      // one thing this route's mirror row exists to prevent.
      storyUat = rolled === "healthy" || rolled === "unhealthy" ? rolled : null;
    }
    // ADR-0209 D7: the optional Library detail pointer each leg's `(detail: …)` tag names, so the
    // SHARED `UatTestCriteriaSection` can open the detail artifact from this surface too.
    //
    // ⚠ THIS SURFACE SERVED NONE OF THEM until the `/api/attestations` mirror row measured it
    // (2026-08-31): the studio attached the pointers and the desktop, which loads the studio's
    // COMPILED BUNDLE, rendered the same component with every leg pointer-less. Parsed through the
    // SAME `@storytree/uat-criterion` grammar the studio uses rather than a second reading of the
    // tag, and a malformed tag omits pointers rather than blanking the panel.
    const detailByCriterionId = await detailPointers(deps.storiesDir, storyId);
    const rows = resolved.map((t) => {
      const proven = provenOf?.(t);
      const marks = marksMap[t.criterionId] ?? {};
      const detailArtifactId = detailByCriterionId.get(t.criterionId);
      // `proven` and `detailArtifactId` are ADDED only when they answered, so an unproven or
      // pointer-less criterion carries no such key at all rather than an explicit `undefined`.
      // Present-vs-absent is exactly what the mirror comparison reads, and what the renderer keys on.
      const row: UatAttestationRow = { ...t, ...marks };
      // Stryker disable next-line ConditionalExpression: EQUIVALENT AT THE WIRE — the always-assign
      // mutant sets `row.proven = undefined`, and `JSON.stringify` (the only thing that reads this
      // object) omits an `undefined` value exactly as it omits an absent key. No response can
      // separate them. The guard stays because the assignment is also a TYPE claim, and because the
      // sibling below is the same shape.
      if (proven !== undefined) row.proven = proven;
      // Stryker disable next-line ConditionalExpression: EQUIVALENT AT THE WIRE, same reason.
      if (detailArtifactId !== undefined) row.detailArtifactId = detailArtifactId;
      return row;
    });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const testsEnvelope: UatTestsEnvelope = { storyId, tests: rows };
    // Stryker disable next-line ConditionalExpression: EQUIVALENT AT THE WIRE — `JSON.stringify`
    // omits an `undefined` value exactly as it omits an absent key, so the always-assign mutant
    // serialises identically. The DISTINCTION the guard protects is real and IS asserted (a stream
    // that answered sets `storyUat: null`; no stream at all omits the key), it just cannot be
    // reached through this branch.
    if (storyUat !== undefined) testsEnvelope.storyUat = storyUat;
    if (unresolvedWitnesses.length > 0) testsEnvelope.unresolvedWitnesses = unresolvedWitnesses;
    res.end(JSON.stringify(testsEnvelope));
    return true;
  };
}

// The orchestrator's OWN type for the loader this file drives, reached type-only so nothing of its
// runtime graph is pulled in at load time. Derived rather than hand-mirrored, for the reason
// `tree-verdicts.ts` records: a hand-written mirror of `loadNodeSpec`'s return shape is not checked
// against the module it describes, and the last one here was silently missing seven fields.
type OrchestratorModule = typeof import("@storytree/orchestrator");
type LoadNodeSpec = OrchestratorModule["loadNodeSpec"];
type NodeSpec = ReturnType<LoadNodeSpec>;

/**
 * The story's own spec, or `null` — a missing story, an unreadable one, and an id that tries to
 * escape the stories root are ALL the same answer, deliberately.
 *
 * ⚠ THIS WAS `findNodeSpecFile(storiesDir, storyId)`, and BOTH of that helper's behaviours were
 * divergences the `/api/attestations` mirror row measured (2026-08-31):
 *   · it applies NO containment guard, so a `?storyId=../…` reached a `path.join` and turned a
 *     member-readable route into a filesystem existence oracle carrying limited structured
 *     disclosure. The studio refuses such an id through `containedPath` and answers exactly as if
 *     the story were missing — an escaping id that reads DIFFERENTLY from an absent one is what
 *     makes an oracle;
 *   · it falls back to `<story>/<unitId>.md`, so `?storyId=<a capability id>` served that
 *     CAPABILITY's criteria here while the studio answered with none. This route's whole vocabulary
 *     is stories.
 * The containment check re-composes the studio's `containedPath` rather than importing it (ADR-0100),
 * and the mirror follows the reference on both counts.
 */
export function loadStorySpec(
  storiesDir: string,
  storyId: string,
  loadNodeSpec: LoadNodeSpec,
): NodeSpec | null {
  const file = containedStoryFile(storiesDir, storyId);
  // Stryker disable next-line ConditionalExpression: EQUIVALENT BY DESIGN, and the design is the
  // point. A REFUSED id must be indistinguishable from an absent story (see the docblock), so the
  // refusal and the throw below deliberately produce the same value — which is exactly why no
  // assertion can separate this guard from the catch. Removing it would call loadNodeSpec(null).
  if (file === null) return null;
  try {
    return loadNodeSpec(file);
  } catch {
    return null;
  }
}

/**
 * `<storiesDir>/<storyId>/story.md`, or `null` if that escapes the root or does not exist.
 *
 * EXPORTED, but no longer CALLED outside this module — and the difference is the point. It was
 * exported for `POST /api/uat/attest`, which resolved its `storyId` through the same unguarded
 * `findNodeSpecFile` and would have signed a verdict against a spec from OUTSIDE the stories root.
 * That route now calls {@link loadStorySpec} instead, because taking the containment guard alone
 * turned out to be HALF the guard: it does not existence-check (see the note below), so a
 * well-formed but missing `storyId` threw out of that mount while the studio answered 400. Measured
 * 2026-09-01, when the `uat-attest` mirror row and the extraction that enabled it made the mount
 * reachable for the first time.
 *
 * The export stays because the pairing is what is dangerous, not the function: a future caller that
 * genuinely wants containment WITHOUT a load has an honest reason to reach for it, and the note
 * below now says outright what it does not do. Both of today's callers are in this module, and both
 * catch.
 *
 * That route has a mirror row of its own now, so both request paths are watched rather than one:
 * `oq-mirror-harness-write-pairs` — whether write pairs should be compared at all — was answered YES
 * (ADR-0495), and its arms replay a `../escaped` id against a story with a REAL leg outside the root
 * as well as an ordinary missing one.
 */
export function containedStoryFile(storiesDir: string, storyId: string): string | null {
  const root = path.resolve(storiesDir);
  const target = path.resolve(root, storyId);
  // ONE condition, and it deliberately refuses `storyId` values that resolve to the root ITSELF
  // (`.`, `./`) as well as ones that climb above it — there is no story called `.`, and a second
  // `target !== root` conjunct would only make an unreachable exception whose absence no answer can
  // distinguish (it read as rigour and was scored as a survivor, correctly).
  if (!target.startsWith(root + path.sep)) return null;
  // NOT existence-checked here. Both callers already treat an unreadable story as a missing one —
  // `loadStorySpec` catches, `detailPointers` catches — so a `existsSync` guard would be a second
  // early-out down the same path, indistinguishable from the catch and therefore unprovable.
  return path.join(target, "story.md");
}

/**
 * The `(detail: …)` Library pointers a story's legs declare, keyed by criterion id (ADR-0209 D7).
 *
 * Empty for a story that declares none, and empty rather than throwing when the grammar refuses the
 * body: a malformed detail tag must not blank the attestations panel, which is the studio's rule for
 * the same read and the reason both sides swallow here.
 */
async function detailPointers(storiesDir: string, storyId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const file = containedStoryFile(storiesDir, storyId);
  // Stryker disable next-line ConditionalExpression: EQUIVALENT for the reason above — a refused id
  // and an unreadable file both have to yield an empty map, so the guard and the catch agree by
  // construction. Kept because the alternative is handing `fs.readFile` a null path.
  if (file === null) return out;
  try {
    const { parseCriterionPointers } = await import("@storytree/uat-criterion");
    const body = await fs.readFile(file, "utf8");
    for (const binding of parseCriterionPointers(storyId, body)) {
      out.set(binding.criterion.criterionId, binding.detailArtifactId);
    }
  } catch {
    // Malformed detail tags must not blank the attestations panel — omit pointers.
  }
  return out;
}
