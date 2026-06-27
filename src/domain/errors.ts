/**
 * Domain errors carry their HTTP status and a stable code, so the error handler
 * maps them in one place instead of each route setting a status.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 — the request itself is malformed or violates a validation rule. */
export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = 'VALIDATION_ERROR';
}

/** 403 — authenticated (simulated) role is not allowed to do this. */
export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
}

/** 404 — a referenced resource does not exist. */
export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
}

/** 409 — the request is valid but conflicts with current state (overlap). */
export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = 'CONFLICT';
}
