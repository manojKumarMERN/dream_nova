import type { AppDefinition } from '@nova/spec';

export function createE2eDefinition(runId: string, publicAccess: boolean): AppDefinition {
  return {
    schemaVersion: '1.0',
    appId: '11111111-1111-4111-8111-111111111111',
    name: `E2E Runtime App ${runId}`,
    description: 'Isolated Phase 3 browser fixture',
    targets: ['web'],
    deployment: { model: 'nova-managed', region: 'us-east-1' },
    backend: { mode: 'nova-managed' },
    theme: {
      colors: { primary: '#3355ff', background: '#ffffff' },
      spacing: { md: 16 },
      typography: { body: 'Inter' }
    },
    pages: [
      {
        id: '10000000-0000-4000-8000-000000000101',
        name: 'Home',
        route: '/',
        rootNodeId: '10000000-0000-4000-8000-000000000001',
        settings: {}
      },
      {
        id: '10000000-0000-4000-8000-000000000102',
        name: 'Done',
        route: '/done',
        rootNodeId: '10000000-0000-4000-8000-000000000002',
        settings: {}
      }
    ],
    components: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        type: 'nova.stack',
        contractVersion: '1.0.0',
        props: { direction: 'column', gap: 12 },
        children: [
          {
            id: '10000000-0000-4000-8000-000000000011',
            type: 'nova.text',
            contractVersion: '1.0.0',
            props: { content: `Hello from ${runId}`, variant: 'body' }
          },
          {
            id: '10000000-0000-4000-8000-000000000017',
            type: 'nova.heading',
            contractVersion: '1.0.0',
            props: { content: 'Fallback probe', level: 'h2' }
          },
          {
            id: '10000000-0000-4000-8000-000000000013',
            type: 'nova.text',
            contractVersion: '1.0.0',
            props: { content: 'Visible before action' }
          },
          {
            id: '10000000-0000-4000-8000-000000000014',
            type: 'nova.button',
            contractVersion: '1.0.0',
            props: { label: 'Toggle message' },
            events: {
              click: {
                action: 'toggleComponent',
                params: { target: '10000000-0000-4000-8000-000000000013' }
              }
            }
          },
          {
            id: '10000000-0000-4000-8000-000000000015',
            type: 'nova.form',
            contractVersion: '1.0.0',
            props: { submitLabel: 'Submit' },
            events: {
              submit: {
                action: 'validateForm',
                params: {
                  formId: '10000000-0000-4000-8000-000000000015',
                  onSuccess: [
                    {
                      action: 'setState',
                      params: { path: 'lastSubmitted', value: 'submitted' }
                    },
                    { action: 'navigate', params: { route: '/done' } }
                  ]
                }
              }
            },
            children: [
              {
                id: '10000000-0000-4000-8000-000000000016',
                type: 'nova.text-input',
                contractVersion: '1.0.0',
                props: { name: 'name', label: 'Name', required: true }
              }
            ]
          }
        ]
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        type: 'nova.text',
        contractVersion: '1.0.0',
        props: { content: 'Form validation succeeded' }
      }
    ],
    dataModels: [],
    integrations: [],
    accessPolicies: [],
    workflows: [],
    runtimeAccess: { publicAccess },
    metadata: { labels: {}, editorLocks: [] }
  };
}
