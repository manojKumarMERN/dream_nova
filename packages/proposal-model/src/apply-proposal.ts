import { NovaError, NovaErrorCodes } from '@nova/errors';
import { builtInComponentRegistry } from '@nova/component-registry';
import type { ComponentRegistry } from '@nova/component-registry';
import {
  appDefinitionSchema,
  type AppDefinition,
  type Binding,
  type ComponentNode,
  type EventBinding,
  type PageDefinition,
  type WorkflowCondition,
  type WorkflowDefinition
} from '@nova/spec';
import { assertValidAppDefinition, validateAppDefinition } from '@nova/spec-validator';
import type { ValidationResult } from '@nova/spec-validator';
import { changeProposalSchema } from './proposal-operations';
import type { ChangeProposal, ComponentPatch } from './proposal-operations';
import { classifyProposalRisk, requiresApproval } from './risk';

export interface ApplyProposalOptions {
  baseDefinition: AppDefinition;
  registry?: ComponentRegistry;
  approved?: boolean;
}

export interface ApplyProposalResult {
  definition: AppDefinition;
  validation: ValidationResult;
  riskLevel: ReturnType<typeof classifyProposalRisk>;
}

interface NodeLocation {
  node: ComponentNode;
  siblings: ComponentNode[];
  index: number;
  parentId?: string | undefined;
  slot?: string | undefined;
}

interface ContainerTarget {
  siblings: ComponentNode[];
  parentId?: string | undefined;
  slot?: string | undefined;
  rootPage?: PageDefinition;
}

function invalidProposal(message: string, details: Record<string, unknown> = {}): never {
  throw new NovaError(NovaErrorCodes.INVALID_PROPOSAL, message, { details });
}

function findNodeLocation(
  nodes: ComponentNode[],
  nodeId: string,
  parentId?: string,
  slot?: string
): NodeLocation | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === undefined) {
      continue;
    }
    if (node.id === nodeId) {
      return { node, siblings: nodes, index, parentId, slot };
    }

    const childLocation = findNodeLocation(node.children ?? [], nodeId, node.id);
    if (childLocation !== undefined) {
      return childLocation;
    }

    for (const [slotName, slotNodes] of Object.entries(node.slots ?? {})) {
      const slotLocation = findNodeLocation(slotNodes, nodeId, node.id, slotName);
      if (slotLocation !== undefined) {
        return slotLocation;
      }
    }
  }

  return undefined;
}

function requirePage(definition: AppDefinition, pageId: string): PageDefinition {
  const page = definition.pages.find((candidate) => candidate.id === pageId);
  if (page === undefined) {
    invalidProposal('Proposal references an unknown page', { pageId });
  }
  return page;
}

function requireLocation(definition: AppDefinition, nodeId: string): NodeLocation {
  const location = findNodeLocation(definition.components, nodeId);
  if (location === undefined) {
    invalidProposal('Proposal references an unknown component', { nodeId });
  }
  return location;
}

function collectNodeIds(nodes: readonly ComponentNode[]): Set<string> {
  const ids = new Set<string>();

  function visit(list: readonly ComponentNode[]): void {
    for (const node of list) {
      ids.add(node.id);
      visit(node.children ?? []);
      for (const slotNodes of Object.values(node.slots ?? {})) {
        visit(slotNodes);
      }
    }
  }

  visit(nodes);
  return ids;
}

function pruneEditorLocks(definition: AppDefinition): void {
  const ids = collectNodeIds(definition.components);
  definition.metadata.editorLocks = definition.metadata.editorLocks.filter((id) => ids.has(id));
}

function isDescendant(definition: AppDefinition, ancestorId: string, nodeId: string): boolean {
  const location = findNodeLocation(definition.components, nodeId);
  const visited = new Set<string>();
  let current = location?.parentId;

  while (current !== undefined && !visited.has(current)) {
    if (current === ancestorId) {
      return true;
    }
    visited.add(current);
    current = findNodeLocation(definition.components, current)?.parentId;
  }

  return false;
}

