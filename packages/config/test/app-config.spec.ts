import { describe, expect, it } from 'vitest';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import { loadConfig } from '../src/index';

const validEnvironment: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://nova:nova@localhost:5432/nova?schema=public'
};

describe('loadConfig', () => {
  it('applies defaults to a minimal environment', () => {
    const config = loadConfig(validEnvironment);

    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      SERVICE_NAME: 'nova',
      REDIS_URL: 'redis://localhost:6379'
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...validEnvironment, PORT: '70000' })).toThrowError(NovaError);

    try {
      loadConfig({ ...validEnvironment, PORT: '70000' });
    } catch (error) {
      expect(error).toBeInstanceOf(NovaError);
      expect((error as NovaError).code).toBe(NovaErrorCodes.INVALID_CONFIGURATION);
    }
  });

  it('requires a database URL', () => {
    expect(() => loadConfig({})).toThrowError('Invalid application configuration');
  });
});
