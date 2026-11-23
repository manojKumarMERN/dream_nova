import type {
  DataModelDefinition,
  DataQueryCondition,
  DataQueryGroup,
  DataQuerySort,
  DataRelationshipDefinition
} from '@nova/spec';

export type { DataModelDefinition, DataQueryCondition, DataQueryGroup };

export type DataEnvironment = 'development' | 'preview' | 'production';

export interface DataScope {
  organizationId: string;
  appId: string;
  environment: DataEnvironment;
}

export interface DataActor {
  userId: string;
  organizationId: string;
  roles: string[];
}

export interface DataRecord {
  id: string;
  organizationId: string;
  appId: string;
  environment: DataEnvironment;
  modelId: string;
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface DataQueryRequest {
  modelId: string;
  filters?: DataQueryGroup | undefined;
  sort?: DataQuerySort[] | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  fields?: string[] | undefined;
  expand?: string[] | undefined;
}

export interface DataQueryResult {
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface DataSchemaFieldSnapshot {
  id: string;
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
}

export interface DataSchemaModelSnapshot {
  id: string;
  name: string;
  fields: DataSchemaFieldSnapshot[];
  relationships: DataRelationshipDefinition[];
}

export interface DataSchemaSnapshot {
  version: string;
  models: DataSchemaModelSnapshot[];
}

export type DataMigrationOperationType =
  | 'create-model'
  | 'remove-model'
  | 'add-field'
  | 'remove-field'
  | 'change-field-type'
  | 'add-relationship'
  | 'remove-relationship';

export interface DataMigrationOperation {
  type: DataMigrationOperationType;
  modelId: string;
  modelName: string;
  fieldId?: string | undefined;
  fieldName?: string | undefined;
  fromType?: string | undefined;
  toType?: string | undefined;
  relationshipId?: string | undefined;
  destructive: boolean;
}

export interface DataMigrationPlan {
  fromVersion: string;
  toVersion: string;
  operations: DataMigrationOperation[];
  destructive: boolean;
  impacts: string[];
}

export interface DataMigrationRecord {
  id: string;
  scope: DataScope;
  fromVersion: string;
  toVersion: string;
  plan: DataMigrationPlan;
  status: 'pending' | 'applied' | 'failed';
  error?: string | undefined;
  createdAt: string;
  appliedAt?: string | undefined;
}

export interface DataStore {
  listRecords(scope: DataScope, modelId: string): Promise<DataRecord[]>;
  getRecord(scope: DataScope, modelId: string, recordId: string): Promise<DataRecord | undefined>;
  findByField(
    scope: DataScope,
    modelId: string,
    field: string,
    value: unknown
  ): Promise<DataRecord | undefined>;
  createRecord(record: DataRecord): Promise<DataRecord>;
  updateRecord(record: DataRecord): Promise<DataRecord>;
  deleteRecord(scope: DataScope, modelId: string, recordId: string): Promise<void>;
  countRecords(scope: DataScope, modelId: string): Promise<number>;
  getSchema(scope: DataScope): Promise<DataSchemaSnapshot | undefined>;
  saveSchema(scope: DataScope, schema: DataSchemaSnapshot): Promise<void>;
  listMigrations(scope: DataScope): Promise<DataMigrationRecord[]>;
  saveMigration(migration: DataMigrationRecord): Promise<DataMigrationRecord>;
  runInSchemaLock<T>(scope: DataScope, operation: () => Promise<T>): Promise<T>;
}

export interface CreateDataEngineOptions {
  appId: string;
  definitionOrganizationId: string;
  definition: {
    dataModels: DataModelDefinition[];
    dataPermissions?: Array<{
      id: string;
      role: 'owner' | 'admin' | 'editor' | 'viewer';
      modelId: string;
      actions: Array<'data:read' | 'data:create' | 'data:update' | 'data:delete'>;
      recordPolicyRef?: string | undefined;
    }>;
  };
  store: DataStore;
  environment: DataEnvironment;
}

export type DataAction = 'data:read' | 'data:create' | 'data:update' | 'data:delete';
