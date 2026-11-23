import { useEffect, useState } from 'react';
import type {
  WorkflowCondition,
  WorkflowEventConfiguration,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowOutcome,
  WorkflowSubscriptionBehavior
} from '@nova/spec';
import { Icon } from '../Icons';
import { readAuthoringMetadata } from './authoring';
import { withManualIdentifier } from './event-identifiers';
import {
  GUIDED_ACTIONS,
  getActionId,
  getComponentEventOptions,
  getDataSourceOptions,
  getFormOptions,
  getMappingDestinations,
  getMappingSources,
  getOverlayOptions,
  getPropertyOptions,
  getQueryOptions,
  getSourceComponentStatus,
  guidedConfigurationIssues,
  removeGuidedMapping,
  setGuidedMapping,
  suggestNextActions,
  type GuidedActionConfig,
  type GuidedActionContext,
  type GuidedActionId,
  type GuidedActionOption
} from './guided-authoring';
import { OUTCOME_META, WORKFLOW_OUTCOMES } from './model';
import type { WorkflowNodeAction } from './WorkflowEventNode';

export type WorkflowConfigMode = 'simple' | 'advanced';

interface WorkflowInspectorProps {
  node?: WorkflowGraphNode;
  edge?: WorkflowGraphEdge;
  mode: WorkflowConfigMode;
  context: GuidedActionContext;
  onModeChange: (mode: WorkflowConfigMode) => void;
  onNodeChange: (nodeId: string, update: (node: WorkflowGraphNode) => WorkflowGraphNode) => void;
  onEdgeChange: (edgeId: string, patch: Partial<WorkflowGraphEdge>) => void;
  onNodeAction: (nodeId: string, action: WorkflowNodeAction) => void;
  onConfigureGuided: (nodeId: string, actionId: GuidedActionId, patch: GuidedActionConfig) => void;
  onSuggestion: (nodeId: string, outcome: WorkflowOutcome, actionId: GuidedActionId) => void;
  onDeleteEdge: (edgeId: string) => void;
  onClose: () => void;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function GuidedSelect({
  label,
  value,
  options,
  help,
  onChange
}: {
  label: string;
  value: string | undefined;
  options: GuidedActionOption[];
  help?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="event-workflow-field">
      <span>{label}</span>
      <select
        aria-label={label}
        onChange={(event) => onChange(optionalText(event.target.value))}
        value={value ?? ''}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {help === undefined ? null : <small>{help}</small>}
    </label>
  );
}

function parseValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function JsonField({
  label,
  value,
  help,
  onChange
}: {
  label: string;
  value: Record<string, unknown> | undefined;
  help: string;
  onChange: (value: Record<string, unknown> | undefined) => void;
}) {
  const serialized = JSON.stringify(value ?? {}, null, 2);
  const [draft, setDraft] = useState(serialized);
  useEffect(() => setDraft(serialized), [serialized]);

  return (
    <label className="event-workflow-field">
      <span>{label}</span>
      <textarea
        aria-label={label}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          try {
            const parsed = JSON.parse(next) as unknown;
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              onChange(parsed as Record<string, unknown>);
            }
          } catch {
            return;
          }
        }}
        rows={4}
        value={draft}
      />
      <small>{help}</small>
    </label>
  );
}

interface NodeInspectorProps extends Omit<
  WorkflowInspectorProps,
  'node' | 'edge' | 'onEdgeChange' | 'onDeleteEdge'
> {
  node: WorkflowGraphNode;
}

