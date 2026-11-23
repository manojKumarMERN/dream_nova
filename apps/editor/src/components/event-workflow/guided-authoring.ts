import { validateRuntimeAction } from '@nova/runtime-core';
import type { AppDefinition, WorkflowGraphNode } from '@nova/spec';
import { BUILT_IN_CONTRACTS } from '../../contracts';
import type { InspectorContract, WorkflowRef } from '../../types';
import type { IconName } from '../Icons';
import {
  isSafeMappingExpression,
  readAuthoringMetadata,
  updateAuthoringMetadata,
  type WorkflowAuthoringMetadata,
  type WorkflowAuthoringRuntimeAction,
  type WorkflowIntent
} from './authoring';
import { discoverWorkflowData, type WorkflowDataCatalog } from './data-catalog';
import { applyGeneratedIdentifiers } from './event-identifiers';
import { createEventNode } from './model';
import {
  discoverOverlayTargets,
  discoverWorkflowComponents,
  resolveWorkflowComponent,
  type WorkflowComponentOption,
  type WorkflowOverlayTarget
} from './workflow-catalog';
import type { WorkflowDesignerIssue } from './validation';

export type GuidedActionId =
  | 'start-from-component'
  | 'open-modal'
  | 'open-drawer'
  | 'close-overlay'
  | 'fetch-data'
  | 'save-data'
  | 'update-component'
  | 'fill-modal'
  | 'validate-form'
  | 'show-message'
  | 'listen-event'
  | 'raise-event'
  | 'raise-and-listen';

export type GuidedActionCategory = 'Events' | 'UI Actions' | 'Data Actions' | 'Logic' | 'Outcomes';

export interface GuidedActionDefinition {
  id: GuidedActionId;
  label: string;
  description: string;
  category: GuidedActionCategory;
  intent: WorkflowIntent;
  nodeType: 'rise' | 'listen' | 'riseListen';
  icon: IconName;
  requires: string;
}

export interface GuidedActionAvailability {
  available: boolean;
  reason: string;
}

export interface GuidedActionContext {
  definition: AppDefinition;
  contracts: readonly InspectorContract[];
  components: WorkflowComponentOption[];
  overlays: WorkflowOverlayTarget[];
  data: WorkflowDataCatalog;
}

export interface GuidedActionConfig {
  sourceComponentId?: string;
  sourceEventName?: string;
  targetComponentId?: string;
  targetAction?: string;
  targetProperty?: string;
  dataSourceId?: string;
  queryId?: string;
  formId?: string;
  message?: string;
  action?: string;
}

export interface GuidedActionOption {
  value: string;
  label: string;
  description?: string;
  type?: string;
  required?: boolean;
}

export interface GuidedConfigurationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  nodeId: string;
  field?: string;
}

const OVERLAY_OPEN_ACTIONS: ReadonlySet<GuidedActionId> = new Set(['open-modal', 'open-drawer']);
const TARGET_REQUIRED_ACTIONS: ReadonlySet<GuidedActionId> = new Set([
  'open-modal',
  'open-drawer',
  'close-overlay',
  'update-component',
  'fill-modal'
]);

