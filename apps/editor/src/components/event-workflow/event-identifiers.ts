import type { WorkflowEventConfiguration } from '@nova/spec';
import {
  createAuthoringMetadata,
  readAuthoringMetadata,
  writeAuthoringMetadata,
  type WorkflowIntent
} from './authoring';

export interface EventIdentifierInput {
  intent: WorkflowIntent;
  sourceComponentId?: string;
  sourceComponentType?: string;
  sourceEventName?: string;
  targetComponentId?: string;
  targetComponentType?: string;
  targetAction?: string;
  dataSourceId?: string;
  queryId?: string;
  queryName?: string;
  action?: string;
}

export interface GeneratedEventIdentifiers {
  identifier: string;
  incomingIdentifier?: string;
}

const EVENT_WORDS: Record<string, string> = {
  click: 'clicked',
  clicked: 'clicked',
  submit: 'submitted',
  submitted: 'submitted',
  change: 'changed',
  changed: 'changed',
  load: 'loaded',
  loaded: 'loaded'
};

export function normalizeIdentifier(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 120)
    .replace(/\.+$/g, '');
  return normalized.length > 0 ? normalized : 'event';
}

function componentToken(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizeIdentifier(value.replace(/^nova\./i, ''));
}

function eventToken(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = normalizeIdentifier(value);
  return EVENT_WORDS[normalized] ?? normalized;
}

function actionToken(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeIdentifier(value);
}

function joinIdentifier(...parts: Array<string | undefined>): string {
  const tokens = parts.filter((part): part is string => part !== undefined && part.length > 0);
  return normalizeIdentifier(tokens.join('.'));
}

function buildBaseIdentifiers(input: EventIdentifierInput): GeneratedEventIdentifiers {
  const sourceType = componentToken(input.sourceComponentType);
  const targetType = componentToken(input.targetComponentType);
  const sourceEvent = eventToken(input.sourceEventName);
  const action = actionToken(input.targetAction ?? input.action);
  const dataName =
    eventToken(input.queryName) ??
    (input.queryId === undefined ? undefined : normalizeIdentifier(input.queryId.slice(0, 8)));

  switch (input.intent) {
    case 'button-clicked':
      return { identifier: joinIdentifier('ui', sourceType ?? 'button', sourceEvent ?? 'clicked') };
    case 'component-event':
      return {
        identifier: joinIdentifier('ui', sourceType ?? sourceEvent ?? 'component', sourceEvent)
      };
    case 'open-modal':
      return { identifier: joinIdentifier('ui', targetType ?? 'modal', action ?? 'open') };
    case 'close-modal':
      return { identifier: joinIdentifier('ui', targetType ?? 'modal', action ?? 'close') };
    case 'update-component':
      return { identifier: joinIdentifier('ui', targetType ?? 'component', action ?? 'update') };
    case 'show-error':
      return { identifier: joinIdentifier('ui', targetType ?? 'component', 'error') };
    case 'fetch-data': {
      const identifier = joinIdentifier('data', dataName ?? 'request', 'fetch', 'requested');
      return {
        identifier,
        incomingIdentifier: normalizeIdentifier(identifier.replace(/\.requested$/, '.responded'))
      };
    }
    case 'raise-and-listen': {
      const identifier = joinIdentifier('event', action ?? sourceEvent ?? 'request', 'requested');
      return {
        identifier,
        incomingIdentifier: normalizeIdentifier(identifier.replace(/\.requested$/, '.responded'))
      };
    }
    case 'listen-event':
      return {
        identifier: joinIdentifier('event', sourceType ?? sourceEvent ?? 'external', sourceEvent)
      };
    case 'raise-event':
    default:
      return { identifier: joinIdentifier('event', sourceEvent ?? action ?? 'raised') };
  }
}

function stableIdentity(input: EventIdentifierInput): string {
  return [
    input.intent,
    input.sourceComponentId,
    input.sourceComponentType,
    input.sourceEventName,
    input.targetComponentId,
    input.targetComponentType,
    input.targetAction,
    input.dataSourceId,
    input.queryId,
    input.queryName,
    input.action
  ]
    .filter((value): value is string => value !== undefined)
    .join('|');
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, '0').slice(-6);
}

function uniqueIdentifier(base: string, seed: string, used: Set<string>): string {
  if (!used.has(base)) {
    return base;
  }
  const suffix = shortHash(seed);
  let candidate = normalizeIdentifier(`${base}.${suffix}`);
  let counter = 2;
  while (used.has(candidate)) {
    candidate = normalizeIdentifier(`${base}.${suffix}.${counter}`);
    counter += 1;
  }
  return candidate;
}

