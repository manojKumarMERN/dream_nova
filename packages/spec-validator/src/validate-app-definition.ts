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
  type DataModelDefinition,
  type DataQueryCondition,
  type DataQueryGroup,
  type PlatformTarget,
  type WorkflowDefinition
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

const EVENT_MAPPING_PATTERN = /^(event|payload|data|state|form)\.[A-Za-z0-9_$.[\]-]+$/;

export function validateWorkflowEventGraph(
  workflow: WorkflowDefinition,
  path = 'workflow'
): ValidationIssue[] {
  const graph = workflow.graph;
  if (graph === undefined) {
    return [];
  }

  const issues: ValidationIssue[] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeIds = new Set<string>();
  const outcomesBySource = new Map<string, Set<string>>();
  const adjacency = new Map<string, string[]>();

  graph.nodes.forEach((node, index) => {
    const nodePath = `${path}.graph.nodes[${node.id}]`;
    graph.nodes.slice(0, index).forEach((candidate) => {
      if (candidate.id === node.id) {
        issues.push({
          code: 'DUPLICATE_WORKFLOW_EVENT_NODE',
          path: nodePath,
          message: `Duplicate event node id: ${node.id}`,
          severity: 'error'
        });
      }
    });

    if (node.event.identifier.trim().length === 0) {
      issues.push({
        code: 'MISSING_EVENT_IDENTIFIER',
        path: `${nodePath}.event.identifier`,
        message: `${node.label} needs an event identifier`,
        severity: 'error'
      });
    }
    if (node.event.source.trim().length === 0) {
      issues.push({
        code: 'MISSING_EVENT_SOURCE',
        path: `${nodePath}.event.source`,
        message: `${node.label} needs an event source`,
        severity: 'error'
      });
    }
    if (node.type === 'riseListen') {
      if (node.event.incomingIdentifier === undefined) {
        issues.push({
          code: 'MISSING_RESPONSE_EVENT',
          path: `${nodePath}.event.incomingIdentifier`,
          message: `${node.label} needs the response event it should listen for`,
          severity: 'error'
        });
      }
      if (node.event.correlationKey === undefined) {
        issues.push({
          code: 'MISSING_EVENT_CORRELATION',
          path: `${nodePath}.event.correlationKey`,
          message: `${node.label} needs a correlation key to match request and response events`,
          severity: 'error'
        });
      }
    }

    for (const [target, expression] of Object.entries(node.event.payloadMapping ?? {})) {
      if (!EVENT_MAPPING_PATTERN.test(expression)) {
        issues.push({
          code: 'INVALID_EVENT_PAYLOAD_MAPPING',
          path: `${nodePath}.event.payloadMapping.${target}`,
          message: `${node.label} maps ${target} to an unsupported expression; use event., payload., data., state. or form. paths`,
          severity: 'warning'
        });
      }
    }
  });

  graph.edges.forEach((edge, _index) => {
    const edgePath = `${path}.graph.edges[${edge.id}]`;
    if (edgeIds.has(edge.id)) {
      issues.push({
        code: 'DUPLICATE_WORKFLOW_EVENT_EDGE',
        path: edgePath,
        message: `Duplicate workflow edge id: ${edge.id}`,
        severity: 'error'
      });
    }
    edgeIds.add(edge.id);

    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      issues.push({
        code: 'UNKNOWN_WORKFLOW_EVENT_ENDPOINT',
        path: edgePath,
        message: `Workflow edge ${edge.id} references a node that is not on the canvas`,
        severity: 'error'
      });
      return;
    }
    if (edge.source === edge.target) {
      issues.push({
        code: 'INVALID_WORKFLOW_EVENT_SELF_CONNECTION',
        path: edgePath,
        message: `${nodesById.get(edge.source)?.label ?? edge.source} cannot connect to itself`,
        severity: 'error'
      });
    }

    const outcomes = outcomesBySource.get(edge.source) ?? new Set<string>();
    if (outcomes.has(edge.outcome)) {
      issues.push({
        code: 'DUPLICATE_WORKFLOW_EVENT_OUTCOME',
        path: edgePath,
        message: `${nodesById.get(edge.source)?.label ?? edge.source} already has a ${edge.outcome} branch`,
        severity: 'error'
      });
    }
    outcomes.add(edge.outcome);
    outcomesBySource.set(edge.source, outcomes);

    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  });

  for (const node of graph.nodes) {
    const nodePath = `${path}.graph.nodes[${node.id}]`;
    const outcomes = outcomesBySource.get(node.id) ?? new Set<string>();
    if (!outcomes.has('success')) {
      issues.push({
        code: 'MISSING_SUCCESS_BRANCH',
        path: `${nodePath}.success`,
        message: `${node.label} has no success branch connected`,
        severity: 'warning'
      });
    }
    if (!outcomes.has('failure') && node.event.failureHandling === undefined) {
      issues.push({
        code: 'MISSING_FAILURE_HANDLING',
        path: `${nodePath}.failure`,
        message: `${node.label} has no failure branch or error handler`,
        severity: 'warning'
      });
    }
    if (!outcomes.has('warning') && node.event.warningHandling === undefined) {
      issues.push({
        code: 'MISSING_WARNING_HANDLING',
        path: `${nodePath}.warning`,
        message: `${node.label} has no warning branch or warning handler`,
        severity: 'warning'
      });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) {
      return true;
    }
    if (visited.has(id)) {
      return false;
    }
    visiting.add(id);
    for (const target of adjacency.get(id) ?? []) {
      if (visit(target)) {
        return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (graph.nodes.some((node) => visit(node.id))) {
    issues.push({
      code: 'WORKFLOW_EVENT_CYCLE',
      path: `${path}.graph.edges`,
      message: 'The event workflow contains a cycle. Add a terminal branch instead.',
      severity: 'warning'
    });
  }

  return issues;
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
    issues.push(...validateWorkflowEventGraph(workflow, `workflows[${index}]`));

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

const DATA_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_DATA_FIELD_NAMES = new Set(['id', 'createdAt', 'updatedAt']);
const UNSAFE_DATA_EXPRESSION_TOKENS = [
  'eval',
  'function',
  'constructor',
  'prototype',
  '__proto__',
  'require',
  'process'
];

function isQueryGroup(condition: DataQueryCondition | DataQueryGroup): condition is DataQueryGroup {
  return 'conditions' in condition;
}

function validateQueryFilterNode(
  condition: DataQueryCondition | DataQueryGroup,
  fields: ReadonlySet<string>,
  path: string,
  depth: number,
  counter: { value: number },
  issues: ValidationIssue[]
): void {
  counter.value += 1;
  if (counter.value > 32) {
    issues.push({
      code: 'DATA_QUERY_TOO_COMPLEX',
      path,
      message: 'Data query contains too many filter conditions',
      severity: 'error'
    });
    return;
  }

  if (depth > 4) {
    issues.push({
      code: 'DATA_QUERY_TOO_DEEP',
      path,
      message: 'Data query filter nesting is too deep',
      severity: 'error'
    });
    return;
  }

  if (isQueryGroup(condition)) {
    condition.conditions.forEach((child, index) =>
      validateQueryFilterNode(
        child,
        fields,
        `${path}.conditions[${index}]`,
        depth + 1,
        counter,
        issues
      )
    );
    return;
  }

  const rootField = condition.field.split('.')[0] ?? '';
  if (!fields.has(rootField)) {
    issues.push({
      code: 'UNKNOWN_DATA_QUERY_FIELD',
      path: `${path}.field`,
      message: `Data query references an unknown field: ${condition.field}`,
      severity: 'error'
    });
  }
}

function validateDataSemantics(
  definition: AppDefinition,
  nodesById: ReadonlyMap<string, NodeLocation>,
  issues: ValidationIssue[]
): void {
  const models = definition.dataModels;
  const modelById = new Map(models.map((model) => [model.id, model]));
  const modelByName = new Map(models.map((model) => [model.name, model]));
  const modelIds = new Set<string>(modelById.keys());
  const modelNames = new Set<string>(modelByName.keys());
  const nodeIds = new Set(nodesById.keys());

  const seenModelIds = new Set<string>();
  const seenModelNames = new Set<string>();
  for (const [index, model] of models.entries()) {
    if (seenModelIds.has(model.id)) {
      issues.push({
        code: 'DUPLICATE_DATA_MODEL_ID',
        path: `dataModels[${index}].id`,
        message: `Duplicate data model id: ${model.id}`,
        severity: 'error'
      });
    }
    if (seenModelNames.has(model.name)) {
      issues.push({
        code: 'DUPLICATE_DATA_MODEL_NAME',
        path: `dataModels[${index}].name`,
        message: `Duplicate data model name: ${model.name}`,
        severity: 'error'
      });
    }
    seenModelIds.add(model.id);
    seenModelNames.add(model.name);
  }

  const fieldsByModel = new Map<string, Map<string, DataModelDefinition['fields'][number]>>();
  for (const [modelIndex, model] of models.entries()) {
    const fieldById = new Map<string, DataModelDefinition['fields'][number]>();
    const fieldByName = new Map<string, DataModelDefinition['fields'][number]>();

    for (const [fieldIndex, field] of model.fields.entries()) {
      const fieldPath = `dataModels[${modelIndex}].fields[${fieldIndex}]`;
      if (fieldById.has(field.id)) {
        issues.push({
          code: 'DUPLICATE_DATA_FIELD_ID',
          path: `${fieldPath}.id`,
          message: `Duplicate data field id: ${field.id}`,
          severity: 'error'
        });
      }
      if (fieldByName.has(field.name)) {
        issues.push({
          code: 'DUPLICATE_DATA_FIELD_NAME',
          path: `${fieldPath}.name`,
          message: `Duplicate data field name: ${field.name}`,
          severity: 'error'
        });
      }
      fieldById.set(field.id, field);
      fieldByName.set(field.name, field);

      const isSystemField = field.system === true;
      if (!isSystemField && !DATA_IDENTIFIER_PATTERN.test(field.name)) {
        issues.push({
          code: 'INVALID_DATA_FIELD_IDENTIFIER',
          path: `${fieldPath}.name`,
          message: `Data field name must be a valid identifier: ${field.name}`,
          severity: 'error'
        });
      }
      if (!isSystemField && RESERVED_DATA_FIELD_NAMES.has(field.name)) {
        issues.push({
          code: 'RESERVED_DATA_FIELD_NAME',
          path: `${fieldPath}.name`,
          message: `Data field name is reserved for system use: ${field.name}`,
          severity: 'error'
        });
      }
      if (
        field.minimum !== undefined &&
        field.maximum !== undefined &&
        field.minimum > field.maximum
      ) {
        issues.push({
          code: 'INVALID_DATA_FIELD_RANGE',
          path: fieldPath,
          message: 'Data field minimum cannot be greater than maximum',
          severity: 'error'
        });
      }
      if (field.type === 'enum' && (field.enumValues ?? []).length === 0) {
        issues.push({
          code: 'DATA_ENUM_REQUIRES_VALUES',
          path: `${fieldPath}.enumValues`,
          message: 'Enum data fields require at least one enum value',
          severity: 'error'
        });
      }
    }

    fieldsByModel.set(model.id, fieldById);
    fieldsByModel.set(model.name, fieldByName);

    const seenIndexNames = new Set<string>();
    for (const [indexEntryIndex, indexEntry] of (model.indexes ?? []).entries()) {
      if (seenIndexNames.has(indexEntry.name)) {
        issues.push({
          code: 'DUPLICATE_DATA_INDEX_NAME',
          path: `dataModels[${modelIndex}].indexes[${indexEntryIndex}].name`,
          message: `Duplicate data index name: ${indexEntry.name}`,
          severity: 'error'
        });
      }
      seenIndexNames.add(indexEntry.name);
      for (const fieldId of indexEntry.fieldIds) {
        if (!fieldById.has(fieldId)) {
          issues.push({
            code: 'UNKNOWN_DATA_INDEX_FIELD',
            path: `dataModels[${modelIndex}].indexes[${indexEntryIndex}].fieldIds`,
            message: `Data index references an unknown field: ${fieldId}`,
            severity: 'error'
          });
        }
      }
    }

    for (const [ruleIndex, rule] of (model.validationRules ?? []).entries()) {
      if (rule.fieldId !== undefined && !fieldById.has(rule.fieldId)) {
        issues.push({
          code: 'UNKNOWN_DATA_VALIDATION_FIELD',
          path: `dataModels[${modelIndex}].validationRules[${ruleIndex}].fieldId`,
          message: `Validation rule references an unknown field: ${rule.fieldId}`,
          severity: 'error'
        });
      }
      const lowered = rule.expression.toLowerCase();
      if (UNSAFE_DATA_EXPRESSION_TOKENS.some((token) => lowered.includes(token))) {
        issues.push({
          code: 'UNSAFE_DATA_VALIDATION_EXPRESSION',
          path: `dataModels[${modelIndex}].validationRules[${ruleIndex}].expression`,
          message: 'Data validation expression contains a forbidden token',
          severity: 'error'
        });
      }
    }
  }

  const relationshipGraph = new Map<string, Set<string>>();
  const seenRelationshipIds = new Set<string>();
  for (const [modelIndex, model] of models.entries()) {
    const fieldIds = fieldsByModel.get(model.id) ?? new Map();
    for (const [relationshipIndex, relationship] of (model.relationships ?? []).entries()) {
      const relationshipPath = `dataModels[${modelIndex}].relationships[${relationshipIndex}]`;
      if (seenRelationshipIds.has(relationship.id)) {
        issues.push({
          code: 'DUPLICATE_DATA_RELATIONSHIP_ID',
          path: `${relationshipPath}.id`,
          message: `Duplicate data relationship id: ${relationship.id}`,
          severity: 'error'
        });
      }
      seenRelationshipIds.add(relationship.id);

      if (!modelById.has(relationship.sourceModelId) || relationship.sourceModelId !== model.id) {
        issues.push({
          code: 'INVALID_DATA_RELATIONSHIP_SOURCE',
          path: `${relationshipPath}.sourceModelId`,
          message: 'Relationship source model is invalid',
          severity: 'error'
        });
      }
      if (!modelById.has(relationship.targetModelId)) {
        issues.push({
          code: 'UNKNOWN_DATA_RELATIONSHIP_TARGET',
          path: `${relationshipPath}.targetModelId`,
          message: `Relationship references an unknown model: ${relationship.targetModelId}`,
          severity: 'error'
        });
      }
      if (!fieldIds.has(relationship.sourceFieldId)) {
        issues.push({
          code: 'UNKNOWN_DATA_RELATIONSHIP_FIELD',
          path: `${relationshipPath}.sourceFieldId`,
          message: `Relationship references an unknown field: ${relationship.sourceFieldId}`,
          severity: 'error'
        });
      }
      if (
        relationship.targetFieldId !== undefined &&
        !(fieldsByModel.get(relationship.targetModelId) ?? new Map()).has(
          relationship.targetFieldId
        )
      ) {
        issues.push({
          code: 'UNKNOWN_DATA_RELATIONSHIP_FIELD',
          path: `${relationshipPath}.targetFieldId`,
          message: `Relationship references an unknown field: ${relationship.targetFieldId}`,
          severity: 'error'
        });
      }
      if (
        relationship.cardinality === 'many-to-many' &&
        (relationship.junctionModelId === undefined || !modelById.has(relationship.junctionModelId))
      ) {
        issues.push({
          code: 'INVALID_DATA_JUNCTION_MODEL',
          path: `${relationshipPath}.junctionModelId`,
          message: 'Many-to-many relationships require a valid junction model',
          severity: 'error'
        });
      }

      const targets = relationshipGraph.get(relationship.sourceModelId) ?? new Set<string>();
      targets.add(relationship.targetModelId);
      relationshipGraph.set(relationship.sourceModelId, targets);
    }

    for (const [target, relation] of Object.entries(model.relations)) {
      if (!modelNames.has(relation) && !modelIds.has(relation)) {
        issues.push({
          code: 'UNKNOWN_LEGACY_DATA_RELATION',
          path: `dataModels[${modelIndex}].relations.${target}`,
          message: `Legacy relation references an unknown model: ${relation}`,
          severity: 'warning'
        });
      }
    }
  }

  const relationshipVisited = new Set<string>();
  const relationshipStack = new Set<string>();
  const visitRelationship = (modelId: string): boolean => {
    if (relationshipStack.has(modelId)) {
      return true;
    }
    if (relationshipVisited.has(modelId)) {
      return false;
    }
    relationshipVisited.add(modelId);
    relationshipStack.add(modelId);
    for (const target of relationshipGraph.get(modelId) ?? []) {
      if (visitRelationship(target)) {
        return true;
      }
    }
    relationshipStack.delete(modelId);
    return false;
  };
  if (models.some((model) => visitRelationship(model.id))) {
    issues.push({
      code: 'CIRCULAR_DATA_RELATIONSHIP',
      path: 'dataModels',
      message: 'Data relationships contain a circular model dependency',
      severity: 'warning'
    });
  }

  const sourceIds = new Set((definition.dataSources ?? []).map((source) => source.id));
  for (const [sourceIndex, source] of (definition.dataSources ?? []).entries()) {
    if (source.modelId !== undefined && !modelById.has(source.modelId)) {
      issues.push({
        code: 'UNKNOWN_DATA_SOURCE_MODEL',
        path: `dataSources[${sourceIndex}].modelId`,
        message: `Data source references an unknown model: ${source.modelId}`,
        severity: 'error'
      });
    }
  }

  for (const [queryIndex, query] of (definition.queries ?? []).entries()) {
    const queryPath = `queries[${queryIndex}]`;
    const model = modelById.get(query.modelId);
    if (model === undefined) {
      issues.push({
        code: 'UNKNOWN_DATA_QUERY_MODEL',
        path: `${queryPath}.modelId`,
        message: `Query references an unknown model: ${query.modelId}`,
        severity: 'error'
      });
      continue;
    }
    if (query.sourceId !== undefined && !sourceIds.has(query.sourceId)) {
      issues.push({
        code: 'UNKNOWN_DATA_QUERY_SOURCE',
        path: `${queryPath}.sourceId`,
        message: `Query references an unknown data source: ${query.sourceId}`,
        severity: 'error'
      });
    }
    const fields = new Set([
      ...(fieldsByModel.get(model.id) ?? new Map()).keys(),
      ...model.fields.map((field) => field.name),
      'id',
      'createdAt',
      'updatedAt'
    ]);
    if (query.filters !== undefined) {
      validateQueryFilterNode(
        query.filters,
        fields,
        `${queryPath}.filters`,
        0,
        { value: 0 },
        issues
      );
    }
    for (const sort of query.sort ?? []) {
      if (!fields.has(sort.field.split('.')[0] ?? '')) {
        issues.push({
          code: 'UNKNOWN_DATA_QUERY_SORT_FIELD',
          path: `${queryPath}.sort`,
          message: `Query sort references an unknown field: ${sort.field}`,
          severity: 'error'
        });
      }
    }
    for (const field of query.fields ?? []) {
      if (!fields.has(field.split('.')[0] ?? '')) {
        issues.push({
          code: 'UNKNOWN_DATA_QUERY_SELECT_FIELD',
          path: `${queryPath}.fields`,
          message: `Query selects an unknown field: ${field}`,
          severity: 'error'
        });
      }
    }
  }

  const queryIds = new Set((definition.queries ?? []).map((query) => query.id));
  for (const [bindingIndex, binding] of (definition.dataBindings ?? []).entries()) {
    const bindingPath = `dataBindings[${bindingIndex}]`;
    if (!modelById.has(binding.modelId)) {
      issues.push({
        code: 'UNKNOWN_DATA_BINDING_MODEL',
        path: `${bindingPath}.modelId`,
        message: `Data binding references an unknown model: ${binding.modelId}`,
        severity: 'error'
      });
    }
    if (binding.sourceId !== undefined && !sourceIds.has(binding.sourceId)) {
      issues.push({
        code: 'UNKNOWN_DATA_BINDING_SOURCE',
        path: `${bindingPath}.sourceId`,
        message: `Data binding references an unknown data source: ${binding.sourceId}`,
        severity: 'error'
      });
    }
    if (binding.queryId !== undefined && !queryIds.has(binding.queryId)) {
      issues.push({
        code: 'UNKNOWN_DATA_BINDING_QUERY',
        path: `${bindingPath}.queryId`,
        message: `Data binding references an unknown query: ${binding.queryId}`,
        severity: 'error'
      });
    }
    if (!nodeIds.has(binding.nodeId)) {
      issues.push({
        code: 'UNKNOWN_DATA_BINDING_NODE',
        path: `${bindingPath}.nodeId`,
        message: `Data binding references an unknown component: ${binding.nodeId}`,
        severity: 'error'
      });
    }
    const modelFields = new Set((fieldsByModel.get(binding.modelId) ?? new Map()).keys());
    for (const field of Object.values(binding.mapping ?? {})) {
      if (!modelFields.has(field) && !['id', 'createdAt', 'updatedAt'].includes(field)) {
        issues.push({
          code: 'UNKNOWN_DATA_BINDING_FIELD',
          path: `${bindingPath}.mapping`,
          message: `Data binding maps an unknown field: ${field}`,
          severity: 'error'
        });
      }
    }
  }

  for (const [permissionIndex, permission] of (definition.dataPermissions ?? []).entries()) {
    if (!modelById.has(permission.modelId)) {
      issues.push({
        code: 'UNKNOWN_DATA_PERMISSION_MODEL',
        path: `dataPermissions[${permissionIndex}].modelId`,
        message: `Data permission references an unknown model: ${permission.modelId}`,
        severity: 'error'
      });
    }
  }
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
  validateDataSemantics(definition, nodesById, issues);
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
