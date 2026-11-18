import { describe, expect, it } from 'vitest';
import { InMemoryPlatformRepository } from '../src/index';

const actor = 'user-1';

function appInput(orgId: string) {
  return { orgId, name: 'App', slug: 'app', createdByUserId: actor };
}

describe('InMemoryPlatformRepository', () => {
  it('isolates tenants on reads and writes', async () => {
    const repository = new InMemoryPlatformRepository();
    const app = await repository.createApp(appInput('org-1'));

    expect(await repository.listApps('org-1')).toHaveLength(1);
    expect(await repository.listApps('org-2')).toEqual([]);
    expect(await repository.getApp('org-2', app.id)).toBeUndefined();
    expect(await repository.getAppBySlug('org-2', app.slug)).toBeUndefined();
    await expect(
      repository.createVersion({
        orgId: 'org-2',
        appId: app.id,
        versionNumber: 1,
        schemaVersion: '1.0',
        definition: {},
        checksum: 'abc',
        createdByUserId: actor
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const version = await repository.createVersion({
      orgId: 'org-1',
      appId: app.id,
      versionNumber: 1,
      schemaVersion: '1.0',
      definition: { name: 'original' },
      checksum: 'abc',
      createdByUserId: actor
    });
    expect(await repository.getVersion('org-2', version.id)).toBeUndefined();
    expect(await repository.getVersion('org-1', version.id)).toBeDefined();
  });

  it('stores immutable versions and scoped data records', async () => {
    const repository = new InMemoryPlatformRepository();
    const app = await repository.createApp(appInput('org-1'));
    const definition = { name: 'original', nested: { value: 1 } };
    const version = await repository.createVersion({
      orgId: 'org-1',
      appId: app.id,
      versionNumber: 1,
      schemaVersion: '1.0',
      definition,
      checksum: 'abc',
      createdByUserId: actor
    });

    (definition.nested as { value: number }).value = 2;
    (version.definition as { name: string }).name = 'mutated';

    const stored = await repository.getVersion('org-1', version.id);
    expect((stored?.definition as { name: string; nested: { value: number } }).name).toBe(
      'original'
    );
    expect((stored?.definition as { name: string; nested: { value: number } }).nested.value).toBe(
      1
    );

    await repository.createDataRecord({
      orgId: 'org-1',
      appId: app.id,
      key: 'runtime:production',
      value: { payload: true }
    });
    expect(await repository.getData('org-2', app.id, 'runtime:production')).toBeUndefined();
    const record = await repository.getData('org-1', app.id, 'runtime:production');
    expect(record?.value).toEqual({ payload: true });
    const updated = await repository.updateDataRecord('org-1', app.id, 'runtime:production', {
      value: { payload: false }
    });
    expect(updated?.value).toEqual({ payload: false });
    expect(await repository.deleteDataRecord('org-1', app.id, 'runtime:production')).toBe(true);
    expect(await repository.getData('org-1', app.id, 'runtime:production')).toBeUndefined();
  });
});
