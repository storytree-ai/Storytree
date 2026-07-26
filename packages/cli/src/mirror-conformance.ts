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

/** One registered mirrored payload: the rules, plus the two probes that produce it. */
export interface MirrorTarget {
  spec: MirrorSpec;
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
    reference: { appDir: "apps/studio", file: "apps/studio/server/docsMirrorProbe.ts" },
    mirror: { appDir: "apps/desktop", file: "apps/desktop/src/backend/docs-mirror-probe.ts" },
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
