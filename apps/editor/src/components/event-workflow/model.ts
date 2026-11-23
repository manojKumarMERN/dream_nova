import type {
  AppDefinition,
  WorkflowDefinition,
  WorkflowEventConfiguration,
  WorkflowEventNodeType,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowOutcome,
  WorkflowStep
} from '@nova/spec';
import { createUniqueId } from '../../id';
import { listNodes } from '../../tree';
import type { WorkflowRef } from '../../types';
import { createAuthoringMetadata, writeAuthoringMetadata, type WorkflowIntent } from './authoring';

export const EVENT_NODE_TYPES: readonly WorkflowEventNodeType[] = ['rise', 'listen', 'riseListen'];
export const WORKFLOW_OUTCOMES: readonly WorkflowOutcome[] = ['success', 'failure', 'warning'];

export interface EventNodeTemplate {
  type: WorkflowEventNodeType;
  title: string;
  description: string;
  icon: 'rocket' | 'bell' | 'workflow';
}

export const EVENT_NODE_TEMPLATES: readonly EventNodeTemplate[] = [
  {
    type: 'rise',
    title: 'Rise Event',
    description: 'Publish an event when an action or condition occurs.',
    icon: 'rocket'
  },
  {
    type: 'listen',
    title: 'Listen Event',
    description: 'Wait for an event from a supported source.',
    icon: 'bell'
  },
  {
    type: 'riseListen',
    title: 'Rise & Listen',
    description: 'Publish a request and wait for its correlated response.',
    icon: 'workflow'
  }
];

export const OUTCOME_META: Record<
  WorkflowOutcome,
  { label: string; icon: 'check' | 'x' | 'help'; description: string }
> = {
  success: { label: 'Success', icon: 'check', description: 'Continue when execution succeeds.' },
  failure: { label: 'Failure', icon: 'x', description: 'Handle failed execution.' },
  warning: { label: 'Warning', icon: 'help', description: 'Route a non-blocking warning.' }
};

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'event'
  );
}

function intentForEventNode(type: WorkflowEventNodeType, eventName: string): WorkflowIntent {
  if (type === 'riseListen') {
    return 'raise-and-listen';
  }
  if (type === 'listen') {
    return 'listen-event';
  }
  return eventName.toLowerCase() === 'click' ? 'button-clicked' : 'raise-event';
}

function withAuthoringMetadata(
  config: WorkflowEventConfiguration,
  type: WorkflowEventNodeType,
  eventName: string,
  target?: WorkflowRef | null
): WorkflowEventConfiguration {
  return writeAuthoringMetadata(
    config,
    createAuthoringMetadata({
      intent: intentForEventNode(type, eventName),
      sourceComponentId: target?.nodeId,
      sourceEventName: eventName,
      generatedIdentifier: config.identifier,
      ...(config.incomingIdentifier === undefined
        ? {}
        : { generatedIncomingIdentifier: config.incomingIdentifier }),
      identifierOrigin: 'generated'
    })
  );
}

export function createEventConfiguration(
  type: WorkflowEventNodeType,
  target?: WorkflowRef | null
): WorkflowEventConfiguration {
  const eventName = target?.eventName ?? 'custom.event';
  const source = target?.nodeId ? `component:${target.nodeId}` : 'application';
  let config: WorkflowEventConfiguration;
  if (type === 'riseListen') {
    config = {
      name: 'Request and response',
      identifier: `${slug(eventName)}.requested`,
      source,
      incomingIdentifier: `${slug(eventName)}.completed`,
      correlationKey: 'event.correlationId',
      requestPayload: {},
      expectedResponsePayload: {},
      retryPolicy: { maxAttempts: 0, backoffMs: 0 },
      timeoutMs: 30000,
      subscriptionBehavior: 'once'
    };
  } else if (type === 'listen') {
    config = {
      name: 'Listen for event',
      identifier: `${slug(eventName)}.completed`,
      source: 'external',
      payloadMapping: {},
      conditions: [],
      timeoutMs: 30000,
      subscriptionBehavior: 'once'
    };
  } else {
    config = {
      name: 'Raise event',
      identifier: slug(eventName),
      source,
      payloadMapping: {},
      conditions: [],
      metadata: {}
    };
  }
  return withAuthoringMetadata(config, type, eventName, target);
}

