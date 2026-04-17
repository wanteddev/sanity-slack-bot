import { test as setup, expect } from '@playwright/test';
import { login } from './login';

const AUTH_FILE = 'e2e/.auth/user.json';

setup('로그인 세션 저장', async ({ page }) => {
  await login(page);

  await page.context().storageState({ path: AUTH_FILE });
});
