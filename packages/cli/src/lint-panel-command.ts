/**
 * `storytree lint-panel packet` — assemble a blind, controlled judge-panel packet from a spec plus an
 * `oxlint --format=json` report (`anti-slop-adoption-arc`, ADR-0407 D3).
 *
 * THE OUTPUT IS N+1 FILES, and the split is the point. One `brief-<lens>.md` per judge, each carrying
 * the SAME evidence under a DIFFERENT seat, and one `key.md` that never leaves the operator. Handing
 * a judge the key by accident is the failure this shape makes awkward rather than merely forbidden.
 *
 * OFFLINE and read-only against the corpus: disk only, no DB, no `--pg`, no spend. The spend is the
 * judges, and that is the operator's to run and to record.
 *
 * WHY A SPEC FILE rather than flags. A panel's inputs — the neutral rule statements, the controls and
 * the independent reason each control's expected answer is believed — are prose that has to be
 * reviewable and re-runnable months later. Flags would put them in a shell history.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { Envelope } from "./envelope.js";
import {
  buildPanelPacket,
  renderKey,
  renderPacket,
  type PanelSite,
  type PanelSpecimen,
} from "./lint-panel.js";
import {
  isTestFile,
  locationsForRule,
  readDiagnostics,
  readSite,
  sampleSites,
} from "./lint-panel-sites.js";

const siteSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  flagged: z.string().min(1),
  context: z.string().min(1),
});

const specimenSchema = z.object({
  ruleId: z.string().min(1),
  role: z.enum(["target", "control-uphold", "control-reject"]),
  statement: z.string().min(1),
  expected: z.string().min(1).optional(),
  /**
   * `report` samples this rule's real firings out of the oxlint run; `inline` carries sites written
   * into the spec. Inline exists for the two control shapes a live run cannot produce: a rule already
   * driven to zero in source (its sites live in git history) and a SYNTHETIC rule authored to test
   * the panel rather than to adopt, which no linter implements at all.
   */
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("report") }),
    z.object({ kind: z.literal("inline"), sites: z.array(siteSchema).min(1) }),
  ]),
});

const specSchema = z.object({
  panel: z.enum(["rule", "refactor"]),
  seed: z.string().min(1),
  sitesPerSpecimen: z.number().int().positive().default(8),
  contextLines: z.number().int().nonnegative().default(6),
  codebaseContext: z.string().min(1),
  /**
   * Whether report-sampled sites may come from test files. Default FALSE: ADR-0407 D4 puts tests on
   * a laxer bar by owner decision, so a panel shown test sites is being asked a question the house
   * answered separately. The two lanes whose subject genuinely IS the test architecture can opt in.
   */
  includeTests: z.boolean().default(false),
  specimens: z.array(specimenSchema).min(1),
});

export type PanelSpec = z.infer<typeof specSchema>;

/** The disk seam, injected so the command is offline-testable without touching a real tree. */
export interface PanelIo {
  readonly readText: (file: string) => string;
  readonly writeText: (file: string, body: string) => void;
  readonly repoRoot: string;
}

export const nodePanelIo = (repoRoot: string): PanelIo => ({
  readText: (file) => readFileSync(file, "utf8"),
  writeText: (file, body) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body, "utf8");
  },
  repoRoot,
});

export interface PanelPacketArgs {
  readonly spec: string | undefined;
  readonly report: string | undefined;
  readonly out: string | undefined;
}

export function lintPanelHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree lint-panel packet — assemble a blind, controlled judge-panel packet.",
      "",
      "  --spec   <path>  the panel spec (rule statements, roles, controls, codebase context)",
      "  --report <path>  an `oxlint --format=json` report the target's sites are sampled from",
      "  --out    <dir>   where to write one brief per judge, plus the operator-only answer key",
      "",
      "Produce the report with the rules set to `error` in a COPY of oxlint.config.ts and `-c` that",
      "copy. Do NOT use `-A all` with `-D anti-slop/<rule>`: the CLI's -D flags do not enable",
      "JS-plugin rules and that combination reports a near-empty run instead of failing.",
      "",
      "The packet is REFUSED unless it has a target, at least one control, two or more rules, real",
      "sites for every rule, no rule named in its own evidence, and no violation counts in prose.",
      "Those are the properties that make a panel an instrument rather than a ritual; see",
      "`tools/oxlint/panel-procedure.md` for the whole procedure, including what is NOT mechanised.",
    ].join("\n"),
    next: ["storytree lint-panel packet --spec <path> --report <path> --out <dir>"],
  };
}

