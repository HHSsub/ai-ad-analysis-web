import { NextRequest, NextResponse } from 'next/server';
import { saveAnalysisResult } from '@/lib/database';
import { uploadToDrive } from '@/lib/google-drive';

export async function POST(request: NextRequest) {
  try {
    const analysisData = await request.json();
    
    // 분석 결과를 로컬 DB에 저장
    const savedResult = await saveAnalysisResult(analysisData);
    
    // Google Drive에 자동 업로드
    if (savedResult.success) {
      await uploadResultToDrive(savedResult.data);
    }
    
    return NextResponse.json({
      success: true,
      message: '분석 결과 저장 및 Drive 업로드 완료',
      id: savedResult.id
    });
    
  } catch (error) {
    console.error('Analysis receive error:', error);
    return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 });
  }
}

async function uploadResultToDrive(analysisData: any) {
  try {
    const driveUploader = new GoogleDriveUploader({
      clientEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL!,
      privateKey: process.env.GOOGLE_DRIVE_PRIVATE_KEY!.replace(/\\n/g, '\n')
    });
    
    const fileName = `analysis_${analysisData.id}_${new Date().toISOString().split('T')[0]}.json`;
    
    await driveUploader.uploadFile({
      name: fileName,
      content: JSON.stringify(analysisData, null, 2),
      mimeType: 'application/json',
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID
    });
    
    console.log(`Drive upload completed: ${fileName}`);
  } catch (error) {
    console.error('Drive upload failed:', error);
  }
}
