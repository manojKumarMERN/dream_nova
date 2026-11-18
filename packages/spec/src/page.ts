import { z } from 'zod';
import { idSchema, shortNameSchema } from './common';

export const routeSchema = z
  .string()
  .regex(
    /^\/$|^\/(?:[A-Za-z0-9_-]+|:[A-Za-z_][A-Za-z0-9_]*)(?:\/(?:[A-Za-z0-9_-]+|:[A-Za-z_][A-Za-z0-9_]*))*$/,
    'Route must start with / and use URL-safe segments or :parameters'
  );

export const pageDefinitionSchema = z.object({
  id: idSchema,
  name: shortNameSchema,
  route: routeSchema,
  rootNodeId: idSchema,
  settings: z.record(z.unknown()).default({})
});

export type PageDefinition = z.infer<typeof pageDefinitionSchema>;
