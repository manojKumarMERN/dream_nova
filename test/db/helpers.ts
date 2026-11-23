import { randomUUID } from 'node:crypto';
import type { Actor } from '@nova/auth';
import { Prisma, PrismaClient } from '@nova/db';
import { createDefaultDataPermissions, type DataRecord } from '@nova/data-engine';
import { createMinimalAppDefinition } from '@nova/spec';

export const MODEL_ID = '11111111-1111-4111-8111-111111111111';
export const TITLE_FIELD_ID = '22222222-2222-4222-8222-222222222222';
export const EMAIL_FIELD_ID = '33333333-3333-4333-8333-333333333333';
export const DONE_FIELD_ID = '44444444-4444-4444-8444-444444444444';

export const OWNER: Actor = {
  organizationId: 'db-owner-org',
  userId: 'db-owner-user',
  role: 'OWNER',
  actorType: 'USER'
};

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL_TEST is not available in the database test worker');
  }
  return url;
}

export function createPrismaClient(url = getDatabaseUrl()): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } } });
}

export function createAppDatabaseClient(): PrismaClient | undefined {
  const url = process.env.DATABASE_URL_TEST_APP;
  return url === undefined || url === '' ? undefined : createPrismaClient(url);
}

export function makeDataDefinition() {
  return {
    ...createMinimalAppDefinition(),
    dataModels: [
      {
        id: MODEL_ID,
        name: 'task',
        relations: {},
        fields: [
          {
            id: TITLE_FIELD_ID,
            name: 'title',
            type: 'string' as const,
            required: true,
            unique: false
          },
          {
            id: EMAIL_FIELD_ID,
            name: 'email',
            type: 'email' as const,
            required: true,
            unique: true
          },
          {
            id: DONE_FIELD_ID,
            name: 'done',
            type: 'boolean' as const,
            required: false,
            unique: false,
            defaultValue: false
          }
        ]
      }
    ],
    dataPermissions: createDefaultDataPermissions(MODEL_ID)
  };
}

export interface AppFixture {
  organizationId: string;
  appId: string;
  versionId: string;
  actor: Actor;
  foreignActor: Actor;
  definition: ReturnType<typeof makeDataDefinition>;
  cleanup(): Promise<void>;
}

export async function createAppFixture(prisma: PrismaClient): Promise<AppFixture> {
  const suffix = randomUUID();
  const organizationId = `db-org-${suffix}`;
  const appId = `db-app-${suffix}`;
  const versionId = `db-version-${suffix}`;
  const actor: Actor = { ...OWNER, organizationId };
  const definition = makeDataDefinition();

  await prisma.organization.create({
    data: { id: organizationId, name: 'Database Verification Org', slug: `db-org-${suffix}` }
  });
  await prisma.app.create({
    data: {
      id: appId,
      organizationId,
      name: 'Database Verification App',
      slug: `db-app-${suffix}`,
      createdByUserId: actor.userId
    }
  });
  await prisma.appVersion.create({
    data: {
      id: versionId,
      appId,
      versionNumber: 1,
      schemaVersion: '1.0',
      definition: definition as unknown as Prisma.InputJsonValue,
      checksum: `db-checksum-${suffix}`,
      createdByUserId: actor.userId
    }
  });

  return {
    organizationId,
    appId,
    versionId,
    actor,
    foreignActor: { ...actor, organizationId: `db-foreign-${suffix}` },
    definition,
    async cleanup() {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.current_app_id', ${appId}, true)`;
        for (const environment of ['development', 'preview', 'production'] as const) {
          await tx.$executeRaw`SELECT set_config('app.current_environment', ${environment}, true)`;
          await tx.appDataRecord.deleteMany({ where: { organizationId, appId, environment } });
          await tx.appDataSchema.deleteMany({ where: { organizationId, appId, environment } });
          await tx.appDataMigration.deleteMany({ where: { organizationId, appId, environment } });
        }
      });
      await prisma.app.deleteMany({ where: { id: appId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
  };
}

export function makeDataRecord(
  fixture: AppFixture,
  environment: 'development' | 'preview' | 'production',
  values: Record<string, unknown>
): DataRecord {
  const timestamp = new Date().toISOString();
  return {
    id: randomUUID(),
    organizationId: fixture.organizationId,
    appId: fixture.appId,
    environment,
    modelId: MODEL_ID,
    values,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: fixture.actor.userId,
    updatedBy: fixture.actor.userId
  };
}
