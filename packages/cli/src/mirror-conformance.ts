/**
 * The PURE judge behind `pnpm check:mirror-conformance` — the cross-surface conformance harness
 * (verification-integrity-arc increment 2).
 *
 * THE CLASS IT FENCES. storytree has surfaces that are REQUIRED to agree but are deliberately
 * forbidden to share code: the desktop backend re-composes a SUBSET of the studio's `/api/*` route
 * table verbatim over its own `node:fs`, and may never import `apps/studio/server` (ADR-0176's
 * one-wired-backend rule, enforced by `check:boundaries`). Duplication is the DECISION, not an
 * accident — so the drift it invites has to be caught by a test that compares the two payloads,
 * not by a convention that whoever edits one will remember the other.
 *
 * It went uncaught once, measurably: commit `71f68d2b` folded `parseAdrWireSignals` into the
 * studio's `listDocs` and left the desktop's copy alone. Over the real `docs/` tree that silently
 * dropped `loadBearing` from 88 ADRs and `references` from 168, and nothing anywhere went red —
 * the two implementations agreed with nothing, so their disagreement had no observer.
 *
 * WHY A JUDGE AND NOT AN IMPORT. The comparison never imports one surface from the other: the
 * gather ({@link file://./check-mirror-conformance.ts}) runs each surface's own probe in its own
 * process over ONE fixture and hands the two decoded payloads here. This module sees plain data
 * and owns every rule, so the rules are unit-testable without spawning anything.
 *
 * THE RULES (see {@link compareMirrors}):
 *   1. Same entries, same order — the payload is an ordered array and both sides sort it.
 *   2. Every field JSON-equal, except the ones on the spec's `referenceOnlyFields` allowlist.
 *   3. The allowlist is SELF-PRUNING: an entry the mirror actually emits, or one the reference
 *      never emits, is itself a divergence. An allowlist nobody prunes decays into a blanket
 *      exemption — the "an advisory list stays readable or stops being advisory" rule. The
 *      allowlist is where a DELIBERATE difference is declared, and declaring one costs a line
 *      someone has to keep true.
 */

/** One mirrored payload's conformance rules. */
export interface MirrorSpec {
  /** Human name of the mirrored payload, e.g. `GET /api/docs`. Used in the failure report. */
  surface: string;
  /**
   * The `/api/*` route path this payload is served at, spelled EXACTLY as both surfaces dispatch it.
   *
   * Machine-readable on purpose. `check:verification-decay`'s `mirror-pair-drift` instrument reads
   * this to know which pairs are already proven exactly here, so "what the registry covers" is
   * DERIVED from the registry rather than held as a second list somebody keeps in step. Two lists of
   * the same fact drifting apart is precisely the class this file exists to fence, and a discovery
   * heuristic that scraped the route out of {@link MirrorSpec.surface}'s prose would be that class
   * arriving inside the instrument built to detect it.
   */
  route: string;
  /** The surface whose payload is the reference (the one being mirrored), e.g. `studio`. */
  reference: string;
  /** The surface holding the hand-written copy, e.g. `desktop`. */
  mirror: string;
  /** The field that identifies an entry on both sides, e.g. `id`. */
  key: string;
  /**
   * Fields the REFERENCE may carry that the mirror deliberately does not — the explicit,
   * self-pruning record of every sanctioned difference. Empty means the payloads must be
   * byte-identical.
   */
  referenceOnlyFields: readonly string[];
}

/** One surface's probe: the app dir it runs from, and the probe module it executes. */
export interface Probe {
  /** Repo-relative app dir — the spawn cwd, so bare specifiers resolve through THAT app. */
  appDir: string;
  /** Repo-relative probe module. */
  file: string;
}

