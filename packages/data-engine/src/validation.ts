import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { DataFieldDefinition, DataModelDefinition } from '@nova/spec';
import type { DataActor, DataRecord, DataScope } from './types';

const STRING_TYPES = new Set(['string', 'text', 'longText', 'email', 'url', 'uuid', 'enum']);
const NUMBER_TYPES = new Set(['number', 'integer', 'decimal']);
const DATE_TYPES = new Set(['date', 'datetime']);

export function getModel(
  models: readonly DataModelDefinition[],
  modelIdOrName: string
): DataModelDefinition {
  const model = models.find(
    (candidate) => candidate.id === modelIdOrName || candidate.name === modelIdOrName
  );
  if (model === undefined) {
    throw new NovaError(NovaErrorCodes.NOT_FOUND, `Unknown data model: ${modelIdOrName}`);
  }
  return model;
}

export function applyDefaults(
  model: DataModelDefinition,
  values: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...values };
  for (const field of model.fields) {
    if (result[field.name] === undefined && field.defaultValue !== undefined) {
      result[field.name] = field.defaultValue;
    }
  }
  return result;
}

function validateField(field: DataFieldDefinition, value: unknown, path: string): void {
  if (value === null || value === undefined) {
    if (field.required === true) {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        `Required data field is missing: ${field.name}`,
        { details: { path, field: field.name } }
      );
    }
    return;
  }

  if (STRING_TYPES.has(field.type)) {
    if (typeof value !== 'string') {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        `Data field must be a string: ${field.name}`,
        { details: { path, field: field.name } }
      );
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        `Data field exceeds maximum length: ${field.name}`,
        { details: { path, field: field.name } }
      );
    }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        `Invalid email address: ${field.name}`,
        {
          details: { path, field: field.name }
        }
      );
    }
    if (field.type === 'url') {
      try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Invalid protocol');
        }
      } catch {
        throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, `Invalid URL: ${field.name}`, {
          details: { path, field: field.name }
        });
      }
    }
    if (
      field.type === 'uuid' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) {
      throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, `Invalid UUID: ${field.name}`, {
        details: { path, field: field.name }
      });
    }
    if (field.type === 'enum' && !(field.enumValues ?? []).includes(value)) {
      throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, `Invalid enum value: ${field.name}`, {
        details: { path, field: field.name }
      });
    }
    return;
  }

  if (NUMBER_TYPES.has(field.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        `Data field must be a finite number: ${field.name}`,
        { details: { path, field: field.name } }
      );
    }
    if (field.type === 'integer' && !Number.isInteger(value)) {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        `Data field must be an integer: ${field.name}`,
        {
          details: { path, field: field.name }
        }
      );
    }
    if (field.minimum !== undefined && value < field.minimum) {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        `Data field is below minimum: ${field.name}`,
        {
          details: { path, field: field.name }
        }
      );
    }
    if (field.maximum !== undefined && value > field.maximum) {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        `Data field is above maximum: ${field.name}`,
        {
          details: { path, field: field.name }
        }
      );
    }
    return;
  }

  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        `Data field must be a boolean: ${field.name}`,
        { details: { path, field: field.name } }
      );
    }
    return;
  }

  if (DATE_TYPES.has(field.type)) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, `Invalid date: ${field.name}`, {
        details: { path, field: field.name }
      });
    }
    return;
  }

  if (field.type === 'reference' && (typeof value !== 'string' || value.length === 0)) {
    throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, `Invalid reference: ${field.name}`, {
      details: { path, field: field.name }
    });
  }
}

export function validateDataValues(
  model: DataModelDefinition,
  values: Record<string, unknown>,
  mode: 'create' | 'update'
): void {
  const fieldsByName = new Map(model.fields.map((field) => [field.name, field]));
  const allowed = new Set([...fieldsByName.keys(), 'id', 'createdAt', 'updatedAt']);

  for (const [name, value] of Object.entries(values)) {
    if (!allowed.has(name)) {
      throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, `Unknown data field: ${name}`, {
        details: { path: name }
      });
    }
    if (name === 'id' || name === 'createdAt' || name === 'updatedAt') {
      continue;
    }
    const field = fieldsByName.get(name);
    if (field !== undefined) {
      validateField(field, value, name);
    }
  }

  if (mode === 'create') {
    for (const field of model.fields) {
      const value = values[field.name];
      if (value === undefined && field.required === true && field.defaultValue === undefined) {
        throw new NovaError(
          NovaErrorCodes.VALIDATION_FAILED,
          `Required data field is missing: ${field.name}`,
          { details: { path: field.name, field: field.name } }
        );
      }
      validateField(field, value, field.name);
    }
  }
}

export function createRecordEntity(
  scope: DataScope,
  actor: DataActor,
  modelId: string,
  id: string,
  values: Record<string, unknown>,
  now = new Date().toISOString()
): DataRecord {
  return {
    id,
    organizationId: scope.organizationId,
    appId: scope.appId,
    environment: scope.environment,
    modelId,
    values,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.userId,
    updatedBy: actor.userId
  };
}
