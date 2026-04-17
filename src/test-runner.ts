import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { SCENARIOS, TEST_TIMEOUT_MS } from './config';

export interface TestFailure {
  title: string;
  error: string;
  videoPath?: string;
}

export interface ScenarioSummary {
  name: string;
  passed: number;
  total: number;
  failures: TestFailure[];
}

export interface TestResult {
  passed: number;
  failed: number;
  duration: string;
  failures: TestFailure[];
  scenarios: ScenarioSummary[];
}

let isRunning = false;

export function isTestRunning(): boolean {
  return isRunning;
}

export async function runTests(
  baseURL: string,
  scenarios: string[],
): Promise<TestResult> {
  if (isRunning) {
    throw new Error('CONFLICT');
  }

  isRunning = true;
  const resultsDir = path.resolve(__dirname, '..', 'e2e', 'test-results');

  try {
    // 이전 결과 정리
    if (fs.existsSync(resultsDir)) {
      fs.rmSync(resultsDir, { recursive: true });
    }

    const testFiles =
      scenarios.length > 0
        ? scenarios
            .map((s) => SCENARIOS[s]?.file)
            .filter(Boolean)
            .map((f) => `e2e/${f}`)
            .join(' ')
        : '';

    const cmd = [
      path.resolve(__dirname, "..", "node_modules", ".bin", "playwright"),
      "test",
      "--config=playwright.sanity.config.ts",
      "--reporter=json",
      testFiles,
    ]
      .filter(Boolean)
      .join(" ");

    const jsonOutput = await execAsync(cmd, {
      env: { ...process.env, E2E_BASE_URL: baseURL },
      timeout: TEST_TIMEOUT_MS,
    });

    return await parseResults(jsonOutput);
  } finally {
    isRunning = false;
  }
}

function execAsync(
  cmd: string,
  options: { env: NodeJS.ProcessEnv; timeout: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const cwd = path.resolve(__dirname, '..');

    exec(cmd, { ...options, cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Playwright는 테스트 실패 시 exit code 1을 반환하지만 JSON 출력은 정상
      if (error && !stdout) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function parseResults(jsonOutput: string): Promise<TestResult> {
  let report: any;
  try {
    report = JSON.parse(jsonOutput);
  } catch {
    return {
      passed: 0,
      failed: 1,
      duration: '0s',
      failures: [{ title: 'JSON 파싱 실패', error: 'Playwright 결과를 파싱할 수 없습니다.' }],
      scenarios: [],
    };
  }

  let passed = 0;
  let failed = 0;
  const failures: TestFailure[] = [];
  const scenarioMap = new Map<string, ScenarioSummary>();

  async function processSuite(suite: any, parentTitle: string, scenarioName: string) {
    const title = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const lastResult = test.results?.[test.results.length - 1];

        if (!scenarioMap.has(scenarioName)) {
          scenarioMap.set(scenarioName, { name: scenarioName, passed: 0, total: 0, failures: [] });
        }
        const scenario = scenarioMap.get(scenarioName)!;
        scenario.total++;

        if (test.status === "expected") {
          passed++;
          scenario.passed++;
        } else {
          failed++;
          const failure: TestFailure = {
            title: spec.title,
            error: lastResult?.error?.message ?? test.status,
          };

          const attachments = lastResult?.attachments ?? [];
          const video = attachments.find(
            (a: any) =>
              a.name === "video" ||
              (typeof a.path === "string" && a.path.endsWith(".webm")),
          );
          if (video?.path && fs.existsSync(video.path)) {
            failure.videoPath = video.path;
          }

          failures.push(failure);
          scenario.failures.push(failure);
        }
      }
    }

    for (const child of suite.suites ?? []) {
      await processSuite(child, title, scenarioName);
    }
  }

  // 재귀적으로 suite를 탐색
  // 첫 번째 의미 있는 describe title을 시나리오명으로 고정하고, 하위 describe는 같은 시나리오에 포함
  async function walkSuites(suite: any, scenarioName: string) {
    let currentScenario = scenarioName;
    // 아직 시나리오명이 없고, 이 suite가 의미 있는 describe title이면 고정
    if (!currentScenario && suite.title && !suite.title.endsWith('.ts')) {
      currentScenario = suite.title;
    }

    if ((suite.specs ?? []).length > 0) {
      const name = currentScenario || suite.title || '기타';
      await processSuite({ specs: suite.specs, suites: [] }, '', name);
    }

    for (const child of suite.suites ?? []) {
      await walkSuites(child, currentScenario);
    }
  }

  for (const topSuite of report.suites ?? []) {
    await walkSuites(topSuite, '');
  }

  const durationMs = report.stats?.duration ?? 0;
  const duration = `${(durationMs / 1000).toFixed(1)}s`;
  // auth.setup 등 내부 셋업 파일은 시나리오 목록에서 제외
  const scenarios = Array.from(scenarioMap.values()).filter(
    s => !s.name.endsWith('.ts'),
  );

  return { passed, failed, duration, failures, scenarios };
}
