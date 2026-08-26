import crypto from 'crypto';
import { App } from '@slack/bolt';
import { postScenarioResults } from './slack-report';
import { runDeploySanity, isDeploySanityRunning } from './deploy-sanity';
import {
  SLACK_CONFIG,
  ENVIRONMENTS,
  BROWSERS,
  parseCommandArgs,
  type Browser,
} from './config';
import {
  buildCommandUI,
  buildProgressMessage,
  buildResultMessage,
  buildErrorMessage,
  buildConflictMessage,
  buildNotInChannelMessage,
  buildQueuedMessage,
  buildUsageMessage,
  buildCancelledMessage,
} from './slack-ui';
import {
  runTests,
  isTestRunning,
  getRunningInfo,
  cancelRun,
  type TestResult,
  type RunProgress,
} from './test-runner';

const app = new App({
  token: SLACK_CONFIG.botToken,
  signingSecret: SLACK_CONFIG.signingSecret,
  appToken: SLACK_CONFIG.appToken,
  socketMode: true,
});

// 사용자 선택 상태를 임시 저장 (userId -> selections)
const userSelections = new Map<
  string,
  { env?: string; scenarios: string[]; browser: Browser }
>();

// ─────────────────────────────────────────────
// 실행 요청 / 대기열
// ─────────────────────────────────────────────

interface RunRequest {
  userId: string;
  channelId: string;
  env: string;
  scenarios: string[];
  browser: Browser;
}

const MAX_QUEUE = 5;
const queue: RunRequest[] = [];

// 취소 버튼을 누른 사용자 — CANCELLED 처리 시 취소자 표기에 사용
let cancelledBy: string | null = null;

type Respond = (args: any) => Promise<unknown>;

/**
 * 실행 요청 진입점. 실행 중이면 대기열에 등록하고, 아니면 즉시 시작한다.
 * 대기열/시작 여부는 ephemeral로 요청자에게만 알린다.
 */
async function requestRun(
  req: RunRequest,
  client: App['client'],
  respond: Respond,
  replaceOriginal: boolean,
) {
  // 배포 새니티는 브라우저 사이에 per-run 락이 잠깐 풀리므로 deploy 게이트도 함께 확인
  if (isTestRunning() || isDeploySanityRunning()) {
    if (queue.some((q) => q.userId === req.userId)) {
      await respond({
        response_type: 'ephemeral',
        text: '⚠️ 이미 대기열에 등록되어 있습니다.',
        replace_original: false,
      });
      return;
    }
    if (queue.length >= MAX_QUEUE) {
      await respond({
        response_type: 'ephemeral',
        blocks: buildConflictMessage(getRunningInfo()),
        text: `🚫 대기열이 가득 찼습니다 (최대 ${MAX_QUEUE}개).`,
        replace_original: false,
      });
      return;
    }
    queue.push(req);
    await respond({
      response_type: 'ephemeral',
      blocks: buildQueuedMessage(queue.length),
      text: `대기열 ${queue.length}번째로 등록했습니다.`,
      replace_original: replaceOriginal,
    });
    return;
  }

  await respond({
    response_type: 'ephemeral',
    text: '▶️ 테스트를 시작했습니다 — 진행 상황은 채널 메시지에서 확인하세요.',
    replace_original: replaceOriginal,
  });
  void startRun(req, client);
}

/**
 * 실제 실행 오케스트레이터.
 * 채널에 진행 메시지를 게시하고, 진행 상황으로 갱신하다가 완료 시 결과로 교체한다.
 * 종료 후 대기열의 다음 요청을 자동 시작한다.
 */
