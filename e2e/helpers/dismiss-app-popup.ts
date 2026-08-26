import { Page } from '@playwright/test';

/** 모바일 뷰포트(모바일웹 프로젝트) 여부 */
export function isMobileViewport(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) <= 768;
}

/**
 * 모바일 뷰포트에서 노출되는 [앱에서 보기] 팝업을 닫는다.
 * 데스크탑 뷰포트에서는 아무것도 하지 않는다.
 * 구형([data-type="closeToday"])과 신형("오늘은 그냥 볼게요." 버튼) 마크업 모두 대응.
 */
export async function dismissAppPopup(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 768) return;

  const closeBtn = page
    .locator('[data-type="closeToday"]')
    .or(page.getByText('오늘은 그냥 볼게요'))
    .first();
  try {
    await closeBtn.waitFor({ state: 'visible', timeout: 4_000 });
    await closeBtn.click();
    await closeBtn.waitFor({ state: 'hidden', timeout: 3_000 });
  } catch {
    // 팝업이 노출되지 않는 경우 무시
  }
}

/**
 * 페이지 진입 시 노출될 수 있는 팝업들을 정리한다.
 * - 모바일: [앱에서 보기] 유도 팝업 (클릭을 가로채므로 반드시 먼저 닫아야 함)
 * - 공통: 홈 이벤트 팝업(iframe)
 */
export async function dismissEventPopup(page: Page) {
  await dismissAppPopup(page);

  const iframe = page.locator('iframe[title="WANTED"]');
  try {
    await iframe.waitFor({ state: 'visible', timeout: 3_000 });
    await iframe.contentFrame().getByRole('button', { name: 'close' }).click();
  } catch {
    // 팝업이 노출되지 않는 경우 무시
  }
}
