import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { buildWorkbookBuffer } from '@/lib/excel/buildWorkbook';
import { Readable } from 'node:stream';
import { createPrivateKey } from 'node:crypto';

export const runtime = 'nodejs';

type AnalysisItem = {
  title: string;
  url: string;
  notes?: string;
  scriptLanguage?: string;
  completionStats?: { completed: number; incomplete: number; total: number; percentage: number };
  analysis: { [category: string]: { [feature: string]: string } };
};

function resolveFolderId(input?: string): string | undefined {
  const envId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const candidate = input || envId;
  if (!candidate) return undefined;
  const foldersMatch = candidate.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch?.[1]) return foldersMatch[1];
  const openIdMatch = candidate.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openIdMatch?.[1]) return openIdMatch[1];
  return candidate;
}

function stripOuterQuotes(s: string) {
  if (!s) return s;
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function normalizePrivateKey(k: string) {
  if (!k) return k;
  let s = stripOuterQuotes(k);

  // 여러 번 이스케이프된 경우까지 풀기: \\n -> \n, \\r -> \r 반복
  for (let i = 0; i < 3; i++) {
    const prev = s;
    s = s.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    if (s === prev) break;
  }

  // CRLF 정리
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '');
  // BOM, 앞뒤 공백 제거
  s = s.replace(/^\uFEFF/, '').trim();
  // 헤더/푸터 앞뒤 공백 제거
  if (!s.startsWith('-----BEGIN PRIVATE KEY-----')) {
    const idx = s.indexOf('-----BEGIN PRIVATE KEY-----');
    if (idx >= 0) s = s.slice(idx);
  }
  if (!s.endsWith('-----END PRIVATE KEY-----') && s.includes('-----END PRIVATE KEY-----')) {
    s = s.slice(0, s.indexOf('-----END PRIVATE KEY-----') + '-----END PRIVATE KEY-----'.length);
  }
  // 마지막 개행 보장
  if (!s.endsWith('\n')) s += '\n';
  return s;
}

/**
 * 자격증명 파서(강화)
 * 1) GOOGLE_SERVICE_ACCOUNT_CREDENTIALS: 한 줄 JSON이라면 사용, private_key_id 포함
 * 2) 실패 시 GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY (+ GOOGLE_DRIVE_PRIVATE_KEY_ID 선택) 폴백
 */
function parseGoogleCredentials(): {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  project_id?: string;
  source: 'JSON' | 'FALLBACK';
} {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (raw && raw.trim()) {
    let s = stripOuterQuotes(raw);
    try {
      const obj = JSON.parse(s);
      const client_email: string = obj.client_email;
      const private_key: string = normalizePrivateKey(obj.private_key || '');
      const private_key_id: string | undefined = obj.private_key_id;
      if (!client_email || !private_key) throw new Error('JSON에 client_email/private_key 누락');
      return { client_email, private_key, private_key_id, project_id: obj.project_id, source: 'JSON' };
    } catch (e: any) {
      console.warn('[Drive] GOOGLE_SERVICE_ACCOUNT_CREDENTIALS 파싱 실패, 폴백 사용:', e?.message || e);
    }
  }

  const client_email = process.env.GOOGLE_DRIVE_CLIENT_EMAIL || '';
  const pkRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY || '';
  const private_key = normalizePrivateKey(pkRaw);
  const private_key_id = stripOuterQuotes(process.env.GOOGLE_DRIVE_PRIVATE_KEY_ID || '');

  if (!client_email || !private_key) {
    throw new Error(
      '서비스 계정 자격이 잘못되었습니다. ' +
      'GOOGLE_SERVICE_ACCOUNT_CREDENTIALS(한 줄 JSON) 또는 ' +
      'GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY를 설정하세요.'
    );
  }
  return { client_email, private_key, private_key_id: private_key_id || undefined, source: 'FALLBACK' };
}

async function getDriveClient() {
  const creds = parseGoogleCredentials();
  console.info(`[Drive] Using credentials source: ${creds.source}, email: ${creds.client_email}, kid: ${creds.private_key_id || '(none)'}`);

  // 키 형식 선검증 (PEM 파싱 확인)
  try {
    createPrivateKey({ key: creds.private_key, format: 'pem' });
  } catch (e: any) {
    throw new Error(`PRIVATE KEY 형식 오류(PEM 파싱 실패): ${e?.message || e}`);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: creds.client_email, private_key: creds.private_key, private_key_id: creds.private_key_id },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  // 프리플라이트: 실제 토큰 발급 시도
  try {
    const token = await auth.getAccessToken();
    if (!token) throw new Error('액세스 토큰을 가져오지 못했습니다.');
  } catch (e: any) {
    const msg = e?.response?.data?.error_description || e?.response?.data?.error || e?.message || String(e);
    // kid 힌트 제공
    const hint = creds.private_key_id ? ` (kid=${creds.private_key_id})` : '';
    throw new Error(
      `Google 인증 실패: ${msg}${hint}. ` +
      `점검: (1) private_key 줄바꿈(\\n) 처리, (2) client_email-키 쌍 일치, (3) 키가 콘솔에서 삭제/회수되지 않았는지, (4) 시스템 시간 정상 여부`
    );
  }

  const authClient = await auth.getClient();
  return google.drive({ version: 'v3', auth: authClient });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const items: AnalysisItem[] = Array.isArray(body?.items) ? body.items : [];
    const fileName: string = body?.fileName || `analysis-${Date.now()}.xlsx`;
    const workbookTitle: string | undefined = body?.workbookTitle;
    const folderId = resolveFolderId(body?.folderId);

    if (!items.length) {
      return NextResponse.json({ message: '업로드할 items가 비어 있습니다.' }, { status: 400 });
    }
    if (!folderId) {
      return NextResponse.json({ message: '업로드할 Google Drive 폴더 ID가 필요합니다. (env GOOGLE_DRIVE_FOLDER_ID 또는 body.folderId)' }, { status: 400 });
    }

    const drive = await getDriveClient();
    const buffer = await buildWorkbookBuffer(items, workbookTitle);
    const mediaStream = Readable.from(buffer);

    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: mediaStream,
      },
      fields: 'id, name, webViewLink, webContentLink',
    });

    return NextResponse.json({
      id: res.data.id,
      webViewLink: res.data.webViewLink,
      name: res.data.name,
    });
  } catch (error: any) {
    const message =
      error?.response?.data?.error_description ||
      error?.response?.data?.error?.message ||
      error?.message ||
      '드라이브 업로드 중 오류';
    console.error('Drive 업로드 오류:', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}