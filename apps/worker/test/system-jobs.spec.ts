import { describe, expect, it } from 'vitest';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import { handleSystemJob } from '../src/system-jobs';

describe('handleSystemJob', () => {
  it('handles health checks', async () => {
    const result = await handleSystemJob('HEALTHCHECK');

    expect(result.ok).toBe(true);
    expect(Number.isNaN(Date.parse(result.at))).toBe(false);
  });

  it('rejects unknown jobs', async () => {
    try {
      await handleSystemJob('DELETE_EVERYTHING');
      throw new Error('Expected unknown job to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(NovaError);
      expect((error as NovaError).code).toBe(NovaErrorCodes.UNKNOWN_JOB);
    }
  });
});
