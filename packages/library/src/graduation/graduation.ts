/**
 * Agent-memory → Library graduation engine (ADR-0095, amends ADR-0032).
 *
 * The PURE candidate-generation core: given a parsed agent-memory corpus and an offline snapshot
 * of the Library, emit graduation CANDIDATES — a worklist for the librarian-curator to finalise.
 * It is deliberately NOT a doc author: deciding the genuine durable wording of a `principle` /
 * `process` / `definition` from freeform memory prose is the curation JUDGMENT (ADR-0095 Decision
 * 3 — prove-the-mechanism / curate-the-judgment, the same split as ADR-0069/0070), so the engine
 * classifies, resolves references, and flags duplicates, and the librarian authors the final
 * fields. Pure, deterministic, browser-safe: no `node:`, no filesystem, no clock — the caller
 * passes `now`. Reading the memory files off disk is the CLI's job (a node seam, follow-on).
 *
 * ADR-0095 Decision 4 (targets by memory type) shapes the classifier; Decision 5 (the Library,
 * ADRs excepted, holds only durable "able" artifacts) and Decision 8 (genuine-only, no bloat) are
 * the librarian's bar applied to these candidates; Decision 6 (delete-after-graduation) and
 * Decision 7 (the pre-merge librarian pass) are the CALLER's concern, not this pure core's.
 */
import type { KnowledgeKind } from "../knowledge.js";

/** The agent-memory tiers (frontmatter `metadata.type`). */
export type MemoryType = "user" | "feedback" | "project" | "reference";

/**
 * A parsed agent-memory file (frontmatter + body). The CLI reads these off disk and parses the
 * frontmatter; this engine never touches the filesystem.
 */
export interface MemoryFile {
  /** the memory's kebab-case slug (frontmatter `name`) */
  readonly name: string;
  /** the one-line summary (frontmatter `description`) */
  readonly description: string;
  /** the memory tier (frontmatter `metadata.type`) */
  readonly type: MemoryType;
  /** the freeform markdown body, which may carry `[[wiki-links]]` */
  readonly body: string;
}

/**
 * The minimal shape of an existing Library doc the engine needs for dedup + reference resolution:
 * an id, its kind/category, and its title. Built offline from the seed or the store.
 */
export interface SnapshotDoc {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
}

export interface LibrarySnapshot {
  readonly docs: readonly SnapshotDoc[];
}

/**
 * The Library kinds agent-memory graduates INTO (ADR-0095 Decision 4) — a strict subset of
 * {@link KnowledgeKind}. `user`-tier memory is deferred (Open call 1) and never graduates; the
 * event-history kinds (`agent`, `proposal`) are not graduation targets. `open-question` is the
 * librarian's escape hatch for memory that is really design rationale → an OQ / proposed ADR.
 */
export type GraduationTarget = Extract<
  KnowledgeKind,
  "principle" | "process" | "definition" | "open-question"
>;

/**
 * A graduation candidate: a worklist item for the librarian, NOT a finished
 * {@link import("../library-doc.js").LibraryDoc}. The librarian authors the kind-required fields
 * (the judgment); the engine supplies the classification, provenance, resolved references, the raw
 * material, and a dedup verdict.
 */
export interface GraduationCandidate {
  /** the source memory's `name` */
  readonly source: string;
  /** the suggested Library kind (a default the librarian MAY override per content) */
  readonly target: GraduationTarget;
  /** one line: what is durable here and why this target */
  readonly rationale: string;
  /** the attribution line the finished doc must carry (ADR-0095 Decision 8) */
  readonly provenance: string;
  /** `asset:<id>` references resolved from the body's `[[wiki-links]]` that match a Library doc */
  readonly references: readonly string[];
  /** the raw durable material the librarian authors the final fields from */
  readonly body: string;
  /** the id of an existing Library doc that already covers this, if dedup found one (else novel) */
  readonly duplicateOf?: string;
}

export interface GraduationOptions {
  /** ISO timestamp stamped into provenance — passed in so the engine stays pure (no clock). */
  readonly now: string;
}

