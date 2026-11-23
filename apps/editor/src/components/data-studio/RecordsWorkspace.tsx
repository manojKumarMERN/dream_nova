import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataQueryResultValue, DataRecordValue } from '@nova/sdk';
import type {
  AppDefinition,
  DataFieldDefinition,
  DataQueryCondition,
  DataQueryDefinition,
  DataQueryGroup,
  DataQueryOperator
} from '@nova/spec';
import { createUniqueId } from '../../id';
import { createDataRecord, deleteDataRecord, queryDataRecords, updateDataRecord } from '../../sdk';
import type { DataEnvironment } from '../../sdk';
import type { DataStudioMode } from '../../store';
import type { EditorSessionLike, Toast } from '../../types';
import { Icon } from '../Icons';
import { downloadCsv, formatValue } from './utils';

interface RecordsWorkspaceProps {
  appId: string;
  definition: AppDefinition;
  environment: DataEnvironment;
  mode: DataStudioMode;
  queryBuilderFocused: boolean;
  session: EditorSessionLike;
  onToast: (kind: Toast['kind'], message: string) => void;
}

interface RecordEditorState {
  mode: 'create' | 'edit';
  recordId?: string;
  values: Record<string, string>;
}

const OPERATORS: Array<{ value: DataQueryOperator; label: string; needsValue: boolean }> = [
  { value: 'eq', label: 'Equals', needsValue: true },
  { value: 'ne', label: 'Not equals', needsValue: true },
  { value: 'contains', label: 'Contains', needsValue: true },
  { value: 'startsWith', label: 'Starts with', needsValue: true },
  { value: 'gt', label: 'Greater than', needsValue: true },
  { value: 'gte', label: 'Greater or equal', needsValue: true },
  { value: 'lt', label: 'Less than', needsValue: true },
  { value: 'lte', label: 'Less or equal', needsValue: true },
  { value: 'isEmpty', label: 'Is empty', needsValue: false },
  { value: 'isNotEmpty', label: 'Is not empty', needsValue: false }
];

const EMPTY_RESULT: DataQueryResultValue = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 10,
  pageCount: 1
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstEditableField(
  fields: readonly DataFieldDefinition[]
): DataFieldDefinition | undefined {
  return fields.find((field) => field.system !== true) ?? fields[0];
}

function initialValues(fields: readonly DataFieldDefinition[]): Record<string, string> {
  return Object.fromEntries(
    fields
      .filter((field) => field.system !== true)
      .map((field) => [field.id, field.type === 'boolean' ? 'false' : ''])
  );
}

function toApiValues(
  fields: readonly DataFieldDefinition[],
  values: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.system === true) {
      continue;
    }
    const raw = values[field.id] ?? '';
    if (raw.trim().length === 0) {
      if (field.required === true) {
        throw new Error(`${field.name} is required`);
      }
      continue;
    }
    if (field.type === 'number' || field.type === 'integer' || field.type === 'decimal') {
      const number = Number(raw);
      if (!Number.isFinite(number)) {
        throw new Error(`${field.name} must be a number`);
      }
      result[field.name] = number;
      continue;
    }
    if (field.type === 'boolean') {
      result[field.name] = raw === 'true';
      continue;
    }
    if (field.type === 'json') {
      try {
        result[field.name] = JSON.parse(raw) as unknown;
      } catch {
        throw new Error(`${field.name} must contain valid JSON`);
      }
      continue;
    }
    result[field.name] = raw;
  }
  return result;
}

