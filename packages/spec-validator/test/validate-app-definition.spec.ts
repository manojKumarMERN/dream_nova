import { describe, expect, it } from 'vitest';
import { createMinimalAppDefinition, type AppDefinition } from '@nova/spec';
import { validateAppDefinition } from '../src/index';

function cloneDefinition(): AppDefinition {
  return structuredClone(createMinimalAppDefinition());
}

function errorCodes(definition: AppDefinition): string[] {
  return validateAppDefinition(definition)
    .issues.filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code);
}

describe('validateAppDefinition', () => {
  it('accepts the minimal fixture', () => {
    const result = validateAppDefinition(createMinimalAppDefinition());

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects unknown component contracts', () => {
    const definition = cloneDefinition();
    const root = definition.components[0];
    if (root?.children?.[1] === undefined) {
      throw new Error('Fixture is missing the button node');
    }
    root.children[1].type = 'nova.unknown';

    expect(errorCodes(definition)).toContain('UNKNOWN_COMPONENT_CONTRACT');
  });

  it('rejects props that do not match the contract schema', () => {
    const definition = cloneDefinition();
    const root = definition.components[0];
    if (root?.children?.[1] === undefined) {
      throw new Error('Fixture is missing the button node');
    }
    root.children[1].props['label'] = '';

    expect(errorCodes(definition)).toContain('INVALID_COMPONENT_PROPS');
  });

  it('rejects duplicate node ids', () => {
    const definition = cloneDefinition();
    const root = definition.components[0];
    if (root?.children?.[0] === undefined || root.children[1] === undefined) {
      throw new Error('Fixture is missing child nodes');
    }
    root.children[1].id = root.children[0].id;

    expect(errorCodes(definition)).toContain('DUPLICATE_NODE_ID');
  });

  it('rejects platforms that registered contracts do not support', () => {
    const definition = cloneDefinition();
    definition.targets = ['android'];

    expect(errorCodes(definition)).toContain('INCOMPATIBLE_TARGET');
  });

  it('rejects orphan components', () => {
    const definition = cloneDefinition();
    definition.components.push({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      type: 'nova.text',
      contractVersion: '1.0.0',
      props: {
        content: 'Orphan'
      }
    });

    expect(errorCodes(definition)).toContain('ORPHAN_COMPONENT');
  });
});
