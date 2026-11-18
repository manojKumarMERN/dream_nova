import { z } from 'zod';

export const backendConfigSchema = z
  .object({
    mode: z.enum(['nova-managed', 'external']),
    providerRef: z.string().min(1).optional()
  })
  .superRefine((value, context) => {
    if (value.mode === 'external' && value.providerRef === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['providerRef'],
        message: 'Provider reference is required for external backends'
      });
    }
  });

export type BackendConfig = z.infer<typeof backendConfigSchema>;
