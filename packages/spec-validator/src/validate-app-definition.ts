import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import { builtInComponentRegistry } from '@nova/component-registry';
import type { ComponentRegistry } from '@nova/component-registry';
import {
  appDefinitionSchema,
  bindingKindSchema,
  breakpointSchema,
  componentLayoutSchema,
  platformTargetSchema,
  type AppDefinition,
  type Binding,
  type ComponentNode,
  type PlatformTarget
} from '@nova/spec';
import type { ValidationIssue, ValidationResult } from './validation-result';

export interface ValidationOptions {
  registry?: ComponentRegistry;
}

interface NodeLocation {
  node: ComponentNode;
  path: string;
  parentId?: string | undefined;
}

const BINDING_SOURCES: readonly string[] = bindingKindSchema.options;

const SAFE_BINDING_TRANSFORMS = new Set([
  'identity',
  'string',
  'number',
  'boolean',
  'trim',
  'uppercase',
  'lowercase',
  'capitalize',
  'date',
  'datetime',
  'currency',
  'percent',
  'percentage',
  'json',
  'parsejson',
  'stringify',
  'first',
  'last',
  'length',
  'default',
  'format',
  'map',
  'join',
  'filter',
  'sum',
  'round',
  'abs',
  'slugify',
  'urlencode',
  'htmlencode'
]);

const DANGEROUS_BINDING_TRANSFORMS = new Set([
  'eval',
  'exec',
  'function',
  'newfunction',
  'constructor',
  'prototype',
  '__proto__',
  'raw',
  'unsafe',
  'unsafehtml',
  'html',
  'dangerouslysetinnerhtml',
  'script',
  'javascript',
  'compile',
  'run'
]);

function pathFromZod(path: Array<string | number>): string {
  return path.length === 0 ? '$' : path.join('.');
}

function hasCycle(value: unknown, ancestors: Set<object> = new Set()): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  if (ancestors.has(value)) {
    return true;
  }

  ancestors.add(value);
  for (const child of Object.values(value)) {
    if (hasCycle(child, ancestors)) {
      return true;
    }
  }
  ancestors.delete(value);
  return false;
}

function collectNodes(
  nodes: readonly ComponentNode[],
  path: string,
  result: NodeLocation[],
  parentId?: string
): void {
  nodes.forEach((node, index) => {
    const nodePath = `${path}[${index}]`;
    result.push({ node, path: nodePath, parentId });

    if (node.children !== undefined) {
      collectNodes(node.children, `${nodePath}.children`, result, node.id);
    }

    Object.entries(node.slots ?? {}).forEach(([slotName, slotNodes]) => {
      collectNodes(slotNodes, `${nodePath}.slots.${slotName}`, result, node.id);
    });
  });
}

function childrenOf(node: ComponentNode): ComponentNode[] {
  const children = [...(node.children ?? [])];
  for (const slotNodes of Object.values(node.slots ?? {})) {
    children.push(...slotNodes);
  }
  return children;
}

function ajvIssue(error: ErrorObject, path: string): ValidationIssue {
  return {
    code: 'INVALID_COMPONENT_PROPS',
    path: `${path}.props${error.instancePath}`,
    message: error.message ?? 'Invalid component props',
    severity: 'error'
  };
}

const WORKFLOW_REFERENCE_KEYS = new Set([
  'workflow',
  'workflowId',
  'workflowRef',
  'targetWorkflowId'
]);

