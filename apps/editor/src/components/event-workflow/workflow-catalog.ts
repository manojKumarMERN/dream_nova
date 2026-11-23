import type { AppDefinition } from '@nova/spec';
import { findContract } from '../../contracts';
import type { InspectorContract } from '../../types';
import { displayName, getNode, listNodes } from '../../tree';

export interface WorkflowComponentEvent {
  name: string;
  description: string;
  payloadSchema?: unknown;
}

export interface WorkflowComponentOption {
  id: string;
  type: string;
  displayName: string;
  contractVersion: string;
  category?: string;
  hasContract: boolean;
  events: WorkflowComponentEvent[];
}

export interface WorkflowOverlayTarget extends WorkflowComponentOption {
  supportedEvents: string[];
  supportsOpenProp: boolean;
}

export interface WorkflowComponentResolution {
  status: 'resolved' | 'missing-contract' | 'missing-component';
  component?: WorkflowComponentOption;
}

export interface WorkflowComponentReferenceValidation {
  valid: boolean;
  reason?: 'missing-component' | 'missing-contract';
}

const OVERLAY_EVENTS: Record<string, readonly string[]> = {
  'nova.modal': ['open', 'close'],
  'nova.dialog': ['confirm', 'cancel'],
  'nova.drawer': ['open', 'close']
};

function eventOptions(contract: InspectorContract | undefined): WorkflowComponentEvent[] {
  if (contract === undefined) {
    return [];
  }
  return Object.entries(contract.events).map(([name, event]) => ({
    name,
    description: event.description,
    ...(event.payloadSchema === undefined ? {} : { payloadSchema: event.payloadSchema })
  }));
}

function hasProp(contract: InspectorContract | undefined, prop: string): boolean {
  const schema = contract?.propsSchema as { properties?: Record<string, unknown> } | undefined;
  return (
    schema?.properties !== undefined &&
    Object.prototype.hasOwnProperty.call(schema.properties, prop)
  );
}

function toComponentOption(
  definition: AppDefinition,
  contracts: readonly InspectorContract[],
  id: string
): WorkflowComponentOption | undefined {
  const node = getNode(definition, id);
  if (node === undefined) {
    return undefined;
  }
  const contract = findContract(contracts, node.type);
  return {
    id: node.id,
    type: node.type,
    displayName: displayName(node, contract?.displayName ?? node.type),
    contractVersion: contract?.version ?? node.contractVersion,
    ...(contract?.category === undefined ? {} : { category: contract.category }),
    hasContract: contract !== undefined,
    events: eventOptions(contract)
  };
}

export function discoverWorkflowComponents(
  definition: AppDefinition,
  contracts: readonly InspectorContract[]
): WorkflowComponentOption[] {
  return listNodes(definition).map((node) => {
    const contract = findContract(contracts, node.type);
    return {
      id: node.id,
      type: node.type,
      displayName: displayName(node, contract?.displayName ?? node.type),
      contractVersion: contract?.version ?? node.contractVersion,
      ...(contract?.category === undefined ? {} : { category: contract.category }),
      hasContract: contract !== undefined,
      events: eventOptions(contract)
    };
  });
}

export function discoverComponentEvents(
  definition: AppDefinition,
  contracts: readonly InspectorContract[],
  componentId: string
): WorkflowComponentEvent[] {
  return toComponentOption(definition, contracts, componentId)?.events ?? [];
}

export function resolveWorkflowComponent(
  definition: AppDefinition,
  contracts: readonly InspectorContract[],
  componentId: string
): WorkflowComponentResolution {
  const component = toComponentOption(definition, contracts, componentId);
  if (component === undefined) {
    return { status: 'missing-component' };
  }
  if (!component.hasContract) {
    return { status: 'missing-contract', component };
  }
  return { status: 'resolved', component };
}

export function validateWorkflowComponentReference(
  definition: AppDefinition,
  contracts: readonly InspectorContract[],
  componentId: string
): WorkflowComponentReferenceValidation {
  const resolution = resolveWorkflowComponent(definition, contracts, componentId);
  if (resolution.status === 'missing-component') {
    return { valid: false, reason: 'missing-component' };
  }
  if (resolution.status === 'missing-contract') {
    return { valid: false, reason: 'missing-contract' };
  }
  return { valid: true };
}

export function discoverOverlayTargets(
  definition: AppDefinition,
  contracts: readonly InspectorContract[]
): WorkflowOverlayTarget[] {
  return listNodes(definition)
    .filter((node) => OVERLAY_EVENTS[node.type] !== undefined)
    .map((node) => {
      const contract = findContract(contracts, node.type);
      const events = eventOptions(contract);
      const declaredEvents = new Set(events.map((event) => event.name));
      return {
        id: node.id,
        type: node.type,
        displayName: displayName(node, contract?.displayName ?? node.type),
        contractVersion: contract?.version ?? node.contractVersion,
        ...(contract?.category === undefined ? {} : { category: contract.category }),
        hasContract: contract !== undefined,
        events,
        supportedEvents: (OVERLAY_EVENTS[node.type] ?? []).filter((name) =>
          declaredEvents.has(name)
        ),
        supportsOpenProp: hasProp(contract, 'open')
      };
    });
}
