/**
 * 배포 후 새니티 오케스트레이션 — CI(ci.ts)와 봇 서버(server.ts) 트리거가 공유하는 모듈.
 *
 * 대상 환경 워밍업 후 브라우저들을 순차 실행하고(동일 테스트 계정 공유 → 병렬 금지),
 * Slack에 헤더 → 브라우저별 결과/아티팩트 스레드 → 종합 요약 순으로 게시하며,
 * QA TC 스프레드시트에 항목별×브라우저별 결과를 기록한다(sheets-report.ts, env 게이팅).
 *
 * 동시성: 전체 실행 동안 deploy 게이트(isDeploySanityRunning)를 잡는다.
 * 브라우저 사이사이 test-runner의 per-run 락이 풀리는 틈에 수동 /sanity가 끼어들 수 있으므로,
 * 각 브라우저 시작 전 러너가 idle이 될 때까지 대기한다. server.ts는 이 게이트를 보고
 * 수동 실행 요청을 대기열로 보낸다.
 */
import type { WebClient } from '@slack/web-api';
import {
  ENVIRONMENTS,
  BROWSERS,
  SCENARIOS,
  SLACK_CONFIG,
  DEPLOY_SANITY_EXCLUDED,
  resolveDeployScenarios,
  type Browser,
} from './config';
import { runTests, isTestRunning, type TestResult } from './test-runner';
import { buildResultMessage } from './slack-ui';
import { postScenarioResults } from './slack-report';
import { reportToSheet } from './sheets-report';

export interface BrowserOutcome {
  browser: Browser;
  result?: TestResult;
  error?: string;
}

export interface DeploySanityOptions {
  envKey: string;
  browsers: Browser[];
  scenarios: string[];
  /** Slack 클라이언트/채널 — 미지정 시 dry-run(콘솔 출력만, 시트 기록도 건너뜀) */
  slack?: { client: WebClient; channel: string };
  /** 헤더에 표기할 트리거 출처 (예: 'GitHub Actions 배포') */
  triggeredBy?: string;
}

export interface DeploySanityResult {
  allGreen: boolean;
  outcomes: BrowserOutcome[];
  sheetLine: string | null;
}

let deployRunning = false;

/** 배포 새니티 전체 실행(브라우저 간 틈 포함) 중인지 — 수동 /sanity 진입 차단용 */
export function isDeploySanityRunning(): boolean {
  return deployRunning;
}

function outcomeLine(o: BrowserOutcome): string {
  const name = `${BROWSERS[o.browser]}(${o.browser})`;
  if (!o.result) return `⚠️ *${name}* — 실행 오류: ${o.error ?? '알 수 없음'}`;
  const r = o.result;
  const icon = r.failed === 0 ? '✅' : '❌';
  const skipped = r.skipped > 0 ? ` / 건너뜀 ${r.skipped}` : '';
  return `${icon} *${name}* — 통과 ${r.passed} / 실패 ${r.failed}${skipped} (${r.duration})`;
}

/**
 * 배포 직후 콜드 스타트 대비 워밍업.
 * 대상 환경이 안정적으로(연속 3회, 각 3초 이내) 응답할 때까지 최대 2분 대기한다.
 * 배포 완료 직후 첫 요청들이 느려 로그인 플로우가 타임아웃되는 것을 방지.
 */
