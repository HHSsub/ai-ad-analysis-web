import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

type FeatureRecord = Record<string, string | number | boolean | null | undefined>;

interface ExportPayload {
  videoTitle: string;
  videoUrl: string;
  notes?: string;
  completedAt: string; // ISO 문자열 권장
  features: FeatureRecord; // 156개 특성 포함(키=특성명, 값=값)
  format?: 'csv' | 'json'; // 기본 csv
  folderId?: string;       // 미지정 시 env GOOGLE_DRIVE_FOLDER_ID 사용
}

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

async function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS 환경변수가 설정되어 있지 않습니다.');
  }
  const credentials = JSON.parse(raw);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const authClient = await auth.getClient();
  return google.drive({ version: 'v3', auth: authClient });
}

function escCsv(value: any): string {
  const s = value === null || value === undefined ? '' : String(value);
  const mustQuote = /[",\n]/.test(s);
  const q = s.replace(/"/g, '""');
  return mustQuote ? `"${q}"` : q;
}

function toCsv(payload: ExportPayload): string {
  const baseCols = ['영상제목', '영상링크', '비고', '분석완료시점'];
  const featureKeys = Object.keys(payload.features || {});
  // 특성 키 순서를 고정하려면 별도 배열로 관리하세요.
  const headers = [...baseCols, ...featureKeys];
  const row = [
    payload.videoTitle,
    payload.videoUrl,
    payload.notes || '',
    payload.completedAt,
    ...featureKeys.map((k) => payload.features?.[k]),
  ];

  return `${headers.map(escCsv).join(',')}\n${row.map(escCsv).join(',')}\n`;
}

function toJson(payload: ExportPayload): string {
  const obj = {
    영상제목: payload.videoTitle,
    영상링크: payload.videoUrl,
    비고: payload.notes || '',
    분석완료시점: payload.completedAt,
    features: payload.features || {},
  };
  return JSON.stringify(obj, null, 2);
}

function inferFileName(payload: ExportPayload) {
  const safeTitle = payload.videoTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
  const ymd = (payload.completedAt || new Date().toISOString()).slice(0, 10);
  const ext = (payload.format || 'csv') === 'json' ? 'json' : 'csv';
  return `${safeTitle}_분석결과_${ymd}.${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as ExportPayload;

    if (!payload.videoTitle || !payload.videoUrl || !payload.completedAt || !payload.features) {
      return NextResponse.json({ message: 'videoTitle, videoUrl, completedAt, features는 필수입니다.' }, { status: 400 });
    }

    const folderId = resolveFolderId(payload.folderId);
    if (!folderId) {
      return NextResponse.json({ message: '업로드할 Google Drive 폴더 ID가 필요합니다. (env GOOGLE_DRIVE_FOLDER_ID 또는 body.folderId)' }, { status: 400 });
    }

    const drive = await getDriveClient();

    const format = payload.format || 'csv';
    const fileName = inferFileName(payload);
    const { content, mimeType } =
      format === 'json'
        ? { content: toJson(payload), mimeType: 'application/json' }
        : { content: toCsv(payload), mimeType: 'text/csv' };

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Buffer.from(content, 'utf-8'),
      },
      fields: 'id, name, webViewLink, webContentLink',
    });

    return NextResponse.json({
      message: 'Google Drive에 성공적으로 업로드되었습니다.',
      file: res.data,
    });
  } catch (error: any) {
    console.error('분석결과 업로드 오류:', error);
    return NextResponse.json({ message: error?.message || '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}