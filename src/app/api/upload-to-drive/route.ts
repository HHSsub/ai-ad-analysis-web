// /src/app/api/upload-to-drive/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import stream from 'stream';

// --- Google Drive API 인증 및 클라이언트 생성 ---
async function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || '{}');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const authClient = await auth.getClient();
  return google.drive({ version: 'v3', auth: authClient });
}

// --- API 라우트 핸들러 ---
export async function POST(req: NextRequest) {
  try {
    const { fileName, fileContent, folderId } = await req.json();

    if (!fileName || !fileContent || !folderId) {
      return NextResponse.json({ message: '파일 이름, 내용, 폴더 ID가 필요합니다.' }, { status: 400 });
    }

    const drive = await getDriveClient();

    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(fileContent, 'utf-8'));

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: bufferStream,
      },
    });

    return NextResponse.json({ message: '파일이 성공적으로 Google Drive에 업로드되었습니다.', file: response.data });

  } catch (error: any) {
    console.error("Google Drive 업로드 오류:", error);
    const errorMessage = error instanceof Error ? error.message : 'Google Drive 업로드 중 서버 오류가 발생했습니다.';
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}

