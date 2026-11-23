import { describe, expect, it } from 'vitest';
import { TemplateProposalGenerator } from '@nova/ai-core';
import type { Actor } from '@nova/auth';
import { InMemoryDataStore, InMemoryPlatformRepository } from '@nova/backend-adapters';
import { createDefaultDataPermissions } from '@nova/data-engine';
import { createMinimalAppDefinition } from '@nova/spec';
import { DataService } from '../src/platform/data.service';
import { PlatformService } from '../src/platform/platform.service';

const MODEL_ID = '11111111-1111-4111-8111-111111111111';
const TITLE_FIELD_ID = '22222222-2222-4222-8222-222222222222';
const EMAIL_FIELD_ID = '33333333-3333-4333-8333-333333333333';
const DONE_FIELD_ID = '44444444-4444-4444-8444-444444444444';

const owner: Actor = {
  organizationId: 'org-1',
  userId: 'user-1',
  role: 'OWNER',
  actorType: 'USER'
};

function dataDefinition() {
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

function makeServices() {
  const repository = new InMemoryPlatformRepository();
  const store = new InMemoryDataStore();
  return {
    platform: new PlatformService(repository, new TemplateProposalGenerator()),
    data: new DataService(repository, store)
  };
}

describe('DataService', () => {
  it('performs CRUD against the latest app version', async () => {
    const { platform, data } = makeServices();
    const app = await platform.createApp(owner, {
      orgId: owner.organizationId,
      name: 'Data App',
      definition: dataDefinition()
    });

    const created = await data.createRecord(owner, app.id, 'task', 'development', {
      title: 'Write tests',
      email: 'tests@example.com'
    });
    expect(created.id).toBeTruthy();
    expect(created.done).toBe(false);

    const queried = await data.query(owner, app.id, 'task', 'development', {
      filters: {
        id: '55555555-5555-4555-8555-555555555555',
        operator: 'and',
        conditions: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            field: 'title',
            operator: 'eq',
            value: 'Write tests'
          }
        ]
      },
      page: 1,
      pageSize: 10
    });
    expect(queried.total).toBe(1);

    const updated = await data.updateRecord(
      owner,
      app.id,
      'task',
      created.id as string,
      'development',
      {
        done: true
      }
    );
    expect(updated.done).toBe(true);
    await data.deleteRecord(owner, app.id, 'task', created.id as string, 'development');
    await expect(
      data.getRecord(owner, app.id, 'task', created.id as string, 'development')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('isolates apps by organization and enforces data roles', async () => {
    const { platform, data } = makeServices();
    const app = await platform.createApp(owner, {
      orgId: owner.organizationId,
      name: 'Scoped Data App',
      definition: dataDefinition()
    });
    const other: Actor = { ...owner, organizationId: 'org-2' };
    await expect(
      data.createRecord(other, app.id, 'task', 'development', {
        title: 'Denied',
        email: 'denied@example.com'
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const viewer: Actor = { ...owner, role: 'VIEWER' };
    await expect(
      data.createRecord(viewer, app.id, 'task', 'development', {
        title: 'Denied',
        email: 'denied@example.com'
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await data.query(viewer, app.id, 'task', 'development', {})).toMatchObject({ total: 0 });
  });
});
