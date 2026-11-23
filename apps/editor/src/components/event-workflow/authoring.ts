import type { WorkflowEventConfiguration } from '@nova/spec';

export const AUTHORING_METADATA_ROOT = 'nova';
export const AUTHORING_METADATA_KEY = 'ui';
export const AUTHORING_METADATA_VERSION = 1;
export const AUTHORING_METADATA_PATH = 'metadata.nova.ui';

export const WORKFLOW_INTENTS = [
  'component-event',
  'button-clicked',
  'open-modal',
  'open-drawer',
  'close-modal',
  'close-overlay',
  'fetch-data',
  'save-data',
  'update-component',
  'fill-modal',
  'validate-form',
  'show-error',
  'show-message',
  'listen-event',
  'raise-event',
  'raise-and-listen'
] as const;

export type WorkflowIntent = (typeof WORKFLOW_INTENTS)[number];
export type IdentifierOrigin = 'generated' | 'manual' | 'legacy';
export type AuthoringRuntimeActionParam = string | number | boolean;

export interface WorkflowAuthoringRuntimeAction {
  action: string;
  params?: Record<string, AuthoringRuntimeActionParam>;
}

export interface WorkflowAuthoringMetadata {
  version: typeof AUTHORING_METADATA_VERSION;
  intent: WorkflowIntent;
  sourceComponentId?: string;
  sourceComponentType?: string;
  sourceEventName?: string;
  targetComponentId?: string;
  targetComponentType?: string;
  targetAction?: string;
  targetProperty?: string;
  dataSourceId?: string;
  queryId?: string;
  formId?: string;
  requestMapping?: Record<string, string>;
  responseMapping?: Record<string, string>;
  runtimeAction?: WorkflowAuthoringRuntimeAction;
  generatedIdentifier?: string;
  generatedIncomingIdentifier?: string;
  identifierOrigin: IdentifierOrigin;
}

export interface CreateWorkflowAuthoringMetadataInput {
  intent: WorkflowIntent;
  sourceComponentId?: string;
  sourceComponentType?: string;
  sourceEventName?: string;
  targetComponentId?: string;
  targetComponentType?: string;
  targetAction?: string;
  targetProperty?: string;
  dataSourceId?: string;
  queryId?: string;
  formId?: string;
  requestMapping?: Record<string, string>;
  responseMapping?: Record<string, string>;
  runtimeAction?: WorkflowAuthoringRuntimeAction;
  generatedIdentifier?: string;
  generatedIncomingIdentifier?: string;
  identifierOrigin?: IdentifierOrigin;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9._:$-]+$/;
const MAPPING_EXPRESSION_PATTERN = /^(event|payload|data|state|form)\.[A-Za-z0-9_$.[\]-]+$/;

const INTENT_SET = new Set<string>(WORKFLOW_INTENTS);
const IDENTIFIER_ORIGINS = new Set<string>(['generated', 'manual', 'legacy']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeToken(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength || !SAFE_TOKEN_PATTERN.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function safeUuid(value: unknown): string | undefined {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    return undefined;
  }
  return value;
}

function safeMapping(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, expression] of Object.entries(value)) {
    const safeKey = safeToken(key, 120);
    if (
      safeKey === undefined ||
      typeof expression !== 'string' ||
      !MAPPING_EXPRESSION_PATTERN.test(expression.trim())
    ) {
      continue;
    }
    result[safeKey] = expression.trim();
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f) {
      return true;
    }
  }
  return false;
}

