import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

interface Feature {
  No: string;
  Category: string;
  Feature: string;
  Value: string;
}

// CSV 파일에서 피처 목록 가져오기
function getFeaturesFromCSV(): Feature[] {
  const filePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
  try {
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    if (fileContent.charCodeAt(0) === 0xFEFF) {
      fileContent = fileContent.slice(1);
    }
    const lines = fileContent.split('\n').slice(1);
    return lines.map(line => {
      const [No, Category, Feature, Value] = line.split(',').map(s => (s || '').trim().replace(/"/g, ''));
      return { No, Category, Feature, Value };
    }).filter(f => f.Category && f.Feature);
  } catch (error) {
    console.error("CSV 파일 읽기 오류:", error);
    throw new Error("서버에서 'output_features.csv' 파일을 읽을 수 없습니다.");
  }
}

// CSV 형식으로 데이터 변환
function convertToCSV(video: any): string {
  const features = getFeaturesFromCSV();
  const currentDate = new Date().toISOString().split('T')[0];
  
  // CSV 헤더 생성
  const headers = [
    '영상제목',
    '영상링크',
    '분석생성시점',
    ...features.map(f => `${f.Category}_${f.Feature}`)
  ];
  
  // CSV 데이터 행 생성
  const values = [
    `"${video.title}"`,
    `"${video.url}"`,
    `"${currentDate}"`,
    ...features.map(f => {
      const featureKey = `feature_${f.No}`;
      const categoryData = video.analysis[f.Category];
      const value = categoryData ? categoryData[f.Feature] || '분석 불가' : '분석 불가';
      return `"${value}"`;
    })
  ];
  
  return [headers.join(','), values.join(',')].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { video, accessToken } = body;

    if (!video || !video.analysis) {
      return NextResponse.json({ message: '유효하지 않은 영상 데이터입니다.' }, { status: 400 });
    }

    if (!accessToken) {
      // Google OAuth 인증 URL 반환
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/google/callback`
      );

      const scopes = ['https://www.googleapis.com/auth/drive.file'];
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
      });

      return NextResponse.json({ 
        authRequired: true, 
        authUrl: authUrl,
        message: 'Google 계정 인증이 필요합니다.' 
      });
    }

    // Google Drive API 클라이언트 설정
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // CSV 데이터 생성
    const csvContent = convertToCSV(video);
    const fileName = `${video.title}_분석결과_${new Date().toISOString().split('T')[0]}.csv`;

    // 'video' 폴더 찾기 또는 생성
    let videoFolderId = '1qwMIt4_yxM_5yIU7isNTJKp_mrBARlEm'; // 제공된 폴더 ID

    try {
      // 폴더 존재 확인
      await drive.files.get({ fileId: videoFolderId });
    } catch (error) {
      // 폴더가 없으면 새로 생성
      const folderMetadata = {
        name: 'video',
        mimeType: 'application/vnd.google-apps.folder',
      };
      const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id',
      });
      videoFolderId = folder.data.id!;
    }

    // 파일 업로드
    const fileMetadata = {
      name: fileName,
      parents: [videoFolderId],
    };

    const media = {
      mimeType: 'text/csv',
      body: csvContent,
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink',
    });

    return NextResponse.json({
      success: true,
      fileId: file.data.id,
      fileName: file.data.name,
      webViewLink: file.data.webViewLink,
      message: 'Google Drive에 성공적으로 업로드되었습니다.'
    });

  } catch (error: any) {
    console.error("Google Drive 업로드 오류:", error);
    
    if (error.code === 401) {
      return NextResponse.json({ 
        authRequired: true,
        message: '인증이 만료되었습니다. 다시 로그인해주세요.' 
      }, { status: 401 });
    }

    return NextResponse.json({ 
      message: 'Google Drive 업로드 중 오류가 발생했습니다.',
      error: error.message 
    }, { status: 500 });
  }
}
