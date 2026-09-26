/**
 * The live reading (part of capability 3 · Arc surface, stories/arc-surface.md).
 */
import type { Line, LinesSince } from "@storytree/agent-link";
import type { Change, Changes } from "@storytree/library";

export const ASK_EVERY_MS = 2_000;
export const CLOCK_EVERY_MS = 60_000;

/** The two reads the app carries for the page (ADR-0634 D3). */
export interface LiveReads {
  changesSince(project: string, cursor: number): Promise<Changes>;
  linesSince(project: string, cursor: number): Promise<LinesSince>;
}

/** What is new since the last news. */
export interface News {
  changes: Change[];
  lines: Line[];
}

/** The clock and timers the reading runs on: the page's own by default, a stand-in in tests. */
export interface Timers {
  now(): number;
  every(ms: number, run: () => void): () => void;
}

export interface LiveReadingOptions {
  project: string;
  reads: LiveReads;
  onNews(news: News): void;
  onClock(now: number): void;
  onError?(error: unknown): void;
  timers?: Timers;
}

export interface LiveReading {
  stop(): void;
}

export function liveReading(_options: LiveReadingOptions): LiveReading {
  return { stop() {} };
}
