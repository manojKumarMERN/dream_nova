import { expect, test } from '@playwright/test';
import type { AppRecord } from '@nova/sdk';
import { createPublishedApp } from '../api';

let created: { app: AppRecord; definition: { name: string } };

test.beforeAll(async ({ request }) => {
  created = await createPublishedApp(request, { publicAccess: false });
});

test('editor opens an existing app and previews runtime behavior', async ({ page }) => {
  await page.goto(`/?app=${created.app.id}`);
  const expectedText = created.definition.name.replace('E2E Runtime App ', 'Hello from ');
  await expect(page.getByText(expectedText).first()).toBeVisible();

  await page.getByRole('button', { name: 'Toggle preview' }).first().click();
  const preview = page.locator('.runtime-preview');
  await expect(preview.getByText(expectedText)).toBeVisible();
  await expect(preview.getByText('Visible before action')).toBeVisible();
  await preview.getByRole('button', { name: 'Toggle message' }).click();
  await expect(preview.getByText('Visible before action')).toHaveCount(0);
  await expect(page.getByText(/Runtime event: click/).first()).toBeVisible();

  const input = preview.locator('[data-nova-id="10000000-0000-4000-8000-000000000016"] input');
  await input.fill(' ');
  await preview.getByRole('button', { name: 'Submit' }).click();
  await expect(preview.getByText('Name is required')).toBeVisible();

  await input.fill('Ada');
  await preview.getByRole('button', { name: 'Submit' }).click();
  await expect(preview.getByText('Form validation succeeded')).toBeVisible();
});
