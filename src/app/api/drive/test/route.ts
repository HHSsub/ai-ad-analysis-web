// src/app/api/drive/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

function cleanFolderId(folderId: string): string {
  let cleaned = folderId.trim();
  cleaned = cleaned.replace(/\.$/, '');
  const folderMatch = cleaned.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) {
    cleaned = folderMatch[1];
  }
  return cleaned;
}

function createAuthClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  let credentials: any;

  if (serviceAccountJson) {
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch (error) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS JSON 파싱 실패');
    }
  } else {
    credentials = {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    };
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google Drive 서비스 계정 환경변수가 설정되지 않았습니다');
  }

  const impersonateUser = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
  
  const authConfig: any = {
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file'
    ],
  };

  if (impersonateUser) {
    authConfig.subject = impersonateUser;
    console.log(`🔐 Impersonate: ${impersonateUser}`);
  } else {
    console.warn('⚠️ GOOGLE_WORKSPACE_ADMIN_EMAIL 미설정');
  }

  return new JWT(authConfig);
}

export async function GET(req: NextRequest) {
  try {
    console.log('🧪 Google Drive 연결 테스트 시작...');

    const RAW_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const IMPERSONATE_USER = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
    
    if (!RAW_FOLDER_ID) {
      return NextResponse.json({
        success: false,
        message: 'GOOGLE_DRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다.',
        errorType: 'missing_folder_id'
      }, { status: 500 });
    }

    if (!CLIENT_EMAIL) {
      return NextResponse.json({
        success: false,
        message: 'GOOGLE_DRIVE_CLIENT_EMAIL 환경변수가 설정되지 않았습니다.',
        errorType: 'missing_credentials'
      }, { status: 500 });
    }

    const FOLDER_ID = cleanFolderId(RAW_FOLDER_ID);
    
    console.log(`📁 원본 폴더 ID: ${RAW_FOLDER_ID}`);
    console.log(`📁 정리된 폴더 ID: ${FOLDER_ID}`);
    console.log(`🔐 서비스 계정: ${CLIENT_EMAIL}`);
    console.log(`👤 Impersonate: ${IMPERSONATE_USER || '미설정'}`);

    const auth = createAuthClient();
    await auth.authorize();
    
    console.log('✅ Google Drive 인증 성공');

    const drive = google.drive({ version: 'v3', auth });

    try {
      const folderResponse = await drive.files.get({
        fileId: FOLDER_ID,
        fields: 'id, name, permissions, driveId',
        supportsAllDrives: true
      });
      
      console.log(`✅ 폴더 접근 성공: ${folderResponse.data.name}`);
      
      if (folderResponse.data.driveId) {
        console.log(`📁 공유 드라이브 ID: ${folderResponse.data.driveId}`);
      }
      
    } catch (folderError: any) {
      console.error('❌ 폴더 접근 실패:', folderError.message);
      
      if (folderError.message?.includes('File not found')) {
        return NextResponse.json({
          success: false,
          message: `폴더를 찾을 수 없습니다. ${IMPERSONATE_USER ? `${IMPERSONATE_USER}가 폴더 접근 권한이 있는지 확인하세요.` : 'GOOGLE_WORKSPACE_ADMIN_EMAIL을 설정하세요.'}`,
          errorType: 'folder_not_found',
          details: {
            originalFolderId: RAW_FOLDER_ID,
            cleanedFolderId: FOLDER_ID,
            serviceAccount: CLIENT_EMAIL,
            impersonateUser: IMPERSONATE_USER || '미설정'
          }
        }, { status: 404 });
      }
      
      throw folderError;
    }

    const listResponse = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name, createdTime)',
      pageSize: 5,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const fileCount = listResponse.data.files?.length || 0;
    console.log(`📂 폴더 내 파일 수: ${fileCount}개`);

    const testFileName = `drive_test_${Date.now()}.txt`;
    const testContent = `Google Drive 연결 테스트\n생성 시간: ${new Date().toISOString()}\n서비스 계정: ${CLIENT_EMAIL}\nImpersonate: ${IMPERSONATE_USER}`;

    const createResponse = await drive.files.create({
      requestBody: {
        name: testFileName,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: 'text/plain',
        body: testContent,
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true
    });

    console.log(`✅ 테스트 파일 생성 성공: ${testFileName}`);

    await drive.files.delete({
      fileId: createResponse.data.id!,
      supportsAllDrives: true
    });

    console.log(`🗑️ 테스트 파일 삭제 완료`);

    return NextResponse.json({
      success: true,
      message: 'Google Drive 연결 테스트 성공! 모든 권한이 정상적으로 작동합니다.',
      details: {
        originalFolderId: RAW_FOLDER_ID,
        cleanedFolderId: FOLDER_ID,
        serviceAccount: CLIENT_EMAIL,
        impersonateUser: IMPERSONATE_USER,
        folderFileCount: fileCount,
        testFileName: testFileName,
        canCreate: true,
        canDelete: true
      }
    });

  } catch (error: any) {
    console.error('❌ Google Drive 테스트 실패:', error);
    
    let errorMessage = 'Google Drive 연결 테스트 실패';
    let errorType = 'unknown_error';
    
    if (error.message?.includes('invalid_grant')) {
      errorMessage = 'Google 서비스 계정 인증 실패: private_key나 client_email을 확인하세요.';
      errorType = 'auth_failed';
    } else if (error.message?.includes('unauthorized_client')) {
      errorMessage = 'Domain-Wide Delegation 설정이 필요합니다. Google Admin Console에서 Client ID와 Scope를 확인하세요.';
      errorType = 'delegation_not_configured';
    } else if (error.message?.includes('File not found')) {
      errorMessage = `폴더를 찾을 수 없습니다. 폴더 ID(${process.env.GOOGLE_DRIVE_FOLDER_ID})를 확인하거나 ${process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL}가 폴더 접근 권한이 있는지 확인하세요.`;
      errorType = 'folder_not_found';
    } else if (error.message?.includes('insufficientPermissions')) {
      errorMessage = '권한 부족: 서비스 계정에 폴더 편집 권한을 부여하세요.';
      errorType = 'insufficient_permissions';
    } else if (error.message?.includes('storageQuotaExceeded')) {
      errorMessage = 'Google Drive 저장 용량이 가득 찼습니다.';
      errorType = 'storage_full';
    } else {
      errorMessage = error.message || '드라이브 연결 실패';
    }
    
    return NextResponse.json({
      success: false,
      message: errorMessage,
      errorType: errorType,
      errorDetails: error.message,
      environment: {
        folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
        serviceAccount: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        impersonateUser: process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL,
        hasCredentials: !!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS
      }
    }, { status: 500 });
  }
}
