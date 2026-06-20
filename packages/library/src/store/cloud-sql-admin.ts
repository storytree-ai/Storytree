/**
 * Pure Cloud SQL Admin REST client — all I/O is injected; no real fetch, no gcloud, no process.
 * Mirrors the shape of apps/studio/server/dbWake.ts (`createDbWaker(deps)`).
 */

/** A Cloud SQL instance's activation policy. */
export type ActivationPolicy = "ALWAYS" | "NEVER";

/** The subset of a Cloud SQL instance the db-control surfaces react to. */
export interface InstanceStatus {
  /** The instance state, e.g. "RUNNABLE" | "STOPPED" | "PENDING_CREATE". */
  state: string;
  /** settings.activationPolicy, e.g. "ALWAYS" | "NEVER". */
  activationPolicy: string;
}

/** A minimal HTTP response — only the bits the client reacts to (mirrors dbWake's PatchResult). */
export interface HttpResponse {
  status: number;
  body: string;
}

/** The injectable I/O surface — real fetch/token in production, stubbed in tests (mirrors DbWakeDeps). */
export interface CloudSqlAdminDeps {
  /** Fetch an OAuth access token for the calling identity (ADC locally, metadata SA on Cloud Run). */
  fetchToken: () => Promise<string>;
  /** Perform an authenticated request against `url`; never throws on a non-2xx (returns it). */
  request: (
    method: "GET" | "PATCH",
    url: string,
    token: string,
    body: string,
  ) => Promise<HttpResponse>;
  project: string;
  instance: string;
  /** Cloud SQL Admin API base; defaults to SQLADMIN_BASE. */
  baseUrl?: string;
}

/** The current Cloud SQL Admin API base — the same host dbWake.ts PATCHes. */
export const SQLADMIN_BASE = "https://sqladmin.googleapis.com/v1";

/** Build the instance resource URL: `${base}/projects/${project}/instances/${instance}`. */
export function instanceUrl(
  project: string,
  instance: string,
  baseUrl?: string,
): string {
  return `${baseUrl ?? SQLADMIN_BASE}/projects/${project}/instances/${instance}`;
}

/** Parse a Cloud SQL Admin `instances.get` JSON body into InstanceStatus; throws on a malformed shape. */
export function parseInstanceStatus(json: unknown): InstanceStatus {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("parseInstanceStatus: expected a non-null object");
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj["state"] !== "string") {
    throw new Error("parseInstanceStatus: missing or non-string 'state'");
  }
  const settings = obj["settings"];
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("parseInstanceStatus: missing or non-object 'settings'");
  }
  const settingsObj = settings as Record<string, unknown>;
  if (typeof settingsObj["activationPolicy"] !== "string") {
    throw new Error(
      "parseInstanceStatus: missing or non-string 'settings.activationPolicy'",
    );
  }
  return {
    state: obj["state"],
    activationPolicy: settingsObj["activationPolicy"],
  };
}

export interface CloudSqlAdmin {
  /** GET the instance, parse its state + activation policy. Throws on non-2xx or a malformed body. */
  describe(): Promise<InstanceStatus>;
  /** PATCH settings.activationPolicy (idempotent). Throws on non-2xx with the trimmed reply body. */
  setActivationPolicy(policy: ActivationPolicy): Promise<void>;
}

/** The pure client over injected I/O — the testable core (mirrors createDbWaker). */
export function createCloudSqlAdmin(deps: CloudSqlAdminDeps): CloudSqlAdmin {
  const url = instanceUrl(deps.project, deps.instance, deps.baseUrl);

  function throwForStatus(res: HttpResponse): void {
    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        `Cloud SQL Admin API ${res.status}: ${res.body.slice(0, 500).trim()}`,
      );
    }
  }

  return {
    async describe(): Promise<InstanceStatus> {
      const token = await deps.fetchToken();
      const res = await deps.request("GET", url, token, "");
      throwForStatus(res);
      return parseInstanceStatus(JSON.parse(res.body));
    },

    async setActivationPolicy(policy: ActivationPolicy): Promise<void> {
      const token = await deps.fetchToken();
      const body = JSON.stringify({ settings: { activationPolicy: policy } });
      const res = await deps.request("PATCH", url, token, body);
      throwForStatus(res);
    },
  };
}
