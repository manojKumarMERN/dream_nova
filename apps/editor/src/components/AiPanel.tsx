import { useState } from 'react';
import type { AppDefinition, ComponentNode } from '@nova/spec';
import {
  applyProposalToApp,
  generateProposal,
  validateProposal as validateProposalRequest
} from '../sdk';
import { getNode } from '../tree';
import type { EditorState, Proposal, Toast } from '../types';
import { Icon } from './Icons';

interface AiPanelProps {
  appId: string;
  state: EditorState;
  onClose: () => void;
  onToast: (kind: Toast['kind'], message: string) => void;
  onApply: (definition: AppDefinition) => void;
}

export function AiPanel({ appId, state, onClose, onToast, onApply }: AiPanelProps) {
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [validation, setValidation] = useState('');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = state.selectedNodeIds
    .map((id) => getNode(state.definition, id))
    .filter((node): node is ComponentNode => node !== undefined);

  const generate = async () => {
    setBusy(true);
    try {
      const generated = await generateProposal(appId, instruction, state.selectedNodeIds);
      const check = await validateProposalRequest(generated);
      setProposal(generated);
      setValidation(check.ok ? 'Proposal validated' : `Validation warning: ${check.detail}`);
      setApproved(false);
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!proposal || !approved) {
      return;
    }
    setBusy(true);
    try {
      const definition = await applyProposalToApp(appId, proposal, state.definition);
      onApply(definition);
      onToast('success', 'Proposal applied');
      setProposal(null);
      setApproved(false);
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="ai-panel" aria-label="AI assistant panel">
      <header className="ai-header">
        <span>
          <Icon name="sparkles" size={16} /> AI Assistant
        </span>
        <span className="ai-optional">Optional</span>
        <button type="button" aria-label="Close AI panel" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </header>
      <div className="ai-body">
        <label className="ai-label" htmlFor="ai-instruction">
          Instruction
        </label>
        <textarea
          id="ai-instruction"
          rows={5}
          value={instruction}
          placeholder="Describe the change you want to generate…"
          onChange={(event) => setInstruction(event.target.value)}
        />
        <div className="ai-context">
          <div className="ai-context-title">Selected components</div>
          {selected.length === 0 ? (
            <div className="ai-context-empty">
              No selection — proposal applies to the whole app.
            </div>
          ) : (
            <div className="ai-chips">
              {selected.map((node) => (
                <span className="ai-chip" key={node.id}>
                  {node.name ?? node.type}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="button-primary ai-generate"
          disabled={busy || instruction.trim().length === 0}
          onClick={() => void generate()}
        >
          <Icon name="sparkles" size={14} /> {busy ? 'Working…' : 'Generate proposal'}
        </button>
        {proposal ? (
          <div className="ai-proposal">
            <div className="ai-proposal-title">{proposal.summary}</div>
            <div className="ai-proposal-status">{validation}</div>
            <ul className="ai-proposal-changes">
              {proposal.changes.map((change, index) => (
                <li key={index}>
                  {change.op} ·{' '}
                  {change.op === 'update' || change.op === 'rename' ? change.nodeId : ''}
                </li>
              ))}
            </ul>
            <label className="ai-approval">
              <input
                type="checkbox"
                checked={approved}
                onChange={(event) => setApproved(event.target.checked)}
              />
              Approve and apply
            </label>
            <button
              type="button"
              className="button-primary"
              disabled={!approved || busy}
              onClick={() => void apply()}
            >
              <Icon name="check" size={14} /> Apply proposal
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
