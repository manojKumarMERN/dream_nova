import type { Prisma, PrismaClient } from '@nova/db';
import type {
  DataMigrationRecord,
  DataRecord,
  DataSchemaSnapshot,
  DataScope,
  DataStore
} from '@nova/data-engine';

function scopeKey(scope: DataScope): string {
  return `${scope.organizationId}|${scope.appId}|${scope.environment}`;
}

function recordKey(scope: DataScope, modelId: string): string {
  return `${scopeKey(scope)}|${modelId}`;
}

class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export class InMemoryDataStore implements DataStore {
  private readonly records = new Map<string, Map<string, DataRecord>>();
  private readonly schemas = new Map<string, DataSchemaSnapshot>();
  private readonly migrations = new Map<string, DataMigrationRecord[]>();
  private readonly mutex = new Mutex();

  private recordsFor(scope: DataScope, modelId: string): Map<string, DataRecord> {
    const key = recordKey(scope, modelId);
    let records = this.records.get(key);
    if (records === undefined) {
      records = new Map();
      this.records.set(key, records);
    }
    return records;
  }

  async listRecords(scope: DataScope, modelId: string): Promise<DataRecord[]> {
    return [...this.recordsFor(scope, modelId).values()].map((record) => structuredClone(record));
  }

  async getRecord(
    scope: DataScope,
    modelId: string,
    recordId: string
  ): Promise<DataRecord | undefined> {
    const record = this.recordsFor(scope, modelId).get(recordId);
    return record === undefined ? undefined : structuredClone(record);
  }

  async findByField(
    scope: DataScope,
    modelId: string,
    field: string,
    value: unknown
  ): Promise<DataRecord | undefined> {
    const record = [...this.recordsFor(scope, modelId).values()].find(
      (candidate) => candidate.values[field] === value
    );
    return record === undefined ? undefined : structuredClone(record);
  }

  async createRecord(record: DataRecord): Promise<DataRecord> {
    const copy = structuredClone(record);
    this.recordsFor(record, record.modelId).set(copy.id, copy);
    return structuredClone(copy);
  }

  async updateRecord(record: DataRecord): Promise<DataRecord> {
    const copy = structuredClone(record);
    this.recordsFor(record, record.modelId).set(copy.id, copy);
    return structuredClone(copy);
  }

  async deleteRecord(scope: DataScope, modelId: string, recordId: string): Promise<void> {
    this.recordsFor(scope, modelId).delete(recordId);
  }

  async countRecords(scope: DataScope, modelId: string): Promise<number> {
    return this.recordsFor(scope, modelId).size;
  }

  async getSchema(scope: DataScope): Promise<DataSchemaSnapshot | undefined> {
    const schema = this.schemas.get(scopeKey(scope));
    return schema === undefined ? undefined : structuredClone(schema);
  }

  async saveSchema(scope: DataScope, schema: DataSchemaSnapshot): Promise<void> {
    this.schemas.set(scopeKey(scope), structuredClone(schema));
  }

  async listMigrations(scope: DataScope): Promise<DataMigrationRecord[]> {
    return structuredClone(this.migrations.get(scopeKey(scope)) ?? []);
  }

  async saveMigration(migration: DataMigrationRecord): Promise<DataMigrationRecord> {
    const key = scopeKey(migration.scope);
    const existing = this.migrations.get(key) ?? [];
    const index = existing.findIndex(
      (candidate) => candidate.toVersion === migration.toVersion || candidate.id === migration.id
    );
    const copy = structuredClone(migration);
    if (index >= 0) {
      existing[index] = copy;
    } else {
      existing.push(copy);
    }
    this.migrations.set(key, existing);
    return structuredClone(copy);
  }

  async runInSchemaLock<T>(_scope: DataScope, operation: () => Promise<T>): Promise<T> {
    return this.mutex.run(operation);
  }
}

type TransactionClient = Prisma.TransactionClient;

