// src/app/api/drive/upload/route.ts - 완전 수정
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// Google Drive 인증 클라이언트 생성
function createAuthClient() {
  // 환경변수에서 서비스 계정 정보 가져오기
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  let credentials: any;

  if (serviceAccountJson) {
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch (error) {
      console.error('❌ GOOGLE_SERVICE_ACCOUNT_CREDENTIALS JSON 파싱 실패:', error);
      throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS JSON 파싱 실패');
    }
  } else {
    // 개별 환경변수 사용
    credentials = {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    };
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google Drive 서비스 계정 환경변수가 설정되지 않았습니다.');
  }

  console.log(`🔐 Google Drive 인증 설정: ${credentials.client_email}`);

  // JWT 클라이언트 생성
  const jwtClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file'
    ],
  });

  return jwtClient;
}

// Google Drive 클라이언트 생성
async function getDriveClient() {
  try {
    const auth = createAuthClient();
    
    // 인증 수행
    await auth.authorize();
    
    // Drive API v3 클라이언트 생성
    const drive = google.drive({ version: 'v3', auth });
    
    return drive;
  } catch (error) {
    console.error('❌ Google Drive 인증 실패:', error);
    throw error;
  }
}

// 폴더 ID 정리 함수 (여기서 문제 해결!)
function cleanFolderId(folderId: string): string {
  // 폴더 ID에서 불필요한 문자 제거
  let cleaned = folderId.trim();
  
  // 끝에 있는 점(.) 제거 - 이것이 문제의 원인!
  cleaned = cleaned.replace(/\.$/, '');
  
  // URL에서 폴더 ID 추출
  const folderMatch = cleaned.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) {
    cleaned = folderMatch[1];
  }
  
  console.log(`🧹 폴더 ID 정리: ${folderId} → ${cleaned}`);
  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, data, dataType = 'csv' } = body;
    
    // 폴더 ID 가져오기 및 정리
    const RAW_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!RAW_FOLDER_ID) {
      return NextResponse.json(
        { error: 'Google Drive 폴더 ID가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // ⭐ 핵심 수정: 폴더 ID 정리 (끝의 점 제거)
    const FOLDER_ID = cleanFolderId(RAW_FOLDER_ID);
    
    console.log(`📁 사용할 폴더 ID: ${FOLDER_ID}`);

    // Drive 클라이언트 생성
    const drive = await getDriveClient();

    // 데이터 준비
    let fileContent: string;
    let mimeType: string;

    if (dataType === 'csv' && Array.isArray(data)) {
      // CSV 데이터 생성
      const headers = data.length > 0 ? Object.keys(data[0]) : [];
      const csvRows = [headers.join(',')];
      
      data.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          // CSV 이스케이프 처리
          if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value ?? '';
        });
        csvRows.push(values.join(','));
      });
      
      fileContent = csvRows.join('\n');
      mimeType = 'text/csv';
    } else {
      // JSON 데이터
      fileContent = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
    }

    console.log(`📤 업로드 준비: ${fileName} (${mimeType})`);

    // 기존 파일 확인 (수정된 쿼리)
    const listResponse = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name = '${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const existingFiles = listResponse.data.files || [];
    
    if (existingFiles.length > 0) {
      // 기존 파일 업데이트
      const fileId = existingFiles[0].id!;
      
      console.log(`🔄 기존 파일 업데이트: ${fileName} (${fileId})`);
      
      const updateResponse = await drive.files.update({
        fileId: fileId,
        media: {
          mimeType: mimeType,
          body: fileContent,
        },
        fields: 'id, name, webViewLink',
      });

      return NextResponse.json({
        success: true,
        message: '파일이 업데이트되었습니다.',
        file: updateResponse.data,
      });
      
    } else {
      // 새 파일 생성
      console.log(`📄 새 파일 생성: ${fileName}`);
      
      const createResponse = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [FOLDER_ID], // 정리된 폴더 ID 사용
          mimeType: mimeType === 'text/csv' ? 'application/vnd.google-apps.spreadsheet' : mimeType,
        },
        media: {
          mimeType: mimeType,
          body: fileContent,
        },
        fields: 'id, name, webViewLink',
      });

      return NextResponse.json({
        success: true,
        message: '파일이 업로드되었습니다.',
        file: createResponse.data,
      });
    }

  } catch (error: any) {
    console.error('❌ Google Drive 업로드 오류:', error);
    
    let errorMessage = 'Google Drive 업로드 실패';
    
    if (error.message?.includes('File not found')) {
      errorMessage = `폴더를 찾을 수 없습니다. 폴더 ID(${process.env.GOOGLE_DRIVE_FOLDER_ID})를 확인하거나 서비스 계정에 폴더 접근 권한을 부여하세요.`;
    } else if (error.message?.includes('insufficientPermissions')) {
      errorMessage = '권한 부족: 서비스 계정에 폴더 편집 권한을 부여하세요.';
    } else if (error.message?.includes('invalid_grant')) {
      errorMessage = 'Google 서비스 계정 인증 실패: 환경변수를 확인하세요.';
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error.message,
        folderId: process.env.GOOGLE_DRIVE_FOLDER_ID
      },
      { status: 500 }
    );
  }
}

// GET: 파일 목록 조회
export async function GET(req: NextRequest) {
  try {
    const RAW_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!RAW_FOLDER_ID) {
      return NextResponse.json(
        { error: 'Google Drive 폴더 ID가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 폴더 ID 정리
    const FOLDER_ID = cleanFolderId(RAW_FOLDER_ID);

    const drive = await getDriveClient();

    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name, createdTime, modifiedTime, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });

    return NextResponse.json({
      success: true,
      files: response.data.files || [],
    });

  } catch (error: any) {
    console.error('❌ Google Drive 파일 목록 조회 오류:', error);
    return NextResponse.json(
      { 
        error: 'Google Drive 파일 목록 조회 실패',
        details: error.message
      },
      { status: 500 }
    );
  }
}
