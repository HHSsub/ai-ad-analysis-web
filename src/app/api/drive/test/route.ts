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
    
    // 연결 테스트 실행
    const testResult = await globalDriveUploader.testConnection();
    
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
      instructions: testResult.success ? null : {
        step1: "Google Cloud Console에서 서비스 계정 생성",
        step2: "Drive API 활성화",
        step3: "서비스 계정 키 다운로드",
        step4: "환경변수 설정 (GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID)",
        step5: `구글 드라이브에서 폴더를 ${serviceAccountEmail}에 공유`
      }
    });
    
  } catch (error: any) {
    console.error('❌ 드라이브 테스트 중 오류:', error.message);
    
    return NextResponse.json({
      success: false,
      message: `테스트 실패: ${error.message}`,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { testUpload } = await req.json();
    
    if (!testUpload) {
      return NextResponse.json({
        success: false,
        message: '테스트 업로드 요청이 필요합니다'
      }, { status: 400 });
    }
    
    console.log('🧪 테스트 업로드 시작');
    
    // 테스트용 더미 분석 결과 생성
    const testAnalysisResult = {
      title: '테스트 영상',
      url: 'https://youtube.com/watch?v=test',
      status: 'completed',
      analysis: {
        '인물 분석': {
          '성별 추정': '남성',
          '연령 추정': '20-30대',
          '표정 감정': '긍정적'
        },
        '종합 분석': {
          '전체 영상 길이': '5분 30초',
          '산업': '테스트',
          '영상 목적 (브랜딩 or 판매 전환)': '테스트 목적'
        }
      },
      completionStats: {
        completed: 5,
        incomplete: 151,
        total: 156,
        percentage: 3
      },
      notes: 'Google Drive 업로드 테스트',
      scriptLanguage: 'ko'
    };
    
    // 테스트 업로드 실행
    const uploadResult = await globalDriveUploader.uploadImmediately(testAnalysisResult);
    
    console.log('🧪 테스트 업로드 결과:', uploadResult);
    
    return NextResponse.json({
      success: uploadResult.success,
      message: uploadResult.success ? 
        '테스트 업로드 성공! Excel 파일이 Google Drive에 업로드되었습니다.' : 
        `테스트 업로드 실패: ${uploadResult.error}`,
      uploadResult,
      testData: {
        fileName: '테스트용 Excel 파일',
        features: '156개 특징 포함',
        categories: Object.keys(testAnalysisResult.analysis).length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('❌ 테스트 업로드 중 오류:', error.message);
    
    return NextResponse.json({
      success: false,
      message: `테스트 업로드 실패: ${error.message}`,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
