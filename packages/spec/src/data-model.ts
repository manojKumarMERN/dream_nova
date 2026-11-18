import { z } from 'zod';
import { idSchema, shortNameSchema } from './common';

export const dataFieldTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'datetime',
  'json',
  'reference'
]);

export const dataFieldDefinitionSchema = z.object({
  id: idSchema,
  name: shortNameSchema,
  type: dataFieldTypeSchema,
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
  defaultValue: z.unknown().optional()
});

export const dataModelDefinitionSchema = z.object({
  id: idSchema,
  name: shortNameSchema,
  fields: z.array(dataFieldDefinitionSchema).min(1),
  relations: z.record(z.string().min(1)).default({})
});

export type DataFieldDefinition = z.infer<typeof dataFieldDefinitionSchema>;
export type DataFieldType = z.infer<typeof dataFieldTypeSchema>;
export type DataModelDefinition = z.infer<typeof dataModelDefinitionSchema>;