/**
 * Classify a memory tier to its DEFAULT graduation target, or `null` when it does not graduate
 * (ADR-0095 Decision 4). `user` → null (the deferred per-user tier, never the shared Library). The
 * target is a suggestion: the librarian may retarget (e.g. a `feedback` that is really a
 * `guardrail`, or a `project` memory that is really design rationale → `open-question`).
 */
export function classifyMemory(type: MemoryType): GraduationTarget | null {
  switch (type) {
    case "feedback":
      return "principle"; // a learned judgement rule
    case "project":
      return "process"; // an observed way-of-working
    case "reference":
      return "definition"; // the reference tier
    case "user":
      return null; // deferred per-user tier — never graduates (ADR-0095 Open call 1)
  }
}

const WIKI_LINK = /\[\[([^\]|]+?)(?:\s*\|[^\]]*)?\]\]/g;

/**
 * Extract the target slugs of every `[[wiki-link]]` (and `[[slug | label]]`) in `body`, in order
 * of first appearance, de-duplicated case-insensitively, trimmed.
 */
export function extractWikiLinks(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(WIKI_LINK)) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/** Normalise a title/slug for matching: lowercase, non-alphanumerics → single spaces, trimmed. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolve the body's `[[wiki-links]]` to `asset:<id>` references by matching each link against the
 * snapshot's doc ids and titles (normalised equality). An unmatched link is dropped — a dangling
 * `[[link]]` is a hint, not a reference. Order-preserving, de-duplicated.
 */
export function resolveReferences(body: string, snapshot: LibrarySnapshot): string[] {
  const byKey = new Map<string, string>(); // normalised id-or-title -> doc id
  for (const d of snapshot.docs) {
    byKey.set(normalize(d.id), d.id);
    byKey.set(normalize(d.title), d.id);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const link of extractWikiLinks(body)) {
    const id = byKey.get(normalize(link));
    if (id === undefined) continue;
    const ref = `asset:${id}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(ref);
  }
  return out;
}

/**
 * Dedup: return the id of an existing Library doc that already covers this memory, or `undefined`
 * if it is novel. Deterministic v1: a normalised match of the memory's `name` against an existing
 * doc's id or title. The librarian does the deeper semantic dedup (ADR-0095 Decision 8); this just
 * suppresses the obvious repeats so they never bloat the Library.
 */
export function findCover(memory: MemoryFile, snapshot: LibrarySnapshot): string | undefined {
  const key = normalize(memory.name);
  for (const d of snapshot.docs) {
    if (normalize(d.id) === key || normalize(d.title) === key) return d.id;
  }
  return undefined;
}

/**
 * The PURE engine. For each memory: classify (skipping the deferred `user` tier), resolve its
 * `[[wiki-link]]` references against the Library, stamp provenance, and flag whether an existing
 * doc already covers it. Returns the FULL list with duplicates flagged (not silently dropped —
 * ADR-0095: surface what was suppressed); use {@link novelCandidates} for the librarian's worklist.
 */
export function graduationCandidates(
  memory: readonly MemoryFile[],
  snapshot: LibrarySnapshot,
  opts: GraduationOptions,
): GraduationCandidate[] {
  const out: GraduationCandidate[] = [];
  for (const m of memory) {
    const target = classifyMemory(m.type);
    if (target === null) continue; // user-tier: deferred, never graduates
    const duplicateOf = findCover(m, snapshot);
    out.push({
      source: m.name,
      target,
      rationale: `${m.type} memory → ${target}: ${m.description}`,
      provenance: `Graduated from agent-memory '${m.name}' on ${opts.now}.`,
      references: resolveReferences(m.body, snapshot),
      body: m.body,
      ...(duplicateOf !== undefined ? { duplicateOf } : {}),
    });
  }
  return out;
}

/**
 * The candidates the librarian should author now: the novel (non-duplicate) ones. The full list
 * (with duplicates flagged) is what {@link graduationCandidates} returns — surface the suppressed
 * ones rather than silently dropping them (ADR-0095: no silent caps).
 */
export function novelCandidates(
  candidates: readonly GraduationCandidate[],
): GraduationCandidate[] {
  return candidates.filter((c) => c.duplicateOf === undefined);
}
