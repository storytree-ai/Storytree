import type { StoredDoc, StoreEvent } from "@storytree/storage-protocol";

/**
 * FACTORY-FLOOR HEALTH — the friction half of the report-only instrument (ADR-0316,
 * `factory-floor-health-arc`).
 *
 * Two of the arc's three questions live here, and both are computed from PRIMARY SOURCES only — the
 * `events.library_artifact` projection and the `events.library_event` history. Nothing reads a
 * hand-maintained tally, and two sessions running this over the same window get the same numbers.
 *
 * QUESTION 1 — IS RECURRENCE BEING EXTINGUISHED? (`recurrence-extinction-instrument`.)
 * `friction-adjudication` names recurrence extinction as the standing success signal every
 * adjudicator must watch. Nothing computed it: `friction list` prints a raw reinforcement COUNT,
 * which cannot discriminate evidence gathered BEFORE an item was routed from recurrence AFTER it,
 * and only the second is the signal. {@link computeRecurrence} relates each item's ROUTE timestamp
 * (from the event log) to its `reinforcedBy[].date` entries, SPLIT BY ROUTE — a post-route
 * reinforcement on a `guardrail` item is the tripwire ADR-0168 names, while the same shape on an
 * unbuilt `tool` item is expected and means nothing, so pooling the two buries the signal in noise.
 *
 * QUESTION 3 — HOW MANY DISTINCT BOTTLENECKS ARE LIVE? (`distinct-bottlenecks-not-filing-volume`.)
 * {@link computeBottlenecks} counts un-discharged routed items as DISTINCT CAUSES, collapsed by a
 * rule it STATES in its own output. ADR-0316 D3 (carrying ADR-0314 D7's rule to the instrument that
 * computes it): no figure reported as a health measure may be a filing count, a session count, or
 * any raw volume — that is the error that closed
 * `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc`, whose two closing metrics both
 * counted filings.
 *
 * D4 — IT MEASURES, IT DOES NOT ADJUDICATE. Everything here is a pure read. Nothing re-routes an
 * item, discharges one, closes an arc, or decides what a signal MEANS; whole-system friction
 * adjudication stays with the graduation-synthesist (ADR-0168 D5).
 *
 * Pure by construction — the caller supplies docs + events, so the whole surface is testable without
 * a store. `factory-health.test.ts` holds it to the arc's own calibration cases.
 */

// ---------------------------------------------------------------------------
// Question 1 — recurrence since route
// ---------------------------------------------------------------------------

/**
 * The routes on which a POST-ROUTE reinforcement is a TRIPWIRE rather than an expectation.
 *
 * `tool` is deliberately absent and that absence is the whole point of splitting by route: a `tool`
 * route emits a parked capability gap, so the trap keeps firing until the capability is BUILT and
 * recurrence in the meantime is the expected shape, not a failure of the routing. `nothing` is
 * absent because an archived item was never remedied by anything. Every other route lands durable
 * guidance that renders into future sessions, so a reinforcement after it is the loop producing
 * bloat instead of learning — ADR-0168's named tripwire.
 */
export const TRIPWIRE_ROUTES: readonly string[] = [
  "adr",
  "principle",
  "guardrail",
  "process",
  "definition",
  "edit-existing",
];

/** The routes an item can carry; `nothing` archives, and is excluded from the live population. */
const ARCHIVING_ROUTE = "nothing";

/**
 * One stretch of an item's life under ONE route, read from `events.library_event`.
 *
 * Spans exist because the calibration case is an item whose route CHANGED
 * (`sdk-leaf-drops-contract-id-test-names` was `guardrail` from 2026-07-11 and `tool` from
 * 2026-07-30), so "reinforcements since route" needs a defined answer when there is more than one
 * route event. The answer is: attribute each reinforcement to the route that was STANDING WHEN IT
 * LANDED. Pooling them under the item's CURRENT route would credit the guardrail's eight failures to
 * a `tool` route that did not exist when they happened.
 */
