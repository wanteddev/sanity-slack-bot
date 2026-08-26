import fs from 'fs';
import { test, expect, Page, Locator } from '@playwright/test';
import { dismissEventPopup, isMobileViewport } from './helpers/dismiss-app-popup';

// 같은 테스트 계정의 이력서 상태(기본 이력서, 임시저장 등)를 변경하는 시나리오이므로
// 병렬 실행 시 상호 간섭을 막기 위해 이 파일의 테스트는 한 워커에서 순차 실행한다
test.describe.configure({ mode: 'default' });

const RESUME_API_RE = /\/api\/chaos\/resumes\//;

/**
 * 액션(blur, 삭제 확인 등)이 유발하는 이력서 저장/삭제 API 응답을 기다린다.
 * 고정 대기(waitForTimeout) 대신 사용해 flaky와 불필요한 대기 시간을 제거.
 */
async function waitForResumeApi(page: Page, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse(
    (res) =>
      RESUME_API_RE.test(res.url()) &&
      res.request().method() !== 'GET' &&
      res.ok(),
    { timeout: 10_000 },
  );
  await action();
  await responsePromise;
}

/**
 * 이름 붙은 시드 이력서를 찾는다.
 * 없으면 실패 대신 사유와 함께 건너뛴다 — 시드 부재는 앱 버그가 아닌 환경(테스트 데이터) 문제.
 */
async function getSeedResume(page: Page, name: string) {
  const target = page
    .locator('[role="button"][class*="ResumeItem"]')
    .filter({ hasText: name });
  let visible = false;
  try {
    await target.first().waitFor({ state: 'visible', timeout: 10_000 });
    visible = true;
  } catch {
    // 시드 없음 → 아래에서 skip 처리
  }
  test.skip(!visible, `시드 이력서 "${name}" 없음 — 테스트 계정에 미리 생성 필요`);
  return target;
}

/**
 * 이력서 상세에서 뜨는 유도 스낵바(예: "AI 활용 경험을 요약해드릴게요")를 닫는다.
 * 화면 하단에 지속 노출되며 더보기 시트의 항목을 가려 클릭을 막는다. (trace로 확인)
 */
async function dismissResumeSnackbar(page: Page) {
  const snackbar = page
    .locator('[data-role="snackbar"]')
    .filter({ visible: true })
    .first();
  try {
    await snackbar.waitFor({ state: 'visible', timeout: 1_500 });
    await snackbar
      .locator('[wds-component="icon-button"]')
      .first()
      .click({ timeout: 2_000 });
    await snackbar.waitFor({ state: 'hidden', timeout: 3_000 });
  } catch {
    // 스낵바가 없으면 무시
  }
}

/** 우측 상단 더보기(⋮) 시트 열기 — 항목을 가리는 스낵바를 먼저 닫는다 */
async function openResumeMoreSheet(page: Page) {
  await dismissResumeSnackbar(page);
  await page
    .locator('[data-attribute-id="resume__more__click"], [aria-label="더보기"]')
    .locator('visible=true')
    .first()
    .click({ timeout: 5_000 });
}

/**
 * 이력서 상세의 액션(다운로드/미리보기) 트리거를 준비한다.
 * - 데스크톱: 상단 아이콘 버튼("이력서 다운로드"/"미리보기")
 * - 모바일: 우측 상단 더보기(⋮) 메뉴를 열고 그 안의 항목("다운로드"/"미리보기")
 */
async function getEditorActionButton(
  page: Page,
  name: '이력서 다운로드' | '미리보기',
) {
  if (isMobileViewport(page)) {
    await openResumeMoreSheet(page);
    const label = name === '이력서 다운로드' ? '다운로드' : '미리보기';
    const item = page
      .getByRole('listitem', { name: label })
      .filter({ visible: true })
      .first();
    await expect(item).toBeVisible({ timeout: 10_000 });
    return item;
  }

  const button = page.getByRole('button', { name }).first();
  await expect(button).toBeVisible({ timeout: 10_000 });
  return button;
}

/**
 * 액션 트리거 클릭.
 * 모바일 더보기 시트는 애니메이션/하이드레이션 중 첫 클릭이 무시될 수 있어,
 * 시트가 닫힐 때까지(트리거가 사라질 때까지) 클릭을 재시도한다.
 */
