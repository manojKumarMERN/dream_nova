import { describe, expect, it } from 'vitest';
import { createFormValidationAppDefinition } from '@nova/spec';
import { validateAppDefinition } from '../src/index';

describe('FORM_VALIDATION fixture', () => {
  it('is a valid NOVA app definition', () => {
    const result = validateAppDefinition(createFormValidationAppDefinition());

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('defines login and home routes', () => {
    const definition = createFormValidationAppDefinition();

    expect(definition.name).toBe('FORM_VALIDATION');
    expect(definition.pages.map((page) => page.route)).toEqual(['/login', '/home']);
  });
});
