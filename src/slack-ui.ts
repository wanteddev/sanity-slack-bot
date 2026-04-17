import type { Block, KnownBlock } from '@slack/types';
import { ENVIRONMENTS, SCENARIOS } from './config';
import type { TestResult } from './test-runner';

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

export function buildRunningMessage(
  env: string,
  scenarios: string[],
  userId: string,
): (KnownBlock | Block)[] {
  const scenarioText =
    scenarios.length === 0
      ? '전체'
      : scenarios.map((s) => SCENARIOS[s]?.name ?? s).join(', ');

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⏳ *새니티 테스트 실행 중...*\n\n• 환경: \`${env}\` (${ENVIRONMENTS[env]})\n• 시나리오: ${scenarioText}\n• 실행자: <@${userId}>`,
      },
    },
  ];
}

export function buildResultMessage(
  env: string,
  result: TestResult,
): (KnownBlock | Block)[] {
  const blocks: (KnownBlock | Block)[] = [];
  const allPassed = result.failed === 0;
  const icon = allPassed ? '✅' : '❌';
  const status = allPassed ? '전체 통과' : '실패 발생';

  const lines: string[] = [
    `${icon} *새니티 테스트 ${status}*`,
    `• 환경: \`${env}\` (${ENVIRONMENTS[env]})`,
    `• 통과: ${result.passed}건 / 실패: ${result.failed}건`,
    `• 소요시간: ${result.duration}`,
  ];

  if (result.scenarios.length > 0) {
    lines.push('───────────────');
    for (const scenario of result.scenarios) {
      const scenarioIcon = scenario.failures.length === 0 ? '✅' : '❌';
      lines.push(`${scenarioIcon} *${scenario.name}* (${scenario.passed}/${scenario.total})`);

      for (const failure of scenario.failures) {
        lines.push(`     └ ${failure.title}`);
      }
    }
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 3000) },
  });

  return blocks;
}

export function buildErrorMessage(message: string): (KnownBlock | Block)[] {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠️ *테스트 실행 오류*\n${message}` },
    },
  ];
}

export function buildConflictMessage(): (KnownBlock | Block)[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🚫 이미 테스트가 실행 중입니다. 완료 후 다시 시도해주세요.',
      },
    },
  ];
}
