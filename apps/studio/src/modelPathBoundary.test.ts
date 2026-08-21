// ADR-0004 / ADR-0090 d.2 boundary guard (capability ui-build-trigger): the studio FRONTEND holds
// NO model-invocation path. The browser bundle (apps/studio/src) must never import the agent (the
// SDK leaf) or the CLI build entry (`nodeBuild`). A static OR dynamic import of either package here
// is the regression this guard fails on.
//
// ADR-0404 STRENGTHENED what this pins rather than weakening it: the frontend's only path to a build
// used to be the /api/build endpoints in api.ts, and those are now retired too — dispatching a build
// is a CLI verb, so the browser bundle has no path to a build AT ALL. This guard still earns its keep
// as the wall against the import ever reappearing.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));

// The forbidden module roots — the model-invocation / build-engine path. `@storytree/orchestrator`
// (the spine) is included because it can reach the agent; the frontend reads build state over the
// API, never the spine. `@storytree/drive` (the build/orchestrate runtime, the new model-path
// carrier after the drive extraction) is forbidden for the same reason — only the server worker
// imports it, lazily. (The browser-safe organisms `@storytree/library/*` / `@storytree/notice-board`
// stay allowed — they are pure zod.)
const FORBIDDEN = ['@storytree/agent', '@storytree/cli', '@storytree/drive', '@storytree/orchestrator'];

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
