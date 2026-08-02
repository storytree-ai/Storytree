import { z } from "zod";
import {
  CriterionId,
  CriterionRevisionId,
  criterionRevisionId,
} from "@storytree/proof-protocol";

/**
 * The `three-kind-witness` capability (ADR-0209 D1/D8): a UAT criterion's `witness`
 * classifies as one of THREE distinct kinds — `machine`, `model`, `human` — or remains
 * the legacy pre-migration UNRESOLVED state `either`. Pure, no I/O — a parser + zod
 * validator, mirroring `@storytree/library`'s `uat-test-criteria.ts` id scheme and
 * prose-parsing shape, but with `model` as a genuinely new, distinct kind (never a
 * spelling of `machine`) and without defaulting an untagged legacy criterion into it.
 */

// ---------------------------------------------------------------------------
// Witness kinds
// ---------------------------------------------------------------------------

/**
 * The three CLASSIFIED witness kinds (ADR-0209 D1): who/what may attest a criterion
 * once it has been explicitly classified. `either` is deliberately excluded — it is
 * the legacy UNRESOLVED state, never a classified kind.
 */
export const CLASSIFIED_WITNESSES = ["machine", "model", "human"] as const;
export const ClassifiedWitness = z.enum(CLASSIFIED_WITNESSES);
export type ClassifiedWitness = z.infer<typeof ClassifiedWitness>;

/**
 * The full parseable witness set: the three classified kinds plus the legacy
 * unresolved `either` state (ADR-0209 D8) — the shape a `Criterion.witness` field
 * accepts.
 */
export const CRITERION_WITNESSES = ["machine", "model", "human", "either"] as const;
export const CriterionWitness = z.enum(CRITERION_WITNESSES);
export type CriterionWitness = z.infer<typeof CriterionWitness>;

/** True when `witness` is one of the three classified kinds (never `either`). */
export function isClassifiedWitness(witness: CriterionWitness): witness is ClassifiedWitness {
  return (CLASSIFIED_WITNESSES as readonly string[]).includes(witness);
}

/** True when `witness` is the legacy pre-migration unresolved state. */
export function isLegacyUnresolved(witness: CriterionWitness): witness is "either" {
  return witness === "either";
}

// ---------------------------------------------------------------------------
// Model capability tier (ADR-0209 D2)
// ---------------------------------------------------------------------------

/**
 * The two ORDERED minimum capability tiers a `model` witness may declare
 * (ADR-0209 D2): `advanced` (a registered Opus-class or approved-equivalent
 * judge) < `frontier` (Fable today). `advanced` is a hard floor — nothing
 * below it may judge UAT. This capability owns only the field, its allowed
 * values, and the refusals below; the ordering ("at least this tier",
 * substitute-upward) comparison lives in `model-eligibility-registry`.
 */
export const TIER_LEVELS = ["advanced", "frontier"] as const;
export const Tier = z.enum(TIER_LEVELS);
export type Tier = z.infer<typeof Tier>;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * One addressable UAT criterion. `criterionId` is the authored opaque join key;
 * `witness` classifies who/what may attest it. Strict: unknown fields rejected.
 *
 * `witness` defaults to `either` — the conservative legacy default (ADR-0209 D8): an
 * omitted/untagged witness never defaults into `model` (or any classified kind); it
 * stays visibly unresolved until an explicit migration tags it.
 *
 * `tier` (ADR-0209 D2) is meaningful only on a classified `model` witness: a
 * `model` criterion MUST declare a preclassified minimum tier (`advanced` or
 * `frontier`) — an omitted or unrecognised tier is refused, never defaulted or
 * clamped up — and a non-`model` witness (`machine`/`human`/legacy `either`)
 * carrying a tier is refused, since tier is exclusive to `model`.
 */
export const Criterion = z
  .object({
    /** Authored opaque identity and exact immutable content revision (ADR-0253). */
    criterionId: CriterionId,
    revisionId: CriterionRevisionId,
    previousRevisionId: CriterionRevisionId.optional(),
    /** Human-readable title (the prose item's bold lead). */
    title: z.string().min(1),
    /** Who/what may attest this criterion. */
    witness: CriterionWitness.default("either"),
    /** Preclassified minimum capability tier — `model` witness only. */
    tier: Tier.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.previousRevisionId === val.revisionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousRevisionId"],
        message: "previousRevisionId must name the preceding revision",
      });
    }
    if (val.witness === "model") {
      if (val.tier === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tier"],
          message:
            "a model witness must declare a preclassified minimum tier (advanced|frontier) — an ambiguous minimum is forbidden",
        });
      }
    } else if (val.tier !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tier"],
        message: "tier is exclusive to the model witness",
      });
    }
  });

export type Criterion = z.infer<typeof Criterion>;

// ---------------------------------------------------------------------------
// Id scheme
// ---------------------------------------------------------------------------

/** Migration-only positional key. Never a current criterion identity. */
export function legacyCriterionId(storyId: string, ordinal: number): string {
  return `${storyId}#uat-${ordinal}`;
}

// ---------------------------------------------------------------------------
// Prose parser
// ---------------------------------------------------------------------------

const STORY_UAT_HEADING = /^##[^\n\S]+(?:UAT Test Criteria|Story UAT)([^\n]*)$/im;
const NEXT_H2 = /^## /m;
const NUMBERED_ITEM = /^\d+\.[^\n\S]+(.*)$/;
const BOLD_LEAD = /^\*\*(.+?)\*\*/;
/**
 * Optional inline witness annotation, e.g. `(witness: model)`. Captures the raw value
 * loosely so an explicit-but-invalid value can be REFUSED (not silently defaulted).
 */
