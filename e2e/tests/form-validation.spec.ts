import { expect, test } from '@playwright/test';
import { createFormValidationAppDefinition } from '@nova/spec';
import { createPublishedApp } from '../api';

let created: { app: { id: string } };

test.beforeAll(async ({ request }) => {
  created = await createPublishedApp(request, {
    publicAccess: true,
    definition: createFormValidationAppDefinition()
  });
});

test('FORM_VALIDATION logs in, navigates home and shows the greeting toast', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`http://localhost:5174/?app=${created.app.id}`);
  await expect(page.getByText('FORM_VALIDATION').first()).toBeVisible();

  await page.getByLabel('Username').fill('Ada');
  await page.getByLabel('Password').fill('lovelace');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await expect(page.getByText('Signed in as Ada')).toBeVisible();
  await expect(page.getByText('Good evening, Ada')).toBeVisible();
  expect(errors, `browser errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('FORM_VALIDATION blocks empty submissions', async ({ page }) => {
  await page.goto(`http://localhost:5174/?app=${created.app.id}`);

  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Username is required')).toBeVisible();
  await expect(page.getByText('Password is required')).toBeVisible();
  await expect(page).not.toHaveURL(/\/home$/);
});
