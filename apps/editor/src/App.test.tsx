import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMinimalAppDefinition } from '@nova/spec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useStudioStore } from './store';

const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

vi.mock('@nova/spec', () => ({
  createMinimalAppDefinition: () => ({
    schemaVersion: '1.0.0',
    appId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Test App',
    targets: ['web'],
    deployment: { model: 'nova-managed', region: 'us-east-1' },
    backend: { mode: 'nova-managed' },
    theme: { colors: {}, spacing: {}, typography: {} },
    pages: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'Home',
        route: '/',
        rootNodeId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        settings: {}
      }
    ],
    components: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        type: 'nova.stack',
        contractVersion: '1.0.0',
        name: 'Root',
        props: { direction: 'column', gap: 8 },
        children: []
      }
    ],
    dataModels: [],
    integrations: [],
    accessPolicies: [],
    metadata: { labels: {}, editorLocks: [] }
  }),
  runtimePayloadToDefinition: () => undefined
}));

vi.mock('@nova/contracts', () => ({
  COMPONENT_CATEGORIES: ['layout', 'input', 'display', 'navigation', 'data', 'feedback', 'custom']
}));

vi.mock('@nova/component-registry', () => {
  const contract = (
    type: string,
    displayName: string,
    category: string,
    properties: Record<string, unknown>
  ) => ({
    type,
    version: '1.0.0',
    displayName,
    category,
    propsSchema: { type: 'object', properties },
    defaults: {},
    events: {},
    slots: category === 'layout' ? { default: { description: 'Children', multiple: true } } : {},
    capabilities: [],
    supportedTargets: ['web'],
    renderers: { web: type },
    constraints: {},
    migrations: []
  });
  const contracts = [
    contract('nova.stack', 'Stack', 'layout', {
      direction: { type: 'string', enum: ['row', 'column'] }
    }),
    contract('nova.text', 'Text', 'display', { content: { type: 'string' } }),
    contract('nova.button', 'Button', 'input', { label: { type: 'string' } })
  ];
  return {
    BUILT_IN_COMPONENT_CONTRACTS: contracts,
    builtInComponentRegistry: {
      get: (type: string) => contracts.find((entry) => entry.type === type),
      list: () => contracts,
      has: (type: string) => contracts.some((entry) => entry.type === type)
    }
  };
});

interface MockNode {
  id: string;
  type: string;
  contractVersion: string;
  name?: string;
  props: Record<string, unknown>;
  children?: MockNode[];
  events?: Record<string, unknown>;
}

interface MockDefinition {
  components: MockNode[];
  pages: Array<{ id: string; name: string; route: string; rootNodeId: string; settings: object }>;
  metadata: { labels: Record<string, string>; editorLocks: string[] };
}

interface MockState {
  definition: MockDefinition;
  selectedNodeIds: string[];
  breakpoint: string;
  lockedNodeIds: string[];
  clipboard: MockNode[];
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
}

const versions: Array<{
  id: string;
  versionNumber: number;
  createdAt: string;
  definition: unknown;
}> = [];

vi.mock('@nova/sdk', () => ({
  NovaClient: class {
    listComponents = async () => [];
    listComponentContracts = async () => [];
    validateDefinition = async () => ({ valid: true });
    validateProposal = async () => ({ valid: true });
    loadContracts = async () => [];
    listApps = async () => [];
    getApp = async (id: string) => ({ id, name: 'Test App', slug: 'test-app', status: 'ACTIVE' });
    createVersion = async (_appId: string, input: { definition: unknown }) => {
      const version = {
        id: `version-${versions.length + 1}`,
        versionNumber: versions.length + 1,
        createdAt: new Date().toISOString(),
        definition: input.definition
      };
      versions.push(version);
      return version;
    };
    listVersions = async () => versions;
    getVersion = async (id: string) => versions.find((version) => version.id === id);
    publish = async () => undefined;
    getRuntime = async () => undefined;
    constructor() {}
  }
}));

