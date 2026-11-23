import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { DataModelDefinition } from '@nova/spec';
import type {
  DataQueryCondition,
  DataQueryGroup,
  DataQueryRequest,
  DataQueryResult,
  DataRecord,
  DataScope,
  DataStore
} from './types';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 25;
const MAX_FILTER_CONDITIONS = 32;

function isGroup(condition: DataQueryCondition | DataQueryGroup): condition is DataQueryGroup {
  return 'conditions' in condition;
}

function resolveValue(values: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, values);
}

function compare(left: unknown, right: unknown): number {
  if (left === right) {
    return 0;
  }
  if (left === undefined || left === null) {
    return -1;
  }
  if (right === undefined || right === null) {
    return 1;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function evaluateCondition(
  values: Record<string, unknown>,
  condition: DataQueryCondition
): boolean {
  const actual = resolveValue(values, condition.field);
  const expected = condition.value;
  const empty = actual === undefined || actual === null || actual === '';

  switch (condition.operator) {
    case 'isEmpty':
      return empty;
    case 'isNotEmpty':
      return !empty;
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'contains':
      return typeof actual === 'string' && typeof expected === 'string'
        ? actual.includes(expected)
        : Array.isArray(actual) && actual.includes(expected);
    case 'startsWith':
      return typeof actual === 'string' && typeof expected === 'string'
        ? actual.startsWith(expected)
        : false;
    case 'gt':
      return compare(actual, expected) > 0;
    case 'gte':
      return compare(actual, expected) >= 0;
    case 'lt':
      return compare(actual, expected) < 0;
    case 'lte':
      return compare(actual, expected) <= 0;
    default:
      throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Unsupported data query operator');
  }
}

export function countFilterConditions(group: DataQueryGroup): number {
  return group.conditions.reduce(
    (total, condition) => total + (isGroup(condition) ? countFilterConditions(condition) : 1),
    0
  );
}

function evaluateGroup(values: Record<string, unknown>, group: DataQueryGroup): boolean {
  if (group.conditions.length === 0) {
    return true;
  }
  const results = group.conditions.map((condition) =>
    isGroup(condition) ? evaluateGroup(values, condition) : evaluateCondition(values, condition)
  );
  return group.operator === 'and' ? results.every(Boolean) : results.some(Boolean);
}

function selectValues(
  record: DataRecord,
  fields: readonly string[] | undefined
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...record.values
  };
  if (fields === undefined) {
    return base;
  }
  const selected: Record<string, unknown> = { id: record.id };
  for (const field of fields) {
    if (field in base) {
      selected[field] = base[field];
    }
  }
  return selected;
}

async function expandRecords(
  scope: DataScope,
  model: DataModelDefinition,
  models: readonly DataModelDefinition[],
  store: DataStore,
  records: readonly DataRecord[],
  expand: readonly string[]
): Promise<Array<Record<string, unknown>>> {
  const relationships = model.relationships ?? [];
  const selected = relationships.filter((relationship) => expand.includes(relationship.name));
  if (selected.length === 0) {
    return records.map((record) => selectValues(record, undefined));
  }

  const targetModels = new Map(models.map((candidate) => [candidate.id, candidate]));

  return Promise.all(
    records.map(async (record) => {
      const result = selectValues(record, undefined);
      const expanded: Record<string, unknown> = {};

      for (const relationship of selected) {
        const sourceValue = record.values[relationship.sourceFieldId];
        if (
          relationship.cardinality === 'one-to-one' ||
          relationship.cardinality === 'one-to-many'
        ) {
          const candidates = await store.listRecords(scope, relationship.targetModelId);
          const targetField = relationship.targetFieldId ?? relationship.sourceFieldId;
          const matches = candidates.filter(
            (candidate) => candidate.values[targetField] === sourceValue
          );
          expanded[relationship.name] =
            relationship.cardinality === 'one-to-one'
              ? (matches[0]?.values ?? null)
              : matches.map((candidate) => candidate.values);
          continue;
        }

        if (
          relationship.junctionModelId !== undefined &&
          targetModels.has(relationship.targetModelId)
        ) {
          const junctions = await store.listRecords(scope, relationship.junctionModelId);
          const linked = junctions
            .filter((junction) => junction.values[relationship.sourceFieldId] === sourceValue)
            .map(
              (junction) =>
                junction.values[relationship.targetFieldId ?? relationship.sourceFieldId]
            );
          const targets = await store.listRecords(scope, relationship.targetModelId);
          expanded[relationship.name] = targets
            .filter((target) => linked.includes(target.id))
            .map((target) => target.values);
        }
      }

      result['expanded'] = expanded;
      return result;
    })
  );
}

export async function executeDataQuery(
  scope: DataScope,
  model: DataModelDefinition,
  models: readonly DataModelDefinition[],
  store: DataStore,
  request: DataQueryRequest
): Promise<DataQueryResult> {
  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(page) || page < 1) {
    throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Page must be a positive integer');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new NovaError(
      NovaErrorCodes.VALIDATION_FAILED,
      `Page size must be between 1 and ${MAX_PAGE_SIZE}`
    );
  }
  if (
    request.filters !== undefined &&
    countFilterConditions(request.filters) > MAX_FILTER_CONDITIONS
  ) {
    throw new NovaError(
      NovaErrorCodes.VALIDATION_FAILED,
      'Data query has too many filter conditions'
    );
  }

  let records = await store.listRecords(scope, model.id);
  const filters = request.filters;
  if (filters !== undefined) {
    records = records.filter((record) => evaluateGroup(record.values, filters));
  }

  for (const sort of [...(request.sort ?? [])].reverse()) {
    records = [...records].sort((left, right) => {
      const result = compare(
        resolveValue(left.values, sort.field),
        resolveValue(right.values, sort.field)
      );
      return sort.direction === 'asc' ? result : -result;
    });
  }

  const total = records.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const pageRecords = records.slice(start, start + pageSize);
  const rows =
    request.expand !== undefined && request.expand.length > 0
      ? await expandRecords(scope, model, models, store, pageRecords, request.expand)
      : pageRecords.map((record) => selectValues(record, request.fields));

  return { rows, total, page, pageSize, pageCount };
}