async function clickEditorAction(page: Page, trigger: Locator) {
  if (!isMobileViewport(page)) {
    await trigger.click();
    return;
  }
  await expect(async () => {
    if (await trigger.isVisible()) {
      // 스낵바 등 오버레이에 가려지면 클릭이 대기 상태로 멈추므로,
      // 짧게 시도하고 실패하면 가림 요소를 닫은 뒤 루프가 재시도하게 한다
      await trigger.click({ timeout: 2_500 }).catch(async () => {
        await dismissResumeSnackbar(page);
      });
    }
    await expect(trigger).not.toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000, intervals: [500, 1_000, 2_000] });
}

/**
 * 현재 이력서를 기본 이력서로 설정하고 저장 토스트까지 대기한다.
 * - 데스크톱: 상단 '기본 이력서 설정' 버튼
 * - 모바일: 우측 상단 더보기(⋮) 메뉴 안의 '기본 이력서 설정' 항목
 */
async function setAsBasicResume(page: Page) {
  if (isMobileViewport(page)) {
    await openResumeMoreSheet(page);
    const item = page
      .locator('[data-menu="default"]')
      .filter({ visible: true })
      .first();
    await expect(item).toBeVisible({ timeout: 10_000 });
    await clickEditorAction(page, item);
  } else {
    const button = page
      .getByRole('button', { name: '기본 이력서 설정' })
      .and(page.locator('[data-menu="default"]'));
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();
  }
  await page.getByText('기본 이력서로 저장되었습니다.').waitFor({ timeout: 10_000 });
}

