import { test, expect } from '@playwright/test';

function getSocialBaseURL(): string {
  const baseURL = process.env.E2E_BASE_URL || 'https://dev.wanted.co.kr';
  const subdomain = new URL(baseURL).hostname.split('.')[0];
  return `https://social-${subdomain}.wanted.co.kr/community`;
}

test.describe('소셜', () => {
  test('리스트 - 소셜 탭 화면 노출 확인', async ({ page }) => {
    const socialURL = getSocialBaseURL();
    await page.goto(socialURL, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(socialURL, { timeout: 15_000 });

    const firstCardLink = page
      .locator('[class*="SocialCard_SocialCard"]')
      .first()
      .locator('a[class*="SocialCardBody__contents"]');
    await expect(firstCardLink).toBeVisible({ timeout: 15_000 });
  });

  test('상세 - 메인 컨텐츠 영역 클릭 시 상세 이동 확인', async ({ page }) => {
    const socialURL = getSocialBaseURL();
    await page.goto(socialURL, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(socialURL, { timeout: 10_000 });

    const firstCardLink = page
      .locator('[class*="SocialCard_SocialCard"]')
      .first()
      .locator('a[class*="SocialCardBody__contents"]');
    await expect(firstCardLink).toBeVisible({ timeout: 10_000 });

    const href = await firstCardLink.getAttribute('href');
    expect(href).toBeTruthy();

    await firstCardLink.click();
    await page.waitForURL(
      (url) => url.pathname === href || url.href.includes(href!),
      { timeout: 10_000 },
    );
  });

  test('액션 - 하트 버튼 클릭 시 UI 변경 확인', async ({ page }) => {
    const socialURL = getSocialBaseURL();
    await page.goto(socialURL, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(socialURL, { timeout: 10_000 });

    const likeButton = page
      .locator('[class*="SocialCard_SocialCard"]')
      .first()
      .locator('[data-attribute-id="community__content__likeBtn__click"]');
    await expect(likeButton).toBeVisible({ timeout: 10_000 });

    const initialPressed = await likeButton.getAttribute('aria-pressed');
    const initialCount = Number(await likeButton.getAttribute('data-like-count'));
    const expectedCount =
      initialPressed === 'true' ? initialCount - 1 : initialCount + 1;

    await likeButton.click();
    await expect(likeButton).toHaveAttribute(
      'data-like-count',
      String(expectedCount),
    );
  });

  test('작성 - 글 작성 클릭 시 화면 이동 확인', async ({ page }) => {
    const socialURL = getSocialBaseURL();
    await page.goto(socialURL, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(socialURL, { timeout: 10_000 });

    await page.locator('[data-attribute-id="community__content__write"]').click();

    const writeArticleItem = page
      .locator('[class*="SideProfile_SideProfile__dropdownMenuWrapper"]')
      .getByText('아티클 작성', { exact: true });
    await expect(writeArticleItem).toBeVisible({ timeout: 10_000 });
    await writeArticleItem.click();

    await page.waitForURL('**/community/editor', { timeout: 10_000 });
  });
});
