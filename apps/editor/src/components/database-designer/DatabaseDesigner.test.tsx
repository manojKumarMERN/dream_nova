import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createMinimalAppDefinition } from '@nova/spec';
import type { AppDefinition } from '@nova/spec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../../session';
import { applyDataMigration, getDataMigrationPlan } from '../../sdk';
import type { EditorSessionLike, Toast } from '../../types';
import { DatabaseDesigner } from './DatabaseDesigner';
import { collapsedFieldId, sourceHandleId, targetHandleId } from './model';

const APP_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_MODEL_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID_FIELD = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_EMAIL_FIELD = '44444444-4444-4444-8444-444444444444';
const ORDER_MODEL_ID = '55555555-5555-4555-8555-555555555555';
const ORDER_ID_FIELD = '66666666-6666-4666-8666-666666666666';

interface MockNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  selected?: boolean;
}

interface MockEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface NodeChangeLike {
  id: string;
  type: string;
  position?: { x: number; y: number };
  dragging?: boolean;
}

type MockNodeComponent = (props: {
  id: string;
  data: Record<string, unknown>;
  selected?: boolean;
}) => ReactNode;

interface ConnectionLike {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

interface FlowPropsMock {
  nodes: MockNode[];
  edges: MockEdge[];
  nodeTypes: Record<string, MockNodeComponent>;
  onConnect?: (connection: ConnectionLike) => void;
  onNodeDragStart?: (event: unknown, node: { id: string }) => void;
  onNodeDragStop?: (
    event: unknown,
    node: { id: string; type?: string; position: { x: number; y: number } }
  ) => void;
  onNodesChange?: (changes: NodeChangeLike[]) => void;
}

const flowMock = vi.hoisted(() => ({ props: null as FlowPropsMock | null }));
const reactFlowMock = vi.hoisted(() => ({
  fitView: vi.fn(),
  screenToFlowPosition: vi.fn((point: { x: number; y: number }) => point),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  getNodes: vi.fn((): MockNode[] => []),
  getNode: vi.fn((): MockNode | undefined => undefined)
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: FlowPropsMock) => {
    flowMock.props = props;
    return (
      <div data-testid="react-flow">
        {props.nodes.map((node) => {
          const Node = props.nodeTypes[node.type];
          return Node ? (
            <Node key={node.id} id={node.id} data={node.data} selected={node.selected} />
          ) : null;
        })}
        {props.edges.map((edge) => (
          <div data-testid="designer-edge" key={edge.id}>
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
  useReactFlow: () => reactFlowMock,
  useViewport: () => ({ x: 0, y: 0, zoom: 1 })
}));

vi.mock('../../sdk', () => ({
  getDataMigrationPlan: vi.fn(),
  applyDataMigration: vi.fn()
}));

function currentFlowProps(): FlowPropsMock {
  const props = flowMock.props;
  if (props === null) {
    throw new Error('ReactFlow mock was not rendered');
  }
  return props;
}

function connectNodes(connection: ConnectionLike): void {
  const onConnect = currentFlowProps().onConnect;
  if (onConnect === undefined) {
    throw new Error('onConnect handler was not provided');
  }
  onConnect(connection);
}

function stopNodeDrag(node: {
  id: string;
  type?: string;
  position: { x: number; y: number };
}): void {
  const onNodeDragStop = currentFlowProps().onNodeDragStop;
  if (onNodeDragStop === undefined) {
    throw new Error('onNodeDragStop handler was not provided');
  }
  const onNodeDragStart = currentFlowProps().onNodeDragStart;
  onNodeDragStart?.(null, node);
  onNodeDragStop(null, node);
}

function changeNodePosition(id: string, position: { x: number; y: number }, dragging = true): void {
  const onNodesChange = currentFlowProps().onNodesChange;
  if (onNodesChange === undefined) {
    throw new Error('onNodesChange handler was not provided');
  }
  onNodesChange([{ id, type: 'position', position, dragging }]);
}

interface StoredDesignerLayout {
  positions: Record<string, { x: number; y: number }>;
  groups: {
    id: string;
    name: string;
    position: { x: number; y: number };
    modelIds: string[];
  }[];
  collapsedModelIds: string[];
  layoutDirection?: 'LR' | 'TB';
}

function storedLayout(): StoredDesignerLayout {
  return JSON.parse(
    window.localStorage.getItem(`nova.data-designer.layout.${APP_ID}`) ?? '{}'
  ) as StoredDesignerLayout;
}

function createDefinition(invalid = false): AppDefinition {
  const base = createMinimalAppDefinition();
  return {
    ...base,
    dataModels: [
      {
        id: CUSTOMER_MODEL_ID,
        name: 'customer',
        relations: {},
        fields: [
          {
            id: CUSTOMER_ID_FIELD,
            name: 'id',
            type: 'uuid',
            required: true,
            unique: true,
            system: true
          },
          {
            id: CUSTOMER_EMAIL_FIELD,
            name: 'email',
            type: 'email',
            required: false,
            unique: false,
            ...(invalid ? { maxLength: 0 } : {})
          }
        ]
      },
      {
        id: ORDER_MODEL_ID,
        name: 'order',
        relations: {},
        fields: [
          {
            id: ORDER_ID_FIELD,
            name: 'id',
            type: 'uuid',
            required: true,
            unique: true,
            system: true
          }
        ]
      }
    ]
  };
}

let currentSession: EditorSessionLike;

interface HarnessProps {
  initialDefinition: AppDefinition;
  onClose?: () => void;
  onSave?: () => Promise<void>;
  onToast?: (kind: Toast['kind'], message: string) => void;
}

function Harness({
  initialDefinition,
  onClose = () => undefined,
  onSave = async () => undefined,
  onToast = () => undefined
}: HarnessProps) {
  const [session] = useState(() => createSession(initialDefinition));
  const [definition, setDefinition] = useState(() => session.getDefinition());
  currentSession = session;

  useEffect(() => session.subscribe((state) => setDefinition(state.definition)), [session]);

  return (
    <DatabaseDesigner
      appId={APP_ID}
      definition={definition}
      session={session}
      onClose={onClose}
      onSave={onSave}
      onToast={onToast}
    />
  );
}

function renderDesigner(definition = createDefinition(), onToast = vi.fn()) {
  render(<Harness initialDefinition={definition} onToast={onToast} />);
  return { session: currentSession, onToast };
}

beforeEach(() => {
  window.localStorage.clear();
  flowMock.props = null;
  reactFlowMock.getNodes.mockReset();
  reactFlowMock.getNodes.mockReturnValue([]);
  reactFlowMock.getNode.mockReset();
  reactFlowMock.getNode.mockReturnValue(undefined);
  vi.mocked(getDataMigrationPlan).mockResolvedValue({
    fromVersion: 'draft',
    toVersion: 'current',
    operations: [],
    destructive: false,
    impacts: []
  });
  vi.mocked(applyDataMigration).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('database designer', () => {
  it('creates tables and fields through the canonical session', async () => {
    const { session, onToast } = renderDesigner();
    const dialog = screen.getByRole('dialog', { name: 'Database designer' });

    fireEvent.change(within(dialog).getByLabelText('New data model name'), {
      target: { value: 'invoice' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add model' }));

    await waitFor(() => {
      expect(session.getDefinition().dataModels.some((model) => model.name === 'invoice')).toBe(
        true
      );
    });

    fireEvent.change(within(dialog).getByLabelText('New field name'), {
      target: { value: 'total' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add field' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Field: total')).toBeTruthy();
    });
    const invoice = session.getDefinition().dataModels.find((model) => model.name === 'invoice');
    expect(invoice?.fields.some((field) => field.name === 'total')).toBe(true);
    expect(onToast).toHaveBeenCalledWith('success', expect.stringContaining('Field'));
  });

  it('creates relationships from field handle connections', async () => {
    const { session } = renderDesigner();

    act(() => {
      connectNodes({
        source: CUSTOMER_MODEL_ID,
        sourceHandle: sourceHandleId(CUSTOMER_EMAIL_FIELD),
        target: ORDER_MODEL_ID,
        targetHandle: targetHandleId(ORDER_ID_FIELD)
      });
    });

    await waitFor(() => {
      expect(session.getDefinition().dataModels[0].relationships).toHaveLength(1);
    });
    const relationship = session.getDefinition().dataModels[0].relationships?.[0];
    expect(relationship?.sourceFieldId).toBe(CUSTOMER_EMAIL_FIELD);
    expect(relationship?.targetModelId).toBe(ORDER_MODEL_ID);
    expect(
      session
        .getDefinition()
        .dataModels[0].fields.find((field) => field.id === CUSTOMER_EMAIL_FIELD)?.type
    ).toBe('reference');
    expect(screen.getByTestId('designer-edge')).toBeTruthy();
  });

  it('persists canvas positions separately from the app definition', () => {
    renderDesigner();

    act(() => {
      stopNodeDrag({
        id: CUSTOMER_MODEL_ID,
        position: { x: 123, y: 456 }
      });
    });

    const stored = JSON.parse(
      window.localStorage.getItem(`nova.data-designer.layout.${APP_ID}`) ?? '{}'
    ) as { positions?: Record<string, { x: number; y: number }> };
    expect(stored.positions?.[CUSTOMER_MODEL_ID]).toEqual({ x: 123, y: 456 });
  });

  it('reports local validation issues in the status panel', () => {
    renderDesigner(createDefinition(true));
    const dialog = screen.getByRole('dialog', { name: 'Database designer' });

    expect(
      within(dialog).getByRole('button', { name: /Validation \([1-9]\d* errors/ })
    ).toBeTruthy();
    expect(dialog.querySelector('.designer-issue-list li.error')).not.toBeNull();
  });

  it('requires confirmation before applying a destructive migration', async () => {
    vi.mocked(getDataMigrationPlan).mockResolvedValue({
      fromVersion: 'v1',
      toVersion: 'v2',
      operations: [
        {
          type: 'dropField',
          modelId: CUSTOMER_MODEL_ID,
          modelName: 'customer',
          fieldId: CUSTOMER_EMAIL_FIELD,
          fieldName: 'email',
          destructive: true
        }
      ],
      destructive: true,
      impacts: ['Existing email values will be removed']
    });
    const { onToast } = renderDesigner();
    const dialog = screen.getByRole('dialog', { name: 'Database designer' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Migration preview' }));
    await waitFor(() => {
      expect(
        within(dialog).getByLabelText('I understand this migration is destructive')
      ).toBeTruthy();
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply migration' }));
    expect(applyDataMigration).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(
      'error',
      'Confirm the destructive migration before applying it'
    );

    fireEvent.click(within(dialog).getByLabelText('I understand this migration is destructive'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply migration' }));

    await waitFor(() => {
      expect(applyDataMigration).toHaveBeenCalledWith(APP_ID, true);
    });
  });

  it('collapses a table and keeps relationships attached to the collapsed handle', () => {
    renderDesigner();
    act(() => {
      connectNodes({
        source: CUSTOMER_MODEL_ID,
        sourceHandle: sourceHandleId(CUSTOMER_EMAIL_FIELD),
        target: ORDER_MODEL_ID,
        targetHandle: targetHandleId(ORDER_ID_FIELD)
      });
    });
    const dialog = screen.getByRole('dialog', { name: 'Database designer' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Collapse customer' }));

    expect(storedLayout().collapsedModelIds).toContain(CUSTOMER_MODEL_ID);
    expect(
      currentFlowProps().nodes.find((node) => node.id === CUSTOMER_MODEL_ID)?.data.collapsed
    ).toBe(true);
    expect(
      currentFlowProps().edges.find((edge) => edge.source === CUSTOMER_MODEL_ID)?.sourceHandle
    ).toBe(sourceHandleId(collapsedFieldId(CUSTOMER_MODEL_ID)));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Expand customer' }));
    expect(storedLayout().collapsedModelIds).not.toContain(CUSTOMER_MODEL_ID);
  });

  it('copies, pastes, and undoes/redoes a table through combined history', async () => {
    const { session } = renderDesigner();
    const dialog = screen.getByRole('dialog', { name: 'Database designer' });

    fireEvent.click(within(dialog).getByRole('button', { name: /^customer\s+2 fields$/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy table' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Paste here' }));

    await waitFor(() => {
      expect(session.getDefinition().dataModels.some((model) => model.name === 'customer_2')).toBe(
        true
      );
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(session.getDefinition().dataModels.some((model) => model.name === 'customer_2')).toBe(
        false
      );
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Redo' }));
    await waitFor(() => {
      expect(session.getDefinition().dataModels.some((model) => model.name === 'customer_2')).toBe(
        true
      );
    });
  });

  it('supports keyboard copy and paste shortcuts outside editable fields', async () => {
    const { session } = renderDesigner();
    const dialog = screen.getByRole('dialog', { name: 'Database designer' });

    fireEvent.click(within(dialog).getByRole('button', { name: /^customer\s+2 fields$/ }));
    fireEvent.keyDown(document, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'v', ctrlKey: true });

    await waitFor(() => {
      expect(session.getDefinition().dataModels.some((model) => model.name === 'customer_2')).toBe(
        true
      );
    });
  });

  it('groups a selected table and moves its members when the group is dragged', () => {
    renderDesigner();
    const dialog = screen.getByRole('dialog', { name: 'Database designer' });

    fireEvent.click(within(dialog).getByRole('button', { name: /^customer\s+2 fields$/ }));
    fireEvent.change(within(dialog).getByLabelText('New group name'), {
      target: { value: 'billing' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Group selected table' }));

    const groupNode = currentFlowProps().nodes.find((node) => node.type === 'designerGroup');
    expect(groupNode).toBeDefined();
    expect(storedLayout().groups[0]?.name).toBe('billing');
    expect(storedLayout().groups[0]?.modelIds).toContain(CUSTOMER_MODEL_ID);

    act(() => {
      stopNodeDrag({
        id: groupNode?.id ?? '',
        type: 'designerGroup',
        position: { x: 500, y: 500 }
      });
    });

    expect(storedLayout().groups[0]?.position).toEqual({ x: 500, y: 500 });
    expect(storedLayout().positions[CUSTOMER_MODEL_ID]).toEqual({ x: 540, y: 560 });
  });

  it('snaps a dragged table to a nearby table edge', () => {
    renderDesigner();
    reactFlowMock.getNodes.mockReturnValue([
      { id: 'target', type: 'dataModel', position: { x: 100, y: 100 }, data: {} },
      { id: CUSTOMER_MODEL_ID, type: 'dataModel', position: { x: 0, y: 0 }, data: {} }
    ]);

    act(() => {
      changeNodePosition(CUSTOMER_MODEL_ID, { x: 104, y: 103 });
    });

    expect(
      currentFlowProps().nodes.find((node) => node.id === CUSTOMER_MODEL_ID)?.position
    ).toEqual({
      x: 100,
      y: 100
    });
  });

  it('applies Dagre and force layouts with a persisted direction', () => {
    renderDesigner();
    const dialog = screen.getByRole('dialog', { name: 'Database designer' });

    fireEvent.change(within(dialog).getByLabelText('Layout direction'), {
      target: { value: 'TB' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dagre layout' }));

    const dagrePositions = storedLayout().positions;
    expect(dagrePositions[CUSTOMER_MODEL_ID]).toBeDefined();
    expect(dagrePositions[ORDER_MODEL_ID]).toBeDefined();
    expect(storedLayout().layoutDirection).toBe('TB');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Force layout' }));

    const forcePositions = storedLayout().positions;
    expect(Number.isFinite(forcePositions[CUSTOMER_MODEL_ID]?.x)).toBe(true);
    expect(Number.isFinite(forcePositions[ORDER_MODEL_ID]?.y)).toBe(true);
  });
});
