/**
 * The JUDGE-PANEL PACKET BUILDER — the adjudication instrument `anti-slop-adoption-arc` runs when a
 * session wants to REJECT or NARROW a lint rule (ADR-0407 D3, owner-directed 2026-08-21: "if we find
 * something want to push back on i think we just do a panel of llm judges to decide").
 *
 * WHY THIS IS CODE AND NOT A PARAGRAPH IN A RUNBOOK. The arc names four properties a panel must have,
 * and three of them are the difference between an instrument and a ritual:
 *
 *   1. BLIND      — the judges are not told which rule we want rejected, nor what compliance costs.
 *   2. CONTROLLED — at least one rule the panel SHOULD uphold, and where possible one it SHOULD
 *                   reject, are mixed in unlabelled. A panel that upholds everything is not
 *                   adjudicating, it is agreeing, and without a control the two look identical.
 *   3. DIVERSE    — each judge gets a distinct LENS, not a copy of the same prompt.
 *   4. COSTED     — what the panel spent is a finding, because the owner authorised panels on the
 *                   explicit basis that they are normally too expensive to run.
 *
 * A runbook can ask for those. It cannot enforce them, and a session under time pressure that "ran a
 * panel" without a control has produced a number that reads as evidence and is not one. So the three
 * that CAN be mechanised are refusals here: {@link buildPanelPacket} will not emit a packet that has
 * no control, no target, only one specimen, or that names its own rules in the evidence. The fourth
 * (cost) cannot be checked at build time and is carried by the panel record instead.
 *
 * THE ANSWER KEY IS A SEPARATE ARTEFACT, deliberately. {@link renderPacket} never reads `expected` or
 * `role`, so the text handed to a judge cannot carry the answer even by accident; the mapping from
 * label back to rule lives in {@link renderKey} and stays with the operator. The label order is a
 * SEEDED shuffle rather than the spec's authoring order, because a target written first and controls
 * appended after is a tell that survives every other precaution.
 *
 * WHAT THIS MODULE IS NOT. It does not run judges, score them, or decide anything — a panel's verdict
 * is written up by the session that convened it, dissent included (the arc: "a unanimous panel and a
 * 3-2 panel are different evidence and must not be recorded identically"). It also does not sample
 * sites: that is I/O and lives in `lint-panel-sites.ts`, injected, so everything here stays pure and
 * offline-testable.
 */

/** What part a rule plays in the packet. Never rendered into the judges' text. */
export type SpecimenRole = "target" | "control-uphold" | "control-reject";

/** One real piece of code the rule under adjudication rejects. */
export interface PanelSite {
  /** Repo-relative path, so a judge can reason about WHERE in the architecture this sits. */
  readonly file: string;
  /** 1-indexed line of the flagged construct. */
  readonly line: number;
  /** The exact source text the rule flags. */
  readonly flagged: string;
  /** Surrounding source, enough to judge the construct in context. */
  readonly context: string;
}

/** One rule put to the panel, with the real code that backs it. */
export interface PanelSpecimen {
  /**
   * The rule's identity. Used by the ANSWER KEY and by the leak checks — never rendered into the
   * packet. A synthetic control (a rule we authored to test the panel rather than to adopt) carries
   * a `synthetic/` prefix so the record cannot later be misread as a real upstream rule.
   */
  readonly ruleId: string;
  readonly role: SpecimenRole;
  /**
   * The rule's normative claim, stated neutrally and in the rule's own voice. It must argue FOR the
   * rule — a statement hedged toward the answer we want is the leak this whole module exists to
   * prevent, and it is the one leak no refusal below can detect.
   */
  readonly statement: string;
  /** Real code from this repo that the rule rejects. */
  readonly sites: readonly PanelSite[];
  /**
   * CONTROLS ONLY: what a competent panel should answer, and the INDEPENDENT reason we believe that
   * — evidence from outside the panel, never the panel's own output. Kept in the key so a reader can
   * check the control was genuinely calibrated rather than declared after the fact.
   */
  readonly expected?: string;
}

/** One judge's assigned perspective. Diversity is the point: five copies of one prompt is one judge. */
export interface PanelLens {
  readonly id: string;
  /** What this judge is asked to weigh, and what they are asked to set aside. */
  readonly brief: string;
}

