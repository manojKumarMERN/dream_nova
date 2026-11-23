import { useEffect, useState } from 'react';
import type { Binding, ComponentLayout, ComponentNode } from '@nova/spec';
import { findContract } from '../contracts';
import { effectiveLayout, getLayout, getNode, isHidden, isLocked } from '../tree';
import type {
  EditorSessionLike,
  EditorState,
  InspectorContract,
  InspectorField,
  Toast,
  WorkflowRef
} from '../types';
import { Icon } from './Icons';

interface InspectorProps {
  state: EditorState;
  contracts: readonly InspectorContract[];
  session: EditorSessionLike;
  onOpenWorkflow: (ref: WorkflowRef) => void;
  onToast: (kind: Toast['kind'], message: string) => void;
}

const LAYOUT_TEXT_KEYS = ['width', 'height'] as const;
const LAYOUT_NUMBER_KEYS = [
  'padding',
  'margin',
  'gap',
  'borderRadius',
  'fontSize',
  'fontWeight',
  'gridColumns',
  'gridRows'
] as const;
const LAYOUT_SELECTS: Record<string, { label: string; options: readonly string[] }> = {
  display: { label: 'Display', options: ['block', 'flex', 'grid'] },
  direction: { label: 'Direction', options: ['row', 'column'] },
  alignItems: { label: 'Align items', options: ['start', 'center', 'end', 'stretch'] },
  justifyContent: {
    label: 'Justify content',
    options: ['start', 'center', 'end', 'between']
  },
  textAlign: { label: 'Text align', options: ['left', 'center', 'right'] }
};
const OVERRIDE_KEYS = [
  'width',
  'height',
  'padding',
  'margin',
  'gap',
  'fontSize',
  'borderRadius',
  'backgroundColor'
] as const;

function stringValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function WorkflowField({
  field,
  node,
  onOpenWorkflow
}: {
  field: InspectorField;
  node: ComponentNode;
  onOpenWorkflow: (ref: WorkflowRef) => void;
}) {
  const eventName = stringValue(node.props[field.key] || 'onClick') || 'onClick';
  return (
    <button
      type="button"
      className="field-button"
      aria-label={field.label ?? field.key}
      onClick={() => onOpenWorkflow({ nodeId: node.id, eventName })}
    >
      <Icon name="workflow" size={13} /> Edit workflow
    </button>
  );
}

function JsonField({
  field,
  value,
  onChange
}: {
  field: InspectorField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value ?? {}, null, 2));
  useEffect(() => {
    setDraft(JSON.stringify(value ?? {}, null, 2));
  }, [value]);
  return (
    <textarea
      aria-label={field.label ?? field.key}
      rows={3}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        try {
          onChange(JSON.parse(event.target.value) as unknown);
        } catch {
          return;
        }
      }}
    />
  );
}

