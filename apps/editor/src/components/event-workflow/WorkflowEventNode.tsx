import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { WorkflowGraphNode, WorkflowOutcome } from '@nova/spec';
import { Icon } from '../Icons';
import type { IconName } from '../Icons';
import { getActionLabel } from './guided-authoring';
import { OUTCOME_META, WORKFLOW_OUTCOMES } from './model';

export type WorkflowExecutionState =
  'idle' | 'pending' | 'running' | 'success' | 'failure' | 'warning';
export type WorkflowNodeAction = 'configure' | 'duplicate' | 'toggle' | 'delete';

export interface WorkflowEventNodeData extends Record<string, unknown> {
  node: WorkflowGraphNode;
  selected: boolean;
  validation: 'valid' | 'warning' | 'error';
  execution: WorkflowExecutionState;
  connectedOutcomes: WorkflowOutcome[];
  onAction: (nodeId: string, action: WorkflowNodeAction) => void;
}

export type WorkflowEventFlowNode = Node<WorkflowEventNodeData, 'workflowEvent'>;

const NODE_ICONS: Record<WorkflowGraphNode['type'], IconName> = {
  rise: 'rocket',
  listen: 'bell',
  riseListen: 'workflow'
};

const EXECUTION_LABELS: Record<WorkflowExecutionState, string> = {
  idle: 'Not executed',
  pending: 'Pending',
  running: 'Running',
  success: 'Success',
  failure: 'Failed',
  warning: 'Warning'
};

function configurationStatus(node: WorkflowGraphNode): { label: string; complete: boolean } {
  const config = node.event;
  const complete =
    config.identifier.trim().length > 0 &&
    config.source.trim().length > 0 &&
    (node.type !== 'riseListen' ||
      (config.incomingIdentifier !== undefined && config.correlationKey !== undefined));
  return { label: complete ? 'Configured' : 'Needs setup', complete };
}

export const WorkflowEventNode = memo(function WorkflowEventNode({
  data
}: NodeProps<WorkflowEventFlowNode>) {
  const status = configurationStatus(data.node);
  const execution = data.execution;
  return (
    <div
      className={`workflow-node workflow-node-${data.node.type} ${data.selected ? 'selected' : ''} ${
        data.node.disabled === true ? 'disabled' : ''
      }`}
      data-node-id={data.node.id}
      data-execution={execution}
      data-validation={data.validation}
    >
      <Handle
        className="workflow-handle workflow-handle-input"
        id="in"
        position={Position.Left}
        type="target"
      />
      <div className="workflow-node-header">
        <span className="workflow-node-icon" aria-hidden="true">
          <Icon name={NODE_ICONS[data.node.type]} size={15} />
        </span>
        <div className="workflow-node-heading">
          <strong>{data.node.label}</strong>
          <span>{getActionLabel(data.node)}</span>
        </div>
        <span className={`workflow-node-validation validation-${data.validation}`}>
          <Icon
            name={
              data.validation === 'error' ? 'x' : data.validation === 'warning' ? 'help' : 'check'
            }
            size={12}
          />
          <span>
            {data.validation === 'valid'
              ? 'Valid'
              : data.validation === 'warning'
                ? 'Review'
                : 'Issue'}
          </span>
        </span>
      </div>
      <div className="workflow-node-body">
        <p className="workflow-node-description">
          {data.node.description ?? 'Configure this event to describe the workflow step.'}
        </p>
        <div className="workflow-node-identifier">
          <Icon name="link" size={12} />
          <span>{data.node.event.identifier}</span>
        </div>
        {data.node.type === 'riseListen' ? (
          <div className="workflow-node-correlation">
            <Icon name="activity" size={12} />
            <span>{data.node.event.incomingIdentifier ?? 'Response event missing'}</span>
          </div>
        ) : null}
      </div>
      <div className="workflow-node-footer">
        <span className={`workflow-node-status ${status.complete ? 'complete' : 'incomplete'}`}>
          <Icon name={status.complete ? 'circle-check' : 'settings'} size={12} />
          {status.label}
        </span>
        <span className={`workflow-node-execution execution-${execution}`}>
          <Icon
            name={
              execution === 'success'
                ? 'check'
                : execution === 'failure'
                  ? 'x'
                  : execution === 'warning'
                    ? 'help'
                    : 'clock'
            }
            size={12}
          />
          {EXECUTION_LABELS[execution]}
        </span>
      </div>
      <div className="workflow-node-outputs">
        {WORKFLOW_OUTCOMES.map((outcome, index) => {
          const meta = OUTCOME_META[outcome];
          const connected = data.connectedOutcomes.includes(outcome);
          return (
            <div className={`workflow-output outcome-${outcome}`} key={outcome}>
              <span className="workflow-output-label">
                <Icon name={meta.icon} size={11} />
                {meta.label}
              </span>
              <span className={`workflow-output-dot ${connected ? 'connected' : ''}`} />
              <Handle
                className={`workflow-handle workflow-handle-output outcome-${outcome}`}
                id={outcome}
                position={Position.Right}
                style={{ top: `${62 + index * 16}%` }}
                type="source"
              />
            </div>
          );
        })}
      </div>
      <div className="workflow-node-actions">
        <button
          aria-label={`Configure ${data.node.label}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onAction(data.node.id, 'configure');
          }}
          type="button"
        >
          <Icon name="settings" size={13} />
        </button>
        <button
          aria-label={`Duplicate ${data.node.label}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onAction(data.node.id, 'duplicate');
          }}
          type="button"
        >
          <Icon name="duplicate" size={13} />
        </button>
        <button
          aria-label={`${data.node.disabled === true ? 'Enable' : 'Disable'} ${data.node.label}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onAction(data.node.id, 'toggle');
          }}
          type="button"
        >
          <Icon name={data.node.disabled === true ? 'eye' : 'eye-off'} size={13} />
        </button>
        <button
          aria-label={`Delete ${data.node.label}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onAction(data.node.id, 'delete');
          }}
          type="button"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    </div>
  );
});