/**
 * THE RULE PANEL — "is this rule right for this house?", five lenses.
 *
 * The skeptic seat is not decoration. Four judges asked in good faith whether a well-argued rule
 * written by domain experts is correct will tend to agree with it, and a panel whose composition
 * makes agreement the path of least resistance produces a unanimous verdict that means nothing. One
 * seat is therefore adversarial BY ASSIGNMENT, and the false-positive seat is adversarial in a second
 * direction — these rules are syntactic and type-blind, so a firing is not yet a finding.
 */
export const RULE_PANEL_LENSES: readonly PanelLens[] = [
  {
    id: "rule-merits",
    brief:
      "Judge each rule on its own merits as a matter of TypeScript. Is the claim true? Does the " +
      "construct it rejects actually cause the harm it names, and does the shape it asks for " +
      "actually avoid that harm? Set aside how much code would change — you are judging whether the " +
      "rule is correct, not whether it is convenient.",
  },
  {
    id: "codebase-architecture",
    brief:
      "Judge each rule against the architecture of the codebase the sites are drawn from. Where the " +
      "code resists a rule, decide whether the resistance is PRINCIPLED — the design has a real " +
      "reason the rule cannot see — or merely HABITUAL. Say which, per rule, and name the specific " +
      "sites that made you decide.",
  },
  {
    id: "future-maintainer",
    brief:
      "Judge each rule from the position of someone reading this code in a year with no memory of " +
      "writing it. What does the rule's preferred shape tell them that the current shape does not? " +
      "What does it cost them? A rule that buys nothing at the point of reading is a rule that " +
      "only buys tidiness.",
  },
  {
    id: "skeptic",
    brief:
      "Your seat is ADVERSARIAL BY ASSIGNMENT. For each rule, build the strongest honest case that " +
      "it is WRONG or overreaching, and only then say whether that case actually holds. Do not " +
      "manufacture objections you do not believe — an honest 'I tried and the rule survives' is the " +
      "most useful thing this seat can return.",
  },
  {
    id: "false-positive",
    brief:
      "These rules match the SYNTAX TREE and have no type information. For each rule, work through " +
      "the sites and estimate what share are genuine instances of the harm versus constructs that " +
      "merely look like it. Say which site categories are noise. A rule whose firings are mostly " +
      "noise is a rule that trains people to ignore the linter.",
  },
];

/**
 * THE REFACTOR PANEL — "our code fights this rule; is there a shape that satisfies both?", three
 * lenses. Deliberately smaller, on the owner's direction ("then we do a small panel to figure out if
 * theres a viable refactor that fits and still passes").
 *
 * It convenes ONLY after a rule panel upholds a rule, and its question is narrow. It hunts for a
 * shape; it does not hand out exemptions. "No viable refactor found" is a legitimate result and is
 * the strongest available reason to turn a rule off.
 */
export const REFACTOR_PANEL_LENSES: readonly PanelLens[] = [
  {
    id: "refactor-shape",
    brief:
      "Propose the concrete compliant shape. Write the actual code, not a description of it, for " +
      "the sites shown. If the shape differs by site category, say so and give one per category.",
  },
  {
    id: "functionality-loss",
    brief:
      "Decide whether the compliant shape can do everything the current shape does. Name anything " +
      "that would become impossible, unsound, or only expressible by escaping the type system " +
      "somewhere else. A refactor that moves the problem rather than solving it is a loss, and " +
      "saying so plainly is the most valuable thing this seat returns.",
  },
  {
    id: "boundary-integrity",
    brief:
      "Judge whether the compliant shape keeps the codebase's boundaries honest. Does it push a " +
      "claim to where it can actually be checked, or does it push an unchecked claim across a seam " +
      "and label it checked? Say which, and where.",
  },
];

/** Why a packet was refused. Every one of these is a property the arc requires a panel to have. */
export interface PacketRefusal {
  readonly code:
    | "too-few-specimens"
    | "no-target"
    | "no-control"
    | "empty-specimen"
    | "rule-name-leak"
    | "count-leak";
  readonly message: string;
}