async function startRun(req: RunRequest, client: App['client']) {
  const { userId, channelId, env, scenarios, browser } = req;
  const baseURL = ENVIRONMENTS[env];

  try {
    let posted;
    try {
      posted = await client.chat.postMessage({
        channel: channelId,
        text: '⏳ 새니티 테스트 실행 중...',
        blocks: buildProgressMessage(env, scenarios, userId, browser),
      });
    } catch (postError) {
      if (String(postError).includes('not_in_channel')) {
        await notifyUser(client, userId, buildNotInChannelMessage(), '봇이 채널에 없어 결과를 게시할 수 없습니다.');
        return;
      }
      throw postError;
    }
    const messageTs = posted.ts!;

    // chat.update를 직렬화해 진행 갱신이 최종 결과를 덮어쓰지 않게 한다
    let updateChain: Promise<unknown> = Promise.resolve();
    let finished = false;
    let lastProgressAt = 0;

    const onProgress = (progress: RunProgress) => {
      const now = Date.now();
      if (finished || now - lastProgressAt < 3_000) return;
      lastProgressAt = now;
      updateChain = updateChain.then(() => {
        if (finished) return;
        return client.chat
          .update({
            channel: channelId,
            ts: messageTs,
            text: `⏳ 새니티 테스트 실행 중... (${progress.done}/${progress.total})`,
            blocks: buildProgressMessage(env, scenarios, userId, browser, progress),
          })
          .catch((e) => console.warn('[progress] 갱신 실패:', String(e).slice(0, 120)));
      });
    };

    try {
      const result = await runTests(baseURL, scenarios, { userId, env, browser }, onProgress);

      finished = true;
      await updateChain;
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: '새니티 테스트 완료',
        blocks: buildResultMessage(env, result, { runBy: userId, scenarios, browser }),
      });
      await postScenarioResults(client, channelId, messageTs, result);
    } catch (error) {
      finished = true;
      await updateChain;
      const message =
        error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

      let blocks;
      let text;
      if (message === 'CANCELLED') {
        blocks = buildCancelledMessage(env, scenarios, cancelledBy ?? userId, browser);
        text = '⏹ 새니티 테스트가 취소되었습니다.';
        cancelledBy = null;
      } else if (message === 'CONFLICT') {
        // lock 체크와 실행 사이의 근소한 race로 CONFLICT가 던져진 경우
        blocks = buildConflictMessage(getRunningInfo());
        text = '이미 테스트가 실행 중입니다.';
      } else {
        blocks = buildErrorMessage(message);
        text = `테스트 실행 오류: ${message}`;
      }
      await client.chat
        .update({ channel: channelId, ts: messageTs, text, blocks })
        .catch((e) => console.error('[run] 오류 메시지 게시 실패:', e));
    }
  } finally {
    drainQueue(client);
  }
}

/** 대기열의 다음 요청을 시작하고 대기자에게 DM으로 알린다 */
function drainQueue(client: App['client']) {
  const next = queue.shift();
  if (!next) return;

  client.chat
    .postMessage({
      channel: next.userId, // DM
      text: `▶️ 대기하시던 새니티 테스트를 시작합니다 — 환경: ${next.env} (${next.browser}). 진행 상황은 <#${next.channelId}> 채널에서 확인하세요.`,
    })
    .catch((e) => console.warn('[queue] DM 알림 실패:', String(e).slice(0, 120)));

  void startRun(next, client);
}

async function notifyUser(
  client: App['client'],
  userId: string,
  blocks: ReturnType<typeof buildNotInChannelMessage>,
  fallbackText: string,
) {
  try {
    await client.chat.postMessage({ channel: userId, text: fallbackText, blocks });
  } catch (e) {
    console.error('[notify] DM 실패:', e);
  }
}

// ─────────────────────────────────────────────
// Slack 핸들러
// ─────────────────────────────────────────────

// /sanity 슬래시 커맨드 — 인자가 있으면 즉시 실행, 없으면 선택 UI
app.command('/sanity', async ({ ack, respond, command, client }) => {
  await ack();
  const text = (command.text || '').trim();

  if (!text) {
    await respond({
      response_type: 'ephemeral',
      blocks: buildCommandUI(),
    });
    return;
  }

  if (text === 'help') {
    await respond({ response_type: 'ephemeral', blocks: buildUsageMessage() });
    return;
  }

  const parsed = parseCommandArgs(text);
  if ('error' in parsed) {
    await respond({
      response_type: 'ephemeral',
      blocks: buildUsageMessage(parsed.error),
    });
    return;
  }

  await requestRun(
    {
      userId: command.user_id,
      channelId: command.channel_id,
      env: parsed.env,
      scenarios: parsed.scenarios,
      browser: parsed.browser,
    },
    client,
    respond as Respond,
    false,
  );
});

// 환경 선택 액션
app.action('select_env', async ({ ack, body }) => {
  await ack();
  const userId = body.user.id;
  const action = (body as any).actions?.[0];
  const selection = userSelections.get(userId) ?? { scenarios: [], browser: 'chrome' as Browser };
  selection.env = action?.selected_option?.value;
  userSelections.set(userId, selection);
});

