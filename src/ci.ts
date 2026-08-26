/**
 * CI(GitHub Actions) 진입 스크립트 — 배포 후 새니티 테스트.
 *
 * 지정한 환경에서 브라우저들을 순차 실행하고(동일 테스트 계정 공유 → 병렬 금지),
 * 결과를 Slack 채널에 게시한다: 헤더 메시지 → 브라우저별 결과·시나리오 상세·실패
 * 아티팩트를 스레드에 → 완료 시 헤더를 종합 요약으로 갱신.
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
import {
  ENVIRONMENTS,
  BROWSERS,
  SLACK_CONFIG,
  resolveScenarioKey,
  type Browser,
} from './config';
import { runTests, type TestResult } from './test-runner';
import { buildResultMessage } from './slack-ui';
import { postScenarioResults } from './slack-report';
import { reportToSheet } from './sheets-report';

interface BrowserOutcome {
  browser: Browser;
  result?: TestResult;
  error?: string;
}

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

function outcomeLine(o: BrowserOutcome): string {
  const name = `${BROWSERS[o.browser]}(${o.browser})`;
  if (!o.result) return `⚠️ *${name}* — 실행 오류: ${o.error ?? '알 수 없음'}`;
  const r = o.result;
  const icon = r.failed === 0 ? '✅' : '❌';
  const skipped = r.skipped > 0 ? ` / 건너뜀 ${r.skipped}` : '';
  return `${icon} *${name}* — 통과 ${r.passed} / 실패 ${r.failed}${skipped} (${r.duration})`;
}

async function main() {
  const envKey = process.env.SANITY_ENV || 'wwwtest';
  const baseURL = ENVIRONMENTS[envKey];
  if (!baseURL) throw new Error(`알 수 없는 환경: ${envKey}`);

  const browsers = parseBrowsers(
    process.env.SANITY_BROWSERS || 'chrome,safari,mobile-chrome,mobile-safari',
  );
  const scenarios = parseScenarios(process.env.SANITY_SCENARIOS || '');
  const dryRun = process.env.SANITY_DRY_RUN === '1';
  const channel = process.env.SLACK_REPORT_CHANNEL;
  if (!dryRun && !channel) throw new Error('SLACK_REPORT_CHANNEL이 설정되지 않았습니다.');
  if (!dryRun && !SLACK_CONFIG.botToken) throw new Error('SLACK_BOT_TOKEN이 설정되지 않았습니다.');

  const client = new WebClient(SLACK_CONFIG.botToken);
  const headerText = (status: string, lines: string[] = []) =>
    [
      `${status} *배포 후 새니티 테스트* — 환경: \`${envKey}\` (${baseURL})`,
      `• 브라우저: ${browsers.map((b) => BROWSERS[b]).join(' → ')} (순차)`,
      ...lines,
    ].join('\n');

  // 헤더 게시
  let headerTs: string | undefined;
  if (!dryRun) {
    const posted = await client.chat.postMessage({
      channel: channel!,
      text: '배포 후 새니티 테스트 시작',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: headerText('⏳') } },
      ],
    });
    headerTs = posted.ts!;
  } else {
    console.log('[dry-run] 헤더:', headerText('⏳'));
  }

  // 브라우저 순차 실행
  const outcomes: BrowserOutcome[] = [];
  for (const browser of browsers) {
    console.log(`[ci] ${browser} 실행 시작 (${envKey})`);
    try {
      const result = await runTests(baseURL, scenarios, {
        userId: '',
        env: envKey,
        browser,
      });
      outcomes.push({ browser, result });
      console.log(
        `[ci] ${browser} 완료 — 통과 ${result.passed} / 실패 ${result.failed} / 건너뜀 ${result.skipped} (${result.duration})`,
      );

      const blocks = buildResultMessage(envKey, result, { scenarios, browser });
      if (!dryRun && headerTs) {
        const posted = await client.chat.postMessage({
          channel: channel!,
          thread_ts: headerTs,
          text: `${BROWSERS[browser]} 결과 — 통과 ${result.passed} / 실패 ${result.failed}`,
          blocks,
        });
        // 시나리오 상세·아티팩트는 같은 스레드에 이어서 게시
        if (posted.ts) {
          await postScenarioResults(client, channel!, headerTs, result);
        }
      } else {
        console.log('[dry-run] 결과 블록:', JSON.stringify(blocks).slice(0, 500));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      outcomes.push({ browser, error: message });
      console.error(`[ci] ${browser} 실행 오류:`, message);
    }
  }

  // QA TC 스프레드시트 기록 — 실패해도 경고만 남김 (테스트 결과와 무관)
  let sheetLine: string | null = null;
  const gsheetCredentials = process.env.SANITY_GSHEET_CREDENTIALS;
  const sheetId = process.env.SANITY_SHEET_ID;
  if (gsheetCredentials && sheetId && !dryRun) {
    try {
      const kstDate = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      const report = await reportToSheet({
        credentialsRaw: gsheetCredentials,
        spreadsheetId: sheetId,
        templateGid: Number(process.env.SANITY_SHEET_TEMPLATE_GID || '738930801'),
        date: kstDate,
        outcomes,
      });
      sheetLine = `📋 TC 시트 \`${report.tabName}\` ${report.created ? '생성' : '갱신'} — 셀 ${report.updatedCells}개 기록`;
      console.log(`[ci] 시트 기록 완료: ${report.tabName} (${report.updatedCells}개 셀)`);
      if (report.unmatchedRows.length > 0) {
        console.warn('[ci] 시트에서 찾지 못한 TC 행 (양식 텍스트 변경 여부 확인 필요):');
        for (const row of report.unmatchedRows) console.warn(`  - ${row}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      sheetLine = `⚠️ TC 시트 기록 실패: ${message.slice(0, 200)}`;
      console.error('[ci] 시트 기록 실패:', message);
    }
  } else if (dryRun && gsheetCredentials && sheetId) {
    console.log('[dry-run] 시트 기록 건너뜀');
  }

  // 종합 요약으로 헤더 갱신
  const totalFailed = outcomes.reduce((acc, o) => acc + (o.result?.failed ?? 1), 0);
  const allGreen = totalFailed === 0;
  const mention =
    !allGreen && SLACK_CONFIG.failureMention ? ` — ${SLACK_CONFIG.failureMention}` : '';
  const summary = headerText(
    allGreen ? '✅' : '❌',
    ['───────────────', ...outcomes.map(outcomeLine), ...(sheetLine ? [sheetLine] : [])],
  ) + mention;

  if (!dryRun && headerTs) {
    await client.chat.update({
      channel: channel!,
      ts: headerTs,
      text: allGreen ? '✅ 배포 후 새니티 전체 통과' : '❌ 배포 후 새니티 실패 발생',
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: summary.slice(0, 3000) } }],
    });
  } else {
    console.log('[dry-run] 최종 요약:\n' + summary);
  }

  process.exit(allGreen ? 0 : 1);
}

main().catch((e) => {
  console.error('[ci] 치명적 오류:', e);
  process.exit(1);
});
