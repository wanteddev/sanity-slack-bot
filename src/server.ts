import { App } from '@slack/bolt';
import fs from 'fs';
import path from 'path';
import { SLACK_CONFIG, ENVIRONMENTS } from './config';
import {
  buildCommandUI,
  buildRunningMessage,
  buildResultMessage,
  buildErrorMessage,
  buildConflictMessage,
} from './slack-ui';
import { runTests, isTestRunning, type TestResult } from './test-runner';

const app = new App({
  token: SLACK_CONFIG.botToken,
  signingSecret: SLACK_CONFIG.signingSecret,
  appToken: SLACK_CONFIG.appToken,
  socketMode: true,
});

// 사용자 선택 상태를 임시 저장 (userId -> selections)
const userSelections = new Map<
  string,
  { env?: string; scenarios: string[] }
>();

// /sanity 슬래시 커맨드
app.command('/sanity', async ({ ack, respond }) => {
  await ack();
  await respond({
    response_type: 'ephemeral',
    blocks: buildCommandUI(),
  });
});

// 환경 선택 액션
app.action('select_env', async ({ ack, body }) => {
  await ack();
  const userId = body.user.id;
  const action = (body as any).actions?.[0];
  const selection = userSelections.get(userId) ?? { scenarios: [] };
  selection.env = action?.selected_option?.value;
  userSelections.set(userId, selection);
});

// 시나리오 선택 액션
app.action('select_scenarios', async ({ ack, body }) => {
  await ack();
  const userId = body.user.id;
  const action = (body as any).actions?.[0];
  const selection = userSelections.get(userId) ?? { scenarios: [] };
  selection.scenarios =
    action?.selected_options?.map((o: any) => o.value) ?? [];
  userSelections.set(userId, selection);
});

// 테스트 실행 버튼
app.action("run_sanity", async ({ ack, body, respond, client }) => {
  await ack();
  const userId = body.user.id;
  const channelId = (body as any).channel?.id;
  const selection = userSelections.get(userId);

  if (!selection?.env) {
    await respond({
      response_type: "ephemeral",
      text: "⚠️ 환경을 선택해주세요.",
      replace_original: false,
    });
    return;
  }

  // 동시 실행 체크
  if (isTestRunning()) {
    await respond({
      response_type: "ephemeral",
      blocks: buildConflictMessage(),
      replace_original: false,
    });
    return;
  }

  const env = selection.env;
  const scenarios = selection.scenarios;
  const baseURL = ENVIRONMENTS[env];

  if (!baseURL) {
    await respond({
      response_type: "ephemeral",
      text: `⚠️ 알 수 없는 환경: ${env}`,
      replace_original: false,
    });
    return;
  }

  // 실행 중 메시지로 교체 (ephemeral)
  await respond({
    response_type: "ephemeral",
    blocks: buildRunningMessage(env, scenarios, userId),
    replace_original: true,
  });

  try {
    const result = await runTests(baseURL, scenarios);

    // 진행 중 ephemeral 메시지 제거
    await respond({
      response_type: "ephemeral",
      text: "테스트 완료 — 결과를 채널에 게시했습니다.",
      replace_original: true,
    });

    const posted = await client.chat.postMessage({
      channel: channelId,
      text: "새니티 테스트 완료",
      blocks: buildResultMessage(env, result),
    });

    if (posted.ts) {
      await uploadFailureVideos(client, channelId, posted.ts, result);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "알 수 없는 오류가 발생했습니다.";

    try {
      await respond({
        response_type: "ephemeral",
        blocks: buildErrorMessage(message),
        replace_original: true,
      });
    } catch {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `테스트 실행 오류: ${message}`,
        blocks: buildErrorMessage(message),
      });
    }
  } finally {
    userSelections.delete(userId);
  }
});

async function uploadFailureVideos(
  client: App['client'],
  channelId: string,
  threadTs: string,
  result: TestResult,
) {
  const totalFailures = result.scenarios.reduce(
    (acc, s) => acc + s.failures.length,
    0,
  );
  const withVideo = result.scenarios.reduce(
    (acc, s) => acc + s.failures.filter((f) => f.videoPath).length,
    0,
  );
  console.log(
    `[video-upload] failures=${totalFailures}, with videoPath=${withVideo}, channel=${channelId}, thread=${threadTs}`,
  );

  for (const scenario of result.scenarios) {
    for (const failure of scenario.failures) {
      if (!failure.videoPath) {
        console.log(`[video-upload] no videoPath: ${scenario.name} > ${failure.title}`);
        continue;
      }
      if (!fs.existsSync(failure.videoPath)) {
        console.warn(`[video-upload] file missing: ${failure.videoPath}`);
        continue;
      }

      const ext = path.extname(failure.videoPath) || '.webm';
      const safeName = `${scenario.name}-${failure.title}`
        .replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
        .slice(0, 80);
      const buffer = fs.readFileSync(failure.videoPath);
      console.log(
        `[video-upload] uploading ${safeName}${ext} (${buffer.length} bytes)`,
      );

      try {
        const res = await client.files.uploadV2({
          channel_id: channelId,
          thread_ts: threadTs,
          initial_comment: `❌ *${scenario.name}* > ${failure.title}`,
          file: buffer,
          filename: `${safeName}${ext}`,
        });
        console.log(`[video-upload] ok:`, JSON.stringify(res).slice(0, 300));
      } catch (e) {
        console.error('[video-upload] 실패:', e);
      }
    }
  }
}

(async () => {
  await app.start();
  console.log('⚡️ 새니티 테스트 봇이 시작되었습니다.');
})();
