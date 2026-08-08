import { AsyncLocalStorage } from "node:async_hooks";

const WRITE_UNLOCK = "ALLOW_PILOT_EXTERNAL_WRITES";
const approvedWrite = new AsyncLocalStorage<boolean>();
const APPROVABLE_OPERATIONS = new Set([
  "intervals.create_workout",
  "intervals.delete_workout",
]);

/** Safe by default: a partial or missing Vercel environment cannot write. */
export function pilotExternalWritesAllowed(): boolean {
  return (
    process.env.PILOT_READ_ONLY === "false" &&
    process.env.PILOT_EXTERNAL_WRITES === WRITE_UNLOCK
  );
}

export class PilotExternalWriteBlockedError extends Error {
  constructor(operation: string) {
    super(`PILOT_READ_ONLY: blocked external write (${operation})`);
    this.name = "PilotExternalWriteBlockedError";
  }
}

export function requirePilotExternalWrites(operation: string): void {
  const explicitlyApproved = approvedWrite.getStore() === true && APPROVABLE_OPERATIONS.has(operation);
  if (!pilotExternalWritesAllowed() && !explicitlyApproved) {
    throw new PilotExternalWriteBlockedError(operation);
  }
}

/** Allow only ICU workout create/delete operations inside an authenticated,
 * explicit approval request. The permission cannot leak to later requests. */
export function withPilotIcuWriteApproval<T>(work: () => Promise<T>): Promise<T> {
  return approvedWrite.run(true, work);
}

export function pilotModeStatus() {
  return { pilot: true, readOnly: !pilotExternalWritesAllowed() } as const;
}
