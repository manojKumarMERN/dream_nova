import type {
  AppDefinition,
  DataFieldDefinition,
  DataFieldType,
  DataModelDefinition,
  DataPermissionDefinition,
  DataReferentialAction,
  DataRelationshipCardinality,
  DataRelationshipDefinition
} from '@nova/spec';
import { createUniqueId } from '../../id';

export const FIELD_TYPES: readonly DataFieldType[] = [
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

export const CARDINALITIES: readonly DataRelationshipCardinality[] = [
  'one-to-one',
  'one-to-many',
  'many-to-many'
];

export const REFERENTIAL_ACTIONS: readonly DataReferentialAction[] = [
  'cascade',
  'restrict',
  'set-null',
  'no-action'
];

export interface DesignerPoint {
  x: number;
  y: number;
}

export interface AddRelationshipInput {
  sourceModelId: string;
  sourceFieldId: string;
  targetModelId: string;
  targetFieldId?: string;
  cardinality?: DataRelationshipCardinality;
  onDelete?: DataReferentialAction;
  onUpdate?: DataReferentialAction;
  junctionModelId?: string;
}

export function normalizeSchemaName(value: string): string {
  return value
    .trim()
    .slice(0, 120)
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^[^A-Za-z_]+/, '');
}

function defaultPermissions(modelId: string): DataPermissionDefinition[] {
  const actions = ['data:read', 'data:create', 'data:update', 'data:delete'] as const;
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

export function createDataModel(name: string): DataModelDefinition {
  return {
    id: createUniqueId('model'),
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
}

export function createDataField(name: string, type: DataFieldType): DataFieldDefinition {
  return {
    id: createUniqueId('field'),
    name,
    type,
    required: false,
    unique: false,
    ...(type === 'enum' ? { enumValues: ['option1', 'option2'] } : {})
  };
}

export function updateDataModel(
  definition: AppDefinition,
  modelId: string,
  update: (model: DataModelDefinition) => DataModelDefinition
): AppDefinition {
  return {
    ...definition,
    dataModels: definition.dataModels.map((model) => (model.id === modelId ? update(model) : model))
  };
}

export function addDataModel(
  definition: AppDefinition,
  name: string
): { definition: AppDefinition; model: DataModelDefinition } {
  const model = createDataModel(name);
  return {
    definition: {
      ...definition,
      dataModels: [...definition.dataModels, model],
      dataPermissions: [...(definition.dataPermissions ?? []), ...defaultPermissions(model.id)]
    },
    model
  };
}

export function removeDataModel(definition: AppDefinition, modelId: string): AppDefinition {
  return {
    ...definition,
    dataModels: definition.dataModels
      .filter((model) => model.id !== modelId)
      .map((model) => ({
        ...model,
        ...((model.relationships ?? []).length === 0
          ? {}
          : {
              relationships: (model.relationships ?? []).filter(
                (relationship) =>
                  relationship.sourceModelId !== modelId &&
                  relationship.targetModelId !== modelId &&
                  relationship.junctionModelId !== modelId
              )
            })
      })),
    dataSources: (definition.dataSources ?? []).filter((source) => source.modelId !== modelId),
    queries: (definition.queries ?? []).filter((query) => query.modelId !== modelId),
    dataBindings: (definition.dataBindings ?? []).filter((binding) => binding.modelId !== modelId),
    dataPermissions: (definition.dataPermissions ?? []).filter(
      (permission) => permission.modelId !== modelId
    )
  };
}

export function addDataField(
  definition: AppDefinition,
  modelId: string,
  name: string,
  type: DataFieldType
): { definition: AppDefinition; field: DataFieldDefinition } {
  const field = createDataField(name, type);
  return {
    definition: updateDataModel(definition, modelId, (model) => ({
      ...model,
      fields: [...model.fields, field]
    })),
    field
  };
}

export function updateDataField(
  definition: AppDefinition,
  modelId: string,
  fieldId: string,
  patch: Partial<DataFieldDefinition>
): AppDefinition {
  return updateDataModel(definition, modelId, (model) => ({
    ...model,
    fields: model.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field))
  }));
}

export function removeDataField(
  definition: AppDefinition,
  modelId: string,
  fieldId: string
): AppDefinition {
  return updateDataModel(definition, modelId, (model) => ({
    ...model,
    fields: model.fields.filter((field) => field.id !== fieldId),
    ...((model.relationships ?? []).length === 0
      ? {}
      : {
          relationships: (model.relationships ?? []).filter(
            (relationship) =>
              relationship.sourceFieldId !== fieldId && relationship.targetFieldId !== fieldId
          )
        })
  }));
}

export function addDataRelationship(
  definition: AppDefinition,
  input: AddRelationshipInput
): { definition: AppDefinition; relationship: DataRelationshipDefinition } {
  const source = definition.dataModels.find((model) => model.id === input.sourceModelId);
  const target = definition.dataModels.find((model) => model.id === input.targetModelId);
  if (source === undefined || target === undefined) {
    throw new Error('Select both a source and target model');
  }
  if (source.id === target.id) {
    throw new Error('A model cannot relate to itself');
  }
  const targetFieldId =
    input.targetFieldId ?? target.fields.find((field) => field.name === 'id')?.id;
  const relationship: DataRelationshipDefinition = {
    id: createUniqueId('relationship'),
    name: `${source.name}_${target.name}`,
    sourceModelId: source.id,
    sourceFieldId: input.sourceFieldId,
    targetModelId: target.id,
    ...(targetFieldId === undefined ? {} : { targetFieldId }),
    cardinality: input.cardinality ?? 'one-to-many',
    onDelete: input.onDelete ?? 'cascade',
    onUpdate: input.onUpdate ?? 'cascade',
    ...(input.cardinality === 'many-to-many' && input.junctionModelId !== undefined
      ? { junctionModelId: input.junctionModelId }
      : {})
  };
  return {
    definition: updateDataModel(definition, source.id, (model) => ({
      ...model,
      relationships: [...(model.relationships ?? []), relationship]
    })),
    relationship
  };
}

export function updateDataRelationship(
  definition: AppDefinition,
  modelId: string,
  relationshipId: string,
  patch: Partial<DataRelationshipDefinition>
): AppDefinition {
  return updateDataModel(definition, modelId, (model) => ({
    ...model,
    relationships: (model.relationships ?? []).map((relationship) =>
      relationship.id === relationshipId ? { ...relationship, ...patch } : relationship
    )
  }));
}

export function removeDataRelationship(
  definition: AppDefinition,
  modelId: string,
  relationshipId: string
): AppDefinition {
  return updateDataModel(definition, modelId, (model) => ({
    ...model,
    relationships: (model.relationships ?? []).filter(
      (relationship) => relationship.id !== relationshipId
    )
  }));
}

export function sourceHandleId(fieldId: string): string {
  return `${fieldId}:source`;
}

export function targetHandleId(fieldId: string): string {
  return `${fieldId}:target`;
}

export function fieldIdFromHandle(handleId: string | null | undefined): string | undefined {
  if (handleId === null || handleId === undefined || handleId.length === 0) {
    return undefined;
  }
  return handleId.split(':')[0];
}

export function collapsedFieldId(modelId: string): string {
  return `collapsed:${modelId}`;
}

export function autoLayoutModels(
  models: readonly DataModelDefinition[]
): Record<string, DesignerPoint> {
  return Object.fromEntries(
    models.map((model, index) => [
      model.id,
      { x: 80 + (index % 3) * 320, y: 80 + Math.floor(index / 3) * 280 }
    ])
  );
}
