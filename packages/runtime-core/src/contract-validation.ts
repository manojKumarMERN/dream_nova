import type { ComponentContract } from '@nova/contracts';
import {
  breakpointOverridesSchema,
  componentLayoutSchema,
  type AppDefinition,
  type ComponentNode
} from '@nova/spec';

export interface ContractValidationIssue {
  nodeId: string;
  nodeType: string;
  path: string;
  message: string;
}

interface JsonSchema {
  type?: string | undefined;
  properties?: Record<string, JsonSchema> | undefined;
  required?: string[] | undefined;
  additionalProperties?: boolean | undefined;
  enum?: unknown[] | undefined;
  minimum?: number | undefined;
  maximum?: number | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  pattern?: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

function validateSchemaValue(schema: JsonSchema, value: unknown, path: string): string[] {
  const issues: string[] = [];
  if (schema.enum !== undefined && !schema.enum.some((candidate) => candidate === value)) {
    issues.push(`${path} must be one of ${schema.enum.map(String).join(', ')}`);
    return issues;
  }
  if (schema.type === 'object') {
    if (!isRecord(value)) {
      issues.push(`${path} must be an object`);
      return issues;
    }
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (!(required in value)) {
        issues.push(`${path}.${required} is required`);
      }
    }
    for (const [key, item] of Object.entries(value)) {
      const child = properties[key];
      if (child === undefined) {
        if (schema.additionalProperties === false) {
          issues.push(`${path}.${key} is not defined by the component contract`);
        }
        continue;
      }
      issues.push(...validateSchemaValue(child, item, `${path}.${key}`));
    }
    return issues;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      issues.push(`${path} must be an array`);
    }
    return issues;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      issues.push(`${path} must be a string`);
      return issues;
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push(`${path} must contain at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push(`${path} must contain at most ${schema.maxLength} characters`);
    }
    if (schema.pattern !== undefined) {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          issues.push(`${path} does not match the required pattern`);
        }
      } catch {
        issues.push(`${path} has an invalid contract pattern`);
      }
    }
    return issues;
  }
  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push(`${path} must be a number`);
      return issues;
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push(`${path} must be at least ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push(`${path} must be at most ${schema.maximum}`);
    }
    return issues;
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    issues.push(`${path} must be a boolean`);
  }
  return issues;
}

function validateNode(
  node: ComponentNode,
  contracts: readonly ComponentContract[],
  issues: ContractValidationIssue[]
): void {
  const contract = contracts.find(
    (candidate) => candidate.type === node.type && candidate.version === node.contractVersion
  );
  if (contract === undefined) {
    issues.push({
      nodeId: node.id,
      nodeType: node.type,
      path: 'contractVersion',
      message: `No component contract found for ${node.type}@${node.contractVersion}`
    });
  } else {
    if (isRecord(contract.propsSchema) && Object.keys(contract.propsSchema).length > 0) {
      for (const message of validateSchemaValue(
        contract.propsSchema as JsonSchema,
        node.props,
        'props'
      )) {
        issues.push({ nodeId: node.id, nodeType: node.type, path: 'props', message });
      }
    }
    const declaredEvents = Object.keys(contract.events);
    if (declaredEvents.length > 0) {
      for (const event of Object.keys(node.events ?? {})) {
        if (!declaredEvents.includes(event)) {
          issues.push({
            nodeId: node.id,
            nodeType: node.type,
            path: `events.${event}`,
            message: `Event ${event} is not declared by ${node.type}`
          });
        }
      }
    }
  }

  if (node.layout !== undefined && !componentLayoutSchema.safeParse(node.layout).success) {
    issues.push({
      nodeId: node.id,
      nodeType: node.type,
      path: 'layout',
      message: 'Layout contains unsupported properties or values'
    });
  }
  if (
    node.breakpointOverrides !== undefined &&
    !breakpointOverridesSchema.safeParse(node.breakpointOverrides).success
  ) {
    issues.push({
      nodeId: node.id,
      nodeType: node.type,
      path: 'breakpointOverrides',
      message: 'Breakpoint overrides contain unsupported properties or values'
    });
  }

  for (const child of node.children ?? []) {
    validateNode(child, contracts, issues);
  }
  for (const slotNodes of Object.values(node.slots ?? {})) {
    for (const child of slotNodes) {
      validateNode(child, contracts, issues);
    }
  }
}

export function validateRuntimeDefinitionContracts(
  definition: AppDefinition,
  contracts: readonly ComponentContract[]
): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  for (const component of definition.components) {
    validateNode(component, contracts, issues);
  }
  return issues;
}

export function formatContractIssues(issues: readonly ContractValidationIssue[]): string[] {
  return issues.map((issue) => `${issue.nodeId} ${issue.nodeType} ${issue.path}: ${issue.message}`);
}

export function contractIssueDescriptors(issues: readonly ContractValidationIssue[]): string[] {
  return Array.from(new Set(issues.map((issue) => `${issue.nodeType}:${issue.path}`))).sort();
}

export function describeValueType(value: unknown): string {
  return describe(value);
}
