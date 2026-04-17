import { test, expect } from '@playwright/test';
import { login } from './helpers/login';
import { dismissEventPopup } from './helpers/dismiss-app-popup';

test.describe('회원', () => {
  test('이메일 로그인 정상 동작 확인', async ({ page }) => {
    await login(page);
  });

  test('로그아웃 정상 동작 확인', async ({ page }) => {
    await login(page);

    // 프로필 영역 클릭
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-gnb-kind="myWanted"]').click();

    // 로그아웃 클릭
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-snb-kind="logout"]').click();

    // 비로그인 상태 확인 - 로그인 버튼 다시 노출
    await page.waitForURL('/', { timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded');
    await dismissEventPopup(page);
    await expect(
      page.locator('[data-gnb-kind="signupLogin"]'),
    ).toBeVisible({ timeout: 10_000 });
  });
});
