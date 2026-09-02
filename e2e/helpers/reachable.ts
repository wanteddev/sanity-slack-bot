/**
 * 오리진 도달 가능 여부 판별 — 실행 환경에서 접근 자체가 불가한 서비스를
 * 실패가 아닌 건너뜀으로 처리하기 위한 용도.
 *
 * 예: event-wwwtest.wanted.co.kr은 사내망 전용 사설 IP(내부 ALB)로만 해석돼
 * Backyard 파드에서는 SYN 타임아웃으로 멈춘다. VPN이 붙은 로컬에서는 정상 접근되므로,
 * 환경을 하드코딩하지 않고 매 실행에서 실제로 확인한다.
 */

/** 워커 프로세스 단위 캐시 — 오리진당 한 번만 확인한다 */
const cache = new Map<string, Promise<boolean>>();

async function probe(origin: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(origin, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 4xx(405 등)도 도달은 성공 — 서버가 응답했다는 것만 확인한다
    return res.status < 500;
  } catch {
    // DNS 실패 / 연결 거부 / 타임아웃 → 도달 불가
    return false;
  }
}

export async function isReachable(url: string, timeoutMs = 5_000): Promise<boolean> {
  const { origin } = new URL(url);
  let pending = cache.get(origin);
  if (!pending) {
    pending = probe(origin, timeoutMs);
    cache.set(origin, pending);
  }
  return pending;
}
