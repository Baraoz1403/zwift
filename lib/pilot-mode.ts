const WRITE_UNLOCK = "ALLOW_PILOT_EXTERNAL_WRITES";

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
  if (!pilotExternalWritesAllowed()) {
    throw new PilotExternalWriteBlockedError(operation);
  }
}

export function pilotModeStatus() {
  return { pilot: true, readOnly: !pilotExternalWritesAllowed() } as const;
}
