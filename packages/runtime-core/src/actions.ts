import { z } from 'zod';
import { RUNTIME_EXPRESSION_FUNCTIONS, validateExpression } from './expressions';
import {
  isWritableComponentProp,
  isWritablePath,
  parseSafePath,
  resolveRuntimeLimits,
  type RuntimePolicy
} from './policy';

export const RUNTIME_ACTIONS = [
  'setState',
  'setComponentState',
  'setFormValue',
  'showComponent',
  'hideComponent',
  'toggleComponent',
  'openModal',
  'closeModal',
  'navigate',
  'validateForm',
  'showMessage',
  'setLoading',
  'resetForm',
  'setComponentProp',
  'queryData',
  'createRecord',
  'updateRecord',
  'deleteRecord'
] as const;

export type RuntimeActionName = (typeof RUNTIME_ACTIONS)[number];

export interface RuntimeActionDefinition {
  action: string;
  params?: Record<string, unknown> | undefined;
}

const runtimeActionSchema = z
  .object({
    action: z.string().min(1),
    params: z.record(z.unknown()).optional()
  })
  .strict();

const BLOCKED_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  params: Record<string, unknown>,
  key: string,
  issues: string[],
  policy?: RuntimePolicy | undefined
): string | undefined {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(`${key} must be a non-empty string`);
    return undefined;
  }
  if (key === 'path' && parseSafePath(value, resolveRuntimeLimits(policy)) === undefined) {
    issues.push(`${key} is not a safe property path`);
    return undefined;
  }
  return value;
}

function validateParams(
  value: unknown,
  path: string,
  issues: string[],
  policy: RuntimePolicy | undefined,
  depth: number
): void {
  const limits = resolveRuntimeLimits(policy);
  if (depth > limits.maxInterpolationDepth) {
    issues.push(`${path}: value is nested too deeply`);
    return;
  }
  if (typeof value === 'string') {
    if (value.length > limits.maxInterpolatedLength) {
      issues.push(`${path}: value is too long`);
      return;
    }
    const matches = value.matchAll(/\{\{([\s\S]+?)\}\}/g);
    for (const match of matches) {
      const expression = match[1];
      if (expression === undefined) {
        continue;
      }
      const allowedFunctions =
        policy?.allowedExpressionFunctions === undefined
          ? RUNTIME_EXPRESSION_FUNCTIONS
          : new Set(policy.allowedExpressionFunctions);
      for (const issue of validateExpression(expression, limits, allowedFunctions)) {
        issues.push(`${path}: ${issue.message} at ${String(issue.position)}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > limits.maxNestedActionLength) {
      issues.push(`${path}: array is too long`);
      return;
    }
    value.forEach((item, index) =>
      validateParams(item, `${path}[${String(index)}]`, issues, policy, depth + 1)
    );
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (BLOCKED_KEYS.has(key)) {
      issues.push(`${path}.${key} is not allowed`);
      continue;
    }
    validateParams(item, `${path}.${key}`, issues, policy, depth + 1);
  }
}

export function validateRuntimeAction(
  input: unknown,
  policy?: RuntimePolicy | undefined,
  depth = 0
): string[] {
  const limits = resolveRuntimeLimits(policy);
  if (depth > limits.maxNestedActionDepth) {
    return ['nested actions are limited'];
  }
  const parsed = runtimeActionSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'action'}: ${issue.message}`
    );
  }

  const issues: string[] = [];
  if (!(RUNTIME_ACTIONS as readonly string[]).includes(parsed.data.action)) {
    issues.push(`Unsupported action: ${parsed.data.action}`);
    return issues;
  }
  const allowed = policy?.allowedActions ?? RUNTIME_ACTIONS;
  if (!(allowed as readonly string[]).includes(parsed.data.action)) {
    issues.push('Action is not allowed by the current policy');
    return issues;
  }

  const params = parsed.data.params ?? {};
  validateParams(params, 'params', issues, policy, 0);

  switch (parsed.data.action as RuntimeActionName) {
    case 'setState':
    case 'setComponentState': {
      const path = requireString(params, 'path', issues, policy);
      if (
        path !== undefined &&
        parsed.data.action === 'setState' &&
        !isWritablePath(path, policy)
      ) {
        issues.push('path is not writable by the current policy');
      }
      break;
    }
    case 'setFormValue':
      requireString(params, 'field', issues, policy);
      break;
    case 'showComponent':
    case 'hideComponent':
    case 'toggleComponent':
    case 'openModal':
    case 'closeModal':
      requireString(params, 'target', issues, policy);
      break;
    case 'navigate':
      if (
        typeof params.pageId !== 'string' &&
        typeof params.route !== 'string' &&
        typeof params.href !== 'string' &&
        typeof params.target !== 'string'
      ) {
        issues.push('One of pageId, route, href or target must be a string');
      }
      break;
    case 'validateForm':
      requireString(params, 'formId', issues, policy);
      for (const key of ['onSuccess', 'onError'] as const) {
        const nested = params[key];
        if (nested === undefined) {
          continue;
        }
        if (!Array.isArray(nested)) {
          issues.push(`${key} must be an array of actions`);
          continue;
        }
        if (nested.length > limits.maxNestedActionLength) {
          issues.push(`${key} is too long`);
          continue;
        }
        nested.forEach((action, index) => {
          for (const issue of validateRuntimeAction(action, policy, depth + 1)) {
            issues.push(`${key}[${String(index)}]: ${issue}`);
          }
        });
      }
      break;
    case 'resetForm':
      requireString(params, 'formId', issues, policy);
      break;
    case 'setLoading':
      requireString(params, 'target', issues, policy);
      if (params.loading !== undefined && typeof params.loading !== 'boolean') {
        issues.push('loading must be a boolean');
      }
      break;
    case 'setComponentProp': {
      requireString(params, 'target', issues, policy);
      const prop = requireString(params, 'prop', issues, policy);
      if (prop !== undefined && !isWritableComponentProp(prop, policy)) {
        issues.push('prop is not writable by the current policy');
      }
      break;
    }
    case 'showMessage':
      requireString(params, 'message', issues, policy);
      break;
    case 'queryData': {
      requireString(params, 'model', issues, policy);
      const path = requireString(params, 'path', issues, policy);
      if (path !== undefined && !isWritablePath(path, policy)) {
        issues.push('path is not writable by the current policy');
      }
      if (params.page !== undefined && (typeof params.page !== 'number' || params.page < 1)) {
        issues.push('page must be a positive number');
      }
      if (
        params.pageSize !== undefined &&
        (typeof params.pageSize !== 'number' || params.pageSize < 1 || params.pageSize > 200)
      ) {
        issues.push('pageSize must be between 1 and 200');
      }
      break;
    }
    case 'createRecord': {
      requireString(params, 'model', issues, policy);
      if (!isRecord(params.values)) {
        issues.push('values must be an object');
      }
      break;
    }
    case 'updateRecord': {
      requireString(params, 'model', issues, policy);
      requireString(params, 'recordId', issues, policy);
      if (!isRecord(params.values)) {
        issues.push('values must be an object');
      }
      break;
    }
    case 'deleteRecord': {
      requireString(params, 'model', issues, policy);
      requireString(params, 'recordId', issues, policy);
      break;
    }
  }

  return issues;
}

export function assertValidRuntimeAction(
  input: unknown,
  policy?: RuntimePolicy | undefined
): RuntimeActionDefinition {
  const issues = validateRuntimeAction(input, policy);
  if (issues.length > 0) {
    throw new Error(`Invalid runtime action: ${issues.join('; ')}`);
  }
  return input as RuntimeActionDefinition;
}