/**
 * Which shared input set a mirror's two probes run over — and, with it, the SHAPE they print.
 * The two travel together because they are one protocol: {@link file://./check-mirror-conformance.ts}
 * builds the inputs, passes them as argv, and decodes what comes back.
 *
 * - `docs-trees` — argv is docs DIRECTORIES; each probe prints `DocMeta[]` per directory, already
 *   the comparable entry array.
 * - `activity-fixtures` — argv is fixture JSON PATHS (raw `events.node_claim` rows + a fixed `now`);
 *   each probe prints the route's response body VERBATIM, which
 *   {@link projectActivityPayload} turns into entries. The projection lives here, on the third
 *   party, so the two probes cannot drift in how they reshape what they measured.
 * - `arc-fixtures` — argv is fixture DIRECTORIES (a doc set, a `docs/decisions` tree and a
 *   `stories/` tree — the three inputs the arc rollup joins over — plus the REQUEST LIST both
 *   probes replay). Each probe prints `{ [label]: { status, body } }` for those requests, which
 *   {@link projectArcsPayload} turns into entries. The request list rides the FIXTURE rather than
 *   living in each probe: two hand-kept lists of what to ask is the same drift class one level up.
 * - `floor-health-fixtures` — argv is fixture JSON PATHS (`{ docs, events, requests }` — the two
 *   reads the floor-health composition makes, plus the request list both probes replay). Each probe
 *   prints `{ [label]: { status, body } }`, which {@link projectFloorHealthPayload} turns into
 *   entries. The docs and events are served VERBATIM by each probe's own fixture store, because the
 *   `Store` seam's `appendEvent` accepts no `at`: a store that recorded them would stamp the wall
 *   clock, which both defeats the fixture (every reinforcement reads as pre-route) and makes the two
 *   probes — separate processes, different moments — nondeterministic against each other.
 */
export type MirrorInputSet =
  | "docs-trees"
  | "activity-fixtures"
  | "arc-fixtures"
  | "floor-health-fixtures";

/** One registered mirrored payload: the rules, the input protocol, plus the two probes. */
export interface MirrorTarget {
  spec: MirrorSpec;
  /** The shared input set both probes run over, and the payload shape they print. */
  inputs: MirrorInputSet;
  reference: Probe;
  mirror: Probe;
}

/**
 * The registry of mirrored payloads. ADD A ROW when a studio route is re-composed into another
 * surface — that is the moment the drift class opens, and a row is the whole cost of closing it.
 *
 * `referenceOnlyFields` is where a DELIBERATE difference is declared. It is self-pruning (the
 * judge fails a stale entry), so the list can only ever describe differences that are still real.
 *
 * IT LIVES HERE, IN THE PURE MODULE, RATHER THAN IN THE CHECK SCRIPT, so a second reader can ask
 * what is registered without running the conformance harness — {@link file://./check-mirror-conformance.ts}
 * executes on import, so importing it to read this list would run the whole gate. Its one such
 * reader today is `mirror-pair-drift` in `check:verification-decay`, which locates pairs MISSING
 * from this list. That instrument is the deliberate COMPLEMENT of this gate, never a re-derivation
 * of it: this registry proves the pairs it knows about EXACTLY and BLOCKS, because an equality
 * assertion between two implementations over one input has no false-positive surface; finding
 * pairs nobody registered is a heuristic that does, and so stays advisory (ADR-0251's
 * reconciliation with ADR-0252).
 */