vi.mock('@nova/editor-core', () => {
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const find = (nodes: MockNode[], id: string): MockNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) {
        return node;
      }
      const child = find(node.children ?? [], id);
      if (child) {
        return child;
      }
    }
    return undefined;
  };
  return {
    createEditorSession: ({ definition }: { definition: unknown }) => {
      let state: MockState = {
        definition: clone(definition as MockDefinition),
        selectedNodeIds: [],
        breakpoint: 'desktop',
        lockedNodeIds: [],
        clipboard: [],
        canUndo: false,
        canRedo: false,
        revision: 0
      };
      const listeners = new Set<(state: MockState) => void>();
      const emit = () => listeners.forEach((listener) => listener(state));
      const update = (mutate: (current: MockState) => MockState) => {
        state = { ...mutate(state), revision: state.revision + 1 };
        emit();
      };
      return {
        getState: () => state,
        getDefinition: () => state.definition,
        subscribe: (listener: (state: MockState) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        select: (ids: string[]) => update((current) => ({ ...current, selectedNodeIds: ids })),
        setBreakpoint: (breakpoint: string) => update((current) => ({ ...current, breakpoint })),
        createComponent: (
          type: string,
          parentId: string,
          options?: { slot?: string; index?: number; props?: Record<string, unknown> }
        ) => {
          const id = `node-${Math.random().toString(36).slice(2)}`;
          update((current) => {
            const next = clone(current.definition);
            const node: MockNode = {
              id,
              type,
              contractVersion: '1.0.0',
              props: options?.props ?? {},
              children: []
            };
            const parent = find(next.components, parentId);
            const container =
              options?.slot && options.slot !== 'children'
                ? ((parent as unknown as { slots?: Record<string, MockNode[]> })?.slots?.[
                    options.slot
                  ] ?? [])
                : (parent?.children ?? []);
            container.push(node);
            if (parent && (!options?.slot || options.slot === 'children')) {
              parent.children = container;
            }
            return { ...current, definition: next, selectedNodeIds: [id] };
          });
          return id;
        },
        updateNode: (id: string, patch: Record<string, unknown>) =>
          update((current) => {
            const next = clone(current.definition);
            const node = find(next.components, id);
            if (node) {
              Object.assign(node, patch);
            }
            return { ...current, definition: next };
          }),
        moveNode: () => undefined,
        resizeNode: (id: string, layout: Record<string, unknown>) =>
          update((current) => {
            const next = clone(current.definition);
            const node = find(next.components, id);
            if (node) {
              node.props.layout = layout;
            }
            return { ...current, definition: next };
          }),
        setBreakpointOverride: () => undefined,
        bindProp: () => undefined,
        setWorkflowEvent: (id: string, event: string, workflow: { steps: unknown[] }) =>
          update((current) => {
            const next = clone(current.definition);
            const node = find(next.components, id);
            if (node) {
              node.events = {
                ...node.events,
                [event]: { action: 'runWorkflow', params: { steps: workflow.steps } }
              };
            }
            return { ...current, definition: next };
          }),
        setHidden: () => undefined,
        renameNode: () => undefined,
        duplicateNode: () => undefined,
        deleteNodes: () => undefined,
        copy: () => undefined,
        paste: () => [],
        toggleLock: (id: string) =>
          update((current) => {
            const next = clone(current.definition);
            next.metadata.editorLocks = next.metadata.editorLocks.includes(id)
              ? next.metadata.editorLocks.filter((value) => value !== id)
              : [...next.metadata.editorLocks, id];
            return { ...current, definition: next };
          }),
        undo: () => undefined,
        redo: () => undefined,
        replaceDefinition: (next: unknown) =>
          update((current) => ({
            ...current,
            definition: clone(next as MockDefinition)
          })),
        applyProposal: () => undefined
      };
    }
  };
});

vi.mock('@nova/runtime-core', () => ({
  createRuntimeModel: (definition: unknown, options: { breakpoint: string }) => ({
    definition,
    breakpoint: options.breakpoint,
    data: {},
    resolveProps: (node: { props: unknown }) => node.props
  })
}));

vi.mock('@nova/web-runtime', () => ({
  WebRuntimeApp: () => null
}));

beforeEach(() => {
  versions.length = 0;
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  useStudioStore.getState().session.replaceDefinition(createMinimalAppDefinition());
  useStudioStore.setState({
    versionId: 'draft',
    dirty: false,
    saving: false,
    saveError: undefined,
    status: 'Ready',
    menu: null,
    workflowTarget: null,
    aiOpen: false
  });
});

afterEach(() => {
  cleanup();
});

describe('editor palette and tree', () => {
  it('filters components by search and adds the selected component to the tree', async () => {
    render(<App />);

    const palette = screen.getByLabelText('Component library');
    const search = screen.getByLabelText('Search components');
    fireEvent.change(search, { target: { value: 'button' } });

    expect(within(palette).queryByText('Stack')).toBeNull();
    expect(within(palette).getByText('Button')).toBeTruthy();

    fireEvent.click(within(palette).getByText('Button'));

    const tree = screen.getByLabelText('Component tree');
    await waitFor(() => {
      expect(within(tree).getByText('Button')).toBeTruthy();
    });
  });

  it('creates and selects pages from the pages panel', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    const pages = screen.getByLabelText('Page tree');
    fireEvent.click(within(pages).getByRole('button', { name: 'New page' }));

    await waitFor(() => {
      expect(within(pages).getAllByText('New page')[0]).toBeTruthy();
      expect(within(pages).getByText('/new-page')).toBeTruthy();
    });
  });

  it('saves the current definition through the control plane client', async () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);

    await waitFor(() => {
      expect(screen.getByText('Saved version-1')).toBeTruthy();
    });
    expect(versions).toHaveLength(1);
    expect(window.location.search).toContain(`app=${APP_ID}`);
  });
});
