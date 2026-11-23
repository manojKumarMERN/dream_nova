import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ComponentContract } from '@nova/contracts';
import { PrismaDataStore, PrismaPlatformRepository } from '@nova/backend-adapters';
import {
  MemoryNavigationAdapter,
  createRuntimeEngine,
  type RuntimeDataAccess
} from '@nova/runtime-core';
import { DataService } from '../../apps/api/src/platform/data.service';
import { createAppFixture, createPrismaClient, type AppFixture } from './helpers';

function contract(type: string, renderer: string): ComponentContract {
  return {
    type,
    version: '1.0.0',
    displayName: type,
    category: 'display',
    propsSchema: { type: 'object' },
    defaults: {},
    events: {},
    slots: {},
    capabilities: [],
    supportedTargets: ['web'],
    renderers: { web: renderer },
    constraints: {},
    migrations: []
  };
}

const CONTRACTS: readonly ComponentContract[] = [
  contract('nova.stack', 'nova-web/stack'),
  contract('nova.text', 'nova-web/text'),
  contract('nova.text-input', 'nova-web/text-input'),
  contract('nova.button', 'nova-web/button'),
  contract('nova.form', 'nova-web/form')
];

describe('runtime data action against PostgreSQL', () => {
  const prisma = createPrismaClient();
  let fixture: AppFixture | undefined;

  beforeAll(async () => {
    fixture = await createAppFixture(prisma);
  });

  afterAll(async () => {
    await fixture?.cleanup();
    await prisma.$disconnect();
  });

  it('executes queryData through DataService and PrismaDataStore', async () => {
    if (fixture === undefined) {
      throw new Error('Database fixtures are not initialized');
    }
    const app = fixture;
    const data = new DataService(new PrismaPlatformRepository(prisma), new PrismaDataStore(prisma));
    await data.createRecord(app.actor, app.appId, 'task', 'development', {
      title: 'Runtime to database',
      email: 'runtime@example.com'
    });

    const dataAccess: RuntimeDataAccess = {
      async query(params) {
        return data.query(app.actor, app.appId, String(params['model']), 'development', {
          ...(params['filters'] === undefined ? {} : { filters: params['filters'] as never }),
          ...(params['sort'] === undefined ? {} : { sort: params['sort'] as never }),
          ...(params['page'] === undefined ? {} : { page: Number(params['page']) }),
          ...(params['pageSize'] === undefined ? {} : { pageSize: Number(params['pageSize']) }),
          ...(params['fields'] === undefined ? {} : { fields: params['fields'] as string[] }),
          ...(params['expand'] === undefined ? {} : { expand: params['expand'] as string[] })
        });
      },
      async create(params) {
        return data.createRecord(
          app.actor,
          app.appId,
          String(params['model']),
          'development',
          (params['values'] ?? {}) as Record<string, unknown>
        );
      },
      async update(params) {
        return data.updateRecord(
          app.actor,
          app.appId,
          String(params['model']),
          String(params['recordId']),
          'development',
          (params['values'] ?? {}) as Record<string, unknown>
        );
      },
      async delete(params) {
        await data.deleteRecord(
          app.actor,
          app.appId,
          String(params['model']),
          String(params['recordId']),
          'development'
        );
        return { id: String(params['recordId']), deleted: true };
      }
    };

    const definition = app.definition;
    const root = definition.components[0];
    if (root === undefined) {
      throw new Error('Fixture definition has no root component');
    }
    root.events = {
      click: { action: 'queryData', params: { model: 'task', path: 'data.tasks' } }
    };

    const engine = createRuntimeEngine(definition as never, {
      contracts: CONTRACTS,
      navigation: new MemoryNavigationAdapter('/'),
      dataAccess
    });
    try {
      engine.handleEvent({ nodeId: root.id, event: 'click', payload: {} });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const current = engine.getSnapshot().app.data;
        if (current !== undefined && 'tasks' in current) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const runtimeData = engine.getSnapshot().app.data as
        Record<string, { rows?: Array<Record<string, unknown>> }> | undefined;
      expect(runtimeData?.['tasks']?.rows?.length ?? 0).toBeGreaterThan(0);
      expect(runtimeData?.['tasks']?.rows?.[0]?.['title']).toBe('Runtime to database');
    } finally {
      engine.dispose();
    }
  });
});
