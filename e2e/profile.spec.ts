import { test, expect } from '@playwright/test';

test.describe('프로필', () => {
  test.describe('프로필 편집', () => {
    test('직군/직무 변경 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'MY 원티드' }).click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator('[data-attribute-id="profile__edit__click"]').click();
      await page.getByRole('button', { name: '프로필 편집' }).click();
      const jobCategoryButton = page.locator('[data-attribute-id="profileEdit__jobCategory__click"]');
      await jobCategoryButton.click();
      const jobCategoryDialog = page.locator('[data-role="navigation-title"]');
      await jobCategoryDialog.waitFor({ state: 'visible', timeout: 5_000 });
      await page.getByRole('button', { name: '디자인' }).click();
      await page.getByRole('button', { name: '다음' }).click();
      await page.getByRole('button', { name: '그래픽 디자이너' }).click();
      await page.getByText('저장').click();
      await jobCategoryDialog.waitFor({ state: 'hidden', timeout: 5_000 });
      await expect(page.getByText('디자인')).toBeVisible();
      await expect(page.getByText('그래픽 디자이너')).toBeVisible();
    });

    test('한 줄 소개 변경 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'MY 원티드' }).click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator('[data-attribute-id="profile__edit__click"]').click();
      await page.getByRole('button', { name: '프로필 편집' }).click();
      await page.locator('[data-attribute-id="profileEdit__selfDescription__click"]').click();
      const selfDescriptionInput = page.getByPlaceholder('한 줄 소개를 입력해주세요.');
      await expect(selfDescriptionInput).toBeEditable({ timeout: 10_000 });
      await selfDescriptionInput.fill('테스트 한 줄 소개');
      await page.getByRole('button', { name: '저장' }).click();
      await expect(page.getByText('테스트 한 줄 소개')).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('이력서 연동', () => {
    const editSections = [
      { name: '경력', headerLabel: '경력' },
      { name: '학력', headerLabel: '학력' },
      { name: '언어', headerLabel: '외국어' },
    ];
    const addSections = [
      { name: '스킬', headerLabel: '스킬' },
      { name: '수상', headerLabel: '수상/자격증/기타' },
    ];

    for (const { name, headerLabel } of editSections) {
      test(`${name} 편집 클릭 시 이동 및 스크롤 확인`, async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.getByRole('link', { name: 'MY 원티드' }).click();
        await page.waitForLoadState('domcontentloaded');

        const editButton = page.locator('h3').filter({ hasText: name }).locator('..').locator('..').getByRole('button', { name: '편집' });
        await editButton.click();
        await page.waitForURL('**/cv/**', { timeout: 10_000 });
        await page.locator(`[data-header-label="${headerLabel}"]`).waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator(`[data-header-label="${headerLabel}"]`).scrollIntoViewIfNeeded();
        await expect(page.locator(`[data-header-label="${headerLabel}"]`)).toBeInViewport({ timeout: 5_000 });
      });
    }

    for (const { name, headerLabel } of addSections) {
      test(`${name} 추가하기 클릭 시 이동 확인`, async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.getByRole('link', { name: 'MY 원티드' }).click();
        await page.waitForLoadState('domcontentloaded');

        await page.locator('h3').filter({ hasText: `${name} 추가하기` }).click();
        await page.waitForURL('**/cv/**', { timeout: 10_000 });
        await page.locator(`[data-header-label="${headerLabel}"]`).waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator(`[data-header-label="${headerLabel}"]`).scrollIntoViewIfNeeded();
        await expect(page.locator(`[data-header-label="${headerLabel}"]`)).toBeInViewport({ timeout: 5_000 });
      });
    }
  });
});
