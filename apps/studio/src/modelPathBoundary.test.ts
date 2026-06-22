// ADR-0004 / ADR-0090 d.2 boundary guard (capability ui-build-trigger): the studio FRONTEND holds
// NO model-invocation path. The browser bundle (apps/studio/src) must never import the agent (the
// SDK leaf) or the CLI build entry (`nodeBuild`) — its ONLY path to a build is the /api/build
// endpoints (api.ts). A build runs exclusively in the server/worker process; the worker is the
// single orchestrator boundary. A static OR dynamic import of either package here is the regression
// this guard fails on.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));

// The forbidden module roots — the model-invocation / build-engine path. `@storytree/orchestrator`
// (the spine) is included because it can reach the agent; the frontend reads build state over the
// API, never the spine. (The browser-safe organisms `@storytree/library/*` / `@storytree/notice-board`
// stay allowed — they are pure zod.)
const FORBIDDEN = ['@storytree/agent', '@storytree/cli', '@storytree/orchestrator'];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...tsFiles(full));
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(full);
  }
  return out;
}

describe('studio frontend model-path boundary (ADR-0004)', () => {
  it('apps/studio/src imports no agent / cli / orchestrator (static or dynamic)', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(SRC_DIR)) {
      if (file === fileURLToPath(import.meta.url)) continue; // this guard names the packages itself
      const text = readFileSync(file, 'utf8');
      for (const mod of FORBIDDEN) {
        // `from '<mod>'` / `from '<mod>/...'` (static) and `import('<mod>...')` (dynamic).
        const re = new RegExp(`(from\\s*['"]${mod}(/[^'"]*)?['"]|import\\(\\s*['"]${mod}(/[^'"]*)?['"])`);
        if (re.test(text)) offenders.push(`${path.relative(SRC_DIR, file)} → ${mod}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
