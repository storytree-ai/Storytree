---
status: accepted
decided: 2026-06-27
amends: [15]
load_bearing: true
---
# ADR-0114: Hosted DB sleeps on a fixed 1am-7am Sydney window, replacing idle-aware auto-stop

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Amends ADR-0015 §5 (the
idle-aware auto-stop mechanism).

## Context

The shared Cloud SQL instance (`storytree-pg`, ADR-0015) is stop/started for cost. ADR-0015 §5 settled
the day-to-day stopping as an **idle-aware** Cloud Function (stop after 5 h of zero DB connections)
with a **blunt daily 04:30 floor** behind it. That posture optimised for a single operator who could
`db:up` on demand and tolerate a morning cold-start.

The hosted studio (ADR-0042) changed who is watching: trusted-circle **members** now reach the same
instance through the web, and they cannot `db:up`. Two failures followed from the idle-aware posture:

1. **No scheduled START.** Nothing brought the instance up in the morning — it waited for a human
   `db:up` or the in-studio wake button. On 2026-06-27 the 04:30 floor stopped it and it was still
   down at ~07:53 when the owner arrived; the studio read as "down."
2. **Unpredictable daytime stops.** The 5 h idle-stop could (and did) stop the instance mid-day
   whenever connections fell quiet, so studio availability for members was non-deterministic.

The owner's call: members should find the studio reliably up during waking hours, and the cost saving
should come from a predictable overnight sleep, not an idle heuristic.

## Decision

Replace the idle-aware auto-stop with a **fixed nightly down-window, 01:00–07:00 Australia/Sydney**,
for `storytree-pg`:

- **STOP at 01:00** Sydney — the existing cost-backstop Cloud Scheduler job, re-pointed from the 04:30
  floor to 01:00 (now the primary stop, not a backstop).
- **START at 07:00** Sydney — a NEW Cloud Scheduler job PATCHing `activationPolicy=ALWAYS`, reusing the
  `sql-stopper` SA (already holds `roles/cloudsql.editor` = `instances.update`, which covers start).
  This is the missing half: the instance is up before members arrive.
- **Disable the idle-aware auto-stop** (`idle-stop.tf`) by **pausing** its 15-minute Cloud Scheduler
  check, so the instance stays up across the whole 07:00–01:00 window regardless of connection count.
  The dormant idle-stop function/SA resources were initially retained-but-paused, with full teardown
  deferred to avoid dropping the shared `google_project_service` API-enablement declarations that
  lived in that file and that the studio / CD rely on. **Update (2026-06-27): the teardown was
  completed** — the idle function, its two SAs + IAM, the source bucket/object, and the 15-minute
  scheduler are removed (`infra/idle-stop.tf` and `infra/functions/idle-stop/` deleted); the shared
  `run`/`cloudbuild`/`artifactregistry` enablements were first relocated to `infra/services.tf`
  (same resource addresses, a no-op move) so serving was never affected.

The schedulers PATCH the Cloud SQL Admin API directly (no app code); the instance resource keeps
`lifecycle.ignore_changes = [settings[0].activation_policy]` so the out-of-band start/stop is not seen
as Terraform drift.

## Consequences

- **Predictable availability:** the studio is reliably up 07:00–01:00 Sydney; members no longer hit
  random mid-day outages, and the morning "it's down" class of incident is structurally prevented by
  the 07:00 start.
- **Cost:** the instance now runs ~18 h/day every day rather than scaling down on quiet days.
  Worst-case is roughly the always-on figure minus the 6 h nightly sleep (~$19/mo vs the ~$25/mo
  always-on ceiling, ADR-0015) — a few dollars/month more than the idle-aware posture on quiet weeks,
  accepted as the price of member-facing predictability.
- **The honest-degrade UX still matters and is independently hardened.** A member loading the studio
  during the 01:00–07:00 sleep must still get an honest "the database is asleep" signal (admins: the
  wake button, ADR-0049; members: a waiting state) rather than a hang or a 500 — fixed alongside this
  decision (the `/api/me` always-degrade + honest progressive loading work).
- **A manual `db:up` still works** any time inside the sleep window (e.g. an owner working at 02:00) —
  the 07:00 start is a floor, not a ceiling, and a no-op if already running.
- **Loses** the idle-aware "never stop an actively-used instance mid-session" property — moot now that
  the up-window spans normal working hours; a session running past 01:00 will be stopped (re-`db:up`
  to continue).

## References

- Amends ADR-0015 §5 (idle-aware auto-stop + daily 04:30 floor) — this fixes the window instead.
- ADR-0042 (hosted studio for the trusted circle — the members who need predictable availability).
- ADR-0049 (in-studio keyless "Wake the database" for admins — manual recovery inside the sleep window).
- ADR-0110 (owner design-time direction is ratification — why this is born accepted).
- Infra: `infra/cost-backstop.tf` (the 01:00 stop + 07:00 start jobs), `infra/idle-stop.tf` (paused checker).
- Studio honest-degrade: `apps/studio/server/serve.ts` (/api/me always degrades + logs), the
  StoreBanner / App loading states.
