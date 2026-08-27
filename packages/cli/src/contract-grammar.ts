/**
 * The contract-line GRAMMAR — the pure parser + judge behind `pnpm check:contract-grammar`
 * (ADR-0459, realising ADR-0447 D4's one adopted SDD idea).
 *
 * ADR-0447 D4 declined every spec-driven-development tool on the grounds that the story tree is
 * already the stronger spec layer — its `proof:` block's divergence from code makes a red bar, which
 * is the only thing a markdown spec tier never has. What it named as genuinely thin is the CONTRACT
 * LINE: contracts are prose sentences bound to their tests by a naming convention
 * (`describe("<kebab-id>: …")`), and a convention is not a grammar. An agent reading a contract must
 * INFER trigger, system and response, and inference is where slop enters — a vague contract is
 * satisfiable by a vague test, and nothing in the gate can tell, because nothing in the gate can read
 * the sentence.
 *
 * THE GRAMMAR IS TWO FORMS, READ OFF THE CORPUS — NOT EARS's FIVE (ADR-0459 D1). Measured over the
 * 1,234 `asserts` sentences in `stories/**` on 2026-08-27:
 *
 *   ubiquitous  (subject-led)          927   the invocation IS the trigger
 *   triggered   (trigger-clause-led)   307   an explicit precondition opens the sentence
 *   ── the three templates that did NOT earn their place ──
 *   state-driven    (`while`-led)        8
 *   optional-feature(`where`-led)        1
 *   unwanted-behav. (`if`/`unless`-led)  0   — while 673 sentences carry refusal semantics
 *
 * The unwanted-behaviour template has NO population here at all: our authors write a refusal as an
 * ordinary sentence whose RESPONSE is the refusal — "`question new` refuses a missing `--arc`" —
 * which already names all three slots. `while`/`where` are real but tiny, and mechanically they name
 * the same three slots as an event trigger — for this grammar's three consumers (arrange the trigger /
 * quantify its input domain / kill a mutant that breaks the response), arranging a STATE and arranging
 * an EVENT are the same arrange step. So they fold into one {@link TRIGGERED} form.
 *
 * THE INTRODUCER SET IS READ OFF THE CORPUS, NOT OFF THE NOTATION, and that is load-bearing rather
 * than cosmetic: EARS's own four keywords would have redded the majority of our trigger-led contracts.
 * At the lead, `with` (75) and `given` (37) each outrank `when` (27), and GERUND-led triggers
 * ("clicking Build calls …", 96) outnumber `when` + `after` + `on` combined (49).
 *
 * `SHALL` IS NOT ADOPTED — zero occurrences in 1,234 sentences. House style is the third-person
 * present indicative ("returns", "refuses", "renders"). `shall` is a DEONTIC modal: it says what the
 * system OUGHT to do, where a test asserts what it DOES. Importing it would be taking the notation for
 * its own sake, which is the failure ADR-0447 D4 declined the SDD tools to avoid.
 *
 * WHAT THIS JUDGES, AND WHAT IT DELIBERATELY DOES NOT (ADR-0459 D3). Two obligations, each with a
 * real measured population, each independently reportable:
 *   G1 `asserts-missing` — the contract declares no `asserts —` bullet at all (20 of 1,254). With no
 *      sentence there is no input for ANY of the three consumers.
 *   G2 `system-unnamed`  — the contract names its system nowhere mechanically: no `code span` in the
 *      sentence AND no `covers —` bullet (113 of 1,234). Nothing for a test binding, a property's
 *      domain, or a mutant to attach to.
 *
 * The RESPONSE slot is NOT mechanically judged, and that is a refusal rather than a gap. Judging it
 * needs prose clause segmentation, which this corpus has ALREADY measured and refused once: ADR-0262
 * declined a clause-granular coverage denominator because the segmentation is unfaithful ("splitting
 * on `;` reads a four-obligation contract written in comma-and-dash prose as ONE clause"). Rebuilding
 * it here would repeat a refuted move. The three candidate rules that WERE tried and refuted by the
 * same corpus sample are recorded in ADR-0459 D3 so nobody re-invents them.
 *
 * {@link SentenceParse} is the grammar's OUTPUT and gates nothing on its own — the form and the
 * introducer are what a property-test or mutation-expectation author consumes. A rule requiring a
 * TRIGGERED sentence to also name its system in the sentence itself was measured (68 of 307) and
 * REFUSED: its offenders name the system perfectly well in `covers`.
 *
 * Pure: no I/O, no clock, no store. The gathering shell is {@link file://./check-contract-grammar.ts}.
 */