export function createEventNode(
  type: WorkflowEventNodeType,
  target?: WorkflowRef | null
): WorkflowGraphNode {
  const template = EVENT_NODE_TEMPLATES.find((candidate) => candidate.type === type);
  return {
    id: createUniqueId('event'),
    type,
    label: template?.title ?? 'Event',
    description: template?.description,
    event: createEventConfiguration(type, target)
  };
}

export function graphToSteps(graph: WorkflowGraph): WorkflowStep[] {
  return graph.nodes.map((node) => {
    const outcomes = graph.edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => ({ outcome: edge.outcome, target: edge.target, label: edge.label }));
    return {
      id: node.id,
      type: `event.${node.type}`,
      label: node.label,
      params: {
        graphNodeId: node.id,
        event: node.event,
        disabled: node.disabled ?? false,
        outcomes
      },
      ...(node.event.failureHandling === undefined
        ? {}
        : {
            onError: [
              {
                type: 'showMessage',
                params: { message: node.event.failureHandling }
              }
            ]
          })
    };
  });
}

export function createDraftWorkflow(target: WorkflowRef): WorkflowDefinition {
  const node = createEventNode('rise', target);
  const graph: WorkflowGraph = { nodes: [node], edges: [] };
  return {
    id: createUniqueId('workflow'),
    name: `${target.eventName} workflow`,
    trigger: { event: target.eventName, nodeId: target.nodeId },
    steps: graphToSteps(graph),
    enabled: true,
    graph
  };
}

function workflowFromTarget(definition: AppDefinition, target: WorkflowRef): WorkflowDefinition {
  const node = listNodes(definition).find((candidate) => candidate.id === target.nodeId);
  const workflowId = node?.events?.[target.eventName]?.params?.workflowId;
  const existing =
    (typeof workflowId === 'string'
      ? definition.workflows.find((workflow) => workflow.id === workflowId)
      : undefined) ??
    definition.workflows.find(
      (workflow) =>
        workflow.trigger.nodeId === target.nodeId && workflow.trigger.event === target.eventName
    );
  if (existing === undefined) {
    return createDraftWorkflow(target);
  }
  if (existing.graph !== undefined) {
    return existing;
  }
  const graphNode = createEventNode('rise', target);
  const graph: WorkflowGraph = { nodes: [graphNode], edges: [] };
  return { ...existing, graph, steps: graphToSteps(graph) };
}

export function resolveWorkflow(
  definition: AppDefinition,
  target: WorkflowRef
): WorkflowDefinition {
  return workflowFromTarget(definition, target);
}

export function upsertWorkflow(
  definition: AppDefinition,
  workflow: WorkflowDefinition
): AppDefinition {
  const exists = definition.workflows.some((candidate) => candidate.id === workflow.id);
  return {
    ...definition,
    workflows: exists
      ? definition.workflows.map((candidate) =>
          candidate.id === workflow.id ? workflow : candidate
        )
      : [...definition.workflows, workflow]
  };
}

export function duplicateEventNode(
  node: WorkflowGraphNode,
  edges: readonly WorkflowGraphEdge[]
): { node: WorkflowGraphNode; edges: WorkflowGraphEdge[] } {
  const duplicate: WorkflowGraphNode = {
    ...node,
    id: createUniqueId('event'),
    label: `${node.label} copy`,
    event: { ...node.event }
  };
  const duplicatedEdges = edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) => ({
      ...edge,
      id: createUniqueId('edge'),
      source: edge.source === node.id ? duplicate.id : edge.source,
      target: edge.target === node.id ? duplicate.id : edge.target
    }));
  return { node: duplicate, edges: duplicatedEdges };
}

export function canConnect(
  graph: WorkflowGraph,
  source: string,
  target: string,
  outcome: WorkflowOutcome
): boolean {
  return (
    source !== target &&
    graph.nodes.some((node) => node.id === source) &&
    graph.nodes.some((node) => node.id === target) &&
    !graph.edges.some((edge) => edge.source === source && edge.outcome === outcome)
  );
}
