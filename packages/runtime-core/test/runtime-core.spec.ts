import { describe, expect, it, vi } from 'vitest';
import type { ComponentContract } from '@nova/contracts';
import {
  BREAKPOINTS,
  createMinimalAppDefinition,
  type AppDefinition,
  type Binding,
  type Breakpoint,
  type WorkflowDefinition
} from '@nova/spec';
import {
  createRuntimeModel,
  executeWorkflow,
  resolveBinding,
  type WorkflowContext
} from '../src/index';

function contract(type: string, renderer?: string): ComponentContract {
  return {
    type,
    version: '1.0.0',
    displayName: type,
    category: 'display',
    propsSchema: { type: 'object' },
    defaults: { content: 'default', variant: 'body', gap: 4 },
    events: {},
    slots: {},
    capabilities: [],
    supportedTargets: ['web'],
    renderers: renderer === undefined ? {} : { web: renderer },
    constraints: {},
    migrations: []
  };
}

function definition(): AppDefinition {
  const base = createMinimalAppDefinition();
  const breakpoint = BREAKPOINTS[0] ?? ('base' as Breakpoint);
  return {
    ...base,
    workflows: [],
    components: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        type: 'nova.stack',
        contractVersion: '1.0.0',
        props: { direction: 'column', gap: 8 },
        layout: { padding: 8 },
        hidden: false,
        events: { click: { action: 'runWorkflow', params: { workflowId: 'workflow-1' } } },
        breakpointOverrides: {
          [breakpoint]: { padding: 24 }
        },
        bindings: {
          content: { source: 'model', path: 'user.firstName', transform: 'upper' }
        },
        children: [
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            type: 'nova.text',
            contractVersion: '1.0.0',
            props: { content: 'Hello', variant: 'body' },
            hidden: true
          }
        ]
      }
    ]
  } as unknown as AppDefinition;
}

function context(): WorkflowContext {
  return {
    nodeId: 'node-1',
    pageId: 'page-1',
    event: 'click',
    payload: {},
    data: { state: { ok: true } }
  };
}

describe('createRuntimeModel', () => {
  it('merges defaults, props, breakpoint overrides and layout, and resolves bindings', () => {
    const model = createRuntimeModel(definition(), {
      contracts: [contract('nova.stack', 'nova-web/stack'), contract('nova.text', 'nova-web/text')],
      data: {
        model: { user: { firstName: 'ada' } },
        state: {},
        collection: {},
        prop: {}
      }
    });

    const root = model.pages[0]?.root;
    expect(root?.renderer).toBe('nova-web/stack');
    expect(root?.props).toMatchObject({ direction: 'column', gap: 8, padding: 24 });
    expect(root?.props.content).toBe('ADA');
    expect(root?.props.style).toEqual({ padding: 24 });
    expect(root?.hidden).toBe(false);
    expect(root?.events.click?.action).toBe('runWorkflow');
    expect(root?.children[0]?.hidden).toBe(true);
    expect(model.workflows).toEqual([]);
  });

  it('falls back gracefully when a contract has no web renderer', () => {
    const model = createRuntimeModel(definition(), { contracts: [contract('nova.stack')] });
    const root = model.pages[0]?.root;
    expect(root?.renderer).toBe('nova-web/fallback');
    expect(root?.props.componentType).toBe('nova.stack');
  });
});

describe('resolveBinding', () => {
  it('reads scoped dot paths and applies transforms', () => {
    const bindings: Binding[] = [
      { source: 'collection', path: 'items.0.name' },
      { source: 'model', path: 'user.firstName', transform: 'upper' },
      { source: 'state', path: 'count', transform: 'currency' },
      { source: 'prop', path: 'title', transform: 'lower' }
    ];
    const data = {
      collection: { items: [{ name: 'First' }] },
      model: { user: { firstName: 'Ada' } },
      state: { count: 12 },
      prop: { title: 'Hello' }
    };

    expect(bindings.map((binding) => resolveBinding(binding, data))).toEqual([
      'First',
      'ADA',
      '$12.00',
      'hello'
    ]);
  });
});

describe('executeWorkflow', () => {
  it('evaluates step conditions and onError handlers', async () => {
    const notify = vi.fn();
    const workflow: WorkflowDefinition = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Test workflow',
      trigger: { event: 'click' },
      enabled: true,
      steps: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          type: 'showMessage',
          condition: { path: 'state.ok', op: 'eq', value: true },
          params: { message: 'yes' }
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          type: 'showMessage',
          condition: { path: 'state.ok', op: 'eq', value: false },
          params: { message: 'no' }
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          type: 'createRecord',
          params: { table: 'users' },
          onError: [{ type: 'showMessage', params: { message: 'failed' } }]
        }
      ]
    };

    await executeWorkflow(workflow, context(), {
      notify,
      actions: {
        createRecord: () => {
          throw new Error('write failed');
        }
      }
    });

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenNthCalledWith(1, 'yes', expect.any(Object));
    expect(notify).toHaveBeenNthCalledWith(2, 'failed', expect.any(Object));
  });

  it('rethrows unhandled errors and rejects unsupported actions', async () => {
    const failing: WorkflowDefinition = {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Failing workflow',
      trigger: { event: 'click' },
      enabled: true,
      steps: [{ id: '66666666-6666-4666-8666-666666666666', type: 'createRecord' }]
    };
    await expect(executeWorkflow(failing, context(), {})).rejects.toThrow('No data access handler');

    const unsafe: WorkflowDefinition = {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Unsafe workflow',
      trigger: { event: 'click' },
      enabled: true,
      steps: [{ id: '88888888-8888-4888-8888-888888888888', type: 'eval' }]
    };
    await expect(executeWorkflow(unsafe, context(), {})).rejects.toThrow(
      'Unsupported workflow action'
    );
  });
});
