import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeModel, RuntimeNode } from '@nova/runtime-core';
import {
  FallbackRenderer,
  emptyRuntimeRenderContext,
  renderNode,
  WEB_RENDERERS,
  WebRuntime,
  WebRuntimeApp
} from '../src/index';

interface TestElement {
  type: unknown;
  props: Record<string, unknown>;
}

const domMocks = vi.hoisted(() => {
  const render = vi.fn();
  const unmount = vi.fn();
  const createRoot = vi.fn(() => ({ render, unmount }));
  return { render, unmount, createRoot };
});

vi.mock('react', () => ({
  Fragment: 'Fragment',
  Component: class {
    props: Record<string, unknown>;
    state: Record<string, unknown> = {};
    constructor(props: Record<string, unknown>) {
      this.props = props;
    }
    render(): unknown {
      return this.props.children;
    }
  },
  useMemo: (factory: () => unknown): unknown => factory(),
  useSyncExternalStore: (_subscribe: () => () => void, getSnapshot: () => unknown): unknown =>
    getSnapshot()
}));
vi.mock('react/jsx-runtime', () => ({
  jsx: (type: unknown, props: Record<string, unknown>): TestElement => ({
    type,
    props: { ...props }
  }),
  jsxs: (type: unknown, props: Record<string, unknown>): TestElement => ({
    type,
    props: { ...props }
  }),
  Fragment: 'Fragment'
}));
vi.mock('react/jsx-dev-runtime', () => ({
  jsxDEV: (type: unknown, props: Record<string, unknown>): TestElement => ({
    type,
    props: { ...props }
  }),
  Fragment: 'Fragment'
}));
vi.mock('react-dom/client', () => ({ createRoot: domMocks.createRoot }));

const hiddenNode: RuntimeNode = {
  id: 'hidden-1',
  type: 'nova.text',
  renderer: 'nova-web/text',
  props: { content: 'Hidden' },
  children: [],
  slots: {},
  hidden: true,
  events: {}
};

const buttonNode: RuntimeNode = {
  id: 'button-1',
  type: 'nova.button',
  renderer: 'nova-web/button',
  props: { label: 'Continue' },
  children: [],
  slots: {},
  hidden: false,
  events: { click: { action: 'submit' } }
};

const rootNode: RuntimeNode = {
  id: 'root-1',
  type: 'nova.stack',
  renderer: 'nova-web/stack',
  props: { style: { padding: 8 } },
  children: [hiddenNode, buttonNode],
  slots: {},
  hidden: false,
  events: {}
};

const styledStackNode: RuntimeNode = {
  id: 'stack-styled',
  type: 'nova.stack',
  renderer: 'nova-web/stack',
  props: {
    direction: 'row',
    gap: 12,
    className: 'custom-class',
    variant: 'primary',
    justifyContent: 'between'
  },
  children: [],
  slots: {},
  hidden: false,
  events: {}
};

const hiddenByPropNode: RuntimeNode = {
  ...buttonNode,
  id: 'hidden-prop',
  props: { label: 'Hidden', visible: false }
};

const tabsNode: RuntimeNode = {
  id: 'tabs-1',
  type: 'nova.tabs',
  renderer: 'nova-web/tabs',
  props: {
    items: [
      { label: 'Details', value: 'details' },
      { label: 'History', value: 'history' }
    ],
    activeValue: 'details'
  },
  children: [],
  slots: {},
  hidden: false,
  events: {}
};

const tableNode: RuntimeNode = {
  id: 'table-1',
  type: 'nova.data-table',
  renderer: 'nova-web/data-table',
  props: {
    columns: [{ key: 'name', label: 'Name' }],
    rows: [{ name: 'Nova' }]
  },
  children: [],
  slots: {},
  hidden: false,
  events: {}
};

const model: RuntimeModel = {
  appId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Test App',
  theme: { colors: {}, spacing: {}, typography: {} } as RuntimeModel['theme'],
  pages: [{ id: 'page-1', name: 'Home', route: '/', root: rootNode }],
  workflows: []
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document');
});

function renderShell(node: RuntimeNode): TestElement {
  const element = renderNode(node) as TestElement;
  const renderer = element.type as (props: Record<string, unknown>) => TestElement;
  return renderer(element.props);
}

