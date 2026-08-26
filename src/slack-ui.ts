import type { Block, KnownBlock } from '@slack/types';
import {
  ENVIRONMENTS,
  SCENARIOS,
  BROWSERS,
  SLACK_CONFIG,
  scenarioKeyByName,
  type Browser,
} from './config';
import type { TestResult, RunningInfo, RunProgress } from './test-runner';

function browserText(browser: Browser): string {
  return `${BROWSERS[browser]}(${browser})`;
}

function scenarioListText(scenarios: string[]): string {
  return scenarios.length === 0
    ? '전체'
    : scenarios.map((s) => SCENARIOS[s]?.name ?? s).join(', ');
}

export function buildCommandUI(): (KnownBlock | Block)[] {
  const envOptions = Object.entries(ENVIRONMENTS).map(([key, url]) => ({
    text: { type: 'plain_text' as const, text: `${key} (${new URL(url).hostname})` },
    value: key,
  }));

  const scenarioOptions = Object.entries(SCENARIOS).map(([key, { name }]) => ({
    text: { type: 'plain_text' as const, text: name },
    value: key,
  }));

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🧪 새니티 테스트 실행' },
    },
    {
      type: 'section',
      block_id: 'env_select',
      text: { type: 'mrkdwn', text: '*환경 선택*' },
      accessory: {
        type: 'static_select',
        action_id: 'select_env',
        placeholder: { type: 'plain_text', text: '환경을 선택하세요' },
        options: envOptions,
      },
    },
    {
      type: 'section',
      block_id: 'scenario_select',
      text: { type: 'mrkdwn', text: '*시나리오 선택* (미선택 시 전체 실행)' },
      accessory: {
        type: 'multi_static_select',
        action_id: 'select_scenarios',
        placeholder: { type: 'plain_text', text: '시나리오를 선택하세요' },
        options: scenarioOptions,
      },
    },
    {
      type: 'section',
      block_id: 'browser_select',
      text: { type: 'mrkdwn', text: '*브라우저 선택* (기본: 크롬)' },
      accessory: {
        type: 'static_select',
        action_id: 'select_browser',
        initial_option: {
          text: { type: 'plain_text' as const, text: '크롬 (Chromium)' },
          value: 'chrome',
        },
        options: [
          {
            text: { type: 'plain_text' as const, text: '크롬 (Chromium)' },
            value: 'chrome',
          },
          {
            text: { type: 'plain_text' as const, text: '사파리 (WebKit)' },
            value: 'safari',
          },
          {
            text: { type: 'plain_text' as const, text: '모바일웹 크롬 (Pixel 7)' },
            value: 'mobile-chrome',
          },
          {
            text: { type: 'plain_text' as const, text: '모바일웹 사파리 (iPhone 14)' },
            value: 'mobile-safari',
          },
        ],
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'run_sanity',
          text: { type: 'plain_text', text: '▶️ 테스트 실행' },
          style: 'primary',
        },
      ],
    },
  ];
}

/** 채널에 게시되는 실행 진행 메시지 — 진행 정보가 오면 chat.update로 갱신된다 */
export function buildProgressMessage(
  env: string,
  scenarios: string[],
  userId: string,
  browser: Browser,
  progress?: RunProgress,
): (KnownBlock | Block)[] {
  const lines = [
    `⏳ *새니티 테스트 실행 중...*`,
    `• 환경: \`${env}\` (${ENVIRONMENTS[env]})`,
    `• 시나리오: ${scenarioListText(scenarios)} · 브라우저: ${browserText(browser)}`,
    `• 실행자: <@${userId}>`,
  ];
  if (progress) {
    const current = progress.current ? ` · ${progress.current} 진행 중` : '';
    lines.push(`• 진행: ${progress.done}/${progress.total}${current}`);
  }
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'cancel_run',
          text: { type: 'plain_text', text: '⏹ 취소' },
          style: 'danger',
          value: JSON.stringify({ runBy: userId }),
          confirm: {
            title: { type: 'plain_text', text: '테스트 취소' },
            text: { type: 'plain_text', text: '실행 중인 테스트를 중단할까요?' },
            confirm: { type: 'plain_text', text: '취소하기' },
            deny: { type: 'plain_text', text: '계속 실행' },
          },
        },
      ],
    },
  ];
}

