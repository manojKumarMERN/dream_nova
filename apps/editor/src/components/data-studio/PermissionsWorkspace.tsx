import type { AppDefinition, DataPermissionAction, DataPermissionDefinition } from '@nova/spec';
import { createUniqueId } from '../../id';
import type { DataStudioMode } from '../../store';
import type { EditorSessionLike, Toast } from '../../types';
import { Icon } from '../Icons';

interface PermissionsWorkspaceProps {
  definition: AppDefinition;
  session: EditorSessionLike;
  mode: DataStudioMode;
  onToast: (kind: Toast['kind'], message: string) => void;
}

const ROLES: DataPermissionDefinition['role'][] = ['owner', 'admin', 'editor', 'viewer'];
const ACTIONS: DataPermissionAction[] = ['data:read', 'data:create', 'data:update', 'data:delete'];

function defaultActions(role: DataPermissionDefinition['role']): DataPermissionAction[] {
  if (role === 'viewer') {
    return ['data:read'];
  }
  if (role === 'editor') {
    return ['data:read', 'data:create', 'data:update'];
  }
  return [...ACTIONS];
}

export function PermissionsWorkspace({
  definition,
  session,
  mode,
  onToast
}: PermissionsWorkspaceProps) {
  const permissions = definition.dataPermissions ?? [];
  const models = definition.dataModels;
  const missingModels = models.filter(
    (model) => !permissions.some((permission) => permission.modelId === model.id)
  );

  const addDefaults = () => {
    if (missingModels.length === 0) {
      return;
    }
    const current = session.getDefinition();
    const additions = missingModels.flatMap((model) =>
      ROLES.map((role) => ({
        id: createUniqueId('permission'),
        role,
        modelId: model.id,
        actions: defaultActions(role)
      }))
    );
    session.replaceDefinition({
      ...current,
      dataPermissions: [...(current.dataPermissions ?? []), ...additions]
    });
    onToast('success', `Default permissions added for ${missingModels.length} table(s)`);
  };

  const toggleAction = (
    modelId: string,
    role: DataPermissionDefinition['role'],
    action: DataPermissionAction,
    enabled: boolean
  ) => {
    const current = session.getDefinition();
    const entries = [...(current.dataPermissions ?? [])];
    const index = entries.findIndex(
      (permission) => permission.modelId === modelId && permission.role === role
    );
    const existing = index < 0 ? undefined : entries[index];
    const actions = enabled
      ? [...new Set([...(existing?.actions ?? []), action])]
      : (existing?.actions ?? []).filter((candidate) => candidate !== action);
    if (actions.length === 0) {
      if (existing !== undefined) {
        entries.splice(index, 1);
      }
    } else if (existing === undefined) {
      entries.push({
        id: createUniqueId('permission'),
        role,
        modelId,
        actions
      });
    } else {
      entries[index] = { ...existing, actions };
    }
    session.replaceDefinition({ ...current, dataPermissions: entries });
    onToast('info', 'Permissions updated in the draft; save the app to persist them');
  };

  if (models.length === 0) {
    return (
      <section className="data-studio-section-body">
        <div className="ds-empty-state">
          <Icon name="shield" size={26} />
          <h3>No tables to secure</h3>
          <p>Create a table before configuring model-level access.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="data-studio-section-body permissions-workspace">
      <div className="ds-card">
        <header>
          <Icon name="shield" size={15} /> Enforcement model
        </header>
        <p className="ds-hint">
          These rules are stored in the canonical definition and enforced by the data engine on
          every request. UI visibility is advisory; the server is authoritative.
        </p>
        <ul className="ds-bullets">
          <li>Field-level visibility and record policies require additional engine support.</li>
          <li>Removing the last action for a role removes that permission record.</li>
          <li>Save the app version after permission changes to affect future data requests.</li>
        </ul>
      </div>

      {missingModels.length === 0 ? null : (
        <div className="ds-card">
          <header>
            <Icon name="plus" size={15} /> Missing defaults
          </header>
          <p>
            {missingModels.length} table(s) have no permission records. Add defaults for owner,
            admin, editor, and viewer.
          </p>
          <div className="ds-card-actions">
            <button type="button" className="data-studio-button" onClick={addDefaults}>
              <Icon name="plus" size={13} /> Add defaults
            </button>
          </div>
        </div>
      )}

      {mode === 'simple' ? (
        <div className="ds-permission-cards">
          {ROLES.map((role) => {
            const rolePermissions = permissions.filter((permission) => permission.role === role);
            return (
              <article className="ds-card compact" key={role}>
                <header>
                  <Icon name="shield" size={14} /> {role}
                </header>
                <p>{rolePermissions.length} table rule(s)</p>
                <div className="ds-chip-row">
                  {[...new Set(rolePermissions.flatMap((permission) => permission.actions))].map(
                    (action) => (
                      <span className="ds-chip" key={action}>
                        {action}
                      </span>
                    )
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ds-card">
          <header>
            <Icon name="list" size={15} /> Model access matrix
          </header>
          <div className="ds-table-wrap">
            <table className="ds-table permission-matrix">
              <thead>
                <tr>
                  <th>Table</th>
                  {ROLES.map((role) => (
                    <th key={role}>{role}</th>
                  ))}
                  <th>Record policy</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => {
                  const modelPermissions = permissions.filter(
                    (permission) => permission.modelId === model.id
                  );
                  return (
                    <tr key={model.id}>
                      <td>{model.name}</td>
                      {ROLES.map((role) => {
                        const permission = modelPermissions.find((entry) => entry.role === role);
                        return (
                          <td key={role}>
                            <div className="ds-action-flags">
                              {ACTIONS.map((action) => (
                                <label key={action} title={action}>
                                  <input
                                    type="checkbox"
                                    aria-label={`${model.name} ${role} ${action}`}
                                    checked={permission?.actions.includes(action) ?? false}
                                    onChange={(event) =>
                                      toggleAction(model.id, role, action, event.target.checked)
                                    }
                                  />
                                  <span>{action.replace('data:', '')}</span>
                                </label>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                      <td>
                        {modelPermissions.find(
                          (permission) => permission.recordPolicyRef !== undefined
                        )?.recordPolicyRef ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