function collectWorkflowReference(value: unknown, key: string): string | undefined {
  if (!WORKFLOW_REFERENCE_KEYS.has(key)) {
    return undefined;
  }
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function validateWorkflows(
  definition: AppDefinition,
  nodeLocations: readonly NodeLocation[],
  nodesById: ReadonlyMap<string, NodeLocation>,
  pageIds: ReadonlySet<string>,
  issues: ValidationIssue[]
): void {
  const workflowIds = new Set<string>();
  const references: Array<{ id: string; path: string }> = [];

  definition.workflows.forEach((workflow, index) => {
    if (workflowIds.has(workflow.id)) {
      issues.push({
        code: 'DUPLICATE_WORKFLOW_ID',
        path: `workflows[${index}].id`,
        message: `Duplicate workflow id: ${workflow.id}`,
        severity: 'error'
      });
    }
    workflowIds.add(workflow.id);

    const stepIds = new Set<string>();
    workflow.steps.forEach((step, stepIndex) => {
      if (stepIds.has(step.id)) {
        issues.push({
          code: 'DUPLICATE_WORKFLOW_STEP_ID',
          path: `workflows[${index}].steps[${stepIndex}].id`,
          message: `Duplicate workflow step id: ${step.id}`,
          severity: 'error'
        });
      }
      stepIds.add(step.id);

      for (const [key, value] of Object.entries(step.params ?? {})) {
        const reference = collectWorkflowReference(value, key);
        if (reference !== undefined) {
          references.push({
            id: reference,
            path: `workflows[${index}].steps[${stepIndex}].params.${key}`
          });
        }
      }

      for (const [handlerIndex, handler] of (step.onError ?? []).entries()) {
        for (const [key, value] of Object.entries(handler.params ?? {})) {
          const reference = collectWorkflowReference(value, key);
          if (reference !== undefined) {
            references.push({
              id: reference,
              path: `workflows[${index}].steps[${stepIndex}].onError[${handlerIndex}].params.${key}`
            });
          }
        }
      }
    });

    if (workflow.trigger.nodeId !== undefined && !nodesById.has(workflow.trigger.nodeId)) {
      issues.push({
        code: 'UNKNOWN_WORKFLOW_NODE',
        path: `workflows[${index}].trigger.nodeId`,
        message: `Workflow trigger references an unknown node: ${workflow.trigger.nodeId}`,
        severity: 'error'
      });
    }

    if (workflow.trigger.pageId !== undefined && !pageIds.has(workflow.trigger.pageId)) {
      issues.push({
        code: 'UNKNOWN_WORKFLOW_PAGE',
        path: `workflows[${index}].trigger.pageId`,
        message: `Workflow trigger references an unknown page: ${workflow.trigger.pageId}`,
        severity: 'error'
      });
    }
  });

  for (const location of nodeLocations) {
    for (const [eventName, binding] of Object.entries(location.node.events ?? {})) {
      for (const [key, value] of Object.entries(binding.params ?? {})) {
        const reference = collectWorkflowReference(value, key);
        if (reference !== undefined) {
          references.push({
            id: reference,
            path: `${location.path}.events.${eventName}.params.${key}`
          });
        }
      }
    }
  }

  for (const reference of references) {
    if (!workflowIds.has(reference.id)) {
      issues.push({
        code: 'UNKNOWN_WORKFLOW_ID',
        path: reference.path,
        message: `Unknown workflow id: ${reference.id}`,
        severity: 'error'
      });
    }
  }
}

function validateBinding(
  binding: Binding,
  path: string,
  definition: AppDefinition,
  issues: ValidationIssue[]
): void {
  const source = binding.kind ?? binding.source;

  if (!BINDING_SOURCES.includes(binding.source)) {
    issues.push({
      code: 'INVALID_BINDING_SOURCE',
      path: `${path}.source`,
      message: `Invalid binding source: ${binding.source}`,
      severity: 'error'
    });
  }

  if (binding.kind !== undefined && binding.kind !== binding.source) {
    issues.push({
      code: 'INVALID_BINDING_SOURCE',
      path: `${path}.kind`,
      message: `Binding kind ${binding.kind} does not match source ${binding.source}`,
      severity: 'error'
    });
  }

  const segments = binding.path.split('.');
  if (binding.path.trim().length === 0 || segments.some((segment) => segment.trim().length === 0)) {
    issues.push({
      code: 'INVALID_BINDING_PATH',
      path: `${path}.path`,
      message: `Invalid binding path: ${binding.path}`,
      severity: 'error'
    });
  }

  if (binding.transform !== undefined) {
    const transform = binding.transform.toLowerCase();
    if (DANGEROUS_BINDING_TRANSFORMS.has(transform)) {
      issues.push({
        code: 'DANGEROUS_BINDING_TRANSFORM',
        path: `${path}.transform`,
        message: `Dangerous binding transform: ${binding.transform}`,
        severity: 'error'
      });
    } else if (!SAFE_BINDING_TRANSFORMS.has(transform)) {
      issues.push({
        code: 'INVALID_BINDING_TRANSFORM',
        path: `${path}.transform`,
        message: `Invalid binding transform: ${binding.transform}`,
        severity: 'error'
      });
    }
  }

  if (definition.dataModels.length === 0) {
    return;
  }

  const models = new Map<string, Set<string>>();
  for (const model of definition.dataModels) {
    const fields = new Set(model.fields.map((field) => field.name));
    models.set(model.name, fields);
    models.set(model.id, fields);
  }

  if ((source === 'model' || source === 'collection') && !models.has(segments[0] ?? '')) {
    issues.push({
      code: 'UNKNOWN_BINDING_MODEL',
      path: `${path}.path`,
      message: `Binding references an unknown data model: ${segments[0] ?? ''}`,
      severity: 'error'
    });
  }

  if (
    source === 'collection' &&
    binding.collection !== undefined &&
    !models.has(binding.collection)
  ) {
    issues.push({
      code: 'UNKNOWN_BINDING_COLLECTION',
      path: `${path}.collection`,
      message: `Binding references an unknown collection: ${binding.collection}`,
      severity: 'error'
    });
  }

  const fields = models.get(segments[0] ?? '');
  if (fields !== undefined && segments[1] !== undefined && !fields.has(segments[1])) {
    issues.push({
      code: 'UNKNOWN_BINDING_FIELD',
      path: `${path}.path`,
      message: `Binding references an unknown data model field: ${segments[1]}`,
      severity: 'warning'
    });
  }
}

function validateVisualMetadata(
  definition: AppDefinition,
  nodeLocations: readonly NodeLocation[],
  nodesById: ReadonlyMap<string, NodeLocation>,
  issues: ValidationIssue[]
): void {
  for (const location of nodeLocations) {
    const { node } = location;

    for (const [prop, binding] of Object.entries(node.bindings ?? {})) {
      validateBinding(binding, `${location.path}.bindings.${prop}`, definition, issues);
    }

    if (node.layout !== undefined && !componentLayoutSchema.safeParse(node.layout).success) {
      issues.push({
        code: 'INVALID_COMPONENT_LAYOUT',
        path: `${location.path}.layout`,
        message: `Invalid component layout on node: ${node.id}`,
        severity: 'error'
      });
    }

    for (const [breakpoint, layout] of Object.entries(node.breakpointOverrides ?? {})) {
      if (!breakpointSchema.safeParse(breakpoint).success) {
        issues.push({
          code: 'INVALID_BREAKPOINT_OVERRIDE',
          path: `${location.path}.breakpointOverrides.${breakpoint}`,
          message: `Invalid breakpoint override: ${breakpoint}`,
          severity: 'error'
        });
      }
      if (!componentLayoutSchema.safeParse(layout).success) {
        issues.push({
          code: 'INVALID_COMPONENT_LAYOUT',
          path: `${location.path}.breakpointOverrides.${breakpoint}`,
          message: `Invalid breakpoint layout on node: ${node.id}`,
          severity: 'error'
        });
      }
    }
  }

  definition.metadata.editorLocks.forEach((nodeId, index) => {
    if (!nodesById.has(nodeId)) {
      issues.push({
        code: 'UNKNOWN_EDITOR_LOCK_NODE',
        path: `metadata.editorLocks[${index}]`,
        message: `Editor lock references an unknown node: ${nodeId}`,
        severity: 'error'
      });
    }
  });
}

function validateDefinitionSemantics(
  definition: AppDefinition,
  registry: ComponentRegistry,
  issues: ValidationIssue[]
): void {
  const pageIds = new Set<string>();
  const routes = new Set<string>();

  definition.pages.forEach((page, index) => {
    if (pageIds.has(page.id)) {
      issues.push({
        code: 'DUPLICATE_PAGE_ID',
        path: `pages[${index}].id`,
        message: `Duplicate page id: ${page.id}`,
        severity: 'error'
      });
    }
    pageIds.add(page.id);

    if (routes.has(page.route)) {
      issues.push({
        code: 'DUPLICATE_PAGE_ROUTE',
        path: `pages[${index}].route`,
        message: `Duplicate page route: ${page.route}`,
        severity: 'error'
      });
    }
    routes.add(page.route);
  });

  const nodeLocations: NodeLocation[] = [];
  collectNodes(definition.components, 'components', nodeLocations);

  const nodesById = new Map<string, NodeLocation>();
  for (const location of nodeLocations) {
    const existing = nodesById.get(location.node.id);
    if (existing !== undefined) {
      issues.push({
        code: 'DUPLICATE_NODE_ID',
        path: `${location.path}.id`,
        message: `Duplicate component node id: ${location.node.id}`,
        severity: 'error'
      });
    } else {
      nodesById.set(location.node.id, location);
    }
  }

  validateWorkflows(definition, nodeLocations, nodesById, pageIds, issues);
  validateVisualMetadata(definition, nodeLocations, nodesById, issues);

  for (const [index, page] of definition.pages.entries()) {
    if (!nodesById.has(page.rootNodeId)) {
      issues.push({
        code: 'INVALID_ROOT_NODE',
        path: `pages[${index}].rootNodeId`,
        message: `Root node does not exist: ${page.rootNodeId}`,
        severity: 'error'
      });
    }
  }

  const childrenByParent = new Map<string, string[]>();
  for (const location of nodeLocations) {
    if (location.parentId === undefined) {
      continue;
    }
    const children = childrenByParent.get(location.parentId) ?? [];
    children.push(location.node.id);
    childrenByParent.set(location.parentId, children);
  }

  const reachabilityStack: string[] = [];
  const reachable = new Set<string>();

  function visit(nodeId: string): void {
    if (reachabilityStack.includes(nodeId)) {
      issues.push({
        code: 'COMPONENT_CYCLE',
        path: `components`,
        message: `Component tree contains a cycle at node: ${nodeId}`,
        severity: 'error'
      });
      return;
    }
    if (reachable.has(nodeId)) {
      return;
    }

    reachabilityStack.push(nodeId);
    for (const childId of childrenByParent.get(nodeId) ?? []) {
      visit(childId);
    }
    reachabilityStack.pop();
    reachable.add(nodeId);
  }

  for (const page of definition.pages) {
    visit(page.rootNodeId);
  }

  for (const location of nodeLocations) {
    if (!reachable.has(location.node.id)) {
      issues.push({
        code: 'ORPHAN_COMPONENT',
        path: location.path,
        message: `Component node is not reachable from any page: ${location.node.id}`,
        severity: 'error'
      });
    }
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validatorCache = new Map<string, ValidateFunction>();

  for (const location of nodeLocations) {
    const { node } = location;
    const contract = registry.get(node.type, node.contractVersion);

    if (contract === undefined) {
      issues.push({
        code: 'UNKNOWN_COMPONENT_CONTRACT',
        path: location.path,
        message: `No contract registered for ${node.type}@${node.contractVersion}`,
        severity: 'error'
      });
      continue;
    }

    const cacheKey = `${contract.type}@${contract.version}`;
    let validator = validatorCache.get(cacheKey);
    if (validator === undefined) {
      try {
        validator = ajv.compile(contract.propsSchema as object);
        validatorCache.set(cacheKey, validator);
      } catch (error) {
        issues.push({
          code: 'INVALID_COMPONENT_CONTRACT_SCHEMA',
          path: location.path,
          message: error instanceof Error ? error.message : 'Invalid component props schema',
          severity: 'error'
        });
        continue;
      }
    }

    if (!validator(node.props)) {
      issues.push(...(validator.errors ?? []).map((error) => ajvIssue(error, location.path)));
    }

    const targetOverlap = definition.targets.some((target: PlatformTarget) =>
      contract.supportedTargets.includes(target)
    );
    if (!targetOverlap) {
      issues.push({
        code: 'INCOMPATIBLE_TARGET',
        path: location.path,
        message: `${contract.type}@${contract.version} does not support any selected target`,
        severity: 'error'
      });
    }

    for (const target of Object.keys(node.targetOverrides ?? {})) {
      if (!platformTargetSchema.safeParse(target).success) {
        issues.push({
          code: 'INVALID_TARGET_OVERRIDE',
          path: `${location.path}.targetOverrides.${target}`,
          message: `Invalid target override: ${target}`,
          severity: 'error'
        });
      }
    }

    const parentId = location.parentId;
    if (parentId !== undefined && contract.constraints.allowedParents !== undefined) {
      const parent = nodesById.get(parentId);
      if (parent !== undefined && !contract.constraints.allowedParents.includes(parent.node.type)) {
        issues.push({
          code: 'INVALID_PARENT_COMPONENT',
          path: location.path,
          message: `${contract.type} cannot be nested inside ${parent.node.type}`,
          severity: 'error'
        });
      }
    }

    const children = childrenOf(node);
    if (contract.constraints.allowedChildren !== undefined) {
      for (const child of children) {
        if (!contract.constraints.allowedChildren.includes(child.type)) {
          issues.push({
            code: 'INVALID_CHILD_COMPONENT',
            path: location.path,
            message: `${contract.type} cannot contain ${child.type}`,
            severity: 'error'
          });
        }
      }
    }

    if (
      contract.constraints.maxChildren !== undefined &&
      children.length > contract.constraints.maxChildren
    ) {
      issues.push({
        code: 'TOO_MANY_CHILDREN',
        path: location.path,
        message: `${contract.type} allows at most ${contract.constraints.maxChildren} children`,
        severity: 'error'
      });
    }
  }
}

export function validateAppDefinition(
  input: unknown,
  options: ValidationOptions = {}
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (hasCycle(input)) {
    issues.push({
      code: 'CIRCULAR_REFERENCE',
      path: '$',
      message: 'Application definition contains a circular reference',
      severity: 'error'
    });
    return { valid: false, issues };
  }

  const parsed = appDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    issues.push(
      ...parsed.error.issues.map((issue) => ({
        code: `SCHEMA_${issue.code}`,
        path: pathFromZod(issue.path),
        message: issue.message,
        severity: 'error' as const
      }))
    );
    return { valid: false, issues };
  }

  const registry = options.registry ?? builtInComponentRegistry;
  validateDefinitionSemantics(parsed.data, registry, issues);

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues
  };
}

export function assertValidAppDefinition(
  input: unknown,
  options: ValidationOptions = {}
): AppDefinition {
  const result = validateAppDefinition(input, options);
  if (!result.valid) {
    throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Application definition is invalid', {
      details: { issues: result.issues }
    });
  }

  return appDefinitionSchema.parse(input);
}
