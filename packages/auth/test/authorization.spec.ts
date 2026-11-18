import { describe, expect, it } from 'vitest';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import { assertPermission, hasPermission } from '../src/index';

const editor = {
  userId: 'user-1',
  organizationId: 'org-1',
  role: 'EDITOR' as const,
  actorType: 'USER' as const
};

describe('authorization', () => {
  it('allows viewers to read apps', () => {
    expect(hasPermission('VIEWER', 'app:read')).toBe(true);
  });

  it('denies viewers app creation', () => {
    expect(() => assertPermission({ ...editor, role: 'VIEWER' }, 'app:create')).toThrow(NovaError);
  });

  it('denies editors proposal approval', () => {
    expect(() => assertPermission(editor, 'proposal:approve')).toThrow(NovaError);
  });

  it('allows admins proposal approval', () => {
    expect(() =>
      assertPermission({ ...editor, role: 'ADMIN' }, 'proposal:approve', 'org-1')
    ).not.toThrow();
  });

  it('rejects cross-organization access', () => {
    try {
      assertPermission(editor, 'app:read', 'org-2');
      throw new Error('Expected cross-org access to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(NovaError);
      expect((error as NovaError).code).toBe(NovaErrorCodes.FORBIDDEN);
    }
  });
});
