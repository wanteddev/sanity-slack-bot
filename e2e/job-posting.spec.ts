import { test, expect } from '@playwright/test';
import { dismissEventPopup } from './helpers/dismiss-app-popup';

test.describe('채용공고', () => {
  test.describe('탐색(리스트)', () => {
    test('홈 > 숏컷 > 채용공고 클릭으로 진입', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000 });
      await expect(page.locator('[data-filter-name="jobCategory,jobRole"]')).not.toContainText('직군 전체');
    });

    test('진입 시 기존 선택 필터 유지 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000 });
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
      await page.waitForURL('**/wdlist/**', { timeout: 10_000 });
      await expect(page.locator('[data-filter-name="experience"]')).toContainText('신입');
    });

    test('정렬 변경 시 아이템 변경 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000 });

      // 첫 번째 job-card의 href 저장
      const firstHref = await page.locator('[data-cy="job-card"] a').first().getAttribute('href');

      // 직군/직무 필터 변경
      await page.locator('[data-filter-name="jobCategory,jobRole"]').click();
      await page.locator('[data-itemid="-1"]', { hasText: '직군 전체' }).click();
      await page.locator('[data-attribute-id="explore__filter__update"]').click();

      // 첫 번째 job-card의 href가 변경될 때까지 자동 재시도
      await expect(page.locator('[data-cy="job-card"] a').first()).not.toHaveAttribute('href', firstHref!);
    });

    test('인피니티 스크롤 동작 확인', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await dismissEventPopup(page);
      await page.locator('[data-kind="position"]').click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wdlist/**', { timeout: 10_000 });

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
      await page.waitForURL('**/search?**', { timeout: 10_000 });

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
      await page.waitForURL('**/search?**', { timeout: 10_000 });

      // 검색 결과 첫 번째 jobCard 클릭하여 상세 진입
      await page.locator('[data-testid="SearchPositionListContainer"]').first().getByRole('listitem').first().click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForURL('**/wd/**', { timeout: 10_000 });
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
        await page.waitForURL('**/search?**', { timeout: 10_000 });

        // 검색 결과 첫 번째 jobCard 클릭하여 상세 진입
        await page.locator('[data-testid="SearchPositionListContainer"]').first().getByRole('listitem').first().click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/wd/**', { timeout: 10_000 });

        // 상세 페이지에서 회사명에 "원티드" 포함 확인
        await expect(page.locator('[data-attribute-id="company__click"]').first()).toContainText('원티드');

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
        await page.waitForURL('**/search?**', { timeout: 10_000 });

        // 검색 결과 첫 번째 jobCard 클릭하여 상세 진입
        await page.locator('[data-testid="SearchPositionListContainer"]').first().getByRole('listitem').first().click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/wd/**', { timeout: 10_000 });

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
        await page.waitForURL('**/search?**', { timeout: 10_000 });

        // 검색 결과 첫 번째 jobCard 클릭하여 상세 진입
        await page.locator('[data-testid="SearchPositionListContainer"]').first().getByRole('listitem').first().click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForURL('**/wd/**', { timeout: 10_000 });

        const recommendTitle = page.locator('h2', { hasText: '추천 포지션' });
        await recommendTitle.scrollIntoViewIfNeeded();
        await expect(recommendTitle).toBeVisible();                                                                                                
                                                                                                                                                  
        // 추천 포지션 리스트에 job-card가 1개 이상 존재하는지 확인                                                                                
        const jobCards = page.locator('ul[class*="_AssociatedJobList_"] [data-cy="job-card"]');                                                    
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
        await page.waitForURL('**/search?**', { timeout: 10_000 });

        const bookmarkButton = page
        .locator('[data-testid="SearchPositionListContainer"]')
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
