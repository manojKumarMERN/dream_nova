import type { AppDefinition } from '@nova/spec';

export interface WorkflowDataFieldOption {
  id: string;
  name: string;
  type: string;
  displayName?: string;
  required: boolean;
}

export interface WorkflowDataModelOption {
  id: string;
  name: string;
  displayName?: string;
  fields: WorkflowDataFieldOption[];
}

export interface WorkflowDataSourceOption {
  id: string;
  name: string;
  provider: string;
  environment: string;
  modelId?: string;
  modelName?: string;
}

export interface WorkflowQueryOption {
  id: string;
  name: string;
  modelId: string;
  modelName?: string;
  sourceId?: string;
  sourceName?: string;
  operation: 'query';
  kind: 'read';
  fields: string[];
  sort: Array<{ field: string; direction: 'asc' | 'desc' }>;
  pageSize?: number;
  page?: number;
}

export interface WorkflowDataCatalogIssue {
  code: 'MISSING_MODEL' | 'MISSING_SOURCE' | 'UNSUPPORTED_PROVIDER';
  path: string;
  message: string;
}

export interface WorkflowDataCatalog {
  dataModels: WorkflowDataModelOption[];
  dataSources: WorkflowDataSourceOption[];
  queries: WorkflowQueryOption[];
  externalConnectorsAvailable: false;
  externalConnectorsMessage: string;
  issues: WorkflowDataCatalogIssue[];
}

export function discoverWorkflowData(definition: AppDefinition): WorkflowDataCatalog {
  const issues: WorkflowDataCatalogIssue[] = [];
  const dataModels = definition.dataModels ?? [];
  const modelNames = new Map(
    dataModels.map((model) => [model.id, model.displayName ?? model.name])
  );

  const dataSources: WorkflowDataSourceOption[] = [];
  const sourceIds = new Set<string>();
  const sourceNames = new Map<string, string>();
  for (const source of definition.dataSources ?? []) {
    if (source.provider !== 'nova-data') {
      issues.push({
        code: 'UNSUPPORTED_PROVIDER',
        path: `dataSources[${source.id}].provider`,
        message: `${source.name} uses an unsupported provider`
      });
      continue;
    }
    sourceIds.add(source.id);
    sourceNames.set(source.id, source.name);
    dataSources.push({
      id: source.id,
      name: source.name,
      provider: source.provider,
      environment: source.environment,
      ...(source.modelId === undefined ? {} : { modelId: source.modelId }),
      ...(source.modelId === undefined || modelNames.get(source.modelId) === undefined
        ? {}
        : { modelName: modelNames.get(source.modelId) })
    });
  }

  const queries: WorkflowQueryOption[] = [];
  for (const query of definition.queries ?? []) {
    if (modelNames.get(query.modelId) === undefined) {
      issues.push({
        code: 'MISSING_MODEL',
        path: `queries[${query.id}].modelId`,
        message: `${query.name} references a data model that is no longer available`
      });
    }
    if (query.sourceId !== undefined && !sourceIds.has(query.sourceId)) {
      issues.push({
        code: 'MISSING_SOURCE',
        path: `queries[${query.id}].sourceId`,
        message: `${query.name} references a data source that is no longer available`
      });
    }
    queries.push({
      id: query.id,
      name: query.name,
      modelId: query.modelId,
      ...(modelNames.get(query.modelId) === undefined
        ? {}
        : { modelName: modelNames.get(query.modelId) }),
      ...(query.sourceId === undefined ? {} : { sourceId: query.sourceId }),
      ...(query.sourceId === undefined || sourceNames.get(query.sourceId) === undefined
        ? {}
        : { sourceName: sourceNames.get(query.sourceId) }),
      operation: 'query',
      kind: 'read',
      fields: query.fields ?? [],
      sort: query.sort ?? [],
      ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
      ...(query.page === undefined ? {} : { page: query.page })
    });
  }

  return {
    dataModels: dataModels.map((model) => ({
      id: model.id,
      name: model.name,
      ...(model.displayName === undefined ? {} : { displayName: model.displayName }),
      fields: model.fields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        ...(field.displayName === undefined ? {} : { displayName: field.displayName }),
        required: field.required
      }))
    })),
    dataSources,
    queries,
    externalConnectorsAvailable: false,
    externalConnectorsMessage: 'External connector metadata is not available in this NOVA edition.',
    issues
  };
}
