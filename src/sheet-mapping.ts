/**
 * TC 스프레드시트 행 ↔ e2e 테스트 매핑.
 *
 * 시트 행은 (대분류, 중분류, 테스트 항목) 텍스트로 찾는다 — 행이 추가/이동돼도 안전하고,
 * 항목 텍스트가 수정되면 매칭이 깨지므로 이 파일을 함께 갱신해야 한다.
 * 이력서 > 리스트처럼 항목 텍스트가 중복되는 행은 expectContains(기대 결과 부분 문자열)로 구분한다.
 *
 * 테스트는 (시나리오 describe 제목, 말단 test 제목)으로 식별한다 — test-runner의
 * ScenarioSummary.name / TestCase.title과 동일한 값.
 * 한 행에 테스트가 여럿이면(데스크톱/모바일 변형 등) 결과를 합산한다: combineStatuses 참고.
 */
import type { Browser } from './config';
import type { TestCase } from './test-runner';

export interface TcRowRef {
  category: string; // 대분류 (A열)
  group: string; // 중분류 (B열)
  item: string; // 테스트 항목 (C열)
  expectContains?: string; // 항목 텍스트가 중복될 때 기대 결과(D열)로 구분
}

export interface TcMapEntry {
  row: TcRowRef;
  tests: Array<{ scenario: string; title: string }>;
}

/** 시트의 브라우저 결과 열 (E=Web크롬 F=WebSafari G=MoWeb크롬 H=MoWeb사파리) */
export const BROWSER_COLUMNS: Record<Browser, string> = {
  chrome: 'E',
  safari: 'F',
  'mobile-chrome': 'G',
  'mobile-safari': 'H',
};

/** 시트 드롭다운 값 */
export type SheetStatus = 'PASS' | 'FAIL' | 'N/A';

/**
 * 한 행에 매핑된 테스트들의 결과 합산.
 * 하나라도 실패면 FAIL, 아니면 하나라도 통과(재시도 통과 포함)면 PASS,
 * 전부 건너뜀이면 N/A, 매칭된 테스트가 없으면 null(셀을 건드리지 않음).
 */
export function combineStatuses(statuses: Array<TestCase['status']>): SheetStatus | null {
  if (statuses.length === 0) return null;
  if (statuses.includes('failed')) return 'FAIL';
  if (statuses.some((s) => s === 'passed' || s === 'flaky')) return 'PASS';
  return 'N/A';
}

