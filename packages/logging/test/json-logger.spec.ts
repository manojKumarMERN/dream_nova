import { describe, expect, it } from 'vitest';
import { createJsonLogger } from '../src/index';

describe('createJsonLogger', () => {
  it('writes structured JSON with request context', () => {
    const lines: string[] = [];
    const logger = createJsonLogger({
      service: 'nova-test',
      sink: (line) => lines.push(line),
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });

    logger.info('started', { requestId: 'req-1' });

    expect(JSON.parse(lines[0] ?? '')).toEqual({
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'info',
      service: 'nova-test',
      message: 'started',
      context: { requestId: 'req-1' }
    });
  });

  it('redacts sensitive context and error details', () => {
    const lines: string[] = [];
    const logger = createJsonLogger({
      service: 'nova-test',
      sink: (line) => lines.push(line)
    });

    logger.error('integration failed', new Error('bad token'), {
      apiKey: 'secret-value',
      nested: { Authorization: 'Bearer abc' }
    });

    const entry = JSON.parse(lines[0] ?? '');
    expect(entry.context).toEqual({
      apiKey: '[REDACTED]',
      nested: { Authorization: '[REDACTED]' }
    });
    expect(entry.error.message).toBe('bad token');
  });

  it('suppresses messages below the configured level', () => {
    const lines: string[] = [];
    const logger = createJsonLogger({
      service: 'nova-test',
      level: 'warn',
      sink: (line) => lines.push(line)
    });

    logger.info('ignored');
    logger.warn('kept');

    expect(lines).toHaveLength(1);
  });
});
