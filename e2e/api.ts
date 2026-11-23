import type { APIRequestContext } from '@playwright/test';
import type { AppRecord, ReleaseRecord } from '@nova/sdk';
import type { AppDefinition } from '@nova/spec';
import { createE2eDefinition } from './fixtures';

export const API_URL = 'http://localhost:3000/api';
export const ACTOR_HEADERS = {
  'x-org-id': 'dev-org',
  'x-user-id': 'e2e-user',
  'x-user-roles': 'OWNER'
};

export function runId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createPublishedApp(
  request: APIRequestContext,
  options: {
    publicAccess: boolean;
    publish?: boolean;
    definition?: AppDefinition;
  } = { publicAccess: true, publish: true }
): Promise<{ app: AppRecord; definition: AppDefinition }> {
  const id = runId();
  const definition = options.definition ?? createE2eDefinition(id, options.publicAccess);
  const appResponse = await request.post(`${API_URL}/v1/apps`, {
    headers: ACTOR_HEADERS,
    data: { orgId: ACTOR_HEADERS['x-org-id'], name: definition.name, definition }
  });
  if (!appResponse.ok()) {
    throw new Error(`Failed to create E2E app: ${await appResponse.text()}`);
  }
  const app = (await appResponse.json()) as AppRecord;
  if (options.publish !== false) {
    const publishResponse = await request.post(`${API_URL}/v1/apps/${app.id}/publish`, {
      headers: ACTOR_HEADERS,
      data: { environment: 'production' }
    });
    if (!publishResponse.ok()) {
      throw new Error(`Failed to publish E2E app: ${await publishResponse.text()}`);
    }
    (await publishResponse.json()) as ReleaseRecord;
  }
  return { app, definition };
}
