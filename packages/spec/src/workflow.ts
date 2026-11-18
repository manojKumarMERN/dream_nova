import { z } from 'zod';
import { idSchema, shortNameSchema } from './common';

export const workflowConditionSchema = z
  .object({
    path: z.string().min(1),
    op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains']),
    value: z.unknown()
  })
  .strict();

export const workflowErrorHandlerSchema = z
  .object({
    type: z.string().min(1),
    params: z.record(z.unknown()).optional()
  })
  .strict();

export const workflowStepSchema = z
  .object({
    id: idSchema,
    type: z.string().min(1),
    label: shortNameSchema.optional(),
    params: z.record(z.unknown()).optional(),
    condition: workflowConditionSchema.optional(),
    onError: z.array(workflowErrorHandlerSchema).optional()
  })
  .strict();

export const workflowDefinitionSchema = z
  .object({
    id: idSchema,
    name: shortNameSchema,
    trigger: z
      .object({
        event: z.string().min(1),
        nodeId: idSchema.optional(),
        pageId: idSchema.optional()
      })
      .strict(),
    steps: z.array(workflowStepSchema).min(1),
    enabled: z.boolean().default(true)
  })
  .strict();

export type WorkflowCondition = z.infer<typeof workflowConditionSchema>;
export type WorkflowErrorHandler = z.infer<typeof workflowErrorHandlerSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
