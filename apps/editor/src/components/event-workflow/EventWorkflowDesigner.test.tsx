import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMinimalAppDefinition } from '@nova/spec';
import type { AppDefinition } from '@nova/spec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorSessionLike } from '../../types';
import { BUILT_IN_CONTRACTS } from '../../contracts';
import { EventWorkflowDesigner } from './EventWorkflowDesigner';

const flowHarness = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));

vi.mock('@xyflow/react', () => {
  interface MockNode {
    id: string;
    type: string;
    data: Record<string, unknown>;
    selected?: boolean;
  }

  type MockNodeComponent = (props: {
    id: string;
    data: Record<string, unknown>;
    selected?: boolean;
  }) => ReactNode;

  return {
    ReactFlow: (props: Record<string, unknown>) => {
      flowHarness.props = props;
      const nodes = props.nodes as MockNode[];
      const edges = props.edges as Array<{ id: string; label?: string }>;
      const nodeTypes = props.nodeTypes as Record<string, MockNodeComponent>;
      return (
        <div data-testid="react-flow">
          {nodes.map((node) => {
            const Node = nodeTypes[node.type];
            return Node ? (
              <Node key={node.id} id={node.id} data={node.data} selected={node.selected} />
            ) : null;
          })}
          {edges.map((edge) => (
            <div data-edge-id={edge.id} key={edge.id}>
              {String(edge.label)}
            </div>
          ))}
        </div>
      );
    },
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

function nodeIds(): string[] {
  return Array.from(document.querySelectorAll('[data-node-id]'))
    .map((element) => element.getAttribute('data-node-id') ?? '')
    .filter((id) => id.length > 0);
}

function connect(source: string, target: string, sourceHandle: string): void {
  act(() => {
    const onConnect = flowHarness.props.onConnect as
      ((connection: { source: string; target: string; sourceHandle: string }) => void) | undefined;
    onConnect?.({ source, target, sourceHandle });
  });
}

function guidedDefinition(): AppDefinition {
  const definition = createMinimalAppDefinition();
  definition.components.push(
    {
      id: '55555555-5555-4555-8555-555555555555',
      type: 'nova.form',
      contractVersion: '1.0.0',
      name: 'Customer Form',
      props: { submitLabel: 'Save' }
    },
    {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'nova.modal',
      contractVersion: '1.0.0',
      name: 'Customer Modal',
      props: { title: 'Customer', open: false }
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      type: 'nova.drawer',
      contractVersion: '1.0.0',
      name: 'Customer Drawer',
      props: { title: 'Customer', open: false }
    }
  );
  definition.dataModels = [
    {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Customer',
      fields: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
          name: 'customerId',
          type: 'uuid',
          required: true,
          unique: false
        }
      ],
      relations: {}
    }
  ];
  definition.dataSources = [
    {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Nova Data',
      provider: 'nova-data',
      environment: 'development',
      modelId: '66666666-6666-4666-8666-666666666666',
      options: {}
    }
  ];
  definition.queries = [
    {
      id: '88888888-8888-4888-8888-888888888888',
      name: 'Get customer',
      modelId: '66666666-6666-4666-8666-666666666666',
      sourceId: '77777777-7777-4777-8777-777777777777',
      fields: ['customerId'],
      sort: []
    }
  ];
  return definition;
}

function renderDesigner(definition: AppDefinition = createMinimalAppDefinition()) {
  const replaceDefinition = vi.fn();
  const setWorkflowEvent = vi.fn();
  const onSave = vi.fn(async () => undefined);
  const onToast = vi.fn();
  const onClose = vi.fn();
  const session = {
    replaceDefinition,
    setWorkflowEvent
  } as unknown as EditorSessionLike;

  const view = render(
    <EventWorkflowDesigner
      appId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      contracts={BUILT_IN_CONTRACTS}
      definition={definition}
      onClose={onClose}
      onSave={onSave}
      onToast={onToast}
      session={session}
      target={{ nodeId: definition.pages[0]?.rootNodeId ?? 'root', eventName: 'click' }}
    />
  );

  return { ...view, onClose, onSave, onToast, replaceDefinition, session, setWorkflowEvent };
}

describe('event workflow designer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    flowHarness.props = {};
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('adds, configures and removes event nodes', () => {
    renderDesigner();

    expect(nodeIds()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add Listen Event' }));
    expect(nodeIds()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Configure Rise Event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    fireEvent.change(screen.getByLabelText('Event identifier'), {
      target: { value: 'order.created' }
    });
    expect(screen.getAllByText('order.created').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Event timeout'), { target: { value: '45000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simple' }));
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect((screen.getByLabelText('Event timeout') as HTMLInputElement).value).toBe('45000');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Rise Event' }));
    expect(nodeIds()).toHaveLength(1);
  }, 15000);

  it('saves the canonical workflow graph and event binding', async () => {
    const { onSave, replaceDefinition, setWorkflowEvent } = renderDesigner();

    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));

    await waitFor(() => expect(replaceDefinition).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(setWorkflowEvent).toHaveBeenCalledTimes(1);

    const saved = replaceDefinition.mock.calls[0]?.[0] as AppDefinition;
    expect(saved.workflows).toHaveLength(1);
    expect(saved.workflows[0]?.graph?.nodes).toHaveLength(1);
    expect(setWorkflowEvent.mock.calls[0]?.[2]).toBe(saved.workflows[0]?.id);
  });

  it('accepts a semantic outcome branch and rejects a duplicate outcome', () => {
    const { onToast } = renderDesigner();
    fireEvent.click(screen.getByRole('button', { name: 'Add Listen Event' }));

    const [source, target] = nodeIds();
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();

    connect(source as string, target as string, 'success');
    expect(document.querySelectorAll('[data-edge-id]')).toHaveLength(1);

    connect(source as string, target as string, 'success');
    expect(onToast).toHaveBeenCalledWith(
      'error',
      'That outcome is already connected or the connection is invalid'
    );
    expect(document.querySelectorAll('[data-edge-id]')).toHaveLength(1);
  });

  it('supports undo, redo, theme switching and an honest execution state', () => {
    const designer = renderDesigner();

    fireEvent.click(screen.getByRole('button', { name: 'Add Rise Event' }));
    expect(nodeIds()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(nodeIds()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(nodeIds()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(
      screen.getByRole('dialog', { name: 'Event workflow designer' }).getAttribute('data-theme')
    ).toBe('dark');

    fireEvent.click(screen.getByRole('tab', { name: 'Execution log' }));
    expect(screen.getByText('Execution visualization requires a backend dependency')).toBeTruthy();
    expect(designer.onSave).not.toHaveBeenCalled();
  });

  it('adds a guided action with component-aware inspector controls', () => {
    renderDesigner(guidedDefinition());

    expect(screen.getByRole('button', { name: 'Add Open modal' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Open modal' }));

    expect(nodeIds()).toHaveLength(2);
    expect(screen.getByText(/Guided setup · Open modal/)).toBeTruthy();
    expect(screen.getByLabelText('Target component')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply Open details from a button' })).toBeTruthy();
  });

  it('adds a suggested action on the selected outcome branch', () => {
    const { onToast } = renderDesigner(guidedDefinition());
    fireEvent.click(screen.getByRole('button', { name: 'Configure Rise Event' }));

    fireEvent.change(screen.getByLabelText('Outcome for Show message'), {
      target: { value: 'failure' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add suggested Show message' }));

    expect(onToast.mock.calls).toEqual([]);
    expect(nodeIds()).toHaveLength(2);
    expect(document.querySelectorAll('[data-edge-id]')).toHaveLength(1);
    expect(document.querySelector('[data-edge-id]')?.textContent).toBe('Failure');
  });

  it('applies a guided template after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDesigner(guidedDefinition());

    fireEvent.click(screen.getByRole('button', { name: 'Apply Open details from a button' }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(nodeIds()).toHaveLength(4);
    expect(document.querySelectorAll('[data-edge-id]')).toHaveLength(3);
  });

  it('reports validation results from the toolbar', () => {
    const { onToast } = renderDesigner(guidedDefinition());

    fireEvent.click(screen.getByRole('button', { name: 'Validate workflow' }));

    expect(onToast).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tab', { name: /Configuration/ })).toBeTruthy();
  });
});
