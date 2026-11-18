import { describe, expect, it } from 'vitest';
import {
  COMPONENT_CATEGORIES,
  componentContractSchema,
  componentInspectorSchema,
  resizeConstraintsSchema
} from '../src/index';

const inspector = {
  groups: [
    {
      id: 'content',
      label: 'Content',
      fields: [
        {
          path: 'content',
          label: 'Content',
          widget: 'textarea' as const,
          help: 'Body text',
          when: { path: 'variant', equals: 'body' }
        }
      ]
    }
  ]
};

describe('inspector contracts', () => {
  it('includes basic and action categories', () => {
    expect(COMPONENT_CATEGORIES).toContain('basic');
    expect(COMPONENT_CATEGORIES).toContain('action');
  });

  it('validates inspector fields, options and conditions', () => {
    expect(componentInspectorSchema.safeParse(inspector).success).toBe(true);

    const withOptions = {
      groups: [
        {
          id: 'appearance',
          label: 'Appearance',
          fields: [
            {
              path: 'tone',
              label: 'Tone',
              widget: 'select',
              options: [
                { label: 'Info', value: 'info' },
                { label: 'Level', value: 2 },
                { label: 'Enabled', value: true }
              ],
              when: { path: 'visible', exists: true }
            }
          ]
        }
      ]
    };

    expect(componentInspectorSchema.safeParse(withOptions).success).toBe(true);
    expect(
      componentInspectorSchema.safeParse({
        groups: [{ id: 'content', label: 'Content', fields: [] }]
      }).success
    ).toBe(false);
  });

  it('validates resize constraints', () => {
    expect(
      resizeConstraintsSchema.safeParse({
        enabled: true,
        minWidth: 80,
        maxWidth: 640,
        lockAspectRatio: false
      }).success
    ).toBe(true);
    expect(resizeConstraintsSchema.safeParse({ enabled: true, minWidth: -1 }).success).toBe(false);
  });

  it('accepts a contract with visual builder metadata', () => {
    const contract = {
      type: 'nova.container',
      version: '1.0.0',
      displayName: 'Container',
      category: 'layout',
      description: 'A content container',
      icon: 'square',
      propsSchema: { type: 'object', properties: {}, additionalProperties: false },
      defaults: {},
      events: {},
      slots: {},
      capabilities: ['layout'],
      supportedTargets: ['web'],
      renderers: { web: 'nova-web/container' },
      constraints: {},
      migrations: [],
      inspector,
      resize: { enabled: true },
      supportedBreakpoints: ['desktop', 'tablet', 'mobile']
    };

    expect(componentContractSchema.safeParse(contract).success).toBe(true);
    expect(
      componentContractSchema.safeParse({
        ...contract,
        supportedBreakpoints: ['watch']
      }).success
    ).toBe(false);
  });
});
