import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

const DATABASE_USER_ENV = "STORYTREE_DB_USER";

function nonBlank(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Resolve only the database user needed by the store connection boundary. */
export function resolveDatabaseUser(
  explicitUser: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const explicit = nonBlank(explicitUser);
  if (explicit !== undefined) return explicit;

  const ambient = nonBlank(env[DATABASE_USER_ENV]);
  if (ambient !== undefined) return ambient;

  const configuredFile = nonBlank(env["STORYTREE_SECRETS_FILE"]);
  const secretsFile = configuredFile ?? path.join(os.homedir(), ".storytree", "secrets.json");

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(secretsFile, "utf8"));
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;
  const fileUser = (parsed as Record<string, unknown>)[DATABASE_USER_ENV];
  if (typeof fileUser !== "string" || fileUser.trim().length === 0) return undefined;

  // This boundary intentionally hydrates no other key from the shared secrets document.
  env[DATABASE_USER_ENV] = fileUser;
  return fileUser;
}
