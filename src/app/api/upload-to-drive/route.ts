// /src/app/api/upload-to-drive/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import stream from 'stream';

function resolveFolderId(input?: string): string | undefined {
  const envId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const candidate = input || envId;
  if (!candidate) return undefined;
  // URL에서 추출 지원: /folders/{id}, open?id={id}
  const foldersMatch = candidate.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch?.[1]) return foldersMatch[1];
  const openIdMatch = candidate.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openIdMatch?.[1]) return openIdMatch[1];
  return candidate; // 이미 ID로 들어온 경우
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

function inferMimeType(fileName?: string, explicit?: string) {
  if (explicit) return explicit;
  if (!fileName) return 'application/octet-stream';
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

// POST body 예시:
// {
//   "fileName": "result.csv",
//   "fileContent": "a,b,c\n1,2,3\n", // 문자열 컨텐츠
//   "folderId": "optional-folder-id-or-url",
//   "contentType": "text/csv" // 선택: 명시적 지정
// }
export async function POST(req: NextRequest) {
  try {
    const { fileName, fileContent, folderId, contentType } = await req.json();

    if (!fileName || !fileContent) {
      return NextResponse.json({ message: 'fileName과 fileContent는 필수입니다.' }, { status: 400 });
    }

    const resolvedFolderId = resolveFolderId(folderId);
    if (!resolvedFolderId) {
      return NextResponse.json({ message: '업로드할 Google Drive 폴더 ID가 필요합니다. (env GOOGLE_DRIVE_FOLDER_ID 또는 body.folderId)' }, { status: 400 });
    }

    const drive = await getDriveClient();

    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(fileContent, 'utf-8'));

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [resolvedFolderId],
      },
      media: {
        mimeType: inferMimeType(fileName, contentType),
        body: bufferStream,
      },
      fields: 'id, name, webViewLink, webContentLink',
    });

    return NextResponse.json({
      message: '파일이 성공적으로 Google Drive에 업로드되었습니다.',
      file: response.data,
    });
  } catch (error: any) {
    console.error('Google Drive 업로드 오류:', error);
    const errorMessage = error instanceof Error ? error.message : 'Google Drive 업로드 중 서버 오류가 발생했습니다.';
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}