export interface RouteSpan {
  /** The route standing over this span. */
  route: string;
  /** ISO timestamp of the event that set it. */
  from: string;
  /** ISO timestamp of the event that replaced it — absent while the span is the current one. */
  to?: string;
  /**
   * Reinforcements dated strictly AFTER `from`'s calendar day and inside this span. THE SIGNAL:
   * guidance landed, and the behaviour it targets recurred anyway.
   */
  postRoute: number;
  /**
   * Reinforcements dated ON the day this route was set. Held apart and NEVER counted as post-route:
   * `reinforcedBy[].date` is day-granular, so a same-day reinforcement cannot be PROVEN to have
   * followed the route, and the instrument does not claim what its evidence cannot carry.
   */
  sameDay: number;
}

/** One friction item's recurrence record. */
export interface RecurrenceItem {
  id: string;
  title: string;
  /** The route standing today (the one `friction list` shows) — context, never the attribution key. */
  currentRoute?: string;
  /** The routed remedy has LANDED (`dischargedBy`). */
  discharged: boolean;
  /** Reinforcements dated before the FIRST route event: evidence gathered at capture, not recurrence. */
  preRoute: number;
  /** Every route this item has held, in order. */
  spans: RouteSpan[];
  /** Total `reinforcedBy` entries — reported as clearly-labelled CONTEXT, never as a health figure. */
  reinforcements: number;
}

/** Question 1's answer for one route. Never pooled across routes (ADR-0316 / the entry's own fence). */
export interface RecurrenceByRoute {
  route: string;
  /** Does a post-route reinforcement on this route indicate failure? See {@link TRIPWIRE_ROUTES}. */
  tripwire: boolean;
  /** Items that have EVER held this route (the denominator). */
  itemsRouted: number;
  /** Items with at least one post-route reinforcement under this route. */
  itemsRecurring: number;
  /** Post-route reinforcements summed over this route's spans. */
  postRoute: number;
  /** The offending items, worst first — the entry requires the answer NAME them, not just rate them. */
  offenders: Array<{ id: string; title: string; postRoute: number; routedAt: string; latest?: string }>;
}

/** Question 1's full answer. Every figure carries the window and the sample it was computed over. */
export interface RecurrenceReport {
  /** The window figures were computed over — absent bounds mean "all history". */
  window: { from?: string; to?: string };
  sample: {
    /** friction docs read. */
    items: number;
    /** of those, items carrying at least one route event. */
    routed: number;
    /** `events.library_event` rows walked. */
    events: number;
  };
  byRoute: RecurrenceByRoute[];
  /** Items whose route CHANGED — the multi-span case, named because attribution is span-wise. */
  multiSpan: string[];
  /** The attribution rule, STATED so the number is auditable rather than merely produced. */
  attributionRule: string;
}

/** The attribution rule, printed with every recurrence report. */
export const RECURRENCE_ATTRIBUTION_RULE =
  "A reinforcement is attributed to the route that was STANDING WHEN IT LANDED: route spans are read " +
  "from events.library_event (each event whose `route` differs from the previous one opens a span), " +
  "and a reinforcement falls in the last span opened on or before its own `date`. A reinforcement " +
  "dated ON the day its route was set is reported as SAME-DAY and never as post-route — " +
  "`reinforcedBy[].date` is day-granular, so same-day ordering cannot be proven from it. " +
  "Reinforcements predating the first route event are PRE-ROUTE: evidence gathered at capture, not recurrence.";

function asRecord(doc: unknown): Record<string, unknown> {
  return typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>) : {};
}

function str(doc: Record<string, unknown>, key: string): string | undefined {
  const v = doc[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** The `YYYY-MM-DD` day part of an ISO timestamp (or of an already-day-granular date). */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** `reinforcedBy[].date` values on a doc, day-granular, in ascending order. */
function reinforcementDates(doc: Record<string, unknown>): string[] {
  const raw = doc["reinforcedBy"];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const e = asRecord(entry);
      return typeof e["date"] === "string" ? dayOf(e["date"]) : undefined;
    })
    .filter((d): d is string => d !== undefined)
    .sort();
}

