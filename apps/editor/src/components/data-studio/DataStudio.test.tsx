import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMinimalAppDefinition } from '@nova/spec';
import type { AppDefinition } from '@nova/spec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDataMigration,
  createDataRecord,
  deleteDataRecord,
  getDataSchemaStatus,
  queryDataRecords,
  updateDataRecord
} from '../../sdk';
import { useStudioStore } from '../../store';
import type { EditorSessionLike } from '../../types';
import { DataStudio } from './DataStudio';

const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

vi.mock('../../sdk', () => ({
  DATA_ENVIRONMENTS: ['development', 'preview', 'production'],
  loadAppDefinition: vi.fn(async () => undefined),
  listApps: vi.fn(async () => []),
  loadVersions: vi.fn(async () => []),
  saveApp: vi.fn(async () => ({})),
  getDataSchemaStatus: vi.fn(),
  applyDataMigration: vi.fn(),
  queryDataRecords: vi.fn(),
  createDataRecord: vi.fn(),
  updateDataRecord: vi.fn(),
  deleteDataRecord: vi.fn()
}));

function makeDefinition(): AppDefinition {
  const base = createMinimalAppDefinition();
  return {
    ...base,
    appId: APP_ID,
    name: 'Orders app',
    dataSchemaVersion: '1.2.0',
    dataModels: [
      {
        id: 'model-customer',
        name: 'Customer',
        relations: {},
        fields: [
          {
            id: 'field-id',
            name: 'id',
            type: 'uuid',
            required: true,
            unique: true,
            system: true
          },
          {
            id: 'field-name',
            name: 'name',
            type: 'string',
            required: true,
            unique: false
          },
          {
            id: 'field-email',
            name: 'email',
            type: 'email',
            required: false,
            unique: true
          }
        ],
        relationships: [
          {
            id: 'relationship-self',
            name: 'Customer_parent',
            sourceModelId: 'model-customer',
            sourceFieldId: 'field-id',
            targetModelId: 'model-customer',
            cardinality: 'one-to-many',
            onDelete: 'cascade',
            onUpdate: 'cascade'
          }
        ]
      }
    ],
    dataPermissions: [
      {
        id: 'permission-owner',
        role: 'owner',
        modelId: 'model-customer',
        actions: ['data:read', 'data:create', 'data:update', 'data:delete']
      }
    ]
  };
}

function makeSession(definition: AppDefinition) {
  let current = definition;
  return {
    getDefinition: vi.fn(() => current),
    replaceDefinition: vi.fn((next: AppDefinition) => {
      current = next;
    }),
    subscribe: vi.fn(() => () => undefined),
    getState: vi.fn(() => ({})),
    select: vi.fn(),
    setBreakpoint: vi.fn(),
    createComponent: vi.fn(() => ''),
    updateNode: vi.fn(),
    moveNode: vi.fn(),
    moveNodes: vi.fn(),
    resizeNode: vi.fn(),
    setBreakpointOverride: vi.fn(),
    bindProp: vi.fn(),
    setWorkflowEvent: vi.fn(),
    setHidden: vi.fn(),
    renameNode: vi.fn(),
    duplicateNode: vi.fn(),
    deleteNodes: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(() => []),
    toggleLock: vi.fn(),
    addPage: vi.fn(() => ''),
    renamePage: vi.fn(),
    removePage: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    replaceDefinitionMock: vi.fn(),
    applyProposal: vi.fn()
  } as unknown as EditorSessionLike & { replaceDefinition: ReturnType<typeof vi.fn> };
}