export class PrismaDataStore implements DataStore {
  private readonly mutex = new Mutex();

  constructor(private readonly prisma: PrismaClient) {}

  private async withScope<T>(
    scope: DataScope,
    operation: (tx: TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${scope.organizationId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_app_id', ${scope.appId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_environment', ${scope.environment}, true)`;
      return operation(tx);
    });
  }

  private mapRecord(record: {
    id: string;
    organizationId: string;
    appId: string;
    environment: string;
    modelId: string;
    values: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    updatedBy: string;
  }): DataRecord {
    return {
      id: record.id,
      organizationId: record.organizationId,
      appId: record.appId,
      environment: record.environment as DataRecord['environment'],
      modelId: record.modelId,
      values: record.values as unknown as Record<string, unknown>,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      createdBy: record.createdBy,
      updatedBy: record.updatedBy
    };
  }

  private mapMigration(migration: {
    id: string;
    organizationId: string;
    appId: string;
    environment: string;
    fromVersion: string;
    toVersion: string;
    plan: Prisma.JsonValue;
    status: string;
    error: string | null;
    appliedAt: Date | null;
    createdAt: Date;
  }): DataMigrationRecord {
    return {
      id: migration.id,
      scope: {
        organizationId: migration.organizationId,
        appId: migration.appId,
        environment: migration.environment as DataScope['environment']
      },
      fromVersion: migration.fromVersion,
      toVersion: migration.toVersion,
      plan: migration.plan as unknown as DataMigrationRecord['plan'],
      status: migration.status as DataMigrationRecord['status'],
      ...(migration.error === null ? {} : { error: migration.error }),
      createdAt: migration.createdAt.toISOString(),
      ...(migration.appliedAt === null ? {} : { appliedAt: migration.appliedAt.toISOString() })
    };
  }

  async listRecords(scope: DataScope, modelId: string): Promise<DataRecord[]> {
    const rows = await this.withScope(scope, (tx) =>
      tx.appDataRecord.findMany({
        where: {
          organizationId: scope.organizationId,
          appId: scope.appId,
          environment: scope.environment,
          modelId
        },
        orderBy: { createdAt: 'asc' }
      })
    );
    return rows.map((row) => this.mapRecord(row));
  }

  async getRecord(
    scope: DataScope,
    modelId: string,
    recordId: string
  ): Promise<DataRecord | undefined> {
    const row = await this.withScope(scope, (tx) =>
      tx.appDataRecord.findFirst({
        where: {
          organizationId: scope.organizationId,
          appId: scope.appId,
          environment: scope.environment,
          modelId,
          id: recordId
        }
      })
    );
    return row === null ? undefined : this.mapRecord(row);
  }

  async findByField(
    scope: DataScope,
    modelId: string,
    field: string,
    value: unknown
  ): Promise<DataRecord | undefined> {
    const row = await this.withScope(scope, (tx) =>
      tx.appDataRecord.findFirst({
        where: {
          organizationId: scope.organizationId,
          appId: scope.appId,
          environment: scope.environment,
          modelId,
          values: { path: [field], equals: value as Prisma.InputJsonValue }
        }
      })
    );
    return row === null ? undefined : this.mapRecord(row);
  }

  async createRecord(record: DataRecord): Promise<DataRecord> {
    const scope: DataScope = record;
    const row = await this.withScope(scope, (tx) =>
      tx.appDataRecord.create({
        data: {
          id: record.id,
          organizationId: record.organizationId,
          appId: record.appId,
          environment: record.environment,
          modelId: record.modelId,
          values: record.values as Prisma.InputJsonValue,
          createdBy: record.createdBy,
          updatedBy: record.updatedBy
        }
      })
    );
    return this.mapRecord(row);
  }

  async updateRecord(record: DataRecord): Promise<DataRecord> {
    const scope: DataScope = record;
    const row = await this.withScope(scope, (tx) =>
      tx.appDataRecord.update({
        where: {
          organizationId_appId_environment_modelId_id: {
            organizationId: record.organizationId,
            appId: record.appId,
            environment: record.environment,
            modelId: record.modelId,
            id: record.id
          }
        },
        data: {
          values: record.values as Prisma.InputJsonValue,
          updatedBy: record.updatedBy
        }
      })
    );
    return this.mapRecord(row);
  }

  async deleteRecord(scope: DataScope, modelId: string, recordId: string): Promise<void> {
    await this.withScope(scope, (tx) =>
      tx.appDataRecord.delete({
        where: {
          organizationId_appId_environment_modelId_id: {
            organizationId: scope.organizationId,
            appId: scope.appId,
            environment: scope.environment,
            modelId,
            id: recordId
          }
        }
      })
    );
  }

  async countRecords(scope: DataScope, modelId: string): Promise<number> {
    return this.withScope(scope, (tx) =>
      tx.appDataRecord.count({
        where: {
          organizationId: scope.organizationId,
          appId: scope.appId,
          environment: scope.environment,
          modelId
        }
      })
    );
  }

  async getSchema(scope: DataScope): Promise<DataSchemaSnapshot | undefined> {
    const rows = await this.withScope(scope, (tx) =>
      tx.appDataSchema.findMany({
        where: {
          organizationId: scope.organizationId,
          appId: scope.appId,
          environment: scope.environment
        }
      })
    );
    if (rows.length === 0) {
      return undefined;
    }
    return rows[0]?.definition as unknown as DataSchemaSnapshot;
  }

  async saveSchema(scope: DataScope, schema: DataSchemaSnapshot): Promise<void> {
    await Promise.all(
      schema.models.map((model) =>
        this.withScope(scope, (tx) =>
          tx.appDataSchema.upsert({
            where: {
              organizationId_appId_environment_modelId: {
                organizationId: scope.organizationId,
                appId: scope.appId,
                environment: scope.environment,
                modelId: model.id
              }
            },
            create: {
              organizationId: scope.organizationId,
              appId: scope.appId,
              environment: scope.environment,
              modelId: model.id,
              version: schema.version,
              definition: schema as unknown as Prisma.InputJsonValue
            },
            update: {
              version: schema.version,
              definition: schema as unknown as Prisma.InputJsonValue
            }
          })
        )
      )
    );
  }

  async listMigrations(scope: DataScope): Promise<DataMigrationRecord[]> {
    const rows = await this.withScope(scope, (tx) =>
      tx.appDataMigration.findMany({
        where: {
          organizationId: scope.organizationId,
          appId: scope.appId,
          environment: scope.environment
        },
        orderBy: { createdAt: 'asc' }
      })
    );
    return rows.map((row) => this.mapMigration(row));
  }

  async saveMigration(migration: DataMigrationRecord): Promise<DataMigrationRecord> {
    const scope = migration.scope;
    const row = await this.withScope(scope, (tx) =>
      tx.appDataMigration.upsert({
        where: { id: migration.id },
        create: {
          id: migration.id,
          organizationId: scope.organizationId,
          appId: scope.appId,
          environment: scope.environment,
          fromVersion: migration.fromVersion,
          toVersion: migration.toVersion,
          plan: migration.plan as unknown as Prisma.InputJsonValue,
          status: migration.status,
          error: migration.error ?? null,
          appliedAt: migration.appliedAt === undefined ? null : new Date(migration.appliedAt)
        },
        update: {
          status: migration.status,
          error: migration.error ?? null,
          appliedAt: migration.appliedAt === undefined ? null : new Date(migration.appliedAt)
        }
      })
    );
    return this.mapMigration(row);
  }

  async runInSchemaLock<T>(_scope: DataScope, operation: () => Promise<T>): Promise<T> {
    return this.mutex.run(operation);
  }
}
