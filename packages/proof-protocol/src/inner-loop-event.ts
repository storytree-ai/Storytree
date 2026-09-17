import { z } from "zod";

/** Durable, non-proof history for ADR-0563's attempt and landing decisions. */
export const INNER_LOOP_EVENT_KIND = "inner-loop";
const identity = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, "must not be blank");
const difference = z.string().trim().min(1);
export const AttemptDifferenceKind = z.enum([
  "changed-input",
  "fixed-defect",
  "new-observation",
  "revised-test",
]);

const base = { unitId: identity, incrementId: identity, runId: identity };
export const InnerLoopAttemptEvent = z.object({ event: z.literal("attempt"), ...base }).strict();
export const InnerLoopGrantEvent = z
  .object({
    event: z.literal("grant"),
    ...base,
    attempts: z.number().int().positive(),
    kind: AttemptDifferenceKind,
    difference,
  })
  .strict();
export const InnerLoopOwnerGrantEvent = z
  .object({
    event: z.literal("owner-grant"),
    ...base,
    attempts: z.number().int().positive(),
    kind: AttemptDifferenceKind,
    difference,
    authorityQuestionRef: z.string().regex(/^asset:[^\s]+$/),
    authorityDecisionRef: z.string().regex(/^asset:[^\s]+$/),
  })
  .strict();
export const InnerLoopAdjudicationEvent = z
  .object({
    event: z.literal("adjudication"),
    ...base,
    disposition: z.enum([
      "land",
      "land-and-measure",
      "land-and-declare-gap",
      "rework",
      "refuse",
    ]),
    mayRefuse: z.boolean(),
    escalates: z.boolean(),
    reason: difference,
    inadmissible: difference.optional(),
    namedRule: identity.optional(),
  })
  .strict();
export const InnerLoopSignedPassEvent = z
  .object({ event: z.literal("signed-pass"), ...base })
  .strict();
export const InnerLoopEventDoc = z
  .discriminatedUnion("event", [
    InnerLoopAttemptEvent,
    InnerLoopGrantEvent,
    InnerLoopOwnerGrantEvent,
    InnerLoopAdjudicationEvent,
    InnerLoopSignedPassEvent,
  ])
  .superRefine((v, ctx) => {
    if (v.event !== "adjudication") return;
    const expected = {
      land: { mayRefuse: false, escalates: false },
      "land-and-measure": { mayRefuse: false, escalates: false },
      "land-and-declare-gap": { mayRefuse: false, escalates: true },
      rework: { mayRefuse: true, escalates: false },
      refuse: { mayRefuse: true, escalates: false },
    }[v.disposition];
    if (v.mayRefuse !== expected.mayRefuse) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mayRefuse"],
        message: `${v.disposition} requires mayRefuse=${expected.mayRefuse}`,
      });
    }
    if (v.escalates !== expected.escalates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["escalates"],
        message: `${v.disposition} requires escalates=${expected.escalates}`,
      });
    }
    if (v.disposition === "refuse" && v.namedRule === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["namedRule"],
        message: "a refusal must name the standing rule",
      });
    }
    if (v.disposition !== "refuse" && v.namedRule !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["namedRule"],
        message: "only a refusal may name a rule",
      });
    }
  });
export type InnerLoopEventDoc = z.infer<typeof InnerLoopEventDoc>;
