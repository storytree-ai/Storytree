import { z } from "zod";

/**
 * ADR-0044 `uat-test-units`: a story's UAT prose becomes stable, addressable test
 * units, each declaring who may attest it. Pure, no I/O — a parser + validator the
 * attestation log (ADR-0044 d.2) writes against by **test id**.
 *
 * The granularity is the UAT TEST, not the story (ADR-0044 d.1): a story has one
 * tree but many UAT tests, and "always allow both" human and machine. This module
 * owns the id scheme (`<story>#uat-<n>`) and the per-test witness enum; it never
 * touches a store, a clock, or the verdict log.
 */

// ---------------------------------------------------------------------------
// Witness kind
// ---------------------------------------------------------------------------

/**
 * Who MAY attest a UAT test (ADR-0044 d.2 "always allow both"). This is the
 * PERMISSION, finer than schema.ts's `UatWitness` (`human`|`machine`) which records
 * who DID witness a story's UAT-node: a test can admit `either`, but a recorded
 * attestation is concretely one or the other.
 *
 * ADR-0106 demotes `either` to a transient **pre-adopt, UNDECIDED** state: the adopt pass RESOLVES
 * each leg to a binary `human`|`machine` witness (`witness-resolution.ts`), and an adopted story has
 * no `either` leg at rest (`unresolvedUatLegs`). The enum keeps `either` so a not-yet-adopted prose
 * leg still loads; it is just never the resting state of an adopted leg, and never user-facing.
 */
export const UAT_TEST_WITNESSES = ["human", "machine", "either"] as const;
export const UatTestWitness = z.enum(UAT_TEST_WITNESSES);
export type UatTestWitness = z.infer<typeof UatTestWitness>;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * One addressable UAT test (ADR-0044 d.1). `id` is the join key the attestation log
 * writes against; `witness` declares who may attest. Strict: unknown fields rejected.
 *
 * `witness` defaults to `either` — the conservative default (ADR-0044 d.2 "always
 * allow both"): it neither forges a human-witnessed claim nor restricts a machine
 * run out, so a backward-compatible prose-only test still loads.
 */
export const UatTest = z
  .object({
    /** Stable test id, `<story>#uat-<n>` — the attestation log's key. */
    id: z.string().min(1),
    /** Human-readable title (the prose item's bold lead). */
    title: z.string().min(1),
    /** Who may attest this test. */
    witness: UatTestWitness.default("either"),
    /**
     * ADR-0097: a WOULD-BE (aspirational, unscripted) leg — one declared under a `## Story UAT
     * (would-be)` heading, recording the intended acceptance journey before a real scripted test
     * backs it. A would-be leg is parsed and surfaced like any other, but it is NOT a hard own-proof
     * obligation: it must not wedge the story crown until it is actually witnessable (a real
     * machine/scripted test signs it, or a declared human witness attests it). The author drops the
     * `(would-be)` qualifier when a real test lands, and the leg becomes green-blocking. Default
     * `false` (a leg under a plain `## Story UAT` heading is a real obligation, back-compat).
     */
    wouldBe: z.boolean().default(false),
    /**
     * ADR (uat-machine-proof-binding): the reliability gate this leg is machine-observed/signed
     * against, e.g. `demo-story#gate-2` — parsed from the prose `_(proof-gate: story-id#gate-n)_`
     * annotation. Preserved EXACTLY as written (unlike `witness`, never case-normalized): it is a
     * literal id lookup, not an enum. A real, non-aspirational `(witness: machine)` leg must name one
     * before `runAdopt` can observe or sign it; human/either legs may omit it (the drive never
     * machine-signs them). Absent → undefined — never inferred from ordering, title, package, or
     * `(covers:)`.
     */
    proofGateId: z.string().min(1).optional(),
  })
  .strict();

export type UatTest = z.infer<typeof UatTest>;

// ---------------------------------------------------------------------------
// Id scheme
// ---------------------------------------------------------------------------

/**
 * PURE: the stable test id for a story's nth UAT test (1-based). The single home of
 * the `<story>#uat-<n>` scheme so the parser and the attestation log can never fork.
 */
export function uatTestId(storyId: string, ordinal: number): string {
  return `${storyId}#uat-${ordinal}`;
}

// ---------------------------------------------------------------------------
// Prose parser
// ---------------------------------------------------------------------------

/** Match a `## Story UAT …` heading (e.g. `## Story UAT (would-be)`), capturing the trailing qualifier. */
const STORY_UAT_HEADING = /^##[^\n\S]+Story UAT([^\n]*)$/im;
/**
 * The would-be qualifier on a `## Story UAT (would-be)` heading (ADR-0097): the whole section is the
 * ASPIRATIONAL acceptance journey, so every leg under it is parsed but not a hard crown obligation.
 */
const WOULD_BE_QUALIFIER = /\(would-be\)/i;
/** Match the next `## …` heading after the section start. */
const NEXT_H2 = /^## /m;
/** A numbered list item lead: `1. …` (captures the rest of the first line). */
const NUMBERED_ITEM = /^\d+\.[^\n\S]+(.*)$/;
/** The bold lead of an item, e.g. `**Human relay:**` or `**Decompose**`. */
const BOLD_LEAD = /^\*\*(.+?)\*\*/;
/**
 * Optional inline witness annotation, e.g. `(witness: human)`. Captures the raw
 * value loosely so an explicit-but-invalid value can be REFUSED (not silently
 * defaulted) — the `witness-kind-validated` contract.
 */
const WITNESS_TAG = /\(witness:\s*([A-Za-z]+)\)/i;
/**
 * Optional inline proof-gate binding annotation, e.g. `(proof-gate: story-id#gate-2)`. The captured
 * id is preserved EXACTLY (never case-normalized, unlike {@link WITNESS_TAG}) — it is a literal
 * lookup key into the story's declared reliability gates, not an enum.
 */
const PROOF_GATE_TAG = /\(proof-gate:\s*([^)]+)\)/i;
/** All proof-gate annotations on an item, used only to detect a duplicate (more than one). */
const PROOF_GATE_TAG_ALL = /\(proof-gate:\s*[^)]+\)/gi;
/**
 * The required shape of a captured proof-gate id: `story-id#gate-n`. Anything else (e.g. a bare
 * slug with no `#gate-<n>` suffix) is malformed and refused at the parsing boundary rather than
 * passed through verbatim.
 */
