import { describe, expect, it } from 'vitest';
import {
  appDefinitionSchema,
  createMinimalAppDefinition,
  getAppDefinitionJsonSchema,
  migrateDefinition
} from '../src/index';

describe('appDefinitionSchema', () => {
  it('accepts the minimal fixture', () => {
    const definition = createMinimalAppDefinition();

    expect(appDefinitionSchema.parse(definition)).toEqual(definition);
  });

  it('rejects an unsupported schema version', () => {
    const definition = createMinimalAppDefinition();

    expect(() => appDefinitionSchema.parse({ ...definition, schemaVersion: '2.0' })).toThrow();
  });

  it('requires a region for NOVA-managed deployments', () => {
    const definition = createMinimalAppDefinition();
    const deployment = { ...definition.deployment };
    delete deployment.region;

    expect(() => appDefinitionSchema.parse({ ...definition, deployment })).toThrow(
      'Region is required for NOVA-managed deployments'
    );
  });

  it('rejects secrets in integration config', () => {
    const definition = createMinimalAppDefinition();

    expect(() =>
      appDefinitionSchema.parse({
        ...definition,
        integrations: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            providerKey: 'postgres',
            config: { apiKey: 'do-not-store' }
          }
        ]
      })
    ).toThrow('Integration config cannot contain secrets');
  });

  it('generates a JSON schema for tooling', () => {
    const schema = getAppDefinitionJsonSchema();

    expect(Object.keys(schema).length).toBeGreaterThan(0);
  });
});

describe('migrateDefinition', () => {
  it('validates current-version definitions', () => {
    const definition = createMinimalAppDefinition();

    expect(migrateDefinition(definition)).toEqual(definition);
  });

  it('rejects definitions without a migration path', () => {
    const definition = createMinimalAppDefinition();

    expect(() => migrateDefinition({ ...definition, schemaVersion: '0.9' })).toThrow(
      'No compatible specification migration found'
    );
  });
});
