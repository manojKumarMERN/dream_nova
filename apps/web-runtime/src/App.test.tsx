import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const shared = vi.hoisted(() => ({ definition: null as unknown }));

const fixture = {
  schemaVersion: '1.0.0',
  appId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Runtime Demo',
  targets: ['web'],
  deployment: {},
  backend: {},
  theme: {},
  pages: [],
  components: [],
  dataModels: [],
  integrations: [],
  accessPolicies: [],
  metadata: { labels: {} }
};

vi.mock('@nova/spec', () => ({
  createMinimalAppDefinition: () => ({
    schemaVersion: '1.0.0',
    appId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Local Demo',
    targets: ['web'],
    deployment: {},
    backend: {},
    theme: {},
    pages: [],
    components: [],
    dataModels: [],
    integrations: [],
    accessPolicies: [],
    metadata: { labels: {} }
  })
}));

vi.mock('@nova/component-registry', () => ({
  BUILT_IN_COMPONENT_CONTRACTS: [],
  builtInComponentRegistry: {
    get: () => undefined,
    list: () => [],
    has: () => false
  }
}));

vi.mock('@nova/sdk', () => ({
  NovaClient: class {
    getPublicRuntime = async () => ({ definition: shared.definition });
    constructor() {}
  }
}));

vi.mock('@nova/runtime-core', () => ({
  createRuntimeModel: (definition: unknown, options: { breakpoint: string }) => ({
    definition,
    breakpoint: options.breakpoint,
    data: {},
    resolveProps: (node: { props: unknown }) => node.props
  })
}));

vi.mock('@nova/web-runtime', () => ({
  WebRuntimeApp: (props: { model: { definition: { name: string } } }) => (
    <div data-testid="runtime">{props.model.definition.name}</div>
  )
}));

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('web runtime app', () => {
  it('loads an app by slug and switches breakpoints', async () => {
    shared.definition = fixture;
    window.history.pushState({}, '', '/?app=demo');

    render(<App />);

    expect(await screen.findByText('Loaded demo')).toBeTruthy();
    expect(screen.getByTestId('runtime').textContent).toBe('Runtime Demo');

    const mobile = screen.getByLabelText('mobile viewport');
    fireEvent.click(mobile);

    expect(mobile.className).toContain('active');
    expect(screen.getByText('Breakpoint: mobile')).toBeTruthy();
  });
});
