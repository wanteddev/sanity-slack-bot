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

export const TEST_TIMEOUT_MS = 3 * 60 * 1000; // 3분

export const SLACK_CONFIG = {
  botToken: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  appToken: process.env.SLACK_APP_TOKEN!,
};
