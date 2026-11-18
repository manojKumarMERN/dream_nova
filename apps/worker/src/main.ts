import { loadConfig } from '@nova/config';
import { createJsonLogger } from '@nova/logging';
import { createWorker, NOVA_QUEUE_NAMES, parseRedisUrl } from '@nova/queue';
import { handleSystemJob } from './system-jobs';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createJsonLogger({
    service: 'nova-worker',
    level: config.LOG_LEVEL
  });
  const connection = parseRedisUrl(config.REDIS_URL);

  const worker = createWorker(
    NOVA_QUEUE_NAMES.system,
    async (job) => handleSystemJob(job.name),
    connection
  );

  worker.on('completed', (job) => {
    logger.info('job_completed', { queue: NOVA_QUEUE_NAMES.system, jobId: job.id });
  });

  worker.on('failed', (job, error) => {
    logger.error('job_failed', error, {
      queue: NOVA_QUEUE_NAMES.system,
      jobId: job?.id
    });
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info('worker_shutdown_started', { signal });
    await worker.close();
    logger.info('worker_shutdown_completed', { signal });
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  logger.info('worker_ready', { queue: NOVA_QUEUE_NAMES.system });
}

void bootstrap();