// 시나리오 선택 액션
app.action('select_scenarios', async ({ ack, body }) => {
  await ack();
  const userId = body.user.id;
  const action = (body as any).actions?.[0];
  const selection = userSelections.get(userId) ?? { scenarios: [], browser: 'chrome' as Browser };
  selection.scenarios =
    action?.selected_options?.map((o: any) => o.value) ?? [];
  userSelections.set(userId, selection);
});

// 브라우저 선택 액션
app.action('select_browser', async ({ ack, body }) => {
  await ack();
  const userId = body.user.id;
  const action = (body as any).actions?.[0];
  const selection = userSelections.get(userId) ?? { scenarios: [], browser: 'chrome' as Browser };
  const value = action?.selected_option?.value;
  if (value && value in BROWSERS) {
    selection.browser = value as Browser;
  }
  userSelections.set(userId, selection);
});

// 테스트 실행 버튼 (선택 UI)
app.action('run_sanity', async ({ ack, body, respond, client }) => {
  await ack();
  const userId = body.user.id;
  const channelId = (body as any).channel?.id;
  const selection = userSelections.get(userId);

  if (!selection?.env) {
    await respond({
      response_type: 'ephemeral',
      text: '⚠️ 환경을 선택해주세요.',
      replace_original: false,
    });
    return;
  }

  userSelections.delete(userId);
  await requestRun(
    { userId, channelId, env: selection.env, scenarios: selection.scenarios, browser: selection.browser },
    client,
    respond as Respond,
    true, // 선택 UI를 안내 메시지로 교체
  );
});

// 진행 메시지의 취소 버튼 — 실행자 본인만 취소 가능
app.action('cancel_run', async ({ ack, body, respond }) => {
  await ack();
  const clickerId = body.user.id;
  const value = (body as any).actions?.[0]?.value;

  let runBy: string | undefined;
  try {
    runBy = JSON.parse(value)?.runBy;
  } catch {
    // value 파싱 실패 시 실행자 확인 불가 → 아래 로직에서 거부됨
  }

  if (runBy && clickerId !== runBy) {
    await respond({
      response_type: 'ephemeral',
      text: `⚠️ 실행자(<@${runBy}>)만 취소할 수 있습니다.`,
      replace_original: false,
    });
    return;
  }

  cancelledBy = clickerId;
  const cancelled = cancelRun();
  if (!cancelled) {
    cancelledBy = null;
    await respond({
      response_type: 'ephemeral',
      text: 'ℹ️ 실행 중인 테스트가 없습니다 (이미 종료됨).',
      replace_original: false,
    });
  }
  // 취소 성공 시 진행 메시지는 startRun의 CANCELLED 처리에서 교체됨
});

// 결과 메시지의 재실행 버튼 (같은 조건 / 실패만)
for (const actionId of ['rerun_same', 'rerun_failed'] as const) {
  app.action(actionId, async ({ ack, body, respond, client }) => {
    await ack();
    const userId = body.user.id;
    const channelId = (body as any).channel?.id;
    const value = (body as any).actions?.[0]?.value;

    let parsed: { env: string; scenarios: string[]; browser?: Browser };
    try {
      parsed = JSON.parse(value);
    } catch {
      await respond({
        response_type: 'ephemeral',
        text: '⚠️ 재실행 정보를 읽을 수 없습니다. /sanity로 다시 실행해주세요.',
        replace_original: false,
      });
      return;
    }

    await requestRun(
      { userId, channelId, env: parsed.env, scenarios: parsed.scenarios, browser: parsed.browser ?? 'chrome' },
      client,
      respond as Respond,
      false, // 결과 메시지는 보존
    );
  });
}


// ─────────────────────────────────────────────
// 배포 트리거 (GitHub Actions → Slack 메시지 → 봇)
// ─────────────────────────────────────────────
//
// GitHub 러너는 CloudFront 지역/IP 차단으로 wwwtest에 직접 접근할 수 없어,
// 배포 워크플로우가 이 채널에 트리거 메시지를 게시하면 사내망의 봇이 대신 실행한다.
//
// 메시지 형식: "sanity-deploy env=<환경> ts=<unix초> sig=<hmac>"
//   sig = HMAC-SHA256("<환경>:<ts>", SANITY_TRIGGER_SECRET) hex
//
// 검증: (1) SANITY_TRIGGER_CHANNEL 채널 일치 (2) HMAC 서명 (3) 10분 이내 신선도
//       (4) 동일 서명 재사용(replay) 차단. 워크플로우는 DEPLOY 봇 토큰으로 게시해야 한다
//       — 이 앱의 토큰으로 게시하면 Bolt의 ignoreSelf가 이벤트를 걸러 트리거되지 않는다.
//
// 사전 조건: Slack 앱에 message.channels 이벤트 구독 + channels:history 스코프,
//            트리거 채널에 이 봇과 DEPLOY 봇 모두 초대.

