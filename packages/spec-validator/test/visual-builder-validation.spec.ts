import { describe, expect, it } from 'vitest';
import {
  createMinimalAppDefinition,
  type AppDefinition,
  type WorkflowDefinition
} from '@nova/spec';
import { validateAppDefinition } from '../src/index';

const WORKFLOW_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_WORKFLOW_ID = '12121212-1212-4212-8212-121212121212';
const STEP_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

function cloneDefinition(): AppDefinition {
  return structuredClone(createMinimalAppDefinition());
}

function workflow(id: string, nodeId?: string): WorkflowDefinition {
  return {
    id,
    name: 'Workflow',
    trigger: { event: 'click', ...(nodeId === undefined ? {} : { nodeId }) },
    steps: [{ id: STEP_ID, type: 'notify' }],
    enabled: true
  };
}

function errorCodes(definition: AppDefinition): string[] {
  return validateAppDefinition(definition)
    .issues.filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code);
}

describe('visual builder validation', () => {
  it('accepts hidden roots and layout metadata', () => {
    const definition = cloneDefinition();
    const root = definition.components[0];
    if (root === undefined) {
      throw new Error('Fixture is missing the root node');
    }

    root.hidden = true;
    root.layout = { display: 'flex', gap: 8 };
    root.breakpointOverrides = { mobile: { display: 'block' } };

    expect(validateAppDefinition(definition).valid).toBe(true);
  });

  it('rejects duplicate workflow ids and step ids', () => {
    const definition = cloneDefinition();
    const duplicate = workflow(WORKFLOW_ID);
    duplicate.steps.push({
      id: STEP_ID,
      type: 'log',
      label: 'Second step'
    });
    definition.workflows = [workflow(WORKFLOW_ID), duplicate];

    const codes = errorCodes(definition);
    expect(codes).toContain('DUPLICATE_WORKFLOW_ID');
    expect(codes).toContain('DUPLICATE_WORKFLOW_STEP_ID');
  });

  it('rejects unknown workflow node, page and references', () => {
    const definition = cloneDefinition();
    const invalid = workflow(WORKFLOW_ID);
    invalid.trigger.nodeId = UNKNOWN_ID;
    invalid.trigger.pageId = UNKNOWN_ID;
    definition.workflows = [invalid];

    const child = definition.components[0]?.children?.[1];
    if (child === undefined) {
      throw new Error('Fixture is missing the button node');
    }
    child.events = { click: { action: 'run', params: { workflowId: SECOND_WORKFLOW_ID } } };

    const codes = errorCodes(definition);
    expect(codes).toContain('UNKNOWN_WORKFLOW_NODE');
    expect(codes).toContain('UNKNOWN_WORKFLOW_PAGE');
    expect(codes).toContain('UNKNOWN_WORKFLOW_ID');
  });

  it('rejects invalid and dangerous bindings', () => {
    const definition = cloneDefinition();
    definition.dataModels = [
      {
        id: '31313131-3131-4131-8131-313131313131',
        name: 'users',
        fields: [
          {
            id: '41414141-4141-4141-8141-414141414141',
            name: 'name',
            type: 'string',
            required: false,
            unique: false,
            defaultValue: undefined
          }
        ],
        relations: {}
      }
    ];

    const child = definition.components[0]?.children?.[0];
    if (child === undefined) {
      throw new Error('Fixture is missing the text node');
    }
    child.bindings = {
      title: { source: 'model', path: 'users.name', kind: 'model', transform: 'eval' },
      invalid: { source: 'magic', path: 'users..name', kind: 'state' }
    };

    const codes = errorCodes(definition);
    expect(codes).toContain('DANGEROUS_BINDING_TRANSFORM');
    expect(codes).toContain('INVALID_BINDING_SOURCE');
    expect(codes).toContain('INVALID_BINDING_PATH');
  });

  it('rejects editor locks that reference unknown nodes', () => {
    const definition = cloneDefinition();
    definition.metadata.editorLocks = [UNKNOWN_ID];

    expect(errorCodes(definition)).toContain('UNKNOWN_EDITOR_LOCK_NODE');
  });

  it('rejects invalid breakpoint overrides at runtime', () => {
    const definition = cloneDefinition();
    const root = definition.components[0];
    if (root === undefined) {
      throw new Error('Fixture is missing the root node');
    }

    const invalid = structuredClone(definition) as unknown as {
      components: Array<{ breakpointOverrides?: Record<string, unknown> }>;
    };
    const invalidRoot = invalid.components[0];
    if (invalidRoot === undefined) {
      throw new Error('Fixture is missing the root node');
    }
    invalidRoot.breakpointOverrides = { watch: { gap: -1 } };

    expect(root.id).toBeTruthy();
    expect(
      validateAppDefinition(invalid).issues.some((issue) => issue.code.startsWith('SCHEMA_'))
    ).toBe(true);
  });
});