// ---------------------------------------------------------------------------
// The grammar
// ---------------------------------------------------------------------------

/** The two sentence forms the corpus actually uses (ADR-0459 D1). */
export type ContractForm = "triggered" | "ubiquitous";

/** Where a contract names the SYSTEM whose behaviour the sentence describes. */
export type SystemSite = "sentence" | "covers" | "unnamed";

/**
 * The words that open a trigger clause.
 *
 * EARS's own four come FIRST and are kept deliberately — a contributor who writes the notation
 * properly must not be rejected by our narrowing of it. Everything after them is measured at the lead
 * of a real `asserts` sentence in `stories/**` (ADR-0459 D1); `for`/`over`/`against`/`under`/`from`
 * are the prepositional context-setters our authors reach for ("over a corpus of N artifacts, …").
 *
 * ORDER IS IRRELEVANT to matching but the split is kept visible: it is the difference between the
 * notation we adopted from and the house style we adopted TO.
 */
export const TRIGGER_INTRODUCERS: readonly string[] = [
  // EARS's four, so a sentence written in the notation still parses.
  "when",
  "while",
  "where",
  "if",
  // Measured at the lead of this corpus.
  "after",
  "before",
  "given",
  "once",
  "unless",
  "upon",
  "during",
  "on",
  "with",
  "without",
  "over",
  "for",
  "against",
  "under",
  "from",
];

/**
 * Leading punctuation/formatting a sentence may open with before its first word — a backtick opens a
 * code span, so it is excluded from the "first word" scan rather than skipped over: a sentence
 * opening on `` `createRun(unitId)` `` is naming its SUBJECT, never an introducer.
 */
const LEAD = String.raw`^[^\w\x60]*`;

const INTRODUCER_LEAD = new RegExp(`${LEAD}(${TRIGGER_INTRODUCERS.join("|")})\\b`, "i");

/**
 * A GERUND lead — an action standing as the trigger ("clicking Build calls …", "rendering over a
 * corpus produces …"). 96 of the corpus's 307 triggered sentences, so bigger than `when` + `after` +
 * `on` combined and not droppable.
 *
 * Deliberately NOT applied to a capitalised word: a sentence opening on a proper noun or an
 * identifier that happens to end in `-ing` is naming its subject, not its trigger.
 */
const GERUND_LEAD = new RegExp(`${LEAD}[a-z]+ing\\b`);