export const MIRRORS: readonly MirrorTarget[] = [
  {
    spec: {
      surface: "GET /api/docs (DocMeta[])",
      route: "/api/docs",
      reference: "studio",
      mirror: "desktop",
      key: "id",
      // EMPTY BY DESIGN: the desktop serves the same compiled studio SPA, so every DocMeta field
      // the studio emits has a reader on the desktop too. There is no sanctioned difference here.
      referenceOnlyFields: [],
    },
    inputs: "docs-trees",
    reference: { appDir: "apps/studio", file: "apps/studio/server/docsMirrorProbe.ts" },
    mirror: { appDir: "apps/desktop", file: "apps/desktop/src/backend/docs-mirror-probe.ts" },
  },
  {
    // THE SECOND ROW, and the one the registry's own advisory sibling had been naming for weeks:
    // `mirror-pair-drift` in `check:verification-decay` listed `/api/activity` as an unregistered
    // pair while the pair drifted TWICE in the real corpus — the desktop's re-composed SELECT
    // shipped without ADR-0200's `grade` column (fixed in #993, and the reason
    // apps/desktop/src/backend/claim-activity.ts exists), then its route shipped without the
    // `departures` key the studio serves (fixed in 6dbc1b80). Both were found by a human reading
    // the map, which is precisely the observer this row replaces.
    //
    // WHAT IT PROVES, and what it does not — stated precisely, because a fence whose reach is
    // assumed is worse than one whose reach is written down.
    //
    // The `claims` layer is folded on each side from RAW `events.node_claim` rows by that surface's
    // OWN re-composed fold (`claimsToActivity` / `claimRowsToActivity`), over one shared fixture and
    // a fixed `now`. So what is asserted is that THE TWO FOLDS AGREE — a fold that stops carrying a
    // field, normalises a grade differently, or drops a stale row on a different threshold goes red.
    // That is the cross-surface half of the grade defect, and it is the half no observer had.
    //
    // It is NOT the whole of that defect, and the difference matters: `grade` originally went missing
    // in the desktop's SELECT, upstream of the fold. A fixture supplies rows directly, so this row
    // cannot see a column leaving a query. That half is fenced INSIDE each surface instead — the
    // desktop derives `IN_FLIGHT_CLAIMS_SQL` from `CLAIM_ROW_COLUMNS`, so its SELECT and its reader
    // cannot drift apart again (claim-activity.ts's own header records why). The two fences are
    // complementary, and neither covers the other.
    //
    // `builds` and `departures` ride the fixture ALREADY FOLDED, so for those two this proves the
    // route emits the KEY and passes the value through unchanged — the departures-shaped defect —
    // but NOT that the two folds agree. `departures` needs no such proof (both surfaces call the SAME
    // `foldDepartures` from @storytree/notice-board — shared code, no drift class). `builds` DOES,
    // and cannot get it here: the desktop's fold is inline inside a `pg` query closure in
    // apps/desktop/electron/backend-entry.ts and cannot be reached without a database, while this
    // gate runs in CI. Extracting it to a pure module — the shape `claim-activity.ts` already
    // took — is what would close that half.
    spec: {
      surface: "GET /api/activity ({builds, claims, departures})",
      route: "/api/activity",
      reference: "studio",
      mirror: "desktop",
      // The projection's synthetic key (`layer:<name>` / `<layer>#<index>`), not a payload field —
      // see `projectActivityPayload`.
      key: "_key",
      // EMPTY BY DESIGN: both surfaces serve this wire to the SAME compiled world renderer, which
      // reads every layer from either. A difference here is a defect, never a deliberate narrowing.
      referenceOnlyFields: [],
    },
    inputs: "activity-fixtures",
    reference: { appDir: "apps/studio", file: "apps/studio/server/activityMirrorProbe.ts" },
    mirror: { appDir: "apps/desktop", file: "apps/desktop/src/backend/activity-mirror-probe.ts" },
  },
  {
    // THE THIRD ROW, registered in the SAME branch that created the pair — the moment the desktop
    // began serving `/api/arcs` (ADR-0267 / ADR-0314's arc surface), not weeks later after a drift.
    //
    // WHAT IS AND IS NOT AT RISK HERE, stated precisely because this pair's drift class is a
    // different SHAPE from the other two. The arc → children JOIN is genuinely shared code:
    // `loadArcRollup`/`loadArcRollups` live in @storytree/arc and BOTH surfaces call them, so the
    // rollup's CONTENT carries no re-composition risk (that is `deriveArcRollup`'s own suites' job).
    // What is hand-copied is the ENVELOPE — the method guard, the two "no document store" answers,
    // the unknown-id answer, the id decode, and the `{ arcs }` key itself — and every one of those
    // is a DECISION the desktop copy could silently lose. It matters more here than the shape of the
    // payload: `apps/studio/src/lib/arcRollups.ts` keeps FOUR states apart (loading / unreachable /
    // no-store / rollups) and renders each differently, so a desktop copy that answered `{ arcs: [] }`
    // for a missing store, or 404'd where the studio 503s, would drive the SAME compiled bundle into
    // a confidently wrong state rather than an honest one.
    //
    // Both probes therefore print the REAL served `{ status, body }` — they drive each surface's own
    // dispatcher and its own central error mapping, not the arcs handler in isolation, so the status
    // codes and error bodies are inside the assertion rather than re-implemented beside it.
    spec: {
      surface: "GET /api/arcs ({arcs} list · one ArcRollup)",
      route: "/api/arcs",
      reference: "studio",
      mirror: "desktop",
      // The projection's synthetic key (`response:<label>` / `<label>#<arcId>`), not a payload field
      // — see `projectArcsPayload`; the payload's own `id` is compared like any other field. Spelled
      // literally, like the row above: `ARCS_KEY` is declared below this table.
      key: "_key",
      // EMPTY BY DESIGN: both surfaces serve this wire to the SAME compiled arc lens, which reads
      // every field from either. A difference here is a defect, never a deliberate narrowing.
      referenceOnlyFields: [],
    },
    inputs: "arc-fixtures",
    reference: { appDir: "apps/studio", file: "apps/studio/server/arcsMirrorProbe.ts" },
    mirror: { appDir: "apps/desktop", file: "apps/desktop/src/backend/arcs-mirror-probe.ts" },
  },
  {
    // THE FOURTH ROW, registered in the SAME branch that created the pair — the discipline the row
    // above established, and the one this registry's advisory sibling exists to enforce when it
    // lapses. `mirror-pair-drift` in `check:verification-decay` pins its ceiling at the CURRENT count,
    // so a desktop route serving a path the studio already serves WITHOUT a row here reds gate step 9.
    // Raising that ceiling would have been the wrong remedy: ADR-0269 permits an upward move only for
    // a genuine enlargement of what the instrument SCANS, and a new pair is not one.
    //
    // THE GAP THIS CLOSES IS THE SECOND INSTANCE OF ONE CLASS, which is why the shape was copied from
    // `/api/arcs` rather than invented. The desktop loads the COMPILED STUDIO BUNDLE against its own
    // backend, so it ships every lens the studio gains; #1228 wired ADR-0314 D7's floor-health band to
    // ADR-0316's instrument, and with no route on this backend the fetch 404'd and the band rendered
    // `declined` — "the floor-health read didn't answer here". Honest rather than broken, by design,
    // but it is not the reading, and the desktop is a surface the owner actually uses. `/api/arcs` had
    // exactly this shape: found in #1192, closed in #1195.
    //
    // WHAT IS AND IS NOT AT RISK. The READING is shared code — `loadFloorHealthReading` in
    // @storytree/drive, called by both surfaces and by `storytree factory health` — so the figure
    // carries no re-composition risk; drive's own suites own that. What is hand-copied is the
    // ENVELOPE: the method guard AND ITS STATED REASON, the "no document store" answer, and the
    // `{ reading }` key. Each is a DECISION the desktop copy could silently lose, and the loss would
    // be invisible: `apps/studio/src/lib/floorHealth.ts` keeps `declined` apart from a QUIET floor,
    // so a mirror answering `{ reading: <a reading with no loudest> }` where its reference answers
    // `{ reading: null }` would drive the SAME compiled band into reporting "all clear" for a floor it
    // never measured — the precise failure ADR-0316's band exists to avoid.
    //
    // ONE THING IT DELIBERATELY DOES NOT ASSERT: the loud/quiet THRESHOLD. That is
    // `LOUD_AT_RECURRENCES` in apps/studio/src/components/FloorHealthLamp.tsx — frontend, one
    // compiled bundle, served by both surfaces, so it has no drift class and no place in a
    // server-payload comparison. ADR-0316 D4 keeps the wire to measuring; a server that decided
    // loudness would be the defect, not a field to compare.
    spec: {
      surface: "GET /api/floor-health ({reading} — the factory-floor reading)",
      route: "/api/floor-health",
      reference: "studio",
      mirror: "desktop",
      // The projection's synthetic key (`response:<label>` / `<label>:reading` / `<label>#reading`),
      // not a payload field — see `projectFloorHealthPayload`. Spelled literally like the rows above;
      // `FLOOR_HEALTH_KEY` is declared below this table.
      key: "_key",
      // EMPTY BY DESIGN: both surfaces serve this wire to the SAME compiled band, which reads every
      // field from either. A difference here is a defect, never a deliberate narrowing.
      referenceOnlyFields: [],
    },
    inputs: "floor-health-fixtures",
    reference: { appDir: "apps/studio", file: "apps/studio/server/floorHealthMirrorProbe.ts" },
    mirror: {
      appDir: "apps/desktop",
      file: "apps/desktop/src/backend/floor-health-mirror-probe.ts",
    },
  },
];