function resolveContainer(
  definition: AppDefinition,
  parentId: string,
  slot?: string,
  replacingNodeId?: string
): ContainerTarget {
  const location = findNodeLocation(definition.components, parentId);
  if (location !== undefined) {
    if (slot !== undefined) {
      return { siblings: location.node.slots?.[slot] ?? [], parentId, slot };
    }
    return { siblings: location.node.children ?? [], parentId };
  }

  const rootPage = definition.pages.find((page) => page.rootNodeId === parentId);
  if (rootPage !== undefined && replacingNodeId === parentId) {
    return { siblings: definition.components, rootPage };
  }

  invalidProposal('Proposal parent component does not exist', { parentId });
}

function writeContainer(
  definition: AppDefinition,
  target: ContainerTarget,
  siblings: ComponentNode[]
): void {
  if (target.rootPage !== undefined) {
    definition.components = siblings;
    return;
  }

  if (target.parentId === undefined) {
    invalidProposal('Proposal parent component does not exist');
  }

  const parent = requireLocation(definition, target.parentId).node;
  if (target.slot !== undefined) {
    parent.slots = { ...(parent.slots ?? {}), [target.slot]: siblings };
  } else {
    parent.children = siblings;
  }
}

function insertIntoContainer(
  definition: AppDefinition,
  target: ContainerTarget,
  node: ComponentNode,
  index?: number
): void {
  const siblings = [...target.siblings];
  const position = Math.min(index ?? siblings.length, siblings.length);
  siblings.splice(position, 0, node);
  writeContainer(definition, target, siblings);
}

function applyComponentPatch(node: ComponentNode, patch: ComponentPatch): void {
  if (patch.name !== undefined) {
    node.name = patch.name;
  }
  if (patch.props !== undefined) {
    node.props = { ...node.props, ...patch.props };
  }
  if (patch.bindings !== undefined) {
    node.bindings = { ...(node.bindings ?? {}), ...patch.bindings };
  }
  if (patch.events !== undefined) {
    node.events = { ...(node.events ?? {}), ...patch.events };
  }
  if (patch.layout !== undefined) {
    node.layout = { ...(node.layout ?? {}), ...patch.layout };
  }
  if (patch.breakpointOverrides !== undefined) {
    node.breakpointOverrides = {
      ...(node.breakpointOverrides ?? {}),
      ...patch.breakpointOverrides
    };
  }
  if (patch.hidden !== undefined) {
    node.hidden = patch.hidden;
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deriveUuid(seed: string): string {
  const first = hashString(seed).toString(16).padStart(8, '0');
  const second = hashString(`${seed}:1`).toString(16).padStart(8, '0');
  const third = hashString(`${seed}:2`).toString(16).padStart(8, '0');
  const fourth = hashString(`${seed}:3`).toString(16).padStart(8, '0');
  return `${first}-${second.slice(0, 4)}-4${third.slice(1, 4)}-8${fourth.slice(1, 4)}-${second}${third.slice(0, 4)}`;
}

function rewriteIdentifiers(value: unknown, idMap: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    let rewritten = value;
    for (const [oldId, newId] of idMap) {
      if (rewritten === oldId) {
        return newId;
      }
      if (rewritten.includes(oldId)) {
        rewritten = rewritten.split(oldId).join(newId);
      }
    }
    return rewritten;
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteIdentifiers(item, idMap));
  }

  if (value !== null && typeof value === 'object') {
    const rewritten: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      rewritten[key] = rewriteIdentifiers(item, idMap);
    }
    return rewritten;
  }

  return value;
}

