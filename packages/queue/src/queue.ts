import { NovaError, NovaErrorCodes } from '@nova/errors';
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions, Job, Processor } from 'bullmq';

export const NOVA_QUEUE_NAMES = {
  system: 'nova.system',
  aiProposal: 'nova.ai-proposal',
  build: 'nova.build'
} as const;

export interface RedisConnectionOptions {
  host: string;
  port: number;
  db?: number | undefined;
  username?: string | undefined;
  password?: string | undefined;
  tls?: Record<string, unknown> | undefined;
}

export function parseRedisUrl(url: string): RedisConnectionOptions {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new NovaError(NovaErrorCodes.INVALID_CONFIGURATION, 'Invalid Redis URL', {
      details: { url },
      cause: error
    });
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new NovaError(
      NovaErrorCodes.INVALID_CONFIGURATION,
      'Redis URL must use redis:// or rediss://',
      {
        details: { protocol: parsed.protocol }
      }
    );
  }

  const database = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  if (!Number.isInteger(database) || database < 0) {
    throw new NovaError(NovaErrorCodes.INVALID_CONFIGURATION, 'Redis database index is invalid', {
      details: { database: parsed.pathname }
    });
  }

  const options: RedisConnectionOptions = {
    host: parsed.hostname || 'localhost',
    port: parsed.port === '' ? 6379 : Number(parsed.port),
    db: database
  };

  if (parsed.username !== '') {
    options.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password !== '') {
    options.password = decodeURIComponent(parsed.password);
  }
  if (parsed.protocol === 'rediss:') {
    options.tls = {};
  }

  return options;
}

export function createQueue(name: string, connection: RedisConnectionOptions): Queue {
  return new Queue(name, { connection: connection as ConnectionOptions });
}

export function createWorker<TData, TResult>(
  name: string,
  processor: Processor<TData, TResult>,
  connection: RedisConnectionOptions
): Worker<TData, TResult> {
  return new Worker<TData, TResult>(name, processor, {
    connection: connection as ConnectionOptions
  });
}

export type { Job };
