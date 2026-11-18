import { describe, expect, it } from 'vitest';
import { NovaError, NovaErrorCodes } from '../src/index';

describe('NovaError', () => {
  it('maps known error codes to status codes', () => {
    const error = new NovaError(NovaErrorCodes.FORBIDDEN, 'Not allowed');

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('serializes details without exposing the stack', () => {
    const error = new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Invalid input', {
      details: { field: 'name' }
    });

    expect(error.toJSON()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Invalid input',
      details: { field: 'name' }
    });
  });
});
