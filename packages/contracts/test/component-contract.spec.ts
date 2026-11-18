import { describe, expect, it } from 'vitest';
import { componentContractSchema } from '../src/index';

function validContract(): unknown {
  return {
    type: 'nova.text',
    version: '1.0.0',
    displayName: 'Text',
    category: 'display',
    propsSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' }
      }
    },
    defaults: {
      content: ''
    },
    events: {},
    slots: {},
    capabilities: ['text-rendering'],
    supportedTargets: ['web'],
    renderers: {
      web: 'nova-web/text'
    },
    constraints: {},
    migrations: []
  };
}

describe('componentContractSchema', () => {
  it('accepts a valid contract', () => {
    expect(componentContractSchema.parse(validContract())).toMatchObject({
      type: 'nova.text',
      version: '1.0.0'
    });
  });

  it('rejects an unsupported platform target', () => {
    const contract = validContract() as Record<string, unknown>;

    expect(() =>
      componentContractSchema.parse({
        ...contract,
        supportedTargets: ['web', 'quantum']
      })
    ).toThrow();
  });

  it('requires an object props schema', () => {
    const contract = validContract() as Record<string, unknown>;

    expect(() =>
      componentContractSchema.parse({
        ...contract,
        propsSchema: { type: 'string' }
      })
    ).toThrow();
  });
});
