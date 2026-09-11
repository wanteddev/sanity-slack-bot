import { test as base, expect, type BrowserContext } from '@playwright/test';

/**
 * 테스트에서 차단할 트래킹/분석 서드파티 호스트.
 * UX 검증(클릭·이동·렌더)과 무관한 스크립트들로, 페이지 JS 실행량과 네트워크를
 * 크게 줄여 저사양 환경(k8s Pod)에서의 타임아웃을 완화한다.
 *
 * 주의: 트래킹 동작 자체(예: weaver 이벤트 발송)는 이 테스트로 검증되지 않게 된다.
 * 호스트는 dev 홈/채용공고 리스트 실측 + 알려진 트래커 기준 (hostname suffix 매칭).
 */
const TRACKER_HOSTS = [
  // Google Analytics / Tag Manager / Ads
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googleadservices.com',
  // Amplitude
  'amplitude.com',
  // Airbridge (어트리뷰션)
  'airbridge.io',
  'abr.ge',
  // Braze (CRM 메시징)
  'braze.com',
  'braze.eu',
  // Datadog RUM
  'datadoghq.com',
  'datadoghq-browser-agent.com',
  'browser-intake-datadoghq.com',
  // Sentry
  'sentry.io',
  'sentry-cdn.com',
  // Facebook Pixel
  'connect.facebook.net',
  // 원티드 자체 트래킹 (weaver) — data-nw-weaver / data-www-weaver
  '-weaver.wanted.co.kr',
];

function isTrackerUrl(url: URL): boolean {
  const host = url.hostname;
  return TRACKER_HOSTS.some((t) => host === t || host.endsWith(t.startsWith('-') ? t : `.${t}`));
}

/** 컨텍스트의 트래커 요청을 차단한다. 수동 생성 컨텍스트(auth.setup의 캐시 프로브 등)에 사용 */
export async function blockTrackers(context: BrowserContext) {
  await context.route(isTrackerUrl, (route) => route.abort());
}

/**
 * 사내 버그 리포트 위젯(#__bugted)이 클릭을 가로채지 못하게 한다.
 *
 * 테스트 환경(wwwtest/dev)에만 주입되는 요소로 운영(www)에는 존재하지 않는다.
 * body 마지막의 빈 div로 보이지만 위젯 본체가 비동기로 붙는 과정에서 화면 우하단을
 * 덮어, 모바일 하단 GNB의 'MY 원티드'처럼 그 자리에 있는 클릭 타깃을 가로챈다
 * (Playwright: `<div id="__bugted"></div> intercepts pointer events`).
 *
 * 숨기지 않고 pointer-events만 차단해, 레이아웃에 영향 없이 클릭이 아래 요소로 통과하게 한다.
 * head는 프레임워크가 관리하며 주입한 style이 제거될 수 있어 documentElement에 붙인다.
 */
export async function disableBugReportWidget(context: BrowserContext) {
  await context.addInitScript(`(() => {
    var inject = function () {
      var style = document.createElement('style');
      style.textContent = '#__bugted, #__bugted * { pointer-events: none !important; }';
      document.documentElement.appendChild(style);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject);
    } else {
      inject();
    }
  })()`);
}

/** 트래커 차단 + 버그 위젯 무력화가 기본 적용된 test — 스펙 파일은 @playwright/test 대신 이걸 import */
export const test = base.extend({
  context: async ({ context }, use) => {
    await blockTrackers(context);
    await disableBugReportWidget(context);
    await use(context);
  },
});

export { expect };
