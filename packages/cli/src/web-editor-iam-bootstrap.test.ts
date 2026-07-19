import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for the web-editor CD IAM bootstrap trap (`infra/web-editor-cd.tf`).
 *
 * WHAT HAPPENED: scoping the CD deploy SA's `run.admin` from project-wide down to its single Cloud Run
 * service was a correct security tightening — but a SERVICE-SCOPED binding can only be created once
 * that service exists, and `storytree-web-editor` is stood up imperatively (deploy-web-editor.sh), not
 * by Terraform. It had never been deployed, so the next `terraform apply` died with
 * `Error 404: Resource 'storytree-web-editor' of kind 'SERVICE' ... does not exist` — taking down the
 * WHOLE module, including unrelated resources being applied at the time. The old project-wide binding
 * applied whether or not the service existed, which is why the tightening introduced the dependency.
 *
 * The fix is a bootstrap gate (`var.web_editor_deployed`, default false). This pins it, because the
 * failure mode is invisible until someone runs an apply — CI can neither apply nor plan this module,
 * and `terraform validate` passes happily (the 404 is a runtime fact, not a config error).
 *
 * NOTE the asymmetry, deliberately not "fixed": the studio's equivalent service-scoped binding is
 * NOT gated, because `storytree-studio` exists. The rule is not "always gate" — it is "gate a
 * service-scoped binding whose service Terraform does not create and which may not exist yet".
 */

const tf = readFileSync(fileURLToPath(new URL("../../../infra/web-editor-cd.tf", import.meta.url)), "utf8");

test("the web-editor service-scoped run.admin binding is bootstrap-gated (or the module 404s)", () => {
  const start = tf.indexOf('resource "google_cloud_run_v2_service_iam_member" "web_editor_deployer_run_admin"');
  assert.notEqual(start, -1, "the service-scoped run.admin binding must exist");
  const body = tf.slice(start, tf.indexOf("}", start));
  assert.match(
    body,
    /count\s*=\s*var\.web_editor_deployed\s*\?\s*1\s*:\s*0/,
    "the binding must be gated on var.web_editor_deployed — ungated, it 404s until the service is stood " +
      "up and fails every apply in infra/",
  );
});

test("the bootstrap variable defaults to false, so a fresh apply never trips the 404", () => {
  const start = tf.indexOf('variable "web_editor_deployed"');
  assert.notEqual(start, -1, "web-editor-cd.tf must declare the web_editor_deployed variable");
  const decl = tf.slice(start, start + 700);
  assert.match(decl, /type\s*=\s*bool/);
  assert.match(decl, /default\s*=\s*false/, "it must default false — the service does not exist until stood up");
});
