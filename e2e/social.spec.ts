import { test, expect, Page } from '@playwright/test';
import { dismissEventPopup } from './helpers/dismiss-app-popup';

function getSocialBaseURL(): string {
  const baseURL = process.env.E2E_BASE_URL || 'https://dev.wanted.co.kr';
  const subdomain = new URL(baseURL).hostname.split('.')[0];
  return `https://social-${subdomain}.wanted.co.kr/community`;
}

/**
 * 소셜 서비스로 이동한다.
 * 일부 환경(dev)은 소셜 서비스가 Google 인증 게이트(firebase.wanted.co.kr)로
 * 차단되어 있어, 게이트로 리다이렉트되면 테스트를 건너뛴다.
 */
async function gotoSocialOrSkip(page: Page) {
  const socialURL = getSocialBaseURL();
  await page.goto(socialURL, { waitUntil: 'domcontentloaded' });
  test.skip(
    page.url().includes('firebase.wanted.co.kr'),
    '소셜 서비스가 인증 게이트로 차단된 환경 — 소셜 시나리오 검증 불가',
  );
  await page.waitForURL(socialURL, { timeout: 15_000, waitUntil: 'domcontentloaded' });
  await dismissEventPopup(page); // 모바일 앱 유도 팝업 등이 클릭을 가로채는 것 방지
}

test.describe('소셜', () => {
  test('리스트 - 소셜 탭 화면 노출 확인', async ({ page }) => {
    await gotoSocialOrSkip(page);

    const firstCardLink = page
      .locator('a[class*="SocialCardBody__contents"]')
      .first();
    await expect(firstCardLink).toBeVisible({ timeout: 15_000 });
  });

  test('상세 - 메인 컨텐츠 영역 클릭 시 상세 이동 확인', async ({ page }) => {
    await gotoSocialOrSkip(page);

    const firstCardLink = page
      .locator('a[class*="SocialCardBody__contents"]')
      .first();
    await expect(firstCardLink).toBeVisible({ timeout: 10_000 });

    const href = await firstCardLink.getAttribute('href');
    expect(href).toBeTruthy();

    await firstCardLink.click();
    await page.waitForURL(
      (url) => url.pathname === href || url.href.includes(href!),
      { timeout: 10_000, waitUntil: 'domcontentloaded' },
    );
  });

  test('액션 - 하트 버튼 클릭 시 UI 변경 확인', async ({ page }) => {
    await gotoSocialOrSkip(page);

    const likeButton = page
      .locator('[data-attribute-id="community__content__likeBtn__click"]')
      .first();
    await expect(likeButton).toBeVisible({ timeout: 10_000 });

    // 개편으로 aria-pressed가 사라져 data-like-count 변화로만 확인
    const initialCount = await likeButton.getAttribute('data-like-count');

    await likeButton.click();
    await expect
      .poll(() => likeButton.getAttribute('data-like-count'), { timeout: 10_000 })
      .not.toBe(initialCount);
  });

  test('작성 - 글 작성 클릭 시 화면 이동 확인', async ({ page }) => {
    await gotoSocialOrSkip(page);

    // 데스크톱: 작성 버튼(community__content__write) → 에디터 페이지 이동
    // 모바일: PostPrompt 영역 → 작성 모달 노출 (URL 이동 없음)
    const writeButton = page
      .locator('[data-attribute-id="community__content__write"]')
      .locator('visible=true')
      .first();

    if (await writeButton.count()) {
      await writeButton.click();

      // 드롭다운이 열리면 '아티클 작성' 선택, 즉시 에디터로 이동하는 경우는 그대로 진행
      const writeArticleItem = page.getByText('아티클 작성', { exact: true }).first();
      try {
        await writeArticleItem.waitFor({ state: 'visible', timeout: 3_000 });
        await writeArticleItem.click();
      } catch {
        // 드롭다운 없이 바로 이동하는 UI인 경우
      }

      await page.waitForURL('**/community/editor**', { timeout: 10_000, waitUntil: 'domcontentloaded' });
    } else {
      await page.locator('[class*="PostPrompt"]').first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(
        dialog.getByRole('button', { name: '취소' }),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
