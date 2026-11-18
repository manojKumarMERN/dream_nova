import { describe, expect, it } from 'vitest';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { ComponentContract } from '@nova/contracts';
import { BUILT_IN_COMPONENT_CONTRACTS, createComponentRegistry } from '../src/index';

describe('createComponentRegistry', () => {
  it('gets an exact contract version', () => {
    const registry = createComponentRegistry(BUILT_IN_COMPONENT_CONTRACTS);

    const contract = registry.get('nova.text', '1.0.0');

    expect(contract?.displayName).toBe('Text');
  });

  it('gets the latest contract version when no version is provided', () => {
    const earlier: ComponentContract = {
      ...(BUILT_IN_COMPONENT_CONTRACTS[1] as ComponentContract),
      version: '1.0.0'
    };
    const later: ComponentContract = {
      ...(BUILT_IN_COMPONENT_CONTRACTS[1] as ComponentContract),
      version: '1.1.0'
    };
    const registry = createComponentRegistry([earlier, later]);

    expect(registry.get('nova.text')?.version).toBe('1.1.0');
  });

  it('lists contracts by type', () => {
    const registry = createComponentRegistry(BUILT_IN_COMPONENT_CONTRACTS);

    expect(registry.list({ type: 'nova.button' })).toHaveLength(1);
    expect(registry.has('nova.unknown')).toBe(false);
  });

  it('rejects duplicate type and version pairs', () => {
    const contract = BUILT_IN_COMPONENT_CONTRACTS[0] as ComponentContract;

    try {
      createComponentRegistry([contract, contract]);
      throw new Error('Expected duplicate contract to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(NovaError);
      expect((error as NovaError).code).toBe(NovaErrorCodes.CONFLICT);
    }
  });
});
