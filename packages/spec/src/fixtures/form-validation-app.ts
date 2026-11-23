import type { AppDefinition } from '../app-definition';
import type { ComponentNode } from '../component-node';
import { createMinimalAppDefinition } from './minimal-app';

const LOGIN_PAGE_ID = 'f1000000-0000-4000-8000-000000000001';
const HOME_PAGE_ID = 'f1000000-0000-4000-8000-000000000002';
const LOGIN_ROOT_ID = 'f2000000-0000-4000-8000-000000000001';
const HOME_ROOT_ID = 'f2000000-0000-4000-8000-000000000002';
const FORM_ID = 'f3000000-0000-4000-8000-000000000003';
const USERNAME_ID = 'f4000000-0000-4000-8000-000000000001';
const PASSWORD_ID = 'f4000000-0000-4000-8000-000000000002';

function loginForm(): ComponentNode {
  return {
    id: FORM_ID,
    type: 'nova.form',
    contractVersion: '1.0.0',
    name: 'Login form',
    props: { submitLabel: 'Sign in' },
    events: {
      submit: {
        action: 'validateForm',
        params: {
          formId: FORM_ID,
          onSuccess: [
            {
              action: 'setState',
              params: { path: 'session.username', value: '{{ event.values.username }}' }
            },
            {
              action: 'setState',
              params: { path: 'session.authenticated', value: true }
            },
            {
              action: 'showMessage',
              params: { message: 'Good evening, {{ event.values.username }}' }
            },
            { action: 'navigate', params: { route: '/home' } }
          ]
        }
      }
    },
    children: [
      {
        id: USERNAME_ID,
        type: 'nova.text-input',
        contractVersion: '1.0.0',
        name: 'Username',
        props: {
          name: 'username',
          label: 'Username',
          placeholder: 'Enter your username',
          required: true
        }
      },
      {
        id: PASSWORD_ID,
        type: 'nova.password-input',
        contractVersion: '1.0.0',
        name: 'Password',
        props: {
          name: 'password',
          label: 'Password',
          placeholder: 'Enter your password',
          minLength: 6,
          showToggle: true,
          required: true
        }
      }
    ]
  };
}

export function createFormValidationAppDefinition(): AppDefinition {
  const base = createMinimalAppDefinition();
  return {
    ...base,
    appId: 'f0000000-0000-4000-8000-000000000001',
    name: 'FORM_VALIDATION',
    description: 'Login form validation with navigation, state and toast feedback',
    pages: [
      {
        id: LOGIN_PAGE_ID,
        name: 'Login',
        route: '/login',
        rootNodeId: LOGIN_ROOT_ID,
        settings: {}
      },
      {
        id: HOME_PAGE_ID,
        name: 'Home',
        route: '/home',
        rootNodeId: HOME_ROOT_ID,
        settings: {}
      }
    ],
    components: [
      {
        id: LOGIN_ROOT_ID,
        type: 'nova.stack',
        contractVersion: '1.0.0',
        name: 'Login screen',
        props: { direction: 'column', gap: 12 },
        children: [
          {
            id: 'f3000000-0000-4000-8000-000000000001',
            type: 'nova.heading',
            contractVersion: '1.0.0',
            props: { content: 'FORM_VALIDATION', level: 'h1' }
          },
          {
            id: 'f3000000-0000-4000-8000-000000000002',
            type: 'nova.text',
            contractVersion: '1.0.0',
            props: { content: 'Sign in to continue', variant: 'body' }
          },
          loginForm()
        ]
      },
      {
        id: HOME_ROOT_ID,
        type: 'nova.stack',
        contractVersion: '1.0.0',
        name: 'Home screen',
        props: { direction: 'column', gap: 12 },
        children: [
          {
            id: 'f3000000-0000-4000-8000-000000000004',
            type: 'nova.heading',
            contractVersion: '1.0.0',
            props: { content: 'Welcome', level: 'h1' }
          },
          {
            id: 'f3000000-0000-4000-8000-000000000005',
            type: 'nova.text',
            contractVersion: '1.0.0',
            props: {
              content: 'Signed in as {{ state.session.username }}',
              variant: 'body'
            }
          },
          {
            id: 'f3000000-0000-4000-8000-000000000006',
            type: 'nova.text',
            contractVersion: '1.0.0',
            props: { content: 'You have reached /home.', variant: 'body' }
          }
        ]
      }
    ]
  };
}