describe('data studio', () => {
  const definition = makeDefinition();
  const session = makeSession(definition);
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useStudioStore.setState({
      dataStudioSection: 'overview',
      dataStudioMode: 'simple',
      dataEnvironment: 'development',
      dataStudioSearch: '',
      dataStudioSidebarCollapsed: false
    });
    vi.mocked(getDataSchemaStatus).mockResolvedValue({
      current: { version: '1.2.0', models: [] },
      plan: {
        fromVersion: '1.2.0',
        toVersion: '1.3.0',
        operations: [],
        destructive: false,
        impacts: []
      },
      history: []
    });
    vi.mocked(applyDataMigration).mockResolvedValue(undefined);
    vi.mocked(queryDataRecords).mockResolvedValue({
      rows: [
        {
          id: 'record-1',
          modelId: 'model-customer',
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-02T10:00:00.000Z',
          name: 'Ada Lovelace',
          email: 'ada@example.com'
        }
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      pageCount: 1
    });
    vi.mocked(createDataRecord).mockResolvedValue({
      id: 'record-2',
      createdAt: '2026-11-03T10:00:00.000Z',
      updatedAt: '2026-11-03T10:00:00.000Z'
    });
    vi.mocked(updateDataRecord).mockResolvedValue({
      id: 'record-1',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z'
    });
    vi.mocked(deleteDataRecord).mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('navigates sections and shows an explicit unavailable state for SQL editing', async () => {
    render(
      <DataStudio
        appId={APP_ID}
        definition={definition}
        session={session}
        onOpenDesigner={vi.fn()}
        onToast={onToast}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Advanced mode' }));
    expect(screen.getByRole('button', { name: 'Advanced mode' }).getAttribute('aria-pressed')).toBe(
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: /SQL Editor/ }));

    await waitFor(() => {
      expect(screen.getByTestId('unavailable-panel')).toBeTruthy();
    });
    expect(screen.getByText('SQL editor is not available yet')).toBeTruthy();
    expect(screen.getByText(/parameterized execution/)).toBeTruthy();
  });

  it('loads records through the environment-scoped data API', async () => {
    useStudioStore.setState({ dataStudioSection: 'records' });

    render(
      <DataStudio
        appId={APP_ID}
        definition={definition}
        session={session}
        onOpenDesigner={vi.fn()}
        onToast={onToast}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    });
    expect(queryDataRecords).toHaveBeenCalledWith(
      APP_ID,
      'Customer',
      expect.objectContaining({ page: 1, pageSize: 10 }),
      'development'
    );

    fireEvent.change(screen.getByLabelText('Data environment'), {
      target: { value: 'preview' }
    });

    await waitFor(() => {
      expect(queryDataRecords).toHaveBeenCalledWith(
        APP_ID,
        'Customer',
        expect.objectContaining({ page: 1, pageSize: 10 }),
        'preview'
      );
    });
  });

  it('saves structured queries to the canonical definition', async () => {
    useStudioStore.setState({ dataStudioSection: 'query-builder' });

    render(
      <DataStudio
        appId={APP_ID}
        definition={definition}
        session={session}
        onOpenDesigner={vi.fn()}
        onToast={onToast}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    fireEvent.change(screen.getByLabelText('Filter value 1'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Query name'), { target: { value: 'Named customers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save query' }));

    await waitFor(() => {
      expect(session.replaceDefinition).toHaveBeenCalled();
    });
    const next = session.replaceDefinition.mock.calls[0][0] as AppDefinition;
    expect(next.queries?.some((query) => query.name === 'Named customers')).toBe(true);
  });

  it('requires explicit approval for destructive migrations', async () => {
    useStudioStore.setState({ dataStudioSection: 'migrations' });
    vi.mocked(getDataSchemaStatus).mockResolvedValue({
      current: { version: '1.2.0', models: [] },
      plan: {
        fromVersion: '1.2.0',
        toVersion: '1.3.0',
        operations: [
          {
            type: 'remove-field',
            modelId: 'model-customer',
            modelName: 'Customer',
            fieldId: 'field-email',
            fieldName: 'email',
            destructive: true
          }
        ],
        destructive: true,
        impacts: ['Existing email values will be removed']
      },
      history: []
    });

    render(
      <DataStudio
        appId={APP_ID}
        definition={definition}
        session={session}
        onOpenDesigner={vi.fn()}
        onToast={onToast}
      />
    );

    const apply = await screen.findByRole('button', { name: 'Apply migration' });
    await waitFor(() => {
      expect(apply.hasAttribute('disabled')).toBe(true);
    });
    fireEvent.change(screen.getByLabelText('Destructive migration confirmation'), {
      target: { value: 'APPLY DESTRUCTIVE MIGRATION' }
    });
    expect(apply.hasAttribute('disabled')).toBe(false);
    fireEvent.click(apply);

    await waitFor(() => {
      expect(applyDataMigration).toHaveBeenCalledWith(APP_ID, true, 'development');
    });
  });

  it('adds Nova-managed data sources without accepting secrets', async () => {
    useStudioStore.setState({ dataStudioSection: 'sources', dataStudioMode: 'advanced' });

    render(
      <DataStudio
        appId={APP_ID}
        definition={definition}
        session={session}
        onOpenDesigner={vi.fn()}
        onToast={onToast}
      />
    );

    fireEvent.change(screen.getByLabelText('Data source name'), {
      target: { value: 'Primary Nova data' }
    });
    fireEvent.change(screen.getByLabelText('Source model'), {
      target: { value: 'model-customer' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

    await waitFor(() => {
      expect(session.replaceDefinition).toHaveBeenCalled();
    });
    const next = session.replaceDefinition.mock.calls[0][0] as AppDefinition;
    expect(next.dataSources?.[0]).toMatchObject({
      name: 'Primary Nova data',
      provider: 'nova-data',
      environment: 'development',
      modelId: 'model-customer'
    });
    expect(
      screen.getByText(/Connection strings, tokens, and passwords are never accepted/)
    ).toBeTruthy();
  });
});
