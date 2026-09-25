/** Where the Postgres tools come from. (Stub: not built yet.) */

export interface FindBinariesOptions {
  /** A directory that holds initdb, pg_ctl and postgres, as a packaged app ships them. */
  readonly dir?: string;
  /** The machine to find binaries for. By default, this one. */
  readonly platform?: NodeJS.Platform | string;
  readonly arch?: string;
}

/** The @embedded-postgres packages to take the binaries from, in the order they are tried. */
export function binaryPackages(_platform: NodeJS.Platform | string, _arch: string): string[] {
  return [];
}

/** The directory holding initdb, pg_ctl and postgres. */
export function findBinaries(_options: FindBinariesOptions = {}): string {
  throw new Error("findBinaries is not built yet");
}
