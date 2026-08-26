import fs from 'fs';
import path from 'path';
import type { WebClient } from '@slack/web-api';
import { buildScenarioThreadMessage } from './slack-ui';
import type { TestResult } from './test-runner';

/**
 * 시나리오별 상세 결과를 스레드 댓글로 게시하고,
 * 각 시나리오의 실패 아티팩트(스크린샷 → 영상 → trace)를 댓글 뒤에 이어 업로드한다.
 * 봇 서버(Slack 액션)와 CI 스크립트가 공용으로 사용.
 */
export async function postScenarioResults(
  client: WebClient,
  channelId: string,
  threadTs: string,
  result: TestResult,
) {
  const totalFailures = result.scenarios.reduce(
    (acc, s) => acc + s.failures.length,
    0,
  );
  console.log(
    `[thread-post] scenarios=${result.scenarios.length}, failures=${totalFailures}, channel=${channelId}, thread=${threadTs}`,
  );

  for (const scenario of result.scenarios) {
    // 시나리오별 상세 결과를 스레드 댓글로 게시 (메인 메시지는 요약만)
    const scenarioIcon = scenario.failures.length === 0 ? '✅' : '❌';
    try {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `${scenarioIcon} ${scenario.name} (${scenario.passed}/${scenario.total})`,
        blocks: buildScenarioThreadMessage(scenario),
      });
    } catch (e) {
      console.error(`[thread-post] ${scenario.name} 댓글 게시 실패:`, e);
    }

    // 해당 시나리오의 실패 아티팩트를 댓글 바로 뒤에 이어서 업로드 (시나리오별 그룹핑)
    for (const failure of scenario.failures) {
      const safeName = `${scenario.name}-${failure.title}`
        .replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
        .slice(0, 80);
      const comment = `❌ *${scenario.name}* > ${failure.title}`;

      // 스크린샷 우선(가볍고 스레드에서 즉시 미리보기됨), 영상·trace는 보조로 뒤이어 업로드
      const uploads: { path?: string; label: string; comment?: string }[] = [
        { path: failure.screenshotPath, label: 'screenshot', comment },
        {
          path: failure.videoPath,
          label: 'video',
          comment: failure.screenshotPath ? undefined : comment,
        },
        {
          path: failure.tracePath,
          label: 'trace',
          comment: '🧭 trace 파일 — https://trace.playwright.dev 에 드래그하면 타임라인/네트워크/DOM을 볼 수 있습니다',
        },
      ];

      for (const { path: filePath, label, comment: initialComment } of uploads) {
        if (!filePath) {
          console.log(`[artifact-upload] no ${label}: ${scenario.name} > ${failure.title}`);
          continue;
        }
        if (!fs.existsSync(filePath)) {
          console.warn(`[artifact-upload] file missing: ${filePath}`);
          continue;
        }

        const ext = path.extname(filePath) || '';
        const buffer = fs.readFileSync(filePath);
        console.log(
          `[artifact-upload] uploading ${label} ${safeName}${ext} (${buffer.length} bytes)`,
        );

        try {
          await client.files.uploadV2({
            channel_id: channelId,
            thread_ts: threadTs,
            ...(initialComment ? { initial_comment: initialComment } : {}),
            file: buffer,
            filename: `${safeName}${ext}`,
          });
        } catch (e) {
          console.error(`[artifact-upload] ${label} 업로드 실패:`, e);
        }
      }
    }
  }
}
