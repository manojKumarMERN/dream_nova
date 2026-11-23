import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { backendConfigSchema } from './backend';
import { idSchema, shortNameSchema } from './common';
import { componentNodeSchema } from './component-node';
import { deploymentConfigSchema } from './deployment';
import { integrationReferenceSchema } from './integration';
import { accessPolicySchema } from './access-policy';
import {
  dataBindingDefinitionSchema,
  dataPermissionDefinitionSchema,
  dataQueryDefinitionSchema,
  dataSchemaVersionSchema,
  dataSourceDefinitionSchema
} from './data-engine-spec';
import { dataModelDefinitionSchema } from './data-model';
import { pageDefinitionSchema } from './page';
import { platformTargetSchema } from './targets';
import { themeTokenSetSchema } from './theme';
import { specVersionSchema } from './version';
import { workflowDefinitionSchema } from './workflow';

export const appDefinitionSchema = z.object({
  schemaVersion: specVersionSchema,
  appId: idSchema,
  name: shortNameSchema,
  description: z.string().max(500).optional(),
  targets: z.array(platformTargetSchema).min(1),
  deployment: deploymentConfigSchema,
  backend: backendConfigSchema,
  theme: themeTokenSetSchema,
  pages: z.array(pageDefinitionSchema).min(1),
  components: z.array(componentNodeSchema).min(1),
  dataModels: z.array(dataModelDefinitionSchema).default([]),
  dataSchemaVersion: dataSchemaVersionSchema.optional(),
  dataSources: z.array(dataSourceDefinitionSchema).optional(),
  queries: z.array(dataQueryDefinitionSchema).optional(),
  dataBindings: z.array(dataBindingDefinitionSchema).optional(),
  dataPermissions: z.array(dataPermissionDefinitionSchema).optional(),
  integrations: z.array(integrationReferenceSchema).default([]),
  accessPolicies: z.array(accessPolicySchema).default([]),
  workflows: z.array(workflowDefinitionSchema).default([]),
  runtimeAccess: z
    .object({
      publicAccess: z.boolean().default(false)
    })
    .optional(),
  metadata: z
    .object({
      labels: z.record(z.string().min(1)).default({}),
      editorLocks: z.array(idSchema).default([])
    })
    .default({ labels: {}, editorLocks: [] })
});

export type AppDefinition = z.infer<typeof appDefinitionSchema>;

export function getAppDefinitionJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(appDefinitionSchema as unknown as Parameters<typeof zodToJsonSchema>[0], {
    name: 'AppDefinition',
    target: 'jsonSchema7'
  }) as Record<string, unknown>;
}
