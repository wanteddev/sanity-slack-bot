import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { getAuthFile } from './e2e/helpers/auth-file';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  // flaky 보완: 재시도 후 통과하면 러너가 통과로 집계함 (trace는 재시도 시에만 기록)
  retries: 1,
  // 봇 서버 파드가 4 vCPU / 4GiB 고정. WebKit은 워커당 웹프로세스만 ~1GB·1코어 이상을 쓰므로
  // 워커 3개면 메모리가 한도(4GiB)에 닿아 페이지가 멈추고 타임아웃 실패가 난다(cgroup memory.events max 다수).
  // 속도보다 안정성을 우선해 2개로 고정. 필요 시 SANITY_WORKERS로 조정.
  workers: Number(process.env.SANITY_WORKERS) || 2,
  // 자원 경합 구간의 느린 페이지 로드를 흡수 (30s는 waitForURL 상한과 같아 진짜 원인이 가려졌음)
  timeout: 45_000,
  reporter: [['json', { outputFile: undefined }]],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://dev.wanted.co.kr',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // 재시도 시에만 녹화 — 정상 케이스의 상시 ffmpeg 인코딩 비용 제거.
    // retries: 1이라 최종 실패는 반드시 재시도를 거치므로 실패 영상은 보존됨.
    video: 'on-first-retry',
    headless: true,
    navigationTimeout: 15_000,
    actionTimeout: 10_000,
  },

  projects: [
    // ── Setup ──
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ── Desktop Chrome ──
    {
      name: 'chrome',
      testMatch: /member\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chrome-auth',
      testIgnore: /member\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        // 환경별 세션 캐시 (auth.setup이 검증/갱신)
        storageState: getAuthFile(),
      },
    },

    // ── Desktop Safari (WebKit) ──
    // 러너가 --project 필터로 크롬/사파리 중 하나를 선택해 실행한다.
    // 인증 셋업은 크롬(setup)으로 수행하고 storageState(JSON 쿠키)를 공유.
    {
      name: 'safari',
      testMatch: /member\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'safari-auth',
      testIgnore: /member\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Safari'],
        storageState: getAuthFile(),
      },
    },

    // ── 모바일웹 Chrome (Pixel 7, Chromium) ──
    {
      name: 'mobile-chrome',
      testMatch: /member\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-chrome-auth',
      testIgnore: /member\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
        storageState: getAuthFile(),
      },
    },

    // ── 모바일웹 Safari (iPhone 14, WebKit) ──
    {
      name: 'mobile-safari',
      testMatch: /member\.spec\.ts/,
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'mobile-safari-auth',
      testIgnore: /member\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['iPhone 14'],
        storageState: getAuthFile(),
      },
    },
  ],
});