const TRIGGER_PREFIX = 'sanity-deploy';
const TRIGGER_MAX_AGE_MS = 10 * 60 * 1000;
const seenTriggerSigs = new Set<string>();

function verifyTriggerSig(env: string, ts: string, sig: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(`${env}:${ts}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.event('message', async ({ event, client }) => {
  const msg = event as { channel?: string; text?: string; ts?: string; subtype?: string };
  const text = (msg.text ?? '').trim();
  if (!text.startsWith(TRIGGER_PREFIX)) return;

  const reply = (replyText: string) =>
    client.chat
      .postMessage({ channel: msg.channel!, thread_ts: msg.ts, text: replyText })
      .catch((e) => console.warn('[deploy-trigger] 응답 실패:', String(e).slice(0, 120)));

  const secret = process.env.SANITY_TRIGGER_SECRET;
  const triggerChannel = process.env.SANITY_TRIGGER_CHANNEL;
  if (!secret || !triggerChannel) {
    console.warn('[deploy-trigger] SANITY_TRIGGER_SECRET/CHANNEL 미설정 — 트리거 무시');
    return;
  }
  if (msg.channel !== triggerChannel) {
    console.warn(`[deploy-trigger] 허용되지 않은 채널(${msg.channel}) — 무시`);
    return;
  }

  const params = new Map(
    text
      .slice(TRIGGER_PREFIX.length)
      .trim()
      .split(/\s+/)
      .map((kv) => kv.split('=') as [string, string]),
  );
  const envKey = params.get('env') ?? '';
  const ts = params.get('ts') ?? '';
  const sig = params.get('sig') ?? '';

  if (!ENVIRONMENTS[envKey] || !ts || !sig) {
    await reply('⚠️ 트리거 형식이 올바르지 않습니다. (`sanity-deploy env=<환경> ts=<unix초> sig=<hmac>`)');
    return;
  }
  if (Math.abs(Date.now() - Number(ts) * 1000) > TRIGGER_MAX_AGE_MS) {
    await reply('⚠️ 트리거가 만료되었습니다 (10분 초과).');
    return;
  }
  if (!verifyTriggerSig(envKey, ts, sig, secret)) {
    console.warn('[deploy-trigger] 서명 불일치 — 무시');
    await reply('⚠️ 트리거 서명이 올바르지 않습니다.');
    return;
  }
  if (seenTriggerSigs.has(sig)) {
    console.warn('[deploy-trigger] 재사용된 트리거 — 무시');
    return;
  }
  seenTriggerSigs.add(sig);
  if (seenTriggerSigs.size > 100) {
    seenTriggerSigs.delete(seenTriggerSigs.values().next().value!);
  }

  if (isDeploySanityRunning()) {
    await reply('🚫 이미 배포 새니티가 실행 중입니다 — 이 트리거는 무시합니다.');
    return;
  }

  const browsers = (process.env.SANITY_BROWSERS || 'chrome,safari,mobile-chrome,mobile-safari')
    .split(',')
    .map((s) => s.trim())
    .filter((b): b is Browser => b in BROWSERS);

  await reply(
    `▶️ 배포 새니티를 시작합니다 — 환경: \`${envKey}\`, 브라우저: ${browsers.map((b) => BROWSERS[b]).join(' → ')}` +
      (isTestRunning() ? '\n(수동 실행이 진행 중이라 종료 후 시작됩니다)' : ''),
  );

  void (async () => {
    try {
      await runDeploySanity({
        envKey,
        browsers,
        scenarios: [],
        slack: { client, channel: msg.channel! },
        triggeredBy: 'GitHub Actions 배포',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[deploy-trigger] 실행 오류:', message);
      await reply(`❌ 배포 새니티 실행 오류: ${message.slice(0, 200)}`);
    } finally {
      // 배포 실행 동안 대기열에 쌓인 수동 요청 재개
      drainQueue(client);
    }
  })();
});

(async () => {
  await app.start();
  console.log('⚡️ 새니티 테스트 봇이 시작되었습니다.');
})();