export const GUIDED_ACTIONS: Record<GuidedActionId, GuidedActionDefinition> = {
  'start-from-component': {
    id: 'start-from-component',
    label: 'Component event',
    description: 'Start when a real component event occurs.',
    category: 'Events',
    intent: 'component-event',
    nodeType: 'rise',
    icon: 'activity',
    requires: 'A component with a contract-declared event'
  },
  'open-modal': {
    id: 'open-modal',
    label: 'Open modal',
    description: 'Open an existing modal component.',
    category: 'UI Actions',
    intent: 'open-modal',
    nodeType: 'rise',
    icon: 'box',
    requires: 'A modal component that declares the open event'
  },
  'open-drawer': {
    id: 'open-drawer',
    label: 'Open drawer',
    description: 'Open an existing drawer component.',
    category: 'UI Actions',
    intent: 'open-drawer',
    nodeType: 'rise',
    icon: 'panel-right',
    requires: 'A drawer component that declares the open event'
  },
  'close-overlay': {
    id: 'close-overlay',
    label: 'Close overlay',
    description: 'Close an existing modal or drawer, or resolve a dialog.',
    category: 'UI Actions',
    intent: 'close-overlay',
    nodeType: 'rise',
    icon: 'x',
    requires: 'A modal, drawer or dialog with a supported close event'
  },
  'fetch-data': {
    id: 'fetch-data',
    label: 'Fetch data',
    description: 'Run an existing NOVA data query.',
    category: 'Data Actions',
    intent: 'fetch-data',
    nodeType: 'riseListen',
    icon: 'database',
    requires: 'A valid NOVA data query'
  },
  'save-data': {
    id: 'save-data',
    label: 'Save data',
    description: 'Store data through an existing NOVA data source.',
    category: 'Data Actions',
    intent: 'save-data',
    nodeType: 'rise',
    icon: 'save',
    requires: 'A NOVA data source with a model'
  },
  'update-component': {
    id: 'update-component',
    label: 'Update component',
    description: 'Set a supported property on an existing component.',
    category: 'UI Actions',
    intent: 'update-component',
    nodeType: 'rise',
    icon: 'settings',
    requires: 'A component with writable declared properties'
  },
  'fill-modal': {
    id: 'fill-modal',
    label: 'Fill overlay',
    description: 'Map returned data into overlay properties.',
    category: 'UI Actions',
    intent: 'fill-modal',
    nodeType: 'rise',
    icon: 'layers',
    requires: 'An overlay component with writable declared properties'
  },
  'validate-form': {
    id: 'validate-form',
    label: 'Validate form',
    description: 'Validate an existing form component.',
    category: 'Logic',
    intent: 'validate-form',
    nodeType: 'riseListen',
    icon: 'shield',
    requires: 'A form component'
  },
  'show-message': {
    id: 'show-message',
    label: 'Show message',
    description: 'Show a success, failure or warning message.',
    category: 'Outcomes',
    intent: 'show-message',
    nodeType: 'rise',
    icon: 'bell',
    requires: 'The showMessage runtime action definition'
  },
  'listen-event': {
    id: 'listen-event',
    label: 'Listen for event',
    description: 'Wait for a supported component or application event.',
    category: 'Events',
    intent: 'listen-event',
    nodeType: 'listen',
    icon: 'activity',
    requires: 'A component event or application event'
  },
  'raise-event': {
    id: 'raise-event',
    label: 'Raise event',
    description: 'Publish an application event.',
    category: 'Events',
    intent: 'raise-event',
    nodeType: 'rise',
    icon: 'rocket',
    requires: 'No additional dependency'
  },
  'raise-and-listen': {
    id: 'raise-and-listen',
    label: 'Request and response',
    description: 'Publish a request and wait for a correlated response.',
    category: 'Logic',
    intent: 'raise-and-listen',
    nodeType: 'riseListen',
    icon: 'workflow',
    requires: 'No additional dependency'
  }
};

