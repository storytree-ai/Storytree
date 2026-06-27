# Project APIs the hosted-studio + web-editor CD pipelines depend on (Cloud Run deploy, Cloud Build
# image builds, Artifact Registry storage). These were historically declared in idle-stop.tf because
# the idle Cloud Function needed them too; relocated here when that function was torn down (ADR-0114
# follow-up) so the enablement the studio / CD rely on stays Terraform-managed. Same resource
# addresses as before, so the move is a no-op in the plan (Terraform tracks by address, not file).
# disable_on_destroy = false: never auto-disable an API that live serving depends on.
resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "cloudbuild" {
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}