/**
 * The route paths {@link MIRRORS} proves exactly — the set `mirror-pair-drift` treats as already
 * covered. Derived from the registry so the two can never disagree.
 */
export function registeredMirrorRoutes(
  targets: readonly MirrorTarget[] = MIRRORS,
): ReadonlySet<string> {
  return new Set(targets.map((t) => t.spec.route));
}

/** One conformance failure. `where` names the fixture/corpus the comparison ran over. */
export type Divergence =
  /** An entry the reference emits that the mirror does not. */
  | { kind: "missing-entry"; where: string; key: string }
  /** An entry the mirror emits that the reference does not. */
  | { kind: "extra-entry"; where: string; key: string }
  /** Both sides emit the same entries, but not in the same order. */
  | { kind: "order"; where: string; position: number; reference: string; mirror: string }
  /** A shared entry whose field values disagree (JSON-compared). */
  | { kind: "field"; where: string; key: string; field: string; reference: string; mirror: string }
  /** An allowlisted field that is not, in fact, reference-only — the allowlist has rotted. */
  | { kind: "stale-allowlist"; where: string; field: string; reason: string };

/** A decoded payload entry — an arbitrary JSON record keyed by the spec's `key` field. */
export type Entry = Record<string, unknown>;

/** The projection's key field — synthetic, so it can never collide with a payload's own `key`. */
export const ACTIVITY_KEY = "_key";

