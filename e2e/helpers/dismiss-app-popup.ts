import { Page } from '@playwright/test';

/**
 * 모바일 뷰포트에서 노출되는 [앱에서 보기] 팝업을 닫는다.
 * 데스크탑 뷰포트에서는 아무것도 하지 않는다.
 */
export async function dismissAppPopup(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 768) return;

  const closeBtn = page.locator('[data-type="closeToday"]');
  try {
    await closeBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await closeBtn.click();
  } catch {
    // 팝업이 노출되지 않는 경우 무시
  }
}

/**
 * 홈에서 노출되는 이벤트 팝업(iframe)을 닫는다.
 * 팝업이 없으면 무시한다.
 */
export async function dismissEventPopup(page: Page) {
  const iframe = page.locator('iframe[title="WANTED"]');
  try {
    await iframe.waitFor({ state: 'visible', timeout: 3_000 });
    await iframe.contentFrame().getByRole('button', { name: 'close' }).click();
  } catch {
    // 팝업이 노출되지 않는 경우 무시
  }
}
