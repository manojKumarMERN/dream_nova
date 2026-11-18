import { z } from 'zod';
import { NovaError, NovaErrorCodes } from '@nova/errors';

export const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000').pipe(z.coerce.number().int().min(1).max(65535)),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SERVICE_NAME: z.string().min(1).default('nova'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379')
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = appConfigSchema.safeParse(env);

  if (!result.success) {
    throw new NovaError(NovaErrorCodes.INVALID_CONFIGURATION, 'Invalid application configuration', {
      details: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }
    });
  }

  return result.data;
}
