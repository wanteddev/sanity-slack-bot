import { expect, Page } from '@playwright/test';
import { dismissAppPopup, dismissEventPopup } from './dismiss-app-popup';

const TEST_USER_EMAIL = 'lsh_test_100@test.com';
const TEST_USER_PASSWORD = '123qwe!!';

export async function login(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissAppPopup(page);
  await dismissEventPopup(page);
  await page.locator('[data-gnb-kind="signupLogin"]').click();
  await page.waitForLoadState('domcontentloaded');

  // Continue with email 버튼 클릭
  await page.getByTestId('Button').click();
  await page.waitForLoadState('domcontentloaded');

  const emailInput = page.getByTestId('Input_email');
  await expect(emailInput).toBeEditable({ timeout: 10_000 });
  await emailInput.fill(TEST_USER_EMAIL);

  const passwordInput = page.getByTestId('Input_password');
  await expect(passwordInput).toBeEditable({ timeout: 10_000 });
  await passwordInput.fill(TEST_USER_PASSWORD);
  const loginButton = page.locator('[data-attribute-id="signup__email__login"]')
  await loginButton.click();
  await page.waitForLoadState('domcontentloaded');
  await dismissEventPopup(page);

  const profileArea = page.getByRole('link', { name: 'MY 원티드' })
  await expect(profileArea).toBeVisible({ timeout: 10_000 });
}
