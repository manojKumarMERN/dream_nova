import { NovaErrorCodes } from './error-code';
import type { NovaErrorCode } from './error-code';

export interface NovaErrorOptions {
  statusCode?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
}

function defaultStatusCode(code: NovaErrorCode): number {
  switch (code) {
    case NovaErrorCodes.VALIDATION_FAILED:
    case NovaErrorCodes.INVALID_CONFIGURATION:
    case NovaErrorCodes.INVALID_PROPOSAL:
      return 400;
    case NovaErrorCodes.UNAUTHORIZED:
      return 401;
    case NovaErrorCodes.FORBIDDEN:
    case NovaErrorCodes.APPROVAL_REQUIRED:
      return 403;
    case NovaErrorCodes.NOT_FOUND:
      return 404;
    case NovaErrorCodes.CONFLICT:
      return 409;
    case NovaErrorCodes.UNKNOWN_JOB:
    case NovaErrorCodes.INTERNAL_ERROR:
      return 500;
  }
}

export class NovaError extends Error {
  readonly code: NovaErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown> | undefined;
  override readonly cause?: unknown;

  constructor(code: NovaErrorCode, message: string, options: NovaErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'NovaError';
    this.code = code;
    this.statusCode = options.statusCode ?? defaultStatusCode(code);
    if (options.details !== undefined) {
      this.details = options.details;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details })
    };
  }
}