/**
 * The ROUTE SPANS of one item, read from its event history in `seq` order.
 *
 * A span opens at the first event carrying a route DIFFERENT from the previous event's, and closes
 * when the next one opens. Events before any route (capture, pre-adjudication edits) open nothing —
 * an unrouted item has no spans, which is what makes its reinforcements pre-route by construction.
 */
export function routeSpansOf(events: readonly StoreEvent[]): Array<Omit<RouteSpan, "postRoute" | "sameDay">> {
  const spans: Array<{ route: string; from: string; to?: string }> = [];
  let standing: string | undefined;
  for (const ev of [...events].sort((a, b) => a.seq - b.seq)) {
    const route = str(asRecord(ev.doc), "route");
    if (route === undefined || route === standing) continue;
    const previous = spans[spans.length - 1];
    if (previous !== undefined) previous.to = ev.at;
    spans.push({ route, from: ev.at });
    standing = route;
  }
  return spans;
}

/**
 * Attribute one item's reinforcements across its route spans (the rule in
 * {@link RECURRENCE_ATTRIBUTION_RULE}).
 */
function attribute(
  spans: Array<Omit<RouteSpan, "postRoute" | "sameDay">>,
  dates: readonly string[],
) {
  const filled: RouteSpan[] = spans.map((s) => ({ ...s, postRoute: 0, sameDay: 0 }));
  let preRoute = 0;
  for (const date of dates) {
    // The LAST span opened on or before this reinforcement's day.
    let index = -1;
    for (let i = 0; i < filled.length; i += 1) {
      if (dayOf(filled[i]!.from) <= date) index = i;
    }
    if (index === -1) {
      preRoute += 1;
      continue;
    }
    const span = filled[index]!;
    if (dayOf(span.from) === date) span.sameDay += 1;
    else span.postRoute += 1;
  }
  return { spans: filled, preRoute };
}

/**
 * QUESTION 1 — reinforcements since route, split by route.
 *
 * `window` bounds which REINFORCEMENTS count (by their own day), not which items are read: an item
 * routed long before the window still contributes the recurrence that landed inside it, which is
 * exactly the "seventeen days later" shape the calibration case carries.
 */
export function computeRecurrence(input: {
  docs: readonly StoredDoc[];
  events: readonly StoreEvent[];
  window?: { from?: string | undefined; to?: string | undefined } | undefined;
}): RecurrenceReport {
  const from = input.window?.from;
  const to = input.window?.to;

  const eventsById = new Map<string, StoreEvent[]>();
  for (const ev of input.events) {
    if (ev.kind !== "friction") continue;
    const bucket = eventsById.get(ev.id);
    if (bucket === undefined) eventsById.set(ev.id, [ev]);
    else bucket.push(ev);
  }

  const items: RecurrenceItem[] = [];
  for (const stored of input.docs) {
    if (stored.kind !== "friction") continue;
    const doc = asRecord(stored.doc);
    const dates = reinforcementDates(doc).filter(
      (d) => (from === undefined || d >= dayOf(from)) && (to === undefined || d < dayOf(to)),
    );
    const spans = routeSpansOf(eventsById.get(stored.id) ?? []);
    const { spans: filled, preRoute } = attribute(spans, dates);
    items.push({
      id: stored.id,
      title: str(doc, "title") ?? stored.id,
      ...(str(doc, "route") !== undefined ? { currentRoute: str(doc, "route")! } : {}),
      discharged: str(doc, "dischargedBy") !== undefined,
      preRoute,
      spans: filled,
      reinforcements: dates.length,
    });
  }

  // Aggregate by route. `itemsRouted` / `itemsRecurring` count DISTINCT ITEMS, not spans: an item
  // that held `guardrail`, moved to `tool` and came back holds two guardrail spans, and counting it
  // twice would inflate the denominator the recurrence rate is read against.
  const routes = new Map<string, RecurrenceByRoute>();
  const held = new Map<string, Set<string>>();
  const recurred = new Map<string, Set<string>>();
  for (const item of items) {
    for (const span of item.spans) {
      const row =
        routes.get(span.route) ??
        ({
          route: span.route,
          tripwire: TRIPWIRE_ROUTES.includes(span.route),
          itemsRouted: 0,
          itemsRecurring: 0,
          postRoute: 0,
          offenders: [],
        } satisfies RecurrenceByRoute);
      row.postRoute += span.postRoute;
      (held.get(span.route) ?? held.set(span.route, new Set()).get(span.route)!).add(item.id);
      if (span.postRoute > 0) {
        (recurred.get(span.route) ?? recurred.set(span.route, new Set()).get(span.route)!).add(item.id);
        row.offenders.push({
          id: item.id,
          title: item.title,
          postRoute: span.postRoute,
          routedAt: span.from,
          ...(span.to !== undefined ? { latest: span.to } : {}),
        });
      }
      routes.set(span.route, row);
    }
  }
  for (const row of routes.values()) {
    row.itemsRouted = held.get(row.route)?.size ?? 0;
    row.itemsRecurring = recurred.get(row.route)?.size ?? 0;
    row.offenders.sort((a, b) => b.postRoute - a.postRoute || a.id.localeCompare(b.id));
  }

  // Tripwire routes first (that is where a post-route reinforcement MEANS something), then by weight.
  const byRoute = [...routes.values()].sort(
    (a, b) =>
      Number(b.tripwire) - Number(a.tripwire) || b.postRoute - a.postRoute || a.route.localeCompare(b.route),
  );

  return {
    window: { ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) },
    sample: {
      items: items.length,
      routed: items.filter((i) => i.spans.length > 0).length,
      events: input.events.filter((e) => e.kind === "friction").length,
    },
    byRoute,
    multiSpan: items.filter((i) => i.spans.length > 1).map((i) => i.id).sort(),
    attributionRule: RECURRENCE_ATTRIBUTION_RULE,
  };
}

