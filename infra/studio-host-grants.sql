-- DB privileges for the hosted studio's runtime service account (ADR-0042,
-- studio-cloud `cloud-run-iap`). The Cloud SQL IAM SA user (created via
-- `gcloud sql users create ... --type=cloud_iam_service_account`) is a bare
-- role; the studio needs read everywhere in `events` (library, verdicts,
-- presence) and write for comments. DML on the whole schema keeps it simple —
-- the API layer (guestPolicy) is what scopes guests; this role is the
-- SERVER's ceiling, not a guest's.
--
-- Idempotent. Run as the schema owner (hua.mick@gmail.com, keyless):
--   npx tsx -e "see infra/studio-cloud.md §3"

GRANT USAGE ON SCHEMA events TO "storytree-studio-host@storytree-498613.iam";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA events
  TO "storytree-studio-host@storytree-498613.iam";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA events
  TO "storytree-studio-host@storytree-498613.iam";
ALTER DEFAULT PRIVILEGES IN SCHEMA events
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO "storytree-studio-host@storytree-498613.iam";
ALTER DEFAULT PRIVILEGES IN SCHEMA events
  GRANT USAGE, SELECT ON SEQUENCES
  TO "storytree-studio-host@storytree-498613.iam";