export function buildCancelledMessage(
  env: string,
  scenarios: string[],
  cancelledBy: string,
  browser: Browser,
): (KnownBlock | Block)[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⏹ *새니티 테스트가 취소되었습니다*\n• 환경: \`${env}\` (${ENVIRONMENTS[env]})\n• 시나리오: ${scenarioListText(scenarios)} · 브라우저: ${browserText(browser)}\n• 취소자: <@${cancelledBy}>`,
      },
    },
  ];
}

export function buildResultMessage(
  env: string,
  result: TestResult,
  opts?: { runBy?: string; scenarios?: string[]; browser?: Browser },
): (KnownBlock | Block)[] {
  const blocks: (KnownBlock | Block)[] = [];
  const allPassed = result.failed === 0;
  const icon = allPassed ? '✅' : '❌';
  const status = allPassed ? '전체 통과' : '실패 발생';

  // 실행자 멘션(완료 알림) + 실패 시 담당 그룹 멘션(설정된 경우)
  const mentions: string[] = [];
  if (opts?.runBy) mentions.push(`<@${opts.runBy}>`);
  if (!allPassed && SLACK_CONFIG.failureMention) {
    mentions.push(SLACK_CONFIG.failureMention);
  }

  const browser = opts?.browser ?? 'chrome';
  const skippedText = result.skipped > 0 ? ` / 건너뜀: ${result.skipped}건` : '';
  const headerLines: string[] = [
    `${icon} *새니티 테스트 ${status}*${mentions.length ? ` — ${mentions.join(' ')}` : ''}`,
    `• 환경: \`${env}\` (${ENVIRONMENTS[env]}) · 브라우저: ${browserText(browser)}`,
    `• 통과: ${result.passed}건 / 실패: ${result.failed}건${skippedText}`,
    `• 소요시간: ${result.duration}`,
  ];

  // 시나리오 한 줄 요약 — 케이스별 상세는 스레드 댓글(buildScenarioThreadMessage)로 분리
  if (result.scenarios.length > 0) {
    headerLines.push('───────────────');
    for (const scenario of result.scenarios) {
      const scenarioIcon = scenario.failures.length === 0 ? '✅' : '❌';
      const scenarioSkipped =
        scenario.skipped > 0 ? ` · 건너뜀 ${scenario.skipped}` : '';
      headerLines.push(
        `${scenarioIcon} *${scenario.name}* (${scenario.passed}/${scenario.total}${scenarioSkipped})`,
      );
    }
    headerLines.push('🧵 시나리오별 상세 결과는 스레드를 확인하세요');
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: headerLines.join('\n').slice(0, 3000) },
  });

  // 재실행 버튼 — 클릭한 사람이 새 실행자가 된다
  if (opts?.scenarios) {
    const elements: any[] = [
      {
        type: 'button',
        action_id: 'rerun_same',
        text: { type: 'plain_text', text: '▶️ 같은 조건으로 재실행' },
        value: JSON.stringify({ env, scenarios: opts.scenarios, browser }),
      },
    ];

    const failedKeys = result.scenarios
      .filter((s) => s.failures.length > 0)
      .map((s) => scenarioKeyByName(s.name))
      .filter((k): k is string => Boolean(k));
    if (failedKeys.length > 0) {
      elements.push({
        type: 'button',
        action_id: 'rerun_failed',
        text: { type: 'plain_text', text: '🔄 실패만 재실행' },
        style: 'danger',
        value: JSON.stringify({ env, scenarios: failedKeys, browser }),
      });
    }

    blocks.push({ type: 'actions', elements });
  }

  return blocks;
}

