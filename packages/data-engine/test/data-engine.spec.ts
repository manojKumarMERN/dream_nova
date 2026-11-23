import { describe, expect, it } from 'vitest';
import { InMemoryDataStore } from '@nova/backend-adapters';
import type { DataModelDefinition } from '@nova/spec';
import { createDataEngine, createDefaultDataPermissions } from '../src';

const model: DataModelDefinition = {
  id: 'task',
  name: 'task',
  relations: {},
  fields: [
    { id: 'f-title', name: 'title', type: 'string', required: true, unique: false },
    { id: 'f-email', name: 'email', type: 'email', required: true, unique: true },
    {
      id: 'f-done',
      name: 'done',
      type: 'boolean',
      required: false,
      unique: false,
      defaultValue: false
    },
    { id: 'f-priority', name: 'priority', type: 'integer', required: false, unique: false }
  ]
};

const owner = {
  userId: 'user-1',
  organizationId: 'org-1',
  roles: ['owner']
};

const viewer = {
  userId: 'user-2',
  organizationId: 'org-1',
  roles: ['viewer']
};

function createEngine() {
  return createDataEngine({
    appId: 'app-1',
    definitionOrganizationId: 'org-1',
    definition: {
      dataModels: [model],
      dataPermissions: createDefaultDataPermissions('task')
    },
    store: new InMemoryDataStore(),
    environment: 'development'
  });
}

describe('data engine', () => {
  it('creates, queries, updates and deletes records', async () => {
    const engine = createEngine();
    const first = await engine.create(owner, 'task', {
      title: 'First',
      email: 'first@example.com'
    });
    const second = await engine.create(owner, 'task', {
      title: 'Second',
      email: 'second@example.com',
      priority: 5
    });

    expect(first.done).toBe(false);
    expect(first.id).toBeTruthy();

    const result = await engine.list(owner, {
      modelId: 'task',
      filters: {
        operator: 'and',
        conditions: [{ field: 'title', operator: 'contains', value: 'ir' }]
      },
      sort: [{ field: 'priority', direction: 'desc' }],
      page: 1,
      pageSize: 10
    });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.title).toBe('First');

    const updated = await engine.update(owner, 'task', second.id as string, { done: true });
    expect(updated.done).toBe(true);
    await engine.delete(owner, 'task', first.id as string);
    await expect(engine.get(owner, 'task', first.id as string)).rejects.toMatchObject({
      code: 'NOT_FOUND'
    });
  });

  it('validates values and enforces unique fields', async () => {
    const engine = createEngine();
    await expect(engine.create(owner, 'task', { email: 'a@example.com' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED'
    });
    await engine.create(owner, 'task', { title: 'One', email: 'one@example.com' });
    await expect(
      engine.create(owner, 'task', { title: 'Two', email: 'one@example.com' })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('enforces data permissions and tenant scope', async () => {
    const engine = createEngine();
    await expect(
      engine.create(viewer, 'task', { title: 'Denied', email: 'denied@example.com' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      engine.create({ ...owner, organizationId: 'org-2' }, 'task', {
        title: 'Other',
        email: 'other@example.com'
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('plans and applies a schema migration', async () => {
    const engine = createEngine();
    const initial = await engine.migrationStatus(owner);
    expect(initial.plan.operations[0]?.type).toBe('create-model');
    expect(initial.plan.destructive).toBe(false);

    await engine.applyMigration(owner);
    const applied = await engine.migrationStatus(owner);
    expect(applied.current?.version).toBe(initial.plan.toVersion);
    expect(applied.plan.operations).toEqual([]);
    expect(applied.history).toHaveLength(1);
    expect(applied.history[0]?.status).toBe('applied');
  });
});
