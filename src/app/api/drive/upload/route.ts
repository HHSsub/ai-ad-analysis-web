import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// Google Drive 인증 클라이언트 생성
function createAuthClient() {
  const CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

  if (!CLIENT_EMAIL || !PRIVATE_KEY) {
    throw new Error('Google Drive 서비스 계정 환경변수가 설정되지 않았습니다.');
  }

  // JWT 클라이언트 직접 생성
  const jwtClient = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY.replace(/\\n/g, '\n'),
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
    console.error('Google Drive 인증 실패:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, data, dataType = 'csv' } = body;
    
    const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!FOLDER_ID) {
      return NextResponse.json(
        { error: 'Google Drive 폴더 ID가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // Drive 클라이언트 생성
    const drive = await getDriveClient();

    // CSV 데이터 준비
    let fileContent: string;
    let mimeType: string;

    if (dataType === 'csv' && Array.isArray(data)) {
      // CSV 헤더
      const headers = data.length > 0 ? Object.keys(data[0]) : [];
      const csvRows = [headers.join(',')];
      
      // CSV 데이터 행
      data.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          // 쉼표나 줄바꿈 포함시 따옴표 처리
          if (typeof value === 'string' && (value.includes(',') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value ?? '';
        });
        csvRows.push(values.join(','));
      });
      
      fileContent = csvRows.join('\n');
      mimeType = 'text/csv';
    } else {
      fileContent = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
    }

    // 기존 파일 확인
    const listResponse = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name = '${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const existingFiles = listResponse.data.files || [];
    
    if (existingFiles.length > 0) {
      // 기존 파일 업데이트
      const fileId = existingFiles[0].id!;
      
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
      const createResponse = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [FOLDER_ID],
          mimeType: 'application/vnd.google-apps.spreadsheet', // Google Sheets로 변환
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

  } catch (error) {
    console.error('Google Drive 업로드 오류:', error);
    return NextResponse.json(
      { 
        error: 'Google Drive 업로드 실패',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      },
      { status: 500 }
    );
  }
}

// GET: 파일 목록 조회
export async function GET(req: NextRequest) {
  try {
    const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!FOLDER_ID) {
      return NextResponse.json(
        { error: 'Google Drive 폴더 ID가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

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

  } catch (error) {
    console.error('Google Drive 파일 목록 조회 오류:', error);
    return NextResponse.json(
      { 
        error: 'Google Drive 파일 목록 조회 실패',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      },
      { status: 500 }
    );
  }
}