/**
 * The `/api/arcs` projection's key field — the SAME synthetic name, deliberately: this is one
 * projection protocol used by two payloads, not two protocols that happen to agree. Aliased rather
 * than re-spelled so a future change to the name cannot move one and leave the other.
 */
export const ARCS_KEY = ACTIVITY_KEY;

/**
 * The `/api/floor-health` projection's key field — the SAME synthetic name again, and aliased for
 * the same reason {@link ARCS_KEY} is: this is ONE projection protocol used by three payloads, not
 * three protocols that happen to agree, so a future change to the name cannot move one and leave the
 * others behind.
 */
export const FLOOR_HEALTH_KEY = ACTIVITY_KEY;

/**
 * PURE: project a `GET /api/activity` response body — `{builds, claims, departures}`, each an array
 * or `null` — into comparable {@link Entry} rows.
 *
 * WHY THE THIRD PARTY PROJECTS, and not the probes. Each probe prints the body VERBATIM; this turns
 * it into entries. Putting the reshaping in the two probes would have handed each surface its own
 * copy of it, and a projection that drifted could mask the very divergence the harness is asserting
 * — the class the whole file exists to fence, arriving inside its own instrument.
 *
 * ONE ENTRY PER ROW, NOT ONE PER LAYER, so {@link compareMirrors} compares each activity's fields by
 * NAME. A layer compared as one blob would be JSON-string-compared, which makes object KEY ORDER —
 * not a semantic difference in JSON — a red gate, and would report a whole-layer mismatch where the
 * real defect is one field on one row. Per-row entries report `grade: studio="exploring"
 * desktop="(absent)"`, which names the ADR-0200 defect exactly.
 *
 * PLUS ONE `layer:<name>` MARKER PER KEY, which is what catches the `departures` class. Rows alone
 * cannot: a layer the mirror omits ENTIRELY and a layer it serves EMPTY both contribute zero rows,
 * so the two would agree. The marker carries the key's presence, its `shape` (`array` / `null` — the
 * advisory-absence distinction both surfaces promise) and its row count, so an omitted key is a
 * missing entry and a `null`-for-`[]` swap is a field divergence.
 */
export function projectActivityPayload(body: unknown): Entry[] {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`activity payload must be a JSON object, got ${render(body)}`);
  }
  const out: Entry[] = [];
  // Sorted so the entry order is the payload's key SET, never its key ORDER — the latter is not a
  // semantic difference, and `compareMirrors` compares order.
  for (const layer of Object.keys(body as Record<string, unknown>).sort()) {
    const value = (body as Record<string, unknown>)[layer];
    out.push({
      [ACTIVITY_KEY]: `layer:${layer}`,
      shape: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
      rows: Array.isArray(value) ? value.length : null,
    });
    if (!Array.isArray(value)) continue;
    value.forEach((row, i) => {
      const fields =
        row !== null && typeof row === "object" && !Array.isArray(row)
          ? (row as Record<string, unknown>)
          : { value: row };
      // The synthetic key is written LAST so a payload that happened to carry `_key` cannot
      // displace it and collapse two rows onto one entry.
      out.push({ ...fields, [ACTIVITY_KEY]: `${layer}#${i}` });
    });
  }
  return out;
}

