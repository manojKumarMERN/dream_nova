import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMinimalAppDefinition } from '@nova/spec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useStudioStore } from './store';

const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

vi.mock('@nova/spec', () => ({
  createFormValidationAppDefinition: () => ({
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
    workflows: [],
    accessPolicies: [],
    metadata: { labels: {}, editorLocks: [] }
  }),
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
    workflows: [],
    accessPolicies: [],
    metadata: { labels: {}, editorLocks: [] }
  }),
  runtimePayloadToDefinition: () => undefined
}));

vi.mock('@nova/contracts', () => ({
  COMPONENT_CATEGORIES: ['layout', 'input', 'display', 'navigation', 'data', 'feedback', 'custom']
}));

vi.mock('@nova/spec-validator', () => ({
  validateAppDefinition: () => ({ valid: true, issues: [] }),
  validateWorkflowEventGraph: () => []
}));

vi.mock('@xyflow/react', () => {
  interface MockNode {
    id: string;
    type: string;
    data: Record<string, unknown>;
    selected?: boolean;
  }
  interface MockEdge {
    id: string;
    label?: string;
  }
  type MockNodeComponent = (props: {
    id: string;
    data: Record<string, unknown>;
    selected?: boolean;
  }) => ReactNode;
  interface ReactFlowProps {
    nodes: MockNode[];
    edges: MockEdge[];
    nodeTypes: Record<string, MockNodeComponent>;
  }
  return {
    ReactFlow: ({ nodes, edges, nodeTypes }: ReactFlowProps) => (
      <div data-testid="react-flow">
        {nodes.map((node) => {
          const Node = nodeTypes[node.type];
          return Node ? (
            <Node key={node.id} id={node.id} data={node.data} selected={node.selected} />
          ) : null;
        })}
        {edges.map((edge) => (
          <div key={edge.id}>{String(edge.label)}</div>
        ))}
      </div>
    ),
    ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: ({ id, type }: { id: string; type: string }) => (
      <div data-handle-id={id} data-handle-type={type} />
    ),
    Position: { Left: 'left', Right: 'right' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    useReactFlow: () => ({
      fitView: () => undefined,
      screenToFlowPosition: (point: { x: number; y: number }) => point,
      zoomIn: () => undefined,
      zoomOut: () => undefined,
      getNodes: () => [],
      getNode: () => undefined
    }),
    useViewport: () => ({ x: 0, y: 0, zoom: 1 })
  };
});

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
  events?: Record<string, { action?: string; params?: Record<string, unknown> }>;
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
    planDataMigration = async () => ({
      fromVersion: 'draft',
      toVersion: 'current',
      operations: [],
      destructive: false,
      impacts: []
    });
    applyDataMigration = async () => undefined;
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
        setWorkflowEvent: (id: string, event: string, workflowId: string | null) =>
          update((current) => {
            const next = clone(current.definition);
            const node = find(next.components, id);
            if (node) {
              if (workflowId === null) {
                const events = { ...(node.events ?? {}) };
                delete events[event];
                node.events = events;
              } else {
                node.events = {
                  ...node.events,
                  [event]: { action: 'runWorkflow', params: { workflowId } }
                };
              }
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
  }),
  createRuntimeEngine: () => ({ dispose: () => undefined }),
  MemoryNavigationAdapter: class {
    constructor(public readonly route: string) {}
  }
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

  it('opens and closes the visual database designer from the data tab', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open designer' }));

    expect(screen.getByRole('dialog', { name: 'Database designer' })).toBeTruthy();
    expect(screen.getByTestId('react-flow')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close designer' }));

    expect(screen.queryByRole('dialog', { name: 'Database designer' })).toBeNull();
  });

  it('opens the event workflow designer and saves a canonical workflow', async () => {
    render(<App />);

    act(() => {
      useStudioStore.getState().setWorkflowTarget({
        nodeId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        eventName: 'click'
      });
    });

    expect(screen.getByRole('dialog', { name: 'Event workflow designer' })).toBeTruthy();
    expect(document.querySelectorAll('[data-node-id]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add Rise Event' }));

    expect(document.querySelectorAll('[data-node-id]')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));

    await waitFor(() => {
      expect(screen.getByText('Saved version-1')).toBeTruthy();
    });
    expect(versions).toHaveLength(1);

    const savedDefinition = versions[0]?.definition as {
      workflows?: Array<{ id: string; name: string; graph?: { nodes: unknown[] } }>;
      components: MockNode[];
    };
    expect(savedDefinition.workflows).toHaveLength(1);
    expect(savedDefinition.workflows?.[0]?.name).toBe('click workflow');
    expect(savedDefinition.workflows?.[0]?.graph?.nodes).toHaveLength(2);
    expect(savedDefinition.components[0]?.events?.click?.params).toEqual({
      workflowId: savedDefinition.workflows?.[0]?.id
    });
  });
});