function NodeInspector({
  node,
  mode,
  context,
  onClose,
  onModeChange,
  onNodeChange,
  onNodeAction,
  onConfigureGuided,
  onSuggestion
}: NodeInspectorProps) {
  const config = node.event;
  const [suggestionOutcomes, setSuggestionOutcomes] = useState<Record<string, WorkflowOutcome>>({});
  const actionId = getActionId(node);
  const guidedAction = GUIDED_ACTIONS[actionId];
  const metadata = readAuthoringMetadata(node.event);
  const guidedIssues = guidedConfigurationIssues(node, context);
  const sourceStatus = getSourceComponentStatus(node, context);
  const suggestions = suggestNextActions(node, context).slice(0, 6);
  const configure = (patch: GuidedActionConfig) => onConfigureGuided(node.id, actionId, patch);
  const updateEvent = (patch: Partial<WorkflowEventConfiguration>) => {
    onNodeChange(node.id, (current) => ({
      ...current,
      event: { ...current.event, ...patch }
    }));
  };
  const updateMapping = (index: number, key: string, value: string) => {
    const entries = Object.entries(config.payloadMapping ?? {});
    entries[index] = [key, value];
    updateEvent({
      payloadMapping: Object.fromEntries(entries.filter(([entryKey]) => entryKey.trim().length > 0))
    });
  };
  const updateCondition = (index: number, patch: Partial<WorkflowCondition>) => {
    const conditions = [...(config.conditions ?? [])];
    conditions[index] = { ...conditions[index], ...patch };
    updateEvent({ conditions });
  };
  const setManualIdentifier = (value: string) => {
    onNodeChange(node.id, (current) => ({
      ...current,
      event: withManualIdentifier(
        current.event,
        value,
        readAuthoringMetadata(current.event)?.intent
      )
    }));
  };

  const renderGuidedControls = () => {
    const sourceOptions = context.components
      .filter((component) => component.events.length > 0)
      .map((component) => ({ value: component.id, label: component.displayName }));
    const isSource = actionId === 'start-from-component' || actionId === 'listen-event';
    const isOverlay =
      actionId === 'open-modal' || actionId === 'open-drawer' || actionId === 'close-overlay';
    const isProperty = actionId === 'update-component' || actionId === 'fill-modal';
    const targetOptions = isOverlay
      ? getOverlayOptions(actionId, context)
      : isProperty
        ? context.components
            .filter((component) => getPropertyOptions(component.id, context).length > 0)
            .map((component) => ({
              value: component.id,
              label: component.displayName,
              description: component.type
            }))
        : [];
    const propertyOptions = getPropertyOptions(metadata?.targetComponentId, context);
    const eventOptions = getComponentEventOptions(metadata?.sourceComponentId, context);
    const overlay = context.overlays.find(
      (candidate) => candidate.id === metadata?.targetComponentId
    );
    const closeEventOptions = (overlay?.supportedEvents ?? []).map((event) => ({
      value: event,
      label: event
    }));
    const message =
      typeof metadata?.runtimeAction?.params?.message === 'string'
        ? metadata.runtimeAction.params.message
        : '';
    const mappingSources = getMappingSources(node, context);
    const mappingDestinations = getMappingDestinations(node, context);
    const mappingEntries = Object.entries(metadata?.responseMapping ?? {});
    const showMapping =
      actionId === 'fetch-data' || actionId === 'fill-modal' || actionId === 'raise-and-listen';

    return (
      <details className="event-workflow-group guided" open={mode === 'simple'}>
        <summary>
          <Icon name={guidedAction.icon} size={13} /> Guided setup · {guidedAction.label}
        </summary>
        <p className="event-workflow-guided-help">{guidedAction.description}</p>
        {sourceStatus.status === 'unspecified' ? null : (
          <p className={`event-workflow-source-status status-${sourceStatus.status}`}>
            <Icon name="box" size={12} /> {sourceStatus.label}
          </p>
        )}

        {isSource ? (
          <>
            <GuidedSelect
              label="Source component"
              options={sourceOptions}
              value={metadata?.sourceComponentId}
              onChange={(value) =>
                configure({ sourceComponentId: value, sourceEventName: undefined })
              }
            />
            <GuidedSelect
              label="Component event"
              options={eventOptions}
              value={metadata?.sourceEventName}
              onChange={(value) => configure({ sourceEventName: value })}
            />
          </>
        ) : null}

        {isOverlay || isProperty ? (
          <>
            <GuidedSelect
              label="Target component"
              options={targetOptions}
              value={metadata?.targetComponentId}
              onChange={(value) =>
                configure({
                  targetComponentId: value,
                  targetProperty: undefined,
                  targetAction:
                    actionId === 'open-modal' || actionId === 'open-drawer' ? 'open' : undefined
                })
              }
            />
            {actionId === 'close-overlay' ? (
              <GuidedSelect
                label="Close event"
                options={closeEventOptions}
                value={metadata?.targetAction}
                onChange={(value) => configure({ targetAction: value })}
              />
            ) : null}
            {isProperty ? (
              <GuidedSelect
                label="Target property"
                options={propertyOptions}
                value={metadata?.targetProperty}
                onChange={(value) => configure({ targetProperty: value })}
              />
            ) : null}
          </>
        ) : null}

        {actionId === 'fetch-data' ? (
          <GuidedSelect
            label="Data query"
            options={getQueryOptions(context)}
            value={metadata?.queryId}
            onChange={(value) =>
              configure({
                queryId: value,
                dataSourceId:
                  context.data.queries.find((query) => query.id === value)?.sourceId ??
                  context.data.dataSources[0]?.id
              })
            }
          />
        ) : null}

        {actionId === 'save-data' ? (
          <GuidedSelect
            label="Data source"
            options={getDataSourceOptions(context)}
            value={metadata?.dataSourceId}
            onChange={(value) => configure({ dataSourceId: value })}
          />
        ) : null}

        {actionId === 'validate-form' ? (
          <GuidedSelect
            label="Form"
            options={getFormOptions(context)}
            value={metadata?.formId ?? metadata?.targetComponentId}
            onChange={(value) => configure({ formId: value, targetComponentId: value })}
          />
        ) : null}

        {actionId === 'show-message' ? (
          <label className="event-workflow-field">
            <span>Message</span>
            <textarea
              aria-label="Guided message"
              onChange={(event) => configure({ message: event.target.value })}
              rows={2}
              value={message}
            />
          </label>
        ) : null}

        {showMapping ? (
          <div className="event-workflow-guided-mapping">
            <h5>Visual data mapping</h5>
            {mappingSources.length === 0 || mappingDestinations.length === 0 ? (
              <p className="event-workflow-empty-hint">
                Add a query with fields and a writable target property to map data visually.
              </p>
            ) : null}
            {mappingEntries.map(([destination, expression], index) => (
              <div className="event-workflow-row" key={`${destination}-${index}`}>
                <select
                  aria-label={`Mapping source ${index + 1}`}
                  onChange={(event) =>
                    onNodeChange(node.id, (current) =>
                      setGuidedMapping(current, destination, event.target.value)
                    )
                  }
                  value={expression}
                >
                  {mappingSources.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Mapping destination ${index + 1}`}
                  onChange={(event) =>
                    onNodeChange(node.id, (current) =>
                      setGuidedMapping(
                        removeGuidedMapping(current, destination),
                        event.target.value,
                        expression
                      )
                    )
                  }
                  value={destination}
                >
                  {mappingDestinations.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={`Remove mapping ${index + 1}`}
                  onClick={() =>
                    onNodeChange(node.id, (current) => removeGuidedMapping(current, destination))
                  }
                  type="button"
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            <button
              className="event-workflow-add-row"
              disabled={mappingSources.length === 0 || mappingDestinations.length === 0}
              onClick={() => {
                const source = mappingSources[0];
                const destination = mappingDestinations[0];
                if (source !== undefined && destination !== undefined) {
                  onNodeChange(node.id, (current) =>
                    setGuidedMapping(current, destination.value, source.value)
                  );
                }
              }}
              type="button"
            >
              <Icon name="plus" size={12} /> Add visual mapping
            </button>
          </div>
        ) : null}

        {guidedIssues.length > 0 ? (
          <div className="event-workflow-guided-issues">
            {guidedIssues.map((issue, index) => (
              <p className={`severity-${issue.severity}`} key={`${issue.code}-${index}`}>
                <Icon name={issue.severity === 'error' ? 'x' : 'help'} size={12} />
                {issue.message}
              </p>
            ))}
          </div>
        ) : null}

        {suggestions.length > 0 && mode === 'simple' ? (
          <div className="event-workflow-suggestions">
            <h5>Suggested next steps</h5>
            {suggestions.map((suggestion) => {
              const outcome = suggestionOutcomes[suggestion.id] ?? 'success';
              return (
                <div className="event-workflow-suggestion" key={suggestion.id}>
                  <Icon name={suggestion.icon} size={13} />
                  <span>{suggestion.label}</span>
                  <select
                    aria-label={`Outcome for ${suggestion.label}`}
                    onChange={(event) =>
                      setSuggestionOutcomes((current) => ({
                        ...current,
                        [suggestion.id]: event.target.value as WorkflowOutcome
                      }))
                    }
                    value={outcome}
                  >
                    {WORKFLOW_OUTCOMES.map((option) => (
                      <option key={option} value={option}>
                        {OUTCOME_META[option].label}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label={`Add suggested ${suggestion.label}`}
                    onClick={() => onSuggestion(node.id, outcome, suggestion.id)}
                    type="button"
                  >
                    <Icon name="plus" size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </details>
    );
  };

  return (
    <div className="event-workflow-properties">
      <div className="event-workflow-properties-header">
        <div>
          <span className={`event-workflow-type-badge type-${node.type}`}>{node.type}</span>
          <h3>{node.label}</h3>
        </div>
        <button aria-label="Close properties" onClick={onClose} type="button">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="event-workflow-mode-switch" role="group" aria-label="Configuration mode">
        <button
          aria-pressed={mode === 'simple'}
          className={mode === 'simple' ? 'active' : ''}
          onClick={() => onModeChange('simple')}
          type="button"
        >
          Simple
        </button>
        <button
          aria-pressed={mode === 'advanced'}
          className={mode === 'advanced' ? 'active' : ''}
          onClick={() => onModeChange('advanced')}
          type="button"
        >
          Advanced
        </button>
      </div>
      <p className="event-workflow-mode-help">
        {mode === 'simple'
          ? 'Only the essentials are shown. Advanced settings keep their existing values.'
          : 'All event settings are visible. Values are saved as part of the canonical workflow.'}
      </p>

      {renderGuidedControls()}

      <details className="event-workflow-group" open>
        <summary>
          <Icon name="edit" size={13} /> Basic configuration
        </summary>
        <label className="event-workflow-field">
          <span>Node title</span>
          <input
            aria-label="Node title"
            onChange={(event) =>
              onNodeChange(node.id, (current) => ({ ...current, label: event.target.value }))
            }
            value={node.label}
          />
        </label>
        <label className="event-workflow-field">
          <span>Short description</span>
          <textarea
            aria-label="Node description"
            onChange={(event) =>
              onNodeChange(node.id, (current) => ({
                ...current,
                description: optionalText(event.target.value)
              }))
            }
            rows={2}
            value={node.description ?? ''}
          />
        </label>
        <label className="event-workflow-check">
          <input
            aria-label="Disable node"
            checked={node.disabled === true}
            onChange={(event) =>
              onNodeChange(node.id, (current) => ({ ...current, disabled: event.target.checked }))
            }
            type="checkbox"
          />
          Disable this node without deleting it
        </label>
      </details>

      <details className="event-workflow-group" open>
        <summary>
          <Icon name="workflow" size={13} /> Event configuration
        </summary>
        <label className="event-workflow-field">
          <span>Event name</span>
          <input
            aria-label="Event name"
            onChange={(event) => updateEvent({ name: event.target.value })}
            placeholder="Payment Completed"
            value={config.name}
          />
          <small>A readable name that explains what happened.</small>
        </label>
        <div className="event-workflow-identifier-readonly">
          <span>Event identifier</span>
          <code>{config.identifier}</code>
          <small>
            Generated from the selected component and event. Advanced mode allows a manual override.
          </small>
        </div>
        {mode === 'advanced' ? (
          <label className="event-workflow-field">
            <span>Manual event identifier</span>
            <input
              aria-label="Event identifier"
              onChange={(event) => setManualIdentifier(event.target.value)}
              placeholder="payment.completed"
              value={config.identifier}
            />
            <small>A stable id used by the event source to publish or subscribe.</small>
          </label>
        ) : null}
        {mode === 'advanced' ? (
          <label className="event-workflow-field">
            <span>Event source</span>
            <input
              aria-label="Event source"
              onChange={(event) => updateEvent({ source: event.target.value })}
              placeholder="application | component:id | external"
              value={config.source}
            />
          </label>
        ) : null}
        {node.type === 'riseListen' ? (
          <>
            <label className="event-workflow-field">
              <span>Incoming event identifier</span>
              <input
                aria-label="Incoming event identifier"
                onChange={(event) =>
                  updateEvent({ incomingIdentifier: optionalText(event.target.value) })
                }
                placeholder="payment.processing.completed"
                value={config.incomingIdentifier ?? ''}
              />
            </label>
            <label className="event-workflow-field">
              <span>Correlation key</span>
              <input
                aria-label="Correlation key"
                onChange={(event) =>
                  updateEvent({ correlationKey: optionalText(event.target.value) })
                }
                placeholder="event.correlationId"
                value={config.correlationKey ?? ''}
              />
              <small>Matches the response event to the request that raised it.</small>
            </label>
          </>
        ) : null}
      </details>

      <details className="event-workflow-group" open>
        <summary>
          <Icon name="link" size={13} /> Payload mapping
        </summary>
        {(config.payloadMapping === undefined ? [] : Object.entries(config.payloadMapping)).map(
          ([key, value], index) => (
            <div className="event-workflow-row" key={`${key}-${index}`}>
              <input
                aria-label={`Payload field ${index + 1} name`}
                onChange={(event) => updateMapping(index, event.target.value, value)}
                placeholder="customerId"
                value={key}
              />
              <input
                aria-label={`Payload field ${index + 1} mapping`}
                onChange={(event) => updateMapping(index, key, event.target.value)}
                placeholder="form.customerId"
                value={value}
              />
              <button
                aria-label={`Remove payload field ${index + 1}`}
                onClick={() => {
                  const entries = Object.entries(config.payloadMapping ?? {});
                  entries.splice(index, 1);
                  updateEvent({ payloadMapping: Object.fromEntries(entries) });
                }}
                type="button"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          )
        )}
        <button
          className="event-workflow-add-row"
          onClick={() => {
            const entries = Object.entries(config.payloadMapping ?? {});
            entries.push([`field${entries.length + 1}`, 'payload.value']);
            updateEvent({ payloadMapping: Object.fromEntries(entries) });
          }}
          type="button"
        >
          <Icon name="plus" size={12} /> Add payload field
        </button>
      </details>

      <details className="event-workflow-group">
        <summary>
          <Icon name="filter" size={13} /> Conditions and filters
        </summary>
        {(config.conditions ?? []).map((condition, index) => (
          <div className="event-workflow-condition" key={index}>
            <input
              aria-label={`Condition ${index + 1} path`}
              onChange={(event) => updateCondition(index, { path: event.target.value })}
              placeholder="payload.status"
              value={condition.path}
            />
            <select
              aria-label={`Condition ${index + 1} operator`}
              onChange={(event) =>
                updateCondition(index, { op: event.target.value as WorkflowCondition['op'] })
              }
              value={condition.op}
            >
              {['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'].map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              aria-label={`Condition ${index + 1} value`}
              onChange={(event) =>
                updateCondition(index, { value: parseValue(event.target.value) })
              }
              value={String(condition.value ?? '')}
            />
            <button
              aria-label={`Remove condition ${index + 1}`}
              onClick={() =>
                updateEvent({
                  conditions: (config.conditions ?? []).filter(
                    (_, candidate) => candidate !== index
                  )
                })
              }
              type="button"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
        <button
          className="event-workflow-add-row"
          onClick={() =>
            updateEvent({
              conditions: [
                ...(config.conditions ?? []),
                { path: 'payload.status', op: 'eq', value: 'approved' }
              ]
            })
          }
          type="button"
        >
          <Icon name="plus" size={12} /> Add condition
        </button>
      </details>

      {mode === 'advanced' ? (
        <>
          <details className="event-workflow-group" open>
            <summary>
              <Icon name="settings" size={13} /> Advanced settings
            </summary>
            <label className="event-workflow-field">
              <span>Timeout (ms)</span>
              <input
                aria-label="Event timeout"
                min={0}
                onChange={(event) =>
                  updateEvent({
                    timeoutMs:
                      event.target.value.trim().length === 0
                        ? undefined
                        : Math.max(0, Number(event.target.value) || 0)
                  })
                }
                type="number"
                value={config.timeoutMs ?? ''}
              />
              <small>How long a listener waits before timing out.</small>
            </label>
            {node.type !== 'rise' ? (
              <label className="event-workflow-field">
                <span>Subscription behavior</span>
                <select
                  aria-label="Subscription behavior"
                  onChange={(event) =>
                    updateEvent({
                      subscriptionBehavior: event.target.value as WorkflowSubscriptionBehavior
                    })
                  }
                  value={config.subscriptionBehavior ?? 'once'}
                >
                  <option value="once">Once</option>
                  <option value="persistent">Persistent</option>
                </select>
              </label>
            ) : null}
            {node.type === 'riseListen' ? (
              <>
                <label className="event-workflow-field">
                  <span>Maximum retry attempts</span>
                  <input
                    aria-label="Maximum retry attempts"
                    min={0}
                    onChange={(event) =>
                      updateEvent({
                        retryPolicy: {
                          maxAttempts: Math.max(0, Number(event.target.value) || 0),
                          backoffMs: config.retryPolicy?.backoffMs ?? 0
                        }
                      })
                    }
                    type="number"
                    value={config.retryPolicy?.maxAttempts ?? 0}
                  />
                </label>
                <label className="event-workflow-field">
                  <span>Retry backoff (ms)</span>
                  <input
                    aria-label="Retry backoff"
                    min={0}
                    onChange={(event) =>
                      updateEvent({
                        retryPolicy: {
                          maxAttempts: config.retryPolicy?.maxAttempts ?? 0,
                          backoffMs: Math.max(0, Number(event.target.value) || 0)
                        }
                      })
                    }
                    type="number"
                    value={config.retryPolicy?.backoffMs ?? 0}
                  />
                </label>
                <JsonField
                  help={'Example: { "amount": "form.amount" }'}
                  label="Request payload"
                  onChange={(value) => updateEvent({ requestPayload: value })}
                  value={config.requestPayload}
                />
                <JsonField
                  help={'Example: { "status": "approved" }'}
                  label="Expected response payload"
                  onChange={(value) => updateEvent({ expectedResponsePayload: value })}
                  value={config.expectedResponsePayload}
                />
              </>
            ) : null}
            <JsonField
              help="Custom labels or tenant-safe metadata. Never store credentials here."
              label="Event metadata"
              onChange={(value) => updateEvent({ metadata: value })}
              value={config.metadata}
            />
          </details>
          <details className="event-workflow-group" open>
            <summary>
              <Icon name="activity" size={13} /> Execution settings
            </summary>
            <label className="event-workflow-field">
              <span>Success handling note</span>
              <input
                aria-label="Success handling"
                onChange={(event) =>
                  updateEvent({ successHandling: optionalText(event.target.value) })
                }
                placeholder="Notify requester"
                value={config.successHandling ?? ''}
              />
            </label>
            <label className="event-workflow-field">
              <span>Failure handling note</span>
              <input
                aria-label="Failure handling"
                onChange={(event) =>
                  updateEvent({ failureHandling: optionalText(event.target.value) })
                }
                placeholder="Retry then terminate"
                value={config.failureHandling ?? ''}
              />
            </label>
            <label className="event-workflow-field">
              <span>Warning handling note</span>
              <input
                aria-label="Warning handling"
                onChange={(event) =>
                  updateEvent({ warningHandling: optionalText(event.target.value) })
                }
                placeholder="Log warning and continue"
                value={config.warningHandling ?? ''}
              />
            </label>
          </details>
        </>
      ) : null}

      <div className="event-workflow-property-actions">
        <button onClick={() => onNodeAction(node.id, 'duplicate')} type="button">
          <Icon name="duplicate" size={13} /> Duplicate
        </button>
        <button onClick={() => onNodeAction(node.id, 'toggle')} type="button">
          <Icon name={node.disabled === true ? 'eye' : 'eye-off'} size={13} />
          {node.disabled === true ? 'Enable' : 'Disable'}
        </button>
        <button className="danger" onClick={() => onNodeAction(node.id, 'delete')} type="button">
          <Icon name="trash" size={13} /> Delete
        </button>
      </div>
    </div>
  );
}

export function WorkflowInspector(props: WorkflowInspectorProps) {
  const {
    node,
    edge,
    mode,
    context,
    onModeChange,
    onNodeChange,
    onEdgeChange,
    onNodeAction,
    onConfigureGuided,
    onSuggestion,
    onDeleteEdge,
    onClose
  } = props;

  if (node === undefined && edge === undefined) {
    return (
      <aside className="event-workflow-inspector" aria-label="Workflow properties">
        <div className="event-workflow-panel-title">
          <Icon name="sliders" size={14} />
          <span>Properties</span>
        </div>
        <div className="event-workflow-inspector-empty">
          <Icon name="workflow" size={22} />
          <strong>Select an event node</strong>
          <p>Choose a node or branch on the canvas to configure it.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="event-workflow-inspector" aria-label="Workflow properties">
      <div className="event-workflow-panel-title">
        <Icon name="sliders" size={14} />
        <span>Properties</span>
      </div>
      {node !== undefined ? (
        <NodeInspector
          context={context}
          mode={mode}
          node={node}
          onClose={onClose}
          onConfigureGuided={onConfigureGuided}
          onModeChange={onModeChange}
          onNodeAction={onNodeAction}
          onNodeChange={onNodeChange}
          onSuggestion={onSuggestion}
        />
      ) : (
        <div className="event-workflow-properties">
          <div className="event-workflow-properties-header">
            <div>
              <span className="event-workflow-type-badge type-edge">branch</span>
              <h3>{OUTCOME_META[edge?.outcome ?? 'success'].label} branch</h3>
            </div>
            <button aria-label="Close properties" onClick={onClose} type="button">
              <Icon name="x" size={14} />
            </button>
          </div>
          <label className="event-workflow-field">
            <span>Outcome</span>
            <select
              aria-label="Branch outcome"
              onChange={(event) =>
                edge !== undefined &&
                onEdgeChange(edge.id, { outcome: event.target.value as WorkflowOutcome })
              }
              value={edge?.outcome}
            >
              {WORKFLOW_OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {OUTCOME_META[outcome].label}
                </option>
              ))}
            </select>
          </label>
          <label className="event-workflow-field">
            <span>Branch label</span>
            <input
              aria-label="Branch label"
              onChange={(event) =>
                edge !== undefined &&
                onEdgeChange(edge.id, { label: optionalText(event.target.value) })
              }
              value={edge?.label ?? ''}
            />
            <small>Use a label that tells a non-developer what happens next.</small>
          </label>
          <button
            className="danger"
            onClick={() => edge !== undefined && onDeleteEdge(edge.id)}
            type="button"
          >
            <Icon name="trash" size={13} /> Delete branch
          </button>
        </div>
      )}
    </aside>
  );
}