const PROOF_GATE_ID_SHAPE = /^\S+#gate-\d+$/i;

/**
 * Extract the `## Story UAT` section (between its heading and the next `##`) AND whether the heading
 * carries the `(would-be)` qualifier (ADR-0097) — the section-level marker that makes every leg under
 * it aspirational. `null` when there is no Story UAT section.
 */
function storyUatSection(body: string): { section: string; wouldBe: boolean } | null {
  const heading = STORY_UAT_HEADING.exec(body);
  if (heading === null) return null;
  const wouldBe = WOULD_BE_QUALIFIER.test(heading[1] ?? "");
  const after = body.slice(heading.index + heading[0].length);
  const next = NEXT_H2.exec(after);
  return { section: (next === null ? after : after.slice(0, next.index)).trim(), wouldBe };
}

/** Split a UAT section into its numbered items, preserving multi-line continuations. */
function splitItems(section: string): string[] {
  const items: string[] = [];
  let current: string[] | null = null;
  for (const line of section.split("\n")) {
    if (NUMBERED_ITEM.test(line)) {
      if (current !== null) items.push(current.join("\n"));
      current = [line];
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null) items.push(current.join("\n"));
  return items;
}

/** Pull the title from a numbered item: the bold lead (colon stripped), else the first line. */
function itemTitle(item: string): string {
  const firstLine = (item.split("\n")[0] ?? "").replace(/^\d+\.[^\n\S]+/, "").trim();
  const bold = BOLD_LEAD.exec(firstLine);
  const raw = bold !== null ? bold[1]! : firstLine;
  return raw.replace(/:$/, "").trim();
}

/**
 * Pull the declared witness from an item. Absent → `either` (conservative default).
 * An explicit but invalid value (e.g. `(witness: nobody)`) THROWS — the
 * `witness-kind-validated` contract refuses it rather than defaulting.
 */
function itemWitness(item: string, id: string): UatTestWitness {
  const tag = WITNESS_TAG.exec(item);
  if (tag === null) return "either";
  const parsed = UatTestWitness.safeParse(tag[1]!.toLowerCase());
  if (!parsed.success) {
    throw new Error(
      `${id}: invalid witness "${tag[1]}" — must be one of ${UAT_TEST_WITNESSES.join("|")}`,
    );
  }
  return parsed.data;
}

/**
 * Pull the declared `proof-gate` binding from an item. Absent → `undefined` (never inferred — a
 * real machine leg with no annotation is a binding gap the resolver/adopt pass refuses, not a
 * silent default). The captured id is trimmed but otherwise preserved verbatim — EXACTLY as
 * written, never case-normalized (unlike {@link itemWitness}).
 *
 * Two things fail HERE, at the parsing boundary, rather than being silently accepted or dropped:
 * a second `(proof-gate: …)` annotation on the same leg (first-wins would hide the ambiguity), and
 * an id not shaped `story-id#gate-n` (a malformed id passed through verbatim would surface as a
 * confusing lookup miss two layers downstream instead of here).
 */
function itemProofGateId(item: string, id: string): string | undefined {
  const all = item.match(PROOF_GATE_TAG_ALL) ?? [];
  if (all.length > 1) {
    throw new Error(`${id}: duplicate proof-gate annotations — only one is allowed per leg`);
  }
  const tag = PROOF_GATE_TAG.exec(item);
  if (tag === null) return undefined;
  const raw = tag[1]!.trim();
  if (raw.length === 0) return undefined;
  if (!PROOF_GATE_ID_SHAPE.test(raw)) {
    throw new Error(
      `${id}: malformed proof-gate id "${raw}" — expected the shape story-id#gate-n`,
    );
  }
  return raw;
}

/**
 * PURE: parse a story's markdown `body` into addressable UAT test units (ADR-0044
 * d.1). Each numbered item under `## Story UAT` becomes one {@link UatTest} with a
 * positional, stable id (`<story>#uat-<n>`, 1-based) — positional so the same prose
 * always yields the same ids regardless of how the author numbered the list.
 *
 * Backward-compatible: a story with no `## Story UAT` section (or none yet) yields
 * `[]`; an item with no witness annotation defaults to `either`. An explicit but
 * invalid witness value throws. A leg under a `## Story UAT (would-be)` heading is
 * flagged `wouldBe: true` (ADR-0097 — aspirational, not a hard crown obligation).
 */
export function parseUatTests(storyId: string, body: string): UatTest[] {
  const parsed = storyUatSection(body);
  if (parsed === null) return [];
  const items = splitItems(parsed.section);
  return items.map((item, index) => {
    const id = uatTestId(storyId, index + 1);
    const proofGateId = itemProofGateId(item, id);
    return UatTest.parse({
      id,
      title: itemTitle(item),
      witness: itemWitness(item, id),
      wouldBe: parsed.wouldBe,
      ...(proofGateId !== undefined ? { proofGateId } : {}),
    });
  });
}
