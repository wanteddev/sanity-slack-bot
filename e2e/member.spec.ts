import { test, expect } from '@playwright/test';
import { login } from './helpers/login';
import { dismissEventPopup, isMobileViewport } from './helpers/dismiss-app-popup';

test.describe('회원', () => {
  test('이메일 로그인 정상 동작 확인', async ({ page }) => {
    // 배포 직후 콜드 스타트 시 로그인 플로우가 30초를 넘길 수 있어 상향
    test.setTimeout(60_000);
    await login(page);
  });

  test('로그아웃 정상 동작 확인', async ({ page }) => {
    // 로그인 전체 플로우 + 크로스 도메인 이동 포함 — 배포 직후 콜드 스타트 대비 상향
    test.setTimeout(60_000);
    await login(page);
    await page.waitForLoadState('domcontentloaded');

    if (isMobileViewport(page)) {
      // 모바일: 우측 상단 햄버거(더보기) 메뉴 → 로그아웃 버튼
      await page
        .locator('[data-gnb-kind="more"]')
        .locator('visible=true')
        .first()
        .click();
      await page
        .getByRole('button', { name: '로그아웃' })
        .filter({ visible: true })
        .first()
        .click();
    } else {
      // 데스크톱: MY 원티드(소셜 서비스 my 페이지) → 사이드바 로그아웃
      await page.locator('[data-gnb-kind="myWanted"]').locator('visible=true').first().click();
      await page.waitForLoadState('domcontentloaded');

      // 일부 환경(dev)은 소셜 서비스가 Google 인증 게이트(firebase.wanted.co.kr)로 차단됨
      test.skip(
        page.url().includes('firebase.wanted.co.kr'),
        'MY 원티드(소셜 서비스)가 인증 게이트로 차단된 환경 — 로그아웃 플로우 검증 불가',
      );

      // 로그아웃 클릭 → 로그아웃 API 경유 리다이렉트가 메인으로 돌아올 때까지 대기.
      // MY 페이지 하이드레이션 전 클릭이 무시될 수 있어(활성화만 되고 리다이렉트 없음),
      // 메인으로 돌아올 때까지 클릭을 재시도한다.
      const mainHost = new URL(
        process.env.E2E_BASE_URL || 'https://dev.wanted.co.kr',
      ).hostname;
      await expect(async () => {
        if (new URL(page.url()).hostname !== mainHost) {
          await page
            .locator('[data-snb-kind="logout"]')
            .click({ timeout: 2_500 })
            .catch(() => {});
        }
        await page.waitForURL((url) => url.hostname === mainHost, {
          timeout: 5_000,
          waitUntil: 'domcontentloaded',
        });
      }).toPass({ timeout: 30_000, intervals: [1_000, 2_000] });
      await dismissEventPopup(page);
    }

    // 비로그인 상태 확인 - 로그인 버튼 다시 노출 (로그아웃 리다이렉트 완료까지 재시도 대기)
    await expect(
      page.locator('[data-gnb-kind="signupLogin"]').locator('visible=true').first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