// ---------------------------------------------------------------------------
// Question 3 — distinct bottlenecks, never filing volume
// ---------------------------------------------------------------------------

/**
 * The collapsing rule, STATED in every bottleneck report.
 *
 * ADR-0316 D3: *"a distinctness count whose rule is hidden is just a different unaudited number"*.
 * The rule collapses only where an AUTHOR joined two filings, because the instrument does not
 * adjudicate (D4) — inferring sameness from prose would be this surface quietly becoming a second
 * adjudicator, and an unauditable one.
 */
export const COLLAPSING_RULE =
  "Two live filings are ONE cause when an AUTHOR joined them: (a) both are cited by the same " +
  "increment's `frictionRefs` — one remedy declared to cover both — or (b) one names the other in " +
  "its `references` as `asset:<id>`. A cause is the transitive closure of those two edges. " +
  "Reinforcements are part of their own item and are never separate filings. " +
  "Filings carrying NO join edge stand alone, so the cause count is a CEILING on distinctness, " +
  "never a measurement of filing volume — see `unjoined` for how far the rule actually reached.";

/** One distinct live bottleneck: the filings an author declared to be one cause. */
export interface DistinctCause {
  /** The lowest-sorting member id — a stable handle, not a judgement about which filing is primary. */
  key: string;
  members: string[];
  /** The routes its members carry. */
  routes: string[];
  /** The authored edges that collapsed it, named so the collapse is auditable. */
  joinedBy: string[];
  /** Post-route reinforcement summed over members, BY ROUTE (question 1's figure, per cause). */
  postRouteByRoute: Record<string, number>;
  /** Post-route reinforcement on TRIPWIRE routes only — the number that means "this recurred". */
  tripwireRecurrences: number;
}

/** Question 3's answer. */
export interface BottleneckReport {
  /** The rule, printed with the number (ADR-0316 D3). */
  rule: string;
  sample: {
    /** Live filings in the population: routed, not `nothing`, not discharged. */
    filings: number;
    /** Distinct causes after collapsing — a CEILING, see `unjoined`. */
    causes: number;
    /** filings − causes: how many filings the authored edges actually absorbed. */
    collapsed: number;
    /** Filings carrying no join edge at all — the rule's blind spot, reported not hidden. */
    unjoined: number;
  };
  /** The population definition, stated so a reader knows what was and was not counted. */
  population: string;
  causes: DistinctCause[];
  /** Total filings including archived/discharged — clearly-labelled CONTEXT, never a health figure. */
  context: { allFilings: number; archived: number; discharged: number };
}