/** A specimen as the judges see it: labelled, shuffled, stripped of role and answer. */
export interface LabelledSpecimen {
  /** "Rule A", "Rule B", … — assigned by the shuffle, carrying no information about role. */
  readonly label: string;
  readonly statement: string;
  readonly sites: readonly PanelSite[];
}

/** One row of the operator-held answer key. */
export interface PanelKeyRow {
  readonly label: string;
  readonly ruleId: string;
  readonly role: SpecimenRole;
  readonly expected?: string;
}

export interface PanelPacket {
  /** Which question this panel answers — the rule panel's, or the refactor panel's. */
  readonly panel: "rule" | "refactor";
  /** Shared, rule-neutral facts about the codebase, so the architecture lens can do its job. */
  readonly codebaseContext: string;
  readonly specimens: readonly LabelledSpecimen[];
  readonly key: readonly PanelKeyRow[];
  readonly lenses: readonly PanelLens[];
}

export type PacketResult =
  | { readonly ok: true; readonly packet: PanelPacket }
  | { readonly ok: false; readonly refusal: PacketRefusal };

export interface BuildPacketOptions {
  readonly panel: "rule" | "refactor";
  readonly codebaseContext: string;
  /** Fixes the label shuffle. The same seed and specimens always produce the same packet. */
  readonly seed: string;
}

const LABEL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Counts stated in prose are the second leak, after the rule's name. "612 sites" tells a judge both
 * that the rule is the expensive one and that we would rather not pay — which is precisely the input
 * the arc forbids the panel from receiving ("Cost is OUR input to the decision, not the panel's").
 * Checked against operator-authored prose only, never against the code excerpts: real source that
 * happens to contain "3 files" in a comment reveals nothing about the rule under adjudication.
 */
const COUNT_PROSE = /\b\d[\d,]*\s+(violations?|sites?|occurrences?|instances?|firings?|files?)\b/i;

/** FNV-1a — a stable string hash, so the shuffle below is reproducible across machines and runs. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** xorshift32 over the seed hash. Deterministic; only needs to be unbiased enough to hide order. */
function seededOrder(count: number, seed: string): number[] {
  let state = hashSeed(seed) || 0x9e3779b9;
  const next = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    const a = order[i];
    const b = order[j];
    if (a === undefined || b === undefined) continue;
    order[i] = b;
    order[j] = a;
  }
  return order;
}

/** Both the qualified id and its bare tail — `anti-slop/no-x` and `no-x` are the same tell. */
function ruleNameForms(ruleId: string): string[] {
  const tail = ruleId.slice(ruleId.lastIndexOf("/") + 1);
  return tail !== ruleId && tail.length > 0 ? [ruleId, tail] : [ruleId];
}

/**
 * Assemble the blind packet, or refuse.
 *
 * The refusals are the instrument. Each one names a way a panel can look like it adjudicated when it
 * did not, and every one of them has to be impossible to reach by accident rather than merely
 * discouraged — that is the whole difference between this and a checklist.
 */
