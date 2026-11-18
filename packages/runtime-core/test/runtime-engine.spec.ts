import { describe, expect, it, vi } from 'vitest';
import type { ComponentContract } from '@nova/contracts';
import { createMinimalAppDefinition } from '@nova/spec';
import type { AppDefinition } from '@nova/spec';
import type { RuntimeLocation } from '../src/index';
import {
  MemoryNavigationAdapter,
  RuntimeLoadError,
  createRuntimeEngine,
  evaluateExpression,
  validateRuntimeDefinitionContracts,
  interpolateExpressions,
  loadRuntimeDefinition,
  parseRuntimeLocation,
  resolveRuntimeLimits,
  resolveRuntimeRoute,
  validateExpression,
  validateRuntimeAction
} from '../src/index';

function contract(type: string, renderer: string): ComponentContract {
  return {
    type,
    version: '1.0.0',
    displayName: type,
    category: 'display',
    propsSchema: { type: 'object' },
    defaults: {},
    events: {},
    slots: {},
    capabilities: [],
    supportedTargets: ['web'],
    renderers: { web: renderer },
    constraints: {},
    migrations: []
  };
}

const CONTRACTS: readonly ComponentContract[] = [
  contract('nova.stack', 'nova-web/stack'),
  contract('nova.text', 'nova-web/text'),
  contract('nova.text-input', 'nova-web/text-input'),
  contract('nova.button', 'nova-web/button'),
  contract('nova.form', 'nova-web/form')
];

function createRuntimeDefinition(): AppDefinition {
  const base = createMinimalAppDefinition();
  return {
    ...base,
    pages: [
      { id: 'home', name: 'Home', route: '/', rootNodeId: 'root', settings: {} },
      { id: 'done', name: 'Done', route: '/done/:id', rootNodeId: 'doneRoot', settings: {} }
    ],
    components: [
      {
        id: 'root',
        type: 'nova.stack',
        contractVersion: '1.0.0',
        props: { direction: 'column' },
        children: [
          {
            id: 'title',
            type: 'nova.text',
            contractVersion: '1.0.0',
            props: { content: 'Hello {{ state.user }}' }
          },
          {
            id: 'form',
            type: 'nova.form',
            contractVersion: '1.0.0',
            props: { name: 'profile' },
            children: [
              {
                id: 'name',
                type: 'nova.text-input',
                contractVersion: '1.0.0',
                props: { name: 'name', label: 'Name', required: true, value: '' }
              },
              {
                id: 'submit',
                type: 'nova.button',
                contractVersion: '1.0.0',
                props: { label: 'Save' },
                events: {
                  click: {
                    action: 'validateForm',
                    params: {
                      formId: 'form',
                      onSuccess: [
                        {
                          action: 'setState',
                          params: { path: 'user', value: '{{ forms.form.values.name }}' }
                        },
                        {
                          action: 'navigate',
                          params: { route: '/done/{{ forms.form.values.name }}' }
                        }
                      ]
                    }
                  }
                }
              }
            ]
          }
        ]
      },
      {
        id: 'doneRoot',
        type: 'nova.text',
        contractVersion: '1.0.0',
        props: { content: 'Welcome {{ state.user }} / {{ page.params.id }}' }
      }
    ]
  };
}

describe('runtime expressions', () => {
  it('evaluates allowlisted expressions and interpolates templates', () => {
    expect(evaluateExpression("upper('ada') + '!'", {})).toBe('ADA!');
    expect(interpolateExpressions('Hello {{ state.user }}', { state: { user: 'Ada' } })).toBe(
      'Hello Ada'
    );
  });

  it('rejects unsupported functions and prototype access', () => {
    expect(validateExpression('process.exit(1)').length).toBeGreaterThan(0);
    expect(validateExpression('constructor').length).toBeGreaterThan(0);
    expect(validateRuntimeAction({ action: 'eval', params: { code: '1' } })).toContain(
      'Unsupported action: eval'
    );
  });

  it('enforces expression length, depth and function allowlists', () => {
    expect(validateExpression('a'.repeat(513)).length).toBeGreaterThan(0);
    expect(validateExpression(`${'('.repeat(30)}1${')'.repeat(30)}`).length).toBeGreaterThan(0);
    expect(
      validateExpression('upper(1)', resolveRuntimeLimits(), new Set(['lower'])).length
    ).toBeGreaterThan(0);
  });

  it('rejects unsafe nested action payloads', () => {
    expect(
      validateRuntimeAction({
        action: 'validateForm',
        params: {
          formId: 'form',
          onSuccess: [{ action: 'setState', params: { path: '__proto__.polluted', value: 1 } }]
        }
      }).length
    ).toBeGreaterThan(0);
    expect(
      validateRuntimeAction(
        { action: 'setState', params: { path: 'ok' } },
        {
          allowedActions: ['showMessage']
        }
      )
    ).toContain('Action is not allowed by the current policy');
  });
});

