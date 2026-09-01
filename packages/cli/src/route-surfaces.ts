/**
 * WHERE the `/api/*` route facts live — the one declaration of which trees are scanned, shared by
 * `check:desktop-route-coverage` and by `check:verification-decay`'s `mirror-pair-drift`.
 *
 * It is its own module for one reason: two readers of the same fact are how the fact drifts. Before
 * this file, `mirror-pair-drift` held these definitions privately in `check-verification-decay.ts`,
 * and a second check needing them would either have imported that gate script (dragging its ceilings
 * and its sweep along) or re-spelled them (two lists of one fact, which is the class both checks
 * exist to fence). The scanners themselves live beside the judge in
 * {@link file://./route-tables.ts}.
 */

/** One surface's served route table: a name and the directories whose sources dispatch. */
export interface RouteSurface {
  readonly surface: string;
  readonly dirs: readonly string[];
}

/**
 * The two surfaces ADR-0176 requires to agree while forbidding them to share code: the studio's
 * `/api/*` router is the REFERENCE, and the desktop backend holds the hand-written copy.
 *
 * Whole DIRECTORIES rather than a hand-listed set of route files, deliberately — a list of files to
 * scan is a second thing somebody must keep in step, and a new route file nobody added to it would
 * be invisible to a sweep that still reported full coverage.
 */
// Stryker disable StringLiteral,ArrayDeclaration,ObjectLiteral: the SURFACE NAMES are report labels,
// asserted non-empty rather than spelled (route-tables.test.ts). The DIRECTORIES are asserted to
// exist and to yield a non-empty dispatch table there, which is the property that matters — a
// mutant that blanks one is caught by that test, and a mutant that only changes how a surface is
// LABELLED in a failure message is the human-facing-prose class, not a defect a suite can name.
export const REFERENCE_SURFACE: RouteSurface = { surface: "studio", dirs: ["apps/studio/server"] };

/**
 * THE DESKTOP IS TWO DIRECTORIES, and reading only the first was `mirror-pair-drift`'s own blind spot
 * — a guard measuring a smaller world than the one it guards. The desktop serves `/api/*` from BOTH
 * `src/backend` (the headless, node:test-provable factories) and `electron/` (the wiring that needs
 * the live pool). The split is a WIRING boundary, not a re-composition boundary, so scanning one dir
 * dropped real routes while the instrument still reported a complete sweep.
 *
 * ⚠ BOTH DIRS STILL HAVE TO BE SCANNED, and the two routes that first proved it no longer show it.
 * `backend-entry.ts` mounted `/api/attestations` and `/api/uat/attest` inline when this widening was
 * measured; both have since been EXTRACTED to `src/backend` so a conformance probe could reach them
 * (`attestations-route.ts`, `uat-attest-route.ts`), which means the surface's own witnesses have
 * moved out from under it. Narrowing back to one dir on the strength of that would re-open the blind
 * spot the moment the next mount is wired in `electron/` — where wiring that needs the live pool
 * still belongs.
 */
export const MIRROR_SURFACE: RouteSurface = {
  surface: "desktop",
  dirs: ["apps/desktop/src/backend", "apps/desktop/electron"],
};
// Stryker restore StringLiteral,ArrayDeclaration,ObjectLiteral

/**
 * The shared frontend's ONE API client — the file every `/api/*` call in the studio SPA goes through,
 * and therefore the whole of what "the frontend calls" is derived from.
 *
 * MEASURED, NOT DECREED (2026-08-28): every path in it is a plain string literal or a template whose
 * literal prefix is the path; there is no base-URL variable, no concatenation and no path held in a
 * variable. Outside it, `apps/studio/src` holds 57 `/api/*` mentions and every one is prose in a
 * comment. `packages/app-surface` makes no fetches at all and two of its own tests refuse `fetch` /
 * `EventSource` / `WebSocket` in its source.
 *
 * Neither property is a law, so both are FENCED rather than assumed: `parseCalledRoutes` refuses a
 * call site whose path it cannot resolve to a literal, and `findForeignApiLiterals` refuses an
 * `/api/*` literal appearing anywhere in {@link FRONTEND_TREES} outside this file.
 */
export const API_CLIENT = "apps/studio/src/api.ts";

/**
 * The frontend trees swept for a SECOND API client. `apps/desktop` has no renderer of its own — it
 * serves the compiled studio SPA — which is exactly why a studio-side fetch is a desktop-side 404.
 */
export const FRONTEND_TREES: readonly string[] = ["apps/studio/src", "packages/app-surface/src"];
