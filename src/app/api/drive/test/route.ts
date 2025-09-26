// src/app/api/drive/test/route.ts (기존 파일 완전 교체)
import { NextRequest, NextResponse } from 'next/server';
import { globalDriveUploader } from '@/lib/google-drive';

export async function GET(req: NextRequest) {
  try {
    console.log('🧪 구글 드라이브 연결 테스트 시작');
    
    // 환경변수 확인
    const envCheck = {
      GOOGLE_DRIVE_CLIENT_EMAIL: !!process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      GOOGLE_DRIVE_PRIVATE_KEY: !!process.env.GOOGLE_DRIVE_PRIVATE_KEY,
      GOOGLE_DRIVE_FOLDER_ID: !!process.env.GOOGLE_DRIVE_FOLDER_ID,
      GOOGLE_SERVICE_ACCOUNT_CREDENTIALS: !!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS
    };
    
    console.log('📋 환경변수 확인:', envCheck);
    
    // 서비스 계정 이메일 정보
    const serviceAccountEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL || 
      (process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS ? 
        JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS).client_email : 
        'Not configured');
    
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    console.log(`📁 타겟 폴더 ID: ${folderId}`);
    console.log(`🔐 서비스 계정: ${serviceAccountEmail}`);
    
    // 연결 테스트 실행
    const testResult = await globalDriveUploader.uploader.testConnection();
    
    console.log('🧪 테스트 결과:', testResult);
    
    return NextResponse.json({
      success: testResult.success,
      message: testResult.message,
      environment: {
        serviceAccountEmail,
        folderId,
        environmentVariables: envCheck
      },
      timestamp: new Date().toISOString(),
      instructions: testResult.success ?
        '✅ 드라이브 연결 성공! 분석을 시작할 수 있습니다.' :
        '❌ 드라이브 연결 실패. 환경변수와 폴더 권한을 확인해주세요.'
    });
    
  } catch (error: any) {
    console.error('❌ 드라이브 테스트 실패:', error.message);
    
    return NextResponse.json({
      success: false,
      message: error.message || '드라이브 테스트 중 오류 발생',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
