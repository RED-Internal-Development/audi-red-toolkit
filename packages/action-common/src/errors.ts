export class ActionError extends Error {
  readonly code: string;
  readonly step: string;

  constructor(code: string, step: string, message: string) {
    super(`${code} | ${step} | ${message}`);
    this.name = "ActionError";
    this.code = code;
    this.step = step;
  }
}

export function isActionError(error: unknown): error is ActionError {
  return error instanceof ActionError;
}
