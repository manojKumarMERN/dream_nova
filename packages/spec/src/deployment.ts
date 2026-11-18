import { z } from 'zod';

export const deploymentConfigSchema = z
  .object({
    model: z.enum(['nova-managed', 'self-hosted']),
    region: z.string().min(1).optional()
  })
  .superRefine((value, context) => {
    if (value.model === 'nova-managed' && value.region === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['region'],
        message: 'Region is required for NOVA-managed deployments'
      });
    }
  });

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;
