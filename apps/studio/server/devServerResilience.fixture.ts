// Test fixture for devServerResilience.test.ts — NOT a vitest test (its name doesn't match
// `*.test.ts`, and it is never imported as a module; the test SPAWNS it as a child process).
//
// It reproduces a fire-and-forget worker FAULT in a long-lived process (like the Vite dev server):
// an async rejection or a thrown-from-a-timer exception that escapes any surrounding try/catch. With
// the guard installed the process SURVIVES the fault and reaches the clean exit (0); WITHOUT it, Node's
// default terminates the process before the clean exit can fire. argv: <mode> <fault>.
import { installDevServerResilience } from './devServerResilience';

const mode = process.argv[2]; // 'guard' | 'no-guard'
const fault = process.argv[3]; // 'reject' | 'throw'

if (mode === 'guard') {
  installDevServerResilience({ error: (m) => console.error(m) });
}

// Trigger the fault ASYNCHRONOUSLY, the way a background worker would — escaping any try/catch.
if (fault === 'reject') {
  // A promise rejection nobody awaits → 'unhandledRejection' (Node default: terminate the process).
  void Promise.reject(new Error('boom: simulated worker rejection'));
} else if (fault === 'throw') {
  // A throw from a timer callback → 'uncaughtException' (Node default: terminate the process).
  setTimeout(() => {
    throw new Error('boom: simulated worker exception');
  }, 5);
}

// If the guard caught the fault, the process is still alive and reaches this clean exit after a
// macrotask. Without the guard, Node terminates the process before this fires.
setTimeout(() => {
  console.error('[fixture] reached clean exit');
  process.exit(0);
}, 300);
