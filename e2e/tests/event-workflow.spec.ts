import { expect, test } from '@playwright/test';
import type { AppRecord } from '@nova/sdk';
import { createPublishedApp } from '../api';

let created: { app: AppRecord };

test.beforeAll(async ({ request }) => {
  created = await createPublishedApp(request, { publicAccess: false });
});

test('editor opens the event workflow designer without a render crash', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`/?app=${created.app.id}`);
  await page.getByText('Toggle message').first().click();
  await page.getByRole('button', { name: 'Edit workflow' }).first().click();

  const designer = page.getByRole('dialog', { name: 'Event workflow designer' });
  await expect(designer).toBeVisible();
  await expect(designer).toContainText('Rise Event');
  await expect(designer.getByRole('button', { name: 'Save workflow' })).toBeVisible();
  expect(errors, `browser errors: ${errors.join(' | ')}`).toHaveLength(0);
});
