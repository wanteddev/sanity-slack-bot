import { test, expect } from '@playwright/test';
import { dismissEventPopup } from './helpers/dismiss-app-popup';

test.describe('이력서', () => {
  test.describe('리스트', () => {
    test('이력서 리스트 노출 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page                                                                                                                                                                                                    
      .locator('[class*="MenuNav_"] [class*="MenuItem_"][data-attribute-id="gnb"][data-gnb-kind="resume"]')                                                                                                      
      .click(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

      const basicResume = page
        .locator('[class*="ListWrapper"]')
        .locator('[class*="ResumeItem"][class*="isBasic"]');
      await expect(basicResume.first()).toBeVisible({ timeout: 10_000 });
    });

    test('새 이력서 작성 클릭 시 이동 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page                                                                                                                                                                                                    
      .locator('[class*="MenuNav_"] [class*="MenuItem_"][data-attribute-id="gnb"][data-gnb-kind="resume"]')                                                                                                      
      .click(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

      const createButton = page.getByRole('button', { name: '새 이력서 작성' });
      await expect(createButton).toBeVisible({ timeout: 10_000 });
      await createButton.click();

      // 이력서 리스트 URL에서 벗어나 작성 화면으로 이동하는지 확인
      await page.waitForURL((url) => !url.pathname.endsWith('/cv/list'), {
        timeout: 10_000,
      });
    });

    test('작성 중 이탈 시 임시저장 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page                                                                                                                                                                                                    
      .locator('[class*="MenuNav_"] [class*="MenuItem_"][data-attribute-id="gnb"][data-gnb-kind="resume"]')                                                                                                      
      .click(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

      const targetResume = page
        .locator('[role="button"][class*="ResumeItem"]')
        .filter({ hasText: '작성 중 이탈 케이스' });
      await expect(targetResume).toBeVisible({ timeout: 10_000 });
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000 },
      );

      const aboutTextarea = page.locator('textarea[field="about"]');

      // 기존 내용 뒤에 이어서 고유 텍스트 입력 (임시저장 검증용)
      const appendedText = ` autosave-test-${Date.now()}`;
      await aboutTextarea.click();
      await aboutTextarea.focus();
      await aboutTextarea.press('End');
      await aboutTextarea.pressSequentially(appendedText);
      
      // 포커스 아웃
      await aboutTextarea.blur();
      await page.waitForTimeout(1500);

      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // 입력한 텍스트가 임시저장되어 그대로 남아있는지 확인
      await expect
        .poll(() => aboutTextarea.inputValue(), { timeout: 10_000 })
        .toContain(appendedText);
    });

    test('기본 이력서 변경 동작 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page                                                                                                                                                                                                    
      .locator('[class*="MenuNav_"] [class*="MenuItem_"][data-attribute-id="gnb"][data-gnb-kind="resume"]')                                                                                                      
      .click(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

      const targetResume = page
        .locator('[role="button"][class*="ResumeItem"]')
        .filter({ hasText: '기본 이력서 변경 동작 확인' });
      await expect(targetResume).toBeVisible({ timeout: 10_000 });
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000 },
      );

      const setBasicButton = page
        .getByRole('button', { name: '기본 이력서 설정' })
        .and(page.locator('[data-menu="default"]'));
      await setBasicButton.click();
      await page.getByText('기본 이력서로 저장되었습니다.').waitFor({ timeout: 10_000 });

      await page.goBack();
      await page.reload(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

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
        { timeout: 10_000 },
      );

      await expect(setBasicButton).toBeVisible({ timeout: 10_000 });
      await setBasicButton.click();
      await page.waitForTimeout(200);
    });

    test('이력서 수정/삭제 동작 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page                                                                                                                                                                                                    
      .locator('[class*="MenuNav_"] [class*="MenuItem_"][data-attribute-id="gnb"][data-gnb-kind="resume"]')                                                                                                      
      .click(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

      const createButton = page.getByRole('button', { name: '새 이력서 작성' });
      await expect(createButton).toBeVisible({ timeout: 10_000 });
      await createButton.click();

      // 이력서 리스트 URL에서 벗어나 작성 화면으로 이동하는지 확인
      await page.waitForURL((url) => !url.pathname.endsWith('/cv/list'), {
        timeout: 10_000,
      });

      const resumeTitleSwitchButton = page.getByRole('button', { name: '이력서 제목' });
      await expect(resumeTitleSwitchButton).toBeVisible({ timeout: 10_000 });
      await resumeTitleSwitchButton.click();

      const titleTextarea = page
        .locator('[class*="ResumeDetailHeader__header__center"] textarea[field="title"]');
      await expect(titleTextarea).toBeVisible({ timeout: 10_000 });
      await titleTextarea.focus();
      await titleTextarea.fill('삭제 테스트');

      // 포커스 아웃
      await titleTextarea.blur();
      await page.waitForTimeout(1500);

      // 뒤로가기로 /cv/list 진입 후 reload로 최신 상태 반영
      await page.goBack();
      await page.waitForURL('**/cv/list', { timeout: 10_000 });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      const targetResume = page
        .locator('[role="button"][class*="ResumeItem"]')
        .filter({ hasText: '삭제 테스트' });

      // 더보기 버튼 클릭 → 드롭다운 오픈
      await targetResume
        .locator('[data-attribute-id="resumeList__resume__settings"]')
        .click();

      // 드롭다운 내 "이력서 삭제" 메뉴 클릭
      const deleteMenuItem = page
        .locator('[data-menu="delete"]')
        .filter({ hasText: '이력서 삭제' });
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
      await confirmDeleteButton.click();
      await page.waitForTimeout(1500);

      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // 삭제된 이력서가 목록에 더 이상 없는지 확인
      await expect(targetResume).not.toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('상세(수정)', () => {
    test('이력서 제목/개인 정보 변경 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page                                                                                                                                                                                                    
      .locator('[class*="MenuNav_"] [class*="MenuItem_"][data-attribute-id="gnb"][data-gnb-kind="resume"]')                                                                                                      
      .click(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

      const targetResume = page
        .locator('[role="button"][class*="ResumeItem"]')
        .filter({ hasText: '이력서 제목/개인 정보 변경 확인' });
      await expect(targetResume).toBeVisible({ timeout: 10_000 });
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000 },
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

      // 각 인풋 포커스 후 교체
      await nameInput.focus();
      await nameInput.fill(newName);
      await nameInput.blur();

      await mobileInput.focus();
      await mobileInput.fill(newMobile);
      await mobileInput.blur();

      await emailInput.focus();
      await emailInput.fill(newEmail);
      await emailInput.blur();

      await page.waitForTimeout(1500);

      // 뒤로가기 → /cv/list 진입 후 reload로 최신 상태 반영
      await page.goBack();
      await page.waitForURL('**/cv/list', { timeout: 10_000 });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // 다시 해당 이력서 edit 화면 진입
      await expect(targetResume).toBeVisible({ timeout: 10_000 });
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000 },
      );

      // 변경값이 저장됐는지 확인
      await expect(nameInput).toHaveValue(newName, { timeout: 10_000 });
      await expect(mobileInput).toHaveValue(newMobile, { timeout: 10_000 });
      await expect(emailInput).toHaveValue(newEmail, { timeout: 10_000 });
    });

    test('경력사항 변경', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page                                                                                                                                                                                                    
      .locator('[class*="MenuNav_"] [class*="MenuItem_"][data-attribute-id="gnb"][data-gnb-kind="resume"]')                                                                                                      
      .click(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

      const targetResume = page
        .locator('[role="button"][class*="ResumeItem"]')
        .filter({ hasText: '경력사항 변경' });
      await expect(targetResume).toBeVisible({ timeout: 10_000 });
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000 },
      );

      const projectTitleTextarea = page.getByPlaceholder('주요 성과').first();
      await expect(projectTitleTextarea).toBeVisible({ timeout: 10_000 });

      const newValue = `projectTitle-test-${Date.now()}`;
      await projectTitleTextarea.focus();
      await projectTitleTextarea.fill(newValue);
      await projectTitleTextarea.blur();

      await page.waitForTimeout(1500);

      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await expect(projectTitleTextarea).toHaveValue(newValue, { timeout: 10_000 });
    });

    test('"신입" 토글 체크 시 경력 입력 폼 비활성화(또는 변경)됨 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page                                                                                                                                                                                                    
      .locator('[class*="MenuNav_"] [class*="MenuItem_"][data-attribute-id="gnb"][data-gnb-kind="resume"]')                                                                                                      
      .click(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

      const targetResume = page
        .locator('[role="button"][class*="ResumeItem"]')
        .filter({ hasText: '신입 체크 확인' });
      await expect(targetResume).toBeVisible({ timeout: 10_000 });
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000 },
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

      // 모달 내 "확인" 버튼 클릭
      await rookieModal.getByRole('button', { name: '확인' }).click();
      await page.waitForTimeout(1500);

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
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page                                                                                                                                                                                                    
      .locator('[class*="MenuNav_"] [class*="MenuItem_"][data-attribute-id="gnb"][data-gnb-kind="resume"]')                                                                                                      
      .click(); 
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/cv/list', { timeout: 10_000 });

      const targetResume = page
        .locator('[role="button"][class*="ResumeItem"]')
        .filter({ hasText: '수상/자격증/기타 변경 확인' });
      await expect(targetResume).toBeVisible({ timeout: 10_000 });
      await targetResume.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL(
        (url) => url.pathname.includes('/cv/') && !url.pathname.endsWith('/cv/list'),
        { timeout: 10_000 },
      );

      const activityTextarea = page.locator(
        'textarea[class*="ResumeInput"][class*="title"][class*="activity"]',
      );
      await expect(activityTextarea).toBeVisible({ timeout: 10_000 });

      const newValue = `activity-test-${Date.now()}`;
      await activityTextarea.focus();
      await activityTextarea.fill(newValue);

      // 포커스 아웃 → 500ms 대기 → reload
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // 변경값이 저장됐는지 확인
      await expect(activityTextarea).toHaveValue(newValue, { timeout: 10_000 });
    });
  });

  // test.describe('상세(다운로드)', () => {
  //   test('다운로드 시작/완료 토스트 노출 확인', async ({ page }) => {
  //     await page.goto('/');
  //     // TODO: 다운로드 버튼 클릭
  //     // TODO: 시작 토스트, 파일 생성 후 완료 토스트가 노출됨 확인
  //   });

  //   test('다운로드 완료 파일 열기 확인', async ({ page }) => {
  //     await page.goto('/');
  //     // TODO: PDF 등의 형식으로 저장된 이력서 파일이 깨짐 없이 정상적으로 열림 확인
  //   });
  // });

  // test.describe('상세(미리보기)', () => {
  //   test('로딩 UI 노출 및 미리보기 화면 이동 확인', async ({ page }) => {
  //     await page.goto('/');
  //     // TODO: 미리보기 클릭
  //     // TODO: 시 스피너/로딩바 노출 후 완성된 형태의 이력서 화면이 뜸 확인
  //   });
  // });
});