/**
 * PURE: project a `GET /api/arcs` probe payload — `{ [label]: { status, body } }`, one entry per
 * request both probes replayed — into comparable {@link Entry} rows.
 *
 * WHY STATUS AND BODY TOGETHER, and not the body alone as the activity projection takes it. This
 * route's hand-copied part is its ENVELOPE, and most of that envelope is expressed as a STATUS: the
 * 405 that makes read-only a decision rather than an omission (ADR-0267 D6 / ADR-0314 D9), the 503
 * that refuses to answer "one arc" without a store, the 404 that refuses to answer an unknown id
 * with an empty shell. A projection over bodies alone would compare three error objects and never
 * notice that one surface returned them under different codes.
 *
 * THREE ENTRY KINDS PER LABEL, for the same reason the activity projection emits layer markers:
 *
 *   `response:<label>` — the status, the body's SHAPE, and its top-level key SET. The key set is
 *     what catches an envelope that gained or lost a key while every shared key still agreed; the
 *     shape is what keeps `{ arcs: null }` and `{ arcs: [] }` apart, which is the whole distinction
 *     this route exists to preserve.
 *   `<label>:arcs` — the list payload's own shape + row count, so a `null`-for-`[]` swap is a field
 *     divergence rather than two payloads that both contribute zero rows and agree.
 *   `<label>#<id>` / `<label>#body` — one entry per row of a list answer, or the single object of a
 *     one-arc / error answer, compared FIELD BY NAME. Per-field is deliberate: a whole-body
 *     JSON-string compare would make object KEY ORDER — not a semantic difference in JSON — a red
 *     gate, and would report a whole-payload mismatch where the real defect is one field.
 */
export function projectArcsPayload(body: unknown): Entry[] {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`arcs payload must be a JSON object keyed by request label, got ${render(body)}`);
  }
  const out: Entry[] = [];
  // Sorted so the entry order is the request SET, never the probe's iteration order.
  for (const label of Object.keys(body as Record<string, unknown>).sort()) {
    const answer = (body as Record<string, unknown>)[label];
    if (answer === null || typeof answer !== "object" || Array.isArray(answer)) {
      throw new Error(`arcs answer "${label}" must be a { status, body } object, got ${render(answer)}`);
    }
    const { status, body: payload } = answer as { status?: unknown; body?: unknown };
    const isRecord = payload !== null && typeof payload === "object" && !Array.isArray(payload);
    const fields = isRecord ? (payload as Record<string, unknown>) : {};
    out.push({
      [ARCS_KEY]: `response:${label}`,
      status: status ?? null,
      shape: payload === null ? "null" : Array.isArray(payload) ? "array" : typeof payload,
      keys: Object.keys(fields).sort().join(","),
    });
    if (!isRecord) continue;

    if (Object.hasOwn(fields, "arcs")) {
      const arcs = fields["arcs"];
      out.push({
        [ARCS_KEY]: `${label}:arcs`,
        shape: arcs === null ? "null" : Array.isArray(arcs) ? "array" : typeof arcs,
        rows: Array.isArray(arcs) ? arcs.length : null,
      });
      if (!Array.isArray(arcs)) continue;
      arcs.forEach((arc, i) => {
        const row: Record<string, unknown> =
          arc !== null && typeof arc === "object" && !Array.isArray(arc)
            ? (arc as Record<string, unknown>)
            : { value: arc };
        // Keyed by the arc's own id where it has one (a mirror that DROPPED an arc then reports a
        // missing entry naming it, not an order shift); the index is the fallback.
        const id = typeof row["id"] === "string" ? row["id"] : String(i);
        // The synthetic key is written LAST so a payload carrying `_key` cannot displace it.
        out.push({ ...row, [ARCS_KEY]: `${label}#${id}` });
      });
      continue;
    }
    // A one-arc answer, or an error body — one entry, compared field by field.
    out.push({ ...fields, [ARCS_KEY]: `${label}#body` });
  }
  return out;
}

/**
 * PURE: project a `GET /api/floor-health` probe payload — `{ [label]: { status, body } }`, one entry
 * per request both probes replayed — into comparable {@link Entry} rows.
 *
 * STATUS AND BODY TOGETHER, for the reason {@link projectArcsPayload} takes them together: this
 * route's hand-copied part is its ENVELOPE, and half of that envelope is a STATUS — the 405 that
 * makes report-only a decision rather than an omission (ADR-0316 D4). A projection over bodies alone
 * would compare two error objects and never notice one surface returning them under different codes.
 *
 * THREE ENTRY KINDS PER LABEL:
 *
 *   `response:<label>` — the status, the body's SHAPE and its top-level key SET. The key set catches
 *     an envelope that gained or lost a key while every shared key still agreed.
 *   `<label>:reading` — the reading's own shape (`null` / `object`) plus its key set. THIS IS THE
 *     LOAD-BEARING ONE, and it is why a marker exists at all rather than only the fields below: it
 *     keeps `{ reading: null }` — "this backend has no document store" — apart from a reading that
 *     merely has no `loudest`, i.e. a QUIET floor. `apps/studio/src/lib/floorHealth.ts` renders those
 *     two differently on purpose, and a missing instrument presented as "all clear" is the exact
 *     failure ADR-0316's band exists to avoid.
 *   `<label>#reading` / `<label>#body` — the reading's own fields compared BY NAME, or the fields of
 *     an error body. Per-field is deliberate: a whole-body JSON-string compare would make object KEY
 *     ORDER — not a semantic difference in JSON — a red gate, and would report a whole-payload
 *     mismatch where the real defect is one field. `window` and `loudest` are nested objects and so
 *     are JSON-compared as subtrees, exactly as an `ArcRollup`'s nested arrays are: both surfaces
 *     build them with ONE shared function (`loadFloorHealthReading`), so their key order cannot
 *     differ, and a difference in either is a real divergence rather than a formatting artifact.
 */