describe('WebRuntime', () => {
  it('renders visible nodes and emits button click events', () => {
    const onEvent = vi.fn();
    const stack = renderNode(rootNode, { onEvent }) as TestElement;
    expect(renderNode(hiddenNode)).toBeNull();
    expect((stack.props.children as TestElement[]).length).toBe(1);

    const rendererElement = renderNode(buttonNode, { onEvent }) as TestElement;
    const renderer = rendererElement.type as (props: Record<string, unknown>) => TestElement;
    const button = renderer(rendererElement.props);

    expect(button.type).toBe('button');
    expect(button.props.children).toContain('Continue');

    (button.props.onClick as () => void)();
    expect(onEvent).toHaveBeenCalledWith({
      nodeId: 'button-1',
      event: 'click',
      payload: {}
    });
  });

  it('mounts and unmounts through the resolved container', () => {
    const target = {} as Element;
    const runtime = new WebRuntime(model);

    runtime.render(target);

    expect(domMocks.createRoot).toHaveBeenCalledWith(target);
    const rendered = domMocks.render.mock.calls[0]?.[0] as TestElement;
    expect(rendered.type).toBe(WebRuntimeApp);
    expect((WebRuntimeApp({ model }) as TestElement).type).toBe('main');

    runtime.unmount();
    expect(domMocks.unmount).toHaveBeenCalledTimes(1);
  });

  it('resolves selector targets with document.querySelector', () => {
    const target = {} as Element;
    const querySelector = vi.fn(() => target);
    Reflect.set(globalThis, 'document', { querySelector });
    const runtime = new WebRuntime(model);

    runtime.render('#app');

    expect(querySelector).toHaveBeenCalledWith('#app');
    expect(domMocks.createRoot).toHaveBeenCalledWith(target);
  });

  it('uses a fallback renderer for unknown renderer ids', () => {
    const element = renderNode({
      ...rootNode,
      renderer: 'custom/unknown',
      children: []
    }) as TestElement;
    expect(element.type).toBe(FallbackRenderer);
    expect(Object.keys(WEB_RENDERERS)).toContain('nova-web/data-grid');
  });

  it('maps authored props to runtime classes and styles', () => {
    const stack = renderShell(styledStackNode);
    expect(stack.props.className).toContain('nova-stack--primary');
    expect(stack.props.className).toContain('custom-class');
    const style = stack.props.style as Record<string, unknown>;
    expect(style.flexDirection).toBe('row');
    expect(style.justifyContent).toBe('space-between');
    expect(renderNode(hiddenByPropNode)).toBeNull();
  });

  it('uses contract props for tabs and data tables', () => {
    const onEvent = vi.fn();
    const tabs = renderShell(tabsNode);
    const header = (tabs.props.children as TestElement[])[0];
    const firstTab = (header?.props.children as TestElement[])[0];
    expect(firstTab?.props.children).toBe('Details');
    (firstTab?.props.onClick as () => void)();
    expect(onEvent).not.toHaveBeenCalled();

    const renderedTabs = renderNode(tabsNode, { onEvent }) as TestElement;
    const tabsRenderer = renderedTabs.type as (props: Record<string, unknown>) => TestElement;
    const tabsDom = tabsRenderer(renderedTabs.props);
    const tabsHeader = (tabsDom.props.children as TestElement[])[0];
    const tabButton = (tabsHeader?.props.children as TestElement[])[0];
    (tabButton?.props.onClick as () => void)();
    expect(onEvent).toHaveBeenCalledWith({
      nodeId: 'tabs-1',
      event: 'change',
      payload: { value: 'details', index: 0 }
    });

    const table = renderShell(tableNode);
    expect(JSON.stringify(table)).toContain('Nova');
  });

  it('renders controlled inputs with validation errors', () => {
    const inputNode: RuntimeNode = {
      ...buttonNode,
      id: 'input-1',
      type: 'nova.text-input',
      renderer: 'nova-web/text-input',
      props: { name: 'name', label: 'Name', value: 'Ada', error: 'Name is required' }
    };
    const label = renderShell(inputNode);
    const input = (label.props.children as TestElement[]).find((child) => child.type === 'input');
    expect(input?.props.value).toBe('Ada');
    expect(input?.props.name).toBe('name');
    expect(JSON.stringify(label)).toContain('Name is required');
  });

  it('renders form validation and loading state from the runtime context', () => {
    const formNode: RuntimeNode = {
      ...buttonNode,
      id: 'form-1',
      type: 'nova.form',
      renderer: 'nova-web/form',
      props: { submitLabel: 'Save' },
      children: []
    };
    const runtime = {
      ...emptyRuntimeRenderContext(),
      forms: {
        'form-1': {
          values: {},
          errors: {},
          formErrors: ['Name is required'],
          loading: true,
          submitted: true,
          failure: 'Please correct the highlighted fields'
        }
      }
    };
    const rendererElement = renderNode(formNode, { runtime }) as TestElement;
    const renderer = rendererElement.type as (props: Record<string, unknown>) => TestElement;
    const form = renderer(rendererElement.props);
    const children = form.props.children as unknown[];
    expect(JSON.stringify(children)).toContain('Name is required');
    expect(JSON.stringify(children)).toContain('Please correct the highlighted fields');
    const submit = (children as Array<TestElement | null>)
      .filter((child): child is TestElement => child !== null)
      .find((child) => child.type === 'button');
    expect(submit?.props.disabled).toBe(true);
    expect(submit?.props.children).toBe('Working…');
  });
});
