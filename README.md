# sanity-slack-bot

Slack에서 `/sanity` 한 줄로 유저웹의 핵심 기능을 자동 검증하는 새니티 테스트 봇입니다.

Playwright가 실제 브라우저 4종(데스크톱/모바일웹 × 크롬/사파리)으로 스테이징 환경(dev~dev8, nextweek, wwwtest)을 사람처럼 돌아다니며 확인하고, 결과와 실패 증거(스크린샷·영상·trace)를 Slack으로 보내줍니다. wwwtest 배포가 끝나면 CI가 자동으로 실행합니다.

## 주요 기능

- **Slack 슬래시 커맨드** — `/sanity` 선택 UI 또는 `/sanity dev3 이력서,회원 safari` 즉시 실행
- **시나리오 6종 × 브라우저 4종** — 회원 / 프로필 / 채용공고 / 교육·이벤트 / 소셜 / 이력서 (35+ 테스트)
- **실시간 진행률** — 채널 메시지가 `진행 12/35 · 이력서 진행 중`으로 갱신, ⏹ 취소 버튼(실행자 전용)
- **대기열** — 실행 중 새 요청은 큐(최대 5)에 등록, 차례가 되면 자동 실행 + DM 알림
- **결과 리포트** — 채널에 요약, 스레드에 시나리오별 케이스 상세(✅/❌/⏭️ + 건너뜀 사유) + 실패 증거 자동 첨부
- **재실행 버튼** — `▶️ 같은 조건으로 재실행` / `🔄 실패만 재실행` (실패한 시나리오만)
- **배포 연동** — userweb wwwtest 배포 성공 시 GitHub Actions가 Slack으로 트리거를 보내고, 봇이 웹→모바일웹 순차 자동 실행

## 아키텍처

```
👤 팀원 ──/sanity──▶ 💬 Slack ◀──Socket Mode──▶ 🤖 봇 서버 (Backyard backend)
                                                     │ spawn
                                                     ▼
                                              🎭 Playwright ×4
                                                     │ 접속/클릭
                                                     ▼
                                        🌐 dev ~ wwwtest.wanted.co.kr

🚀 userweb wwwtest 배포 ──▶ GitHub Actions ──트리거(HMAC 서명)──▶ 💬 Slack ──▶ 🤖 봇이 실행·결과 게시
```

- 봇은 **Socket Mode**로 동작해 외부 URL 노출이 없습니다 (인바운드 포트 0개).
- 배포 후 자동 실행도 봇이 수행합니다 — GitHub 러너는 CloudFront 지역/IP 차단으로 wwwtest에 접근할 수 없어, 워크플로우는 서명된 트리거 메시지만 Slack에 게시합니다.
- in-memory lock/대기열 특성상 **봇은 반드시 단일 인스턴스로 운영**해야 합니다.

## 프로젝트 구조

```
├── src/
│   ├── server.ts          # Slack Bolt 서버 — 커맨드/버튼/배포 트리거 핸들러, 오케스트레이터, 대기열
│   ├── deploy-sanity.ts   # 배포 새니티 공통 로직 — 워밍업 → 브라우저 순차 실행 → 리포트/시트 기록
│   ├── ci.ts              # 직접 실행 진입점 (npm run ci) — 봇 없이 deploy-sanity 수행
│   ├── test-runner.ts     # Playwright spawn, 진행률 파싱, 결과(JSON 리포트) 파싱, lock/취소
│   ├── slack-ui.ts        # Block Kit 메시지 빌더 (선택 UI/진행/결과/대기열/사용법)
│   ├── slack-report.ts    # 스레드 상세 + 실패 아티팩트(스크린샷/영상/trace) 업로드
│   ├── sheets-report.ts   # QA TC 스프레드시트 기록 (+ sheets-client / sheet-mapping)
│   └── config.ts          # 환경/시나리오/브라우저 정의, 커맨드 인자 파서, 타임아웃 정책
├── e2e/
│   ├── member.spec.ts / profile.spec.ts / job-posting.spec.ts
│   ├── education-event.spec.ts / social.spec.ts / resume.spec.ts
│   └── helpers/           # 로그인, 세션 캐시(auth.setup), 팝업/스낵바 정리, 뷰포트 유틸
├── playwright.sanity.config.ts          # 브라우저 프로젝트 4종 + setup(세션 캐시)
└── Dockerfile                           # Playwright 공식 이미지 기반 (비루트 실행)
```