/** Build the packet and write the briefs. Pure decisions live in `lint-panel.ts`; this is the glue. */
export function lintPanelPacketCommand(args: PanelPacketArgs, io: PanelIo): Envelope {
  if (args.spec === undefined || args.out === undefined) {
    return {
      ok: false,
      body: "lint-panel packet needs --spec <path> and --out <dir>.",
      next: ["storytree lint-panel --help"],
    };
  }

  let spec: PanelSpec;
  try {
    const parsed = specSchema.safeParse(JSON.parse(io.readText(args.spec)));
    if (!parsed.success) {
      return {
        ok: false,
        body: `spec is not a valid panel spec:\n${parsed.error.issues
          .map((i) => `  ${i.path.join(".")}: ${i.message}`)
          .join("\n")}`,
        next: ["storytree lint-panel --help"],
      };
    }
    spec = parsed.data;
  } catch (err) {
    return {
      ok: false,
      body: `could not read spec '${args.spec}': ${(err as Error).message}`,
      next: ["storytree lint-panel --help"],
    };
  }

  const needsReport = spec.specimens.some((s) => s.source.kind === "report");
  let diagnostics: ReturnType<typeof readDiagnostics> = [];
  if (needsReport) {
    if (args.report === undefined) {
      return {
        ok: false,
        body:
          "this spec samples sites from an oxlint report, so --report <path> is required.\n" +
          "A specimen may instead carry inline sites; see `storytree lint-panel --help`.",
        next: ["storytree lint-panel --help"],
      };
    }
    try {
      diagnostics = readDiagnostics(io.readText(args.report));
    } catch (err) {
      return {
        ok: false,
        body: `could not read report '${args.report}': ${(err as Error).message}`,
        next: ["storytree lint-panel --help"],
      };
    }
  }

  const specimens: PanelSpecimen[] = [];
  for (const declared of spec.specimens) {
    let sites: PanelSite[];
    if (declared.source.kind === "inline") {
      sites = [...declared.source.sites];
    } else {
      const all = locationsForRule(diagnostics, declared.ruleId);
      const locations = spec.includeTests ? all : all.filter((l) => !isTestFile(l.file));
      if (locations.length === 0) {
        return {
          ok: false,
          body:
            `the report contains no findings for '${declared.ruleId}'.\n` +
            `A rule set to "off" in the config it was run under reports nothing — set the rules to ` +
            `"error" in a copy of oxlint.config.ts and run with -c that copy.`,
          next: ["storytree lint-panel --help"],
        };
      }
      const chosen = sampleSites(locations, {
        limit: spec.sitesPerSpecimen,
        contextLines: spec.contextLines,
      });
      try {
        sites = chosen.map((location) => readSite(io.repoRoot, location, spec.contextLines));
      } catch (err) {
        return {
          ok: false,
          body: `could not read a sampled site for '${declared.ruleId}': ${(err as Error).message}`,
          next: ["storytree lint-panel --help"],
        };
      }
    }
    const specimen: Omit<PanelSpecimen, "expected"> = {
      ruleId: declared.ruleId,
      role: declared.role,
      statement: declared.statement,
      sites,
    };
    specimens.push(
      declared.expected !== undefined ? { ...specimen, expected: declared.expected } : specimen,
    );
  }

  const built = buildPanelPacket(specimens, {
    panel: spec.panel,
    codebaseContext: spec.codebaseContext,
    seed: spec.seed,
  });
  if (!built.ok) {
    return {
      ok: false,
      body: `packet REFUSED (${built.refusal.code}): ${built.refusal.message}`,
      next: ["storytree lint-panel --help"],
    };
  }

  const packet = built.packet;
  const written: string[] = [];
  for (const lens of packet.lenses) {
    const file = path.join(args.out, `brief-${lens.id}.md`);
    io.writeText(file, renderPacket(packet, lens));
    written.push(file);
  }
  const keyFile = path.join(args.out, "key.md");
  io.writeText(keyFile, renderKey(packet));

  const roles = packet.key.map((row) => `${row.label} = ${row.role}`).join(", ");
  return {
    ok: true,
    body: [
      `panel packet built — ${String(packet.specimens.length)} rules, ${String(packet.lenses.length)} judges.`,
      "",
      ...written.map((f) => `  brief  ${f}`),
      `  KEY    ${keyFile}   (operator only — do not give this to a judge)`,
      "",
      `labels: ${roles}`,
      "",
      "Run each brief as an INDEPENDENT judge with no shared context, then write the panel record:",
      "verdicts per judge, the controls' outcome, the dissent, and what the panel cost.",
    ].join("\n"),
    next: ["storytree lint-panel --help"],
  };
}