const WITNESS_TAG = /\(witness:\s*([A-Za-z]+)\)/i;
/**
 * Optional inline tier annotation, e.g. `(tier: advanced)` (ADR-0209 D2). Captures
 * the raw value loosely so an explicit-but-invalid value can be REFUSED (not
 * silently defaulted or clamped up).
 */
const TIER_TAG = /\(tier:\s*([A-Za-z]+)\)/i;
const CRITERION_ID_TAG = /\(criterion-id:\s*([^)]*)\)/i;
const REVISION_ID_TAG = /\(revision-id:\s*([^)]*)\)/i;
const PREVIOUS_REVISION_ID_TAG = /\(previous-revision-id:\s*([^)]*)\)/i;
const IDENTITY_METADATA_TAG = /_?\((?:criterion-id|revision-id|previous-revision-id|lineage):[^)]*\)_?/gi;

/** Extract the `## UAT Test Criteria` section (between its heading and the next `##`). `null` when absent. */
function criteriaSection(body: string): string | null {
  const heading = STORY_UAT_HEADING.exec(body);
  if (heading === null) return null;
  const after = body.slice(heading.index + heading[0].length);
  const next = NEXT_H2.exec(after);
  return (next === null ? after : after.slice(0, next.index)).trim();
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
 * Pull the declared witness from an item. Absent → `either` (conservative legacy
 * default, ADR-0209 D8 — never `model`). An explicit but invalid value (e.g.
 * `(witness: nobody)`) THROWS, refused rather than defaulted.
 */
function itemWitness(item: string, id: string): CriterionWitness {
  const tag = WITNESS_TAG.exec(item);
  if (tag === null) return "either";
  const parsed = CriterionWitness.safeParse(tag[1]!.toLowerCase());
  if (!parsed.success) {
    throw new Error(
      `${id}: invalid witness "${tag[1]}" — must be one of ${CRITERION_WITNESSES.join("|")}`,
    );
  }
  return parsed.data;
}

/**
 * Pull the declared tier from an item (ADR-0209 D2). Absent → `undefined` (the
 * schema refinement decides whether that's acceptable — required on `model`,
 * forbidden elsewhere). An explicit but invalid value (e.g. `(tier: basic)`)
 * THROWS, refused rather than defaulted or clamped up.
 */
function itemTier(item: string, id: string): Tier | undefined {
  const tag = TIER_TAG.exec(item);
  if (tag === null) return undefined;
  const parsed = Tier.safeParse(tag[1]!.toLowerCase());
  if (!parsed.success) {
    throw new Error(`${id}: invalid tier "${tag[1]}" — must be one of ${TIER_LEVELS.join("|")}`);
  }
  return parsed.data;
}

function oneIdentityTag(item: string, pattern: RegExp, label: string): string {
  const matches = [...item.matchAll(new RegExp(pattern.source, "gi"))];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one (${label}: ...) annotation, found ${matches.length}`);
  }
  return matches[0]?.[1]?.trim() ?? "";
}

function itemCriterionId(item: string): string {
  return CriterionId.parse(oneIdentityTag(item, CRITERION_ID_TAG, "criterion-id"));
}

function itemRevisionId(item: string): string {
  return CriterionRevisionId.parse(oneIdentityTag(item, REVISION_ID_TAG, "revision-id"));
}

function itemPreviousRevisionId(item: string): string | undefined {
  const matches = [...item.matchAll(new RegExp(PREVIOUS_REVISION_ID_TAG.source, "gi"))];
  if (matches.length > 1) throw new Error("duplicate previous-revision-id annotations");
  if (matches.length === 0) return undefined;
  return CriterionRevisionId.parse(matches[0]?.[1]?.trim());
}

/** Canonical content matches the disk-canonical Library parser: position and identity history excluded. */
export function canonicalCriterionContent(item: string): string {
  return item
    .replace(/^\d+\.[^\n\S]+/, "")
    .replace(IDENTITY_METADATA_TAG, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * PURE: parse a story's markdown `body` into addressable {@link Criterion} units.
 * Each numbered item under `## UAT Test Criteria` becomes one criterion with its
 * authored opaque identity and content-bound revision. A story with no such section
 * yields `[]`; an item with no witness annotation defaults to `either`; an explicit
 * but invalid witness value throws at the parsing boundary. A `model` witness must
 * also carry a `(tier: advanced|frontier)` annotation (ADR-0209 D2) — missing,
 * unrecognised, or misplaced (on a non-`model` witness) tiers are refused, never
 * defaulted or clamped up.
 */
export function parseCriteria(storyId: string, body: string): Criterion[] {
  const section = criteriaSection(body);
  if (section === null) return [];
  const items = splitItems(section);
  const criteria = items.map((item) => {
    const criterionId = itemCriterionId(item);
    const revisionId = itemRevisionId(item);
    const expectedRevisionId = criterionRevisionId(canonicalCriterionContent(item));
    if (revisionId !== expectedRevisionId) {
      throw new Error(
        `${criterionId}: revision-id ${revisionId} does not bind current content (expected ${expectedRevisionId})`,
      );
    }
    const previousRevisionId = itemPreviousRevisionId(item);
    return Criterion.parse({
      criterionId,
      revisionId,
      ...(previousRevisionId !== undefined ? { previousRevisionId } : {}),
      title: itemTitle(item),
      witness: itemWitness(item, criterionId),
      tier: itemTier(item, criterionId),
    });
  });
  const seen = new Set<string>();
  for (const criterion of criteria) {
    if (seen.has(criterion.criterionId)) {
      throw new Error(`${storyId}: duplicate criterion-id ${criterion.criterionId}`);
    }
    seen.add(criterion.criterionId);
  }
  return criteria;
}
