import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaDataStore, PrismaPlatformRepository } from '@nova/backend-adapters';
import { DataService } from '../../apps/api/src/platform/data.service';
import { createAppFixture, createPrismaClient, MODEL_ID, type AppFixture } from './helpers';

describe('Prisma app data persistence', () => {
  const prisma = createPrismaClient();
  let fixture: AppFixture | undefined;
  let service: DataService | undefined;

  beforeAll(async () => {
    fixture = await createAppFixture(prisma);
    service = new DataService(new PrismaPlatformRepository(prisma), new PrismaDataStore(prisma));
  });

  afterAll(async () => {
    await fixture?.cleanup();
    await prisma.$disconnect();
  });

  function context(): { fixture: AppFixture; service: DataService } {
    if (fixture === undefined || service === undefined) {
      throw new Error('Database fixtures are not initialized');
    }
    return { fixture, service };
  }

  it('persists migrations and CRUD operations in PostgreSQL', async () => {
    const { fixture: app, service: data } = context();

    const before = await data.migrationStatus(app.actor, app.appId, 'development');
    expect(before.current).toBeUndefined();
    expect(before.plan.operations.some((operation) => operation.type === 'create-model')).toBe(
      true
    );

    const applied = await data.applyMigration(app.actor, app.appId, 'development', true);
    expect(applied.status).toBe('applied');
    expect(
      await prisma.appDataMigration.count({
        where: {
          organizationId: app.organizationId,
          appId: app.appId,
          environment: 'development',
          status: 'applied'
        }
      })
    ).toBe(1);
    expect(
      await prisma.appDataSchema.count({
        where: {
          organizationId: app.organizationId,
          appId: app.appId,
          environment: 'development',
          modelId: MODEL_ID
        }
      })
    ).toBe(1);

    const created = await data.createRecord(app.actor, app.appId, 'task', 'development', {
      title: 'Verify persistence',
      email: 'persistence@example.com'
    });
    expect(created.done).toBe(false);

    const queried = await data.query(app.actor, app.appId, 'task', 'development', {
      filters: {
        id: 'filter-1',
        operator: 'and',
        conditions: [
          {
            id: 'condition-1',
            field: 'email',
            operator: 'eq',
            value: 'persistence@example.com'
          }
        ]
      }
    });
    expect(queried.total).toBe(1);

    const updated = await data.updateRecord(
      app.actor,
      app.appId,
      'task',
      created.id,
      'development',
      { done: true }
    );
    expect(updated.done).toBe(true);

    await data.deleteRecord(app.actor, app.appId, 'task', created.id, 'development');
    await expect(
      data.getRecord(app.actor, app.appId, 'task', created.id, 'development')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('isolates organizations and environments in persisted records', async () => {
    const { fixture: app, service: data } = context();
    const development = await data.createRecord(app.actor, app.appId, 'task', 'development', {
      title: 'Development only',
      email: 'development@example.com'
    });
    const production = await data.createRecord(app.actor, app.appId, 'task', 'production', {
      title: 'Production only',
      email: 'production@example.com'
    });

    const developmentRows = await data.query(app.actor, app.appId, 'task', 'development', {});
    const productionRows = await data.query(app.actor, app.appId, 'task', 'production', {});
    expect(developmentRows.rows.map((row) => row['id'])).toContain(development.id);
    expect(developmentRows.rows.map((row) => row['id'])).not.toContain(production.id);
    expect(productionRows.rows.map((row) => row['id'])).toContain(production.id);
    expect(productionRows.rows.map((row) => row['id'])).not.toContain(development.id);

    await expect(
      data.createRecord(app.foreignActor, app.appId, 'task', 'development', {
        title: 'Denied',
        email: 'denied@example.com'
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
