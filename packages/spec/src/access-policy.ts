import { z } from 'zod';
import { idSchema } from './common';

export const accessPolicySchema = z.object({
  id: idSchema,
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
  effect: z.enum(['allow', 'deny']),
  resource: z.string().min(1),
  actions: z.array(z.string().min(1)).min(1)
});

export type AccessPolicy = z.infer<typeof accessPolicySchema>;
