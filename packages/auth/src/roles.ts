export const ORG_ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export const PERMISSIONS = [
  'app:read',
  'app:create',
  'app:update',
  'app:delete',
  'version:read',
  'version:create',
  'proposal:create',
  'proposal:approve',
  'proposal:apply',
  'integration:read',
  'integration:write',
  'audit:read',
  'registry:read'
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  EDITOR: [
    'app:read',
    'app:create',
    'app:update',
    'version:read',
    'version:create',
    'proposal:create',
    'proposal:apply',
    'integration:read',
    'audit:read',
    'registry:read'
  ],
  VIEWER: ['app:read', 'version:read', 'registry:read']
};

export function permissionsForRole(role: OrgRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}
