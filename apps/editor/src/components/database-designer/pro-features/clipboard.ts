import type {
  AppDefinition,
  DataFieldDefinition,
  DataModelDefinition,
  DataRelationshipDefinition
} from '@nova/spec';
import { createUniqueId } from '../../../id';
import type { DesignerPoint } from '../model';
import {
  addDataModel,
  addDataRelationship,
  updateDataModel,
  updateDataRelationship
} from '../model';

export interface DesignerClipboardModel {
  model: DataModelDefinition;
  position: DesignerPoint;
}

export interface DesignerClipboardRelationship {
  relationship: DataRelationshipDefinition;
  sourceModelId: string;
  targetModelId: string;
}

export interface DesignerClipboard {
  models: DesignerClipboardModel[];
  relationships: DesignerClipboardRelationship[];
}

export interface PasteClipboardResult {
  definition: AppDefinition;
  positions: Record<string, DesignerPoint>;
  modelIds: string[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueName(base: string, existing: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  existing.add(candidate);
  return candidate;
}

export function createClipboard(
  definition: AppDefinition,
  modelIds: readonly string[],
  positions: Record<string, DesignerPoint>
): DesignerClipboard | undefined {
  const selected = new Set(modelIds);
  const models = definition.dataModels
    .filter((model) => selected.has(model.id))
    .map((model) => ({
      model: clone(model),
      position: positions[model.id] ?? { x: 0, y: 0 }
    }));
  if (models.length === 0) {
    return undefined;
  }
  const relationships: DesignerClipboardRelationship[] = [];
  for (const model of definition.dataModels) {
    if (!selected.has(model.id)) {
      continue;
    }
    for (const relationship of model.relationships ?? []) {
      if (
        !selected.has(relationship.sourceModelId) ||
        !selected.has(relationship.targetModelId) ||
        (relationship.junctionModelId !== undefined && !selected.has(relationship.junctionModelId))
      ) {
        continue;
      }
      relationships.push({
        relationship: clone(relationship),
        sourceModelId: relationship.sourceModelId,
        targetModelId: relationship.targetModelId
      });
    }
  }
  return { models, relationships };
}

export function pasteClipboard(
  definition: AppDefinition,
  clipboard: DesignerClipboard,
  origin: DesignerPoint,
  currentPositions: Record<string, DesignerPoint>
): PasteClipboardResult {
  let next = definition;
  const positions = { ...currentPositions };
  const modelIds: string[] = [];
  const modelIdMap = new Map<string, string>();
  const fieldIdMaps = new Map<string, Map<string, string>>();
  const existingNames = new Set(definition.dataModels.map((model) => model.name));
  const minX = Math.min(...clipboard.models.map((item) => item.position.x));
  const minY = Math.min(...clipboard.models.map((item) => item.position.y));

  for (const item of clipboard.models) {
    const name = uniqueName(item.model.name, existingNames);
    const created = addDataModel(next, name);
    next = created.definition;
    const fieldIdMap = new Map<string, string>();
    const fields: DataFieldDefinition[] = item.model.fields.map((field) => {
      const id = createUniqueId('field');
      fieldIdMap.set(field.id, id);
      return { ...clone(field), id };
    });
    next = updateDataModel(next, created.model.id, () => ({
      ...clone(item.model),
      id: created.model.id,
      name,
      fields,
      relationships: []
    }));
    modelIdMap.set(item.model.id, created.model.id);
    fieldIdMaps.set(item.model.id, fieldIdMap);
    modelIds.push(created.model.id);
    positions[created.model.id] = {
      x: origin.x + item.position.x - minX,
      y: origin.y + item.position.y - minY
    };
  }

  for (const item of clipboard.relationships) {
    const sourceModelId = modelIdMap.get(item.sourceModelId);
    const targetModelId = modelIdMap.get(item.targetModelId);
    const sourceFieldId = fieldIdMaps.get(item.sourceModelId)?.get(item.relationship.sourceFieldId);
    const targetFieldId = item.relationship.targetFieldId
      ? fieldIdMaps.get(item.targetModelId)?.get(item.relationship.targetFieldId)
      : undefined;
    if (sourceModelId === undefined || targetModelId === undefined || sourceFieldId === undefined) {
      continue;
    }
    const junctionModelId = item.relationship.junctionModelId
      ? modelIdMap.get(item.relationship.junctionModelId)
      : undefined;
    const created = addDataRelationship(next, {
      sourceModelId,
      sourceFieldId,
      targetModelId,
      ...(targetFieldId === undefined ? {} : { targetFieldId }),
      cardinality: item.relationship.cardinality,
      onDelete: item.relationship.onDelete,
      onUpdate: item.relationship.onUpdate,
      ...(item.relationship.cardinality === 'many-to-many' && junctionModelId !== undefined
        ? { junctionModelId }
        : {})
    });
    next = updateDataRelationship(next, sourceModelId, created.relationship.id, {
      name: item.relationship.name
    });
  }

  return { definition: next, positions, modelIds };
}