/** 스레드 댓글용 — 시나리오 하나의 케이스 전체(성공/실패/건너뜀) 상세 */
export function buildScenarioThreadMessage(
  scenario: import('./test-runner').ScenarioSummary,
): (KnownBlock | Block)[] {
  const caseIcons: Record<string, string> = {
    passed: '✅',
    flaky: '✅', // 재시도 후 통과
    failed: '❌',
    skipped: '⏭️',
  };
  const scenarioIcon = scenario.failures.length === 0 ? '✅' : '❌';
  const scenarioSkipped =
    scenario.skipped > 0 ? ` · 건너뜀 ${scenario.skipped}` : '';
  const lines = [
    `${scenarioIcon} *${scenario.name}* (${scenario.passed}/${scenario.total}${scenarioSkipped})`,
  ];
  for (const c of scenario.cases) {
    const retryMark = c.status === 'flaky' ? ' _(재시도 후 통과)_' : '';
    const noteMark = c.note ? ` — _${c.note}_` : '';
    lines.push(`　${caseIcons[c.status] ?? '•'} ${c.title}${retryMark}${noteMark}`);
  }
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 3000) },
    },
  ];
}

export function buildQueuedMessage(position: number): (KnownBlock | Block)[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⏳ 현재 다른 테스트가 실행 중이라 *대기열 ${position}번째*로 등록했습니다.\n차례가 되면 자동으로 실행하고 DM으로 알려드릴게요.`,
      },
    },
  ];
}

export function buildUsageMessage(errorDetail?: string): (KnownBlock | Block)[] {
  const envs = Object.keys(ENVIRONMENTS).join(', ');
  const scenarios = Object.entries(SCENARIOS)
    .map(([key, { name }]) => `${name}(${key})`)
    .join(', ');
  const errorLine = errorDetail ? `⚠️ ${errorDetail}\n\n` : '';
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `${errorLine}*사용법*\n` +
          '• `/sanity` — 환경/시나리오/브라우저 선택 UI 표시\n' +
          '• `/sanity dev3` — dev3에서 전체 시나리오 즉시 실행 (크롬)\n' +
          '• `/sanity dev3 이력서,회원` — 지정 시나리오만 즉시 실행\n' +
          '• `/sanity dev3 이력서 safari` — 사파리(WebKit)로 실행\n\n' +
          `*환경*: ${envs}\n*시나리오*: ${scenarios}\n*브라우저*: ${Object.entries(BROWSERS)
            .map(([key, name]) => `${key}(${name})`)
            .join(', ')} — 기본 chrome`,
      },
    },
  ];
}

export function buildErrorMessage(message: string): (KnownBlock | Block)[] {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠️ *테스트 실행 오류*\n${message}` },
    },
  ];
}

export function buildConflictMessage(
  info?: RunningInfo | null,
): (KnownBlock | Block)[] {
  let detail = '';
  if (info) {
    const elapsedMin = Math.floor((Date.now() - info.startedAt) / 60_000);
    const who = info.userId ? `<@${info.userId}>님이 ` : '';
    const env = info.env
      ? `\`${info.env}\`(${browserText(info.browser)}) 환경에서 `
      : '';
    const elapsed = elapsedMin > 0 ? ` (${elapsedMin}분 경과)` : ' (방금 시작)';
    detail = `\n${who}${env}실행 중입니다${elapsed}.`;
  }
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚫 이미 테스트가 실행 중입니다. 완료 후 다시 시도해주세요.${detail}`,
      },
    },
  ];
}

export function buildNotInChannelMessage(): (KnownBlock | Block)[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '⚠️ 결과를 채널에 게시하려면 봇이 채널에 있어야 합니다.\n`/invite @새니티봇` 으로 봇을 초대한 뒤 다시 실행해주세요.',
      },
    },
  ];
}