export function projectFloorHealthPayload(body: unknown): Entry[] {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(
      `floor-health payload must be a JSON object keyed by request label, got ${render(body)}`,
    );
  }
  const out: Entry[] = [];
  // Sorted so the entry order is the request SET, never the probe's iteration order.
  for (const label of Object.keys(body as Record<string, unknown>).sort()) {
    const answer = (body as Record<string, unknown>)[label];
    if (answer === null || typeof answer !== "object" || Array.isArray(answer)) {
      throw new Error(
        `floor-health answer "${label}" must be a { status, body } object, got ${render(answer)}`,
      );
    }
    const { status, body: payload } = answer as { status?: unknown; body?: unknown };
    const isRecord = payload !== null && typeof payload === "object" && !Array.isArray(payload);
    const fields = isRecord ? (payload as Record<string, unknown>) : {};
    out.push({
      [FLOOR_HEALTH_KEY]: `response:${label}`,
      status: status ?? null,
      shape: payload === null ? "null" : Array.isArray(payload) ? "array" : typeof payload,
      keys: Object.keys(fields).sort().join(","),
    });
    if (!isRecord) continue;

    if (Object.hasOwn(fields, "reading")) {
      const reading = fields["reading"];
      const readingIsRecord =
        reading !== null && typeof reading === "object" && !Array.isArray(reading);
      out.push({
        [FLOOR_HEALTH_KEY]: `${label}:reading`,
        shape: reading === null ? "null" : Array.isArray(reading) ? "array" : typeof reading,
        keys: readingIsRecord
          ? Object.keys(reading as Record<string, unknown>)
              .sort()
              .join(",")
          : "",
      });
      if (!readingIsRecord) continue;
      // The synthetic key is written LAST so a reading that happened to carry `_key` cannot
      // displace it and collapse two entries onto one.
      out.push({ ...(reading as Record<string, unknown>), [FLOOR_HEALTH_KEY]: `${label}#reading` });
      continue;
    }
    // An error body (or any envelope with no `reading` key) — one entry, compared field by field.
    out.push({ ...fields, [FLOOR_HEALTH_KEY]: `${label}#body` });
  }
  return out;
}

/** JSON-compare one field value; `undefined` for an absent key (distinct from an explicit null). */
function render(value: unknown): string {
  return value === undefined ? "(absent)" : JSON.stringify(value);
}

