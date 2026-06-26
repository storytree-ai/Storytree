// Type declarations for the pure helpers studio.mjs exports, so a TS test (and `tsc --noEmit`) can
// import them without `allowJs`. The launcher itself stays plain Node ESM (no tsx/deps) by design —
// this sibling only types the exported surface; the implementation lives in studio.mjs.

/** Extract the unique PIDs LISTENING on `port` from Windows `netstat -ano` output. */
export function parseListeningPids(netstatOutput: string, port: number): number[];
