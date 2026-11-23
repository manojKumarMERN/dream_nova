import type { ComponentContract } from '@nova/contracts';
import { BUILDER_COMPONENT_CONTRACTS } from './builder-contracts';

export const BUILT_IN_COMPONENT_CONTRACTS: readonly ComponentContract[] = [
  {
    type: 'nova.stack',
    version: '1.0.0',
    displayName: 'Stack',
    category: 'layout',
    propsSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['row', 'column'] },
        gap: { type: 'number', minimum: 0 }
      },
      required: ['direction'],
      additionalProperties: false
    },
    defaults: {
      direction: 'column',
      gap: 8
    },
    events: {},
    slots: {
      default: {
        description: 'Child components',
        multiple: true
      }
    },
    capabilities: ['layout', 'nested-children'],
    supportedTargets: ['web'],
    renderers: {
      web: 'nova-web/stack'
    },
    constraints: {
      maxChildren: 100
    },
    migrations: []
  },
  {
    type: 'nova.text',
    version: '1.0.0',
    displayName: 'Text',
    category: 'display',
    propsSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        variant: { type: 'string', enum: ['body', 'heading', 'caption'] }
      },
      required: ['content'],
      additionalProperties: false
    },
    defaults: {
      content: '',
      variant: 'body'
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
  },
  {
    type: 'nova.button',
    version: '1.0.0',
    displayName: 'Button',
    category: 'input',
    propsSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', minLength: 1 },
        disabled: { type: 'boolean' }
      },
      required: ['label'],
      additionalProperties: false
    },
    defaults: {
      label: 'Button',
      disabled: false
    },
    events: {
      click: {
        description: 'Triggered when the button is clicked',
        payloadSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }
    },
    slots: {},
    capabilities: ['interaction'],
    supportedTargets: ['web'],
    renderers: {
      web: 'nova-web/button'
    },
    constraints: {},
    migrations: []
  },
  {
    type: 'nova.text-input',
    version: '1.0.0',
    displayName: 'Text Input',
    category: 'input',
    propsSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        label: { type: 'string', minLength: 1 },
        placeholder: { type: 'string' },
        required: { type: 'boolean' }
      },
      required: ['label'],
      additionalProperties: false
    },
    defaults: {
      label: 'Label',
      placeholder: '',
      required: false
    },
    events: {
      change: {
        description: 'Triggered when the value changes',
        payloadSchema: {
          type: 'object',
          properties: {
            value: { type: 'string' }
          },
          required: ['value']
        }
      }
    },
    slots: {},
    capabilities: ['interaction', 'data-entry'],
    supportedTargets: ['web'],
    renderers: {
      web: 'nova-web/text-input'
    },
    constraints: {},
    migrations: []
  },
  {
    type: 'nova.form',
    version: '1.0.0',
    displayName: 'Form',
    category: 'data',
    propsSchema: {
      type: 'object',
      properties: {
        submitLabel: { type: 'string', minLength: 1 }
      },
      required: ['submitLabel'],
      additionalProperties: false
    },
    defaults: {
      submitLabel: 'Submit'
    },
    events: {
      submit: {
        description: 'Triggered when the form is submitted',
        payloadSchema: {
          type: 'object',
          properties: {
            values: { type: 'object' }
          },
          required: ['values']
        }
      }
    },
    slots: {
      fields: {
        description: 'Form field components',
        allows: ['nova.text-input', 'nova.password-input'],
        multiple: true
      }
    },
    capabilities: ['data-entry', 'nested-children'],
    supportedTargets: ['web'],
    renderers: {
      web: 'nova-web/form'
    },
    constraints: {
      allowedChildren: ['nova.text-input', 'nova.password-input']
    },
    migrations: []
  },
  ...BUILDER_COMPONENT_CONTRACTS
];
