// Type declarations for the pure helpers resolve-bash.mjs exports, so a TS test (and `tsc --noEmit`)
// can import them without `allowJs` — the same arrangement as scripts/studio.d.mts. The resolver
// itself stays plain Node ESM (no tsx/deps) by design, because `pnpm gate:bg` must start before any
// toolchain does; this sibling only types the exported surface.

/**
 * The bash this repo's shell scripts must run under: plain `bash` off PATH on non-Windows, and Git
 * Bash's absolute `bash.exe` on Windows — never the WSL launcher, which runs a Linux bash inside
 * the distro against a different node and pnpm.
 *
 * Honours `STORYTREE_BASH` verbatim as an escape hatch. Throws on Windows when no Git Bash can be
 * located, rather than falling back to bare `bash`.
 */
export function resolveRepoBash(): string;

/**
 * Whether `candidate` is one of the WSL launchers (`System32\bash.exe`, `WindowsApps\bash.exe`) —
 * matched on the containing directory, since the filename is legitimately `bash.exe`.
 */
export function isWslBashLauncher(candidate: string): boolean;
