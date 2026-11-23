import type { AppDefinition } from './app-definition';
import { appDefinitionSchema } from './app-definition';
import type { ComponentNode } from './component-node';
import type {
  DataBindingDefinition,
  DataPermissionDefinition,
  DataQueryDefinition,
  DataSourceDefinition
} from './data-engine-spec';
import type { DataModelDefinition } from './data-model';
import type { PageDefinition } from './page';
import type { PlatformTarget } from './targets';
import type { ThemeTokenSet } from './theme';
import type { SpecVersion } from './version';
import type { WorkflowDefinition } from './workflow';
import { createMinimalAppDefinition } from './fixtures/minimal-app';

export interface RuntimePayloadLike {
  schemaVersion: SpecVersion;
  name: string;
  targets: PlatformTarget[];
  theme: ThemeTokenSet;
  runtimeAccess?: { publicAccess?: boolean } | undefined;
  pages: PageDefinition[];
  components: ComponentNode[];
  dataSchemaVersion?: string;
  dataModels?: DataModelDefinition[];
  dataSources?: DataSourceDefinition[];
  queries?: DataQueryDefinition[];
  dataBindings?: DataBindingDefinition[];
  dataPermissions?: DataPermissionDefinition[];
  workflows?: WorkflowDefinition[];
}

export function runtimePayloadToDefinition(
  payload: RuntimePayloadLike,
  appId?: string
): AppDefinition {
  const base = createMinimalAppDefinition();
  return appDefinitionSchema.parse({
    ...base,
    appId: appId ?? base.appId,
    schemaVersion: payload.schemaVersion,
    name: payload.name,
    targets: payload.targets,
    theme: payload.theme,
    ...(payload.runtimeAccess === undefined ? {} : { runtimeAccess: payload.runtimeAccess }),
    ...(payload.dataSchemaVersion === undefined
      ? {}
      : { dataSchemaVersion: payload.dataSchemaVersion }),
    ...(payload.dataModels === undefined ? {} : { dataModels: payload.dataModels }),
    ...(payload.dataSources === undefined ? {} : { dataSources: payload.dataSources }),
    ...(payload.queries === undefined ? {} : { queries: payload.queries }),
    ...(payload.dataBindings === undefined ? {} : { dataBindings: payload.dataBindings }),
    ...(payload.dataPermissions === undefined ? {} : { dataPermissions: payload.dataPermissions }),
    ...(payload.workflows === undefined ? {} : { workflows: payload.workflows }),
    pages: payload.pages,
    components: payload.components
  });
}
