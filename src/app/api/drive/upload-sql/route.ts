// src/app/api/drive/upload-sql/route.ts - 신규 생성
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { getGlobalDB } from '@/lib/sql-database';
import { Readable } from 'stream';

function createAuthClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  let credentials: any;

  if (serviceAccountJson) {
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS JSON 파싱 실패');
    }
  } else {
    credentials = {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    };
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google Drive 서비스 계정 정보가 없습니다');
  }

  return new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file'
    ],
  });
}

async function getDriveClient() {
  const auth = createAuthClient();
  await auth.authorize();
  return google.drive({ version: 'v3', auth });
}

export async function POST(req: NextRequest) {
  try {
    const { format = 'csv' } = await req.json();

    const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!FOLDER_ID) {
      return NextResponse.json(
        { error: 'GOOGLE_DRIVE_FOLDER_ID가 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    const db = getGlobalDB();
    const stats = db.getStatistics();

    if (stats.completed === 0) {
      return NextResponse.json({
        success: false,
        message: '업로드할 완료된 분석 결과가 없습니다',
        stats
      });
    }

    const drive = await getDriveClient();
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `youtube_analysis_${timestamp}.${format}`;

    let fileContent: string;
    let mimeType: string;

    if (format === 'csv') {
      // CSV 내보내기 (156개 특성 포함)
      fileContent = db.exportToCSV();
      mimeType = 'text/csv';
    } else {
      // JSON 내보내기
      const videos = db.getAllCompletedVideos();
      fileContent = JSON.stringify(videos, null, 2);
      mimeType = 'application/json';
    }

    // 기존 파일 확인
    const listResponse = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name = '${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const existingFiles = listResponse.data.files || [];
    
    const buffer = Buffer.from(fileContent, 'utf-8');
    const stream = Readable.from(buffer);

    let fileId: string;

    if (existingFiles.length > 0) {
      // 기존 파일 업데이트
      fileId = existingFiles[0].id!;
      await drive.files.update({
        fileId,
        media: {
          mimeType,
          body: stream,
        },
      });
      console.log(`✅ 기존 파일 업데이트: ${fileName}`);
    } else {
      // 신규 파일 생성
      const response = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [FOLDER_ID],
          mimeType,
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: 'id, name, webViewLink',
      });
      fileId = response.data.id!;
      console.log(`✅ 신규 파일 생성: ${fileName}`);
    }

    const fileInfo = await drive.files.get({
      fileId,
      fields: 'id, name, webViewLink, modifiedTime, size',
    });

    return NextResponse.json({
      success: true,
      message: `Google Drive 업로드 완료`,
      file: {
        id: fileInfo.data.id,
        name: fileInfo.data.name,
        url: fileInfo.data.webViewLink,
        modifiedTime: fileInfo.data.modifiedTime,
        size: fileInfo.data.size
      },
      stats
    });

  } catch (error: any) {
    console.error('❌ Drive 업로드 실패:', error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
