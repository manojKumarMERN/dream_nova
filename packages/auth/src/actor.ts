import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { OrgRole, Permission } from './roles';
import { hasPermission } from './roles';

export type ActorType = 'USER' | 'AI_AGENT' | 'SYSTEM';

export interface Actor {
  userId: string;
  organizationId: string;
  role: OrgRole;
  actorType: ActorType;
}

export function assertPermission(
  actor: Actor,
  permission: Permission,
  organizationId?: string
): void {
  if (organizationId !== undefined && actor.organizationId !== organizationId) {
    throw new NovaError(
      NovaErrorCodes.FORBIDDEN,
      'Actor does not belong to the target organization',
      {
        details: { actorOrganizationId: actor.organizationId, targetOrganizationId: organizationId }
      }
    );
  }

  if (!hasPermission(actor.role, permission)) {
    throw new NovaError(NovaErrorCodes.FORBIDDEN, 'Actor does not have the required permission', {
      details: { permission, role: actor.role }
    });
  }
}
