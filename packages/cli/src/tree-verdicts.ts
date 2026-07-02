// Back-compat shim (the ADR-0112 pattern): the verdict-glyph derivation moved to
// `@storytree/drive` with `treeCommand`. The registered REAL proof
// (`packages/cli/src/tree-verdicts.test.ts`) keeps proving the same module through this shim.
export {
  deriveVerdictGlyphs,
  glyphFor,
  readVerdictGlyphs,
  readVerdictEvents,
} from "@storytree/drive";
export type { VerdictGlyph, VerdictReaderLike } from "@storytree/drive";
