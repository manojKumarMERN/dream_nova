import { describe, expect, it } from 'vitest';
import { NovaClient } from '../src/index';

interface Call {
  url: string;
  init: RequestInit;
}

function mockClient(handler: (call: Call) => unknown): { client: NovaClient; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    const body = handler(call);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  return {
    client: new NovaClient({ baseUrl: 'http://localhost:3000/api', fetch: fetchImpl }),
    calls
  };
}

describe('NovaClient platform methods', () => {
  it('creates and reopens apps and versions', async () => {
    const app = {
      id: 'app-1',
      organizationId: 'org-1',
      name: 'App',
      slug: 'app',
      status: 'DRAFT',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    const version = {
      id: 'version-1',
      appId: 'app-1',
      versionNumber: 1,
      schemaVersion: '1.0',
      definition: { schemaVersion: '1.0' },
      checksum: 'abc',
      createdByUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    const { client, calls } = mockClient((call) => {
      if (call.url.includes('/versions')) {
        return call.url.endsWith('/versions') && call.init.method !== 'POST' ? [version] : version;
      }
      if (call.init.method === 'POST') {
        return app;
      }
      return call.url.includes('?') ? [app] : app;
    });

    const created = await client.createApp({
      orgId: 'org-1',
      name: 'App',
      definition: { schemaVersion: '1.0' }
    });
    const reopened = await client.getApp('app-1');
    const createdVersion = await client.createVersion('app-1', {
      definition: { schemaVersion: '1.0' },
      changeSummary: 'Editor save'
    });
    const listed = await client.listApps('org-1');
    const versions = await client.listVersions('app-1');
    const fetchedVersion = await client.getVersion('version-1');

    expect(created).toEqual(app);
    expect(reopened).toEqual(app);
    expect(createdVersion).toEqual(version);
    expect(listed).toEqual([app]);
    expect(versions).toEqual([version]);
    expect(fetchedVersion).toEqual(version);
    expect(calls.map((call) => call.url)).toEqual([
      'http://localhost:3000/api/v1/apps',
      'http://localhost:3000/api/v1/apps/app-1',
      'http://localhost:3000/api/v1/apps/app-1/versions',
      'http://localhost:3000/api/v1/apps?orgId=org-1',
      'http://localhost:3000/api/v1/apps/app-1/versions',
      'http://localhost:3000/api/v1/versions/version-1'
    ]);
    expect(JSON.parse(String(calls[2]?.init.body))).toEqual({
      definition: { schemaVersion: '1.0' },
      changeSummary: 'Editor save'
    });
  });

  it('validates, applies, publishes and loads runtime payloads', async () => {
    const { client, calls } = mockClient((call) => {
      if (call.url.endsWith('/validate')) {
        return { valid: true, issues: [], riskLevel: 'LOW', definition: {} };
      }
      if (call.url.endsWith('/apply')) {
        return {
          version: { id: 'version-2' },
          validation: { valid: true, issues: [] },
          riskLevel: 'LOW',
          definition: {}
        };
      }
      if (call.url.endsWith('/publish')) {
        return { id: 'release-1', environment: 'production' };
      }
      return { schemaVersion: '1.0', name: 'App' };
    });

    await client.validateProposal({ baseVersionId: 'v1', proposal: { op: 'noop' } });
    await client.applyProposal('app-1', {
      baseVersionId: 'v1',
      proposal: { op: 'noop' },
      approved: true
    });
    await client.publish('app-1', { versionId: 'version-2', environment: 'production' });
    await client.getRuntime('app', 'production');

    expect(calls.map((call) => call.url)).toEqual([
      'http://localhost:3000/api/v1/proposals/validate',
      'http://localhost:3000/api/v1/apps/app-1/proposals/apply',
      'http://localhost:3000/api/v1/apps/app-1/publish',
      'http://localhost:3000/api/runtime/v1/apps/app/releases/current?environment=production'
    ]);
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      baseVersionId: 'v1',
      proposal: { op: 'noop' },
      approved: true
    });
  });

  it('loads full contracts and generates AI proposals', async () => {
    const { client, calls } = mockClient((call) =>
      call.url.endsWith('/full')
        ? [{ type: 'nova.text', version: '1.0.0' }]
        : { summary: 'add text' }
    );

    expect(await client.listComponentContracts()).toEqual([
      { type: 'nova.text', version: '1.0.0' }
    ]);
    expect(
      await client.generateAiProposal('app-1', {
        instruction: 'add text',
        pageName: 'Home',
        selectedNodeIds: ['node-1']
      })
    ).toEqual({ summary: 'add text' });
    expect(calls.map((call) => call.url)).toEqual([
      'http://localhost:3000/api/v1/registry/components/full',
      'http://localhost:3000/api/v1/apps/app-1/ai/proposals'
    ]);
  });
});
