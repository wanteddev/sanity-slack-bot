export function getBaseURL(): string {
  return process.env.E2E_BASE_URL || 'https://dev.wanted.co.kr';
}

/**
 * 환경별 로그인 세션 캐시 파일 경로.
 * 환경(dev, dev3, wwwtest...)마다 세션 쿠키가 다르므로 파일을 분리해
 * 다른 환경 실행 간 세션이 섞이지 않게 한다.
 */
export function getAuthFile(): string {
  const env = new URL(getBaseURL()).hostname.split('.')[0];
  return `e2e/.auth/${env}.json`;
}