export function buildPanelPacket(
  specimens: readonly PanelSpecimen[],
  options: BuildPacketOptions,
): PacketResult {
  // A one-rule packet cannot be blind however carefully it is worded: the judge knows the single
  // rule in front of them is the one we are asking about, and every calibration property below is
  // vacuous. This is the refusal that does the most work.
  if (specimens.length < 2) {
    return {
      ok: false,
      refusal: {
        code: "too-few-specimens",
        message:
          `a panel packet needs at least 2 rules so the judges cannot tell which one is under ` +
          `adjudication; got ${String(specimens.length)}. Add at least one control.`,
      },
    };
  }

  if (!specimens.some((s) => s.role === "target")) {
    return {
      ok: false,
      refusal: {
        code: "no-target",
        message: "no specimen has role 'target' — the packet adjudicates nothing.",
      },
    };
  }

  const controls = specimens.filter((s) => s.role !== "target");
  if (controls.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "no-control",
        message:
          "no control specimen. A panel with no control cannot be distinguished from a panel that " +
          "agrees with everything put in front of it. Add at least one rule the panel SHOULD " +
          "uphold ('control-uphold') and, where one exists, one it SHOULD reject ('control-reject').",
      },
    };
  }

  const empty = specimens.find((s) => s.sites.length === 0);
  if (empty !== undefined) {
    return {
      ok: false,
      refusal: {
        code: "empty-specimen",
        message:
          `specimen '${empty.ruleId}' carries no sites. The panel judges REAL CODE from this repo, ` +
          `not a rule's description of itself — a specimen with no sites is an opinion poll.`,
      },
    };
  }

  // Every rule's name is a tell for EVERY specimen, not just its own: a judge who spots
  // `no-unsafe-dictionary-type` in Rule C's evidence has learned what Rule C is, which tells them
  // what Rules A and B are not.
  const allNames = specimens.flatMap((s) => ruleNameForms(s.ruleId));
  for (const specimen of specimens) {
    const haystack = [
      specimen.statement,
      ...specimen.sites.flatMap((site) => [site.file, site.flagged, site.context]),
    ].join("\n");
    const leaked = allNames.find((name) => haystack.includes(name));
    if (leaked !== undefined) {
      return {
        ok: false,
        refusal: {
          code: "rule-name-leak",
          message:
            `specimen '${specimen.ruleId}' names the rule '${leaked}' in its statement or evidence, ` +
            `which identifies it to the judges. Reword the statement, or choose a different site.`,
        },
      };
    }
  }

  for (const specimen of specimens) {
    if (COUNT_PROSE.test(specimen.statement)) {
      return {
        ok: false,
        refusal: {
          code: "count-leak",
          message:
            `specimen '${specimen.ruleId}' states a count in its rule statement. How much code a ` +
            `rule touches is OUR input to the decision, not the panel's — a judge told the number ` +
            `is being asked whether we can afford the rule, not whether it is right.`,
        },
      };
    }
  }
  if (COUNT_PROSE.test(options.codebaseContext)) {
    return {
      ok: false,
      refusal: {
        code: "count-leak",
        message:
          "the shared codebase context states a violation count. Describe the architecture, never " +
          "the size of the migration.",
      },
    };
  }

  const order = seededOrder(specimens.length, options.seed);
  const labelled: LabelledSpecimen[] = [];
  const key: PanelKeyRow[] = [];
  order.forEach((specimenIndex, position) => {
    const specimen = specimens[specimenIndex];
    if (specimen === undefined) return;
    const label = `Rule ${LABEL_ALPHABET[position] ?? String(position + 1)}`;
    labelled.push({ label, statement: specimen.statement, sites: specimen.sites });
    key.push({
      label,
      ruleId: specimen.ruleId,
      role: specimen.role,
      ...(specimen.expected !== undefined ? { expected: specimen.expected } : {}),
    });
  });

  return {
    ok: true,
    packet: {
      panel: options.panel,
      codebaseContext: options.codebaseContext,
      specimens: labelled,
      key,
      lenses: options.panel === "rule" ? RULE_PANEL_LENSES : REFACTOR_PANEL_LENSES,
    },
  };
}

const RULE_PANEL_QUESTION =
  "For EACH rule below, decide whether this codebase should adopt it as an enforced error.";

const REFACTOR_PANEL_QUESTION =
  "For EACH rule below, the rule is taken as CORRECT and is not up for debate. Decide whether there " +
  "is a shape this codebase could adopt that satisfies the rule without losing what the current " +
  "shape does.";

/**
 * Render the text handed to a judge. Reads `label`, `statement` and `sites` and nothing else — the
 * role and the expected answer are structurally unreachable from here, which is why they can be kept
 * on the same object without risk.
 */
