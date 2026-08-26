import { test, expect } from '@playwright/test';
import { dismissEventPopup } from './helpers/dismiss-app-popup';

function getEventBaseURL(): string {
  const baseURL = process.env.E2E_BASE_URL || 'https://dev.wanted.co.kr';
  const subdomain = new URL(baseURL).hostname.split('.')[0];
  return `https://event-${subdomain}.wanted.co.kr`;
}

test.describe('교육/이벤트', () => {
  test('리스트 - 탭 진입 시 개별 아이템 노출 확인', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissEventPopup(page);
    await page                                                                                                                                                                                                    
    .locator('[data-attribute-id="gnb"][data-gnb-kind="event"]').locator('visible=true').first()                                                                                                      
    .click(); 
    const eventURL = getEventBaseURL();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(eventURL, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    
    const cards = page.locator(
      '[data-role="event-home-container"] [wds-component="card-content"]',
    );
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('상세 - 리스트 아이템 클릭 시 화면 이동 확인', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissEventPopup(page);
    await page                                                                                                                                                                                                    
    .locator('[data-attribute-id="gnb"][data-gnb-kind="event"]').locator('visible=true').first()                                                                                                      
    .click(); 
    const eventURL = getEventBaseURL();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(eventURL, { timeout: 30_000, waitUntil: 'domcontentloaded' });

    const firstLink = page.locator('[data-role="event-home-container"] a').first();
    await expect(firstLink).toBeVisible({ timeout: 10_000 });

    const href = await firstLink.getAttribute('href');
    expect(href).toBeTruthy();

    await firstLink.click();
    await page.waitForURL((url) => url.pathname === href || url.href.includes(href!), {
      timeout: 10_000,
    });
  });
});
