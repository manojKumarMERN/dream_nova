import { describe, expect, it } from 'vitest';
import { componentContractSchema } from '@nova/contracts';
import {
  BUILDER_COMPONENT_CONTRACTS,
  BUILT_IN_COMPONENT_CONTRACTS,
  builtInComponentRegistry,
  createComponentRegistry
} from '../src/index';

const EXPECTED_TYPES = [
  'nova.container',
  'nova.row',
  'nova.column',
  'nova.grid',
  'nova.section',
  'nova.tabs',
  'nova.heading',
  'nova.image',
  'nova.icon',
  'nova.divider',
  'nova.card',
  'nova.badge',
  'nova.textarea',
  'nova.number-input',
  'nova.email-input',
  'nova.password-input',
  'nova.select',
  'nova.checkbox',
  'nova.radio-group',
  'nova.date-picker',
  'nova.file-upload',
  'nova.link',
  'nova.dropdown',
  'nova.menu',
  'nova.data-table',
  'nova.list',
  'nova.chart',
  'nova.statistics-card',
  'nova.data-grid',
  'nova.navbar',
  'nova.sidebar',
  'nova.breadcrumb',
  'nova.pagination',
  'nova.modal',
  'nova.dialog',
  'nova.drawer',
  'nova.toast',
  'nova.alert',
  'nova.tooltip'
] as const;

describe('visual builder component contracts', () => {
  it('registers every required component', () => {
    for (const type of EXPECTED_TYPES) {
      expect(builtInComponentRegistry.has(type)).toBe(true);
      expect(builtInComponentRegistry.get(type)?.version).toBe('1.0.0');
    }
  });

  it('keeps every contract valid and unique', () => {
    const keys = new Set<string>();

    for (const contract of BUILT_IN_COMPONENT_CONTRACTS) {
      const key = `${contract.type}@${contract.version}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      expect(componentContractSchema.safeParse(contract).success).toBe(true);
      expect(contract.migrations).toEqual([]);
      expect(contract.supportedTargets).toEqual(['web']);
    }
  });

  it('provides inspector, events, renderers and satisfying defaults', () => {
    for (const contract of BUILDER_COMPONENT_CONTRACTS) {
      expect(contract.renderers.web).toBe(`nova-web/${contract.type.slice('nova.'.length)}`);
      expect(contract.inspector?.groups.map((group) => group.id)).toEqual([
        'content',
        'appearance',
        'layout',
        'behavior'
      ]);
      expect(
        Object.values(contract.events).every((entry) => entry.payloadSchema !== undefined)
      ).toBe(true);
      expect(contract.propsSchema['additionalProperties']).toBe(false);

      const required = (contract.propsSchema['required'] as string[] | undefined) ?? [];
      for (const key of required) {
        expect(contract.defaults[key]).toBeDefined();
      }
    }
  });

  it('marks layout components as resizable', () => {
    const layoutContracts = BUILDER_COMPONENT_CONTRACTS.filter(
      (contract) => contract.category === 'layout'
    );

    expect(layoutContracts).toHaveLength(6);
    for (const contract of layoutContracts) {
      expect(contract.resize?.enabled).toBe(true);
    }

    expect(createComponentRegistry(BUILT_IN_COMPONENT_CONTRACTS).list()).toHaveLength(44);
  });
});
