import { describe, expect, it } from 'vitest';
import { createMinimalAppDefinition } from '@nova/spec';
import { generateRedactedPromptContext } from '../src/index';

describe('generateRedactedPromptContext', () => {
  it('excludes component props, bindings, and integration config from prompts', () => {
    const definition = createMinimalAppDefinition();
    definition.integrations.push({
      id: '11111111-1111-4111-8111-111111111111',
      providerKey: 'postgres',
      config: { schema: 'public' }
    });

    const context = generateRedactedPromptContext(definition);

    expect(context).toEqual({
      appId: definition.appId,
      name: 'Minimal App',
      targets: ['web'],
      pageCount: 1,
      componentTypes: ['nova.stack', 'nova.text', 'nova.button'],
      integrationProviderKeys: ['postgres']
    });
    expect(JSON.stringify(context)).not.toContain('Hello NOVA');
    expect(JSON.stringify(context)).not.toContain('schema');
  });
});
