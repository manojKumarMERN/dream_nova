import { randomUUID } from 'node:crypto';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { DataPermissionDefinition } from '@nova/spec';
import { applyDataMigration, getDataMigrationStatus, planDataMigration } from './migrations';
import { assertDataPermission } from './permissions';
import { executeDataQuery } from './query';
import type {
  CreateDataEngineOptions,
  DataActor,
  DataMigrationPlan,
  DataQueryRequest,
  DataQueryResult,
  DataRecord,
  DataScope,
  DataStore
} from './types';
import { applyDefaults, createRecordEntity, getModel, validateDataValues } from './validation';

export interface DataEngine {
  readonly models: CreateDataEngineOptions['definition']['dataModels'];
  scope(actor: DataActor): DataScope;
  planMigration(actor: DataActor): Promise<DataMigrationPlan>;
  migrationStatus(actor: DataActor): Promise<Awaited<ReturnType<typeof getDataMigrationStatus>>>;
  applyMigration(
    actor: DataActor,
    confirmed?: boolean
  ): Promise<Awaited<ReturnType<typeof applyDataMigration>>>;
  create(
    actor: DataActor,
    model: string,
    values: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  get(actor: DataActor, model: string, recordId: string): Promise<Record<string, unknown>>;
  list(actor: DataActor, request: DataQueryRequest): Promise<DataQueryResult>;
  update(
    actor: DataActor,
    model: string,
    recordId: string,
    values: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  delete(actor: DataActor, model: string, recordId: string): Promise<void>;
}

function serializeRecord(record: DataRecord): Record<string, unknown> {
  return {
    id: record.id,
    modelId: record.modelId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...record.values
  };
}

export function createDefaultDataPermissions(modelId: string): DataPermissionDefinition[] {
  return [
    {
      id: randomUUID(),
      role: 'owner',
      modelId,
      actions: ['data:read', 'data:create', 'data:update', 'data:delete']
    },
    {
      id: randomUUID(),
      role: 'admin',
      modelId,
      actions: ['data:read', 'data:create', 'data:update', 'data:delete']
    },
    {
      id: randomUUID(),
      role: 'editor',
      modelId,
      actions: ['data:read', 'data:create', 'data:update']
    },
    {
      id: randomUUID(),
      role: 'viewer',
      modelId,
      actions: ['data:read']
    }
  ];
}

export function createDataEngine(options: CreateDataEngineOptions): DataEngine {
  const { appId, definition, store, environment } = options;
  const models = definition.dataModels;

  const scope = (actor: DataActor): DataScope => {
    if (actor.organizationId.length === 0 || appId.length === 0) {
      throw new NovaError(
        NovaErrorCodes.FORBIDDEN,
        'Data scope requires organization and application'
      );
    }
    if (actor.organizationId !== options.definitionOrganizationId) {
      throw new NovaError(
        NovaErrorCodes.FORBIDDEN,
        'Data actor organization does not own application'
      );
    }
    return {
      organizationId: actor.organizationId,
      appId,
      environment
    };
  };

  const assertUnique = async (
    dataScope: DataScope,
    modelId: string,
    values: Record<string, unknown>,
    ignoreId?: string
  ): Promise<void> => {
    for (const field of getModel(models, modelId).fields) {
      if (field.unique !== true || values[field.name] === undefined) {
        continue;
      }
      const existing = await store.findByField(dataScope, modelId, field.name, values[field.name]);
      if (existing !== undefined && existing.id !== ignoreId) {
        throw new NovaError(
          NovaErrorCodes.CONFLICT,
          `Duplicate value for unique data field: ${field.name}`,
          { details: { field: field.name } }
        );
      }
    }
  };

  const applyDeleteBehavior = async (
    dataScope: DataScope,
    targetModelId: string,
    recordId: string
  ): Promise<void> => {
    for (const model of models) {
      for (const relationship of model.relationships ?? []) {
        if (relationship.targetModelId !== targetModelId) {
          continue;
        }
        const field = relationship.targetFieldId ?? relationship.sourceFieldId;
        const related = (await store.listRecords(dataScope, model.id)).filter(
          (candidate) => candidate.values[field] === recordId
        );
        if (relationship.onDelete === 'cascade' || relationship.onDelete === 'no-action') {
          for (const candidate of related) {
            await applyDeleteBehavior(dataScope, model.id, candidate.id);
            await store.deleteRecord(dataScope, model.id, candidate.id);
          }
        } else if (relationship.onDelete === 'restrict') {
          if (related.length > 0) {
            throw new NovaError(
              NovaErrorCodes.CONFLICT,
              `Cannot delete record referenced by ${model.name}`,
              { details: { relationshipId: relationship.id } }
            );
          }
        } else if (relationship.onDelete === 'set-null') {
          for (const candidate of related) {
            await store.updateRecord({
              ...candidate,
              values: { ...candidate.values, [field]: null },
              updatedAt: new Date().toISOString()
            });
          }
        }
      }
    }
  };

  return {
    models,
    scope,
    async planMigration(actor) {
      const dataScope = scope(actor);
      const populatedModelIds = new Set<string>();
      for (const model of models) {
        if ((await store.countRecords(dataScope, model.id)) > 0) {
          populatedModelIds.add(model.id);
        }
      }
      return planDataMigration(models, await store.getSchema(dataScope), { populatedModelIds });
    },
    async migrationStatus(actor) {
      return getDataMigrationStatus(scope(actor), models, store);
    },
    async applyMigration(actor, confirmed) {
      return applyDataMigration({ scope: scope(actor), models, store, confirmed });
    },
    async create(actor, modelName, values) {
      const model = getModel(models, modelName);
      assertDataPermission(definition, actor, model.id, 'data:create');
      const dataScope = scope(actor);
      const resolved = applyDefaults(model, values);
      validateDataValues(model, resolved, 'create');
      await assertUnique(dataScope, model.id, resolved);
      const record = createRecordEntity(dataScope, actor, model.id, randomUUID(), resolved);
      return serializeRecord(await store.createRecord(record));
    },
    async get(actor, modelName, recordId) {
      const model = getModel(models, modelName);
      assertDataPermission(definition, actor, model.id, 'data:read');
      const record = await store.getRecord(scope(actor), model.id, recordId);
      if (record === undefined) {
        throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Data record not found');
      }
      return serializeRecord(record);
    },
    async list(actor, request) {
      const model = getModel(models, request.modelId);
      assertDataPermission(definition, actor, model.id, 'data:read');
      return executeDataQuery(scope(actor), model, models, store, request);
    },
    async update(actor, modelName, recordId, values) {
      const model = getModel(models, modelName);
      assertDataPermission(definition, actor, model.id, 'data:update');
      const dataScope = scope(actor);
      const existing = await store.getRecord(dataScope, model.id, recordId);
      if (existing === undefined) {
        throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Data record not found');
      }
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...updates } = values;
      const merged = { ...existing.values, ...updates };
      validateDataValues(model, merged, 'update');
      await assertUnique(dataScope, model.id, merged, recordId);
      return serializeRecord(
        await store.updateRecord({
          ...existing,
          values: merged,
          updatedAt: new Date().toISOString(),
          updatedBy: actor.userId
        })
      );
    },
    async delete(actor, modelName, recordId) {
      const model = getModel(models, modelName);
      assertDataPermission(definition, actor, model.id, 'data:delete');
      const dataScope = scope(actor);
      const existing = await store.getRecord(dataScope, model.id, recordId);
      if (existing === undefined) {
        throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Data record not found');
      }
      await applyDeleteBehavior(dataScope, model.id, recordId);
      await store.deleteRecord(dataScope, model.id, recordId);
    }
  };
}

export type { DataStore };