function FieldControl({
  field,
  value,
  node,
  onChange,
  onBind,
  onOpenWorkflow
}: {
  field: InspectorField;
  value: unknown;
  node: ComponentNode;
  onChange: (value: unknown) => void;
  onBind: (prop: string) => void;
  onOpenWorkflow: (ref: WorkflowRef) => void;
}) {
  const control = field.control ?? 'text';
  if (control === 'boolean') {
    return (
      <input
        type="checkbox"
        aria-label={field.label ?? field.key}
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (control === 'select') {
    return (
      <select
        aria-label={field.label ?? field.key}
        value={stringValue(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (control === 'number') {
    return (
      <input
        type="number"
        aria-label={field.label ?? field.key}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={stringValue(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    );
  }
  if (control === 'color') {
    return (
      <input
        type="color"
        aria-label={field.label ?? field.key}
        value={stringValue(value) || '#4f46e5'}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (control === 'textarea' || control === 'json') {
    if (control === 'json') {
      return <JsonField field={field} value={value} onChange={onChange} />;
    }
    return (
      <textarea
        aria-label={field.label ?? field.key}
        rows={3}
        placeholder={field.placeholder}
        value={stringValue(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (control === 'workflow') {
    return <WorkflowField field={field} node={node} onOpenWorkflow={onOpenWorkflow} />;
  }
  if (control === 'binding') {
    return (
      <button
        type="button"
        className="field-button"
        aria-label={field.label ?? field.key}
        onClick={() => onBind(field.key)}
      >
        <Icon name="link" size={13} /> Configure binding
      </button>
    );
  }
  if (control === 'image') {
    return (
      <div className="image-field">
        <input
          type="text"
          aria-label={field.label ?? field.key}
          placeholder="https://…"
          value={stringValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
        {stringValue(value).length > 0 ? (
          <img src={stringValue(value)} alt="" className="image-preview" />
        ) : null}
      </div>
    );
  }
  return (
    <input
      type="text"
      aria-label={field.label ?? field.key}
      placeholder={field.placeholder}
      value={stringValue(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function workflowIdFor(node: ComponentNode, eventName: string): string | undefined {
  const workflowId = node.events?.[eventName]?.params?.workflowId;
  return typeof workflowId === 'string' && workflowId.length > 0 ? workflowId : undefined;
}

function parseOverrideValue(key: string, value: string): unknown {
  if (key === 'width' || key === 'height') {
    const numeric = Number(value);
    return Number.isFinite(numeric) && value.trim().length > 0 ? numeric : value;
  }
  if (
    key === 'padding' ||
    key === 'margin' ||
    key === 'gap' ||
    key === 'fontSize' ||
    key === 'borderRadius'
  ) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return value;
}

export function Inspector(props: InspectorProps) {
  const { state, contracts, session, onOpenWorkflow, onToast } = props;
  const [bindingProp, setBindingProp] = useState('');
  const [bindingSource, setBindingSource] = useState('state');
  const [bindingPath, setBindingPath] = useState('');
  const [bindingTransform, setBindingTransform] = useState('');
  const [dataEventName, setDataEventName] = useState('');
  const [dataAction, setDataAction] = useState('queryData');
  const [dataModel, setDataModel] = useState('');
  const [dataPath, setDataPath] = useState('data.query');
  const [dataRecordId, setDataRecordId] = useState('');
  const [dataValues, setDataValues] = useState('{}');
  const [overrideKey, setOverrideKey] = useState<string>('width');
  const [overrideValue, setOverrideValue] = useState('100');

  const selectedId = state.selectedNodeIds[0];
  const selected = selectedId === undefined ? undefined : getNode(state.definition, selectedId);
  const contract = selected === undefined ? undefined : findContract(contracts, selected.type);
  const baseLayout = selected === undefined ? undefined : getLayout(selected);
  const layout = selected === undefined ? undefined : effectiveLayout(selected, state.breakpoint);
  const locked = selected !== undefined && isLocked(state.definition, selected);
  const groups = contract?.inspector ?? [];
  const propKeys = Array.from(
    new Set([
      ...groups.flatMap((group) => group.fields.map((field) => field.key)),
      ...Object.keys(selected?.props ?? {})
    ])
  ).filter((key) => key !== 'layout' && key !== 'hidden');
  const sources = Array.from(
    new Set(['state', 'props', ...state.definition.dataModels.map((model) => model.name)])
  );
  const dataEvents = Object.keys(contract?.events ?? {});
  const effectiveDataEvent = dataEvents.includes(dataEventName)
    ? dataEventName
    : (dataEvents[0] ?? 'onClick');
  const overrides = selected?.breakpointOverrides?.[state.breakpoint] ?? {};

  useEffect(() => {
    const firstModel = state.definition.dataModels[0]?.name ?? '';
    setDataModel((current) => (current.length > 0 ? current : firstModel));
  }, [state.definition.dataModels]);

  const updateProp = (key: string, value: unknown) => {
    if (selected === undefined) {
      return;
    }
    session.updateNode(selected.id, { props: { ...selected.props, [key]: value } });
  };

  const updateLayout = (key: string, value: unknown) => {
    if (selected === undefined || baseLayout === undefined) {
      return;
    }
    if (state.breakpoint !== 'desktop') {
      session.setBreakpointOverride(selected.id, {
        ...overrides,
        [key]: value
      } as ComponentLayout);
      return;
    }
    session.resizeNode(selected.id, { ...baseLayout, [key]: value } as ComponentLayout);
  };

  const setOverride = (key: string | null, targetKey: string = overrideKey) => {
    if (selected === undefined) {
      return;
    }
    const next: Record<string, unknown> = { ...overrides };
    if (key === null) {
      delete next[targetKey];
    } else {
      next[targetKey] = parseOverrideValue(targetKey, overrideValue);
    }
    session.setBreakpointOverride(selected.id, next as ComponentLayout);
    onToast('success', `Override ${key === null ? 'cleared' : 'set'} for ${state.breakpoint}`);
  };

  const applyDataAction = () => {
    if (selected === undefined) {
      return;
    }
    const model = dataModel.trim();
    if (model.length === 0) {
      onToast('error', 'Select a data model first');
      return;
    }
    let params: Record<string, unknown>;
    if (dataAction === 'queryData') {
      if (dataPath.trim().length === 0) {
        onToast('error', 'A result path is required');
        return;
      }
      params = { model, path: dataPath.trim() };
    } else if (dataAction === 'createRecord' || dataAction === 'updateRecord') {
      try {
        const values = JSON.parse(dataValues) as unknown;
        if (typeof values !== 'object' || values === null || Array.isArray(values)) {
          throw new Error('Values must be an object');
        }
        params =
          dataAction === 'createRecord'
            ? { model, values }
            : { model, recordId: dataRecordId.trim(), values };
      } catch {
        onToast('error', 'Values must be a valid JSON object');
        return;
      }
    } else {
      params = { model, recordId: dataRecordId.trim() };
    }
    session.updateNode(selected.id, {
      events: {
        ...selected.events,
        [effectiveDataEvent]: { action: dataAction, params }
      }
    });
    onToast('success', `${dataAction} attached to ${effectiveDataEvent}`);
  };

  return (
    <aside className="inspector" aria-label="Inspector">
      <header className="inspector-header">
        <div>
          <div className="inspector-title">
            {selected === undefined
              ? 'No selection'
              : (selected.name ?? contract?.displayName ?? selected.type)}
          </div>
          <div className="inspector-subtitle">
            {selected?.type ?? 'Select a component on the canvas'}
          </div>
        </div>
        {selected !== undefined ? (
          <div className="inspector-flags">
            {contract?.readiness === 'progressive' ? (
              <span className="inspector-badge">Preview</span>
            ) : null}
            {isHidden(selected) ? <Icon name="eye-off" size={14} /> : null}
            {locked ? <Icon name="lock" size={14} /> : null}
          </div>
        ) : null}
      </header>
      {selected === undefined || contract === undefined || layout === undefined ? (
        <div className="inspector-empty">Select a component to edit its properties.</div>
      ) : (
        <fieldset className="inspector-body" disabled={locked}>
          {groups.map((group) => (
            <section className="inspector-section" key={group.id}>
              <h3>{group.title}</h3>
              {group.fields.map((field) => (
                <div className="field-row" key={field.key}>
                  <label>{field.label ?? field.key}</label>
                  <div className="field-control">
                    <FieldControl
                      field={field}
                      node={selected}
                      value={selected.props[field.key] ?? contract.defaults[field.key]}
                      onChange={(value) => updateProp(field.key, value)}
                      onBind={setBindingProp}
                      onOpenWorkflow={onOpenWorkflow}
                    />
                  </div>
                  {field.description === undefined ? null : (
                    <div className="field-help">{field.description}</div>
                  )}
                </div>
              ))}
              {group.id === 'layout' ? (
                <div className="layout-grid">
                  {LAYOUT_TEXT_KEYS.map((key) => (
                    <label className="field-row" key={key}>
                      <span>{key}</span>
                      <input
                        type="text"
                        aria-label={`Layout ${key}`}
                        value={stringValue(layout[key])}
                        disabled={locked}
                        onChange={(event) => updateLayout(key, event.target.value)}
                      />
                    </label>
                  ))}
                  {LAYOUT_NUMBER_KEYS.map((key) => (
                    <label className="field-row" key={key}>
                      <span>{key}</span>
                      <input
                        type="number"
                        aria-label={`Layout ${key}`}
                        value={stringValue(layout[key])}
                        disabled={locked}
                        onChange={(event) => updateLayout(key, Number(event.target.value))}
                      />
                    </label>
                  ))}
                  {Object.entries(LAYOUT_SELECTS).map(([key, config]) => (
                    <label className="field-row" key={key}>
                      <span>{config.label}</span>
                      <select
                        aria-label={`Layout ${key}`}
                        value={stringValue(layout[key as keyof ComponentLayout])}
                        disabled={locked}
                        onChange={(event) => updateLayout(key, event.target.value)}
                      >
                        <option value="">—</option>
                        {config.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}
              {group.id === 'responsive' ? (
                <div className="responsive-editor">
                  <div className="responsive-context">Editing {state.breakpoint} overrides</div>
                  <div className="field-row">
                    <label htmlFor="override-key">Property</label>
                    <select
                      id="override-key"
                      value={overrideKey}
                      disabled={locked}
                      onChange={(event) => {
                        setOverrideKey(event.target.value);
                        setOverrideValue(
                          stringValue(
                            (overrides as Record<string, unknown>)[event.target.value] ?? ''
                          )
                        );
                      }}
                    >
                      {OVERRIDE_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-row">
                    <label htmlFor="override-value">Value</label>
                    <input
                      id="override-value"
                      type="text"
                      value={overrideValue}
                      disabled={locked}
                      onChange={(event) => setOverrideValue(event.target.value)}
                    />
                  </div>
                  <div className="override-actions">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setOverride(overrideKey)}
                    >
                      <Icon name="plus" size={12} /> Set override
                    </button>
                    <button type="button" disabled={locked} onClick={() => setOverride(null)}>
                      <Icon name="x" size={12} /> Clear
                    </button>
                  </div>
                  <div className="override-list">
                    {Object.entries(overrides).map(([key, value]) => (
                      <div className="override-chip" key={key}>
                        <span>
                          {key}: {stringValue(value)}
                        </span>
                        <button
                          type="button"
                          disabled={locked}
                          aria-label={`Clear ${key} override`}
                          onClick={() => {
                            setOverrideKey(key);
                            setOverrideValue('');
                            setOverride(null, key);
                          }}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {group.fields.length === 0 && group.id !== 'layout' && group.id !== 'responsive' ? (
                <div className="inspector-hint">No properties in this group.</div>
              ) : null}
            </section>
          ))}

          <section className="inspector-section">
            <h3>Bindings</h3>
            <div className="binding-list">
              {propKeys.map((key) => {
                const binding = selected.bindings?.[key] as Binding | undefined;
                return (
                  <div className="binding-row" key={key}>
                    <span className="binding-name">{key}</span>
                    <span className="binding-value">
                      {binding ? `${binding.source}.${binding.path}` : '—'}
                    </span>
                    <button
                      type="button"
                      disabled={locked}
                      aria-label={`Bind ${key}`}
                      onClick={() => setBindingProp(key)}
                    >
                      <Icon name="link" size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            {bindingProp.length > 0 ? (
              <div className="binding-editor">
                <div className="binding-editor-title">Bind “{bindingProp}”</div>
                <select
                  aria-label="Binding source"
                  value={bindingSource}
                  onChange={(event) => setBindingSource(event.target.value)}
                >
                  {sources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Binding path"
                  placeholder="path.to.value"
                  value={bindingPath}
                  onChange={(event) => setBindingPath(event.target.value)}
                />
                <input
                  aria-label="Binding transform"
                  placeholder="transform (optional)"
                  value={bindingTransform}
                  onChange={(event) => setBindingTransform(event.target.value)}
                />
                <div className="binding-actions">
                  <button
                    type="button"
                    className="button-primary"
                    disabled={locked}
                    onClick={() => {
                      if (bindingPath.trim().length === 0) {
                        onToast('error', 'A binding path is required');
                        return;
                      }
                      session.bindProp(selected.id, bindingProp, {
                        source: bindingSource,
                        path: bindingPath.trim(),
                        ...(bindingTransform.trim().length > 0
                          ? { transform: bindingTransform.trim() }
                          : {})
                      });
                      setBindingProp('');
                      setBindingPath('');
                      setBindingTransform('');
                    }}
                  >
                    Apply binding
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={locked}
                    onClick={() => {
                      session.bindProp(selected.id, bindingProp, null);
                      setBindingProp('');
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div className="binding-presets">
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      setBindingProp('rows');
                      setBindingSource('state');
                      setBindingPath('data.query.rows');
                    }}
                  >
                    Table rows
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      setBindingProp('items');
                      setBindingSource('state');
                      setBindingPath('data.query.rows');
                    }}
                  >
                    List items
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      setBindingProp('value');
                      setBindingSource('state');
                      setBindingPath('data.query.rows.0');
                    }}
                  >
                    First record
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="inspector-section">
            <h3>Data actions</h3>
            <div className="field-row">
              <label htmlFor="data-event">Event</label>
              <select
                id="data-event"
                aria-label="Data action event"
                value={effectiveDataEvent}
                disabled={locked}
                onChange={(event) => setDataEventName(event.target.value)}
              >
                {dataEvents.map((eventName) => (
                  <option key={eventName} value={eventName}>
                    {eventName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <label htmlFor="data-action">Action</label>
              <select
                id="data-action"
                aria-label="Data action"
                value={dataAction}
                disabled={locked}
                onChange={(event) => setDataAction(event.target.value)}
              >
                <option value="queryData">queryData</option>
                <option value="createRecord">createRecord</option>
                <option value="updateRecord">updateRecord</option>
                <option value="deleteRecord">deleteRecord</option>
              </select>
            </div>
            <div className="field-row">
              <label htmlFor="data-model">Model</label>
              <input
                id="data-model"
                aria-label="Data model"
                list="data-model-options"
                value={dataModel}
                disabled={locked}
                onChange={(event) => setDataModel(event.target.value)}
              />
              <datalist id="data-model-options">
                {state.definition.dataModels.map((model) => (
                  <option key={model.id} value={model.name}>
                    {model.name}
                  </option>
                ))}
              </datalist>
            </div>
            {dataAction === 'queryData' ? (
              <div className="field-row">
                <label htmlFor="data-path">Result path</label>
                <input
                  id="data-path"
                  aria-label="Data result path"
                  value={dataPath}
                  disabled={locked}
                  onChange={(event) => setDataPath(event.target.value)}
                />
              </div>
            ) : null}
            {dataAction === 'updateRecord' || dataAction === 'deleteRecord' ? (
              <div className="field-row">
                <label htmlFor="data-record">Record id</label>
                <input
                  id="data-record"
                  aria-label="Data record id"
                  value={dataRecordId}
                  disabled={locked}
                  onChange={(event) => setDataRecordId(event.target.value)}
                />
              </div>
            ) : null}
            {dataAction === 'createRecord' || dataAction === 'updateRecord' ? (
              <div className="field-row">
                <label htmlFor="data-values">Values (JSON)</label>
                <textarea
                  id="data-values"
                  aria-label="Data values"
                  rows={3}
                  value={dataValues}
                  disabled={locked}
                  onChange={(event) => setDataValues(event.target.value)}
                />
              </div>
            ) : null}
            <div className="binding-actions">
              <button
                type="button"
                className="button-primary"
                disabled={locked}
                onClick={applyDataAction}
              >
                <Icon name="check" size={13} /> Apply data action
              </button>
            </div>
          </section>

          <section className="inspector-section">
            <h3>Events & workflows</h3>
            {Object.keys(contract.events).length === 0 ? (
              <div className="inspector-hint">This component has no declared events.</div>
            ) : (
              Object.entries(contract.events).map(([eventName, eventContract]) => {
                const workflowId = workflowIdFor(selected, eventName);
                const workflow = state.definition.workflows.find(
                  (candidate) => candidate.id === workflowId
                );
                const action = selected.events?.[eventName]?.action ?? '';
                return (
                  <div className="event-card" key={eventName}>
                    <div className="event-title">{eventName}</div>
                    <div className="event-description">{eventContract.description}</div>
                    <input
                      aria-label={`${eventName} action`}
                      placeholder="Action id"
                      disabled={locked}
                      value={action}
                      onChange={(event) => {
                        const params = selected.events?.[eventName]?.params ?? {};
                        session.updateNode(selected.id, {
                          events: {
                            ...selected.events,
                            [eventName]: { action: event.target.value, params }
                          }
                        });
                      }}
                    />
                    <div className="event-meta">
                      {workflow === undefined
                        ? 'No workflow attached'
                        : `${workflow.name} · ${workflow.steps.length} step${
                            workflow.steps.length === 1 ? '' : 's'
                          }`}
                    </div>
                    <div className="event-actions">
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => onOpenWorkflow({ nodeId: selected.id, eventName })}
                      >
                        <Icon name="workflow" size={13} /> Edit workflow
                      </button>
                      <button
                        type="button"
                        disabled={locked || workflowId === undefined}
                        onClick={() => {
                          session.setWorkflowEvent(selected.id, eventName, null);
                          onToast('success', `Workflow detached from ${eventName}`);
                        }}
                      >
                        <Icon name="x" size={13} /> Detach
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </fieldset>
      )}
    </aside>
  );
}