## 시작하기

### 요구사항

- Node.js 22+
- Slack App (Socket Mode 활성화, `/sanity` 슬래시 커맨드 등록)
  - Bot Token Scopes: `chat:write`, `commands`, `files:write`
  - App-Level Token: `connections:write`

### 설치 및 실행

```bash
npm ci
npx playwright install chromium webkit   # 로컬 브라우저 (최초 1회)

cp .env.example .env                     # 환경변수 채우기
npm run dev                              # 봇 서버 (tsx watch)
```

### 환경변수

| 변수 | 용도 | 필수 |
|---|---|---|
| `SLACK_BOT_TOKEN` | Slack Bot OAuth Token (`xoxb-`) | ✅ |
| `SLACK_APP_TOKEN` | Socket Mode App Token (`xapp-`) | 봇 서버만 |
| `SLACK_SIGNING_SECRET` | Slack App Signing Secret | 봇 서버만 |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | 테스트 계정 | ✅ |
| `SANITY_TRIGGER_SECRET` | 배포 트리거 HMAC 검증 키 — userweb GitHub Secret과 동일 값 | 배포 연동 시 |
| `SANITY_TRIGGER_CHANNEL` | 배포 트리거를 수신할 채널 ID | 배포 연동 시 |
| `SANITY_GSHEET_CREDENTIALS` / `SANITY_SHEET_ID` | QA TC 스프레드시트 기록 (미설정 시 기록만 건너뜀) | 선택 |
| `SLACK_FAILURE_MENTION` | 실패 시 결과에 함께 멘션할 대상 (예: `<!subteam^S...>`) | 선택 |

### 테스트만 로컬 실행

```bash
E2E_BASE_URL=https://dev.wanted.co.kr npm test                       # 전체
E2E_BASE_URL=https://dev.wanted.co.kr npx playwright test \
  --config=playwright.sanity.config.ts \
  --project=mobile-safari --project=mobile-safari-auth \
  --grep "이력서"                                                     # 브라우저/시나리오 지정
```

## `/sanity` 사용법

```
/sanity                          # 선택 UI (환경/시나리오/브라우저)
/sanity dev3 이력서,회원 safari    # 즉시 실행 — 환경 뒤 인자는 순서 무관, 한/영 혼용
/sanity help                     # 전체 옵션 안내
```