function cloneSubtree(node: ComponentNode, idMap: ReadonlyMap<string, string>): ComponentNode {
  const clone: ComponentNode = {
    ...structuredClone(node),
    id: idMap.get(node.id) ?? node.id
  };

  if (clone.props !== undefined) {
    clone.props = rewriteIdentifiers(clone.props, idMap) as Record<string, unknown>;
  }
  if (clone.bindings !== undefined) {
    clone.bindings = rewriteIdentifiers(clone.bindings, idMap) as Record<string, Binding>;
  }
  if (clone.events !== undefined) {
    clone.events = rewriteIdentifiers(clone.events, idMap) as Record<string, EventBinding>;
  }
  if (clone.children !== undefined) {
    clone.children = clone.children.map((child) => cloneSubtree(child, idMap));
  }
  if (clone.slots !== undefined) {
    clone.slots = Object.fromEntries(
      Object.entries(clone.slots).map(([slotName, nodes]) => [
        slotName,
        nodes.map((child) => cloneSubtree(child, idMap))
      ])
    );
  }

  return clone;
}

function cloneWorkflow(
  workflow: WorkflowDefinition,
  idMap: ReadonlyMap<string, string>
): WorkflowDefinition {
  const clone: WorkflowDefinition = structuredClone(workflow);
  clone.id = idMap.get(workflow.id) ?? workflow.id;

  if (clone.trigger.nodeId !== undefined) {
    clone.trigger.nodeId = idMap.get(clone.trigger.nodeId) ?? clone.trigger.nodeId;
  }

  for (const step of clone.steps) {
    if (step.params !== undefined) {
      step.params = rewriteIdentifiers(step.params, idMap) as Record<string, unknown>;
    }
    if (step.condition !== undefined) {
      step.condition = rewriteIdentifiers(step.condition, idMap) as WorkflowCondition;
    }
    if (step.onError !== undefined) {
      step.onError = step.onError.map((handler) => ({
        ...handler,
        params:
          handler.params === undefined
            ? undefined
            : (rewriteIdentifiers(handler.params, idMap) as Record<string, unknown>)
      }));
    }
  }

  return clone;
}

function allocateId(seed: string, reserved: ReadonlySet<string>): string {
  let suffix = 0;
  let candidate = deriveUuid(`${seed}:${suffix}`);
  while (reserved.has(candidate)) {
    suffix += 1;
    candidate = deriveUuid(`${seed}:${suffix}`);
  }
  return candidate;
}