function keyOf(entry: Entry, spec: MirrorSpec): string {
  const raw = entry[spec.key];
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

/**
 * Compare a mirrored payload against its reference and return every divergence, most-structural
 * first (missing/extra entries, then order, then per-field, then allowlist rot). An EMPTY array
 * is conformance.
 *
 * `where` labels the input the two payloads were produced from (a fixture name, or the repo's
 * real `docs/` tree) so a report over several inputs stays attributable — the same
 * attributability rule ADR-0249 established for oracle reports: evidence that cannot be traced to
 * the observation that produced it is not evidence.
 */
export function compareMirrors(
  reference: Entry[],
  mirror: Entry[],
  spec: MirrorSpec,
  where: string,
): Divergence[] {
  const out: Divergence[] = [];
  const allowlist = new Set(spec.referenceOnlyFields);

  const refByKey = new Map(reference.map((e) => [keyOf(e, spec), e]));
  const mirrorByKey = new Map(mirror.map((e) => [keyOf(e, spec), e]));

  for (const key of refByKey.keys()) {
    if (!mirrorByKey.has(key)) out.push({ kind: "missing-entry", where, key });
  }
  for (const key of mirrorByKey.keys()) {
    if (!refByKey.has(key)) out.push({ kind: "extra-entry", where, key });
  }

  // Order is part of the payload: both sides sort, and a client that renders the array in order
  // would show a different list. Only compared where both sides agree on the entry SET — otherwise
  // every position after the first missing entry would report a spurious shift.
  if (out.length === 0) {
    for (let i = 0; i < reference.length; i++) {
      const refKey = keyOf(reference[i] as Entry, spec);
      const mirrorKey = keyOf(mirror[i] as Entry, spec);
      if (refKey !== mirrorKey) {
        out.push({ kind: "order", where, position: i, reference: refKey, mirror: mirrorKey });
        break; // one report is enough; the whole tail has shifted
      }
    }
  }

  // Per-field equality over the shared entries.
  for (const [key, refEntry] of refByKey) {
    const mirrorEntry = mirrorByKey.get(key);
    if (mirrorEntry === undefined) continue;
    const fields = new Set([...Object.keys(refEntry), ...Object.keys(mirrorEntry)]);
    for (const field of fields) {
      if (allowlist.has(field)) continue;
      const a = render(refEntry[field]);
      const b = render(mirrorEntry[field]);
      if (a !== b) out.push({ kind: "field", where, key, field, reference: a, mirror: b });
    }
  }

  // The allowlist is self-pruning — it may only ever hold a field the reference DOES emit and the
  // mirror does NOT. Either half going false means the entry is stale and must be removed (or the
  // difference is no longer sanctioned), so a rotted allowlist is a loud failure rather than a
  // silently widening exemption.
  for (const field of allowlist) {
    const mirrorEmits = mirror.some((e) => e[field] !== undefined);
    const referenceEmits = reference.some((e) => e[field] !== undefined);
    if (mirrorEmits) {
      out.push({
        kind: "stale-allowlist",
        where,
        field,
        reason: `${spec.mirror} emits it — the difference is no longer ${spec.reference}-only`,
      });
    } else if (!referenceEmits) {
      out.push({
        kind: "stale-allowlist",
        where,
        field,
        reason: `${spec.reference} never emits it — nothing left to exempt`,
      });
    }
  }

  return out;
}

/** Render one divergence as a single operator-readable line. */
export function formatDivergence(spec: MirrorSpec, d: Divergence): string {
  switch (d.kind) {
    case "missing-entry":
      return `[${d.where}] ${spec.mirror} is MISSING the entry ${d.key}`;
    case "extra-entry":
      return `[${d.where}] ${spec.mirror} emits an EXTRA entry ${d.key} the ${spec.reference} does not`;
    case "order":
      return `[${d.where}] order diverges at position ${d.position}: ${spec.reference} has ${d.reference}, ${spec.mirror} has ${d.mirror}`;
    case "field":
      return `[${d.where}] ${d.key} field \`${d.field}\`: ${spec.reference}=${d.reference}  ${spec.mirror}=${d.mirror}`;
    case "stale-allowlist":
      return `[${d.where}] stale referenceOnlyFields entry \`${d.field}\`: ${d.reason}`;
  }
}

/**
 * The full failure report for one spec: a headline count, the first {@link REPORT_LIMIT} lines,
 * an elision note when there are more, and a per-field census so a 168-instance drift reads as
 * ONE fact rather than 168 lines. Returns `""` when there is nothing to report.
 */
export const REPORT_LIMIT = 20;

export function formatDivergences(spec: MirrorSpec, divergences: Divergence[]): string {
  if (divergences.length === 0) return "";
  const lines: string[] = [
    `✗ ${spec.surface}: ${spec.mirror} has drifted from ${spec.reference} — ${divergences.length} divergence(s)`,
  ];

  // The census first: a field that diverged on many entries is one defect, not many.
  const census = new Map<string, number>();
  for (const d of divergences) {
    if (d.kind === "field") census.set(d.field, (census.get(d.field) ?? 0) + 1);
  }
  if (census.size > 0) {
    const summary = [...census.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([field, n]) => `${field} (${n})`)
      .join(", ");
    lines.push(`  fields that diverged: ${summary}`);
  }

  for (const d of divergences.slice(0, REPORT_LIMIT)) lines.push(`  - ${formatDivergence(spec, d)}`);
  if (divergences.length > REPORT_LIMIT) {
    lines.push(`  … and ${divergences.length - REPORT_LIMIT} more`);
  }
  return lines.join("\n");
}
