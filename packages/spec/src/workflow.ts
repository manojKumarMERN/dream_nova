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

export const workflowOutcomeSchema = z.enum(['success', 'failure', 'warning']);
export const workflowEventNodeTypeSchema = z.enum(['rise', 'listen', 'riseListen']);
export const workflowSubscriptionBehaviorSchema = z.enum(['once', 'persistent']);

export const workflowRetryPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(0),
    backoffMs: z.number().int().min(0)
  })
  .strict();

export const workflowEventConfigurationSchema = z
  .object({
    name: z.string().min(1),
    identifier: z.string().min(1),
    source: z.string().min(1),
    incomingIdentifier: z.string().min(1).optional(),
    correlationKey: z.string().min(1).optional(),
    payloadMapping: z.record(z.string().min(1)).optional(),
    conditions: z.array(workflowConditionSchema).optional(),
    metadata: z.record(z.unknown()).optional(),
    timeoutMs: z.number().int().min(0).optional(),
    subscriptionBehavior: workflowSubscriptionBehaviorSchema.optional(),
    retryPolicy: workflowRetryPolicySchema.optional(),
    requestPayload: z.record(z.unknown()).optional(),
    expectedResponsePayload: z.record(z.unknown()).optional(),
    successHandling: z.string().min(1).optional(),
    failureHandling: z.string().min(1).optional(),
    warningHandling: z.string().min(1).optional()
  })
  .strict();

export const workflowGraphNodeSchema = z
  .object({
    id: idSchema,
    type: workflowEventNodeTypeSchema,
    label: shortNameSchema,
    description: z.string().max(280).optional(),
    event: workflowEventConfigurationSchema,
    disabled: z.boolean().optional()
  })
  .strict();

export const workflowGraphEdgeSchema = z
  .object({
    id: idSchema,
    source: idSchema,
    target: idSchema,
    outcome: workflowOutcomeSchema,
    label: z.string().max(80).optional()
  })
  .strict();

export const workflowGraphSchema = z
  .object({
    nodes: z.array(workflowGraphNodeSchema).min(1),
    edges: z.array(workflowGraphEdgeSchema).default([])
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
    enabled: z.boolean().default(true),
    graph: workflowGraphSchema.optional()
  })
  .strict();

export type WorkflowCondition = z.infer<typeof workflowConditionSchema>;
export type WorkflowErrorHandler = z.infer<typeof workflowErrorHandlerSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowOutcome = z.infer<typeof workflowOutcomeSchema>;
export type WorkflowEventNodeType = z.infer<typeof workflowEventNodeTypeSchema>;
export type WorkflowSubscriptionBehavior = z.infer<typeof workflowSubscriptionBehaviorSchema>;
export type WorkflowRetryPolicy = z.infer<typeof workflowRetryPolicySchema>;
export type WorkflowEventConfiguration = z.infer<typeof workflowEventConfigurationSchema>;
export type WorkflowGraphNode = z.infer<typeof workflowGraphNodeSchema>;
export type WorkflowGraphEdge = z.infer<typeof workflowGraphEdgeSchema>;
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
