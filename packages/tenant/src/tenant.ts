import { NovaError, NovaErrorCodes } from '@nova/errors';

export interface TenantScoped {
  organizationId: string;
}

export function assertTenantScope(actor: TenantScoped, resource: TenantScoped): void {
  if (actor.organizationId !== resource.organizationId) {
    throw new NovaError(NovaErrorCodes.FORBIDDEN, 'Resource belongs to a different organization', {
      details: {
        actorOrganizationId: actor.organizationId,
        resourceOrganizationId: resource.organizationId
      }
    });
  }
}

export function withTenantScope<T extends object>(scope: TenantScoped, value: T): T & TenantScoped {
  return {
    ...value,
    organizationId: scope.organizationId
  };
}
