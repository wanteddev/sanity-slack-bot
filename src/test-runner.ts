import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { SCENARIOS, calcTimeoutMs, type Browser } from './config';

export type { Browser } from './config';

export interface TestFailure {
  title: string;
  error: string;
  screenshotPath?: string;
  videoPath?: string;
  tracePath?: string;
}

export interface TestCase {
  title: string;
  status: 'passed' | 'flaky' | 'skipped' | 'failed';
  note?: string; // 건너뜀 사유 (test.skip의 description)
}

export interface ScenarioSummary {
  name: string;
  passed: number;
  skipped: number;
  total: number;
  cases: TestCase[]; // 성공/실패/건너뜀 전체 케이스 (결과 메시지 표시용)
  failures: TestFailure[];
}

export interface TestResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  failures: TestFailure[];
  scenarios: ScenarioSummary[];
}

export interface RunningInfo {
  userId: string;
  env: string;
  browser: Browser;
  startedAt: number;
}

// in-memory lock: 봇이 단일 인스턴스로 배포된다는 전제.
// 컨테이너를 2개 이상 띄우면 동시 실행 방지가 무력화되므로 반드시 1개만 운영할 것.
let running: RunningInfo | null = null;

export function isTestRunning(): boolean {
  return running !== null;
}

export function getRunningInfo(): RunningInfo | null {
  return running;
}

// 현재 실행 중인 Playwright 프로세스 — 취소 요청 시 프로세스 그룹 단위로 종료
let currentChild: ChildProcess | null = null;
let cancelRequested = false;

/** 실행 중인 테스트를 취소한다. 실행 중이 아니면 false 반환 */
export function cancelRun(): boolean {
  if (!currentChild?.pid) return false;
  cancelRequested = true;
  try {
    process.kill(-currentChild.pid, 'SIGKILL');
  } catch {
    currentChild.kill('SIGKILL');
  }
  return true;
}

export interface RunProgress {
  done: number;
  total: number;
  current?: string; // 최근 완료된 테스트가 속한 시나리오 표시명
}

// line 리포터 출력에서 진행 정보를 추출:
//   "[12/35] [chrome-auth] › e2e/resume.spec.ts:6:5 › ..."
//   "[11/10] (retries) [chrome-auth] › e2e/resume.spec.ts:70:5 › ... (retry #1)"  ← 재시도 실행
// 주의: 리포터 카운터는 "실행 횟수" 누적이라 재시도가 끼면 이후 일반 라인도 total을 초과함.
// 따라서 파일:라인번호를 고유 키로 추적해 "고유 테스트 완료 수"를 진행도로 사용한다.
const PROGRESS_LINE_RE = /\[(\d+)\/(\d+)\]\s+(?:\(retries\)\s+)?\[[^\]]*\]\s+›\s+e2e[\/\\](?:helpers[\/\\])?([\w.-]+?)\.(?:spec|setup)\.ts(:\d+:\d+)?/;
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function fileToScenarioName(fileBase: string): string {
  if (fileBase === 'auth') return '로그인 준비';
  const entry = Object.values(SCENARIOS).find((s) => s.file === `${fileBase}.spec.ts`);
  return entry?.name ?? fileBase;
}

