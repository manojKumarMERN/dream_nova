import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { CreateDataEngineOptions, DataAction, DataActor } from './types';

export function normalizeRole(value: string): string {
  return value.trim().toLowerCase();
}

export function hasDataPermission(
  definition: CreateDataEngineOptions['definition'],
  actor: DataActor,
  modelId: string,
  action: DataAction
): boolean {
  const roles = new Set(actor.roles.map(normalizeRole));
  return (definition.dataPermissions ?? []).some(
    (permission) =>
      permission.modelId === modelId &&
      permission.actions.includes(action) &&
      roles.has(normalizeRole(permission.role))
  );
}

export function assertDataPermission(
  definition: CreateDataEngineOptions['definition'],
  actor: DataActor,
  modelId: string,
  action: DataAction
): void {
  if (!hasDataPermission(definition, actor, modelId, action)) {
    throw new NovaError(NovaErrorCodes.FORBIDDEN, `Data permission denied: ${action}`);
  }
}
