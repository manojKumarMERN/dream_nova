import { createHash } from 'node:crypto';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import type {
  DataMigrationOperation,
  DataMigrationPlan,
  DataMigrationRecord,
  DataModelDefinition,
  DataScope,
  DataSchemaSnapshot,
  DataStore
} from './types';

const INCOMPATIBLE_TYPE_CHANGES: ReadonlySet<string> = new Set([
  'string->number',
  'string->boolean',
  'string->date',
  'string->datetime',
  'number->string',
  'number->boolean',
  'boolean->string',
  'boolean->number',
  'json->string',
  'json->number',
  'reference->string',
  'reference->number'
]);

function snapshot(models: readonly DataModelDefinition[], version: string): DataSchemaSnapshot {
  return {
    version,
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      fields: model.fields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        required: field.required,
        unique: field.unique
      })),
      relationships: model.relationships ?? []
    }))
  };
}

export function desiredSchemaVersion(models: readonly DataModelDefinition[]): string {
  const serialized = models
    .map((model) =>
      [
        model.id,
        model.name,
        ...model.fields.map(
          (field) => `${field.id}:${field.name}:${field.type}:${field.required}:${field.unique}`
        ),
        ...(model.relationships ?? []).map((relationship) => relationship.id)
      ].join('|')
    )
    .join('||');
  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

export function planDataMigration(
  models: readonly DataModelDefinition[],
  current: DataSchemaSnapshot | undefined,
  options: { populatedModelIds?: ReadonlySet<string> } = {}
): DataMigrationPlan {
  const currentById = new Map((current?.models ?? []).map((model) => [model.id, model]));
  const desiredById = new Map(models.map((model) => [model.id, model]));
  const operations: DataMigrationOperation[] = [];
  const impacts: string[] = [];

  for (const model of models) {
    const existing = currentById.get(model.id);
    if (existing === undefined) {
      operations.push({
        type: 'create-model',
        modelId: model.id,
        modelName: model.name,
        destructive: false
      });
      continue;
    }

    const desiredFields = new Map(model.fields.map((field) => [field.id, field]));
    const existingFields = new Map(existing.fields.map((field) => [field.id, field]));
    const populated = options.populatedModelIds?.has(model.id) === true;

    for (const field of model.fields) {
      const previous = existingFields.get(field.id);
      if (previous === undefined) {
        const destructive =
          field.required === true && field.defaultValue === undefined && populated;
        operations.push({
          type: 'add-field',
          modelId: model.id,
          modelName: model.name,
          fieldId: field.id,
          fieldName: field.name,
          destructive
        });
        if (destructive) {
          impacts.push(
            `Adding required field ${field.name} to populated model ${model.name} requires a default or data backfill.`
          );
        }
        continue;
      }
      if (previous.type !== field.type) {
        const destructive = INCOMPATIBLE_TYPE_CHANGES.has(`${previous.type}->${field.type}`);
        operations.push({
          type: 'change-field-type',
          modelId: model.id,
          modelName: model.name,
          fieldId: field.id,
          fieldName: field.name,
          fromType: previous.type,
          toType: field.type,
          destructive
        });
        if (destructive) {
          impacts.push(
            `Changing ${model.name}.${field.name} from ${previous.type} to ${field.type} may lose existing values.`
          );
        }
      }
    }

    for (const field of existing.fields) {
      if (!desiredFields.has(field.id)) {
        operations.push({
          type: 'remove-field',
          modelId: model.id,
          modelName: model.name,
          fieldId: field.id,
          fieldName: field.name,
          destructive: true
        });
        impacts.push(`Removing ${model.name}.${field.name} will discard stored values.`);
      }
    }

    const desiredRelationships = new Map(
      (model.relationships ?? []).map((item) => [item.id, item])
    );
    const existingRelationships = new Map(existing.relationships.map((item) => [item.id, item]));
    for (const relationship of model.relationships ?? []) {
      if (!existingRelationships.has(relationship.id)) {
        operations.push({
          type: 'add-relationship',
          modelId: model.id,
          modelName: model.name,
          relationshipId: relationship.id,
          destructive: false
        });
      }
    }
    for (const relationship of existing.relationships) {
      if (!desiredRelationships.has(relationship.id)) {
        operations.push({
          type: 'remove-relationship',
          modelId: model.id,
          modelName: model.name,
          relationshipId: relationship.id,
          destructive: true
        });
        impacts.push(`Removing relationship ${relationship.name} may leave orphaned references.`);
      }
    }
  }

  for (const model of current?.models ?? []) {
    if (!desiredById.has(model.id)) {
      operations.push({
        type: 'remove-model',
        modelId: model.id,
        modelName: model.name,
        destructive: true
      });
      impacts.push(`Removing model ${model.name} will discard all of its records.`);
    }
  }

  return {
    fromVersion: current?.version ?? '0',
    toVersion: desiredSchemaVersion(models),
    operations,
    destructive: operations.some((operation) => operation.destructive),
    impacts
  };
}

export interface ApplyDataMigrationOptions {
  scope: DataScope;
  models: readonly DataModelDefinition[];
  store: DataStore;
  confirmed?: boolean | undefined;
}

export async function applyDataMigration(
  options: ApplyDataMigrationOptions
): Promise<DataMigrationRecord> {
  const { scope, models, store } = options;
  return store.runInSchemaLock(scope, async () => {
    const current = await store.getSchema(scope);
    const populatedModelIds = new Set<string>();
    for (const model of models) {
      if ((await store.countRecords(scope, model.id)) > 0) {
        populatedModelIds.add(model.id);
      }
    }
    const plan = planDataMigration(models, current, { populatedModelIds });
    const existing = (await store.listMigrations(scope)).find(
      (migration) => migration.toVersion === plan.toVersion && migration.status === 'applied'
    );
    if (existing !== undefined) {
      return existing;
    }
    if (plan.destructive && options.confirmed !== true) {
      throw new NovaError(
        NovaErrorCodes.CONFLICT,
        'Destructive data migration requires confirmation',
        {
          details: { impacts: plan.impacts, operations: plan.operations }
        }
      );
    }

    const created = await store.saveMigration({
      id: createHash('sha256')
        .update(`${scope.organizationId}:${scope.appId}:${scope.environment}:${plan.toVersion}`)
        .digest('hex')
        .slice(0, 24),
      scope,
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      plan,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    try {
      await store.saveSchema(scope, snapshot(models, plan.toVersion));
      return await store.saveMigration({
        ...created,
        status: 'applied',
        appliedAt: new Date().toISOString()
      });
    } catch (error) {
      await store.saveMigration({
        ...created,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Migration failed'
      });
      throw error;
    }
  });
}

export async function getDataMigrationStatus(
  scope: DataScope,
  models: readonly DataModelDefinition[],
  store: DataStore
): Promise<{
  current: DataSchemaSnapshot | undefined;
  plan: DataMigrationPlan;
  history: DataMigrationRecord[];
}> {
  const current = await store.getSchema(scope);
  const populatedModelIds = new Set<string>();
  for (const model of models) {
    if ((await store.countRecords(scope, model.id)) > 0) {
      populatedModelIds.add(model.id);
    }
  }
  return {
    current,
    plan: planDataMigration(models, current, { populatedModelIds }),
    history: await store.listMigrations(scope)
  };
}
