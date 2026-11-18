import { describe, expect, it } from 'vitest';
import { createMinimalAppDefinition } from '@nova/spec';
import { HealthController } from '../src/health/health.controller';
import { RegistryController } from '../src/registry/registry.controller';
import { ValidationController } from '../src/validation/validation.controller';

describe('control-plane controllers', () => {
  it('returns real liveness data', () => {
    const result = new HealthController().live();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('nova-api');
    expect(typeof result.uptimeSeconds).toBe('number');
  });

  it('lists built-in component contracts', () => {
    const components = new RegistryController().list();

    expect(components.some((component) => component.type === 'nova.text')).toBe(true);
    expect(components.every((component) => component.version === '1.0.0')).toBe(true);
  });

  it('validates an application definition', () => {
    const result = new ValidationController().validate({
      definition: createMinimalAppDefinition()
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
