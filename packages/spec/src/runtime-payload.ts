import type { AppDefinition } from './app-definition';
import { appDefinitionSchema } from './app-definition';
import type { ComponentNode } from './component-node';
import type { PageDefinition } from './page';
import type { PlatformTarget } from './targets';
import type { ThemeTokenSet } from './theme';
import type { SpecVersion } from './version';
import { createMinimalAppDefinition } from './fixtures/minimal-app';

export interface RuntimePayloadLike {
  schemaVersion: SpecVersion;
  name: string;
  targets: PlatformTarget[];
  theme: ThemeTokenSet;
  runtimeAccess?: { publicAccess?: boolean } | undefined;
  pages: PageDefinition[];
  components: ComponentNode[];
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
    pages: payload.pages,
    components: payload.components
  });
}
