import { z } from "zod";
import {
  CriterionId,
  CriterionRevisionId,
  criterionRevisionId as bindCriterionRevision,
} from "@storytree/proof-protocol";

export { criterionRevisionId } from "@storytree/proof-protocol";

export const UAT_TEST_CRITERION_WITNESSES = ["human", "machine", "either"] as const;
export const UatTestCriterionWitness = z.enum(UAT_TEST_CRITERION_WITNESSES);
export type UatTestCriterionWitness = z.infer<typeof UatTestCriterionWitness>;

export const CriterionLineage = z
  .object({
    kind: z.enum(["split-from", "merged-from", "replaces"]),
    criterionIds: z.array(CriterionId).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind !== "merged-from" && value.criterionIds.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criterionIds"],
        message: `${value.kind} lineage names exactly one source criterion`,
      });
    }
    if (new Set(value.criterionIds).size !== value.criterionIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criterionIds"],
        message: "lineage source criterion ids must be unique",
      });
    }
  });
export type CriterionLineage = z.infer<typeof CriterionLineage>;

/** One current, authored UAT criterion (ADR-0253). */
export const UatTestCriterion = z
  .object({
    criterionId: CriterionId,
    revisionId: CriterionRevisionId,
    previousRevisionId: CriterionRevisionId.optional(),
    lineage: CriterionLineage.optional(),
    title: z.string().min(1),
    witness: UatTestCriterionWitness.default("either"),
    wouldBe: z.boolean().default(false),
    proofGateId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.previousRevisionId === value.revisionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousRevisionId"],
        message: "previousRevisionId must name the preceding revision, not the current one",
      });
    }
    if (value.lineage?.criterionIds.includes(value.criterionId) === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lineage"],
        message: "lineage must name a different criterion identity",
      });
    }
  });
export type UatTestCriterion = z.infer<typeof UatTestCriterion>;

/** Migration-only positional key constructor. Never a current proof identity. */
export function legacyUatTestId(storyId: string, ordinal: number): string {
  return `${storyId}#uat-${ordinal}`;
}

/** @deprecated ADR-0253: use authored criterionId for current work. */
export const uatTestCriterionId = legacyUatTestId;

const STORY_UAT_HEADING = /^##[^\n\S]+(?:UAT Test Criteria|Story UAT)([^\n]*)$/im;
const WOULD_BE_QUALIFIER = /\(would-be\)/i;
const NEXT_H2 = /^## /m;
const NUMBERED_ITEM = /^\d+\.[^\n\S]+(.*)$/;
const BOLD_LEAD = /^\*\*(.+?)\*\*/;
const WITNESS_TAG = /\(witness:\s*([A-Za-z]+)\)/i;
const PROOF_GATE_TAG = /\(proof-gate:\s*([^)]+)\)/i;
const PROOF_GATE_TAG_ALL = /\(proof-gate:\s*[^)]+\)/gi;
const PROOF_GATE_ID_SHAPE = /^\S+#gate-\d+$/i;
const CRITERION_ID_TAG = /\(criterion-id:\s*([^)]*)\)/i;
const REVISION_ID_TAG = /\(revision-id:\s*([^)]*)\)/i;
const PREVIOUS_REVISION_ID_TAG = /\(previous-revision-id:\s*([^)]*)\)/i;
const LINEAGE_TAG = /\(lineage:\s*(split-from|merged-from|replaces)\s+([^)]*)\)/i;
const IDENTITY_METADATA_TAG = /_?\((?:criterion-id|revision-id|previous-revision-id|lineage):[^)]*\)_?/gi;

function storyUatSection(body: string): { section: string; wouldBe: boolean } | null {
  const heading = STORY_UAT_HEADING.exec(body);
  if (heading === null) return null;
  const wouldBe = WOULD_BE_QUALIFIER.test(heading[1] ?? "");
  const after = body.slice(heading.index + heading[0].length);
  const next = NEXT_H2.exec(after);
  return { section: (next === null ? after : after.slice(0, next.index)).trim(), wouldBe };
}

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

function itemTitle(item: string): string {
  const firstLine = (item.split("\n")[0] ?? "").replace(/^\d+\.[^\n\S]+/, "").trim();
  const bold = BOLD_LEAD.exec(firstLine);
  const raw = bold !== null ? bold[1]! : firstLine;
  return raw.replace(/:$/, "").trim();
}

function itemWitness(item: string, id: string): UatTestCriterionWitness {
  const tag = WITNESS_TAG.exec(item);
  if (tag === null) return "either";
  const parsed = UatTestCriterionWitness.safeParse(tag[1]!.toLowerCase());
  if (!parsed.success) {
    throw new Error(
      `${id}: invalid witness "${tag[1]}" — must be one of ${UAT_TEST_CRITERION_WITNESSES.join("|")}`,
    );
  }
  return parsed.data;
}