export function renderPacket(packet: PanelPacket, lens: PanelLens): string {
  const out: string[] = [];
  out.push("# Lint rule adjudication — judge brief");
  out.push("");
  out.push(
    "You are ONE judge on an independent panel. Other judges are reading the same evidence from " +
      "different perspectives; you will not see their answers and they will not see yours. Answer " +
      "from your own seat.",
  );
  out.push("");
  out.push(
    packet.panel === "rule" ? RULE_PANEL_QUESTION : REFACTOR_PANEL_QUESTION,
  );
  out.push("");
  out.push(
    "The rules are shown unlabelled and in no meaningful order. Some of them may be rules this " +
      "codebase should plainly adopt; some may be rules it should plainly refuse. Judge each on the " +
      "evidence.",
  );
  out.push("");
  out.push("## Your seat");
  out.push("");
  out.push(lens.brief);
  out.push("");
  out.push("## About the codebase");
  out.push("");
  out.push(packet.codebaseContext);
  out.push("");

  for (const specimen of packet.specimens) {
    out.push(`## ${specimen.label}`);
    out.push("");
    out.push(`**The rule's claim.** ${specimen.statement}`);
    out.push("");
    out.push("**Real code from this codebase that this rule rejects:**");
    out.push("");
    specimen.sites.forEach((site, index) => {
      out.push(`### ${specimen.label} — site ${String(index + 1)}: \`${site.file}:${String(site.line)}\``);
      out.push("");
      out.push("```ts");
      out.push(site.context);
      out.push("```");
      out.push("");
      out.push(`The rule flags: \`${site.flagged}\``);
      out.push("");
    });
  }

  out.push("## What to return");
  out.push("");
  out.push("For EACH rule, in order, give:");
  out.push("");
  if (packet.panel === "rule") {
    out.push("- **Verdict** — one of `adopt`, `adopt-narrowed`, or `reject`.");
    out.push("- **Confidence** — `high`, `medium`, or `low`.");
    out.push(
      "- **Reasoning** — a short paragraph from YOUR seat's perspective, citing the specific sites " +
        "that moved you.",
    );
    out.push(
      "- **If `adopt-narrowed`** — state the narrowing precisely enough to implement: which " +
        "constructs or positions stay permitted, and why those and not others.",
    );
    out.push("");
    out.push(
      "Do not hedge toward the middle to be safe. A confident `reject` on a rule that deserves it " +
        "is worth more than a qualified `adopt` on everything.",
    );
  } else {
    // The refactor panel is asked a DIFFERENT question, so it must not be handed the rule panel's
    // answers. Offered `adopt`/`reject` it would re-litigate whether the rule is right — which it
    // has been told not to do — and the run would produce a second rule-panel verdict wearing a
    // refactor panel's name.
    out.push(
      "- **Finding** — one of `refactor-found`, `refactor-partial`, or `no-viable-refactor`.",
    );
    out.push("- **Confidence** — `high`, `medium`, or `low`.");
    out.push(
      "- **The shape** — for `refactor-found` or `refactor-partial`, the actual compliant code for " +
        "the sites shown, not a description of it. If it differs by site category, give one per " +
        "category and say which sites fall in each.",
    );
    out.push(
      "- **What it costs** — anything the compliant shape can no longer do, anything it makes " +
        "unsound, and anywhere it moves an unchecked claim rather than removing one.",
    );
    out.push(
      "- **For `refactor-partial`** — say exactly which sites are covered and which are not, and " +
        "why the remainder resists.",
    );
    out.push("");
    out.push(
      "`no-viable-refactor` is a FULL and legitimate answer, not a failure to find one. Say it " +
        "plainly when it is true rather than proposing a shape you would not want to maintain — a " +
        "reported non-existence is more useful than a shape nobody will adopt.",
    );
  }
  return out.join("\n");
}

/** The operator-held answer key. Kept in its own file so it cannot be pasted to a judge by accident. */
export function renderKey(packet: PanelPacket): string {
  const out: string[] = [];
  out.push("# Panel answer key — OPERATOR ONLY, never given to a judge");
  out.push("");
  out.push(`Panel: ${packet.panel}`);
  out.push("");
  for (const row of packet.key) {
    out.push(`## ${row.label} — \`${row.ruleId}\``);
    out.push("");
    out.push(`Role: **${row.role}**`);
    if (row.expected !== undefined) {
      out.push("");
      out.push(`Expected answer, and the independent reason we hold it: ${row.expected}`);
    }
    out.push("");
  }
  out.push("## How to read the controls");
  out.push("");
  out.push(
    "A panel that answers the controls as expected has demonstrated it can discriminate, and its " +
      "verdict on the target is evidence. A panel that misses a control has NOT — record the miss " +
      "and treat the target verdict as unreliable, rather than quietly reporting the part you liked.",
  );
  return out.join("\n");
}