export function parseProgressLine(
  line: string,
  seenTests?: Set<string>,
): RunProgress | null {
  const clean = line.replace(ANSI_RE, '');
  const m = PROGRESS_LINE_RE.exec(clean);
  if (!m) return null;
  const total = Number(m[2]);
  const isRetry = /\(retr(?:y|ies)/.test(clean);

  let done = Math.min(Number(m[1]), total);
  if (seenTests && m[4]) {
    // 고유 테스트(파일:라인) 기준 완료 수 — 재시도는 이미 등록된 키라 증가하지 않음
    seenTests.add(`${m[3]}${m[4]}`);
    done = Math.min(seenTests.size, total);
  }

  return {
    done,
    total,
    current: fileToScenarioName(m[3]) + (isRetry ? ' 재시도' : ''),
  };
}

export async function runTests(
  baseURL: string,
  scenarios: string[],
  meta?: { userId: string; env: string; browser?: Browser },
  onProgress?: (progress: RunProgress) => void,
): Promise<TestResult> {
  if (running) {
    throw new Error('CONFLICT');
  }

  const browser: Browser = meta?.browser ?? 'chrome';
  running = {
    userId: meta?.userId ?? '',
    env: meta?.env ?? '',
    browser,
    startedAt: Date.now(),
  };
  const rootDir = path.resolve(__dirname, '..');
  const resultsDir = path.join(rootDir, 'e2e', 'test-results');
  // Playwright가 outputDir(test-results)을 실행 시 정리하므로 리포트는 그 밖에 둔다
  const reportFile = path.join(rootDir, 'e2e', 'report.json');

  try {
    // 이전 결과 정리
    if (fs.existsSync(resultsDir)) {
      fs.rmSync(resultsDir, { recursive: true });
    }
    if (fs.existsSync(reportFile)) {
      fs.rmSync(reportFile);
    }

    const testFiles = scenarios
      .map((s) => SCENARIOS[s]?.file)
      .filter((f): f is string => Boolean(f))
      .map((f) => `e2e/${f}`);

    // line 리포터(stdout)는 진행 상황 파싱용, json 리포터는 결과 파일 기록용
    // --project 필터로 브라우저 선택 (setup은 dependency라 자동 포함)
    const args = [
      'test',
      '--config=playwright.sanity.config.ts',
      '--reporter=line,json',
      `--project=${browser}`,
      `--project=${browser}-auth`,
      ...testFiles,
    ];

    const scenarioCount = scenarios.length > 0 ? scenarios.length : Object.keys(SCENARIOS).length;
    const timeoutMs = calcTimeoutMs(scenarioCount);

    await runPlaywright(args, {
      cwd: rootDir,
      env: {
        ...process.env,
        E2E_BASE_URL: baseURL,
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile,
      },
      timeoutMs,
      onProgress,
    });

    if (!fs.existsSync(reportFile)) {
      throw new Error('Playwright 리포트 파일이 생성되지 않았습니다.');
    }

    return await parseResults(fs.readFileSync(reportFile, 'utf-8'));
  } finally {
    running = null;
  }
}

function runPlaywright(
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    onProgress?: (progress: RunProgress) => void;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = path.join(options.cwd, 'node_modules', '.bin', 'playwright');
    // detached: 프로세스 그룹을 분리해 타임아웃/취소 시 자식 Chromium까지 함께 종료
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    currentChild = child;
    cancelRequested = false;

    // stdout(line 리포터)에서 진행 상황을 best-effort로 파싱 — 실패해도 실행에는 영향 없음
    let stdoutBuffer = '';
    const seenTests = new Set<string>();
    child.stdout?.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      if (!options.onProgress) return;
      for (const line of lines) {
        const progress = parseProgressLine(line, seenTests);
        if (progress) {
          try {
            options.onProgress(progress);
          } catch {
            // 진행 콜백 오류는 무시
          }
        }
      }
    });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }, options.timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      currentChild = null;
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      currentChild = null;
      if (cancelRequested) {
        reject(new Error('CANCELLED'));
        return;
      }
      if (timedOut) {
        const minutes = Math.round(options.timeoutMs / 60_000);
        reject(new Error(`⏱ 테스트 실행 시간 초과 (제한: ${minutes}분)`));
        return;
      }
      // Playwright는 테스트 실패 시 exit code 1을 반환하지만 리포트는 정상 생성됨
      // 리포트 파일 존재 여부는 호출부에서 확인하므로, 여기서는 실행 자체의 실패만 거른다
      if (code !== 0 && code !== 1) {
        reject(new Error(stderr.slice(-2000) || `Playwright 종료 코드: ${code}`));
        return;
      }
      resolve();
    });
  });
}

export async function parseResults(jsonOutput: string): Promise<TestResult> {
  let report: any;
  try {
    report = JSON.parse(jsonOutput);
  } catch {
    return {
      passed: 0,
      failed: 1,
      skipped: 0,
      duration: '0s',
      failures: [{ title: 'JSON 파싱 실패', error: 'Playwright 결과를 파싱할 수 없습니다.' }],
      scenarios: [],
    };
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: TestFailure[] = [];
  const scenarioMap = new Map<string, ScenarioSummary>();

  async function processSuite(suite: any, parentTitle: string, scenarioName: string) {
    const title = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const lastResult = test.results?.[test.results.length - 1];

        if (!scenarioMap.has(scenarioName)) {
          scenarioMap.set(scenarioName, { name: scenarioName, passed: 0, skipped: 0, total: 0, cases: [], failures: [] });
        }
        const scenario = scenarioMap.get(scenarioName)!;
        scenario.total++;

        if (test.status === 'expected' || test.status === 'flaky') {
          // flaky: 재시도 후 통과 → 통과로 집계
          passed++;
          scenario.passed++;
          scenario.cases.push({
            title: spec.title,
            status: test.status === 'flaky' ? 'flaky' : 'passed',
          });
        } else if (test.status === 'skipped') {
          skipped++;
          scenario.skipped++;
          const skipNote = (test.annotations ?? []).find(
            (a: any) => a.type === 'skip' && a.description,
          )?.description;
          scenario.cases.push({ title: spec.title, status: 'skipped', note: skipNote });
        } else {
          failed++;
          const failure: TestFailure = {
            title: spec.title,
            error: lastResult?.error?.message ?? test.status,
          };

          const attachments = lastResult?.attachments ?? [];
          const screenshot = attachments.find(
            (a: any) =>
              a.name === "screenshot" ||
              (typeof a.path === "string" && a.path.endsWith(".png")),
          );
          if (screenshot?.path && fs.existsSync(screenshot.path)) {
            failure.screenshotPath = screenshot.path;
          }
          const video = attachments.find(
            (a: any) =>
              a.name === "video" ||
              (typeof a.path === "string" && a.path.endsWith(".webm")),
          );
          if (video?.path && fs.existsSync(video.path)) {
            failure.videoPath = video.path;
          }
          // trace: on-first-retry 설정이라 "재시도 후에도 실패"한 테스트에만 존재
          const trace = attachments.find(
            (a: any) =>
              a.name === "trace" ||
              (typeof a.path === "string" && a.path.endsWith(".zip")),
          );
          if (trace?.path && fs.existsSync(trace.path)) {
            failure.tracePath = trace.path;
          }

          failures.push(failure);
          scenario.failures.push(failure);
          scenario.cases.push({ title: spec.title, status: 'failed' });
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

  return { passed, failed, skipped, duration, failures, scenarios };
}
