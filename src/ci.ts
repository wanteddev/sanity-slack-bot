/**
 * CI(GitHub Actions) 진입 스크립트 — 배포 후 새니티 테스트.
 *
 * 실제 오케스트레이션(워밍업 → 브라우저 순차 실행 → Slack 게시 → TC 시트 기록)은
 * deploy-sanity.ts가 수행하며, 봇 서버(server.ts)의 배포 트리거와 동일한 로직을 공유한다.
 *
 * 환경변수:
 * - SANITY_ENV            대상 환경 키 (기본: wwwtest)
 * - SANITY_BROWSERS       콤마 구분 브라우저 (기본: chrome,safari,mobile-chrome,mobile-safari)
 * - SANITY_SCENARIOS      콤마 구분 시나리오 (선택, 미지정 시 전체)
 * - SLACK_BOT_TOKEN       Slack 봇 토큰 (봇 서버와 같은 앱을 쓰면 재실행 버튼도 동작)
 * - SLACK_REPORT_CHANNEL  결과를 게시할 채널 ID
 * - SLACK_FAILURE_MENTION (선택) 실패 시 함께 멘션할 대상
 * - SANITY_DRY_RUN=1      Slack 게시/시트 기록 없이 실행/출력만 (검증용)
 *
 * QA TC 스프레드시트 기록 (셋 다 설정된 경우에만 동작 — sheets-report.ts 참고):
 * - SANITY_GSHEET_CREDENTIALS  Google 서비스 계정 키 (JSON 원본 또는 base64)
 * - SANITY_SHEET_ID            스프레드시트 ID
 * - SANITY_SHEET_TEMPLATE_GID  TC양식 탭 gid (기본: 738930801)
 *
 * 종료 코드: 실패 테스트가 있으면 1 (deploy-end 이후 잡이므로 배포에는 영향 없음).
 * 시트 기록 실패는 경고로만 남기고 종료 코드에 영향을 주지 않는다.
 */
import { WebClient } from '@slack/web-api';
import { BROWSERS, SLACK_CONFIG, resolveScenarioKey, type Browser } from './config';
import { runDeploySanity } from './deploy-sanity';

function parseBrowsers(raw: string): Browser[] {
  const browsers = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const b of browsers) {
    if (!(b in BROWSERS)) {
      throw new Error(`알 수 없는 브라우저: ${b} (가능: ${Object.keys(BROWSERS).join(', ')})`);
    }
  }
  return browsers as Browser[];
}

function parseScenarios(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const key = resolveScenarioKey(token);
      if (!key) throw new Error(`알 수 없는 시나리오: ${token}`);
      return key;
    });
}

async function main() {
  const envKey = process.env.SANITY_ENV || 'wwwtest';
  const browsers = parseBrowsers(
    process.env.SANITY_BROWSERS || 'chrome,safari,mobile-chrome,mobile-safari',
  );
  const scenarios = parseScenarios(process.env.SANITY_SCENARIOS || '');
  const dryRun = process.env.SANITY_DRY_RUN === '1';
  const channel = process.env.SLACK_REPORT_CHANNEL;
  if (!dryRun && !channel) throw new Error('SLACK_REPORT_CHANNEL이 설정되지 않았습니다.');
  if (!dryRun && !SLACK_CONFIG.botToken) throw new Error('SLACK_BOT_TOKEN이 설정되지 않았습니다.');

  const { allGreen } = await runDeploySanity({
    envKey,
    browsers,
    scenarios,
    slack: dryRun
      ? undefined
      : { client: new WebClient(SLACK_CONFIG.botToken), channel: channel! },
  });

  process.exit(allGreen ? 0 : 1);
}

main().catch((e) => {
  console.error('[ci] 치명적 오류:', e);
  process.exit(1);
});
