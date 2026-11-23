import { useCallback, useEffect, useState } from 'react';
import type { AppDefinition } from '@nova/spec';
import { applyDataMigration, getDataSchemaStatus } from '../../sdk';
import type { DataEnvironment, DataSchemaStatusValue } from '../../sdk';
import type { DataStudioMode } from '../../store';
import type { Toast } from '../../types';
import { Icon } from '../Icons';

interface MigrationsWorkspaceProps {
  appId: string;
  definition: AppDefinition;
  environment: DataEnvironment;
  mode: DataStudioMode;
  onToast: (kind: Toast['kind'], message: string) => void;
}

const CONFIRMATION = 'APPLY DESTRUCTIVE MIGRATION';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string | undefined): string {
  if (value === undefined) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function MigrationsWorkspace({
  appId,
  definition,
  environment,
  mode,
  onToast
}: MigrationsWorkspaceProps) {
  const [status, setStatus] = useState<DataSchemaStatusValue | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setStatus(await getDataSchemaStatus(appId, environment));
    } catch (cause) {
      setStatus(undefined);
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }, [appId, environment]);

  useEffect(() => {
    void load();
  }, [load]);

  const plan = status?.plan;
  const canApply =
    plan !== undefined &&
    plan.operations.length > 0 &&
    (!plan.destructive || confirmation === CONFIRMATION);

  const apply = async () => {
    if (plan === undefined || !canApply) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await applyDataMigration(appId, plan.destructive, environment);
      setConfirmation('');
      onToast('success', 'Data schema migration applied');
      await load();
    } catch (cause) {
      setError(messageOf(cause));
      onToast('error', messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="data-studio-section-body migrations-workspace">
      <div className="ds-card">
        <header>
          <Icon name="history" size={15} /> Schema comparison
        </header>
        <div className="ds-migration-summary">
          <div>
            <span>Current</span>
            <strong>{status?.current?.version ?? 'none'}</strong>
          </div>
          <Icon name="chevron-right" size={16} />
          <div>
            <span>Target</span>
            <strong>{plan?.toVersion ?? definition.dataSchemaVersion ?? 'unversioned'}</strong>
          </div>
          <div>
            <span>Environment</span>
            <strong>{environment}</strong>
          </div>
          <button
            type="button"
            className="data-studio-button"
            onClick={() => void load()}
            disabled={busy}
          >
            <Icon name="history" size={13} /> Refresh
          </button>
        </div>
        {error === undefined ? null : <div className="ds-error">{error}</div>}
        {status === undefined && error === undefined ? (
          <p className="ds-empty-inline">Loading migration status…</p>
        ) : null}
        {status !== undefined && plan !== undefined && plan.operations.length === 0 ? (
          <div className="ds-success-banner">
            <Icon name="circle-check" size={15} /> The data plane matches the canonical schema.
          </div>
        ) : null}
      </div>

      {plan === undefined || plan.operations.length === 0 ? null : (
        <div className="ds-card">
          <header>
            <Icon name="list" size={15} /> Pending operations ({plan.operations.length})
          </header>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Model</th>
                  <th>Detail</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {plan.operations.map((operation, index) => (
                  <tr key={`${operation.modelId}-${operation.type}-${index}`}>
                    <td>{operation.type}</td>
                    <td>{operation.modelName}</td>
                    <td>
                      {operation.fieldName ?? operation.relationshipId ?? '—'}
                      {operation.fromType === undefined
                        ? ''
                        : ` (${operation.fromType} → ${String(operation.toType ?? '')})`}
                    </td>
                    <td>
                      <span className={`ds-risk ${operation.destructive ? 'high' : 'low'}`}>
                        {operation.destructive ? 'Destructive' : 'Safe'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.impacts.length === 0 ? null : (
            <div className="ds-impact-list">
              <strong>Impact analysis</strong>
              <ul>
                {plan.impacts.map((impact) => (
                  <li key={impact}>{impact}</li>
                ))}
              </ul>
            </div>
          )}
          {plan.destructive ? (
            <div className="ds-destructive-confirm">
              <div>
                <Icon name="shield" size={16} />
                <div>
                  <strong>Destructive migration approval</strong>
                  <p>Type the confirmation phrase exactly to enable the migration.</p>
                </div>
              </div>
              <input
                aria-label="Destructive migration confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={CONFIRMATION}
              />
            </div>
          ) : null}
          <div className="ds-card-actions">
            <button
              type="button"
              className="data-studio-button accent"
              disabled={!canApply || busy}
              onClick={() => void apply()}
            >
              <Icon name="rocket" size={13} /> Apply migration
            </button>
          </div>
        </div>
      )}

      <div className="ds-card">
        <header>
          <Icon name="clock" size={15} /> Migration history ({status?.history.length ?? 0})
        </header>
        {status === undefined || status.history.length === 0 ? (
          <p className="ds-empty-inline">No migrations have been recorded for this environment.</p>
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Applied</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {status.history.map((record) => (
                  <tr key={record.id}>
                    <td>{record.fromVersion}</td>
                    <td>{record.toVersion}</td>
                    <td>
                      <span className={`ds-risk ${record.status === 'applied' ? 'low' : 'high'}`}>
                        {record.status}
                      </span>
                    </td>
                    <td>{formatDate(record.createdAt)}</td>
                    <td>{formatDate(record.appliedAt)}</td>
                    <td>{record.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mode === 'advanced' && status !== undefined ? (
        <details className="ds-json-details">
          <summary>Raw migration response</summary>
          <pre>{JSON.stringify(status, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}
