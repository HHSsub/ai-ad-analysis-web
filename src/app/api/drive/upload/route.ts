import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { buildWorkbookBuffer } from '@/lib/excel/buildWorkbook';

export const runtime = 'nodejs';

type AnalysisItem = {
  title: string;
  url: string;
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

async function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS 환경변수가 설정되어 있지 않습니다.');
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
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

    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.from(buffer),
      },
      fields: 'id, name, webViewLink, webContentLink',
    });

    return NextResponse.json({
      id: res.data.id,
      webViewLink: res.data.webViewLink,
      name: res.data.name,
    });
  } catch (error: any) {
    console.error('Drive 업로드 오류:', error);
    return NextResponse.json({ message: error?.message || '드라이브 업로드 중 오류' }, { status: 500 });
  }
}
