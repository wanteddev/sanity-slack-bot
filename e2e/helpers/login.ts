import { expect, Page } from '@playwright/test';
import { dismissAppPopup, dismissEventPopup } from './dismiss-app-popup';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}이(가) 설정되지 않았습니다. .env 파일을 확인하세요.`);
  }
  return value;
}

const TEST_USER_EMAIL = requireEnv('TEST_USER_EMAIL');
const TEST_USER_PASSWORD = requireEnv('TEST_USER_PASSWORD');

export async function login(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissAppPopup(page);
  await dismissEventPopup(page);
  await page.locator('[data-gnb-kind="signupLogin"]').click();
  await page.waitForLoadState('domcontentloaded');

  // 이메일 로그인 진입 (OneID 개편으로 testid가 사라져 버튼 텍스트로 매칭, 영/한 locale 모두 대응)
  await page.getByRole('button', { name: /start with email|이메일로 시작/i }).click();
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

  // 로그인 후 홈 복귀 + 헤더 렌더 — 배포 직후 콜드 스타트 시 10초를 넘길 수 있어 여유 있게
  const profileArea = page.getByRole('link', { name: 'MY 원티드' })
  await expect(profileArea).toBeVisible({ timeout: 30_000 });
}
