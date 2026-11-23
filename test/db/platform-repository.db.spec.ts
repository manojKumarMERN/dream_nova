import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaDataStore, PrismaPlatformRepository } from '@nova/backend-adapters';
import {
  createAppDatabaseClient,
  createAppFixture,
  createPrismaClient,
  makeDataRecord,
  type AppFixture
} from './helpers';

describe('PrismaPlatformRepository database contract', () => {
  const prisma = createPrismaClient();
  const appPrisma = createAppDatabaseClient();
  let primary: AppFixture | undefined;
  let foreign: AppFixture | undefined;

  beforeAll(async () => {
    primary = await createAppFixture(prisma);
    foreign = await createAppFixture(prisma);
  });

  afterAll(async () => {
    await primary?.cleanup();
    await foreign?.cleanup();
    await prisma.$disconnect();
    await appPrisma?.$disconnect();
  });

  function fixtures(): { primary: AppFixture; foreign: AppFixture } {
    if (primary === undefined || foreign === undefined) {
      throw new Error('Database fixtures are not initialized');
    }
    return { primary, foreign };
  }

  it('rejects writes against apps owned by another organization', async () => {
    const { primary: owner, foreign: other } = fixtures();
    const repository = new PrismaPlatformRepository(prisma);

    await expect(
      repository.createVersion({
        orgId: other.organizationId,
        appId: owner.appId,
        versionNumber: 2,
        schemaVersion: '1.0',
        definition: {},
        checksum: `checksum-${randomUUID()}`,
        createdByUserId: owner.actor.userId
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const version = await repository.createVersion({
      orgId: owner.organizationId,
      appId: owner.appId,
      versionNumber: 2,
      schemaVersion: '1.0',
      definition: {},
      checksum: `checksum-${randomUUID()}`,
      createdByUserId: owner.actor.userId
    });

    await expect(
      repository.saveProposal({
        orgId: other.organizationId,
        appId: owner.appId,
        baseVersionId: version.id,
        operations: [],
        status: 'DRAFT',
        riskLevel: 'LOW',
        createdByUserId: owner.actor.userId
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(
      repository.createRelease({
        orgId: other.organizationId,
        appId: owner.appId,
        appVersionId: version.id,
        environment: 'DEVELOPMENT',
        releaseNumber: 1,
        status: 'PUBLISHED',
        publishedByUserId: owner.actor.userId
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(
      repository.getCurrentRelease(other.organizationId, owner.appId, 'DEVELOPMENT')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(repository.listReleases(other.organizationId, owner.appId)).rejects.toMatchObject({
      code: 'NOT_FOUND'
    });
    await expect(
      repository.createDataRecord({
        orgId: other.organizationId,
        appId: owner.appId,
        key: `foreign-${randomUUID()}`,
        value: {}
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.skipIf(appPrisma === undefined)(
    'enforces organization, app, and environment RLS scopes',
    async () => {
      if (appPrisma === undefined) {
        throw new Error('DATABASE_URL_TEST_APP is required for RLS verification');
      }
      const { primary: owner, foreign: other } = fixtures();
      const store = new PrismaDataStore(appPrisma);
      const primaryRecord = makeDataRecord(owner, 'development', { owner: 'primary' });
      const foreignRecord = makeDataRecord(other, 'development', { owner: 'foreign' });
      await store.createRecord(primaryRecord);
      await store.createRecord(foreignRecord);

      async function visibleOwners(
        organizationId: string | undefined,
        appId: string | undefined,
        environment: string | undefined
      ): Promise<Array<string | null>> {
        return appPrisma.$transaction(async (tx) => {
          if (organizationId !== undefined) {
            await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
          }
          if (appId !== undefined) {
            await tx.$executeRaw`SELECT set_config('app.current_app_id', ${appId}, true)`;
          }
          if (environment !== undefined) {
            await tx.$executeRaw`SELECT set_config('app.current_environment', ${environment}, true)`;
          }
          const rows = await tx.$queryRaw<Array<{ owner: string | null }>>`
          SELECT "values"->>'owner' AS owner FROM "AppDataRecord" ORDER BY "values"->>'owner'
        `;
          return rows.map((row) => row.owner);
        });
      }

      expect(await visibleOwners(owner.organizationId, owner.appId, 'development')).toEqual([
        'primary'
      ]);
      expect(await visibleOwners(owner.organizationId, other.appId, 'development')).toEqual([]);
      expect(await visibleOwners(owner.organizationId, owner.appId, 'production')).toEqual([]);
      expect(await visibleOwners(undefined, undefined, undefined)).toEqual([]);
    }
  );
});
