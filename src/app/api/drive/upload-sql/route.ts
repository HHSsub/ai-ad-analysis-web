// src/app/api/drive/upload-sql/route.ts
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

  const impersonateUser = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;

  if (!impersonateUser) {
    console.error('❌ GOOGLE_WORKSPACE_ADMIN_EMAIL 환경변수가 설정되지 않았습니다!');
    throw new Error('GOOGLE_WORKSPACE_ADMIN_EMAIL 설정 필요: 조직 공유 폴더 접근을 위해 반드시 필요합니다');
  }

  const authConfig: any = {
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file'
    ],
    subject: impersonateUser
  };

  console.log(`🔐 JWT Impersonation 설정: ${credentials.client_email} → ${impersonateUser}`);

  return new JWT(authConfig);
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
        { 
          success: false,
          error: 'GOOGLE_DRIVE_FOLDER_ID가 설정되지 않았습니다',
          troubleshooting: '.env.local 파일에 GOOGLE_DRIVE_FOLDER_ID를 추가하세요'
        },
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
      fileContent = db.exportToCSV();
      mimeType = 'text/csv';
    } else {
      const videos = db.getAllCompletedVideos();
      fileContent = JSON.stringify(videos, null, 2);
      mimeType = 'application/json';
    }

    const listResponse = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name = '${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const existingFiles = listResponse.data.files || [];

    const buffer = Buffer.from(fileContent, 'utf-8');
    const stream = Readable.from(buffer);

    let fileId: string;

    if (existingFiles.length > 0) {
      fileId = existingFiles[0].id!;

      await drive.files.update({
        fileId: fileId,
        media: {
          mimeType: mimeType,
          body: stream
        },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true
      });

      console.log(`🔄 기존 파일 업데이트: ${fileName}`);
    } else {
      const createResponse = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [FOLDER_ID],
          mimeType: mimeType
        },
        media: {
          mimeType: mimeType,
          body: stream
        },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true
      });

      fileId = createResponse.data.id!;
      console.log(`📄 새 파일 생성: ${fileName}`);
    }

    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      },
      supportsAllDrives: true
    });

    const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;

    return NextResponse.json({
      success: true,
      message: `${format.toUpperCase()} 업로드 완료`,
      file: {
        id: fileId,
        name: fileName,
        url: fileUrl
      },
      stats: {
        total: stats.total,
        completed: stats.completed,
        pending: stats.pending,
        failed: stats.failed
      }
    });

  } catch (error: any) {
    console.error('❌ Drive 업로드 실패:', error);

    let errorMessage = 'Drive 업로드 실패';
    let troubleshooting: string[] = [];

    if (error.message?.includes('File not found') || error.code === 404) {
      errorMessage = '폴더를 찾을 수 없습니다';
      troubleshooting = [
        '1. GOOGLE_DRIVE_FOLDER_ID가 올바른지 확인',
        '2. GOOGLE_WORKSPACE_ADMIN_EMAIL 계정이 해당 폴더에 접근 권한이 있는지 확인',
        '3. 공유 드라이브(Shared Drive)의 경우 서비스 계정에 직접 권한을 부여해야 할 수 있음'
      ];
    } else if (error.message?.includes('unauthorized_client') || error.message?.includes('access_denied')) {
      errorMessage = 'Domain-Wide Delegation 설정이 필요합니다';
      troubleshooting = [
        '1. Google Cloud Console > IAM 및 관리자 > 서비스 계정 접속',
        '2. 서비스 계정 선택 > "Domain-Wide Delegation 사용 설정" 체크',
        '3. Google Workspace Admin Console > 보안 > API 제어 > 도메인 전체 위임 관리',
        '4. 클라이언트 ID 추가 및 OAuth 범위 설정:',
        '   - https://www.googleapis.com/auth/drive',
        '   - https://www.googleapis.com/auth/drive.file',
        '5. GOOGLE_WORKSPACE_ADMIN_EMAIL이 올바른 관리자 이메일인지 확인'
      ];
    } else if (error.message?.includes('insufficient permissions') || error.code === 403) {
      errorMessage = '권한이 부족합니다';
      troubleshooting = [
        '1. 서비스 계정에 Google Drive API 권한 부여 확인',
        '2. GOOGLE_WORKSPACE_ADMIN_EMAIL 계정이 해당 폴더의 편집 권한 보유 확인',
        '3. 공유 드라이브의 경우: 폴더 공유 설정에서 contact@upnexx.ai 추가'
      ];
    } else if (error.message?.includes('GOOGLE_WORKSPACE_ADMIN_EMAIL')) {
      errorMessage = error.message;
      troubleshooting = [
        '1. .env.local 파일에 GOOGLE_WORKSPACE_ADMIN_EMAIL 추가',
        '2. 값 예시: GOOGLE_WORKSPACE_ADMIN_EMAIL=admin@yourcompany.com',
        '3. 조직 공유 폴더 접근을 위해 반드시 필요합니다'
      ];
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: error.message,
        troubleshooting: troubleshooting.length > 0 ? troubleshooting : undefined,
        docs: 'https://developers.google.com/workspace/guides/create-credentials#service-account'
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const db = getGlobalDB();
    const stats = db.getStatistics();

    const drive = await getDriveClient();
    const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

    let driveAccessible = false;
    let driveMessage = '';

    try {
      const response = await drive.files.get({
        fileId: FOLDER_ID,
        fields: 'id, name',
        supportsAllDrives: true
      });
      driveAccessible = true;
      driveMessage = `연결 성공: ${response.data.name}`;
    } catch (error: any) {
      driveMessage = `연결 실패: ${error.message}`;
    }

    return NextResponse.json({
      drive_accessible: driveAccessible,
      drive_message: driveMessage,
      database_stats: {
        total: stats.total,
        pending: stats.pending,
        completed: stats.completed,
        failed: stats.failed,
        latest_analysis: stats.total > 0 ? new Date().toISOString() : null
      },
      ready_for_upload: driveAccessible && stats.completed > 0,
      message: driveAccessible
        ? 'Google Drive 접근 가능'
        : 'Google Drive 접근 불가 - 설정 확인 필요',
      configuration: {
        impersonate_user: process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL || 'NOT SET',
        folder_id: FOLDER_ID || 'NOT SET',
        service_account: process.env.GOOGLE_DRIVE_CLIENT_EMAIL || 'NOT SET'
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      troubleshooting: [
        '1. GOOGLE_WORKSPACE_ADMIN_EMAIL 환경변수 설정 확인',
        '2. Domain-Wide Delegation 설정 확인',
        '3. 서비스 계정 JSON 키 파일 올바른지 확인'
      ]
    }, { status: 500 });
  }
}
