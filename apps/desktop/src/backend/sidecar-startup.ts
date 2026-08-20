// Sidecar startup diagnostics for the Electron main process.
//
// The child may fail before its port handshake (for example, because launch preconditions refuse it).
// These helpers preserve the actionable stderr tail for the refusal screen in electron/main.ts.

/**
 * The last `maxLines` non-blank lines of `text`, trimmed — the tail of a child's captured stderr.
 * Returns `""` when there is nothing to show, so the caller can omit the section entirely.
 */
export function tailText(text: string, maxLines: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "";
  return lines.slice(-Math.max(1, maxLines)).join("\n");
}

/**
 * Format the sidecar-exit rejection message main.ts surfaces. Includes the exit code (or the killing
 * signal) AND the captured stderr tail so the `[main]` line names the REAL cause — an
 * `ERR_MODULE_NOT_FOUND`, a Postgres auth error — instead of only "exited (code 1)".
 */
export function describeSidecarExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrTail: string,
): string {
  const how =
    code !== null ? `code ${code}` : signal !== null ? `signal ${signal}` : "code null";
  const base = `backend sidecar exited (${how}) before reporting a port`;
  return stderrTail.length > 0 ? `${base} — last stderr:\n${stderrTail}` : base;
}

/**
 * Format an UNEXPECTED exit after the sidecar already reported its port. This is a different lifecycle
 * failure from startup: the Electron window may still be healthy, but every local API operation has
 * stopped. Main uses this text for the in-window refusal page and offers Retry, which starts a new
 * sidecar and retargets the existing loopback proxy.
 */
export function describeRunningSidecarExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrTail: string,
): string {
  const how =
    code !== null ? `code ${code}` : signal !== null ? `signal ${signal}` : "code null";
  const base =
    `backend sidecar exited (${how}) after startup — local operations have stopped; Retry starts a fresh sidecar`;
  return stderrTail.length > 0 ? `${base} — last stderr:\n${stderrTail}` : base;
}
