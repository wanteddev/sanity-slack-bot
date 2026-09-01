import { test, expect } from './helpers/fixtures';
import type { Page } from '@playwright/test';
import { dismissEventPopup } from './helpers/dismiss-app-popup';

// 같은 테스트 계정의 프로필 상태(직군/직무, 한 줄 소개)를 변경하는 시나리오이므로
// 병렬 실행 시 상호 간섭을 막기 위해 이 파일의 테스트는 한 워커에서 순차 실행한다
test.describe.configure({ mode: 'default' });

// [2026-08-25] MY 프로필이 소셜 서비스(social-*.wanted.co.kr/my/profile)로 이관됨에 따라
// 새 UI 기준으로 재작성. 기존 시나리오 중 "언어 편집"은 새 프로필 UI에 진입점(클릭 요소)이
// 없어 제외함 — 언어 섹션 자체는 이력서(cv) 편집 화면에서 커버 가능.

/**
 * MY 프로필(소셜 서비스)로 진입.
 * 일부 환경(dev)은 소셜 서비스가 Google 인증 게이트(firebase.wanted.co.kr)로
 * 차단될 수 있어, 게이트로 리다이렉트되면 테스트를 건너뛴다.
 */
async function gotoMyProfileOrSkip(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissEventPopup(page); // 모바일 앱 유도 팝업 등이 클릭을 가로채는 것 방지
  await page
    .locator('[data-gnb-kind="myWanted"]')
    .locator('visible=true')
    .first()
    .click();
  await page.waitForLoadState('domcontentloaded');
  test.skip(
    page.url().includes('firebase.wanted.co.kr'),
    'MY 프로필(소셜 서비스)이 인증 게이트로 차단된 환경',
  );
  await page.waitForURL('**/my/profile**', {
    timeout: 15_000,
    waitUntil: 'domcontentloaded',
  });
  await dismissEventPopup(page);
}

/**
 * 프로필의 이력서 연동 섹션(경력/학력/스킬/수상)을 클릭해 이력서 편집 화면으로 이동.
 * 데이터가 있으면 "편집" 버튼, 없으면 "○○ 추가하기" 헤딩 자체가 클릭 타깃이다.
 */
async function openCvSection(page: Page, name: string, focus: string) {
  const heading = page.locator('h3').filter({ hasText: name }).first();
  await expect(heading).toBeVisible({ timeout: 10_000 });

  const editButton = heading.locator('..').getByRole('button', { name: '편집' });
  const target = (await editButton.count()) ? editButton.first() : heading;

  // SPA 하이드레이션 완료 전 클릭은 무시될 수 있어, 이동할 때까지 클릭을 재시도
  await expect(async () => {
    await target.click();
    // 이력서 편집 화면으로 focus 파라미터와 함께 이동하는지 확인
    await page.waitForURL(
      (url) =>
        url.pathname.includes('/cv/') && url.searchParams.get('focus') === focus,
      { timeout: 3_000, waitUntil: 'domcontentloaded' },
    );
  }).toPass({ timeout: 20_000, intervals: [500, 1_000, 2_000] });
}

test.describe('프로필', () => {
  test.describe('프로필 편집', () => {
    test('직군/직무 변경 확인', async ({ page }) => {
      await gotoMyProfileOrSkip(page);

      // 설정(프로필 편집 진입점) → "프로필 편집" 메뉴 → 편집 페이지
      await page
        .locator('[data-attribute-id="profile__edit__click"]')
        .first()
        .click();
      await page.getByText('프로필 편집', { exact: true }).first().click();
      await page.waitForURL('**/my/profile/edit**', {
        timeout: 10_000,
        waitUntil: 'domcontentloaded',
      });

      // "직군" 항목 클릭 → 직군 선택 다이얼로그 (라디오 목록 + 다음)
      await page
        .getByText('직군', { exact: true })
        .locator('xpath=following-sibling::*[1]')
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('직군 선택')).toBeVisible({ timeout: 10_000 });

      // 같은 값(디자인 > 그래픽 디자이너)을 재선택해 계정 상태는 유지하면서 변경 플로우 검증
      await dialog.getByText('디자인', { exact: true }).click();
      await dialog.getByText('다음', { exact: true }).click();
      await dialog.getByText('그래픽 디자이너', { exact: true }).click();
      await dialog.getByText(/^(저장|완료|확인)$/).first().click();

      // 다이얼로그 닫힘 + 편집 페이지에 선택값 반영 확인
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('디자인', { exact: true }).first()).toBeVisible();
      await expect(
        page.getByText('그래픽 디자이너', { exact: true }).first(),
      ).toBeVisible();
    });

    test('한 줄 소개 변경 확인', async ({ page }) => {
      await gotoMyProfileOrSkip(page);

      // 소개 섹션 "편집" → 인라인 편집 화면(focus=description)
      const introEditButton = page
        .locator('h3')
        .filter({ hasText: '소개' })
        .locator('..')
        .getByRole('button', { name: '편집' })
        .first();
      await expect(introEditButton).toBeVisible({ timeout: 10_000 });

      // SPA 하이드레이션 완료 전 클릭은 무시될 수 있어, 이동할 때까지 클릭을 재시도
      await expect(async () => {
        await introEditButton.click();
        await page.waitForURL('**/my/profile/edit**', {
          timeout: 3_000,
          waitUntil: 'domcontentloaded',
        });
      }).toPass({ timeout: 20_000, intervals: [500, 1_000, 2_000] });

      const introInput = page.getByPlaceholder('한 줄 소개를 입력해주세요.');
      await expect(introInput).toBeEditable({ timeout: 10_000 });

      const newIntro = `소개 ${String(Date.now()).slice(-6)}`;
      await introInput.fill(newIntro);
      await page.getByRole('button', { name: '저장' }).click();

      // 저장 후 프로필로 복귀 → 변경값 반영 확인
      await page.waitForURL('**/my/profile', {
        timeout: 15_000,
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByText(newIntro).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test.describe('이력서 연동', () => {
    const sections = [
      { name: '경력', focus: 'career' },
      { name: '학력', focus: 'education' },
      { name: '스킬', focus: 'skill' },
      { name: '수상', focus: 'activity' },
    ];

    for (const { name, focus } of sections) {
      test(`${name} 섹션 클릭 시 이력서 편집으로 이동 확인`, async ({ page }) => {
        await gotoMyProfileOrSkip(page);
        await openCvSection(page, name, focus);
      });
    }
  });
});
