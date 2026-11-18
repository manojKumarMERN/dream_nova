import { useEffect, useState } from 'react';
import { findContract } from '../contracts';
import { createUniqueId } from '../session';
import { displayName, listNodes } from '../tree';
import type {
  EditorSessionLike,
  EditorState,
  InspectorContract,
  Toast,
  WorkflowDefinition,
  WorkflowRef,
  WorkflowStep
} from '../types';
import { Icon } from './Icons';

interface WorkflowEditorProps {
  state: EditorState;
  session: EditorSessionLike;
  contracts: readonly InspectorContract[];
  target: WorkflowRef | null;
  onTargetChange: (target: WorkflowRef | null) => void;
  onToast: (kind: Toast['kind'], message: string) => void;
}

function readWorkflow(state: EditorState, target: WorkflowRef): WorkflowStep[] {
  const nodes = listNodes(state.definition);
  const node = nodes.find((candidate) => candidate.id === target.nodeId);
  const steps = node?.events?.[target.eventName]?.params?.steps;
  return Array.isArray(steps) ? (steps as WorkflowStep[]) : [];
}

const KINDS: Array<WorkflowStep['kind']> = ['trigger', 'condition', 'action', 'error'];

export function WorkflowEditor(props: WorkflowEditorProps) {
  const { state, session, contracts, target, onTargetChange, onToast } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const nodes = listNodes(state.definition);
  const nodeId = target?.nodeId ?? state.selectedNodeIds[0] ?? nodes[0]?.id ?? '';
  const node = nodes.find((candidate) => candidate.id === nodeId);
  const contract = node ? findContract(contracts, node.type) : undefined;
  const eventNames = Object.keys(contract?.events ?? {});
  const eventName = target?.eventName ?? eventNames[0] ?? 'submit';

  useEffect(() => {
    if (nodeId && eventName) {
      setSteps(readWorkflow(state, { nodeId, eventName }));
    }
  }, [nodeId, eventName, state]);

  useEffect(() => {
    if (target) {
      setCollapsed(false);
    }
  }, [target]);

  const save = () => {
    if (!nodeId) {
      onToast('error', 'Select a component first');
      return;
    }
    const workflow: WorkflowDefinition = { steps };
    session.setWorkflowEvent(nodeId, eventName, workflow);
    onToast('success', `Saved workflow ${eventName} · ${steps.length} steps`);
  };

  const updateStep = (id: string, patch: Partial<WorkflowStep>) => {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  };

  return (
    <section
      className={`workflow-editor${collapsed ? ' collapsed' : ''}`}
      aria-label="Workflow editor"
    >
      <header className="workflow-header">
        <button
          type="button"
          className="workflow-toggle"
          aria-label={collapsed ? 'Expand workflow editor' : 'Collapse workflow editor'}
          onClick={() => setCollapsed((current) => !current)}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
        </button>
        <Icon name="workflow" size={15} />
        <strong>Workflow</strong>
        <span className="workflow-context">
          {node ? displayName(node, contract?.displayName ?? node.type) : 'No component'} ·{' '}
          {eventName}
        </span>
        <div className="canvas-toolbar-spacer" />
        <button type="button" className="button-primary" onClick={save}>
          <Icon name="save" size={13} /> Save workflow
        </button>
      </header>
      {!collapsed ? (
        <div className="workflow-body">
          <div className="workflow-selectors">
            <label>
              Component
              <select
                aria-label="Workflow component"
                value={nodeId}
                onChange={(event) => onTargetChange({ nodeId: event.target.value, eventName })}
              >
                {nodes.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {displayName(
                      candidate,
                      findContract(contracts, candidate.type)?.displayName ?? candidate.type
                    )}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Event
              <select
                aria-label="Workflow event"
                value={eventName}
                onChange={(event) => onTargetChange({ nodeId, eventName: event.target.value })}
              >
                {eventNames.length === 0 ? <option value={eventName}>{eventName}</option> : null}
                {eventNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {target ? (
              <button
                type="button"
                aria-label="Clear workflow target"
                onClick={() => onTargetChange(null)}
              >
                <Icon name="x" size={13} />
              </button>
            ) : null}
          </div>
          <div className="workflow-steps">
            {steps.length === 0 ? (
              <div className="workflow-empty">No steps yet. Add a trigger or action to begin.</div>
            ) : null}
            {steps.map((step, index) => (
              <div className={`workflow-step kind-${step.kind}`} key={step.id}>
                <span className="workflow-index">{index + 1}</span>
                <select
                  aria-label={`Step ${index + 1} kind`}
                  value={step.kind}
                  onChange={(event) =>
                    updateStep(step.id, { kind: event.target.value as WorkflowStep['kind'] })
                  }
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Step ${index + 1} type`}
                  placeholder="type"
                  value={step.type}
                  onChange={(event) => updateStep(step.id, { type: event.target.value })}
                />
                <textarea
                  aria-label={`Step ${index + 1} params`}
                  placeholder="{} params"
                  rows={1}
                  value={JSON.stringify(step.params)}
                  onChange={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value) as Record<string, unknown>;
                      updateStep(step.id, { params: parsed });
                    } catch {
                      return;
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={`Move step ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() =>
                    setSteps((current) => {
                      const next = [...current];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      return next;
                    })
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move step ${index + 1} down`}
                  disabled={index === steps.length - 1}
                  onClick={() =>
                    setSteps((current) => {
                      const next = [...current];
                      [next[index + 1], next[index]] = [next[index], next[index + 1]];
                      return next;
                    })
                  }
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Delete step ${index + 1}`}
                  onClick={() =>
                    setSteps((current) => current.filter((item) => item.id !== step.id))
                  }
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="workflow-add">
            {KINDS.map((kind) => (
              <button
                type="button"
                key={kind}
                onClick={() =>
                  setSteps((current) => [
                    ...current,
                    {
                      id: createUniqueId('step'),
                      kind,
                      type: kind === 'action' ? 'log' : '',
                      params: {}
                    }
                  ])
                }
              >
                <Icon name="plus" size={12} /> {kind}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