describe('RuntimeEngine', () => {
  it('runs input, validation, state, navigation and page rendering end to end', () => {
    const definition = createRuntimeDefinition();
    const engine = createRuntimeEngine(definition, {
      contracts: CONTRACTS,
      navigation: new MemoryNavigationAdapter('/')
    });

    engine.handleEvent({ nodeId: 'name', event: 'change', payload: { value: 'Ada' } });
    engine.handleEvent({ nodeId: 'submit', event: 'click', payload: {} });

    const state = engine.getSnapshot();
    expect(state.app.user).toBe('Ada');
    expect(state.forms.form?.values.name).toBe('Ada');
    expect(state.route.pageId).toBe('done');
    expect(state.route.pathname).toBe('/done/Ada');
    expect(state.route.params.id).toBe('Ada');

    const donePage = engine.getModel().pages.find((page) => page.id === 'done');
    expect(donePage?.root.props.content).toBe('Welcome Ada / Ada');
    engine.dispose();
  });

  it('records validation failures without navigating', () => {
    const engine = createRuntimeEngine(createRuntimeDefinition(), {
      contracts: CONTRACTS,
      navigation: new MemoryNavigationAdapter('/')
    });

    engine.handleEvent({ nodeId: 'submit', event: 'click', payload: {} });

    const state = engine.getSnapshot();
    expect(state.forms.form?.errors.name).toBeTruthy();
    expect(state.forms.form?.failure).toBe('Please correct the highlighted fields');
    expect(state.route.pageId).toBe('home');
    expect(state.messages.some((message) => message.text === 'Form validation failed')).toBe(true);
    engine.dispose();
  });

  it('matches parameterized routes', () => {
    const definition = createRuntimeDefinition();
    const route = resolveRuntimeRoute(definition.pages, parseRuntimeLocation('/done/Ada'));
    expect(route?.page.id).toBe('done');
    expect(route?.params).toEqual({ id: 'Ada' });
  });

  it('honors tenant policy and emits structured telemetry without action values', () => {
    const emit = vi.fn();
    const engine = createRuntimeEngine(createRuntimeDefinition(), {
      contracts: CONTRACTS,
      navigation: new MemoryNavigationAdapter('/'),
      policy: {
        writableStateRoots: ['profile.'],
        limits: { maxActionsPerEvent: 4 }
      },
      telemetry: { emit },
      appId: 'app-1',
      versionId: 'version-1',
      requestId: 'request-1'
    });

    engine.handleEvent({ nodeId: 'name', event: 'change', payload: { value: 'Ada' } });
    engine.handleEvent({ nodeId: 'submit', event: 'click', payload: {} });

    expect(engine.getSnapshot().app.user).toBeUndefined();
    expect(engine.getSnapshot().errors.some((error) => error.code === 'ACTION_REJECTED')).toBe(
      true
    );
    expect(emit).toHaveBeenCalled();
    const serialized = JSON.stringify(emit.mock.calls);
    expect(serialized).toContain('app-1');
    expect(serialized).toContain('request-1');
    expect(serialized).not.toContain('Ada');
    engine.dispose();
  });

  it('unsubscribes navigation listeners and reports disposal once', () => {
    const subscribers = new Set<(location: RuntimeLocation) => void>();
    const emit = vi.fn();
    const navigation = new MemoryNavigationAdapter('/');
    const originalSubscribe = navigation.subscribe.bind(navigation);
    navigation.subscribe = (listener: (location: RuntimeLocation) => void) => {
      subscribers.add(listener);
      const unsubscribe = originalSubscribe(listener);
      return () => {
        subscribers.delete(listener);
        unsubscribe();
      };
    };
    const engine = createRuntimeEngine(createRuntimeDefinition(), {
      contracts: CONTRACTS,
      navigation,
      telemetry: { emit }
    });
    expect(subscribers.size).toBe(1);
    engine.dispose();
    engine.dispose();
    expect(subscribers.size).toBe(0);
    expect(engine.isDisposed()).toBe(true);
    expect(emit.mock.calls.filter(([event]) => event.code === 'RUNTIME_DISPOSED')).toHaveLength(1);
  });

  it('reports contract-backed prop issues with useful messages', () => {
    const definition = createRuntimeDefinition();
    const strictContract = contract('nova.text', 'nova-web/text');
    strictContract.propsSchema = {
      type: 'object',
      properties: { content: { type: 'string' }, variant: { type: 'string', enum: ['body'] } },
      required: ['content'],
      additionalProperties: false
    };
    const text = definition.components[0]?.children?.find((node) => node.id === 'title');
    if (text !== undefined) {
      text.props.variant = 'danger';
    }
    const issues = validateRuntimeDefinitionContracts(definition, [
      ...CONTRACTS.filter((candidate) => candidate.type !== 'nova.text'),
      strictContract
    ]);
    expect(issues.some((issue) => issue.nodeId === 'title' && issue.path === 'props')).toBe(true);
    expect(issues[0]?.message).toBeTruthy();
  });
});

describe('loadRuntimeDefinition', () => {
  it('loads a valid definition and rejects unsupported actions', async () => {
    const loaded = await loadRuntimeDefinition({
      load: async () => ({ definition: createMinimalAppDefinition() })
    });
    expect(loaded.definition.name).toBe('Minimal App');

    const invalid = createMinimalAppDefinition();
    const root = invalid.components[0];
    if (root !== undefined) {
      root.events = { click: { action: 'eval', params: { code: '1' } } };
    }

    await expect(
      loadRuntimeDefinition({ load: async () => ({ definition: invalid }) })
    ).rejects.toBeInstanceOf(RuntimeLoadError);
  });
});
