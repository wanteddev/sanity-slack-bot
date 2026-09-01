import { test, expect } from './helpers/fixtures';
import { dismissEventPopup, isMobileViewport } from './helpers/dismiss-app-popup';

test.describe('채용공고', () => {
  test.describe('탐색(리스트)', () => {
    test('홈 > 숏컷 > 채용공고 클릭으로 진입', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });
      // 필터명이 데스크톱은 "jobCategory,jobRole", 모바일은 "jobCategory,jobRole,experience"로 달라 prefix 매칭
      await expect(
        page.locator('[data-filter-name^="jobCategory"]').first(),
      ).not.toContainText('직군 전체');
    });

    test('진입 시 기존 선택 필터 유지 확인', async ({ page }) => {
      // 모바일 웹은 직군/직무/경력이 통합 필터 UI라 데스크톱 플로우와 다름
      test.skip(isMobileViewport(page), '모바일 웹은 필터 UI가 달라 데스크톱 전용 시나리오');
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });
      await page.locator('[data-filter-name="experience"]').click();

      // 오른쪽 슬라이더(max)를 왼쪽 끝(신입)으로 이동
      const maxThumb = page.locator('[data-role="slider-thumb"]').nth(1);
      await maxThumb.click();
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowLeft');
      }

      // 적용
      await page.locator('[data-attribute-id="explore__filter__update"]').click();

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-filter-name="experience"]')).toContainText('신입');
    });

    test('정렬 변경 시 아이템 변경 확인', async ({ page }) => {
      // 모바일 웹은 직군/직무/경력이 통합 필터 UI라 데스크톱 플로우와 다름
      test.skip(isMobileViewport(page), '모바일 웹은 필터 UI가 달라 데스크톱 전용 시나리오');
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

      // 첫 번째 job-card의 href 저장
      const firstHref = await page.locator('[data-cy="job-card"] a').first().getAttribute('href');

      // 직군/직무 필터 변경
      await page.locator('[data-filter-name="jobCategory,jobRole"]').click();
      await page.locator('[data-itemid="-1"]', { hasText: '직군 전체' }).click();
      await page.locator('[data-attribute-id="explore__filter__update"]').click();

      // 첫 번째 job-card의 href가 변경될 때까지 자동 재시도
      await expect(page.locator('[data-cy="job-card"] a').first()).not.toHaveAttribute('href', firstHref!);
    });

    // ── 모바일 전용: 통합 필터(직군·직무·경력) UI 기반 시나리오 ──
    // 데스크톱은 필터가 개별 버튼이지만, 모바일은 하나의 통합 필터 다이얼로그
    // (직군/직무/경력 textbox → 각 선택 다이얼로그 → 적용하기)로 동작한다.

    test('진입 시 기존 선택 필터 유지 확인 (모바일)', async ({ page }) => {
      test.skip(!isMobileViewport(page), '모바일 전용 시나리오');

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

      // 통합 필터 열기 → 경력 선택 다이얼로그
      await page
        .locator('[data-filter-name="jobCategory,jobRole,experience"]')
        .locator('visible=true')
        .first()
        .click();
      const filterDialog = page.getByRole('dialog').first();
      await expect(filterDialog).toBeVisible({ timeout: 10_000 });
      await filterDialog.getByRole('textbox').nth(2).click(); // 직군/직무/경력 중 경력

      const expDialog = page.getByRole('dialog').filter({ hasText: '경력 선택' }).last();
      await expect(expDialog).toBeVisible({ timeout: 10_000 });

      // 오른쪽 슬라이더(max)를 왼쪽 끝(신입)으로 이동
      const maxThumb = expDialog.getByRole('slider').nth(1);
      await maxThumb.click();
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowLeft');
      }
      await expDialog.getByRole('button', { name: '선택 완료' }).click();

      // 적용 → 필터 적용 네비게이션(years=0 반영)이 끝날 때까지 대기
      // (완료 전에 페이지를 떠나면 네비게이션 충돌 — WebKit에서 재현)
      await page
        .locator('[data-attribute-id="explore__filter__update"]')
        .locator('visible=true')
        .first()
        .click();
      await page.waitForURL((url) => url.searchParams.get('years') === '0', {
        timeout: 10_000,
        waitUntil: 'domcontentloaded',
      });

      // 재진입 시 통합 필터에 '신입'이 유지되는지 확인
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });
      await expect(
        page.locator('[data-filter-name^="jobCategory"]').first(),
      ).toContainText('신입');
    });

    test('필터 변경 시 아이템 변경 확인 (모바일)', async ({ page }) => {
      test.skip(!isMobileViewport(page), '모바일 전용 시나리오');

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

      // 첫 번째 job-card의 href 저장
      const firstHref = await page.locator('[data-cy="job-card"] a').first().getAttribute('href');

      // 통합 필터 열기 → 직군 선택 다이얼로그
      await page
        .locator('[data-filter-name="jobCategory,jobRole,experience"]')
        .locator('visible=true')
        .first()
        .click();
      const filterDialog = page.getByRole('dialog').first();
      await expect(filterDialog).toBeVisible({ timeout: 10_000 });
      await filterDialog.getByRole('textbox').nth(0).click(); // 직군

      // 직군 '개발' 선택 → 다음 → 직무 '웹 개발자' 선택 → 선택 완료
      const categoryDialog = page.getByRole('dialog').filter({ hasText: '직군 선택' }).last();
      await expect(categoryDialog).toBeVisible({ timeout: 10_000 });
      await categoryDialog.getByRole('button', { name: '개발' }).click();
      await categoryDialog.getByRole('button', { name: '다음' }).click();

      const roleDialog = page.getByRole('dialog').filter({ hasText: '직무 선택' }).last();
      await expect(roleDialog).toBeVisible({ timeout: 10_000 });
      await roleDialog.getByRole('button', { name: '웹 개발자' }).first().click();
      await roleDialog.getByRole('button', { name: '선택 완료' }).click();

      // 적용 → 첫 번째 job-card의 href가 변경될 때까지 자동 재시도
      await page
        .locator('[data-attribute-id="explore__filter__update"]')
        .locator('visible=true')
        .first()
        .click();
      await expect(page.locator('[data-cy="job-card"] a').first()).not.toHaveAttribute(
        'href',
        firstHref!,
      );
    });

    test('인피니티 스크롤 동작 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

      const listItems = page.locator('[data-cy="job-list"] li');
      const sentinel = page.locator('[data-cy="job-list"] > div[aria-hidden="true"]');
      const initialCount = await listItems.count();

      // 매 시도마다 sentinel(없으면 마지막 li)을 뷰포트로 끌어와 intersection observer 재트리거
      await expect(async () => {
        if (await sentinel.count() > 0) {
          await sentinel.scrollIntoViewIfNeeded();
        } else {
          await listItems.last().scrollIntoViewIfNeeded();
        }
        const newCount = await listItems.count();
        expect(newCount).toBeGreaterThan(initialCount);
      }).toPass({ timeout: 15_000, intervals: [500, 1000, 1500] });
    });

  test.describe('검색', () => {
    test('검색어 입력 및 결과 노출 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-gnb-kind="search"]').click();
      
      const searchInput = page.getByPlaceholder('검색어를 입력해 주세요.');
      await expect(searchInput).toBeEditable({ timeout: 10_000 });
      await searchInput.fill('원티드');
      await page.keyboard.press('Enter');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/search?**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

      // 검색 결과 잡카드의 회사명에 "원티드" 포함 확인
      await expect(
        page.locator('[class*="JobCard_container"]').first().locator('span[class*="_company_"]')
      ).toContainText('원티드');
    });

    test('검색결과에서 기업/포지션 상세 진입 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-gnb-kind="search"]').click();
      
      const searchInput = page.getByPlaceholder('검색어를 입력해 주세요.');
      await expect(searchInput).toBeEditable({ timeout: 10_000 });
      await searchInput.fill('원티드');
      await page.keyboard.press('Enter');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/search?**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

      // 검색 결과 첫 번째 jobCard 클릭하여 상세 진입
      await page.locator('[data-testid="SearchPositionListContainer"]').locator('visible=true').first().getByRole('listitem').first().click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wd/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });
    });
  });

    test.describe('포지션 상세', () => {
      test('상세 정보 정상 노출 확인', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await dismissEventPopup(page);
        await page.locator('[data-gnb-kind="search"]').click();
        
        const searchInput = page.getByPlaceholder('검색어를 입력해 주세요.');
        await expect(searchInput).toBeEditable({ timeout: 10_000 });
        await searchInput.fill('원티드');
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/search?**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

        // 검색 결과 첫 번째 jobCard 클릭하여 상세 진입
        await page.locator('[data-testid="SearchPositionListContainer"]').locator('visible=true').first().getByRole('listitem').first().click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/wd/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

        // 상세 페이지에서 회사명에 "원티드" 포함 확인 (동일 속성의 hidden 중복 요소가 있어 visible 필터 필요)
        await expect(
          page.locator('[data-attribute-id="company__click"]').locator('visible=true').first(),
        ).toContainText('원티드');

        // 근무지역, 경력이 비어있지 않은지 확인                                                                                                   
        const infoItems = page.locator('[class*="JobHeader__Tools__Company__Info"]');                                                              
        await expect(infoItems.nth(0)).not.toBeEmpty();                                                                                            
        await expect(infoItems.nth(1)).not.toBeEmpty();  
      });

      test('근무지 지도 노출 확인', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await dismissEventPopup(page);
        await page.locator('[data-gnb-kind="search"]').click();
        
        const searchInput = page.getByPlaceholder('검색어를 입력해 주세요.');
        await expect(searchInput).toBeEditable({ timeout: 10_000 });
        await searchInput.fill('원티드');
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/search?**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

        // 검색 결과 첫 번째 jobCard 클릭하여 상세 진입
        await page.locator('[data-testid="SearchPositionListContainer"]').locator('visible=true').first().getByRole('listitem').first().click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/wd/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

        const mapButton = page.locator('[aria-label="지도 보기"]');

        // 지도는 lazy-load라 스크롤 트리거 필요 — DOM에 붙을 때까지 점진적으로 내리기
        await expect(async () => {
          await page.evaluate(() => window.scrollBy(0, 600));
          await expect(mapButton).toBeAttached({ timeout: 500 });
        }).toPass({ timeout: 15_000, intervals: [300, 500, 800] });

        await mapButton.scrollIntoViewIfNeeded();
        await expect(mapButton).toBeVisible({ timeout: 10_000 });
      });

      test('추천 포지션 노출 확인', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await dismissEventPopup(page);
        await page.locator('[data-gnb-kind="search"]').click();
        
        const searchInput = page.getByPlaceholder('검색어를 입력해 주세요.');
        await expect(searchInput).toBeEditable({ timeout: 10_000 });
        await searchInput.fill('원티드');
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/search?**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

        // 검색 결과 첫 번째 jobCard 클릭하여 상세 진입
        await page.locator('[data-testid="SearchPositionListContainer"]').locator('visible=true').first().getByRole('listitem').first().click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/wd/**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

        // 개편으로 섹션 제목이 "추천 포지션" → "이 포지션을 찾고 계셨나요?" 등으로 바뀌어 텍스트 대신 섹션 구조로 확인
        const recommendSection = page.locator('article[class*="JobAssociated_"]').first();
        await recommendSection.scrollIntoViewIfNeeded();
        await expect(recommendSection.locator('h2').first()).toBeVisible();

        // 추천 포지션 리스트에 job-card가 1개 이상 존재하는지 확인
        const jobCards = recommendSection.locator('[data-cy="job-card"]');
        await expect(jobCards.first()).toBeVisible();
      });

      test('포지션 북마크 동작 확인', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await dismissEventPopup(page);
        await page.locator('[data-gnb-kind="search"]').click();
        
        const searchInput = page.getByPlaceholder('검색어를 입력해 주세요.');
        await expect(searchInput).toBeEditable({ timeout: 10_000 });
        await searchInput.fill('원티드');
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/search?**', { timeout: 10_000, waitUntil: 'domcontentloaded' });

        const bookmarkButton = page
        .locator('[data-testid="SearchPositionListContainer"]')
        .locator('visible=true')
        .first()
        .getByRole('listitem')
        .first()
        .locator('button[data-attribute-id="position__bookmark__click"]');

        const initialKind = await bookmarkButton.getAttribute('data-kind');
        const expectedKind = initialKind === 'add' ? 'remove' : 'add';

        await bookmarkButton.click();
        await expect(bookmarkButton).toHaveAttribute('data-kind', expectedKind);
      });
    });
  });
});