- **환경**: `dev` `dev2`~`dev8` `nextweek` `wwwtest` (프로덕션 www 제외)
- **브라우저**: `chrome`(기본) · `safari` · `mobile-chrome`(Pixel 7) · `mobile-safari`(iPhone 14) — 별칭 `크롬/사파리/모바일크롬/모바일사파리`
- 결과의 **⏭️ 건너뜀은 실패가 아니라 환경/조건 문제**입니다 (시드 데이터 부재, 모바일 미제공 기능 등 — 사유가 함께 표기됨)
- 실패 스레드의 **trace.zip**을 [trace.playwright.dev](https://trace.playwright.dev)에 드래그하면 클릭·네트워크 타임라인을 재생할 수 있습니다

## 배포 연동 (wwwtest 배포 후 자동 실행)

userweb `release.yml`의 `sanity-test` 잡(deploy-end 이후)이 Slack 트리거 채널에 `sanity-deploy env=wwwtest ts=<unix초> sig=<hmac>` 메시지를 게시하면, 봇이 서명·유효시간(10분)·채널을 검증한 뒤 웹→모바일웹 순차로 실행하고 결과를 같은 채널에 게시합니다.

- 러너에서 직접 실행하지 않는 이유: GitHub 러너(해외 IP)는 CloudFront 차단으로 wwwtest 접근 불가
- 트리거는 **DEPLOY 봇 토큰**으로 게시해야 합니다 — 새니티 봇은 자기 메시지를 무시(ignoreSelf)
- 두 봇(DEPLOY·새니티) 모두 트리거 채널에 초대돼 있어야 합니다
- userweb 쪽 필요 Secret: `DEPLOY_SLACK_BOT_TOKEN`, `SANITY_SLACK_CHANNEL`, `SANITY_TRIGGER_SECRET`(봇의 `SANITY_TRIGGER_SECRET`과 동일 값)
- 브라우저는 **순차 실행**합니다 — 동일 테스트 계정의 상태(기본 이력서 등)를 공유하므로 병렬 금지
- 배포 새니티 실행 중 수동 `/sanity` 요청은 대기열로, 중복 트리거는 무시됩니다

봇을 거치지 않고 직접 실행해야 할 때(로컬 검증 등)는 `npm run ci`를 쓸 수 있습니다 (`SANITY_ENV`/`SANITY_BROWSERS`/`SLACK_REPORT_CHANNEL`/`SANITY_DRY_RUN=1` 등은 [`src/ci.ts`](src/ci.ts) 주석 참고).

## 배포 (봇 서버)

사내 **Backyard backend 컴포넌트**로 운영합니다. Playwright 고정 버전 이미지 기반 Dockerfile로 빌드해 레지스트리에 `:latest`로 push하면 자동 롤아웃됩니다. 환경변수는 Backyard 시크릿으로 등록합니다 (`.env` 파일은 이미지에 포함되지 않음 — `.dockerignore` 참고).

```bash
docker build -t oci.wntd.co/backyard/sanity-slack-bot .
docker push oci.wntd.co/backyard/sanity-slack-bot
```

⚠️ **리소스 요건** — Playwright 실브라우저 구동에 **CPU 2코어 / 메모리 4Gi** 이상이 필요합니다. Backyard 기본값(CPU 100m/1Gi)에서는 브라우저 렌더링이 타임아웃되므로 리소스 상향이 적용된 상태여야 합니다 (1CPU/1Gi 재현 실험으로 확인).

⚠️ **단일 인스턴스 전제** — 컨테이너를 2개 이상 띄우면 동시 실행 방지(lock)와 대기열이 무력화됩니다. 로컬 개발 봇과 운영 봇을 동시에 켜는 것도 같은 이유로 피하세요 (Socket Mode 이중 연결 시 이벤트가 랜덤 배정됨).

## 테스트 작성 규칙

이 저장소의 셀렉터/대기 컨벤션 — userWeb 개편에서 살아남는 테스트를 위해:

- **`data-` 속성 우선** (`data-gnb-kind`, `data-attribute-id`, `data-menu`) — CSS Modules 클래스(`Foo_bar__hash`)는 개편 한 번에 전멸합니다
- 동일 요소가 데스크톱/모바일 중복 렌더되는 경우가 많으므로 **visible 필터**(`.locator('visible=true')` / `.filter({ visible: true })`)를 기본으로
- `waitForTimeout` 금지 — API 응답(`waitForResumeApi`), 토스트, URL 변화 등 **결정적 신호**를 기다릴 것
- `waitForURL`/`reload`에는 `waitUntil: 'domcontentloaded'` — WebKit은 서드파티 리소스로 `load`가 안 끝나는 경우가 있음
- 모바일 오버레이(앱 유도 팝업, AI 스낵바)가 클릭을 가로챌 수 있음 — `dismissEventPopup`/`dismissResumeSnackbar` 헬퍼를 진입 시 호출
- 상태를 변경하는 시나리오(이력서/프로필)는 파일 상단 `test.describe.configure({ mode: 'default' })`로 순차 실행 유지
- 테스트가 데이터를 생성하면 **반드시 정리** (API DELETE) — 잔여물이 다음 실행을 깨뜨립니다
- 시드 데이터 의존 테스트는 `getSeedResume` 패턴으로 — 시드가 없으면 실패 대신 사유와 함께 skip


