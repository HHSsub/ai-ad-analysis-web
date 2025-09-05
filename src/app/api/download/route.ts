// /src/app/api/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
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
    const { video } = body;

    if (!video || !video.analysis) {
      return NextResponse.json({ message: '유효하지 않은 영상 데이터입니다.' }, { status: 400 });
    }

    const csvContent = convertToCSV(video);
    
    // CSV 파일을 Blob으로 변환하여 다운로드 응답 생성
    const response = new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(video.title)}_분석결과.csv"`,
      },
    });

    return response;

  } catch (error: any) {
    console.error("다운로드 API 오류:", error);
    return NextResponse.json({ message: '다운로드 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
