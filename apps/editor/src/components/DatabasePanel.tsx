import { useEffect, useMemo, useState } from 'react';
import type { DataMigrationPlanValue } from '@nova/sdk';
import type {
  AppDefinition,
  DataFieldDefinition,
  DataFieldType,
  DataModelDefinition,
  DataPermissionDefinition,
  DataReferentialAction,
  DataRelationshipCardinality
} from '@nova/spec';
import { createUniqueId } from '../id';
import { applyDataMigration, getDataMigrationPlan } from '../sdk';
import type { EditorSessionLike, Toast } from '../types';
import { Icon } from './Icons';

const fieldTypes: DataFieldType[] = [
  'string',
  'text',
  'longText',
  'number',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'email',
  'url',
  'uuid',
  'json',
  'enum',
  'reference'
];

const actions = ['data:read', 'data:create', 'data:update', 'data:delete'] as const;

interface DatabasePanelProps {
  appId: string;
  definition: AppDefinition;
  session: EditorSessionLike;
  onOpenDesigner: () => void;
  onToast: (kind: Toast['kind'], message: string) => void;
}

function defaultPermissions(modelId: string): DataPermissionDefinition[] {
  const roles: DataPermissionDefinition['role'][] = ['owner', 'admin', 'editor', 'viewer'];
  return roles.map((role) => ({
    id: createUniqueId('permission'),
    role,
    modelId,
    actions:
      role === 'viewer'
        ? ['data:read']
        : role === 'editor'
          ? ['data:read', 'data:create', 'data:update']
          : [...actions]
  }));
}

function fieldName(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^[^A-Za-z_]+/, '');
}