function safeRuntimeAction(value: unknown): WorkflowAuthoringRuntimeAction | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const action = safeToken(value.action, 80);
  if (action === undefined) {
    return undefined;
  }
  const params: Record<string, AuthoringRuntimeActionParam> = {};
  if (isRecord(value.params)) {
    for (const [key, parameter] of Object.entries(value.params)) {
      const safeKey = safeToken(key, 80);
      if (safeKey === undefined) {
        continue;
      }
      if (typeof parameter === 'string') {
        if (parameter.length <= 500 && !hasControlCharacter(parameter)) {
          params[safeKey] = parameter;
        }
      } else if (typeof parameter === 'number' && Number.isFinite(parameter)) {
        params[safeKey] = parameter;
      } else if (typeof parameter === 'boolean') {
        params[safeKey] = parameter;
      }
    }
  }
  return {
    action,
    ...(Object.keys(params).length > 0 ? { params } : {})
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalMapping(value: unknown): Record<string, string> | undefined {
  return isRecord(value) ? (value as Record<string, string>) : undefined;
}

function optionalRuntimeAction(value: unknown): WorkflowAuthoringRuntimeAction | undefined {
  return safeRuntimeAction(value);
}

export function isSafeMappingExpression(value: string): boolean {
  return MAPPING_EXPRESSION_PATTERN.test(value.trim());
}

function isIntent(value: unknown): value is WorkflowIntent {
  return typeof value === 'string' && INTENT_SET.has(value);
}

function isIdentifierOrigin(value: unknown): value is IdentifierOrigin {
  return typeof value === 'string' && IDENTIFIER_ORIGINS.has(value);
}

export function createAuthoringMetadata(
  input: CreateWorkflowAuthoringMetadataInput
): WorkflowAuthoringMetadata {
  const generatedIdentifier = safeToken(input.generatedIdentifier);
  const generatedIncomingIdentifier = safeToken(input.generatedIncomingIdentifier);
  const hasGeneratedIdentifier = generatedIdentifier !== undefined;
  return {
    version: AUTHORING_METADATA_VERSION,
    intent: input.intent,
    ...(safeUuid(input.sourceComponentId) === undefined
      ? {}
      : { sourceComponentId: safeUuid(input.sourceComponentId) }),
    ...(safeToken(input.sourceComponentType, 80) === undefined
      ? {}
      : { sourceComponentType: safeToken(input.sourceComponentType, 80) }),
    ...(safeToken(input.sourceEventName, 80) === undefined
      ? {}
      : { sourceEventName: safeToken(input.sourceEventName, 80) }),
    ...(safeUuid(input.targetComponentId) === undefined
      ? {}
      : { targetComponentId: safeUuid(input.targetComponentId) }),
    ...(safeToken(input.targetComponentType, 80) === undefined
      ? {}
      : { targetComponentType: safeToken(input.targetComponentType, 80) }),
    ...(safeToken(input.targetAction, 80) === undefined
      ? {}
      : { targetAction: safeToken(input.targetAction, 80) }),
    ...(safeToken(input.targetProperty, 80) === undefined
      ? {}
      : { targetProperty: safeToken(input.targetProperty, 80) }),
    ...(safeUuid(input.dataSourceId) === undefined
      ? {}
      : { dataSourceId: safeUuid(input.dataSourceId) }),
    ...(safeUuid(input.queryId) === undefined ? {} : { queryId: safeUuid(input.queryId) }),
    ...(safeUuid(input.formId) === undefined ? {} : { formId: safeUuid(input.formId) }),
    ...(safeMapping(input.requestMapping) === undefined
      ? {}
      : { requestMapping: safeMapping(input.requestMapping) }),
    ...(safeMapping(input.responseMapping) === undefined
      ? {}
      : { responseMapping: safeMapping(input.responseMapping) }),
    ...(safeRuntimeAction(input.runtimeAction) === undefined
      ? {}
      : { runtimeAction: safeRuntimeAction(input.runtimeAction) }),
    ...(generatedIdentifier === undefined ? {} : { generatedIdentifier }),
    ...(generatedIncomingIdentifier === undefined ? {} : { generatedIncomingIdentifier }),
    identifierOrigin: input.identifierOrigin ?? (hasGeneratedIdentifier ? 'generated' : 'legacy')
  };
}

export function parseAuthoringMetadata(value: unknown): WorkflowAuthoringMetadata | undefined {
  if (!isRecord(value) || value.version !== AUTHORING_METADATA_VERSION || !isIntent(value.intent)) {
    return undefined;
  }
  if (!isIdentifierOrigin(value.identifierOrigin)) {
    return undefined;
  }
  return createAuthoringMetadata({
    intent: value.intent,
    sourceComponentId: optionalString(value.sourceComponentId),
    sourceComponentType: optionalString(value.sourceComponentType),
    sourceEventName: optionalString(value.sourceEventName),
    targetComponentId: optionalString(value.targetComponentId),
    targetComponentType: optionalString(value.targetComponentType),
    targetAction: optionalString(value.targetAction),
    targetProperty: optionalString(value.targetProperty),
    dataSourceId: optionalString(value.dataSourceId),
    queryId: optionalString(value.queryId),
    formId: optionalString(value.formId),
    requestMapping: optionalMapping(value.requestMapping),
    responseMapping: optionalMapping(value.responseMapping),
    runtimeAction: optionalRuntimeAction(value.runtimeAction),
    generatedIdentifier: optionalString(value.generatedIdentifier),
    generatedIncomingIdentifier: optionalString(value.generatedIncomingIdentifier),
    identifierOrigin: value.identifierOrigin
  });
}

export function readAuthoringMetadata(
  event: WorkflowEventConfiguration
): WorkflowAuthoringMetadata | undefined {
  if (!isRecord(event.metadata)) {
    return undefined;
  }
  const root = event.metadata[AUTHORING_METADATA_ROOT];
  if (!isRecord(root)) {
    return undefined;
  }
  return parseAuthoringMetadata(root[AUTHORING_METADATA_KEY]);
}

export function writeAuthoringMetadata(
  event: WorkflowEventConfiguration,
  metadata: WorkflowAuthoringMetadata
): WorkflowEventConfiguration {
  const currentMetadata: Record<string, unknown> = isRecord(event.metadata)
    ? { ...event.metadata }
    : {};
  const currentRoot: Record<string, unknown> = isRecord(currentMetadata[AUTHORING_METADATA_ROOT])
    ? { ...(currentMetadata[AUTHORING_METADATA_ROOT] as Record<string, unknown>) }
    : {};
  return {
    ...event,
    metadata: {
      ...currentMetadata,
      [AUTHORING_METADATA_ROOT]: {
        ...currentRoot,
        [AUTHORING_METADATA_KEY]: metadata
      }
    }
  };
}

export function updateAuthoringMetadata(
  event: WorkflowEventConfiguration,
  patch: Partial<WorkflowAuthoringMetadata>
): WorkflowEventConfiguration {
  const current =
    readAuthoringMetadata(event) ??
    createAuthoringMetadata({ intent: patch.intent ?? 'raise-event' });
  return writeAuthoringMetadata(
    event,
    createAuthoringMetadata({
      ...current,
      ...patch
    })
  );
}

export function clearAuthoringMetadata(
  event: WorkflowEventConfiguration
): WorkflowEventConfiguration {
  if (!isRecord(event.metadata) || !isRecord(event.metadata[AUTHORING_METADATA_ROOT])) {
    return event;
  }
  const currentMetadata = { ...event.metadata };
  const currentRoot = { ...(event.metadata[AUTHORING_METADATA_ROOT] as Record<string, unknown>) };
  delete currentRoot[AUTHORING_METADATA_KEY];
  if (Object.keys(currentRoot).length === 0) {
    delete currentMetadata[AUTHORING_METADATA_ROOT];
  } else {
    currentMetadata[AUTHORING_METADATA_ROOT] = currentRoot;
  }
  return { ...event, metadata: currentMetadata };
}
