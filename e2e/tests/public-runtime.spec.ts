import { expect, test } from '@playwright/test';
import type { AppRecord } from '@nova/sdk';
import { API_URL, ACTOR_HEADERS, createPublishedApp } from '../api';

let published: { app: AppRecord; definition: { name: string } };
let privateApp: { app: AppRecord; definition: { name: string } };
let draft: { app: AppRecord; definition: { name: string } };

test.beforeAll(async ({ request }) => {
  published = await createPublishedApp(request, { publicAccess: true });
  privateApp = await createPublishedApp(request, { publicAccess: false });
  draft = await createPublishedApp(request, { publicAccess: true, publish: false });
});

test('runtime endpoint access rules separate preview, public and draft access', async ({
  request
}) => {
  const unauthenticated = await request.get(`${API_URL}/runtime/v1/preview/${published.app.slug}`);
  expect(unauthenticated.status()).toBe(401);

  const unauthorized = await request.get(`${API_URL}/runtime/v1/preview/${published.app.slug}`, {
    headers: { ...ACTOR_HEADERS, 'x-org-id': 'other-org' }
  });
  expect(unauthorized.status()).toBe(404);

  const preview = await request.get(`${API_URL}/runtime/v1/preview/${published.app.slug}`, {
    headers: ACTOR_HEADERS
  });
  expect(preview.status()).toBe(200);
  expect((await preview.json()).name).toBe(published.definition.name);

  const publicPayload = await request.get(
    `${API_URL}/runtime/v1/public/${published.app.slug}?environment=production`
  );
  expect(publicPayload.status()).toBe(200);
  expect((await publicPayload.json()).runtimeAccess?.publicAccess).toBe(true);

  const privatePayload = await request.get(`${API_URL}/runtime/v1/public/${privateApp.app.slug}`);
  expect(privatePayload.status()).toBe(403);

  const draftPayload = await request.get(`${API_URL}/runtime/v1/public/${draft.app.slug}`);
  expect(draftPayload.status()).toBe(404);
});

test('independent runtime renders, validates, navigates and honors responsiveness', async ({
  page
}) => {
  const id = published.definition.name.replace('E2E Runtime App ', '');
  await page.route('**/api/v1/registry/components/full', async (route) => {
    const response = await route.fetch();
    const contracts = (await response.json()) as Array<{
      type: string;
      renderers: Record<string, string>;
    }>;
    const headingContract = contracts.find((contract) => contract.type === 'nova.heading');
    if (headingContract !== undefined) {
      headingContract.renderers = {};
    }
    await route.fulfill({ response, json: contracts });
  });
  await page.goto(`http://localhost:5174/?app=${published.app.slug}`);
  await expect(page.getByText(`Loaded ${published.app.slug}`)).toBeVisible();

  const stage = page.locator('.runtime-stage');
  await expect(stage.getByText(`Hello from ${id}`)).toBeVisible();
  await expect(stage.getByText('Unknown component: nova.heading')).toBeVisible();
  await expect(stage.getByText('Visible before action')).toBeVisible();

  await stage.getByRole('button', { name: 'Toggle message' }).click();
  await expect(stage.getByText('Visible before action')).toHaveCount(0);

  const input = stage.locator('[data-nova-id="10000000-0000-4000-8000-000000000016"] input');
  await input.fill(' ');
  await stage.getByRole('button', { name: 'Submit' }).click();
  await expect(stage.getByText('Name is required')).toBeVisible();

  await input.fill('Ada');
  await stage.getByRole('button', { name: 'Submit' }).click();
  await expect(stage.getByText('Form validation succeeded')).toBeVisible();

  await page.getByRole('button', { name: 'tablet viewport' }).click();
  await expect(page.locator('.runtime-stage')).toHaveAttribute('data-breakpoint', 'tablet');
});

test('public runtime does not expose unpublished or private apps', async ({ page }) => {
  await page.goto(`http://localhost:5174/?app=${draft.app.slug}`);
  await expect(page.getByText(`Fallback for ${draft.app.slug}`)).toBeVisible();

  await page.goto(`http://localhost:5174/?app=${privateApp.app.slug}`);
  await expect(page.getByText(`Fallback for ${privateApp.app.slug}`)).toBeVisible();
});