export function generateEventIdentifiers(
  input: EventIdentifierInput,
  usedIdentifiers: ReadonlySet<string> = new Set<string>()
): GeneratedEventIdentifiers {
  const base = buildBaseIdentifiers(input);
  const seed = stableIdentity(input);
  const used = new Set(usedIdentifiers);
  const identifier = uniqueIdentifier(base.identifier, seed, used);
  used.add(identifier);
  if (base.incomingIdentifier === undefined) {
    return { identifier };
  }
  const incomingIdentifier = uniqueIdentifier(base.incomingIdentifier, `${seed}|response`, used);
  return { identifier, incomingIdentifier };
}

export function generateCorrelationKey(): string {
  return 'event.correlationId';
}

export function generateEventSource(input: EventIdentifierInput): string {
  if (input.sourceComponentId !== undefined) {
    return `component:${input.sourceComponentId}`;
  }
  if (input.sourceComponentType !== undefined) {
    return normalizeIdentifier(input.sourceComponentType);
  }
  return 'application';
}

function canRegenerate(
  event: WorkflowEventConfiguration,
  metadata: ReturnType<typeof readAuthoringMetadata>
): boolean {
  if (event.identifier.trim().length === 0) {
    return true;
  }
  if (metadata?.identifierOrigin !== 'generated') {
    return false;
  }
  return metadata.generatedIdentifier === event.identifier;
}

export function applyGeneratedIdentifiers(
  event: WorkflowEventConfiguration,
  input: EventIdentifierInput,
  usedIdentifiers: ReadonlySet<string> = new Set<string>()
): WorkflowEventConfiguration {
  const existingMetadata = readAuthoringMetadata(event);
  if (!canRegenerate(event, existingMetadata)) {
    return event;
  }

  const generated = generateEventIdentifiers(input, usedIdentifiers);
  const needsResponse = generated.incomingIdentifier !== undefined;
  const inputMetadata = createAuthoringMetadata({
    intent: input.intent,
    sourceComponentId: input.sourceComponentId,
    sourceComponentType: input.sourceComponentType,
    sourceEventName: input.sourceEventName,
    targetComponentId: input.targetComponentId,
    targetComponentType: input.targetComponentType,
    targetAction: input.targetAction,
    dataSourceId: input.dataSourceId,
    queryId: input.queryId,
    requestMapping: existingMetadata?.requestMapping,
    responseMapping: existingMetadata?.responseMapping,
    generatedIdentifier: generated.identifier,
    generatedIncomingIdentifier: generated.incomingIdentifier,
    identifierOrigin: 'generated'
  });
  const metadata = {
    ...(existingMetadata ?? inputMetadata),
    ...inputMetadata,
    version: inputMetadata.version,
    identifierOrigin: 'generated' as const
  };

  return writeAuthoringMetadata(
    {
      ...event,
      identifier: generated.identifier,
      ...(generated.incomingIdentifier === undefined
        ? {}
        : { incomingIdentifier: generated.incomingIdentifier }),
      ...(event.source.trim().length === 0 ? { source: generateEventSource(input) } : {}),
      ...(needsResponse && event.correlationKey === undefined
        ? { correlationKey: generateCorrelationKey() }
        : {})
    },
    metadata
  );
}

export function withManualIdentifier(
  event: WorkflowEventConfiguration,
  identifier: string,
  intent?: WorkflowIntent
): WorkflowEventConfiguration {
  const existing = readAuthoringMetadata(event);
  const normalized = normalizeIdentifier(identifier);
  const metadata = createAuthoringMetadata({
    intent: existing?.intent ?? intent ?? 'raise-event',
    sourceComponentId: existing?.sourceComponentId,
    sourceComponentType: existing?.sourceComponentType,
    sourceEventName: existing?.sourceEventName,
    targetComponentId: existing?.targetComponentId,
    targetComponentType: existing?.targetComponentType,
    targetAction: existing?.targetAction,
    dataSourceId: existing?.dataSourceId,
    queryId: existing?.queryId,
    requestMapping: existing?.requestMapping,
    responseMapping: existing?.responseMapping,
    generatedIdentifier: normalized,
    generatedIncomingIdentifier: existing?.generatedIncomingIdentifier,
    identifierOrigin: 'manual'
  });
  return writeAuthoringMetadata({ ...event, identifier: normalized }, metadata);
}
