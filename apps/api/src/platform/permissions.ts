import { assertPermission } from '@nova/auth';
import type { Actor, Permission } from '@nova/auth';

export type PlatformPermission = Permission | 'app:publish' | 'ai:propose';

function effectivePermission(permission: PlatformPermission): Permission {
  if (permission === 'app:publish') {
    return 'app:update';
  }
  if (permission === 'ai:propose') {
    return 'proposal:create';
  }
  return permission;
}

export function assertPlatformPermission(
  actor: Actor,
  permission: PlatformPermission,
  organizationId?: string | undefined
): void {
  const resolved = effectivePermission(permission);
  if (organizationId === undefined) {
    assertPermission(actor, resolved);
    return;
  }
  assertPermission(actor, resolved, organizationId);
}
