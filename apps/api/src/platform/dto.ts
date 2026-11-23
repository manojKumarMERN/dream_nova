import type { RuntimeComponentNode } from '@nova/sdk';
import {
  bindingSchema,
  breakpointOverridesSchema,
  componentLayoutSchema,
  dataBindingDefinitionSchema,
  dataModelDefinitionSchema,
  dataPermissionDefinitionSchema,
  dataQueryDefinitionSchema,
  dataQueryGroupSchema,
  dataQuerySortSchema,
  dataSchemaVersionSchema,
  dataSourceDefinitionSchema,
  eventBindingSchema,
  workflowDefinitionSchema
} from '@nova/spec';
import { z } from 'zod';

const requiredObject = z
  .unknown()
  .refine((value) => value !== undefined && value !== null && typeof value === 'object', {
    message: 'A JSON object is required'
  });

export const createAppSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  definition: requiredObject
});

export const createVersionSchema = z.object({
  definition: requiredObject,
  parentVersionId: z.string().min(1).optional(),
  changeSummary: z.string().max(500).optional()
});

export const validateProposalSchema = z.object({
  baseVersionId: z.string().min(1),
  proposal: requiredObject
});

export const applyProposalSchema = validateProposalSchema.extend({
  approved: z.boolean().optional()
});

export const publishSchema = z.object({
  versionId: z.string().min(1).optional(),
  environment: z.string().min(1).max(32).optional()
});

export const generateAiProposalSchema = z.object({
  instruction: z.string().min(1).max(2000),
  pageName: z.string().min(1).max(120).optional(),
  selectedNodeIds: z.array(z.string().min(1)).max(100).optional()
});

export const appIdSchema = z.object({ appId: z.string().min(1) });
export const versionIdSchema = z.object({ versionId: z.string().min(1) });
export const appSlugSchema = z.object({ appSlug: z.string().min(1) });
export const orgIdSchema = z.object({ orgId: z.string().min(1) });

export const runtimeNodeSchema: z.ZodType<RuntimeComponentNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.string().min(1),
      contractVersion: z.string().min(1),
      props: z.record(z.unknown()),
      name: z.string().min(1).optional(),
      bindings: z.record(bindingSchema).optional(),
      events: z.record(eventBindingSchema).optional(),
      children: z.array(runtimeNodeSchema).optional(),
      slots: z.record(z.array(runtimeNodeSchema)).optional(),
      layout: componentLayoutSchema.optional(),
      breakpointOverrides: breakpointOverridesSchema.optional(),
      hidden: z.boolean().optional(),
      targetOverrides: z.record(z.string().min(1), z.record(z.unknown())).optional()
    })
    .strict()
);

export const runtimePayloadSchema = z
  .object({
    schemaVersion: z.string().min(1),
    name: z.string().min(1),
    targets: z.array(z.string().min(1)),
    theme: z.record(z.unknown()),
    runtimeAccess: z
      .object({
        publicAccess: z.boolean().default(false)
      })
      .strict()
      .optional(),
    pages: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            route: z.string().min(1),
            rootNodeId: z.string().min(1),
            settings: z.record(z.unknown()).optional()
          })
          .strict()
      )
      .min(1),
    components: z.array(runtimeNodeSchema).min(1),
    dataSchemaVersion: dataSchemaVersionSchema.optional(),
    dataModels: z.array(dataModelDefinitionSchema).optional(),
    dataSources: z.array(dataSourceDefinitionSchema).optional(),
    queries: z.array(dataQueryDefinitionSchema).optional(),
    dataBindings: z.array(dataBindingDefinitionSchema).optional(),
    dataPermissions: z.array(dataPermissionDefinitionSchema).optional(),
    workflows: z.array(workflowDefinitionSchema).optional()
  })
  .strict();

export const dataEnvironmentSchema = z.enum(['development', 'preview', 'production']);

export const dataRecordValuesSchema = z.object({
  values: z.record(z.unknown())
});

export const applyDataMigrationSchema = z.object({
  confirmed: z.boolean().optional()
});

export const dataQueryRequestSchema = z
  .object({
    filters: dataQueryGroupSchema.optional(),
    sort: z.array(dataQuerySortSchema).max(20).optional(),
    page: z.number().int().min(1).max(100000).optional(),
    pageSize: z.number().int().min(1).max(200).optional(),
    fields: z.array(z.string().min(1)).max(100).optional(),
    expand: z.array(z.string().min(1)).max(20).optional()
  })
  .strict();

export type CreateAppDto = z.infer<typeof createAppSchema>;
export type CreateVersionDto = z.infer<typeof createVersionSchema>;
export type ValidateProposalDto = z.infer<typeof validateProposalSchema>;
export type ApplyProposalDto = z.infer<typeof applyProposalSchema>;
export type PublishDto = z.infer<typeof publishSchema>;
export type GenerateAiProposalDto = z.infer<typeof generateAiProposalSchema>;
export type DataRecordValuesDto = z.infer<typeof dataRecordValuesSchema>;
export type ApplyDataMigrationDto = z.infer<typeof applyDataMigrationSchema>;
export type DataQueryRequestDto = z.infer<typeof dataQueryRequestSchema>;