/** A markdown code span — the machine-readable way this corpus names a system. */
const CODE_SPAN = /`[^`]+`/;

/** What one contract declared, as the obligation parser ({@link parseContracts}) yields it. */
export interface ContractObligations {
  /** The `asserts —` prose, or `undefined` when the contract declares none. */
  readonly asserts: string | undefined;
  /** The `covers —` prose, or `undefined` when the contract declares none. */
  readonly covers: string | undefined;
}

/** The grammar's reading of one contract sentence — the parse the three consumers read. */
export interface SentenceParse {
  readonly form: ContractForm;
  /**
   * The introducer that opened the trigger clause, lowercased; `"«gerund»"` for a gerund-led trigger
   * and `null` under {@link ContractForm} `"ubiquitous"`, where the invocation IS the trigger.
   */
  readonly introducer: string | null;
  readonly system: SystemSite;
}

/** The sentinel {@link SentenceParse.introducer} carries for a gerund-led trigger. */
export const GERUND_INTRODUCER = "«gerund»";

/**
 * PURE: read one contract's obligations as a {@link SentenceParse}.
 *
 * The system is looked for in the SENTENCE first and in `covers` second, because a code span in the
 * sentence names the system at the point the response is claimed, where `covers` names it one bullet
 * away. Both satisfy the obligation; the distinction is preserved so a consumer can tell which it got.
 */
export function parseContractSentence(contract: ContractObligations): SentenceParse {
  // Stryker disable next-line StringLiteral: EQUIVALENT for the mutant generated, stated precisely
  // rather than claimed in general. This default is reached only when `asserts` is absent, and the
  // parse's three outputs are then decided by whether the text leads with an introducer or a gerund
  // and whether it holds a code span. Stryker substitutes the string "Stryker was here!", which leads
  // with a capitalised non-introducer, contains no `-ing` lowercase lead and carries no backticks — so
  // it yields the same `ubiquitous` / `null` / `unnamed` parse "" does, and no assertion can separate
  // them through this function's return type.
  const asserts = contract.asserts ?? "";
  const introducerMatch = INTRODUCER_LEAD.exec(asserts);
  const form: ContractForm =
    introducerMatch !== null || GERUND_LEAD.test(asserts) ? "triggered" : "ubiquitous";
  const introducer =
    introducerMatch !== null
      ? // Stryker disable next-line StringLiteral: EQUIVALENT, by enumeration of the pattern rather
        // than by assertion — INTRODUCER_LEAD has exactly ONE capture group, it is not optional, and
        // no alternation can reach the end of the pattern without entering it. So a non-null `exec`
        // result always carries a string at index 1, and the `??` arm is unreachable at runtime. It
        // exists only because `noUncheckedIndexedAccess` types the index access as possibly
        // undefined; substituting any other string for "" changes nothing observable.
        (introducerMatch[1] ?? "").toLowerCase()
      : form === "triggered"
        ? GERUND_INTRODUCER
        : null;
  const covers = contract.covers ?? "";
  const system: SystemSite = CODE_SPAN.test(asserts)
    ? "sentence"
    : covers.trim().length > 0
      ? "covers"
      : "unnamed";
  return { form, introducer, system };
}

// ---------------------------------------------------------------------------
// The judge
// ---------------------------------------------------------------------------

/** One contract as the working tree declares it, keyed by the spec that holds it. */
export interface DeclaredContract extends ContractObligations {
  /** Repo-relative, POSIX-separated path of the capability spec declaring this contract. */
  readonly specPath: string;
  /** The contract id — the bold code-span lead of its numbered item. */
  readonly id: string;
}

/** Why a contract fails the grammar. */
export type GrammarBreachCode = "asserts-missing" | "system-unnamed";

/** One contract this branch is charged for. */
export interface GrammarBreach {
  readonly specPath: string;
  readonly id: string;
  readonly code: GrammarBreachCode;
  /** One line naming the repair, in the author's terms. */
  readonly remedy: string;
}

/**
 * The measured facts the judge decides from. Every field is gathered by the shell; the judge reaches
 * nothing.
 */
export interface ContractGrammarFacts {
  /**
   * Every contract declared in the WORKING TREE's capability specs. Carried whole rather than
   * pre-filtered: it is the anti-vacuity denominator AND the form census, and a judge handed only the
   * offenders could not tell an empty corpus from a clean one.
   */
  readonly contracts: readonly DeclaredContract[];
  /**
   * The `specPath#id` keys whose `asserts` AND `covers` text are BYTE-IDENTICAL to the base revision.
   * Everything else — a new contract, or one whose sentence this branch edited — is charged.
   *
   * Supplied as the UNCHANGED set rather than the changed one so the shell's failure mode is
   * over-charging (the safe direction) rather than excusing: a `git show` that returns nothing yields
   * an empty set here, which charges everything and is caught by {@link VacuousGrammarSweep} rather
   * than passing silently.
   */
  readonly unchanged: ReadonlySet<string>;
  /** How many capability specs the walk read — the second enumeration, guarded separately. */
  readonly specCount: number;
  /** How many capability specs the BASE revision held. Zero against a populated tree is a blind read. */
  readonly baseSpecCount: number;
  /** The branch under judgement, for the report; `null` on a detached HEAD. */
  readonly branch: string | null;
}

/** The judge's answer. */
export interface ContractGrammarVerdict {
  readonly verdict: "pass" | "fail";
  /** Contracts this branch is charged for, in spec-then-id order. */
  readonly breaches: readonly GrammarBreach[];
  /** How many contracts were CHARGED (new or edited on this branch). */
  readonly charged: number;
  /** How many contracts the working tree declares in total. */
  readonly declared: number;
  /** The form census over every declared contract — the grammar's read of the corpus. */
  readonly triggered: number;
  readonly ubiquitous: number;
  readonly branch: string | null;
}

/**
 * Thrown when an enumeration this check depends on came back empty, so the check cannot answer.
 *
 * A BLIND CHECK is its own outcome, distinct from a breach: a reader must not go looking for contract
 * sentences to repair when what actually broke is a walk, a parse, or a git read. The
 * `WorkspaceFacts.everExisted` posture `check:ownership-totality` records — a probe that cannot be
 * consulted THROWS, it never answers false.
 */
export class VacuousGrammarSweep extends Error {}

