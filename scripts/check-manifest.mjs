// Repo-surface allow-list gate (the `repo-surface-allowlist` Library guardrail).
//
//   node scripts/check-manifest.mjs   ·   pnpm check:manifest
//
// Refuses any TRACKED top-level root entry, or any standalone doc under docs/,
// that is not listed in repo-manifest.json. Adding a new root file/dir or a new
// loose doc therefore requires a deliberate manifest entry WITH a justification
// first — the friction that blocks temp/ad-hoc junk at root and keeps durable
// knowledge in the Library rather than in scattered prose docs.
//
// It reads the git INDEX (`git ls-files`), so only things that would actually be
// merged are checked; untracked scratch and node_modules are ignored by design.
// Plain Node ESM (no tsx/deps) so it runs anywhere the gate runs.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'repo-manifest.json'), 'utf8'));

const rootFiles = new Set(Object.keys(manifest.root.files));
const rootDirs = new Set(Object.keys(manifest.root.dirs));
const docsDirs = new Set(Object.keys(manifest.docs.allowedDirs));
const docsFiles = new Set(Object.keys(manifest.docs.files));

const tracked = execFileSync('git', ['-C', repoRoot, 'ls-files'], { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

// Unlisted offenders (deduped), and which manifest entries were actually present.
const unlisted = { rootFile: new Set(), rootDir: new Set(), docsFile: new Set(), docsDir: new Set() };
const seen = { rootFile: new Set(), rootDir: new Set(), docsFile: new Set(), docsDir: new Set() };

for (const p of tracked) {
  const parts = p.split('/');
  const top = parts[0];

  // ---- repo-root surface ----
  if (parts.length === 1) {
    seen.rootFile.add(top);
    if (!rootFiles.has(top)) unlisted.rootFile.add(top);
  } else {
    seen.rootDir.add(top);
    if (!rootDirs.has(top)) unlisted.rootDir.add(top);
  }

  // ---- docs/ surface ----
  if (top === 'docs' && parts.length >= 2) {
    if (parts.length === 2) {
      seen.docsFile.add(parts[1]);
      if (!docsFiles.has(parts[1])) unlisted.docsFile.add(parts[1]);
    } else {
      seen.docsDir.add(parts[1]);
      if (!docsDirs.has(parts[1])) unlisted.docsDir.add(parts[1]);
    }
  }
}

const lines = [];
const remediation = {
  rootFile: 'add it to repo-manifest.json `root.files` with a one-line justification, or remove it.',
  rootDir: 'add it to repo-manifest.json `root.dirs` with a one-line justification, or remove it.',
  docsFile:
    'fold it into the Library (apps/studio/data/knowledge.json) if it is durable knowledge, OR add it to repo-manifest.json `docs.files` with a justification for why it does NOT fit the Library.',
  docsDir:
    'fold its contents into the Library if durable, OR add the directory to repo-manifest.json `docs.allowedDirs` with a justification.',
};
const label = { rootFile: 'root file', rootDir: 'root dir', docsFile: 'docs file', docsDir: 'docs dir' };

for (const kind of ['rootFile', 'rootDir', 'docsFile', 'docsDir']) {
  for (const entry of [...unlisted[kind]].sort()) {
    const shown = kind === 'docsFile' ? `docs/${entry}` : kind === 'docsDir' ? `docs/${entry}/` : kind === 'rootDir' ? `${entry}/` : entry;
    lines.push(`  ✗ unlisted ${label[kind]}: ${shown}\n      → ${remediation[kind]}`);
  }
}

// Stale manifest entries (listed but no longer tracked) are a non-fatal nudge to tidy.
const stale = [];
for (const [k, set] of [
  ['root.files', rootFiles], ['root.dirs', rootDirs],
  ['docs.files', docsFiles], ['docs.allowedDirs', docsDirs],
]) {
  const seenSet = { 'root.files': seen.rootFile, 'root.dirs': seen.rootDir, 'docs.files': seen.docsFile, 'docs.allowedDirs': seen.docsDir }[k];
  for (const name of set) if (!seenSet.has(name)) stale.push(`${k} → ${name}`);
}

if (lines.length > 0) {
  console.error('repo-manifest: BLOCKED — unlisted entries at the gated surfaces (root, docs/):\n');
  console.error(lines.join('\n'));
  console.error('\nThe repo root + docs/ are allow-listed (the `repo-surface-allowlist` guardrail) to keep');
  console.error('durable knowledge in the Library and block temp/ad-hoc files. Resolve each above.');
  if (stale.length) console.error(`\n(note: stale manifest entries you can also tidy: ${stale.join(', ')})`);
  process.exit(1);
}

console.log(
  `repo-manifest: OK — root (${seen.rootFile.size} files, ${seen.rootDir.size} dirs) and ` +
    `docs/ (${seen.docsFile.size} loose files, ${seen.docsDir.size} dirs) all allow-listed.`,
);
if (stale.length) console.log(`  (tidy: stale manifest entries — ${stale.join(', ')})`);