/** 기본 이력서(항상 존재) 상세 화면으로 진입 — 읽기 전용 시나리오(다운로드/미리보기)용 */
async function openBasicResume(page: Page) {
  await gotoResumeList(page);
  const basicResume = page
    .locator('[role="button"][class*="ResumeItem"][class*="isBasic"]')
    .first();
  await expect(basicResume).toBeVisible({ timeout: 10_000 });
  await basicResume.click();
  await page.waitForURL(
    (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
    { timeout: 10_000, waitUntil: 'domcontentloaded' },
  );
}

/** 이력서 리스트 직행 — GNB 진입 검증은 '이력서 리스트 노출 확인' 테스트에서만 수행 */
async function gotoResumeList(page: Page) {
  await page.goto('/cv/list', { waitUntil: 'domcontentloaded' });
  await dismissEventPopup(page);
  await page.waitForURL('**/cv/list', { timeout: 10_000, waitUntil: 'domcontentloaded' });
}

/** GNB 클릭 경유로 이력서 리스트 진입 (GNB 노출/동작 검증 겸용) */
async function gotoResumeListViaGnb(page: Page) {
  // 모바일 GNB에는 이력서 메뉴가 없어(채용/교육/소셜/MY만) 직행으로 폴백
  if (isMobileViewport(page)) {
    await gotoResumeList(page);
    return;
  }
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissEventPopup(page);
  await page
    .locator('[data-attribute-id="gnb"][data-gnb-kind="resume"]')
    .locator('visible=true')
    .first()
    .click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForURL('**/cv/list', { timeout: 10_000, waitUntil: 'domcontentloaded' });
}

test.describe('이력서', () => {
  test.describe('리스트', () => {
    test('이력서 리스트 노출 확인', async ({ page }) => {
      await gotoResumeListViaGnb(page);

      const basicResume = page
        .locator('[class*="ListWrapper"]')
        .locator('[class*="ResumeItem"][class*="isBasic"]');
      await expect(basicResume.first()).toBeVisible({ timeout: 10_000 });
    });

    test('새 이력서 작성 클릭 시 이동 확인', async ({ page }) => {
      await gotoResumeList(page);

      const createButton = page.getByRole('button', { name: '새 이력서 작성' });
      await expect(createButton).toBeVisible({ timeout: 10_000 });
      await createButton.click();

      // 이력서 리스트 URL에서 벗어나 작성 화면으로 이동하는지 확인
      await page.waitForURL((url) => !url.pathname.endsWith('/cv/list'), {
        timeout: 10_000,
        waitUntil: 'domcontentloaded',
      });

      // 이 테스트가 생성한 이력서를 API로 정리 (실행마다 계정에 누적되는 것 방지)
      const resumeId = page.url().split('/cv/')[1];
      if (resumeId && resumeId !== 'list') {
        try {
          await page.request.delete(`/api/chaos/resumes/v1/${resumeId}`);
        } catch {
          // 정리 실패는 테스트 결과에 영향 주지 않음
        }
      }
    });

    test('작성 중 이탈 시 임시저장 확인', async ({ page }) => {
      await gotoResumeList(page);

      const targetResume = await getSeedResume(page, '작성 중 이탈 케이스');
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000, waitUntil: 'domcontentloaded' },
      );

      const aboutTextarea = page.locator('textarea[field="about"]');

      // 기존 내용 뒤에 이어서 고유 텍스트 입력 (임시저장 검증용)
      const appendedText = ` autosave-test-${Date.now()}`;
      await aboutTextarea.click();
      await aboutTextarea.focus();
      await aboutTextarea.press('End');
      await aboutTextarea.pressSequentially(appendedText);
      
      // 포커스 아웃 → 자동저장 API 완료 대기
      await waitForResumeApi(page, () => aboutTextarea.blur());

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');

      // 입력한 텍스트가 임시저장되어 그대로 남아있는지 확인
      await expect
        .poll(() => aboutTextarea.inputValue(), { timeout: 10_000 })
        .toContain(appendedText);
    });

    test('기본 이력서 변경 동작 확인', async ({ page }) => {
      await gotoResumeList(page);

      const targetResume = await getSeedResume(page, '기본 이력서 변경 동작 확인');
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000, waitUntil: 'domcontentloaded' },
      );

      await setAsBasicResume(page);

      await page.goBack();
      await page.reload({ waitUntil: 'domcontentloaded' }); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000, waitUntil: 'domcontentloaded' });

      // "기본 이력서 변경 동작 확인" 카드에 isBasic 클래스가 반영됐는지 확인
      await expect(targetResume).toHaveClass(/isBasic/, { timeout: 10_000 });

      // 다음 테스트 실행을 위해 원래 기본 이력서로 복구
      const defaultResume = page
        .locator('[role="button"][class*="ResumeItem"]:not([class*="isBasic"])')
        .filter({ has: page.getByText('기본 이력서', { exact: true }) });
      await expect(defaultResume).toBeVisible({ timeout: 10_000 });
      await defaultResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000, waitUntil: 'domcontentloaded' },
      );

      await setAsBasicResume(page);
    });

    test('이력서 수정/삭제 동작 확인', async ({ page }) => {
      await gotoResumeList(page);

      const createButton = page.getByRole('button', { name: '새 이력서 작성' });
      await expect(createButton).toBeVisible({ timeout: 10_000 });
      await createButton.click();

      // 이력서 리스트 URL에서 벗어나 작성 화면으로 이동하는지 확인
      await page.waitForURL((url) => !url.pathname.endsWith('/cv/list'), {
        timeout: 10_000,
        waitUntil: 'domcontentloaded',
      });

      // 생성된 이력서 id 확보 — 리스트에서 이름 필터 대신 id로 카드를 특정한다
      // (과거 실행이 실패하며 남긴 동명 이력서가 있으면 이름 필터는 여러 카드에 걸려 strict 위반)
      const resumeId = decodeURIComponent(page.url().split('/cv/')[1] ?? '');
      expect(resumeId).toBeTruthy();

      // 모바일에서 동일 버튼이 중복 렌더되어 visible 필터로 특정
      const resumeTitleSwitchButton = page
        .getByRole('button', { name: '이력서 제목' })
        .filter({ visible: true })
        .first();
      await expect(resumeTitleSwitchButton).toBeVisible({ timeout: 10_000 });
      await resumeTitleSwitchButton.click();

      // 컨테이너 클래스가 데스크톱/모바일에서 달라 필드 속성 + visible로 특정
      const titleTextarea = page
        .locator('textarea[field="title"]')
        .filter({ visible: true })
        .first();
      await expect(titleTextarea).toBeVisible({ timeout: 10_000 });
      await titleTextarea.focus();
      await titleTextarea.fill(`삭제 테스트-${Date.now()}`);

      // 포커스 아웃 → 자동저장 API 완료 대기
      await waitForResumeApi(page, () => titleTextarea.blur());

      // 뒤로가기로 /cv/list 진입 후 reload로 최신 상태 반영
      await page.goBack();
      await page.waitForURL('**/cv/list', { timeout: 10_000, waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');

      // 카드 컨테이너에 이력서 id가 포함되어 유일하게 특정 가능
      const targetResume = page.locator(`[id="resume-${resumeId}-dropdown-container"]`);
      await expect(targetResume).toBeVisible({ timeout: 10_000 });

      // 더보기 버튼 클릭 → 드롭다운 오픈
      await targetResume
        .locator('[data-attribute-id="resumeList__resume__settings"]')
        .click();

      // 드롭다운 내 "이력서 삭제" 메뉴 클릭 (닫힌 다른 카드의 메뉴와 겹치지 않게 visible만)
      const deleteMenuItem = page
        .locator('[data-menu="delete"]')
        .filter({ hasText: '이력서 삭제' })
        .filter({ visible: true })
        .first();
      await expect(deleteMenuItem).toBeVisible({ timeout: 10_000 });
      await deleteMenuItem.click();

      // DeleteModal 노출 확인
      const deleteModal = page.locator('[class*="DeleteModal"]');
      await expect(deleteModal.first()).toBeVisible({ timeout: 10_000 });

      // 모달 내 "삭제" 버튼 클릭
      const confirmDeleteButton = deleteModal
        .locator('[class*="actionArea_delete"]')
        .filter({ hasText: '삭제' });
      await expect(confirmDeleteButton).toBeVisible({ timeout: 10_000 });
      // 삭제 API 완료 대기
      await waitForResumeApi(page, () => confirmDeleteButton.click());

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');

      // 삭제된 이력서가 목록에 더 이상 없는지 확인
      await expect(targetResume).not.toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('상세(수정)', () => {
    test('이력서 제목/개인 정보 변경 확인', async ({ page }) => {
      await gotoResumeList(page);

      const targetResume = await getSeedResume(page, '이력서 제목/개인 정보 변경 확인');
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000, waitUntil: 'domcontentloaded' },
      );

      const nameInput = page.locator('input[field="name"]');
      const mobileInput = page.locator('input[field="mobile"]');
      const emailInput = page.locator('input[field="email"]');
      await expect(nameInput).toBeVisible({ timeout: 10_000 });

      // 현재값 저장
      const originalName = await nameInput.inputValue();
      const originalMobile = await mobileInput.inputValue();
      const originalEmail = await emailInput.inputValue();

      // 테스트용 임의 값 생성
      const ts = Date.now();
      const newName = `이름테스트${ts}`;
      const newMobile = `010-1234-${String(ts).slice(-4)}`;
      const newEmail = `test${ts}@example.com`;

      // 각 인풋 포커스 후 교체 — blur마다 자동저장 API가 발생하므로 각각 완료 대기
      await nameInput.focus();
      await nameInput.fill(newName);
      await waitForResumeApi(page, () => nameInput.blur());

      await mobileInput.focus();
      await mobileInput.fill(newMobile);
      await waitForResumeApi(page, () => mobileInput.blur());

      await emailInput.focus();
      await emailInput.fill(newEmail);
      await waitForResumeApi(page, () => emailInput.blur());

      // 뒤로가기 → /cv/list 진입 후 reload로 최신 상태 반영
      await page.goBack();
      await page.waitForURL('**/cv/list', { timeout: 10_000, waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');

      // 다시 해당 이력서 edit 화면 진입
      await expect(targetResume).toBeVisible({ timeout: 10_000 });
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000, waitUntil: 'domcontentloaded' },
      );

      // 변경값이 저장됐는지 확인
      await expect(nameInput).toHaveValue(newName, { timeout: 10_000 });
      await expect(mobileInput).toHaveValue(newMobile, { timeout: 10_000 });
      await expect(emailInput).toHaveValue(newEmail, { timeout: 10_000 });
    });

    test('경력사항 변경', async ({ page }) => {
      await gotoResumeList(page);

      const targetResume = await getSeedResume(page, '경력사항 변경');
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000, waitUntil: 'domcontentloaded' },
      );

      const projectTitleTextarea = page.getByPlaceholder('주요 성과').first();
      await expect(projectTitleTextarea).toBeVisible({ timeout: 10_000 });

      const newValue = `projectTitle-test-${Date.now()}`;
      await projectTitleTextarea.focus();
      await projectTitleTextarea.fill(newValue);
      await waitForResumeApi(page, () => projectTitleTextarea.blur());

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');

      await expect(projectTitleTextarea).toHaveValue(newValue, { timeout: 10_000 });
    });

    test('"신입" 토글 체크 시 경력 입력 폼 비활성화(또는 변경)됨 확인', async ({ page }) => {
      await gotoResumeList(page);

      const targetResume = await getSeedResume(page, '신입 체크 확인');
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000, waitUntil: 'domcontentloaded' },
      );

      // 외부 wrapping 버튼(신입 레이블)을 클릭하고, 내부 checkbox는 상태 확인용으로만 사용
      // 경력 항목이 여러 개일 수 있어 첫 번째 CareerConnect의 신입 토글로 스코프
      const newbieToggle = page
        .locator('[class*="CareerConnect"]')
        .first()
        .getByRole('button', { name: '신입' });
      const newbieCheckbox = newbieToggle.locator('[role="checkbox"][class*="isNewbie"]');
      await expect(newbieCheckbox).toBeAttached({ timeout: 10_000 });

      const initialChecked = await newbieCheckbox.getAttribute('aria-checked');
      await newbieToggle.click();

      // RookieChangeModal 노출 확인
      const rookieModal = page.locator('[class*="RookieChangeModal"]');
      await expect(rookieModal.first()).toBeVisible({ timeout: 10_000 });

      // 모달 내 "확인" 버튼 클릭 → 저장 API 완료 대기
      await waitForResumeApi(page, () =>
        rookieModal.getByRole('button', { name: '확인' }).click(),
      );

      // aria-checked가 초기값과 반대로 바뀌었는지 확인
      const expectedChecked = initialChecked === 'true' ? 'false' : 'true';
      const currentChecked = await newbieCheckbox.getAttribute('aria-checked');
      await expect(currentChecked).toBe(expectedChecked);

      // 테스트 초기화 — 다시 토글해서 aria-checked=false로 복구
      await newbieToggle.click();
      await expect(rookieModal.first()).toBeVisible({ timeout: 10_000 });
      await rookieModal.getByRole('button', { name: '확인' }).click();
      await expect(newbieCheckbox).toHaveAttribute('aria-checked', 'false', {
        timeout: 10_000,
      });
    });

    test('수상/자격증/기타 변경 확인', async ({ page }) => {
      await gotoResumeList(page);

      const targetResume = await getSeedResume(page, '수상/자격증/기타 변경 확인');
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000, waitUntil: 'domcontentloaded' },
      );

      const activityTextarea = page.locator(
        'textarea[class*="ResumeInput"][class*="title"][class*="activity"]',
      );
      await expect(activityTextarea).toBeVisible({ timeout: 10_000 });

      const newValue = `activity-test-${Date.now()}`;
      await activityTextarea.focus();
      await activityTextarea.fill(newValue);

      // 포커스 아웃 → 자동저장 API 완료 대기 → reload
      await waitForResumeApi(page, () =>
        page.locator('body').click({ position: { x: 1, y: 1 } }),
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');

      // 변경값이 저장됐는지 확인
      await expect(activityTextarea).toHaveValue(newValue, { timeout: 10_000 });
    });
  });

  test.describe('상세(다운로드)', () => {
    // 참고: UI 개편으로 다운로드 시작/완료 토스트는 사라짐 (PDF 생성이 지연될 때만
    // "PDF 생성이 지연되고 있어요" 안내 토스트 노출). 따라서 토스트 대신
    // 다운로드 이벤트 발생(시작)과 파일 저장 완료(완료)를 검증한다.
    test('다운로드 시작/완료 동작 확인', async ({ page }) => {
      // PDF 생성이 환경 상태에 따라 30초 이상 걸릴 수 있어 테스트 타임아웃 상향
      test.setTimeout(120_000);
      await openBasicResume(page);

      const downloadButton = await getEditorActionButton(page, '이력서 다운로드');

      const downloadPromise = page.waitForEvent('download', { timeout: 90_000 });
      await clickEditorAction(page, downloadButton);

      // 다운로드 시작(이벤트 발생) 확인
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);

      // 다운로드 완료(파일 저장) 확인
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
    });

    test('다운로드 완료 파일 열기 확인', async ({ page }) => {
      test.setTimeout(120_000);
      await openBasicResume(page);

      const downloadButton = await getEditorActionButton(page, '이력서 다운로드');

      const downloadPromise = page.waitForEvent('download', { timeout: 90_000 });
      await clickEditorAction(page, downloadButton);
      const download = await downloadPromise;
      const filePath = await download.path();

      // PDF가 깨짐 없이 열리는지 무결성 검증: 헤더(%PDF-) + 종결 마커(%%EOF) + 유의미한 크기
      const buffer = fs.readFileSync(filePath);
      expect(buffer.length).toBeGreaterThan(1_000);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buffer.subarray(-1024).toString('latin1')).toContain('%%EOF');
    });
  });

  test.describe('상세(미리보기)', () => {
    test('로딩 UI 노출 및 미리보기 화면 이동 확인', async ({ page }) => {
      // 내부 대기(로딩 30s + 다이얼로그 30s 등) 합이 기본 30s 예산을 넘을 수 있어 상향
      test.setTimeout(90_000);
      await openBasicResume(page);

      const previewButton = await getEditorActionButton(page, '미리보기');
      const loading = page.locator('[class*="ResumeLoading"]').first();

      if (isMobileViewport(page)) {
        // 더보기 시트의 열림 애니메이션 중에는 클릭이 항목이 아닌 백드롭에 떨어져
        // 시트만 닫히고 미리보기가 실행되지 않을 수 있다. "시트 닫힘"이 아니라
        // "미리보기가 실제로 시작됨(로딩 또는 PDF 뷰어 노출)"을 성공 신호로 삼고,
        // 실패하면 시트를 다시 열어 재클릭한다.
        const previewStarted = page
          .locator('[class*="ResumeLoading"]')
          .or(page.locator('[class*="react-pdf"]'))
          .first();
        await expect(async () => {
          if (!(await previewButton.isVisible().catch(() => false))) {
            await openResumeMoreSheet(page);
            await previewButton.waitFor({ state: 'visible', timeout: 3_000 });
          }
          // 스낵바 등 오버레이에 가려지면 클릭이 10초씩 대기하며 예산을 소진하므로
          // 짧게 시도하고, 실패하면 가림 요소를 닫은 뒤 루프가 재시도하게 한다
          await previewButton.click({ timeout: 2_500 }).catch(async () => {
            await dismissResumeSnackbar(page);
          });
          await expect(previewStarted).toBeVisible({ timeout: 2_500 });
        }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] });
      } else {
        // 데스크톱: 클릭 전에 로딩 UI 감시를 걸어 짧게 지나가는 스피너도 놓치지 않게 한다
        const loadingSeen = loading.waitFor({ state: 'visible', timeout: 10_000 });
        await previewButton.click();
        await loadingSeen; // 스피너/로딩 UI 노출 확인
      }

      // 로딩 종료 후 완성된 이력서 미리보기(react-pdf 다이얼로그) 노출 확인
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await loading.waitFor({ state: 'hidden', timeout: 30_000 });

      // 렌더링된 이력서에 실제 내용이 채워졌는지 확인
      await expect
        .poll(async () => ((await dialog.textContent()) ?? '').trim().length, {
          timeout: 15_000,
        })
        .toBeGreaterThan(30);

      // 정리 — 미리보기 모달 닫기
      // 하단 '확인' 버튼도 AI 유도 스낵바에 가려질 수 있어(데스크톱 포함) 정리 후 재시도
      const confirmClose = dialog.getByRole('button', { name: '확인' });
      await expect(async () => {
        await dismissResumeSnackbar(page);
        await confirmClose.click({ timeout: 2_500 });
      }).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000] });
    });
  });
});
