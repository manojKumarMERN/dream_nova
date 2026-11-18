import type { AppDefinition } from '../app-definition';
import { SPEC_VERSION } from '../version';

export function createMinimalAppDefinition(): AppDefinition {
  return {
    schemaVersion: SPEC_VERSION,
    appId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Minimal App',
    description: 'A minimal valid NOVA application definition',
    targets: ['web'],
    deployment: {
      model: 'nova-managed',
      region: 'us-east-1'
    },
    backend: {
      mode: 'nova-managed'
    },
    theme: {
      colors: {
        primary: '#4f46e5',
        background: '#ffffff'
      },
      spacing: {
        md: 16
      },
      typography: {
        body: 'Inter'
      },
      borderRadius: {
        md: 6
      },
      shadows: {
        md: '0 4px 12px rgba(0,0,0,0.1)'
      },
      components: {}
    },
    pages: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'Home',
        route: '/',
        rootNodeId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        settings: {}
      }
    ],
    components: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        type: 'nova.stack',
        contractVersion: '1.0.0',
        name: 'Root Stack',
        props: {
          direction: 'column',
          gap: 8
        },
        children: [
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            type: 'nova.text',
            contractVersion: '1.0.0',
            props: {
              content: 'Hello NOVA',
              variant: 'body'
            }
          },
          {
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            type: 'nova.button',
            contractVersion: '1.0.0',
            props: {
              label: 'Continue'
            }
          }
        ]
      }
    ],
    dataModels: [],
    integrations: [],
    accessPolicies: [],
    workflows: [],
    metadata: {
      labels: {},
      editorLocks: []
    }
  };
}
