import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  console.log('🧪 구글 드라이브 연결 테스트 시작');
  
  try {
    // 환경변수 확인
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    console.log('📋 환경변수 확인:', {
      GOOGLE_DRIVE_CLIENT_EMAIL: !!clientEmail,
      GOOGLE_DRIVE_PRIVATE_KEY: !!privateKey,
      GOOGLE_DRIVE_FOLDER_ID: !!folderId,
    });
    
    if (!clientEmail || !privateKey || !folderId) {
      return NextResponse.json({
        success: false,
        message: '환경변수가 설정되지 않았습니다.',
        missing: {
          clientEmail: !clientEmail,
          privateKey: !privateKey,
          folderId: !folderId
        }
      });
    }
    
    // 인증 설정
    const auth = new google.auth.JWT(
      clientEmail,
      undefined,
      privateKey,
      ['https://www.googleapis.com/auth/drive.file']
    );
    
    const drive = google.drive({ version: 'v3', auth });
    
    // 폴더 접근 테스트 - 파일 목록 가져오기
    console.log(`🔍 폴더 접근 테스트: ${folderId}`);
    
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, createdTime)',
      pageSize: 5
    });
    
    console.log(`✅ 폴더 접근 성공! 파일 ${response.data.files?.length || 0}개 발견`);
    
    // 테스트 파일 업로드
    const testContent = `테스트 시간: ${new Date().toISOString()}\n환경: ${process.env.NODE_ENV}`;
    const testFileName = `test_${Date.now()}.txt`;
    
    const fileMetadata = {
      name: testFileName,
      parents: [folderId]
    };
    
    const media = {
      mimeType: 'text/plain',
      body: testContent
    };
    
    const uploadResult = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });
    
    console.log(`✅ 테스트 파일 업로드 성공: ${uploadResult.data.name}`);
    
    // 업로드한 파일 즉시 삭제 (테스트 정리)
    if (uploadResult.data.id) {
      await drive.files.delete({
        fileId: uploadResult.data.id
      });
      console.log('🧹 테스트 파일 삭제 완료');
    }
    
    return NextResponse.json({
      success: true,
      message: '드라이브 연결 및 쓰기 권한 확인 완료',
      folderId: folderId,
      filesInFolder: response.data.files?.length || 0,
      testUpload: {
        success: true,
        fileName: testFileName,
        cleaned: true
      }
    });
    
  } catch (error: any) {
    console.error('❌ 드라이브 연결 테스트 실패:', error);
    
    // 에러 타입 분석
    let errorMessage = '알 수 없는 오류';
    let errorType = 'unknown';
    
    if (error.message?.includes('invalid_grant')) {
      errorMessage = '인증 실패: Private Key가 잘못되었거나 서비스 계정이 비활성화되었습니다.';
      errorType = 'auth_failed';
    } else if (error.message?.includes('File not found')) {
      errorMessage = `폴더를 찾을 수 없습니다. 폴더 ID(${process.env.GOOGLE_DRIVE_FOLDER_ID})를 확인하거나 서비스 계정(${process.env.GOOGLE_DRIVE_CLIENT_EMAIL})에 폴더 접근 권한을 부여하세요.`;
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
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
      serviceAccount: process.env.GOOGLE_DRIVE_CLIENT_EMAIL
    }, { status: 500 });
  }
}
