import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Structural floor for the ADR-0207 D5 public distribution bucket, `infra/dist-bucket.tf`.
 *
 * Terraform cannot be APPLIED from CI (it needs the owner's GCP credentials), and its real proof is
 * the owner's apply + a credential-free fetch of the published URL. But D5's load-bearing decisions
 * are machine-checkable by reading the config as text — the same honest-CI-floor move
 * `install-script.test.ts` makes for a Windows-only script:
 *   1. the bucket is `storytree-dist` — the name the installer one-liner's URL is built from;
 *   2. objects are PUBLICLY readable (`allUsers` + objectViewer) — the D5 pre-auth fetch decision;
 *   3. the public grant is READ-ONLY — `allUsers` never holds a write/admin role;
 *   4. `public_access_prevention` is `inherited`, never `enforced` — the one setting whose wrong
 *      value silently turns the onboarding one-liner into a 403;
 *   5. uniform bucket-level access is on, so no per-object ACL can diverge from that posture;
 *   6. NO DRIFT between the bucket name here and the URL `infra/install.ps1` advertises.
 *
 * (6) is the cross-artifact tie that matters most: the installer's documented one-liner and the
 * bucket that must serve it are authored in different files and would otherwise drift silently.
 */

const tfPath = fileURLToPath(new URL("../../../infra/dist-bucket.tf", import.meta.url));
const tf = readFileSync(tfPath, "utf8");
const installPath = fileURLToPath(new URL("../../../infra/install.ps1", import.meta.url));
const installScript = readFileSync(installPath, "utf8");

/** The single canonical bucket name D5 names. */
const BUCKET = "storytree-dist";

test("D5: the distribution bucket is named storytree-dist", () => {
  assert.ok(
    new RegExp(`resource\\s+"google_storage_bucket"\\s+"dist"`).test(tf),
    "dist-bucket.tf must declare the google_storage_bucket.dist resource",
  );
  assert.ok(
    new RegExp(`name\\s*=\\s*"${BUCKET}"`).test(tf),
    `the bucket must be named "${BUCKET}" (the installer URL is built from it)`,
  );
});

test("D5: objects are publicly readable (allUsers objectViewer) — the pre-auth fetch decision", () => {
  const binding = tf.slice(tf.indexOf('resource "google_storage_bucket_iam_member"'));
  assert.ok(binding.length > 0, "there must be a bucket IAM binding making objects public");
  assert.ok(/member\s*=\s*"allUsers"/.test(binding), "the public grant must be to allUsers");
  assert.ok(
    /role\s*=\s*"roles\/storage\.objectViewer"/.test(binding),
    "the public grant must be roles/storage.objectViewer",
  );
});

test("D5: the public grant is READ-ONLY — allUsers never holds a write or admin role", () => {
  // A write/admin role granted to allUsers would let anyone replace the script a fresh machine
  // executes. Guard the whole file, not just the known binding.
  const forbidden = /"roles\/storage\.(objectAdmin|admin|objectCreator|legacyBucketWriter)"/g;
  const hits = [...tf.matchAll(forbidden)];
  for (const hit of hits) {
    // Any such role is only acceptable if it is NOT in a block granting to allUsers/allAuthenticatedUsers.
    const around = tf.slice(Math.max(0, hit.index! - 400), hit.index! + 400);
    assert.ok(
      !/allUsers|allAuthenticatedUsers/.test(around),
      `a public principal must never hold ${hit[0]} on the distribution bucket`,
    );
  }
});

test("D5: public_access_prevention is 'inherited', never 'enforced' (enforced would 403 onboarding)", () => {
  assert.ok(
    /public_access_prevention\s*=\s*"inherited"/.test(tf),
    "public_access_prevention must be explicitly 'inherited' so the allUsers binding is permitted",
  );
  assert.ok(
    !/public_access_prevention\s*=\s*"enforced"/.test(tf),
    "'enforced' blocks the allUsers binding and silently defeats D5's pre-auth fetch",
  );
});

test("D5: uniform bucket-level access is on (no per-object ACL can diverge)", () => {
  assert.ok(
    /uniform_bucket_level_access\s*=\s*true/.test(tf),
    "uniform_bucket_level_access must be true so one bucket-level binding is the whole access story",
  );
});

test("D5/D1 no drift: the URL install.ps1 advertises matches the bucket this config creates", () => {
  // install.ps1's header documents the post-D5 one-liner. The host+bucket it names must be exactly
  // what this terraform stands up, or the published one-liner 404s.
  const urlMatch = /https:\/\/storage\.googleapis\.com\/([a-z0-9][a-z0-9._-]*)\//.exec(installScript);
  assert.notEqual(urlMatch, null, "install.ps1 must document its public distribution URL");
  assert.equal(
    urlMatch![1],
    BUCKET,
    "the bucket in install.ps1's advertised URL must match the bucket dist-bucket.tf creates",
  );
});
