import type { ApiError } from '../shared/contracts';

const STATUS = {
  AUTH_REQUIRED: 401,
  CLI_UNAVAILABLE: 503,
  FORBIDDEN: 403,
  VALIDATION: 400,
  CONFLICT: 409,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  NETWORK: 502,
  UNKNOWN_OUTCOME: 502,
  UPSTREAM: 502,
} as const;

/** An error whose body is safe to return to the browser. */
export class AppError extends Error {
  constructor(readonly body: ApiError) {
    super(body.message);
  }
  get status() {
    return STATUS[this.body.code];
  }
}
