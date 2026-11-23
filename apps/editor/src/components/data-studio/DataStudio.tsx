import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { AppDefinition, DataRelationshipDefinition, DataSourceDefinition } from '@nova/spec';
import { createUniqueId } from '../../id';
import { DATA_ENVIRONMENTS } from '../../sdk';
import type { DataEnvironment } from '../../sdk';
import { useStudioStore } from '../../store';
import type { DataStudioSection } from '../../store';
import type { EditorSessionLike, Toast } from '../../types';
import { Icon } from '../Icons';
import type { IconName } from '../Icons';
import { MigrationsWorkspace } from './MigrationsWorkspace';
import { PermissionsWorkspace } from './PermissionsWorkspace';
import { RecordsWorkspace } from './RecordsWorkspace';
import { formatValue, modelName } from './utils';

interface DataStudioProps {
  appId: string;
  definition: AppDefinition;
  session: EditorSessionLike;
  onOpenDesigner: () => void;
  onToast: (kind: Toast['kind'], message: string) => void;
}

interface NavItem {
  id: DataStudioSection;
  label: string;
  icon: IconName;
  advanced?: boolean;
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Build',
    items: [
      { id: 'overview', label: 'Overview', icon: 'layout' },
      { id: 'designer', label: 'Database Designer', icon: 'wand' },
      { id: 'tables', label: 'Tables', icon: 'table' },
      { id: 'relationships', label: 'Relationships', icon: 'link' },
      { id: 'records', label: 'Records', icon: 'list' },
      { id: 'query-builder', label: 'Query Builder', icon: 'filter' }
    ]
  },
  {
    title: 'Connect',
    items: [
      { id: 'sources', label: 'Data Sources', icon: 'database', advanced: true },
      { id: 'connectors', label: 'Connectors', icon: 'link', advanced: true }
    ]
  },
  {
    title: 'Operate',
    items: [
      { id: 'sql', label: 'SQL Editor', icon: 'code', advanced: true },
      { id: 'migrations', label: 'Migrations', icon: 'history', advanced: true },
      { id: 'permissions', label: 'Permissions', icon: 'shield', advanced: true },
      { id: 'logs', label: 'Logs', icon: 'activity', advanced: true }
    ]
  }
];

const SECTION_COPY: Record<DataStudioSection, { title: string; description: string }> = {
  overview: {
    title: 'Data overview',
    description:
      'A live view of the schema, records, access rules, and migration state for this app.'
  },
  designer: {
    title: 'Database designer',
    description: 'Model tables, fields, and relationships visually in the canonical app definition.'
  },
  tables: {
    title: 'Tables',
    description: 'Inspect the tables and fields that make up the active data schema.'
  },
  relationships: {
    title: 'Relationships',
    description: 'Review how tables are connected and how referential actions are configured.'
  },
  records: {
    title: 'Records',
    description: 'Browse, filter, create, update, and delete records through the scoped data API.'
  },
  'query-builder': {
    title: 'Query builder',
    description: 'Build structured filters and save named queries without writing SQL.'
  },
  sql: {
    title: 'SQL editor',
    description: 'Raw SQL execution with parsing, parameters, and approval controls.'
  },
  sources: {
    title: 'Data sources',
    description: 'Nova-managed data sources bound to models in the canonical definition.'
  },
  connectors: {
    title: 'Connectors',
    description: 'External database and SaaS connectivity with server-side credential storage.'
  },
  migrations: {
    title: 'Migrations',
    description: 'Compare the canonical schema with the data plane and apply reviewed migrations.'
  },
  permissions: {
    title: 'Permissions',
    description:
      'Configure model-level roles. The data engine enforces these rules on every request.'
  },
  logs: {
    title: 'Logs',
    description: 'Query, audit, and export data-plane activity with retention controls.'
  }
};

function DataStudioButton({
  children,
  onClick,
  icon,
  disabled
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="data-studio-button" onClick={onClick} disabled={disabled}>
      {icon === undefined ? null : <Icon name={icon} size={13} />}
      {children}
    </button>
  );
}

