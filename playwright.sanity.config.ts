import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  retries: 0,
  workers: 3,
  timeout: 30_000,
  reporter: [['json', { outputFile: undefined }]],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://dev.wanted.co.kr',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
        storageState: 'e2e/.auth/user.json',
      },
    },

    // ── Desktop Safari (비활성) ──
    // {
    //   name: 'safari',
    //   testMatch: /member\.spec\.ts/,
    //   use: { ...devices['Desktop Safari'] },
    // },
    // {
    //   name: 'safari-auth',
    //   testIgnore: /member\.spec\.ts/,
    //   dependencies: ['setup'],
    //   use: {
    //     ...devices['Desktop Safari'],
    //     storageState: 'e2e/.auth/user.json',
    //   },
    // },

    // ── Mobile (비활성) ──
    // {
    //   name: 'mobile',
    //   testMatch: /member\.spec\.ts/,
    //   use: { ...devices['iPhone 14'] },
    // },
    // {
    //   name: 'mobile-auth',
    //   testIgnore: /member\.spec\.ts/,
    //   dependencies: ['setup'],
    //   use: {
    //     ...devices['iPhone 14'],
    //     storageState: 'e2e/.auth/user.json',
    //   },
    // },
  ],
});
