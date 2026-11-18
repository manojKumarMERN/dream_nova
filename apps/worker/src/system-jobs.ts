import { NovaError, NovaErrorCodes } from '@nova/errors';

export interface SystemJobResult {
  ok: true;
  at: string;
}

export async function handleSystemJob(jobName: string): Promise<SystemJobResult> {
  if (jobName !== 'HEALTHCHECK') {
    throw new NovaError(NovaErrorCodes.UNKNOWN_JOB, 'Unknown system job', {
      details: { jobName }
    });
  }

  return {
    ok: true,
    at: new Date().toISOString()
  };
}
