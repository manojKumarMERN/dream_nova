import type { AppDefinition, ComponentNode } from '@nova/spec';

export interface RedactedPromptContext {
  appId: string;
  name: string;
  targets: readonly string[];
  pageCount: number;
  componentTypes: readonly string[];
  integrationProviderKeys: readonly string[];
}

function collectComponentTypes(nodes: readonly ComponentNode[], result: Set<string>): void {
  for (const node of nodes) {
    result.add(node.type);
    collectComponentTypes(node.children ?? [], result);
    for (const slotNodes of Object.values(node.slots ?? {})) {
      collectComponentTypes(slotNodes, result);
    }
  }
}

export function generateRedactedPromptContext(definition: AppDefinition): RedactedPromptContext {
  const componentTypes = new Set<string>();
  collectComponentTypes(definition.components, componentTypes);

  return {
    appId: definition.appId,
    name: definition.name,
    targets: definition.targets,
    pageCount: definition.pages.length,
    componentTypes: [...componentTypes],
    integrationProviderKeys: definition.integrations.map((integration) => integration.providerKey)
  };
}