export const TC_MAPPINGS: TcMapEntry[] = [
  // ── 회원 ── (회원가입/회원탈퇴 행은 자동화 미커버 — 건드리지 않음)
  {
    row: { category: '회원', group: '로그인', item: '이메일 로그인 정상 동작 확인' },
    tests: [{ scenario: '회원', title: '이메일 로그인 정상 동작 확인' }],
  },
  {
    row: { category: '회원', group: '로그아웃', item: '로그아웃 정상 동작 확인' },
    tests: [{ scenario: '회원', title: '로그아웃 정상 동작 확인' }],
  },

  // ── 프로필 ── (언어 관련 2개 행은 자동화 미커버)
  {
    row: { category: '프로필', group: '프로필 편집', item: '직군/직무 변경 확인' },
    tests: [{ scenario: '프로필', title: '직군/직무 변경 확인' }],
  },
  {
    row: { category: '프로필', group: '프로필 편집', item: '한 줄 소개 변경 확인' },
    tests: [{ scenario: '프로필', title: '한 줄 소개 변경 확인' }],
  },
  {
    row: { category: '프로필', group: '이력서 연동', item: '경력 편집 클릭 시 이동 및 스크롤 확인' },
    tests: [{ scenario: '프로필', title: '경력 섹션 클릭 시 이력서 편집으로 이동 확인' }],
  },
  {
    row: { category: '프로필', group: '이력서 연동', item: '학력 편집 클릭 시 이동 및 스크롤 확인' },
    tests: [{ scenario: '프로필', title: '학력 섹션 클릭 시 이력서 편집으로 이동 확인' }],
  },
  {
    row: { category: '프로필', group: '이력서 연동', item: '스킬 편집 클릭 시 이동 및 스크롤 확인' },
    tests: [{ scenario: '프로필', title: '스킬 섹션 클릭 시 이력서 편집으로 이동 확인' }],
  },
  {
    row: { category: '프로필', group: '이력서 연동', item: '수상 편집 클릭 시 이동 및 스크롤 확인' },
    tests: [{ scenario: '프로필', title: '수상 섹션 클릭 시 이력서 편집으로 이동 확인' }],
  },

  // ── 채용공고 ──
  {
    row: { category: '채용공고', group: '탐색(리스트)', item: '홈 > 숏컷 > 채용공고 클릭으로 진입' },
    tests: [{ scenario: '채용공고', title: '홈 > 숏컷 > 채용공고 클릭으로 진입' }],
  },
  {
    // 데스크톱/모바일 변형이 한 행 — 브라우저별 실행에서 해당 변형만 돌고 나머지는 skip되므로 합산
    row: { category: '채용공고', group: '탐색(리스트)', item: '진입 시 기존 선택 필터 유지 확인' },
    tests: [
      { scenario: '채용공고', title: '진입 시 기존 선택 필터 유지 확인' },
      { scenario: '채용공고', title: '진입 시 기존 선택 필터 유지 확인 (모바일)' },
    ],
  },
  {
    // 모바일 웹은 정렬 대신 필터 변경으로 아이템 갱신을 검증
    row: { category: '채용공고', group: '탐색(리스트)', item: '정렬 변경 시 아이템 변경 확인' },
    tests: [
      { scenario: '채용공고', title: '정렬 변경 시 아이템 변경 확인' },
      { scenario: '채용공고', title: '필터 변경 시 아이템 변경 확인 (모바일)' },
    ],
  },
  {
    row: { category: '채용공고', group: '탐색(리스트)', item: '인피니티 스크롤 동작 확인' },
    tests: [{ scenario: '채용공고', title: '인피니티 스크롤 동작 확인' }],
  },
  {
    row: { category: '채용공고', group: '검색', item: '검색어 입력 및 결과 노출 확인' },
    tests: [{ scenario: '채용공고', title: '검색어 입력 및 결과 노출 확인' }],
  },
  {
    row: { category: '채용공고', group: '검색', item: '검색결과에서 기업/포지션 상세 진입 확인' },
    tests: [{ scenario: '채용공고', title: '검색결과에서 기업/포지션 상세 진입 확인' }],
  },
  {
    row: { category: '채용공고', group: '포지션 상세', item: '상세 정보 정상 노출 확인' },
    tests: [{ scenario: '채용공고', title: '상세 정보 정상 노출 확인' }],
  },
  {
    row: { category: '채용공고', group: '포지션 상세', item: '근무지 지도 노출 확인' },
    tests: [{ scenario: '채용공고', title: '근무지 지도 노출 확인' }],
  },
  {
    row: { category: '채용공고', group: '포지션 상세', item: '추천 포지션 노출 확인' },
    tests: [{ scenario: '채용공고', title: '추천 포지션 노출 확인' }],
  },
  {
    row: { category: '채용공고', group: '포지션 상세', item: '포지션 북마크 동작 확인' },
    tests: [{ scenario: '채용공고', title: '포지션 북마크 동작 확인' }],
  },

  // ── 교육/이벤트 ──
  {
    row: { category: '교육/이벤트', group: '리스트', item: '탭 진입 시 개별 아이템 노출 확인' },
    tests: [{ scenario: '교육/이벤트', title: '리스트 - 탭 진입 시 개별 아이템 노출 확인' }],
  },
  {
    row: { category: '교육/이벤트', group: '상세', item: '리스트 아이템 클릭 시 화면 이동 확인' },
    tests: [{ scenario: '교육/이벤트', title: '상세 - 리스트 아이템 클릭 시 화면 이동 확인' }],
  },

  // ── 소셜 ──
  {
    row: { category: '소셜', group: '리스트', item: '소셜 탭 화면 노출 확인' },
    tests: [{ scenario: '소셜', title: '리스트 - 소셜 탭 화면 노출 확인' }],
  },
  {
    row: { category: '소셜', group: '상세', item: '메인 컨텐츠 영역 클릭 시 상세 이동 확인' },
    tests: [{ scenario: '소셜', title: '상세 - 메인 컨텐츠 영역 클릭 시 상세 이동 확인' }],
  },
  {
    row: { category: '소셜', group: '액션', item: '하트 버튼 클릭 시 UI 변경 확인' },
    tests: [{ scenario: '소셜', title: '액션 - 하트 버튼 클릭 시 UI 변경 확인' }],
  },
  {
    row: { category: '소셜', group: '작성', item: '글 작성 클릭 시 화면 이동 확인' },
    tests: [{ scenario: '소셜', title: '작성 - 글 작성 클릭 시 화면 이동 확인' }],
  },

  // ── 이력서 ── ('간단 소개 변경 확인' 행은 자동화 미커버)
  {
    // 항목 텍스트가 '리스트'로 중복 — 기대 결과로 구분
    row: { category: '이력서', group: '리스트', item: '리스트', expectContains: '최신순' },
    tests: [{ scenario: '이력서', title: '이력서 리스트 노출 확인' }],
  },
  {
    row: { category: '이력서', group: '리스트', item: '새 이력서 작성 클릭 시 이동 확인' },
    tests: [{ scenario: '이력서', title: '새 이력서 작성 클릭 시 이동 확인' }],
  },
  {
    row: { category: '이력서', group: '리스트', item: '리스트', expectContains: '임시저장' },
    tests: [{ scenario: '이력서', title: '작성 중 이탈 시 임시저장 확인' }],
  },
  {
    row: { category: '이력서', group: '리스트', item: '기본 이력서 변경 동작 확인' },
    tests: [{ scenario: '이력서', title: '기본 이력서 변경 동작 확인' }],
  },
  {
    row: { category: '이력서', group: '리스트', item: '이력서 수정/삭제 동작 확인' },
    tests: [{ scenario: '이력서', title: '이력서 수정/삭제 동작 확인' }],
  },
  {
    row: { category: '이력서', group: '상세(수정)', item: '이력서 제목/개인 정보 변경 확인' },
    tests: [{ scenario: '이력서', title: '이력서 제목/개인 정보 변경 확인' }],
  },
  {
    // 시트는 경력 변경 + 신입 체크가 한 행
    row: { category: '이력서', group: '상세(수정)', item: '경력사항 변경 및 신입 체크 확인' },
    tests: [
      { scenario: '이력서', title: '경력사항 변경' },
      { scenario: '이력서', title: '"신입" 토글 체크 시 경력 입력 폼 비활성화(또는 변경)됨 확인' },
    ],
  },
  {
    row: { category: '이력서', group: '상세(수정)', item: '수상/자격증/기타 변경 확인' },
    tests: [{ scenario: '이력서', title: '수상/자격증/기타 변경 확인' }],
  },
  {
    row: { category: '이력서', group: '상세(다운로드)', item: '다운로드 시작/완료 토스트 노출 확인' },
    tests: [{ scenario: '이력서', title: '다운로드 시작/완료 동작 확인' }],
  },
  {
    row: { category: '이력서', group: '상세(다운로드)', item: '다운로드 완료 파일 열기 확인' },
    tests: [{ scenario: '이력서', title: '다운로드 완료 파일 열기 확인' }],
  },
  {
    row: { category: '이력서', group: '상세(미리보기)', item: '로딩 UI 노출 및 미리보기 화면 이동 확인' },
    tests: [{ scenario: '이력서', title: '로딩 UI 노출 및 미리보기 화면 이동 확인' }],
  },
];
