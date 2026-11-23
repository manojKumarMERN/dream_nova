import { z } from 'zod';
import { idSchema } from './common';

export const dataSchemaVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Expected semantic version');

export const dataFieldVisibilitySchema = z.enum(['public', 'authenticated', 'private']);

export const dataSourceDefinitionSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(120),
    provider: z.literal('nova-data'),
    environment: z.enum(['development', 'preview', 'production']),
    modelId: idSchema.optional(),
    options: z.record(z.unknown()).optional()
  })
  .superRefine((value, context) => {
    const sensitiveKeys = new Set([
      'password',
      'passwordhash',
      'token',
      'accesstoken',
      'refreshtoken',
      'secret',
      'apikey',
      'connectionstring',
      'databaseurl',
      'dsn'
    ]);
    const key = Object.keys(value.options ?? {}).find((candidate) =>
      sensitiveKeys.has(candidate.toLowerCase().replace(/[-_]/g, ''))
    );
    if (key !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options', key],
        message: 'Data source options cannot contain secrets'
      });
    }
  });

export const dataRelationshipCardinalitySchema = z.enum([
  'one-to-one',
  'one-to-many',
  'many-to-many'
]);

export const dataReferentialActionSchema = z.enum(['cascade', 'restrict', 'set-null', 'no-action']);

export const dataRelationshipDefinitionSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  sourceModelId: idSchema,
  sourceFieldId: idSchema,
  targetModelId: idSchema,
  targetFieldId: idSchema.optional(),
  cardinality: dataRelationshipCardinalitySchema,
  onDelete: dataReferentialActionSchema,
  onUpdate: dataReferentialActionSchema,
  junctionModelId: idSchema.optional(),
  description: z.string().max(500).optional()
});

export const dataIndexDefinitionSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  fieldIds: z.array(idSchema).min(1),
  unique: z.boolean().optional()
});

export const dataValidationRuleSchema = z.object({
  id: idSchema,
  fieldId: idSchema.optional(),
  expression: z.string().min(1).max(512),
  message: z.string().min(1).max(500)
});

export const dataPermissionActionSchema = z.enum([
  'data:read',
  'data:create',
  'data:update',
  'data:delete'
]);

export const dataPermissionDefinitionSchema = z.object({
  id: idSchema,
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
  modelId: idSchema,
  actions: z.array(dataPermissionActionSchema).min(1),
  recordPolicyRef: z.string().min(1).optional()
});

export const dataPermissionReferenceSchema = z.object({
  permissionId: idSchema,
  inherit: z.boolean().optional()
});

export const dataQueryOperatorSchema = z.enum([
  'eq',
  'ne',
  'contains',
  'startsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'isEmpty',
  'isNotEmpty'
]);

export const dataQueryConditionSchema = z.object({
  id: idSchema,
  field: z.string().min(1),
  operator: dataQueryOperatorSchema,
  value: z.unknown().optional()
});

export interface DataQueryGroup {
  id: string;
  operator: 'and' | 'or';
  conditions: Array<DataQueryCondition | DataQueryGroup>;
}

export const dataQueryGroupSchema: z.ZodType<DataQueryGroup> = z.lazy(() =>
  z.object({
    id: idSchema,
    operator: z.enum(['and', 'or']),
    conditions: z.array(z.union([dataQueryConditionSchema, dataQueryGroupSchema]))
  })
);

export const dataQuerySortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc'])
});

export const dataQueryDefinitionSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  modelId: idSchema,
  sourceId: idSchema.optional(),
  filters: dataQueryGroupSchema.optional(),
  sort: z.array(dataQuerySortSchema).optional(),
  fields: z.array(z.string().min(1)).optional(),
  expand: z.array(z.string().min(1)).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
  page: z.number().int().min(1).optional()
});

export const dataBindingModeSchema = z.enum(['single', 'collection', 'count']);

export const dataBindingDefinitionSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120).optional(),
  sourceId: idSchema.optional(),
  modelId: idSchema,
  queryId: idSchema.optional(),
  nodeId: idSchema,
  prop: z.string().min(1),
  mode: dataBindingModeSchema,
  field: z.string().min(1).optional(),
  mapping: z.record(z.string().min(1)).optional(),
  loadingState: z.string().optional(),
  emptyState: z.string().optional(),
  errorState: z.string().optional()
});

export type DataSourceDefinition = z.infer<typeof dataSourceDefinitionSchema>;
export type DataRelationshipCardinality = z.infer<typeof dataRelationshipCardinalitySchema>;
export type DataReferentialAction = z.infer<typeof dataReferentialActionSchema>;
export type DataRelationshipDefinition = z.infer<typeof dataRelationshipDefinitionSchema>;
export type DataIndexDefinition = z.infer<typeof dataIndexDefinitionSchema>;
export type DataValidationRule = z.infer<typeof dataValidationRuleSchema>;
export type DataPermissionAction = z.infer<typeof dataPermissionActionSchema>;
export type DataPermissionDefinition = z.infer<typeof dataPermissionDefinitionSchema>;
export type DataPermissionReference = z.infer<typeof dataPermissionReferenceSchema>;
export type DataQueryOperator = z.infer<typeof dataQueryOperatorSchema>;
export type DataQueryCondition = z.infer<typeof dataQueryConditionSchema>;
export type DataQuerySort = z.infer<typeof dataQuerySortSchema>;
export type DataQueryDefinition = z.infer<typeof dataQueryDefinitionSchema>;
export type DataBindingMode = z.infer<typeof dataBindingModeSchema>;
export type DataBindingDefinition = z.infer<typeof dataBindingDefinitionSchema>;
