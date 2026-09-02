import 'dotenv/config';

export const ENVIRONMENTS: Record<string, string> = {
  dev: 'https://dev.wanted.co.kr',
  dev2: 'https://dev2.wanted.co.kr',
  dev3: 'https://dev3.wanted.co.kr',
  dev4: 'https://dev4.wanted.co.kr',
  dev5: 'https://dev5.wanted.co.kr',
  dev6: 'https://dev6.wanted.co.kr',
  dev7: 'https://dev7.wanted.co.kr',
  dev8: 'https://dev8.wanted.co.kr',
  nextweek: 'https://nextweek.wanted.co.kr',
  wwwtest: 'https://wwwtest.wanted.co.kr',
};

export const SCENARIOS: Record<string, { name: string; file: string }> = {
  member: { name: "회원", file: "member.spec.ts" },
  profile: { name: "프로필", file: "profile.spec.ts" },
  "job-posting": { name: "채용공고", file: "job-posting.spec.ts" },
  "education-event": { name: "교육/이벤트", file: "education-event.spec.ts" },
  social: { name: "소셜", file: "social.spec.ts" },
  resume: { name: "이력서", file: "resume.spec.ts" },
};

// 실행 타임아웃: 기본 3분 + 시나리오당 3분, 상한 20분 (retries: 1로 인한 재시도 시간 포함)
const BASE_TIMEOUT_MS = 3 * 60 * 1000;
const PER_SCENARIO_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_TIMEOUT_MS = 20 * 60 * 1000;

export function calcTimeoutMs(scenarioCount: number): number {
  return Math.min(
    BASE_TIMEOUT_MS + scenarioCount * PER_SCENARIO_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
}

export const SLACK_CONFIG = {
  botToken: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  appToken: process.env.SLACK_APP_TOKEN!,
  // 실패 시 결과 메시지에 함께 멘션할 대상 (예: "<!subteam^S123ABC>", "@here"). 미설정 시 생략.
  failureMention: process.env.SLACK_FAILURE_MENTION,
};

/** 커맨드 인자 토큰(키 또는 한글 이름)을 시나리오 키로 해석. 미일치 시 undefined */
export function resolveScenarioKey(token: string): string | undefined {
  const trimmed = token.trim();
  if (SCENARIOS[trimmed]) return trimmed;
  const entry = Object.entries(SCENARIOS).find(([, s]) => s.name === trimmed);
  return entry?.[0];
}

/** 시나리오 표시명(describe 제목) → 키. 실패한 시나리오만 재실행할 때 사용 */
export function scenarioKeyByName(name: string): string | undefined {
  const entry = Object.entries(SCENARIOS).find(([, s]) => s.name === name);
  return entry?.[0];
}

export type Browser = 'chrome' | 'safari' | 'mobile-chrome' | 'mobile-safari';

export const BROWSERS: Record<Browser, string> = {
  chrome: '크롬',
  safari: '사파리',
  'mobile-chrome': '모바일웹 크롬',
  'mobile-safari': '모바일웹 사파리',
};

/** 브라우저 토큰(키 또는 한글 이름) 해석. 미일치 시 undefined */
export function resolveBrowser(token: string): Browser | undefined {
  const trimmed = token.trim().toLowerCase();
  const aliases: Record<string, Browser> = {
    chrome: 'chrome',
    '크롬': 'chrome',
    safari: 'safari',
    '사파리': 'safari',
    'mobile-chrome': 'mobile-chrome',
    'mchrome': 'mobile-chrome',
    '모바일크롬': 'mobile-chrome',
    '모바일웹크롬': 'mobile-chrome',
    'mobile-safari': 'mobile-safari',
    'msafari': 'mobile-safari',
    '모바일사파리': 'mobile-safari',
    '모바일웹사파리': 'mobile-safari',
  };
  return aliases[trimmed];
}

/**
 * `/sanity [환경] [시나리오,...] [브라우저]` 인자 파싱.
 * 환경 이후 토큰은 순서 무관 — 브라우저 키워드/시나리오 목록을 자동 판별.
 */
export function parseCommandArgs(
  text: string,
): { env: string; scenarios: string[]; browser: Browser } | { error: string } {
  const tokens = text.split(/\s+/).filter(Boolean);
  const [envToken, ...restTokens] = tokens;

  if (!ENVIRONMENTS[envToken]) {
    return { error: `알 수 없는 환경: \`${envToken}\`` };
  }

  const scenarios: string[] = [];
  let browser: Browser | undefined;

  for (const raw of restTokens) {
    const asBrowser = resolveBrowser(raw);
    if (asBrowser) {
      if (browser) {
        return { error: `브라우저는 하나만 지정할 수 있습니다: \`${raw}\`` };
      }
      browser = asBrowser;
      continue;
    }
    for (const token of raw.split(',').filter(Boolean)) {
      const key = resolveScenarioKey(token);
      if (!key) {
        return { error: `알 수 없는 시나리오/브라우저: \`${token}\`` };
      }
      if (!scenarios.includes(key)) scenarios.push(key);
    }
  }

  return { env: envToken, scenarios, browser: browser ?? 'chrome' };
}
