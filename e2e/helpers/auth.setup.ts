import fs from 'fs';
import { test as setup } from '@playwright/test';
import { login } from './login';
import { getAuthFile, getBaseURL } from './auth-file';

setup('로그인 세션 저장', async ({ page, browser }) => {
  const authFile = getAuthFile();

  // 캐시된 세션이 있으면 가볍게 검증(홈 접속 → 로그인 상태 확인) 후 재사용.
  // 유효하면 전체 로그인 플로우(~15초)를 건너뛴다.
  if (fs.existsSync(authFile)) {
    const context = await browser.newContext({
      storageState: authFile,
      baseURL: getBaseURL(),
    });
    const probe = await context.newPage();
    try {
      await probe.goto('/', { waitUntil: 'domcontentloaded' });
      await probe
        .locator('[data-gnb-kind="myWanted"]')
        .locator('visible=true')
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 });
      return; // 세션 유효 → 로그인 스킵
    } catch {
      // 세션 만료/무효 → 아래에서 재로그인
    } finally {
      await context.close();
    }
  }

  await login(page);
  await page.context().storageState({ path: authFile });
});