function itemProofGateId(item: string, id: string): string | undefined {
  const all = item.match(PROOF_GATE_TAG_ALL) ?? [];
  if (all.length > 1) throw new Error(`${id}: duplicate proof-gate annotations — only one is allowed per leg`);
  const tag = PROOF_GATE_TAG.exec(item);
  if (tag === null) return undefined;
  const raw = tag[1]!.trim();
  if (!PROOF_GATE_ID_SHAPE.test(raw)) {
    throw new Error(`${id}: malformed proof-gate id "${raw}" — expected the shape story-id#gate-n`);
  }
  return raw;
}

function allMatches(item: string, pattern: RegExp): RegExpExecArray[] {
  return [...item.matchAll(new RegExp(pattern.source, pattern.flags.includes("i") ? "gi" : "g"))];
}

function oneTag(item: string, pattern: RegExp, label: string): RegExpExecArray {
  const matches = allMatches(item, pattern);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one (${label}: ...) annotation, found ${matches.length}`);
  }
  return matches[0]!;
}

function itemCriterionId(item: string): string {
  const parsed = CriterionId.safeParse(oneTag(item, CRITERION_ID_TAG, "criterion-id")[1]?.trim());
  if (!parsed.success) throw new Error(`criterion-id: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  return parsed.data;
}

function itemRevisionId(item: string): string {
  const parsed = CriterionRevisionId.safeParse(oneTag(item, REVISION_ID_TAG, "revision-id")[1]?.trim());
  if (!parsed.success) throw new Error(`revision-id: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  return parsed.data;
}

function itemPreviousRevisionId(item: string): string | undefined {
  const matches = allMatches(item, PREVIOUS_REVISION_ID_TAG);
  if (matches.length > 1) throw new Error("duplicate previous-revision-id annotations");
  if (matches.length === 0) return undefined;
  const parsed = CriterionRevisionId.safeParse(matches[0]?.[1]?.trim());
  if (!parsed.success) throw new Error(`previous-revision-id: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  return parsed.data;
}

function itemLineage(item: string): CriterionLineage | undefined {
  const matches = allMatches(item, LINEAGE_TAG);
  if (matches.length > 1) throw new Error("duplicate lineage annotations");
  if (matches.length === 0) return undefined;
  const criterionIds = (matches[0]?.[2] ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return CriterionLineage.parse({ kind: matches[0]?.[1]?.toLowerCase(), criterionIds });
}

/** Canonical content excludes list position and identity/history annotations only. */
export function canonicalUatCriterionContent(item: string): string {
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
 * One parsed criterion PLUS the raw prose item it was parsed from — the journey text itself
 * (ADR-0294: a criterion is a step in a narratable journey). {@link UatTestCriterion} keeps only the
 * bold-lead `title`, which is a label rather than a walkthrough, so a consumer that must EXECUTE the
 * journey — the model-driven UAT driver (ADR-0295 D1 / ADR-0348 D5) — needs the item verbatim.
 *
 * `source` is the item exactly as authored, identity annotations and list number included; the
 * driver hands it to the model unedited so the claim being tested stays human-authored (ADR-0295's
 * own stated mitigation for a driver that would otherwise author and judge its own assertions).
 */
export interface UatTestCriterionSource {
  readonly criterion: UatTestCriterion;
  readonly source: string;
}

/**
 * Parse current UAT criteria, keeping each one's raw prose item beside it. The single parse path —
 * {@link parseUatTestCriteria} is this with the sources dropped — so a consumer reading the journey
 * text can never fork from the reader that decides identity, witness and binding.
 */
export function parseUatTestCriterionSources(
  storyId: string,
  body: string,
): UatTestCriterionSource[] {
  const parsed = storyUatSection(body);
  if (parsed === null) return [];
  const sources = splitItems(parsed.section).map((item) => {
    const criterionId = itemCriterionId(item);
    const revisionId = itemRevisionId(item);
    const expectedRevisionId = bindCriterionRevision(canonicalUatCriterionContent(item));
    if (revisionId !== expectedRevisionId) {
      throw new Error(
        `${criterionId}: revision-id ${revisionId} does not bind current content (expected ${expectedRevisionId})`,
      );
    }
    const previousRevisionId = itemPreviousRevisionId(item);
    const lineage = itemLineage(item);
    const proofGateId = itemProofGateId(item, criterionId);
    const criterion = UatTestCriterion.parse({
      criterionId,
      revisionId,
      ...(previousRevisionId !== undefined ? { previousRevisionId } : {}),
      ...(lineage !== undefined ? { lineage } : {}),
      title: itemTitle(item),
      witness: itemWitness(item, criterionId),
      wouldBe: parsed.wouldBe,
      ...(proofGateId !== undefined ? { proofGateId } : {}),
    });
    return { criterion, source: item };
  });

  const seen = new Set<string>();
  for (const { criterion } of sources) {
    if (seen.has(criterion.criterionId)) {
      throw new Error(`${storyId}: duplicate criterion-id ${criterion.criterionId}`);
    }
    seen.add(criterion.criterionId);
  }
  return sources;
}

/** Parse current UAT criteria. Missing/positional identity is refused. */
export function parseUatTestCriteria(storyId: string, body: string): UatTestCriterion[] {
  return parseUatTestCriterionSources(storyId, body).map((s) => s.criterion);
}