/** `specPath#id` — the key the ratchet's unchanged set is expressed in. */
export function contractKey(specPath: string, id: string): string {
  return `${specPath}#${id}`;
}

/**
 * PURE: judge the contract grammar over one branch.
 *
 * THE RATCHET (ADR-0459 D2). Only contracts this branch ADDED, or whose sentence it EDITED, are
 * charged. The existing corpus is not retro-fitted in one sweep — the `anti-slop-adoption-arc`
 * precedent, whose measured lesson was the other half of this: an adopted rule regressed on `main`
 * within a day when no rung held it, so the ratchet is the rung and never the migration.
 *
 * THREE ENUMERATIONS, ALL FATAL WHEN EMPTY, because each can make this check report a cleaner corpus
 * than it is: no capability specs (the walk broke), no contracts at all (the obligation parser broke),
 * and no capability specs at the base against a populated tree (the git read broke, which would charge
 * the whole corpus to one branch).
 */
export function judgeContractGrammar(facts: ContractGrammarFacts): ContractGrammarVerdict {
  if (facts.specCount === 0) {
    throw new VacuousGrammarSweep(
      "the capability-spec walk found no specs under `stories/` — nothing was compared",
    );
  }
  if (facts.contracts.length === 0) {
    throw new VacuousGrammarSweep(
      `no contracts parsed out of ${facts.specCount} capability specs — the \`## Contracts\` parser ` +
        "read nothing, so every spec would look clean",
    );
  }
  if (facts.baseSpecCount === 0) {
    throw new VacuousGrammarSweep(
      `the base revision yielded no capability specs while the working tree holds ${facts.specCount} — ` +
        "the base read failed, and every contract in the corpus would be charged to this branch",
    );
  }

  const breaches: GrammarBreach[] = [];
  let charged = 0;
  let triggered = 0;
  let ubiquitous = 0;

  for (const contract of facts.contracts) {
    const parse = parseContractSentence(contract);
    if (parse.form === "triggered") triggered += 1;
    else ubiquitous += 1;

    if (facts.unchanged.has(contractKey(contract.specPath, contract.id))) continue;
    charged += 1;

    if (contract.asserts === undefined || contract.asserts.trim().length === 0) {
      breaches.push({
        specPath: contract.specPath,
        id: contract.id,
        code: "asserts-missing",
        remedy:
          "add an `- **asserts —** …` bullet: one sentence naming what the system does, and under " +
          "what trigger",
      });
      continue;
    }
    if (parse.system === "unnamed") {
      breaches.push({
        specPath: contract.specPath,
        id: contract.id,
        code: "system-unnamed",
        remedy:
          "name the system mechanically — a `code span` in the asserts sentence, or a " +
          "`- **covers —** …` bullet naming the source it belongs to",
      });
    }
  }

  breaches.sort((a, b) => a.specPath.localeCompare(b.specPath) || a.id.localeCompare(b.id));

  return {
    verdict: breaches.length === 0 ? "pass" : "fail",
    breaches,
    charged,
    declared: facts.contracts.length,
    triggered,
    ubiquitous,
    branch: facts.branch,
  };
}

/** PURE: the operator-facing report. */
export function formatContractGrammar(verdict: ContractGrammarVerdict): string {
  const census =
    `${verdict.declared} contracts declared ` +
    `(${verdict.triggered} triggered / ${verdict.ubiquitous} ubiquitous), ` +
    `${verdict.charged} new or edited on ${verdict.branch ?? "this branch"}`;

  if (verdict.verdict === "pass") {
    return `✓ every contract this branch added or edited names its system and its response — ${census}`;
  }

  const lines = [
    `✗ ${verdict.breaches.length} contract(s) this branch added or edited do not parse — ${census}`,
    "",
  ];
  for (const b of verdict.breaches) {
    lines.push(`  ${b.specPath} — \`${b.id}\` [${b.code}]`);
    lines.push(`      ${b.remedy}`);
  }
  lines.push(
    "",
    "  The contract line is a grammar, not a convention (ADR-0459, realising ADR-0447 D4). One",
    "  sentence, in either form:",
    "    triggered   — <trigger clause>, <system> <response>   e.g. `when the store answers, …`",
    "    ubiquitous  — <system> <response>                     e.g. \"`createRun(unitId)` returns …\"",
    "  Only contracts this branch ADDED or EDITED are charged; the existing corpus is not retro-fitted.",
  );
  return lines.join("\n");
}
