import { z } from 'zod';
import { idSchema } from './common';

const SENSITIVE_CONFIG_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'connectionstring'
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '');
}

export const integrationReferenceSchema = z
  .object({
    id: idSchema,
    providerKey: z.string().min(1),
    config: z.record(z.unknown()).default({}),
    secretRef: z.string().min(1).optional()
  })
  .superRefine((value, context) => {
    const sensitiveKey = Object.keys(value.config).find((key) =>
      SENSITIVE_CONFIG_KEYS.has(normalizeKey(key))
    );

    if (sensitiveKey !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', sensitiveKey],
        message: 'Integration config cannot contain secrets'
      });
    }
  });

export type IntegrationReference = z.infer<typeof integrationReferenceSchema>;
