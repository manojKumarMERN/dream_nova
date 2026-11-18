import type { AppDefinition, ComponentNode } from '@nova/spec';

export function createId(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface NodeLocation {
  node: ComponentNode;
  pageId: string;
  siblings: ComponentNode[];
  index: number;
  parentId?: string | undefined;
  slot?: string | undefined;
}

function search(
  nodes: readonly ComponentNode[],
  pageId: string,
  nodeId: string,
  parentId: string | undefined,
  slot: string | undefined
): NodeLocation | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === undefined) {
      continue;
    }
    if (node.id === nodeId) {
      return {
        node,
        pageId,
        siblings: nodes as ComponentNode[],
        index,
        ...(parentId === undefined ? {} : { parentId }),
        ...(slot === undefined ? {} : { slot })
      };
    }

    const child = search(node.children ?? [], pageId, nodeId, node.id, undefined);
    if (child !== undefined) {
      return child;
    }

    for (const [name, slotNodes] of Object.entries(node.slots ?? {})) {
      const found = search(slotNodes, pageId, nodeId, node.id, name);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

export function locateNode(definition: AppDefinition, nodeId: string): NodeLocation | undefined {
  for (const page of definition.pages) {
    const root = definition.components.find((candidate) => candidate.id === page.rootNodeId);
    if (root === undefined) {
      continue;
    }
    const found = search([root], page.id, nodeId, undefined, undefined);
    if (found !== undefined) {
      return found;
    }
  }

  return search(definition.components, definition.pages[0]?.id ?? '', nodeId, undefined, undefined);
}

export function regenerateIds(node: ComponentNode): ComponentNode {
  const copy = deepClone(node);
  const result: ComponentNode = { ...copy, id: createId() };
  if (copy.children !== undefined) {
    result.children = copy.children.map((child) => regenerateIds(child));
  }
  if (copy.slots !== undefined) {
    result.slots = Object.fromEntries(
      Object.entries(copy.slots).map(([name, nodes]) => [name, nodes.map(regenerateIds)])
    );
  }
  return result;
}

export function readLocks(definition: AppDefinition): string[] {
  return [...new Set(definition.metadata.editorLocks)];
}

export function withLocks(definition: AppDefinition, locks: readonly string[]): AppDefinition {
  return {
    ...definition,
    metadata: { ...definition.metadata, editorLocks: [...new Set(locks)] }
  };
}
