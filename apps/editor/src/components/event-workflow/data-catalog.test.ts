import { createMinimalAppDefinition } from '@nova/spec';
import type { AppDefinition } from '@nova/spec';
import { describe, expect, it } from 'vitest';
import { discoverWorkflowData } from './data-catalog';

const MODEL_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const QUERY_ID = '33333333-3333-4333-8333-333333333333';
const MISSING_QUERY_ID = '44444444-4444-4444-8444-444444444444';
const INTEGRATION_ID = '55555555-5555-4555-8555-555555555555';
const SECRET = 'sk-should-never-appear';

function definitionWithData(): AppDefinition {
  const definition = createMinimalAppDefinition();
  definition.dataModels = [
    {
      id: MODEL_ID,
      name: 'Customer',
      displayName: 'Customer records',
      fields: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
          name: 'customerId',
          type: 'uuid',
          required: true,
          unique: false
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
          name: 'email',
          type: 'email',
          required: false,
          unique: false
        }
      ],
      relations: {}
    }
  ];
  definition.dataSources = [
    {
      id: SOURCE_ID,
      name: 'Nova Data',
      provider: 'nova-data',
      environment: 'development',
      modelId: MODEL_ID,
      options: { apiKey: SECRET, endpoint: 'https://example.invalid' }
    }
  ];
  definition.queries = [
    {
      id: QUERY_ID,
      name: 'Get customer',
      modelId: MODEL_ID,
      sourceId: SOURCE_ID,
      fields: ['customerId', 'email'],
      sort: [{ field: 'email', direction: 'asc' }],
      pageSize: 1
    },
    {
      id: MISSING_QUERY_ID,
      name: 'Broken query',
      modelId: '66666666-6666-4666-8666-666666666666',
      sourceId: '77777777-7777-4777-8777-777777777777'
    }
  ];
  definition.integrations = [
    {
      id: INTEGRATION_ID,
      providerKey: 'external-rest',
      config: {},
      secretRef: SECRET
    }
  ];
  return definition;
}

describe('workflow data discovery', () => {
  it('handles empty and missing definitions safely', () => {
    const catalog = discoverWorkflowData(createMinimalAppDefinition());

    expect(catalog.dataModels).toEqual([]);
    expect(catalog.dataSources).toEqual([]);
    expect(catalog.queries).toEqual([]);
    expect(catalog.issues).toEqual([]);
    expect(catalog.externalConnectorsAvailable).toBe(false);
  });

  it('discovers NOVA-managed data without exposing secrets', () => {
    const catalog = discoverWorkflowData(definitionWithData());
    const serialized = JSON.stringify(catalog);

    expect(catalog.dataModels[0]).toMatchObject({ id: MODEL_ID, name: 'Customer' });
    expect(catalog.dataSources[0]).toMatchObject({
      id: SOURCE_ID,
      name: 'Nova Data',
      provider: 'nova-data',
      environment: 'development',
      modelId: MODEL_ID,
      modelName: 'Customer records'
    });
    expect(catalog.queries[0]).toMatchObject({
      id: QUERY_ID,
      name: 'Get customer',
      modelId: MODEL_ID,
      sourceId: SOURCE_ID,
      operation: 'query',
      kind: 'read',
      fields: ['customerId', 'email'],
      pageSize: 1
    });
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('endpoint');
    expect(serialized).not.toContain('secretRef');
  });

  it('reports missing references without inventing operations', () => {
    const catalog = discoverWorkflowData(definitionWithData());

    expect(catalog.issues).toEqual([
      expect.objectContaining({
        code: 'MISSING_MODEL',
        path: `queries[${MISSING_QUERY_ID}].modelId`
      }),
      expect.objectContaining({
        code: 'MISSING_SOURCE',
        path: `queries[${MISSING_QUERY_ID}].sourceId`
      })
    ]);
    expect(catalog.externalConnectorsMessage).toContain('not available');
  });
});