const FRIENDLY_MESSAGES: Record<string, string> = {
  MISSING_EVENT_IDENTIFIER: 'Select a source event or enter an event identifier.',
  MISSING_EVENT_SOURCE: 'Choose a source component so the event has a stable source.',
  MISSING_RESPONSE_EVENT: 'Add a response event identifier for this request.',
  MISSING_EVENT_CORRELATION: 'Configure how the response is matched to the request.',
  INVALID_EVENT_PAYLOAD_MAPPING: 'A mapping uses an unsupported expression. Choose a source field.',
  DUPLICATE_WORKFLOW_EVENT_OUTCOME: 'This outcome already has a branch. Choose another outcome.',
  MISSING_SUCCESS_BRANCH: 'Add a Success branch or define success handling.',
  MISSING_FAILURE_HANDLING: 'Add a Failure branch or define failure handling.',
  MISSING_WARNING_HANDLING: 'Add a Warning branch or define warning handling.',
  UNKNOWN_WORKFLOW_EVENT_ENDPOINT: 'A branch points to a node that is no longer available.',
  INVALID_WORKFLOW_EVENT_SELF_CONNECTION: 'A branch cannot point back to the same node.',
  WORKFLOW_EVENT_CYCLE: 'This workflow contains a branch cycle. Check the connected steps.'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSecretLike(value: string): boolean {
  return /(password|secret|token|credential|apikey|api_key|connectionstring|connection_string)/i.test(
    value
  );
}

export function buildGuidedActionContext(
  definition: AppDefinition,
  contracts: readonly InspectorContract[] = BUILT_IN_CONTRACTS
): GuidedActionContext {
  return {
    definition,
    contracts,
    components: discoverWorkflowComponents(definition, contracts),
    overlays: discoverOverlayTargets(definition, contracts),
    data: discoverWorkflowData(definition)
  };
}

function componentById(
  context: GuidedActionContext,
  id?: string
): WorkflowComponentOption | undefined {
  return id === undefined ? undefined : context.components.find((component) => component.id === id);
}

function overlayById(context: GuidedActionContext, id?: string): WorkflowOverlayTarget | undefined {
  return id === undefined ? undefined : context.overlays.find((overlay) => overlay.id === id);
}

function contractFor(context: GuidedActionContext, type?: string): InspectorContract | undefined {
  return type === undefined
    ? undefined
    : context.contracts.find((contract) => contract.type === type);
}

function usableQueries(context: GuidedActionContext) {
  const modelIds = new Set(context.data.dataModels.map((model) => model.id));
  const sourceIds = new Set(context.data.dataSources.map((source) => source.id));
  return context.data.queries.filter(
    (query) =>
      modelIds.has(query.modelId) &&
      (query.sourceId === undefined || sourceIds.has(query.sourceId)) &&
      !context.data.issues.some((issue) => issue.path.startsWith(`queries[${query.id}]`))
  );
}

function usableDataSources(context: GuidedActionContext) {
  const modelIds = new Set(context.data.dataModels.map((model) => model.id));
  return context.data.dataSources.filter(
    (source) => source.modelId !== undefined && modelIds.has(source.modelId)
  );
}

function supportsOverlayEvent(
  overlay: WorkflowOverlayTarget | undefined,
  action: GuidedActionId
): boolean {
  if (overlay === undefined || !overlay.hasContract) {
    return false;
  }
  if (OVERLAY_OPEN_ACTIONS.has(action)) {
    return overlay.supportedEvents.includes('open') && overlay.supportsOpenProp;
  }
  if (action === 'close-overlay') {
    return overlay.supportedEvents.some((event) => event === 'close' || event === 'cancel');
  }
  return false;
}

function overlayForAction(
  context: GuidedActionContext,
  action: GuidedActionId
): WorkflowOverlayTarget | undefined {
  return context.overlays.find((overlay) => supportsOverlayEvent(overlay, action));
}

function formComponents(context: GuidedActionContext): WorkflowComponentOption[] {
  return context.components.filter(
    (component) => component.hasContract && component.type === 'nova.form'
  );
}

function componentsWithProperties(context: GuidedActionContext): WorkflowComponentOption[] {
  return context.components.filter(
    (component) => component.hasContract && getPropertyOptions(component.id, context).length > 0
  );
}

export function getGuidedActionAvailability(
  id: GuidedActionId,
  context: GuidedActionContext
): GuidedActionAvailability {
  const definition = GUIDED_ACTIONS[id];
  const unavailable = (reason: string): GuidedActionAvailability => ({ available: false, reason });
  const available = (): GuidedActionAvailability => ({
    available: true,
    reason: definition.requires
  });

  switch (id) {
    case 'start-from-component':
    case 'listen-event':
      return context.components.some((component) => component.events.length > 0)
        ? available()
        : unavailable(definition.requires);
    case 'open-modal':
    case 'open-drawer':
    case 'close-overlay':
      return overlayForAction(context, id) === undefined
        ? unavailable(definition.requires)
        : available();
    case 'fetch-data':
      return usableQueries(context).length === 0 ? unavailable(definition.requires) : available();
    case 'save-data':
      return usableDataSources(context).length === 0
        ? unavailable(definition.requires)
        : available();
    case 'update-component':
      return componentsWithProperties(context).length === 0
        ? unavailable(definition.requires)
        : available();
    case 'fill-modal':
      return context.overlays.some(
        (overlay) =>
          supportsOverlayEvent(overlay, 'open-modal') &&
          getPropertyOptions(overlay.id, context).length > 0
      )
        ? available()
        : unavailable(definition.requires);
    case 'validate-form':
      return formComponents(context).length === 0 ? unavailable(definition.requires) : available();
    case 'show-message':
    case 'raise-event':
    case 'raise-and-listen':
      return available();
  }
}

export function listGuidedActions(
  context: GuidedActionContext
): Array<GuidedActionDefinition & GuidedActionAvailability> {
  return Object.values(GUIDED_ACTIONS).map((action) => ({
    ...action,
    ...getGuidedActionAvailability(action.id, context)
  }));
}

export function getPropertyOptions(
  componentId: string | undefined,
  context: GuidedActionContext
): GuidedActionOption[] {
  const component = componentById(context, componentId);
  const contract = contractFor(context, component?.type);
  if (component === undefined || contract === undefined || !component.hasContract) {
    return [];
  }
  const schema = isRecord(contract.propsSchema) ? contract.propsSchema : {};
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string')
    : [];
  return Object.entries(properties)
    .filter(([name]) => !isSecretLike(name) && name !== 'open')
    .map(([name, raw]) => {
      const property = isRecord(raw) ? raw : {};
      return {
        value: name,
        label: typeof property.title === 'string' ? property.title : name,
        description: typeof property.description === 'string' ? property.description : undefined,
        type: typeof property.type === 'string' ? property.type : undefined,
        required: required.includes(name)
      };
    });
}

export function getQueryOptions(context: GuidedActionContext): GuidedActionOption[] {
  return usableQueries(context).map((query) => ({
    value: query.id,
    label: query.name,
    description: query.modelName === undefined ? undefined : `Model: ${query.modelName}`
  }));
}

export function getDataSourceOptions(context: GuidedActionContext): GuidedActionOption[] {
  return usableDataSources(context).map((source) => ({
    value: source.id,
    label: source.name,
    description: source.modelName === undefined ? undefined : `Model: ${source.modelName}`
  }));
}

export function getFormOptions(context: GuidedActionContext): GuidedActionOption[] {
  return formComponents(context).map((component) => ({
    value: component.id,
    label: component.displayName,
    description: component.type
  }));
}

export function getOverlayOptions(
  action: GuidedActionId,
  context: GuidedActionContext
): GuidedActionOption[] {
  return context.overlays
    .filter((overlay) => supportsOverlayEvent(overlay, action))
    .map((overlay) => ({
      value: overlay.id,
      label: overlay.displayName,
      description: overlay.type
    }));
}

export function getComponentEventOptions(
  componentId: string | undefined,
  context: GuidedActionContext
): GuidedActionOption[] {
  const component = componentById(context, componentId);
  return (component?.events ?? []).map((event) => ({
    value: event.name,
    label: event.name,
    description: event.description
  }));
}

export function getActionId(node: WorkflowGraphNode): GuidedActionId {
  const intent = readAuthoringMetadata(node.event)?.intent;
  const match = Object.values(GUIDED_ACTIONS).find((action) => action.intent === intent);
  return match?.id ?? 'raise-event';
}

export function getActionLabel(node: WorkflowGraphNode): string {
  return GUIDED_ACTIONS[getActionId(node)].label;
}

export function suggestNextActions(
  node: WorkflowGraphNode,
  context: GuidedActionContext
): Array<GuidedActionDefinition & GuidedActionAvailability> {
  const action = getActionId(node);
  let candidates: GuidedActionId[];
  switch (action) {
    case 'validate-form':
      candidates = ['save-data', 'show-message', 'update-component'];
      break;
    case 'fetch-data':
    case 'save-data':
    case 'fill-modal':
    case 'raise-and-listen':
      candidates = ['fill-modal', 'update-component', 'show-message'];
      break;
    case 'open-modal':
    case 'open-drawer':
    case 'close-overlay':
      candidates = ['fetch-data', 'update-component', 'show-message', 'close-overlay'];
      break;
    default:
      candidates = [
        'open-modal',
        'open-drawer',
        'fetch-data',
        'update-component',
        'show-message',
        'listen-event'
      ];
  }
  const seen = new Set<GuidedActionId>();
  return listGuidedActions(context).filter((candidate) => {
    if (!candidate.available || !candidates.includes(candidate.id) || seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
}

function defaultConfigForAction(
  id: GuidedActionId,
  context: GuidedActionContext
): GuidedActionConfig {
  const query = usableQueries(context)[0];
  const source = usableDataSources(context)[0];
  const form = formComponents(context)[0];
  switch (id) {
    case 'open-modal':
    case 'open-drawer': {
      const overlay = overlayForAction(context, id);
      return {
        targetComponentId: overlay?.id,
        targetAction: 'open'
      };
    }
    case 'close-overlay': {
      const overlay = overlayForAction(context, id);
      return {
        targetComponentId: overlay?.id,
        targetAction: overlay?.supportedEvents.includes('close') ? 'close' : 'cancel'
      };
    }
    case 'fetch-data':
      return { queryId: query?.id, dataSourceId: query?.sourceId ?? source?.id };
    case 'save-data':
      return { dataSourceId: source?.id };
    case 'update-component': {
      const component = componentsWithProperties(context)[0];
      return {
        targetComponentId: component?.id,
        targetProperty: getPropertyOptions(component?.id, context)[0]?.value
      };
    }
    case 'fill-modal': {
      const overlay = context.overlays.find(
        (candidate) =>
          supportsOverlayEvent(candidate, 'open-modal') &&
          getPropertyOptions(candidate.id, context).length > 0
      );
      return {
        targetComponentId: overlay?.id,
        targetProperty: getPropertyOptions(overlay?.id, context)[0]?.value,
        queryId: query?.id
      };
    }
    case 'validate-form':
      return { formId: form?.id };
    case 'show-message':
      return { message: 'The operation could not be completed.' };
    default:
      return {};
  }
}

function runtimeActionFor(
  id: GuidedActionId,
  config: GuidedActionConfig,
  context: GuidedActionContext
): WorkflowAuthoringRuntimeAction | undefined {
  const actionName: Record<GuidedActionId, string | undefined> = {
    'start-from-component': undefined,
    'open-modal': 'openModal',
    'open-drawer': 'openModal',
    'close-overlay': config.targetAction === 'cancel' ? undefined : 'closeModal',
    'fetch-data': 'queryData',
    'save-data': undefined,
    'update-component': 'setComponentProp',
    'fill-modal': 'setComponentProp',
    'validate-form': 'validateForm',
    'show-message': 'showMessage',
    'listen-event': undefined,
    'raise-event': undefined,
    'raise-and-listen': undefined
  };
  const action = actionName[id];
  if (action === undefined) {
    return undefined;
  }
  const query = context.data.queries.find((candidate) => candidate.id === config.queryId);
  const source = context.data.dataSources.find((candidate) => candidate.id === config.dataSourceId);
  const params: Record<string, string | number | boolean> = {};
  if (config.targetComponentId !== undefined) {
    params.target = config.targetComponentId;
  }
  if (config.targetProperty !== undefined) {
    params.prop = config.targetProperty;
  }
  if (config.formId !== undefined) {
    params.formId = config.formId;
  }
  if (config.message !== undefined) {
    params.message = config.message;
  }
  if (action === 'queryData' || action === 'createRecord') {
    const model = query?.modelId ?? source?.modelId;
    if (model !== undefined) {
      params.model = model;
    }
    if (action === 'queryData') {
      params.path = 'data';
    }
  }
  return { action, params };
}

function metadataForAction(
  id: GuidedActionId,
  config: GuidedActionConfig,
  context: GuidedActionContext
): Partial<WorkflowAuthoringMetadata> {
  const action = GUIDED_ACTIONS[id];
  const source = componentById(context, config.sourceComponentId);
  const target = componentById(context, config.targetComponentId);
  return {
    intent: action.intent,
    ...(config.sourceComponentId === undefined
      ? {}
      : { sourceComponentId: config.sourceComponentId }),
    ...(source === undefined ? {} : { sourceComponentType: source.type }),
    ...(config.sourceEventName === undefined ? {} : { sourceEventName: config.sourceEventName }),
    ...(config.targetComponentId === undefined
      ? {}
      : { targetComponentId: config.targetComponentId }),
    ...(target === undefined ? {} : { targetComponentType: target.type }),
    ...(config.targetAction === undefined ? {} : { targetAction: config.targetAction }),
    ...(config.targetProperty === undefined ? {} : { targetProperty: config.targetProperty }),
    ...(config.dataSourceId === undefined ? {} : { dataSourceId: config.dataSourceId }),
    ...(config.queryId === undefined ? {} : { queryId: config.queryId }),
    ...(config.formId === undefined ? {} : { formId: config.formId })
  };
}

function identifierInput(
  id: GuidedActionId,
  config: GuidedActionConfig,
  context: GuidedActionContext,
  target?: WorkflowRef
) {
  const action = GUIDED_ACTIONS[id];
  const source = componentById(context, config.sourceComponentId ?? target?.nodeId);
  const query = context.data.queries.find((candidate) => candidate.id === config.queryId);
  return {
    intent: action.intent,
    sourceComponentId: config.sourceComponentId ?? target?.nodeId,
    sourceComponentType: source?.type,
    sourceEventName: config.sourceEventName ?? target?.eventName,
    targetComponentId: config.targetComponentId,
    targetComponentType: componentById(context, config.targetComponentId)?.type,
    targetAction: config.targetAction,
    dataSourceId: config.dataSourceId,
    queryId: config.queryId,
    queryName: query?.name,
    action: config.action ?? config.targetAction ?? id
  };
}

export function createGuidedNode(
  id: GuidedActionId,
  context: GuidedActionContext,
  options: {
    config?: GuidedActionConfig;
    target?: WorkflowRef;
    label?: string;
    usedIdentifiers?: ReadonlySet<string>;
  } = {}
): WorkflowGraphNode {
  const action = GUIDED_ACTIONS[id];
  const config = { ...defaultConfigForAction(id, context), ...options.config };
  const base = createEventNode(action.nodeType, options.target);
  const event = applyGeneratedIdentifiers(
    {
      ...base.event,
      name: options.label ?? action.label,
      identifier: '',
      source: '',
      ...(action.nodeType === 'riseListen' ? { incomingIdentifier: '' } : {})
    },
    identifierInput(id, config, context, options.target),
    options.usedIdentifiers
  );
  let node: WorkflowGraphNode = {
    ...base,
    label: options.label ?? action.label,
    description: action.description,
    event
  };
  node = {
    ...node,
    event: updateAuthoringMetadata(node.event, {
      ...metadataForAction(id, config, context),
      runtimeAction: runtimeActionFor(id, config, context)
    })
  };
  return node;
}

export function configureGuidedNode(
  node: WorkflowGraphNode,
  id: GuidedActionId,
  patch: GuidedActionConfig,
  context: GuidedActionContext,
  target?: WorkflowRef
): WorkflowGraphNode {
  const existing = readAuthoringMetadata(node.event);
  const config: GuidedActionConfig = {
    sourceComponentId: existing?.sourceComponentId,
    sourceEventName: existing?.sourceEventName,
    targetComponentId: existing?.targetComponentId,
    targetAction: existing?.targetAction,
    targetProperty: existing?.targetProperty,
    dataSourceId: existing?.dataSourceId,
    queryId: existing?.queryId,
    formId: existing?.formId,
    ...patch
  };
  const event = applyGeneratedIdentifiers(node.event, identifierInput(id, config, context, target));
  let next: WorkflowGraphNode = { ...node, event };
  next = {
    ...next,
    event: updateAuthoringMetadata(next.event, {
      ...metadataForAction(id, config, context),
      runtimeAction: runtimeActionFor(id, config, context)
    })
  };
  return next;
}

export function getMappingSources(
  node: WorkflowGraphNode,
  context: GuidedActionContext
): GuidedActionOption[] {
  const queryId = readAuthoringMetadata(node.event)?.queryId;
  const query = context.data.queries.find((candidate) => candidate.id === queryId);
  return (query?.fields ?? []).map((field) => ({
    value: `payload.data.${field}`,
    label: field,
    description: `payload.data.${field}`
  }));
}

export function getMappingDestinations(
  node: WorkflowGraphNode,
  context: GuidedActionContext
): GuidedActionOption[] {
  const metadata = readAuthoringMetadata(node.event);
  const options = getPropertyOptions(metadata?.targetComponentId, context);
  if (metadata?.targetProperty === undefined) {
    return options;
  }
  return options.filter((option) => option.value === metadata.targetProperty);
}

export function setGuidedMapping(
  node: WorkflowGraphNode,
  destination: string,
  expression: string
): WorkflowGraphNode {
  if (destination.trim().length === 0 || !isSafeMappingExpression(expression)) {
    return node;
  }
  const metadata = readAuthoringMetadata(node.event);
  const responseMapping = {
    ...(metadata?.responseMapping ?? {}),
    [destination]: expression.trim()
  };
  const payloadMapping = { ...(node.event.payloadMapping ?? {}), [destination]: expression.trim() };
  return {
    ...node,
    event: updateAuthoringMetadata({ ...node.event, payloadMapping }, { responseMapping })
  };
}

export function removeGuidedMapping(
  node: WorkflowGraphNode,
  destination: string
): WorkflowGraphNode {
  const metadata = readAuthoringMetadata(node.event);
  const responseMapping = { ...(metadata?.responseMapping ?? {}) };
  const payloadMapping = { ...(node.event.payloadMapping ?? {}) };
  delete responseMapping[destination];
  delete payloadMapping[destination];
  return {
    ...node,
    event: updateAuthoringMetadata({ ...node.event, payloadMapping }, { responseMapping })
  };
}

export function getGuidedRuntimeActionIssues(node: WorkflowGraphNode): string[] {
  const runtimeAction = readAuthoringMetadata(node.event)?.runtimeAction;
  if (runtimeAction === undefined) {
    return [];
  }
  return validateRuntimeAction(runtimeAction);
}

export function guidedConfigurationIssues(
  node: WorkflowGraphNode,
  context: GuidedActionContext
): GuidedConfigurationIssue[] {
  const action = getActionId(node);
  const metadata = readAuthoringMetadata(node.event);
  const issues: GuidedConfigurationIssue[] = [];
  const add = (code: string, message: string, field?: string) =>
    issues.push({ code, message, severity: 'error', nodeId: node.id, field });

  if (
    metadata?.sourceComponentId !== undefined &&
    metadata.sourceEventName !== undefined &&
    !getComponentEventOptions(metadata.sourceComponentId, context).some(
      (event) => event.value === metadata.sourceEventName
    )
  ) {
    add(
      'UNSUPPORTED_COMPONENT_EVENT',
      'This component does not support the selected event.',
      'sourceEventName'
    );
  }
  if (TARGET_REQUIRED_ACTIONS.has(action)) {
    const targetId = metadata?.targetComponentId;
    const target = resolveWorkflowComponent(context.definition, context.contracts, targetId ?? '');
    if (targetId === undefined || target.status !== 'resolved') {
      add('MISSING_TARGET_COMPONENT', 'Choose a valid target component.', 'targetComponentId');
    } else if (
      (OVERLAY_OPEN_ACTIONS.has(action) || action === 'close-overlay') &&
      !supportsOverlayEvent(overlayById(context, targetId), action)
    ) {
      add(
        'UNSUPPORTED_OVERLAY_EVENT',
        'The selected component does not support this overlay operation.',
        'targetComponentId'
      );
    }
  }
  if (action === 'fetch-data' && metadata?.queryId === undefined) {
    add('MISSING_DATA_QUERY', 'Select a data source before configuring the response.', 'queryId');
  }
  if (action === 'save-data' && metadata?.dataSourceId === undefined) {
    add('MISSING_DATA_SOURCE', 'Select a NOVA data source.', 'dataSourceId');
  }
  if (action === 'validate-form' && metadata?.formId !== undefined) {
    const form = getFormOptions(context).find((candidate) => candidate.value === metadata.formId);
    if (form === undefined) {
      add('MISSING_FORM', 'Select an existing form component.', 'formId');
    }
  }
  if (
    (action === 'fill-modal' || action === 'fetch-data') &&
    Object.keys(metadata?.responseMapping ?? {}).length === 0 &&
    getMappingSources(node, context).length > 0 &&
    getMappingDestinations(node, context).length > 0
  ) {
    issues.push({
      code: 'MISSING_VISUAL_MAPPING',
      message: 'Map at least one response field to a destination property.',
      severity: 'warning',
      nodeId: node.id,
      field: 'responseMapping'
    });
  }
  for (const issue of getGuidedRuntimeActionIssues(node)) {
    issues.push({
      code: 'INVALID_RUNTIME_ACTION',
      message: `Runtime action configuration: ${issue}`,
      severity: 'warning',
      nodeId: node.id,
      field: 'runtimeAction'
    });
  }
  return issues;
}

export function friendlyIssueMessage(issue: WorkflowDesignerIssue): string {
  return FRIENDLY_MESSAGES[issue.code] ?? issue.message;
}

export function getSourceComponentStatus(
  node: WorkflowGraphNode,
  context: GuidedActionContext
): {
  status: 'unspecified' | 'resolved' | 'renamed-or-missing' | 'missing-contract';
  label: string;
} {
  const id = readAuthoringMetadata(node.event)?.sourceComponentId;
  if (id === undefined) {
    return { status: 'unspecified', label: 'No source component selected' };
  }
  const resolution = resolveWorkflowComponent(context.definition, context.contracts, id);
  if (resolution.status === 'missing-component') {
    return { status: 'renamed-or-missing', label: 'Source component is no longer available' };
  }
  if (resolution.status === 'missing-contract') {
    return { status: 'missing-contract', label: 'Source component has no contract' };
  }
  return {
    status: 'resolved',
    label: `${resolution.component?.displayName ?? 'Component'} · ${resolution.component?.type ?? ''}`
  };
}
