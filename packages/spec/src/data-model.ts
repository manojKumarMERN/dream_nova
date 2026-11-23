import { z } from 'zod';
import { idSchema, shortNameSchema } from './common';
import {
  dataFieldVisibilitySchema,
  dataIndexDefinitionSchema,
  dataPermissionReferenceSchema,
  dataSchemaVersionSchema,
  dataValidationRuleSchema,
  dataRelationshipDefinitionSchema
} from './data-engine-spec';

export const dataFieldTypeSchema = z.enum([
  'string',
  'text',
  'longText',
  'number',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'email',
  'url',
  'uuid',
  'json',
  'enum',
  'reference'
]);

export const dataFieldDefinitionSchema = z.object({
  id: idSchema,
  name: shortNameSchema,
  type: dataFieldTypeSchema,
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  displayName: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  nullable: z.boolean().optional(),
  indexed: z.boolean().optional(),
  helpText: z.string().max(500).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  maxLength: z.number().int().positive().optional(),
  enumValues: z.array(z.string().min(1)).optional(),
  system: z.boolean().optional(),
  visibility: dataFieldVisibilitySchema.optional()
});

export const dataModelDefinitionSchema = z.object({
  id: idSchema,
  name: shortNameSchema,
  fields: z.array(dataFieldDefinitionSchema).min(1),
  relations: z.record(z.string().min(1)).default({}),
  displayName: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  schemaVersion: dataSchemaVersionSchema.optional(),
  relationships: z.array(dataRelationshipDefinitionSchema).optional(),
  indexes: z.array(dataIndexDefinitionSchema).optional(),
  validationRules: z.array(dataValidationRuleSchema).optional(),
  permissions: z.array(dataPermissionReferenceSchema).optional()
});

export type DataFieldDefinition = z.infer<typeof dataFieldDefinitionSchema>;
export type DataFieldType = z.infer<typeof dataFieldTypeSchema>;
export type DataModelDefinition = z.infer<typeof dataModelDefinitionSchema>;
