import { appDefinitionSchema, migrateDefinition, runtimePayloadToDefinition } from '@nova/spec';
import type { AppDefinition, ComponentNode, RuntimePayloadLike } from '@nova/spec';
import { validateAppDefinition } from '@nova/spec-validator';
import { validateRuntimeAction } from './actions';
import type { RuntimePolicy } from './policy';
import type { RuntimeTelemetryAdapter } from './telemetry';

export interface RuntimeDefinitionSource {
  load(): Promise<unknown>;
}

export interface LoadRuntimeDefinitionOptions {
  appId?: string | undefined;
  strictValidation?: boolean | undefined;
  policy?: RuntimePolicy | undefined;
  telemetry?: RuntimeTelemetryAdapter | undefined;
  requestId?: string | undefined;
}

export interface RuntimeLoadResult {
  definition: AppDefinition;
  issues: Array<{
    code: string;
    path: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

export class RuntimeLoadError extends Error {
  constructor(
    message: string,
    readonly issues: RuntimeLoadResult['issues']
  ) {
    super(message);
    this.name = 'RuntimeLoadError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportLoadFailure(
  code: string,
  message: string,
  options: LoadRuntimeDefinitionOptions,
  issueCount: number
): void {
  options.telemetry?.emit({
    code,
    category: 'loading',
    level: 'error',
    message,
    timestamp: new Date().toISOString(),
    correlationId: options.requestId ?? 'runtime-load',
    ...(options.appId === undefined ? {} : { appId: options.appId }),
    details: { issueCount }
  });
}

function asRuntimePayload(value: unknown): RuntimePayloadLike | undefined {
  if (!isRecord(value) || !Array.isArray(value.components) || !Array.isArray(value.pages)) {
    return undefined;
  }
  if (typeof value.name !== 'string' || !Array.isArray(value.targets)) {
    return undefined;
  }
  return value as unknown as RuntimePayloadLike;
}

function unwrap(value: unknown): unknown {
  if (!isRecord(value) || !('definition' in value)) {
    return value;
  }
  return unwrap(value.definition);
}

function collectActionIssues(
  nodes: readonly ComponentNode[],
  path: string,
  policy?: RuntimePolicy | undefined
): string[] {
  const issues: string[] = [];
  for (const node of nodes) {
    for (const [event, binding] of Object.entries(node.events ?? {})) {
      for (const issue of validateRuntimeAction(binding, policy)) {
        issues.push(`${path}.${node.id}.events.${event}: ${issue}`);
      }
    }
    issues.push(...collectActionIssues(node.children ?? [], `${path}.${node.id}.children`, policy));
    for (const [slot, slotNodes] of Object.entries(node.slots ?? {})) {
      issues.push(...collectActionIssues(slotNodes, `${path}.${node.id}.slots.${slot}`, policy));
    }
  }
  return issues;
}

export async function loadRuntimeDefinition(
  source: RuntimeDefinitionSource,
  options: LoadRuntimeDefinitionOptions = {}
): Promise<RuntimeLoadResult> {
  const raw = unwrap(await source.load());
  const payload = asRuntimePayload(raw);
  const migrated = migrateDefinition(
    payload === undefined ? raw : runtimePayloadToDefinition(payload, options.appId)
  );
  const definition = appDefinitionSchema.parse(migrated);
  const validation = validateAppDefinition(definition);
  const issues = [...validation.issues];

  if (options.strictValidation === false) {
    const errors = issues.filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      reportLoadFailure(
        'RUNTIME_SPEC_INVALID',
        'Runtime application specification is invalid',
        options,
        errors.length
      );
      throw new RuntimeLoadError('Runtime application specification is invalid', errors);
    }
  } else if (!validation.valid) {
    reportLoadFailure(
      'RUNTIME_SPEC_INVALID',
      'Runtime application specification is invalid',
      options,
      issues.length
    );
    throw new RuntimeLoadError('Runtime application specification is invalid', issues);
  }

  const actionIssues = collectActionIssues(definition.components, 'components', options.policy);
  if (actionIssues.length > 0) {
    reportLoadFailure(
      'INVALID_RUNTIME_ACTION',
      'Runtime application contains invalid action definitions',
      options,
      actionIssues.length
    );
    throw new RuntimeLoadError(
      'Runtime application contains invalid action definitions',
      actionIssues.map((message) => ({
        code: 'INVALID_RUNTIME_ACTION',
        path: 'components',
        message,
        severity: 'error' as const
      }))
    );
  }

  return { definition, issues };
}
