import type { AppDefinition, ComponentLayout, ComponentNode } from '@nova/spec';
import type { Breakpoint, DropTarget } from './types';

export interface NodeLocation {
  node: ComponentNode;
  parent: ComponentNode | null;
  container: ComponentNode[];
  index: number;
  slot: string;
  pageId: string;
}

export function cloneDefinition(definition: AppDefinition): AppDefinition {
  return JSON.parse(JSON.stringify(definition)) as AppDefinition;
}

export function cloneNode(node: ComponentNode): ComponentNode {
  return JSON.parse(JSON.stringify(node)) as ComponentNode;
}

function childContainers(node: ComponentNode): Array<{ slot: string; nodes: ComponentNode[] }> {
  const containers: Array<{ slot: string; nodes: ComponentNode[] }> = [];
  if (node.children && node.children.length > 0) {
    containers.push({ slot: 'children', nodes: node.children });
  }
  for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
    if (nodes.length > 0) {
      containers.push({ slot, nodes });
    }
  }
  return containers;
}

function findInContainer(
  container: ComponentNode[],
  id: string,
  parent: ComponentNode | null,
  slot: string,
  pageId: string
): NodeLocation | undefined {
  for (let index = 0; index < container.length; index += 1) {
    const node = container[index];
    if (node.id === id) {
      return { node, parent, container, index, slot, pageId };
    }
    for (const child of childContainers(node)) {
      const found = findInContainer(child.nodes, id, node, child.slot, pageId);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

export function locateNode(definition: AppDefinition, id: string): NodeLocation | undefined {
  for (const page of definition.pages) {
    const root = definition.components.find((candidate) => candidate.id === page.rootNodeId);
    if (root === undefined) {
      continue;
    }
    const found = findInContainer([root], id, null, 'root', page.id);
    if (found) {
      return found;
    }
  }
  return findInContainer(definition.components, id, null, 'root', definition.pages[0]?.id ?? '');
}

export function getNode(definition: AppDefinition, id: string): ComponentNode | undefined {
  return locateNode(definition, id)?.node;
}

export function listNodes(definition: AppDefinition): ComponentNode[] {
  const result: ComponentNode[] = [];
  const visit = (nodes: ComponentNode[]): void => {
    for (const node of nodes) {
      result.push(node);
      for (const child of childContainers(node)) {
        visit(child.nodes);
      }
    }
  };
  visit(definition.components);
  return result;
}

export function updateNodeInDefinition(
  definition: AppDefinition,
  id: string,
  updater: (node: ComponentNode) => ComponentNode
): AppDefinition {
  const next = cloneDefinition(definition);
  const location = locateNode(next, id);
  if (!location) {
    return definition;
  }
  location.container[location.index] = updater(location.node);
  return next;
}

export function removeNodesFromDefinition(definition: AppDefinition, ids: string[]): AppDefinition {
  const next = cloneDefinition(definition);
  const unique = new Set(ids);
  for (const id of unique) {
    const location = locateNode(next, id);
    if (location) {
      location.container.splice(location.index, 1);
    }
  }
  return next;
}

function targetContainer(parent: ComponentNode, slot: string): ComponentNode[] {
  if (slot === 'children') {
    if (!parent.children) {
      parent.children = [];
    }
    return parent.children;
  }
  if (!parent.slots) {
    parent.slots = {};
  }
  if (!parent.slots[slot]) {
    parent.slots[slot] = [];
  }
  return parent.slots[slot];
}

export function insertNodeIntoDefinition(
  definition: AppDefinition,
  node: ComponentNode,
  target: DropTarget
): AppDefinition {
  const next = cloneDefinition(definition);
  if (target.parentId === null) {
    next.components.splice(Math.max(0, Math.min(target.index, next.components.length)), 0, node);
    return next;
  }
  const parent = getNode(next, target.parentId);
  if (!parent) {
    next.components.push(node);
    return next;
  }
  const container = targetContainer(parent, target.slot);
  container.splice(Math.max(0, Math.min(target.index, container.length)), 0, node);
  return next;
}

export function moveNodeInDefinition(
  definition: AppDefinition,
  id: string,
  target: DropTarget
): AppDefinition {
  const location = locateNode(definition, id);
  if (!location) {
    return definition;
  }
  const moved = cloneNode(location.node);
  let index = target.index;
  const sameContainer =
    (location.parent?.id ?? null) === target.parentId && location.slot === target.slot;
  if (sameContainer && location.index < index) {
    index -= 1;
  }
  const withoutNode = removeNodesFromDefinition(definition, [id]);
  return insertNodeIntoDefinition(withoutNode, moved, { ...target, index });
}

export function getLayout(node: ComponentNode): ComponentLayout {
  return { ...(node.layout ?? {}) };
}

export function effectiveLayout(node: ComponentNode, breakpoint: Breakpoint): ComponentLayout {
  return {
    ...(node.layout ?? {}),
    ...(node.breakpointOverrides?.[breakpoint] ?? {})
  };
}

export function isHidden(node: ComponentNode): boolean {
  return node.hidden === true;
}

export function isLocked(definition: AppDefinition, node: ComponentNode): boolean {
  return definition.metadata.editorLocks.includes(node.id);
}

export function displayName(node: ComponentNode, fallback: string): string {
  return node.name && node.name.length > 0 ? node.name : fallback;
}