export function applyProposal(
  proposalInput: ChangeProposal,
  options: ApplyProposalOptions
): ApplyProposalResult {
  const parsedProposal = changeProposalSchema.safeParse(proposalInput);
  if (!parsedProposal.success) {
    throw new NovaError(NovaErrorCodes.INVALID_PROPOSAL, 'Change proposal is invalid', {
      details: {
        issues: parsedProposal.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }
    });
  }

  const proposal = parsedProposal.data;
  const riskLevel = classifyProposalRisk(proposal.operations);
  if (requiresApproval(proposal) && options.approved !== true) {
    throw new NovaError(
      NovaErrorCodes.APPROVAL_REQUIRED,
      'Change proposal requires approval before apply',
      {
        details: { riskLevel }
      }
    );
  }

  const registry = options.registry ?? builtInComponentRegistry;
  const baseDefinition = assertValidAppDefinition(options.baseDefinition, { registry });
  let candidate = structuredClone(baseDefinition);

  for (const operation of proposal.operations) {
    switch (operation.op) {
      case 'addComponent': {
        requirePage(candidate, operation.pageId);

        if (collectNodeIds(candidate.components).has(operation.node.id)) {
          invalidProposal('Component node id already exists', { nodeId: operation.node.id });
        }

        const target = resolveContainer(
          candidate,
          operation.parentId,
          operation.slot,
          operation.node.id
        );
        insertIntoContainer(candidate, target, operation.node, operation.index);
        if (target.rootPage !== undefined) {
          target.rootPage.rootNodeId = operation.node.id;
        }
        break;
      }
      case 'updateComponent': {
        applyComponentPatch(requireLocation(candidate, operation.nodeId).node, operation.patch);
        break;
      }
      case 'removeComponent': {
        if (candidate.pages.some((page) => page.rootNodeId === operation.nodeId)) {
          invalidProposal('A page root component cannot be removed', { nodeId: operation.nodeId });
        }

        const location = requireLocation(candidate, operation.nodeId);
        location.siblings.splice(location.index, 1);
        pruneEditorLocks(candidate);
        break;
      }
      case 'updateTheme': {
        candidate.theme = {
          ...candidate.theme,
          colors: { ...candidate.theme.colors, ...(operation.patch.colors ?? {}) },
          spacing: { ...candidate.theme.spacing, ...(operation.patch.spacing ?? {}) },
          typography: { ...candidate.theme.typography, ...(operation.patch.typography ?? {}) },
          borderRadius: {
            ...candidate.theme.borderRadius,
            ...(operation.patch.borderRadius ?? {})
          },
          shadows: { ...candidate.theme.shadows, ...(operation.patch.shadows ?? {}) },
          components: { ...candidate.theme.components, ...(operation.patch.components ?? {}) }
        };
        break;
      }
      case 'addPage': {
        const duplicateId = candidate.pages.some((page) => page.id === operation.page.id);
        const duplicateRoute = candidate.pages.some((page) => page.route === operation.page.route);
        if (duplicateId || duplicateRoute) {
          invalidProposal('Page id or route already exists', {
            pageId: operation.page.id,
            route: operation.page.route
          });
        }
        candidate.pages.push(operation.page);
        break;
      }
      case 'removePage': {
        const page = requirePage(candidate, operation.pageId);
        if (candidate.pages.length === 1) {
          invalidProposal('The last page cannot be removed');
        }

        const rootLocation = findNodeLocation(candidate.components, page.rootNodeId);
        if (rootLocation !== undefined) {
          rootLocation.siblings.splice(rootLocation.index, 1);
        }
        candidate.pages = candidate.pages.filter(
          (candidatePage) => candidatePage.id !== operation.pageId
        );
        pruneEditorLocks(candidate);
        break;
      }
      case 'moveComponent': {
        if (candidate.pages.some((page) => page.rootNodeId === operation.nodeId)) {
          invalidProposal('A page root component cannot be moved', { nodeId: operation.nodeId });
        }

        const source = requireLocation(candidate, operation.nodeId);
        requireLocation(candidate, operation.parentId);
        if (
          operation.parentId === operation.nodeId ||
          isDescendant(candidate, operation.nodeId, operation.parentId)
        ) {
          invalidProposal('Cannot move a component into itself or its descendant', {
            nodeId: operation.nodeId,
            parentId: operation.parentId
          });
        }

        const moved = source.node;
        source.siblings.splice(source.index, 1);
        const target = resolveContainer(candidate, operation.parentId, operation.slot);
        insertIntoContainer(candidate, target, moved, operation.index);
        break;
      }
      case 'resizeComponent': {
        const node = requireLocation(candidate, operation.nodeId).node;
        node.layout = { ...(node.layout ?? {}), ...operation.layout };
        break;
      }
      case 'updateBreakpointOverrides': {
        const node = requireLocation(candidate, operation.nodeId).node;
        const overrides = { ...(node.breakpointOverrides ?? {}) };
        if (operation.layout === null) {
          delete overrides[operation.breakpoint];
        } else {
          overrides[operation.breakpoint] = operation.layout;
        }
        node.breakpointOverrides = overrides;
        break;
      }
      case 'updateBinding': {
        const node = requireLocation(candidate, operation.nodeId).node;
        const bindings = { ...(node.bindings ?? {}) };
        if (operation.binding === null) {
          delete bindings[operation.prop];
        } else {
          bindings[operation.prop] = operation.binding;
        }
        if (Object.keys(bindings).length === 0) {
          delete node.bindings;
        } else {
          node.bindings = bindings;
        }
        break;
      }
      case 'updateWorkflow': {
        const index = candidate.workflows.findIndex(
          (workflow) => workflow.id === operation.workflow.id
        );
        if (index >= 0) {
          candidate.workflows[index] = operation.workflow;
        } else {
          candidate.workflows.push(operation.workflow);
        }
        break;
      }
      case 'removeWorkflow': {
        const index = candidate.workflows.findIndex(
          (workflow) => workflow.id === operation.workflowId
        );
        if (index < 0) {
          invalidProposal('Proposal references an unknown workflow', {
            workflowId: operation.workflowId
          });
        }
        candidate.workflows.splice(index, 1);
        break;
      }
      case 'bulkUpdateComponents': {
        const locations = operation.nodeIds.map((nodeId) => requireLocation(candidate, nodeId));
        for (const location of locations) {
          applyComponentPatch(location.node, operation.patch);
        }
        break;
      }
      case 'bulkDeleteComponents': {
        for (const nodeId of operation.nodeIds) {
          if (candidate.pages.some((page) => page.rootNodeId === nodeId)) {
            invalidProposal('A page root component cannot be removed', { nodeId });
          }
          requireLocation(candidate, nodeId);
        }
        for (const nodeId of operation.nodeIds) {
          const location = findNodeLocation(candidate.components, nodeId);
          if (location !== undefined) {
            location.siblings.splice(location.index, 1);
          }
        }
        pruneEditorLocks(candidate);
        break;
      }
      case 'duplicateComponent': {
        if (collectNodeIds(candidate.components).has(operation.newNodeId)) {
          invalidProposal('Component node id already exists', { nodeId: operation.newNodeId });
        }

        const source = requireLocation(candidate, operation.sourceNodeId);
        requireLocation(candidate, operation.parentId);
        if (
          operation.parentId === operation.sourceNodeId ||
          isDescendant(candidate, operation.sourceNodeId, operation.parentId)
        ) {
          invalidProposal('Cannot duplicate a component into itself or its descendant', {
            nodeId: operation.sourceNodeId,
            parentId: operation.parentId
          });
        }

        const subtreeIds = collectNodeIds([source.node]);
        const reserved = collectNodeIds(candidate.components);
        const idMap = new Map<string, string>();
        idMap.set(operation.sourceNodeId, operation.newNodeId);

        for (const nodeId of subtreeIds) {
          if (idMap.has(nodeId)) {
            continue;
          }
          const newId = allocateId(`node:${nodeId}:${operation.newNodeId}`, reserved);
          reserved.add(newId);
          idMap.set(nodeId, newId);
        }

        const relatedWorkflows = candidate.workflows.filter((workflow) => {
          const serialized = JSON.stringify(workflow);
          return [...subtreeIds].some((nodeId) => serialized.includes(nodeId));
        });
        for (const workflow of relatedWorkflows) {
          const newId = allocateId(`workflow:${workflow.id}:${operation.newNodeId}`, reserved);
          reserved.add(newId);
          idMap.set(workflow.id, newId);
        }

        const cloned = cloneSubtree(source.node, idMap);
        const clonedWorkflows = relatedWorkflows.map((workflow) => cloneWorkflow(workflow, idMap));
        const target = resolveContainer(candidate, operation.parentId, operation.slot);
        insertIntoContainer(candidate, target, cloned, operation.index);
        candidate.workflows.push(...clonedWorkflows);
        break;
      }
      case 'setComponentHidden': {
        requireLocation(candidate, operation.nodeId).node.hidden = operation.hidden;
        break;
      }
      case 'replaceDefinition': {
        candidate = structuredClone(assertValidAppDefinition(operation.definition, { registry }));
        break;
      }
    }
  }

  const validation = validateAppDefinition(candidate, { registry });
  if (!validation.valid) {
    throw new NovaError(
      NovaErrorCodes.VALIDATION_FAILED,
      'Applying the proposal would produce an invalid definition',
      {
        details: { issues: validation.issues }
      }
    );
  }

  return {
    definition: appDefinitionSchema.parse(candidate),
    validation,
    riskLevel
  };
}
