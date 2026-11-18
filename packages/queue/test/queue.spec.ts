import { describe, expect, it } from 'vitest';
import { NovaErrorCodes } from '@nova/errors';
import { parseRedisUrl } from '../src/index';

describe('parseRedisUrl', () => {
  it('parses a local Redis URL', () => {
    expect(parseRedisUrl('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
      db: 0
    });
  });

  it('parses credentials and database index', () => {
    expect(parseRedisUrl('redis://user:pass@localhost:6380/2')).toEqual({
      host: 'localhost',
      port: 6380,
      db: 2,
      username: 'user',
      password: 'pass'
    });
  });

  it('rejects non-Redis protocols', () => {
    try {
      parseRedisUrl('postgres://localhost:5432/nova');
      throw new Error('Expected non-Redis URL to fail');
    } catch (error) {
      expect((error as { code?: string }).code).toBe(NovaErrorCodes.INVALID_CONFIGURATION);
    }
  });
});