/** The live-bottleneck population, stated in the output. */
export const BOTTLENECK_POPULATION =
  "Un-discharged routed friction: items carrying a `route` other than `nothing` and no " +
  "`dischargedBy` stamp — i.e. a cause someone adjudicated as real whose remedy has not landed.";

class DisjointSet {
  readonly #parent = new Map<string, string>();

  add(id: string): void {
    if (!this.#parent.has(id)) this.#parent.set(id, id);
  }

  find(id: string): string {
    let root = this.#parent.get(id) ?? id;
    while (root !== this.#parent.get(root)) root = this.#parent.get(root) ?? root;
    return root;
  }

  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.#parent.set(ra, rb);
  }
}

const ASSET_PREFIX = "asset:";

function stringArray(doc: Record<string, unknown>, key: string): string[] {
  const raw = doc[key];
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

/**
 * QUESTION 3 — distinct live bottlenecks.
 *
 * `recurrence` is threaded in rather than recomputed so the per-cause recurrence figure is the SAME
 * number question 1 reports: two figures on one screen that disagree would be worse than one.
 */
export function computeBottlenecks(input: {
  docs: readonly StoredDoc[];
  /** Every artifact that can carry a join edge — `increment` docs supply `frictionRefs`. */
  increments: readonly StoredDoc[];
  recurrence: RecurrenceReport;
}): BottleneckReport {
  const frictionDocs = input.docs.filter((d) => d.kind === "friction");

  const live = new Map<string, Record<string, unknown>>();
  let archived = 0;
  let discharged = 0;
  for (const stored of frictionDocs) {
    const doc = asRecord(stored.doc);
    const route = str(doc, "route");
    if (route === ARCHIVING_ROUTE) archived += 1;
    if (str(doc, "dischargedBy") !== undefined) discharged += 1;
    if (route === undefined || route === ARCHIVING_ROUTE) continue;
    if (str(doc, "dischargedBy") !== undefined) continue;
    live.set(stored.id, doc);
  }

  const sets = new DisjointSet();
  for (const id of live.keys()) sets.add(id);
  const edgesFor = new Map<string, Set<string>>();
  const noteEdge = (id: string, label: string) => {
    const bucket = edgesFor.get(id) ?? new Set<string>();
    bucket.add(label);
    edgesFor.set(id, bucket);
  };

  // Edge (a) — one remedy declared to cover several filings.
  for (const inc of input.increments) {
    if (inc.kind !== "increment") continue;
    const refs = stringArray(asRecord(inc.doc), "frictionRefs").filter((r) => live.has(r));
    if (refs.length < 2) continue;
    for (const ref of refs) {
      sets.union(refs[0]!, ref);
      noteEdge(ref, `increment:${inc.id}`);
    }
  }

  // Edge (b) — one filing names another as its own cause.
  for (const [id, doc] of live) {
    for (const ref of stringArray(doc, "references")) {
      if (!ref.startsWith(ASSET_PREFIX)) continue;
      const target = ref.slice(ASSET_PREFIX.length);
      if (!live.has(target) || target === id) continue;
      sets.union(id, target);
      // ONE label per pair, naming both ends and the direction — a `cited-by:` twin would print the
      // same edge twice and leave a reader guessing which filing did the citing.
      const label = `${id} cites ${target}`;
      noteEdge(id, label);
      noteEdge(target, label);
    }
  }

  // Per-item, per-route post-route recurrence, taken from question 1's own attribution.
  const perItem = new Map<string, Record<string, number>>();
  for (const row of input.recurrence.byRoute) {
    for (const offender of row.offenders) {
      const bucket = perItem.get(offender.id) ?? {};
      bucket[row.route] = (bucket[row.route] ?? 0) + offender.postRoute;
      perItem.set(offender.id, bucket);
    }
  }

  const grouped = new Map<string, string[]>();
  for (const id of live.keys()) {
    const root = sets.find(id);
    const bucket = grouped.get(root) ?? [];
    bucket.push(id);
    grouped.set(root, bucket);
  }

  const causes: DistinctCause[] = [...grouped.values()].map((members) => {
    members.sort();
    const postRouteByRoute: Record<string, number> = {};
    for (const member of members) {
      for (const [route, n] of Object.entries(perItem.get(member) ?? {})) {
        postRouteByRoute[route] = (postRouteByRoute[route] ?? 0) + n;
      }
    }
    const tripwireRecurrences = Object.entries(postRouteByRoute)
      .filter(([route]) => TRIPWIRE_ROUTES.includes(route))
      .reduce((sum, [, n]) => sum + n, 0);
    const routes = [...new Set(members.map((m) => str(live.get(m) ?? {}, "route") ?? "?"))].sort();
    const joinedBy = [...new Set(members.flatMap((m) => [...(edgesFor.get(m) ?? [])]))].sort();
    return { key: members[0]!, members, routes, joinedBy, postRouteByRoute, tripwireRecurrences };
  });

  causes.sort(
    (a, b) =>
      b.tripwireRecurrences - a.tripwireRecurrences ||
      b.members.length - a.members.length ||
      a.key.localeCompare(b.key),
  );

  return {
    rule: COLLAPSING_RULE,
    population: BOTTLENECK_POPULATION,
    sample: {
      filings: live.size,
      causes: causes.length,
      collapsed: live.size - causes.length,
      unjoined: causes.filter((c) => c.members.length === 1).length,
    },
    causes,
    context: { allFilings: frictionDocs.length, archived, discharged },
  };
}

// ---------------------------------------------------------------------------
// The composed reading — what ADR-0314 D7's strip consumes
// ---------------------------------------------------------------------------

/**
 * The FLOOR-HEALTH READING: one distinct cause and its recurrence, or an honest absence.
 *
 * This is the shape ADR-0316 D5 names as the instrument's first committed consumer — the
 * `factory-floor-health-signal` strip on `arc-orientation-surface-arc`. It carries exactly what that
 * strip's `FloorHealthSignal` may hold and NOTHING that could carry a volume figure: the loudest
 * DISTINCT cause, its post-route recurrence count on tripwire routes, the window it was computed
 * over (ADR-0316 D2) and the collapsing rule that produced the distinctness (D3). There is
 * deliberately no field here for a count of filings, sessions or reports — widening it to admit one
 * is the error that closed the ancestor arc.
 *
 * `loudest` is absent when no distinct cause carries a tripwire recurrence, which the strip should
 * render as QUIET. It is never a zero dressed as a signal.
 */
export interface FloorHealthReading {
  window: { from?: string; to?: string };
  collapsingRule: string;
  attributionRule: string;
  /** The distinct cause with the most tripwire recurrence, when there is one. */
  loudest?: {
    cause: string;
    members: string[];
    /** The route the recurrence landed under — always a tripwire route. */
    route: string;
    /** Post-route reinforcements on ONE distinct cause. The only number here. */
    recurrences: number;
  };
  /** The ceiling on live distinct causes — always read with `unjoined` (see {@link COLLAPSING_RULE}). */
  distinctCauses: number;
  unjoined: number;
}

/** Compose the reading a renderer consumes from the two reports. */
export function floorHealthReading(input: {
  recurrence: RecurrenceReport;
  bottlenecks: BottleneckReport;
}): FloorHealthReading {
  const top = input.bottlenecks.causes.find((c) => c.tripwireRecurrences > 0);
  const route =
    top === undefined
      ? undefined
      : Object.entries(top.postRouteByRoute)
          .filter(([r]) => TRIPWIRE_ROUTES.includes(r))
          .sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    window: input.recurrence.window,
    collapsingRule: input.bottlenecks.rule,
    attributionRule: input.recurrence.attributionRule,
    ...(top !== undefined && route !== undefined
      ? {
          loudest: {
            cause: top.key,
            members: top.members,
            route,
            recurrences: top.tripwireRecurrences,
          },
        }
      : {}),
    distinctCauses: input.bottlenecks.sample.causes,
    unjoined: input.bottlenecks.sample.unjoined,
  };
}