function FieldInput({
  field,
  value,
  onChange
}: {
  field: DataFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <select
        aria-label={field.name}
        value={value || 'false'}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="false">false</option>
        <option value="true">true</option>
      </select>
    );
  }
  if (field.enumValues !== undefined) {
    return (
      <select
        aria-label={field.name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select…</option>
        {field.enumValues.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'json' || field.type === 'text' || field.type === 'longText') {
    return (
      <textarea
        aria-label={field.name}
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <input
      aria-label={field.name}
      type={
        field.type === 'number' || field.type === 'integer' || field.type === 'decimal'
          ? 'number'
          : 'text'
      }
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function RecordsWorkspace({
  appId,
  definition,
  environment,
  mode,
  queryBuilderFocused,
  session,
  onToast
}: RecordsWorkspaceProps) {
  const [selectedModelId, setSelectedModelId] = useState(definition.dataModels[0]?.id ?? '');
  const [result, setResult] = useState<DataQueryResultValue>(EMPTY_RESULT);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [conditions, setConditions] = useState<DataQueryCondition[]>([]);
  const [builderOpen, setBuilderOpen] = useState(queryBuilderFocused);
  const [queryName, setQueryName] = useState('');
  const [savedQueryId, setSavedQueryId] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | undefined>(undefined);
  const [editor, setEditor] = useState<RecordEditorState | undefined>(undefined);

  const models = definition.dataModels;
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? models[0];
  const fields = selectedModel?.fields ?? [];
  const editableFields = useMemo(() => fields.filter((field) => field.system !== true), [fields]);
  const savedQueries = (definition.queries ?? []).filter(
    (query) => query.modelId === selectedModel?.id
  );
  const selectedRecord = result.rows.find((row) => row.id === selectedRecordId);

  const loadRows = useCallback(async () => {
    if (selectedModel === undefined) {
      setResult(EMPTY_RESULT);
      return;
    }
    setLoading(true);
    setError(undefined);
    const filters: DataQueryGroup | undefined =
      conditions.length === 0
        ? undefined
        : { id: createUniqueId('filter'), operator: 'and', conditions };
    try {
      setResult(
        await queryDataRecords(
          appId,
          selectedModel.name,
          { ...(filters === undefined ? {} : { filters }), page, pageSize: 10 },
          environment
        )
      );
    } catch (cause) {
      setResult(EMPTY_RESULT);
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [appId, conditions, environment, page, selectedModel]);

  useEffect(() => {
    setPage(1);
    setConditions([]);
    setSavedQueryId('');
    setSelectedRecordId(undefined);
    setSearchText('');
  }, [selectedModelId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    setBuilderOpen(queryBuilderFocused);
  }, [queryBuilderFocused]);

  const applySearch = () => {
    const field = firstEditableField(fields) ?? fields[0];
    if (field === undefined || searchText.trim().length === 0) {
      setConditions([]);
      return;
    }
    setConditions([
      {
        id: createUniqueId('condition'),
        field: field.name,
        operator: 'contains',
        value: searchText.trim()
      }
    ]);
    setSavedQueryId('');
    setPage(1);
    setBuilderOpen(true);
  };

  const updateCondition = (id: string, patch: Partial<DataQueryCondition>) => {
    setConditions((current) =>
      current.map((condition) =>
        condition.id === id ? ({ ...condition, ...patch } as DataQueryCondition) : condition
      )
    );
    setSavedQueryId('');
  };

  const loadSavedQuery = (queryId: string) => {
    setSavedQueryId(queryId);
    const query = savedQueries.find((entry) => entry.id === queryId);
    if (query === undefined) {
      setConditions([]);
      return;
    }
    const direct = query.filters?.conditions.filter(
      (condition): condition is DataQueryCondition => 'field' in condition
    );
    setConditions((direct ?? []).map((condition) => ({ ...condition })));
    setPage(query.page ?? 1);
    setBuilderOpen(true);
  };

  const saveQuery = () => {
    const name = queryName.trim();
    if (selectedModel === undefined || name.length === 0) {
      onToast('error', 'Enter a query name');
      return;
    }
    const filters: DataQueryGroup | undefined =
      conditions.length === 0
        ? undefined
        : { id: createUniqueId('filter'), operator: 'and', conditions };
    const query: DataQueryDefinition = {
      id: createUniqueId('query'),
      name,
      modelId: selectedModel.id,
      ...(filters === undefined ? {} : { filters }),
      pageSize: 10,
      page: 1
    };
    const current = session.getDefinition();
    session.replaceDefinition({
      ...current,
      queries: [...(current.queries ?? []), query]
    });
    setSavedQueryId(query.id);
    setQueryName('');
    onToast('success', `Query “${name}” saved to the draft`);
  };

  const openCreate = () => {
    setEditor({ mode: 'create', values: initialValues(fields) });
  };

  const openEdit = (record: DataRecordValue) => {
    const values = Object.fromEntries(
      editableFields.map((field) => [
        field.id,
        record[field.name] === undefined || record[field.name] === null
          ? ''
          : typeof record[field.name] === 'object'
            ? JSON.stringify(record[field.name])
            : String(record[field.name])
      ])
    );
    setEditor({ mode: 'edit', recordId: record.id, values });
  };

  const submitEditor = async () => {
    if (editor === undefined || selectedModel === undefined) {
      return;
    }
    try {
      const values = toApiValues(fields, editor.values);
      if (editor.mode === 'create') {
        await createDataRecord(appId, selectedModel.name, values, environment);
        onToast('success', 'Record created');
      } else if (editor.recordId !== undefined) {
        await updateDataRecord(appId, selectedModel.name, editor.recordId, values, environment);
        onToast('success', 'Record updated');
      }
      setEditor(undefined);
      await loadRows();
    } catch (cause) {
      onToast('error', messageOf(cause));
    }
  };

  const removeRecord = async (record: DataRecordValue) => {
    if (selectedModel === undefined || !window.confirm(`Delete record ${record.id}?`)) {
      return;
    }
    try {
      await deleteDataRecord(appId, selectedModel.name, record.id, environment);
      setSelectedRecordId(undefined);
      onToast('info', 'Record deleted');
      await loadRows();
    } catch (cause) {
      onToast('error', messageOf(cause));
    }
  };

  const exportPage = () => {
    if (result.rows.length === 0) {
      onToast('info', 'There are no records to export');
      return;
    }
    const headers = [...fields.map((field) => field.name), 'createdAt', 'updatedAt'];
    const rows = result.rows.map((row) =>
      headers.map(
        (header) =>
          row[header] ?? (header === 'createdAt' || header === 'updatedAt' ? row[header] : '')
      )
    );
    downloadCsv(`${selectedModel?.name ?? 'records'}-page-${page}.csv`, headers, rows);
    onToast('success', 'Current page exported');
  };

  if (selectedModel === undefined) {
    return (
      <section className="data-studio-section-body">
        <div className="ds-empty-state">
          <Icon name="list" size={26} />
          <h3>No tables to browse</h3>
          <p>Create a table in the designer before working with records.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="data-studio-section-body records-workspace">
      <div className="ds-card compact">
        <header>
          <Icon name="list" size={15} /> Browse records
        </header>
        <div className="ds-form-row">
          <label>
            <span>Table</span>
            <select
              aria-label="Records table"
              value={selectedModel.id}
              onChange={(event) => setSelectedModelId(event.target.value)}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ds-grow">
            <span>Search</span>
            <input
              aria-label="Search records"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  applySearch();
                }
              }}
              placeholder={`Search ${selectedModel.name}…`}
            />
          </label>
          <button type="button" className="data-studio-button" onClick={applySearch}>
            <Icon name="search" size={13} /> Search
          </button>
          <button type="button" className="data-studio-button" onClick={() => void loadRows()}>
            <Icon name="history" size={13} /> Refresh
          </button>
        </div>
      </div>

      <div className="ds-card compact">
        <button
          type="button"
          className="ds-collapse-header"
          aria-expanded={builderOpen}
          onClick={() => setBuilderOpen(!builderOpen)}
        >
          <Icon name="filter" size={14} /> Query builder
          <span>{conditions.length === 0 ? 'No filters' : `${conditions.length} filter(s)`}</span>
          <Icon name={builderOpen ? 'chevron-up' : 'chevron-down'} size={14} />
        </button>
        {builderOpen ? (
          <div className="ds-query-builder">
            <div className="ds-condition-list">
              {conditions.length === 0 ? (
                <p className="ds-empty-inline">Add a condition to filter records on the server.</p>
              ) : null}
              {conditions.map((condition, index) => (
                <div className="ds-condition-row" key={condition.id}>
                  <span>{index === 0 ? 'Where' : 'And'}</span>
                  <select
                    aria-label={`Filter field ${index + 1}`}
                    value={condition.field}
                    onChange={(event) =>
                      updateCondition(condition.id, { field: event.target.value })
                    }
                  >
                    {fields.map((field) => (
                      <option key={field.id} value={field.name}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Filter operator ${index + 1}`}
                    value={condition.operator}
                    onChange={(event) =>
                      updateCondition(condition.id, {
                        operator: event.target.value as DataQueryOperator
                      })
                    }
                  >
                    {OPERATORS.map((operator) => (
                      <option key={operator.value} value={operator.value}>
                        {operator.label}
                      </option>
                    ))}
                  </select>
                  {OPERATORS.find((operator) => operator.value === condition.operator)
                    ?.needsValue === false ? null : (
                    <input
                      aria-label={`Filter value ${index + 1}`}
                      value={formatValue(condition.value)}
                      onChange={(event) =>
                        updateCondition(condition.id, { value: event.target.value })
                      }
                    />
                  )}
                  <button
                    type="button"
                    className="ds-icon-button"
                    aria-label={`Remove filter ${index + 1}`}
                    onClick={() =>
                      setConditions((current) =>
                        current.filter((entry) => entry.id !== condition.id)
                      )
                    }
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="ds-query-actions">
              <button
                type="button"
                className="data-studio-button"
                onClick={() =>
                  setConditions((current) => [
                    ...current,
                    {
                      id: createUniqueId('condition'),
                      field: fields[0]?.name ?? 'id',
                      operator: 'eq',
                      value: ''
                    }
                  ])
                }
              >
                <Icon name="plus" size={13} /> Add condition
              </button>
              <button type="button" className="data-studio-button" onClick={() => void loadRows()}>
                <Icon name="play" size={13} /> Run query
              </button>
              <select
                aria-label="Saved queries"
                value={savedQueryId}
                onChange={(event) => loadSavedQuery(event.target.value)}
              >
                <option value="">Saved queries ({savedQueries.length})</option>
                {savedQueries.map((query) => (
                  <option key={query.id} value={query.id}>
                    {query.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="Query name"
                value={queryName}
                onChange={(event) => setQueryName(event.target.value)}
                placeholder="Query name"
              />
              <button type="button" className="data-studio-button" onClick={saveQuery}>
                <Icon name="save" size={13} /> Save query
              </button>
            </div>
            {mode === 'advanced' ? (
              <p className="ds-hint">
                Saved queries are canonical <code>DataQueryDefinition</code> records attached to the
                app definition. They are available to component bindings after the app is saved.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {error === undefined ? null : <div className="ds-error">{error}</div>}

      <div className="ds-split records-split">
        <div className="ds-detail-pane">
          <header className="ds-detail-header">
            <div>
              <span className="ds-eyebrow">{selectedModel.name}</span>
              <h3>{loading ? 'Loading…' : `${result.total} record(s)`}</h3>
            </div>
            <div className="ds-card-actions">
              <button type="button" className="data-studio-button" onClick={exportPage}>
                <Icon name="download" size={13} /> Export page
              </button>
              <button type="button" className="data-studio-button" onClick={openCreate}>
                <Icon name="plus" size={13} /> New record
              </button>
            </div>
          </header>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  {fields.map((field) => (
                    <th key={field.id}>{field.name}</th>
                  ))}
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedRecordId === row.id ? 'active' : undefined}
                    onClick={() => setSelectedRecordId(row.id)}
                  >
                    {fields.map((field) => (
                      <td key={field.id}>{formatValue(row[field.name])}</td>
                    ))}
                    <td>{formatValue(row.createdAt)}</td>
                  </tr>
                ))}
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={fields.length + 1}>No records found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="ds-pagination">
            <button
              type="button"
              className="data-studio-button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <Icon name="chevron-left" size={13} /> Previous
            </button>
            <span>
              Page {result.page} of {result.pageCount}
            </span>
            <button
              type="button"
              className="data-studio-button"
              disabled={page >= result.pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              Next <Icon name="chevron-right" size={13} />
            </button>
          </div>
        </div>
        <aside className="ds-list-pane" aria-label="Record details">
          <header>Record details</header>
          {selectedRecord === undefined ? (
            <p className="ds-empty-inline">Select a record to review its values.</p>
          ) : (
            <div className="ds-record-detail">
              <code>{selectedRecord.id}</code>
              <dl>
                {fields.map((field) => (
                  <div key={field.id}>
                    <dt>{field.name}</dt>
                    <dd>{formatValue(selectedRecord[field.name])}</dd>
                  </div>
                ))}
                <div>
                  <dt>Created</dt>
                  <dd>{formatValue(selectedRecord.createdAt)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatValue(selectedRecord.updatedAt)}</dd>
                </div>
              </dl>
              <div className="ds-card-actions">
                <button
                  type="button"
                  className="data-studio-button"
                  onClick={() => openEdit(selectedRecord)}
                >
                  <Icon name="edit" size={13} /> Edit
                </button>
                <button
                  type="button"
                  className="data-studio-button danger"
                  onClick={() => void removeRecord(selectedRecord)}
                >
                  <Icon name="trash" size={13} /> Delete
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {editor === undefined ? null : (
        <div className="ds-modal-backdrop" role="presentation">
          <div className="ds-modal" role="dialog" aria-label="Record editor">
            <header>
              <h3>{editor.mode === 'create' ? 'Create record' : 'Edit record'}</h3>
              <button
                type="button"
                className="ds-icon-button"
                aria-label="Close record editor"
                onClick={() => setEditor(undefined)}
              >
                <Icon name="x" size={14} />
              </button>
            </header>
            <div className="ds-editor-fields">
              {editableFields.length === 0 ? (
                <p className="ds-empty-inline">This table has no editable fields.</p>
              ) : (
                editableFields.map((field) => (
                  <label key={field.id}>
                    <span>
                      {field.name}
                      {field.required === true ? ' *' : ''}
                    </span>
                    <FieldInput
                      field={field}
                      value={editor.values[field.id] ?? ''}
                      onChange={(value) =>
                        setEditor((current) =>
                          current === undefined
                            ? current
                            : {
                                ...current,
                                values: { ...current.values, [field.id]: value }
                              }
                        )
                      }
                    />
                  </label>
                ))
              )}
            </div>
            <footer>
              <button
                type="button"
                className="data-studio-button"
                onClick={() => setEditor(undefined)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="data-studio-button accent"
                onClick={() => void submitEditor()}
              >
                <Icon name="check" size={13} /> {editor.mode === 'create' ? 'Create' : 'Save'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
