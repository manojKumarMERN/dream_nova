import { describe, expect, it } from 'vitest';
import { NovaErrorCodes } from '@nova/errors';
import { assertTenantScope, withTenantScope } from '../src/index';

describe('tenant scope', () => {
  it('accepts matching organizations', () => {
    expect(() =>
      assertTenantScope({ organizationId: 'org-1' }, { organizationId: 'org-1' })
    ).not.toThrow();
  });

  it('rejects mismatched organizations', () => {
    try {
      assertTenantScope({ organizationId: 'org-1' }, { organizationId: 'org-2' });
      throw new Error('Expected mismatch to fail');
    } catch (error) {
      expect((error as { code?: string }).code).toBe(NovaErrorCodes.FORBIDDEN);
    }
  });

  it('stamps values with the tenant id', () => {
    expect(withTenantScope({ organizationId: 'org-1' }, { name: 'App' })).toEqual({
      name: 'App',
      organizationId: 'org-1'
    });
  });
});