function UnavailablePanel({
  title,
  summary,
  requirements,
  alternative
}: {
  title: string;
  summary: string;
  requirements: string[];
  alternative?: string;
}) {
  return (
    <section className="data-studio-section-body" data-testid="unavailable-panel">
      <div className="ds-unavailable">
        <span className="ds-unavailable-icon">
          <Icon name="lock" size={22} />
        </span>
        <h3>{title} is not available yet</h3>
        <p>{summary}</p>
        <div className="ds-unavailable-card">
          <strong>Required before this surface can be enabled</strong>
          <ul>
            {requirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </div>
        {alternative === undefined ? null : (
          <p className="ds-unavailable-alternative">
            <Icon name="circle-check" size={14} /> {alternative}
          </p>
        )}
      </div>
    </section>
  );
}

function OverviewWorkspace({
  definition,
  onOpenDesigner,
  onNavigate
}: {
  definition: AppDefinition;
  onOpenDesigner: () => void;
  onNavigate: (section: DataStudioSection) => void;
}) {
  const fields = definition.dataModels.reduce((total, model) => total + model.fields.length, 0);
  const relationships = definition.dataModels.reduce(
    (total, model) => total + (model.relationships?.length ?? 0),
    0
  );
  const stats = [
    { label: 'Tables', value: definition.dataModels.length, icon: 'table' as const },
    { label: 'Fields', value: fields, icon: 'list' as const },
    { label: 'Relationships', value: relationships, icon: 'link' as const },
    { label: 'Saved queries', value: definition.queries?.length ?? 0, icon: 'filter' as const },
    {
      label: 'Permissions',
      value: definition.dataPermissions?.length ?? 0,
      icon: 'shield' as const
    },
    { label: 'Sources', value: definition.dataSources?.length ?? 0, icon: 'database' as const }
  ];

  return (
    <section className="data-studio-section-body">
      <div className="ds-overview-hero">
        <div>
          <span className="ds-eyebrow">Canonical schema</span>
          <h3>{definition.name}</h3>
          <p>
            Schema version <code>{definition.dataSchemaVersion ?? 'not set'}</code>. All Data Studio
            surfaces read and write the same app definition.
          </p>
        </div>
        <DataStudioButton icon="wand" onClick={onOpenDesigner}>
          Open designer
        </DataStudioButton>
      </div>
      <div className="ds-stat-grid">
        {stats.map((stat) => (
          <div className="ds-stat-card" key={stat.label}>
            <span className="ds-stat-icon">
              <Icon name={stat.icon} size={16} />
            </span>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="ds-overview-grid">
        <article className="ds-card">
          <header>
            <Icon name="rocket" size={15} /> Start here
          </header>
          <p>
            Use the visual designer for schema changes, then review the migration plan before
            applying it.
          </p>
          <div className="ds-card-actions">
            <DataStudioButton onClick={() => onNavigate('designer')}>Designer</DataStudioButton>
            <DataStudioButton onClick={() => onNavigate('migrations')}>Migrations</DataStudioButton>
            <DataStudioButton onClick={() => onNavigate('records')}>Records</DataStudioButton>
          </div>
        </article>
        <article className="ds-card">
          <header>
            <Icon name="shield" size={15} /> Safety model
          </header>
          <ul className="ds-bullets">
            <li>Model and field edits stay in the draft until saved.</li>
            <li>The data engine enforces permissions on every request.</li>
            <li>Destructive migrations require an explicit confirmation.</li>
            <li>Secrets are never stored in the app definition.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function DesignerWorkspace({ onOpenDesigner }: { onOpenDesigner: () => void }) {
  return (
    <section className="data-studio-section-body">
      <div className="ds-designer-callout">
        <span className="ds-designer-illustration">
          <Icon name="database" size={34} />
          <Icon name="link" size={22} />
          <Icon name="table" size={34} />
        </span>
        <div>
          <h3>Design the schema visually</h3>
          <p>
            Add tables, connect fields, arrange groups, and review migration impact. The designer
            writes directly to the canonical definition with undo, redo, and validation.
          </p>
          <ul className="ds-bullets">
            <li>Drag fields between tables to create relationships.</li>
            <li>Use Dagre or force layouts to organize the canvas.</li>
            <li>Preview destructive changes before applying migrations.</li>
          </ul>
          <DataStudioButton icon="wand" onClick={onOpenDesigner}>
            Open database designer
          </DataStudioButton>
        </div>
      </div>
    </section>
  );
}

function TablesWorkspace({
  definition,
  search,
  onOpenDesigner
}: {
  definition: AppDefinition;
  search: string;
  onOpenDesigner: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const models = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) {
      return definition.dataModels;
    }
    return definition.dataModels.filter(
      (model) =>
        model.name.toLowerCase().includes(needle) ||
        model.fields.some((field) => field.name.toLowerCase().includes(needle))
    );
  }, [definition.dataModels, search]);
  const selected = models.find((model) => model.id === selectedId) ?? models[0];

  if (models.length === 0) {
    return (
      <section className="data-studio-section-body">
        <div className="ds-empty-state">
          <Icon name="table" size={26} />
          <h3>{search.trim().length > 0 ? 'No tables match your search' : 'No tables yet'}</h3>
          <p>Create a table in the visual designer to start defining the data schema.</p>
          <DataStudioButton icon="wand" onClick={onOpenDesigner}>
            Open designer
          </DataStudioButton>
        </div>
      </section>
    );
  }

  return (
    <section className="data-studio-section-body ds-split">
      <aside className="ds-list-pane" aria-label="Table list">
        <header>Tables ({models.length})</header>
        {models.map((model) => (
          <button
            type="button"
            key={model.id}
            className={`ds-list-item${selected?.id === model.id ? ' active' : ''}`}
            onClick={() => setSelectedId(model.id)}
          >
            <Icon name="table" size={14} />
            <span>
              <strong>{model.name}</strong>
              <small>
                {model.fields.length} fields · {model.relationships?.length ?? 0} relationships
              </small>
            </span>
          </button>
        ))}
      </aside>
      {selected === undefined ? null : (
        <div className="ds-detail-pane">
          <header className="ds-detail-header">
            <div>
              <span className="ds-eyebrow">Table</span>
              <h3>{selected.name}</h3>
            </div>
            <DataStudioButton icon="wand" onClick={onOpenDesigner}>
              Edit in designer
            </DataStudioButton>
          </header>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Unique</th>
                  <th>System</th>
                </tr>
              </thead>
              <tbody>
                {selected.fields.map((field) => (
                  <tr key={field.id}>
                    <td>
                      <code>{field.name}</code>
                    </td>
                    <td>{field.type}</td>
                    <td>{field.required ? 'Yes' : 'No'}</td>
                    <td>{field.unique ? 'Yes' : 'No'}</td>
                    <td>{field.system === true ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected.relationships === undefined || selected.relationships.length === 0 ? null : (
            <div className="ds-card compact">
              <header>
                <Icon name="link" size={14} /> Relationships
              </header>
              <div className="ds-chip-row">
                {selected.relationships.map((relationship) => (
                  <span className="ds-chip" key={relationship.id}>
                    {relationship.name} · {relationship.cardinality}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RelationshipsWorkspace({
  definition,
  search,
  onOpenDesigner
}: {
  definition: AppDefinition;
  search: string;
  onOpenDesigner: () => void;
}) {
  const relationships = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = definition.dataModels.flatMap((model) =>
      (model.relationships ?? []).map((relationship) => ({ model, relationship }))
    );
    if (needle.length === 0) {
      return all;
    }
    return all.filter(({ relationship }) =>
      `${relationship.name} ${modelName(definition, relationship.sourceModelId)} ${modelName(definition, relationship.targetModelId)}`
        .toLowerCase()
        .includes(needle)
    );
  }, [definition, search]);

  if (relationships.length === 0) {
    return (
      <section className="data-studio-section-body">
        <div className="ds-empty-state">
          <Icon name="link" size={26} />
          <h3>No relationships yet</h3>
          <p>Connect two table fields in the designer to define how records are related.</p>
          <DataStudioButton icon="wand" onClick={onOpenDesigner}>
            Open designer
          </DataStudioButton>
        </div>
      </section>
    );
  }

  return (
    <section className="data-studio-section-body">
      <div className="ds-relationship-grid">
        {relationships.map(({ relationship }: { relationship: DataRelationshipDefinition }) => (
          <article className="ds-relationship-card" key={relationship.id}>
            <header>
              <Icon name="link" size={15} /> {relationship.name}
            </header>
            <div className="ds-relationship-path">
              <span>{modelName(definition, relationship.sourceModelId)}</span>
              <Icon name="chevron-right" size={14} />
              <span>{modelName(definition, relationship.targetModelId)}</span>
            </div>
            <dl>
              <div>
                <dt>Cardinality</dt>
                <dd>{relationship.cardinality}</dd>
              </div>
              <div>
                <dt>On delete</dt>
                <dd>{relationship.onDelete}</dd>
              </div>
              <div>
                <dt>On update</dt>
                <dd>{relationship.onUpdate}</dd>
              </div>
              {relationship.junctionModelId === undefined ? null : (
                <div>
                  <dt>Junction</dt>
                  <dd>{modelName(definition, relationship.junctionModelId)}</dd>
                </div>
              )}
            </dl>
            {relationship.description === undefined ? null : <p>{relationship.description}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function SourcesWorkspace({
  definition,
  session,
  search,
  onToast
}: {
  definition: AppDefinition;
  session: EditorSessionLike;
  search: string;
  onToast: DataStudioProps['onToast'];
}) {
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState(definition.dataModels[0]?.id ?? '');
  const [environment, setEnvironment] = useState<DataEnvironment>('development');
  const needle = search.trim().toLowerCase();
  const sources = (definition.dataSources ?? []).filter((source) =>
    `${source.name} ${source.environment}`.toLowerCase().includes(needle)
  );

  const addSource = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || modelId.length === 0) {
      onToast('error', 'Enter a source name and select a model');
      return;
    }
    const source: DataSourceDefinition = {
      id: createUniqueId('source'),
      name: trimmed,
      provider: 'nova-data',
      environment,
      modelId
    };
    const current = session.getDefinition();
    session.replaceDefinition({
      ...current,
      dataSources: [...(current.dataSources ?? []), source]
    });
    setName('');
    onToast('success', `Data source “${trimmed}” added to the draft`);
  };

  const removeSource = (source: DataSourceDefinition) => {
    if (!window.confirm(`Remove data source “${source.name}”?`)) {
      return;
    }
    const current = session.getDefinition();
    session.replaceDefinition({
      ...current,
      dataSources: (current.dataSources ?? []).filter((entry) => entry.id !== source.id)
    });
    onToast('info', 'Data source removed from the draft');
  };

  return (
    <section className="data-studio-section-body">
      <div className="ds-card">
        <header>
          <Icon name="plus" size={15} /> Add Nova-managed source
        </header>
        <div className="ds-form-row">
          <label>
            <span>Name</span>
            <input
              aria-label="Data source name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Primary data"
            />
          </label>
          <label>
            <span>Model</span>
            <select
              aria-label="Source model"
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
            >
              <option value="">Select model…</option>
              {definition.dataModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Environment</span>
            <select
              aria-label="Source environment"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as DataEnvironment)}
            >
              {DATA_ENVIRONMENTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <DataStudioButton icon="plus" onClick={addSource}>
            Add source
          </DataStudioButton>
        </div>
        <p className="ds-hint">
          Only the Nova-managed provider is supported. Connection strings, tokens, and passwords are
          never accepted here.
        </p>
      </div>
      <div className="ds-card">
        <header>
          <Icon name="database" size={15} /> Configured sources ({sources.length})
        </header>
        {sources.length === 0 ? (
          <p className="ds-empty-inline">No data sources configured.</p>
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Environment</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td>{source.name}</td>
                    <td>{source.provider}</td>
                    <td>{modelName(definition, source.modelId ?? '')}</td>
                    <td>{source.environment}</td>
                    <td>
                      <button
                        type="button"
                        className="ds-icon-button"
                        aria-label={`Remove ${source.name}`}
                        onClick={() => removeSource(source)}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export function DataStudio({
  appId,
  definition,
  session,
  onOpenDesigner,
  onToast
}: DataStudioProps) {
  const section = useStudioStore((state) => state.dataStudioSection);
  const mode = useStudioStore((state) => state.dataStudioMode);
  const environment = useStudioStore((state) => state.dataEnvironment);
  const search = useStudioStore((state) => state.dataStudioSearch);
  const collapsed = useStudioStore((state) => state.dataStudioSidebarCollapsed);
  const setSection = useStudioStore((state) => state.setDataStudioSection);
  const setMode = useStudioStore((state) => state.setDataStudioMode);
  const setEnvironment = useStudioStore((state) => state.setDataEnvironment);
  const setSearch = useStudioStore((state) => state.setDataStudioSearch);
  const toggleSidebar = useStudioStore((state) => state.toggleDataStudioSidebar);
  const copy = SECTION_COPY[section];

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => mode === 'advanced' || item.advanced !== true || item.id === section
        )
      })),
    [mode, section]
  );

  return (
    <div className="data-studio" data-section={section}>
      <header className="data-studio-topbar">
        <div className="ds-breadcrumb">
          <span>Workspace</span>
          <Icon name="chevron-right" size={12} />
          <span>{definition.name}</span>
          <Icon name="chevron-right" size={12} />
          <strong>Data Studio</strong>
        </div>
        <div className="ds-topbar-tools">
          <label className="ds-search">
            <Icon name="search" size={14} />
            <input
              aria-label="Search Data Studio"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tables, fields, queries…"
            />
          </label>
          <label className="ds-environment">
            <Icon name="database" size={13} />
            <select
              aria-label="Data environment"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as DataEnvironment)}
            >
              {DATA_ENVIRONMENTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className="ds-mode-switch" role="group" aria-label="Data Studio mode">
            <button
              type="button"
              aria-label="Simple mode"
              aria-pressed={mode === 'simple'}
              className={mode === 'simple' ? 'active' : ''}
              onClick={() => setMode('simple')}
            >
              Simple
            </button>
            <button
              type="button"
              aria-label="Advanced mode"
              aria-pressed={mode === 'advanced'}
              className={mode === 'advanced' ? 'active' : ''}
              onClick={() => setMode('advanced')}
            >
              Advanced
            </button>
          </div>
          <span className="ds-user" title="Signed-in user">
            <span className="ds-avatar">NV</span>
          </span>
        </div>
      </header>
      <div className="data-studio-body">
        <nav
          className={`data-studio-nav${collapsed ? ' collapsed' : ''}`}
          aria-label="Data Studio sections"
        >
          <button
            type="button"
            className="ds-nav-toggle"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={toggleSidebar}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
            {collapsed ? null : <span>Collapse</span>}
          </button>
          {visibleGroups.map((group) => (
            <div className="ds-nav-group" key={group.title}>
              {collapsed ? null : <span className="ds-nav-title">{group.title}</span>}
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-current={section === item.id ? 'page' : undefined}
                  className={`ds-nav-item${section === item.id ? ' active' : ''}`}
                  title={collapsed ? item.label : undefined}
                  onClick={() => setSection(item.id)}
                >
                  <Icon name={item.icon} size={15} />
                  {collapsed ? null : <span>{item.label}</span>}
                  {collapsed || item.advanced !== true ? null : (
                    <span className="ds-nav-badge">Adv</span>
                  )}
                </button>
              ))}
            </div>
          ))}
          <div className="ds-nav-footer">
            <Icon name="shield" size={13} />
            {collapsed ? null : <span>Server-enforced access</span>}
          </div>
        </nav>
        <main className="data-studio-main">
          <header className="data-studio-heading">
            <div>
              <h2>{copy.title}</h2>
              <p>{copy.description}</p>
            </div>
            <span className="ds-mode-indicator">
              <Icon name={mode === 'simple' ? 'circle-check' : 'code'} size={13} />
              {mode === 'simple' ? 'Guided' : 'Advanced'}
            </span>
          </header>
          {section === 'overview' ? (
            <OverviewWorkspace
              definition={definition}
              onOpenDesigner={onOpenDesigner}
              onNavigate={setSection}
            />
          ) : null}
          {section === 'designer' ? <DesignerWorkspace onOpenDesigner={onOpenDesigner} /> : null}
          {section === 'tables' ? (
            <TablesWorkspace
              definition={definition}
              search={search}
              onOpenDesigner={onOpenDesigner}
            />
          ) : null}
          {section === 'relationships' ? (
            <RelationshipsWorkspace
              definition={definition}
              search={search}
              onOpenDesigner={onOpenDesigner}
            />
          ) : null}
          {section === 'records' || section === 'query-builder' ? (
            <RecordsWorkspace
              appId={appId}
              definition={definition}
              environment={environment}
              mode={mode}
              queryBuilderFocused={section === 'query-builder'}
              session={session}
              onToast={onToast}
            />
          ) : null}
          {section === 'sql' ? (
            <UnavailablePanel
              title="SQL editor"
              summary="Raw SQL is not enabled because this build has no server-side SQL parsing, parameter binding, statement approval, or query-timeout surface."
              requirements={[
                'SQL parser with dialect validation',
                'Server-side parameterized execution',
                'Read-only transaction enforcement and statement limits',
                'Destructive statement approval workflow',
                'Query timeout and audit logging'
              ]}
              alternative="Use Query Builder to create structured filters and Records to inspect scoped results."
            />
          ) : null}
          {section === 'sources' ? (
            <SourcesWorkspace
              definition={definition}
              session={session}
              search={search}
              onToast={onToast}
            />
          ) : null}
          {section === 'connectors' ? (
            <UnavailablePanel
              title="External connectors"
              summary="External databases and SaaS connectors are not part of the current data engine. Only the Nova-managed provider is implemented."
              requirements={[
                'Server-side connector registry',
                'Encrypted credential vault with per-environment secrets',
                'Connection health checks and schema introspection',
                'Connector-level access policies'
              ]}
              alternative="Use Data Sources to bind Nova-managed sources to canonical models."
            />
          ) : null}
          {section === 'migrations' ? (
            <MigrationsWorkspace
              appId={appId}
              definition={definition}
              environment={environment}
              mode={mode}
              onToast={onToast}
            />
          ) : null}
          {section === 'permissions' ? (
            <PermissionsWorkspace
              definition={definition}
              session={session}
              mode={mode}
              onToast={onToast}
            />
          ) : null}
          {section === 'logs' ? (
            <UnavailablePanel
              title="Data activity logs"
              summary="There is no data-plane log API in the current platform, so no activity timeline or export is shown."
              requirements={[
                'Structured audit events for reads and writes',
                'Searchable log API with actor, model, and environment filters',
                'Retention policy and access controls',
                'CSV export stream with permission checks'
              ]}
              alternative="Migration history is available in the Migrations section."
            />
          ) : null}
        </main>
      </div>
      <footer className="data-studio-footer">
        <span>
          <Icon name="database" size={12} /> Nova Data Engine
        </span>
        <span>{formatValue(environment)}</span>
        <span>Schema {definition.dataSchemaVersion ?? 'unversioned'}</span>
      </footer>
    </div>
  );
}
