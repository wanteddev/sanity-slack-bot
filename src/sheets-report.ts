/**
 * 새니티 결과를 QA TC 스프레드시트에 기록.
 *
 * 흐름:
 * 1. 배포일 탭을 찾고("{배포일} WT" 정확 일치 우선, 없으면 배포일로 시작하는 수동 생성 탭 재사용),
 *    그것도 없으면 TC양식 탭을 복제해 생성 (같은 날 재배포는 기존 탭에 덮어씀)
 * 2. 탭의 A~D열을 읽어 (대분류, 중분류, 항목) 텍스트로 TC 행 번호를 해석 (대분류 병합 셀은 forward-fill)
 * 3. 브라우저별 결과를 sheet-mapping 규칙으로 합산해 E~H열 드롭다운 값(PASS/FAIL/N/A)으로 일괄 기록
 *
 * 자동화가 커버하지 않는 행(회원가입/탈퇴, 언어, 간단 소개 등)과 실행 오류가 난 브라우저 열은
 * 건드리지 않는다 — 수동 QA 기록을 덮어쓰지 않기 위함.
 */
import { SheetsClient, parseServiceAccountKey } from './sheets-client';
import {
  TC_MAPPINGS,
  BROWSER_COLUMNS,
  combineStatuses,
  type TcRowRef,
} from './sheet-mapping';
import type { Browser } from './config';
import type { TestResult, TestCase } from './test-runner';

export interface SheetReportInput {
  credentialsRaw: string; // 서비스 계정 키 (JSON 원본 또는 base64)
  spreadsheetId: string;
  templateGid: number; // TC양식 탭의 gid
  date: string; // 배포일 YYYY-MM-DD (KST)
  outcomes: Array<{ browser: Browser; result?: TestResult }>;
}

export interface SheetReportSummary {
  tabName: string;
  created: boolean; // 탭을 새로 만들었는지 (false = 기존 탭에 덮어씀)
  updatedCells: number;
  unmatchedRows: string[]; // 시트에서 행을 못 찾은 매핑 (시트 텍스트가 바뀐 경우)
}

const HEADER_ROWS = 2; // 1행 공백 + 2행 헤더, 데이터는 3행부터
const SCAN_RANGE = `A${HEADER_ROWS + 1}:D100`;

function rowKey(ref: TcRowRef): string {
  return `${ref.category} > ${ref.group} > ${ref.item}`;
}

/** 탭의 A~D열에서 매핑된 각 행의 실제 행 번호를 찾는다 */
function resolveRows(values: string[][]): Map<TcRowRef, number> {
  // 대분류(A열) 병합 셀은 첫 행에만 값이 오므로 forward-fill
  const rows: Array<{ rowNumber: number; category: string; group: string; item: string; expected: string }> = [];
  let currentCategory = '';
  values.forEach((cols, i) => {
    const [a, b, c, d] = [cols[0] ?? '', cols[1] ?? '', cols[2] ?? '', cols[3] ?? ''];
    if (a.trim()) currentCategory = a.trim();
    if (!b.trim() && !c.trim()) return; // 빈 행, 버그 트래커 등
    rows.push({
      rowNumber: HEADER_ROWS + 1 + i,
      category: currentCategory,
      group: b.trim(),
      item: c.trim(),
      expected: d.trim(),
    });
  });

  const resolved = new Map<TcRowRef, number>();
  for (const { row: ref } of TC_MAPPINGS) {
    const match = rows.find(
      (r) =>
        r.category === ref.category &&
        r.group === ref.group &&
        r.item === ref.item &&
        (!ref.expectContains || r.expected.includes(ref.expectContains)),
    );
    if (match) resolved.set(ref, match.rowNumber);
  }
  return resolved;
}

/** 브라우저 한 번의 실행 결과에서 (시나리오, 테스트 제목)에 해당하는 케이스 상태를 찾는다 */
function findCaseStatus(
  result: TestResult,
  scenario: string,
  title: string,
): TestCase['status'] | null {
  const s = result.scenarios.find((sc) => sc.name === scenario);
  const c = s?.cases.find((cs) => cs.title === title);
  return c?.status ?? null;
}

export async function reportToSheet(input: SheetReportInput): Promise<SheetReportSummary> {
  const key = parseServiceAccountKey(input.credentialsRaw);
  const client = new SheetsClient(key, input.spreadsheetId);

  // 1. 배포일 탭 찾기 / 없으면 양식 복제.
  // 자동 생성 이름("{배포일} WT")과 정확히 일치하는 탭이 우선이고, 없으면
  // 수동으로 만든 "{배포일} WT 팀명" 같은 배포일로 시작하는 탭도 재사용한다.
  const tabs = await client.listTabs();
  const existing =
    tabs.find((t) => t.title === `${input.date} WT`) ??
    tabs.find((t) => t.title.trim().startsWith(input.date));
  const tabName = existing?.title ?? `${input.date} WT`;
  let created = false;
  if (!existing) {
    if (!tabs.some((t) => t.sheetId === input.templateGid)) {
      throw new Error(`TC양식 탭(gid=${input.templateGid})을 찾을 수 없습니다.`);
    }
    await client.duplicateTab(input.templateGid, tabName);
    created = true;
  }

  // 2. 행 해석
  const rowValues = await client.getValues(`'${tabName}'!${SCAN_RANGE}`);
  const resolved = resolveRows(rowValues);
  const unmatchedRows = TC_MAPPINGS.filter((m) => !resolved.has(m.row)).map((m) => rowKey(m.row));

  // 3. 브라우저별 × 행별 상태 계산 후 일괄 기록
  const updates: Array<{ range: string; values: string[][] }> = [];
  for (const { browser, result } of input.outcomes) {
    if (!result) continue; // 실행 오류가 난 브라우저 열은 건드리지 않음
    const column = BROWSER_COLUMNS[browser];
    for (const mapping of TC_MAPPINGS) {
      const rowNumber = resolved.get(mapping.row);
      if (!rowNumber) continue;
      const statuses = mapping.tests
        .map((t) => findCaseStatus(result, t.scenario, t.title))
        .filter((s): s is TestCase['status'] => s !== null);
      const status = combineStatuses(statuses);
      if (!status) continue; // 해당 브라우저 실행에 없던 테스트(시나리오 필터 등)
      updates.push({ range: `'${tabName}'!${column}${rowNumber}`, values: [[status]] });
    }
  }
  await client.batchUpdateValues(updates);

  return { tabName, created, updatedCells: updates.length, unmatchedRows };
}
