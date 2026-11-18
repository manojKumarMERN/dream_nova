import type { AppDefinition, ComponentNode } from '@nova/spec';

export type ValidationRuleType = 'required' | 'email' | 'number' | 'min' | 'max' | 'pattern';

export interface ValidationRule {
  type: ValidationRuleType;
  value?: string | number | undefined;
  message?: string | undefined;
}

export interface FormFieldDefinition {
  id: string;
  name: string;
  label: string;
  type: string;
  rules: ValidationRule[];
}

export interface FormValidationResult {
  errors: Record<string, string>;
  formErrors: string[];
  valid: boolean;
}

const INPUT_TYPES: ReadonlySet<string> = new Set([
  'nova.text-input',
  'nova.textarea',
  'nova.number-input',
  'nova.email-input',
  'nova.password-input',
  'nova.select',
  'nova.checkbox',
  'nova.radio-group',
  'nova.date-picker',
  'nova.file-upload'
]);

const RULE_TYPES: ReadonlySet<string> = new Set([
  'required',
  'email',
  'number',
  'min',
  'max',
  'pattern'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findComponentPath(
  nodes: readonly ComponentNode[],
  nodeId: string,
  trail: readonly ComponentNode[] = []
): ComponentNode[] | undefined {
  for (const node of nodes) {
    const nextTrail = [...trail, node];
    if (node.id === nodeId) {
      return nextTrail;
    }
    const childPath = findComponentPath(node.children ?? [], nodeId, nextTrail);
    if (childPath !== undefined) {
      return childPath;
    }
    for (const slotNodes of Object.values(node.slots ?? {})) {
      const slotPath = findComponentPath(slotNodes, nodeId, nextTrail);
      if (slotPath !== undefined) {
        return slotPath;
      }
    }
  }
  return undefined;
}

export function findComponent(
  definition: AppDefinition,
  nodeId: string
): ComponentNode | undefined {
  const path = findComponentPath(definition.components, nodeId);
  return path?.[path.length - 1];
}

export function findFormForNode(
  definition: AppDefinition,
  nodeId: string
): ComponentNode | undefined {
  const path = findComponentPath(definition.components, nodeId);
  return path
    ?.slice(0, -1)
    .reverse()
    .find((node) => node.type === 'nova.form');
}

function parseRules(value: unknown): ValidationRule[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rules: ValidationRule[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.type !== 'string' || !RULE_TYPES.has(item.type)) {
      continue;
    }
    const rule: ValidationRule = { type: item.type as ValidationRuleType };
    if (typeof item.value === 'string' || typeof item.value === 'number') {
      rule.value = item.value;
    }
    if (typeof item.message === 'string') {
      rule.message = item.message;
    }
    rules.push(rule);
  }
  return rules;
}

function inferRules(node: ComponentNode): ValidationRule[] {
  const rules = parseRules(node.props.rules);
  if (node.props.required === true && !rules.some((rule) => rule.type === 'required')) {
    rules.unshift({ type: 'required' });
  }
  if (node.type === 'nova.email-input' && !rules.some((rule) => rule.type === 'email')) {
    rules.push({ type: 'email' });
  }
  if (node.type === 'nova.number-input' && !rules.some((rule) => rule.type === 'number')) {
    rules.push({ type: 'number' });
  }
  if (typeof node.props.min === 'number' || typeof node.props.min === 'string') {
    rules.push({ type: 'min', value: node.props.min as string | number });
  }
  if (typeof node.props.max === 'number' || typeof node.props.max === 'string') {
    rules.push({ type: 'max', value: node.props.max as string | number });
  }
  if (typeof node.props.pattern === 'string') {
    rules.push({ type: 'pattern', value: node.props.pattern });
  }
  return rules;
}

function collectFields(nodes: readonly ComponentNode[], fields: FormFieldDefinition[]): void {
  for (const node of nodes) {
    if (node.type === 'nova.form') {
      continue;
    }
    if (INPUT_TYPES.has(node.type)) {
      const name =
        typeof node.props.name === 'string' && node.props.name.length > 0
          ? node.props.name
          : node.id;
      fields.push({
        id: node.id,
        name,
        label: typeof node.props.label === 'string' ? node.props.label : name,
        type: node.type,
        rules: inferRules(node)
      });
    }
    collectFields(node.children ?? [], fields);
    for (const slotNodes of Object.values(node.slots ?? {})) {
      collectFields(slotNodes, fields);
    }
  }
}

export function collectFormFields(form: ComponentNode): FormFieldDefinition[] {
  const fields: FormFieldDefinition[] = [];
  collectFields(form.children ?? [], fields);
  for (const slotNodes of Object.values(form.slots ?? {})) {
    collectFields(slotNodes, fields);
  }
  return fields;
}

export function validateFormValues(
  fields: readonly FormFieldDefinition[],
  values: Record<string, unknown>
): FormValidationResult {
  const errors: Record<string, string> = {};
  const formErrors: string[] = [];

  for (const field of fields) {
    const value = values[field.name];
    const text = value === undefined || value === null ? '' : String(value);
    for (const rule of field.rules) {
      switch (rule.type) {
        case 'required':
          if (text.trim().length === 0) {
            errors[field.name] = rule.message ?? `${field.label} is required`;
          }
          break;
        case 'email':
          if (text.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
            errors[field.name] = rule.message ?? `${field.label} must be a valid email`;
          }
          break;
        case 'number':
          if (text.length > 0 && !Number.isFinite(Number(text))) {
            errors[field.name] = rule.message ?? `${field.label} must be a number`;
          }
          break;
        case 'min': {
          const minimum = Number(rule.value);
          if (text.length > 0 && Number.isFinite(minimum) && Number(text) < minimum) {
            errors[field.name] =
              rule.message ?? `${field.label} must be at least ${String(minimum)}`;
          }
          break;
        }
        case 'max': {
          const maximum = Number(rule.value);
          if (text.length > 0 && Number.isFinite(maximum) && Number(text) > maximum) {
            errors[field.name] =
              rule.message ?? `${field.label} must be at most ${String(maximum)}`;
          }
          break;
        }
        case 'pattern': {
          const pattern = typeof rule.value === 'string' ? rule.value : '';
          if (pattern.length > 0 && text.length > 0) {
            try {
              if (!new RegExp(pattern).test(text)) {
                errors[field.name] = rule.message ?? `${field.label} has an invalid format`;
              }
            } catch {
              formErrors.push(`Invalid validation pattern for ${field.label}`);
            }
          }
          break;
        }
      }
    }
  }

  return { errors, formErrors, valid: Object.keys(errors).length === 0 && formErrors.length === 0 };
}
