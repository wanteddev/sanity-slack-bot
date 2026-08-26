/**
 * Google Sheets REST API 최소 클라이언트.
 *
 * googleapis 패키지 없이 서비스 계정 JWT(RS256, node:crypto)로 액세스 토큰을 발급받고
 * fetch(Node 18+)로 직접 호출한다. 필요한 기능만 구현: 탭 목록 조회 / 탭 복제 / 값 읽기 / 값 일괄 쓰기.
 *
 * 사전 조건: 대상 스프레드시트가 서비스 계정 이메일(client_email)에 편집자로 공유되어 있어야 한다.
 */
import crypto from 'crypto';

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

export interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/** 환경변수 값(원본 JSON 또는 base64 인코딩)을 서비스 계정 키로 파싱 */
export function parseServiceAccountKey(raw: string): ServiceAccountKey {
  let text = raw.trim();
  if (!text.startsWith('{')) {
    text = Buffer.from(text, 'base64').toString('utf-8');
  }
  const key = JSON.parse(text);
  if (!key.client_email || !key.private_key) {
    throw new Error('서비스 계정 키에 client_email/private_key가 없습니다.');
  }
  return key;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export class SheetsClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly key: ServiceAccountKey,
    private readonly spreadsheetId: string,
  ) {}

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) {
      return this.token.value;
    }
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.key.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(`${header}.${claims}`)
      .sign(this.key.private_key, 'base64url');
    const assertion = `${header}.${claims}.${signature}`;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(`토큰 발급 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(`${API_BASE}/${this.spreadsheetId}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Sheets API 오류 (${res.status} ${path}): ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async listTabs(): Promise<SheetTab[]> {
    const body = await this.request<{ sheets: Array<{ properties: SheetTab }> }>(
      '?fields=sheets.properties(sheetId,title,index)',
    );
    return (body.sheets ?? []).map((s) => s.properties);
  }

  /** 템플릿 탭을 복제해 새 이름의 탭을 만들고 sheetId를 반환 (맨 앞에 배치) */
  async duplicateTab(sourceSheetId: number, newName: string): Promise<number> {
    const body = await this.request<{
      replies: Array<{ duplicateSheet?: { properties: { sheetId: number } } }>;
    }>(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            duplicateSheet: {
              sourceSheetId,
              insertSheetIndex: 0,
              newSheetName: newName,
            },
          },
        ],
      }),
    });
    const sheetId = body.replies?.[0]?.duplicateSheet?.properties?.sheetId;
    if (sheetId === undefined) {
      throw new Error('탭 복제 응답에서 sheetId를 찾지 못했습니다.');
    }
    return sheetId;
  }

  async getValues(range: string): Promise<string[][]> {
    const body = await this.request<{ values?: string[][] }>(
      `/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
    );
    return body.values ?? [];
  }

  async batchUpdateValues(data: Array<{ range: string; values: string[][] }>): Promise<void> {
    if (data.length === 0) return;
    await this.request('/values:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
    });
  }
}
