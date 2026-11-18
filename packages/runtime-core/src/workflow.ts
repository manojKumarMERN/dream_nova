import { NovaError, NovaErrorCodes } from '@nova/errors';
import type {
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowErrorHandler,
  WorkflowStep
} from '@nova/spec';
import type { WorkflowContext, WorkflowDeps } from './types';

const ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  'validateForm',
  'createRecord',
  'updateRecord',
  'deleteRecord',
  'apiRequest',
  'navigate',
  'showMessage',
  'condition',
  'setState'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.').filter((part) => part.length > 0)) {
    if (Array.isArray(current)) {
      current = current[Number(segment)];
      continue;
    }
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function readField(field: string, context: WorkflowContext): unknown {
  const fromData = readPath(context.data, field);
  if (fromData !== undefined) {
    return fromData;
  }
  const fromPayload = readPath(context.payload, field);
  return fromPayload === undefined && field === 'event' ? context.event : fromPayload;
}

function evaluateCondition(condition: WorkflowCondition, context: WorkflowContext): boolean {
  const actual = readField(condition.path, context);
  switch (condition.op) {
    case 'eq':
      return actual === condition.value;
    case 'ne':
      return actual !== condition.value;
    case 'gt':
      return Number(actual) > Number(condition.value);
    case 'gte':
      return Number(actual) >= Number(condition.value);
    case 'lt':
      return Number(actual) < Number(condition.value);
    case 'lte':
      return Number(actual) <= Number(condition.value);
    case 'contains':
      return typeof actual === 'string' && actual.includes(String(condition.value));
  }
}

async function invokeAction(
  type: string,
  params: Record<string, unknown>,
  context: WorkflowContext,
  deps: WorkflowDeps
): Promise<unknown> {
  const custom = deps.actions?.[type];
  if (custom !== undefined) {
    return custom(params, context);
  }

  switch (type) {
    case 'navigate': {
      if (deps.navigate === undefined) {
        throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'No navigate handler is configured');
      }
      return deps.navigate(String(params.target ?? params.route ?? params.path ?? ''), context);
    }
    case 'showMessage': {
      if (deps.notify === undefined) {
        throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'No notify handler is configured');
      }
      return deps.notify(String(params.message ?? params.text ?? ''), context);
    }
    case 'createRecord':
    case 'updateRecord':
    case 'deleteRecord':
    case 'apiRequest': {
      const handler =
        type === 'createRecord'
          ? deps.dataAccess?.create
          : type === 'updateRecord'
            ? deps.dataAccess?.update
            : type === 'deleteRecord'
              ? deps.dataAccess?.delete
              : deps.dataAccess?.request;
      if (handler === undefined) {
        throw new NovaError(
          NovaErrorCodes.VALIDATION_FAILED,
          'No data access handler is configured',
          {
            details: { action: type }
          }
        );
      }
      return handler(params, context);
    }
    case 'validateForm':
      return true;
    case 'setState': {
      const key = params.key ?? params.path;
      if (typeof key === 'string' && key.length > 0 && isRecord(context.data.state)) {
        context.data.state[key] = params.value;
      }
      return params.value;
    }
    default:
      throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Unsupported workflow action', {
        details: { action: type }
      });
  }
}

async function runHandler(
  handler: WorkflowErrorHandler,
  context: WorkflowContext,
  deps: WorkflowDeps
): Promise<unknown> {
  if (!ALLOWED_ACTIONS.has(handler.type)) {
    throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Unsupported workflow action', {
      details: { action: handler.type }
    });
  }
  return invokeAction(handler.type, handler.params ?? {}, context, deps);
}

async function runStep(
  step: WorkflowStep,
  context: WorkflowContext,
  deps: WorkflowDeps
): Promise<unknown> {
  if (!ALLOWED_ACTIONS.has(step.type)) {
    throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Unsupported workflow action', {
      details: { action: step.type }
    });
  }
  if (step.type === 'condition') {
    return step.params?.value ?? false;
  }
  return invokeAction(step.type, step.params ?? {}, context, deps);
}

export async function executeWorkflow(
  workflow: WorkflowDefinition,
  context: WorkflowContext,
  deps: WorkflowDeps = {}
): Promise<unknown> {
  if (!workflow.enabled) {
    return undefined;
  }

  let result: unknown;
  for (const step of workflow.steps) {
    if (step.condition !== undefined && !evaluateCondition(step.condition, context)) {
      continue;
    }

    try {
      result = await runStep(step, context, deps);
    } catch (error) {
      const handlers = step.onError ?? [];
      if (handlers.length === 0) {
        throw error;
      }
      for (const handler of handlers) {
        result = await runHandler(handler, context, deps);
      }
    }
  }
  return result;
}
