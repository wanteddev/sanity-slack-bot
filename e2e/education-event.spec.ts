import { test, expect } from './helpers/fixtures';
import { dismissEventPopup } from './helpers/dismiss-app-popup';
import { isReachable } from './helpers/reachable';

function getEventBaseURL(): string {
  const baseURL = process.env.E2E_BASE_URL || 'https://dev.wanted.co.kr';
  const subdomain = new URL(baseURL).hostname.split('.')[0];
  return `https://event-${subdomain}.wanted.co.kr/`;
}

test.describe('교육/이벤트', () => {
  /**
   * 교육·이벤트는 별도 오리진(event-*.wanted.co.kr)에서 서비스된다.
   * event-wwwtest는 사내망 전용 사설 IP로만 해석돼 봇 서버(Backyard 파드)에서는
   * 접근이 불가하므로, 실패가 아닌 건너뜀으로 처리한다. VPN이 붙은 로컬에서는 정상 실행된다.
   * 인프라에서 공인 노출되면 이 훅은 자동으로 통과한다.
   */
  test.beforeEach(async () => {
    const eventURL = getEventBaseURL();
    const { hostname } = new URL(eventURL);
    test.skip(
      !(await isReachable(eventURL)),
      `${hostname}에 접근할 수 없는 실행 환경 — 사내망 전용 도메인`,
    );
  });

  test('리스트 - 탭 진입 시 개별 아이템 노출 확인', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissEventPopup(page);
    const eventURL = getEventBaseURL();
    await page
      .locator('[data-attribute-id="gnb"][data-gnb-kind="event"]').locator('visible=true').first()
      .click({ noWaitAfter: true });
    await page.waitForURL(`${eventURL}**`, { timeout: 30_000, waitUntil: 'domcontentloaded' });

    const cards = page.locator(
      '[data-role="event-home-container"] [wds-component="card-content"]',
    );
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('상세 - 리스트 아이템 클릭 시 화면 이동 확인', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissEventPopup(page);
    const eventURL = getEventBaseURL();
    await page
      .locator('[data-attribute-id="gnb"][data-gnb-kind="event"]').locator('visible=true').first()
      .click({ noWaitAfter: true });
    await page.waitForURL(`${eventURL}**`, { timeout: 30_000, waitUntil: 'domcontentloaded' });

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