export function DatabasePanel({
  appId,
  definition,
  session,
  onOpenDesigner,
  onToast
}: DatabasePanelProps) {
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);
  const [newModelName, setNewModelName] = useState('');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<DataFieldType>('string');
  const [targetModelId, setTargetModelId] = useState('');
  const [sourceFieldId, setSourceFieldId] = useState('');
  const [cardinality, setCardinality] = useState<DataRelationshipCardinality>('one-to-many');
  const [onDelete, setOnDelete] = useState<DataReferentialAction>('cascade');
  const [junctionModelId, setJunctionModelId] = useState('');
  const [migrationPlan, setMigrationPlan] = useState<DataMigrationPlanValue | undefined>(undefined);
  const [migrationError, setMigrationError] = useState<string | undefined>(undefined);

  const models = definition.dataModels;
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? models[0];

  useEffect(() => {
    if (selectedModel !== undefined && selectedModel.id !== selectedModelId) {
      setSelectedModelId(selectedModel.id);
    }
  }, [selectedModel, selectedModelId]);

  useEffect(() => {
    let active = true;
    void getDataMigrationPlan(appId)
      .then((plan) => {
        if (active) {
          setMigrationPlan(plan);
          setMigrationError(undefined);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMigrationPlan(undefined);
          setMigrationError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      active = false;
    };
  }, [appId, models]);

  const referenceFields = useMemo(
    () => (selectedModel?.fields ?? []).filter((field) => field.type === 'reference'),
    [selectedModel]
  );
  const targetModel = models.find((model) => model.id === targetModelId);

  const commit = (next: AppDefinition) => {
    session.replaceDefinition(next);
  };

  const updateModel = (
    modelId: string,
    update: (model: DataModelDefinition) => DataModelDefinition
  ) => {
    const current = session.getDefinition();
    commit({
      ...current,
      dataModels: current.dataModels.map((model) => (model.id === modelId ? update(model) : model))
    });
  };

  const addModel = () => {
    const name = fieldName(newModelName);
    if (name.length === 0) {
      onToast('error', 'Enter a model name');
      return;
    }
    const modelId = createUniqueId('model');
    const model: DataModelDefinition = {
      id: modelId,
      name,
      relations: {},
      fields: [
        {
          id: createUniqueId('field'),
          name: 'id',
          type: 'uuid',
          required: true,
          unique: true,
          system: true
        }
      ]
    };
    const current = session.getDefinition();
    commit({
      ...current,
      dataModels: [...current.dataModels, model],
      dataPermissions: [...(current.dataPermissions ?? []), ...defaultPermissions(modelId)]
    });
    setSelectedModelId(modelId);
    setNewModelName('');
    onToast('success', `Data model “${name}” added`);
  };

  const removeModel = () => {
    if (
      selectedModel === undefined ||
      !window.confirm(`Delete data model “${selectedModel.name}”?`)
    ) {
      return;
    }
    const current = session.getDefinition();
    commit({
      ...current,
      dataModels: current.dataModels.filter((model) => model.id !== selectedModel.id),
      dataPermissions: (current.dataPermissions ?? []).filter(
        (permission) => permission.modelId !== selectedModel.id
      ),
      queries: (current.queries ?? []).filter((query) => query.modelId !== selectedModel.id),
      dataBindings: (current.dataBindings ?? []).filter(
        (binding) => binding.modelId !== selectedModel.id
      )
    });
    onToast('info', 'Data model removed');
  };

  const addField = () => {
    if (selectedModel === undefined) {
      return;
    }
    const name = fieldName(newFieldName);
    if (name.length === 0) {
      onToast('error', 'Enter a field name');
      return;
    }
    const field: DataFieldDefinition = {
      id: createUniqueId('field'),
      name,
      type: newFieldType,
      required: false,
      unique: false,
      ...(newFieldType === 'enum' ? { enumValues: ['option1', 'option2'] } : {})
    };
    updateModel(selectedModel.id, (model) => ({ ...model, fields: [...model.fields, field] }));
    setNewFieldName('');
    onToast('success', `Field “${name}” added`);
  };

  const updateField = (fieldId: string, patch: Partial<DataFieldDefinition>) => {
    if (selectedModel === undefined) {
      return;
    }
    updateModel(selectedModel.id, (model) => ({
      ...model,
      fields: model.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field))
    }));
  };

  const removeField = (fieldId: string) => {
    if (selectedModel === undefined) {
      return;
    }
    updateModel(selectedModel.id, (model) => ({
      ...model,
      fields: model.fields.filter((field) => field.id !== fieldId),
      relationships: (model.relationships ?? []).filter(
        (relationship) => relationship.sourceFieldId !== fieldId
      )
    }));
  };

  const addRelationship = () => {
    if (selectedModel === undefined || targetModel === undefined) {
      onToast('error', 'Select a target model');
      return;
    }
    if (cardinality === 'many-to-many' && junctionModelId === '') {
      onToast('error', 'Many-to-many relationships require a junction model');
      return;
    }
    let sourceField = referenceFields.find((field) => field.id === sourceFieldId);
    const nextModel = { ...selectedModel };
    if (sourceField === undefined) {
      sourceField = {
        id: createUniqueId('field'),
        name: fieldName(`${targetModel.name}Id`) || 'relatedId',
        type: 'reference',
        required: false,
        unique: false
      };
      nextModel.fields = [...nextModel.fields, sourceField];
    }
    const targetField = targetModel.fields.find((field) => field.name === 'id');
    nextModel.relationships = [
      ...(nextModel.relationships ?? []),
      {
        id: createUniqueId('relationship'),
        name: `${selectedModel.name}_${targetModel.name}`,
        sourceModelId: selectedModel.id,
        sourceFieldId: sourceField.id,
        targetModelId: targetModel.id,
        ...(targetField === undefined ? {} : { targetFieldId: targetField.id }),
        cardinality,
        onDelete,
        onUpdate: 'cascade',
        ...(cardinality === 'many-to-many' ? { junctionModelId } : {})
      }
    ];
    const current = session.getDefinition();
    commit({
      ...current,
      dataModels: current.dataModels.map((model) =>
        model.id === selectedModel.id ? nextModel : model
      )
    });
    setSourceFieldId('');
    onToast('success', 'Relationship added');
  };

  const applyMigration = async () => {
    if (migrationPlan === undefined) {
      onToast('error', 'Migration plan is unavailable');
      return;
    }
    try {
      await applyDataMigration(appId, migrationPlan.destructive);
      setMigrationPlan(await getDataMigrationPlan(appId));
      onToast('success', 'Data schema migration applied');
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="database-panel" aria-label="Database designer">
      <header className="database-header">
        <span>
          <Icon name="database" size={14} /> Data models
        </span>
        <button className="database-open-designer" onClick={onOpenDesigner} type="button">
          <Icon name="sparkles" size={12} /> Open designer
        </button>
        <span className="panel-count">{models.length}</span>
      </header>
      <div className="database-scroll">
        <div className="database-create">
          <input
            aria-label="New data model name"
            placeholder="New model name"
            value={newModelName}
            onChange={(event) => setNewModelName(event.target.value)}
          />
          <button type="button" onClick={addModel}>
            <Icon name="plus" size={12} /> Add
          </button>
        </div>
        <div className="database-models">
          {models.map((model) => (
            <button
              type="button"
              key={model.id}
              className={`database-model ${selectedModel?.id === model.id ? 'active' : ''}`}
              onClick={() => setSelectedModelId(model.id)}
            >
              <span className="database-model-label">
                <Icon name="table" size={13} /> {model.name}
              </span>
              <span className="database-model-meta">
                {model.fields.length} fields · {model.relationships?.length ?? 0} relations
              </span>
            </button>
          ))}
          {models.length === 0 ? <div className="panel-empty">No data models yet.</div> : null}
        </div>

        {selectedModel === undefined ? null : (
          <div className="database-detail">
            <div className="database-title-row">
              <input
                aria-label="Data model name"
                value={selectedModel.name}
                onChange={(event) => {
                  const name = fieldName(event.target.value);
                  updateModel(selectedModel.id, (model) => ({ ...model, name }));
                }}
              />
              <button type="button" className="danger" onClick={removeModel}>
                <Icon name="trash" size={12} /> Delete
              </button>
            </div>
            <label className="database-label">
              Display name
              <input
                value={selectedModel.displayName ?? ''}
                placeholder={selectedModel.name}
                onChange={(event) =>
                  updateModel(selectedModel.id, (model) => ({
                    ...model,
                    ...(event.target.value === ''
                      ? { displayName: undefined }
                      : { displayName: event.target.value })
                  }))
                }
              />
            </label>

            <h4>
              <Icon name="list" size={12} /> Fields
            </h4>
            <div className="database-fields">
              {selectedModel.fields.map((field) => (
                <div className="database-field" key={field.id}>
                  <div className="database-field-main">
                    <input
                      aria-label="Field name"
                      disabled={field.system === true}
                      value={field.name}
                      onChange={(event) =>
                        updateField(field.id, { name: fieldName(event.target.value) })
                      }
                    />
                    <select
                      aria-label="Field type"
                      value={field.type}
                      onChange={(event) =>
                        updateField(field.id, { type: event.target.value as DataFieldType })
                      }
                    >
                      {fieldTypes.map((type) => (
                        <option value={type} key={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="database-field-flags">
                    <label>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          updateField(field.id, { required: event.target.checked })
                        }
                      />
                      Required
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={field.unique}
                        onChange={(event) =>
                          updateField(field.id, { unique: event.target.checked })
                        }
                      />
                      Unique
                    </label>
                    {field.system === true ? null : (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => removeField(field.id)}
                      >
                        <Icon name="trash" size={12} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="database-create compact">
              <input
                aria-label="New field name"
                placeholder="New field"
                value={newFieldName}
                onChange={(event) => setNewFieldName(event.target.value)}
              />
              <select
                aria-label="New field type"
                value={newFieldType}
                onChange={(event) => setNewFieldType(event.target.value as DataFieldType)}
              >
                {fieldTypes.map((type) => (
                  <option value={type} key={type}>
                    {type}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addField}>
                <Icon name="plus" size={12} /> Add
              </button>
            </div>

            <h4>
              <Icon name="link" size={12} /> Relationships
            </h4>
            <div className="database-relations">
              {(selectedModel.relationships ?? []).map((relationship) => (
                <div className="database-relation" key={relationship.id}>
                  <span>{relationship.name}</span>
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      updateModel(selectedModel.id, (model) => ({
                        ...model,
                        relationships: (model.relationships ?? []).filter(
                          (item) => item.id !== relationship.id
                        )
                      }))
                    }
                  >
                    <Icon name="trash" size={12} /> Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="database-relation-create">
              <select
                aria-label="Target model"
                value={targetModelId}
                onChange={(event) => setTargetModelId(event.target.value)}
              >
                <option value="">Target model…</option>
                {models
                  .filter((model) => model.id !== selectedModel.id)
                  .map((model) => (
                    <option value={model.id} key={model.id}>
                      {model.name}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Reference field"
                value={sourceFieldId}
                onChange={(event) => setSourceFieldId(event.target.value)}
              >
                <option value="">Auto-create reference field</option>
                {referenceFields.map((field) => (
                  <option value={field.id} key={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Cardinality"
                value={cardinality}
                onChange={(event) =>
                  setCardinality(event.target.value as DataRelationshipCardinality)
                }
              >
                <option value="one-to-one">one-to-one</option>
                <option value="one-to-many">one-to-many</option>
                <option value="many-to-many">many-to-many</option>
              </select>
              <select
                aria-label="Delete behavior"
                value={onDelete}
                onChange={(event) => setOnDelete(event.target.value as DataReferentialAction)}
              >
                <option value="cascade">cascade</option>
                <option value="restrict">restrict</option>
                <option value="set-null">set-null</option>
                <option value="no-action">no-action</option>
              </select>
              {cardinality === 'many-to-many' ? (
                <select
                  aria-label="Junction model"
                  value={junctionModelId}
                  onChange={(event) => setJunctionModelId(event.target.value)}
                >
                  <option value="">Junction model…</option>
                  {models
                    .filter((model) => model.id !== selectedModel.id && model.id !== targetModelId)
                    .map((model) => (
                      <option value={model.id} key={model.id}>
                        {model.name}
                      </option>
                    ))}
                </select>
              ) : null}
              <button type="button" onClick={addRelationship}>
                <Icon name="link" size={12} /> Add relationship
              </button>
            </div>
          </div>
        )}

        <div className="database-migration">
          <h4>
            <Icon name="rocket" size={12} /> Schema migration
          </h4>
          {migrationPlan === undefined ? (
            <div className="panel-empty">{migrationError ?? 'No migration preview available.'}</div>
          ) : (
            <>
              <div className="database-migration-status">
                {migrationPlan.destructive
                  ? 'Destructive changes require confirmation'
                  : 'No destructive changes detected'}
              </div>
              <div className="database-migration-ops">
                {migrationPlan.operations.length === 0 ? (
                  <span>Schema is up to date.</span>
                ) : (
                  migrationPlan.operations.map((operation, index) => (
                    <span key={`${operation.type}-${operation.modelId}-${index}`}>
                      {operation.type}: {operation.modelName}
                      {operation.fieldName === undefined ? '' : `.${operation.fieldName}`}
                    </span>
                  ))
                )}
              </div>
              <button
                type="button"
                disabled={migrationPlan.operations.length === 0}
                onClick={() => void applyMigration()}
              >
                <Icon name="rocket" size={12} /> Apply migration
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