async function warmUp(baseURL: string) {
  const deadline = Date.now() + 120_000;
  let stable = 0;
  while (Date.now() < deadline) {
    const t0 = Date.now();
    try {
      const res = await fetch(baseURL, { redirect: 'manual' });
      const ms = Date.now() - t0;
      if (res.status < 500 && ms < 3_000) {
        stable++;
        console.log(`[deploy-sanity] 워밍업 ${stable}/3 — ${res.status} (${ms}ms)`);
        if (stable >= 3) return;
      } else {
        stable = 0;
        console.log(`[deploy-sanity] 워밍업 대기 — ${res.status} (${ms}ms)`);
      }
    } catch (e) {
      stable = 0;
      console.log(`[deploy-sanity] 워밍업 대기 — 접속 실패: ${String(e).slice(0, 80)}`);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  console.warn('[deploy-sanity] 워밍업 시간(2분) 초과 — 그대로 진행합니다.');
}

/** 수동 /sanity 실행이 끝날 때까지 대기 (최대 maxMs). 초과 시 그대로 진행해 CONFLICT로 드러나게 둔다 */
async function waitForRunnerIdle(maxMs = 15 * 60_000) {
  const deadline = Date.now() + maxMs;
  while (isTestRunning() && Date.now() < deadline) {
    console.log('[deploy-sanity] 수동 실행 종료 대기 중...');
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

export async function runDeploySanity(opts: DeploySanityOptions): Promise<DeploySanityResult> {
  if (deployRunning) throw new Error('DEPLOY_CONFLICT');

  const baseURL = ENVIRONMENTS[opts.envKey];
  if (!baseURL) throw new Error(`알 수 없는 환경: ${opts.envKey}`);
  const { slack } = opts;
  // 배포 새니티 전용 제외 시나리오 적용 (명시 지정 시에는 그대로 존중)
  const { scenarios, excluded } = resolveDeployScenarios(opts.scenarios);
  const excludedLines = excluded.map(
    (k) => `• 제외: ${SCENARIOS[k].name} — ${DEPLOY_SANITY_EXCLUDED[k]}`,
  );
  if (excluded.length > 0) {
    console.log(`[deploy-sanity] 제외 시나리오: ${excluded.join(', ')}`);
  }

  deployRunning = true;
  try {
    await warmUp(baseURL);

    const headerText = (status: string, lines: string[] = []) =>
      [
        `${status} *배포 후 새니티 테스트* — 환경: \`${opts.envKey}\` (${baseURL})` +
          (opts.triggeredBy ? ` · ${opts.triggeredBy}` : ''),
        `• 브라우저: ${opts.browsers.map((b) => BROWSERS[b]).join(' → ')} (순차)`,
        ...excludedLines,
        ...lines,
      ].join('\n');

    // 헤더 게시
    let headerTs: string | undefined;
    if (slack) {
      const posted = await slack.client.chat.postMessage({
        channel: slack.channel,
        text: '배포 후 새니티 테스트 시작',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: headerText('⏳') } }],
      });
      headerTs = posted.ts!;
    } else {
      console.log('[dry-run] 헤더:', headerText('⏳'));
    }

    // 브라우저 순차 실행
    const outcomes: BrowserOutcome[] = [];
    for (const browser of opts.browsers) {
      await waitForRunnerIdle();
      console.log(`[deploy-sanity] ${browser} 실행 시작 (${opts.envKey})`);
      try {
        const result = await runTests(baseURL, scenarios, {
          userId: '',
          env: opts.envKey,
          browser,
        });
        outcomes.push({ browser, result });
        console.log(
          `[deploy-sanity] ${browser} 완료 — 통과 ${result.passed} / 실패 ${result.failed} / 건너뜀 ${result.skipped} (${result.duration})`,
        );

        const blocks = buildResultMessage(opts.envKey, result, {
          scenarios,
          browser,
        });
        if (slack && headerTs) {
          const posted = await slack.client.chat.postMessage({
            channel: slack.channel,
            thread_ts: headerTs,
            text: `${BROWSERS[browser]} 결과 — 통과 ${result.passed} / 실패 ${result.failed}`,
            blocks,
          });
          // 시나리오 상세·아티팩트는 같은 스레드에 이어서 게시
          if (posted.ts) {
            await postScenarioResults(slack.client, slack.channel, headerTs, result);
          }
        } else {
          console.log('[dry-run] 결과 블록:', JSON.stringify(blocks).slice(0, 500));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        outcomes.push({ browser, error: message });
        console.error(`[deploy-sanity] ${browser} 실행 오류:`, message);
      }
    }

    // QA TC 스프레드시트 기록 — 실패해도 경고만 남김 (테스트 결과와 무관)
    let sheetLine: string | null = null;
    const gsheetCredentials = process.env.SANITY_GSHEET_CREDENTIALS;
    const sheetId = process.env.SANITY_SHEET_ID;
    if (gsheetCredentials && sheetId && slack) {
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
        console.log(`[deploy-sanity] 시트 기록 완료: ${report.tabName} (${report.updatedCells}개 셀)`);
        if (report.unmatchedRows.length > 0) {
          console.warn('[deploy-sanity] 시트에서 찾지 못한 TC 행 (양식 텍스트 변경 여부 확인 필요):');
          for (const row of report.unmatchedRows) console.warn(`  - ${row}`);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        sheetLine = `⚠️ TC 시트 기록 실패: ${message.slice(0, 200)}`;
        console.error('[deploy-sanity] 시트 기록 실패:', message);
      }
    } else if (gsheetCredentials && sheetId) {
      console.log('[dry-run] 시트 기록 건너뜀');
    }

    // 종합 요약으로 헤더 갱신
    const totalFailed = outcomes.reduce((acc, o) => acc + (o.result?.failed ?? 1), 0);
    const allGreen = totalFailed === 0;
    const mention =
      !allGreen && SLACK_CONFIG.failureMention ? ` — ${SLACK_CONFIG.failureMention}` : '';
    const summary =
      headerText(allGreen ? '✅' : '❌', [
        '───────────────',
        ...outcomes.map(outcomeLine),
        ...(sheetLine ? [sheetLine] : []),
      ]) + mention;

    if (slack && headerTs) {
      await slack.client.chat.update({
        channel: slack.channel,
        ts: headerTs,
        text: allGreen ? '✅ 배포 후 새니티 전체 통과' : '❌ 배포 후 새니티 실패 발생',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: summary.slice(0, 3000) } }],
      });
    } else {
      console.log('[dry-run] 최종 요약:\n' + summary);
    }

    return { allGreen, outcomes, sheetLine };
  } finally {
    deployRunning = false;
  }
}
